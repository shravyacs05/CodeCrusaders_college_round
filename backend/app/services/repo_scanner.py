"""Repo scanner: parse configs, constants, constructor kwargs, seeds, and argparse."""
import ast
import json
import shutil
from pathlib import Path
from typing import Any

import yaml

from .reconciler import normalize_name, values_equal
from .leakage_detector import scan_repo_leakage

CONFIG_FLAGS = {"config", "cfg", "conf", "config_file", "config_path", "configuration"}
OUTPUT_FLAGS = {"out", "output", "metrics_path", "metrics_file", "metrics"}
HYPERPARAMS = {
    "n_estimators", "max_depth", "test_size", "seed", "learning_rate",
    "batch_size", "epochs", "optimizer", "weight_decay", "momentum",
    "val_size", "shuffle", "stratify", "kernel", "max_iter", "n_splits",
}
STRING_PARAMS = {"optimizer", "kernel"}
BOOL_PARAMS = {"shuffle", "stratify"}

PRIORITY = {
    "argparse": 50,
    "constructor": 40,
    "constant": 30,
    "config": 20,
    "seed_call": 10,
}


def norm(name: str) -> str:
    """Normalize a parameter name with the same function the reconciler/spec builder use."""
    return normalize_name(name)


def get_repo(repo_url: str, dest: Path) -> tuple[Path, str]:
    """Clone a git URL (shallow) or copy a local directory. Returns (path, commit)."""
    if dest.exists():
        shutil.rmtree(dest)
    if Path(repo_url).exists():
        shutil.copytree(repo_url, dest)
        return dest, "local-copy"
    from git import Repo

    repo = Repo.clone_from(repo_url, dest, depth=1)
    return dest, repo.head.commit.hexsha


def _is_scalar(v: Any) -> bool:
    return isinstance(v, (int, float, str, bool)) and v is not None


def _accept(name: str, v: Any) -> bool:
    """Is `v` a plausible value for hyperparameter `name`? Filters e.g. learning_rate='constant'
    (a scikit-learn schedule name, not a rate)."""
    if not _is_scalar(v):
        return False
    if name in STRING_PARAMS:
        return isinstance(v, str)
    if name in BOOL_PARAMS:
        return isinstance(v, bool)
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _lit(node: ast.AST) -> Any:
    """Extract literal scalar value from an AST node."""
    try:
        return ast.literal_eval(node)
    except Exception:
        pass
    if isinstance(node, ast.Constant):
        return node.value
    if (isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub)
            and isinstance(node.operand, ast.Constant)):
        return -node.operand.value
    return None


def scan_argparse(tree: ast.AST, rel: str) -> tuple[list[dict[str, Any]], str | None, list[str]]:
    """Find argparse add_argument calls."""
    candidates = []
    out_flag = None
    tunable_flags = []

    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "add_argument" and node.args):
            flags = [_lit(a) for a in node.args if isinstance(_lit(a), str) and _lit(a).startswith("-")]
            if not flags:
                continue
            flag = max(flags, key=len)
            raw = flag.lstrip("-")
            prefix = "--" if flag.startswith("--") else "-"
            n = norm(raw)
            if raw in OUTPUT_FLAGS or n in OUTPUT_FLAGS:
                out_flag = (prefix, raw)
                continue
            if raw in CONFIG_FLAGS or n in CONFIG_FLAGS:
                continue

            tunable_flags.append((prefix, raw))
            default = next((_lit(k.value) for k in node.keywords if k.arg == "default"), None)
            if default is not None and _accept(n, default):
                candidates.append({
                    "kind": "argparse",
                    "name": n,
                    "value": default,
                    "file": rel,
                    "line": node.lineno,
                    "flag": raw,
                    "prefix": prefix,
                    "injectable": True,
                })
    return candidates, out_flag, tunable_flags


def scan_constructors(tree: ast.AST, rel: str) -> list[dict[str, Any]]:
    """Find constructor / function keyword arguments matching hyperparameters."""
    candidates = []
    hyper_norm = {norm(h) for h in HYPERPARAMS}

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            for kw in node.keywords:
                if kw.arg:
                    n = norm(kw.arg)
                    val = _lit(kw.value)
                    if n in hyper_norm and _accept(n, val):
                        candidates.append({
                            "kind": "constructor",
                            "name": n,
                            "value": val,
                            "file": rel,
                            "line": node.lineno,
                            "injectable": False,
                        })
    return candidates


def scan_constants(tree: ast.AST, rel: str) -> list[dict[str, Any]]:
    """Find module-level constant assignments."""
    candidates = []
    hyper_norm = {norm(h) for h in HYPERPARAMS}

    for stmt in getattr(tree, "body", []):
        if isinstance(stmt, ast.Assign):
            for target in stmt.targets:
                if isinstance(target, ast.Name):
                    n = norm(target.id)
                    val = _lit(stmt.value)
                    if n in hyper_norm and _accept(n, val):
                        candidates.append({
                            "kind": "constant",
                            "name": n,
                            "value": val,
                            "file": rel,
                            "line": stmt.lineno,
                            "injectable": False,
                        })
    return candidates


def scan_seed_calls(tree: ast.AST, rel: str) -> list[dict[str, Any]]:
    """Find seed setting calls like np.random.seed(...) or random.seed(...)."""
    candidates = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            is_seed = False
            if (isinstance(node.func, ast.Attribute)
                    and node.func.attr in {"seed", "manual_seed", "set_seed"}):
                is_seed = True
            elif isinstance(node.func, ast.Name) and node.func.id in {"seed", "manual_seed", "set_seed"}:
                is_seed = True

            if is_seed and node.args:
                val = _lit(node.args[0])
                if _accept("seed", val):
                    candidates.append({
                        "kind": "seed_call",
                        "name": "seed",
                        "value": val,
                        "file": rel,
                        "line": node.lineno,
                        "injectable": False,
                    })
    return candidates


def scan_configs(repo_path: Path) -> list[dict[str, Any]]:
    """Scan YAML and JSON config files in repo."""
    candidates = []
    hyper_norm = {norm(h) for h in HYPERPARAMS}

    config_files = list(repo_path.glob("*.yaml")) + list(repo_path.glob("*.yml")) + list(repo_path.glob("*.json"))
    for cf in config_files:
        rel = cf.relative_to(repo_path).name
        if rel in {"package.json", "package-lock.json", "tsconfig.json", "project.json"} or rel.startswith("metrics"):
            continue
        try:
            content = cf.read_text()
            data = yaml.safe_load(content) if cf.suffix in {".yaml", ".yml"} else json.loads(content)
        except Exception:
            continue

        if isinstance(data, dict):
            def walk(d: dict):
                for k, v in d.items():
                    if isinstance(v, dict):
                        walk(v)
                    else:
                        leaf = str(k)
                        n = norm(leaf)
                        if n in hyper_norm and _accept(n, v):
                            candidates.append({
                                "kind": "config",
                                "name": n,
                                "value": v,
                                "file": rel,
                                "line": 1,
                                "injectable": False,
                            })
            walk(data)
    return candidates


def find_entrypoint(repo_path: Path) -> Path | None:
    """Find the training or experiment execution entrypoint script."""
    patterns = ["train*.py", "main*.py", "run*.py", "experiment*.py", "eval*.py"]
    # 1. Top-level matching
    for pat in patterns:
        m = sorted(repo_path.glob(pat))
        if m:
            return m[0]
    # 2. Common subdirectories (bin/, scripts/, src/, example/, etc.)
    for sub in ["bin", "scripts", "src", "example", "examples", "experiments", "benchmark", "benchmarks"]:
        subdir = repo_path / sub
        if subdir.exists() and subdir.is_dir():
            for pat in patterns:
                m = sorted(subdir.glob(pat))
                if m:
                    return m[0]
            py_files = sorted(f for f in subdir.glob("*.py") if not f.name.startswith("__"))
            if py_files:
                return py_files[0]
    # 3. Recursive search (excluding hidden dirs, venvs, tests)
    for pat in patterns:
        candidates = []
        for f in repo_path.rglob(pat):
            try:
                rel_parts = f.relative_to(repo_path).parts
            except ValueError:
                rel_parts = f.parts
            if not any(part.startswith(".") or part in ("venv", "tests", "test", "site-packages", "node_modules") for part in rel_parts):
                candidates.append(f)
        if candidates:
            return sorted(candidates)[0]
    return None


def scan_repo(repo_path: Path) -> dict[str, Any]:
    """Return params, entrypoint, run template, warnings, or a BLOCKED reason."""
    entry = find_entrypoint(repo_path)
    if not entry:
        return {"params": {}, "entrypoint": None, "run_template": None,
                "blocked": "No executable training entrypoint (e.g. train.py, main.py, run.py) found", "warnings": []}
    rel_entry = entry.relative_to(repo_path).as_posix()

    all_candidates: list[dict[str, Any]] = []
    out_flag: str | None = None
    tunable_flags: list[str] = []

    # 1. Scan entrypoint file for argparse, constructors, constants, seeds
    try:
        tree = ast.parse(entry.read_text())
        ap_cands, out_flag, tunable_flags = scan_argparse(tree, rel_entry)
        all_candidates.extend(ap_cands)
        all_candidates.extend(scan_constructors(tree, rel_entry))
        all_candidates.extend(scan_constants(tree, rel_entry))
        all_candidates.extend(scan_seed_calls(tree, rel_entry))
    except Exception:
        pass

    # Also scan any other top-level python files for constants/constructors/seeds
    for py_file in repo_path.glob("*.py"):
        if py_file.name == entry.name:
            continue
        try:
            py_tree = ast.parse(py_file.read_text())
            all_candidates.extend(scan_constructors(py_tree, py_file.name))
            all_candidates.extend(scan_constants(py_tree, py_file.name))
            all_candidates.extend(scan_seed_calls(py_tree, py_file.name))
        except Exception:
            pass

    # 2. Scan config files
    all_candidates.extend(scan_configs(repo_path))

    # 3. Group and resolve by priority
    by_param: dict[str, list[dict[str, Any]]] = {}
    for c in all_candidates:
        by_param.setdefault(c["name"], []).append(c)

    params: dict[str, Any] = {}
    warnings: list[str] = []

    for name, cands in by_param.items():
        cands.sort(key=lambda c: PRIORITY.get(c["kind"], 0), reverse=True)
        chosen = dict(cands[0])
        # Find conflicts
        alts = []
        for c in cands[1:]:
            if not values_equal(c["value"], chosen["value"]):
                if not any(values_equal(a["value"], c["value"]) for a in alts):
                    alts.append(c)
        if alts:
            chosen["alternatives"] = [{"value": a["value"], "file": a["file"], "line": a["line"], "kind": a["kind"]} for a in alts]
            alt_strs = [
                f"{repr(a['value'])} ({a['file']}:{a['line']})" if isinstance(a['value'], str)
                else f"{a['value']} ({a['file']}:{a['line']})"
                for a in alts
            ]
            chosen_val_str = repr(chosen["value"]) if isinstance(chosen["value"], str) else str(chosen["value"])
            warnings.append(
                f"'{name}' has conflicting values in code: using {chosen['kind']} value {chosen_val_str} "
                f"({chosen['file']}:{chosen['line']}); others: {', '.join(alt_strs)}"
            )
        params[name] = chosen

    # Check for seed flag warning
    if "seed" not in params or not params["seed"].get("injectable"):
        warnings.append("No --seed argparse flag: all seeds will run identically, so seed variance cannot be measured.")

    # 4. Detect data leakage
    leakage = scan_repo_leakage(repo_path)
    for lk in leakage:
        warnings.append(lk["message"])

    # 5. Build run template
    tunable_seen = set()
    template_parts = [f"python {rel_entry}"]
    for item in tunable_flags:
        if isinstance(item, tuple):
            prefix, raw = item
        else:
            prefix, raw = "--", item
        n = norm(raw)
        if n in tunable_seen:
            continue
        tunable_seen.add(n)
        template_parts.append(f"{prefix}{raw} {{{n}}}")

    if out_flag:
        if isinstance(out_flag, tuple):
            template_parts.append(f"{out_flag[0]}{out_flag[1]} {{out}}")
        else:
            template_parts.append(f"--{out_flag} {{out}}")
    else:
        template_parts.append("--out {out}")

    template = " ".join(template_parts)

    return {
        "params": params,
        "entrypoint": rel_entry,
        "run_template": template,
        "blocked": None,
        "warnings": warnings,
    }
