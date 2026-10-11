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


def _rmtree(path: Path):
    import os, stat
    def _onerror(func, p, exc_info=None):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception:
            pass
    try:
        shutil.rmtree(path, onexc=lambda fn, p, err: _onerror(fn, p, err))
    except (TypeError, AttributeError):
        shutil.rmtree(path, onerror=_onerror)
    except Exception:
        pass


def get_repo(repo_url: str, dest: Path) -> tuple[Path, str]:
    """Clone a git URL (shallow) or copy a local directory. Returns (path, commit)."""
    clean_url = repo_url.strip()
    if clean_url.startswith(("github.com/", "gitlab.com/")):
        clean_url = "https://" + clean_url
    if Path(clean_url).exists():
        if dest.exists():
            _rmtree(dest)
        shutil.copytree(clean_url, dest)
        return dest, "local-copy"

    from git import Repo

    # If repo already exists and is non-empty, get its commit or refresh
    if dest.exists() and any(dest.iterdir()):
        try:
            if (dest / ".git").exists():
                r = Repo(dest)
                return dest, r.head.commit.hexsha
            return dest, "cached-repo"
        except Exception:
            _rmtree(dest)

    if dest.exists():
        _rmtree(dest)

    repo = Repo.clone_from(clean_url, dest, depth=1)
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


def scan_notebooks(repo_path: Path) -> list[dict[str, Any]]:
    """Scan Jupyter notebooks (*.ipynb) code cells for constructors, constants, and seeds."""
    candidates: list[dict[str, Any]] = []
    for nb_path in repo_path.rglob("*.ipynb"):
        try:
            rel = nb_path.relative_to(repo_path).as_posix()
        except ValueError:
            rel = nb_path.name
        if any(part.startswith(".") or part in ("venv", "node_modules", ".ipynb_checkpoints") for part in Path(rel).parts):
            continue
        try:
            data = json.loads(nb_path.read_text(encoding="utf-8"))
            cells = data.get("cells", [])
            for idx, cell in enumerate(cells):
                if cell.get("cell_type") == "code":
                    source = "".join(cell.get("source", []))
                    if not source.strip():
                        continue
                    clean_lines = [l for l in source.splitlines() if not l.strip().startswith(("%", "!"))]
                    try:
                        tree = ast.parse("\n".join(clean_lines))
                        c_ref = f"{rel}:cell_{idx + 1}"
                        candidates.extend(scan_constructors(tree, c_ref))
                        candidates.extend(scan_constants(tree, c_ref))
                        candidates.extend(scan_seed_calls(tree, c_ref))
                    except Exception:
                        pass
        except Exception:
            continue
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


import re

def safe_parse(source: str) -> ast.AST:
    """Parse python source with fallback for legacy syntax (e.g. async=True in PyTorch < 1.0)."""
    try:
        return ast.parse(source)
    except SyntaxError:
        fixed = re.sub(r"\basync\s*=", "non_blocking=", source)
        return ast.parse(fixed)


def scan_repo(repo_path: Path) -> dict[str, Any]:
    """Return params, entrypoint, run template, warnings, or a BLOCKED reason."""
    entry = find_entrypoint(repo_path)
    weights = scan_weights(repo_path)
    if not entry:
        return {"params": {}, "entrypoint": None, "run_template": None,
                "blocked": "No executable training entrypoint (e.g. train.py, main.py, run.py) found",
                "warnings": weights_warnings(weights), "weights": weights}
    rel_entry = entry.relative_to(repo_path).as_posix()

    all_candidates: list[dict[str, Any]] = []
    out_flag: str | None = None
    tunable_flags: list[str] = []

    # 1. Scan entrypoint file for argparse, constructors, constants, seeds
    try:
        tree = safe_parse(entry.read_text(encoding="utf-8", errors="ignore"))
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
            py_tree = safe_parse(py_file.read_text(encoding="utf-8", errors="ignore"))
            all_candidates.extend(scan_constructors(py_tree, py_file.name))
            all_candidates.extend(scan_constants(py_tree, py_file.name))
            all_candidates.extend(scan_seed_calls(py_tree, py_file.name))
        except Exception:
            pass

    # 2. Scan config files and Jupyter notebooks
    all_candidates.extend(scan_configs(repo_path))
    all_candidates.extend(scan_notebooks(repo_path))

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

    # 5. Detect missing trained weights
    warnings.extend(weights_warnings(weights))

    # 6. Build run template
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
        "weights": weights,
    }


# ---------------------------------------------------------------------------
# Model weights: find what the code loads, and whether it is in the repository
# ---------------------------------------------------------------------------
WEIGHT_EXTS = {".pt", ".pth", ".bin", ".safetensors", ".ckpt", ".h5", ".keras", ".pkl",
               ".pickle", ".joblib", ".onnx", ".msgpack"}
# Callables that load model weights: name -> (library, expects "dir_or_hub" | "file" | "hub")
WEIGHT_LOADERS = {
    "from_pretrained": ("transformers", "dir_or_hub"),
    "pipeline": ("transformers", "dir_or_hub"),
    "SentenceTransformer": ("sentence-transformers", "dir_or_hub"),
    "hf_hub_download": ("huggingface_hub", "hub"),
    "snapshot_download": ("huggingface_hub", "hub"),
    "load_from_checkpoint": ("lightning", "file"),
    "load_model": ("keras", "file"),
    "load_file": ("safetensors", "file"),
}
# Classes whose from_pretrained() loads no weights (tokenizers, configs, processors)
AUX_LOADER_HINTS = ("Tokenizer", "Config", "Processor", "FeatureExtractor", "ImageProcessor")
LOCAL_DIR_HINTS = {"checkpoints", "checkpoint", "ckpt", "ckpts", "models", "model", "weights",
                   "saved_models", "saved_model", "pretrained", "outputs", "output", "artifacts",
                   "results", "runs", "exp", "experiments", "logs", "save", "saved", "data"}
CONFIG_MODEL_KEYS = {"model_name_or_path", "pretrained_model_name_or_path", "model_name", "model_path",
                     "checkpoint", "checkpoint_path", "ckpt", "ckpt_path", "pretrained", "pretrained_path",
                     "weights", "weights_path", "resume", "resume_from_checkpoint", "load_from",
                     "init_checkpoint", "model_checkpoint", "base_model"}
HUB_ID_RE = re.compile(r"^[A-Za-z0-9][\w.-]{0,95}(?:/[A-Za-z0-9][\w.-]{0,95})?$")
HF_URL_RE = re.compile(
    r"https?://(?:www\.)?(?:huggingface\.co|hf\.co)/"
    r"(?!datasets/|spaces/|docs\b|blog\b|papers\b|join\b|login\b|pricing\b|settings\b|models\b|"
    r"organizations\b|collections\b|tasks\b|learn\b|transformers\b|api\b)"
    r"([A-Za-z0-9][\w.-]*/[A-Za-z0-9][\w.-]*)"
    r"(?:/(?:tree|blob|resolve|commit)/([\w.-]+))?", re.IGNORECASE)
EXTERNAL_WEIGHT_RE = re.compile(
    r"https?://[^\s)\]\"'<>]*(?:drive\.google\.com|docs\.google\.com/uc|dropbox\.com|zenodo\.org|figshare\.com|"
    r"amazonaws\.com|/releases/download/|storage\.googleapis\.com)[^\s)\]\"'<>]*"
    r"|https?://[^\s)\]\"'<>]+\.(?:pt|pth|bin|safetensors|ckpt|h5|pkl|joblib|onnx)\b"
    r"|https?://[^\s)\]\"'<>]*(?:model|weight|checkpoint|ckpt|pretrained)[^\s)\]\"'<>]*\.(?:zip|tar\.gz)\b",
    re.IGNORECASE)
TRAINING_RE = re.compile(r"\.backward\(|optimizer\.step\(|\bTrainer\(|\.fit\(|trainer\.train\(")
SKIP_DIRS = {"venv", ".venv", "env", "node_modules", "site-packages", ".git", "__pycache__", ".ipynb_checkpoints"}


def is_lfs_pointer(path: Path) -> bool:
    """A Git LFS pointer is a tiny text stub committed in place of the real weights."""
    try:
        if path.stat().st_size > 1024:
            return False
        return path.read_bytes()[:40].startswith(b"version https://git-lfs")
    except OSError:
        return False


def _call_name(func: ast.AST) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _receiver(func: ast.AST) -> str:
    """'AutoModelForSequenceClassification' for AutoModelForSequenceClassification.from_pretrained."""
    if isinstance(func, ast.Attribute):
        v = func.value
        if isinstance(v, ast.Name):
            return v.id
        if isinstance(v, ast.Attribute):
            return v.attr
    return ""


def _argparse_defaults(tree: ast.AST) -> dict[str, tuple[Any, str]]:
    """dest -> (default, flag) for every add_argument call."""
    out = {}
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "add_argument" and node.args):
            flags = [_lit(a) for a in node.args if isinstance(_lit(a), str) and _lit(a).startswith("-")]
            if not flags:
                continue
            flag = max(flags, key=len).lstrip("-")
            dest = next((_lit(k.value) for k in node.keywords if k.arg == "dest"), None) or flag.replace("-", "_")
            default = next((_lit(k.value) for k in node.keywords if k.arg == "default"), None)
            out[dest] = (default, flag)
    return out


def _module_strings(tree: ast.AST) -> dict[str, str]:
    out = {}
    for stmt in getattr(tree, "body", []):
        if isinstance(stmt, ast.Assign) and isinstance(_lit(stmt.value), str):
            for t in stmt.targets:
                if isinstance(t, ast.Name):
                    out[t.id] = _lit(stmt.value)
    return out


def _resolve_str(node: ast.AST, consts: dict, argdefs: dict) -> tuple[str | None, str | None]:
    """Best-effort static value of a path/name expression. Returns (value, argparse_flag)."""
    v = _lit(node)
    if isinstance(v, str):
        return v, None
    if isinstance(node, ast.Name) and node.id in consts:
        return consts[node.id], None
    if isinstance(node, ast.Attribute) and node.attr in argdefs:
        default, flag = argdefs[node.attr]
        return (default if isinstance(default, str) else None), flag
    if isinstance(node, ast.Call):
        name = _call_name(node.func)
        if name == "join" and node.args:  # os.path.join(...)
            parts = [_resolve_str(a, consts, argdefs) for a in node.args]
            if all(p[0] for p in parts):
                return "/".join(p[0].strip("/") if i else p[0].rstrip("/") for i, p in enumerate(parts)), \
                    next((p[1] for p in parts if p[1]), None)
        if name in ("Path", "PurePath", "str", "abspath", "expanduser") and node.args:
            return _resolve_str(node.args[0], consts, argdefs)
        if name == "open" and node.args:
            return _resolve_str(node.args[0], consts, argdefs)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):  # Path("a") / "b"
        a, fa = _resolve_str(node.left, consts, argdefs)
        b, fb = _resolve_str(node.right, consts, argdefs)
        if a and b:
            return f"{a.rstrip('/')}/{b.lstrip('/')}", fa or fb
    return None, None


def _load_arg(node: ast.Call, name: str) -> ast.AST | None:
    kw = {k.arg: k.value for k in node.keywords if k.arg}
    if name == "from_pretrained":
        return node.args[0] if node.args else kw.get("pretrained_model_name_or_path") or kw.get("model_name_or_path")
    if name == "pipeline":
        return kw.get("model") or (node.args[1] if len(node.args) > 1 else None)
    if name in ("hf_hub_download", "snapshot_download"):
        return kw.get("repo_id") or (node.args[0] if node.args else None)
    if name == "load_from_checkpoint":
        return node.args[0] if node.args else kw.get("checkpoint_path")
    return node.args[0] if node.args else None


def _save_arg(node: ast.Call, name: str, receiver: str) -> ast.AST | None:
    kw = {k.arg: k.value for k in node.keywords if k.arg}
    if name == "save" and receiver == "torch" or name in ("dump", "save_file"):
        return node.args[1] if len(node.args) > 1 else kw.get("f") or kw.get("filename")
    if name in ("save_pretrained", "save_model", "save"):
        return node.args[0] if node.args else kw.get("save_directory") or kw.get("output_dir")
    if name in ("ModelCheckpoint", "TrainingArguments"):
        return kw.get("dirpath") or kw.get("output_dir") or kw.get("filepath")
    return None


def _classify_loader(node: ast.Call, src: str) -> tuple[str, str, str] | None:
    """(loader label, library, expects) if this call loads model weights, else None."""
    name = _call_name(node.func)
    recv = _receiver(node.func)
    if name == "load" and recv == "torch":
        return "torch.load", "torch", "file"
    if name == "load" and recv in ("joblib", "pickle", "dill", "cloudpickle"):
        return f"{recv}.load", recv, "file"
    if name == "create_model" and node.args and str(_lit(node.args[0]) or "").startswith(("hf_hub:", "hf-hub:")):
        return "timm.create_model", "timm", "hub"
    if name == "load_file" and "safetensors" not in src:
        return None
    if name == "pipeline" and not any(k.arg == "model" for k in node.keywords) and len(node.args) < 2:
        return None
    if name in WEIGHT_LOADERS:
        lib, expects = WEIGHT_LOADERS[name]
        label = f"{recv}.{name}" if recv else name
        return label, lib, expects
    return None


def _norm_path(p: str) -> str:
    return re.sub(r"^\./", "", p.strip().replace("\\", "/")).rstrip("/")


def _find_in_repo(repo_path: Path, value: str, file_dir: Path) -> Path | None:
    """Locate a referenced path relative to the repo root, the calling file, or (for absolute
    paths baked in for a Docker image, e.g. /src/models/x) by suffix match inside the repo."""
    p = _norm_path(value)
    if not p:
        return None
    if p.startswith("/"):
        parts = Path(p).parts[1:]
        for i in range(len(parts)):
            cand = repo_path.joinpath(*parts[i:])
            if cand.exists():
                return cand
        return None
    for base in (repo_path, file_dir):
        cand = (base / p)
        if cand.exists():
            return cand
    return None


def _weights_present(path: Path) -> tuple[bool, bool]:
    """(has real weights, is LFS pointer). A directory counts if it holds a non-pointer weight file."""
    if path.is_file():
        lfs = is_lfs_pointer(path)
        return (not lfs), lfs
    files = [f for f in path.rglob("*") if f.is_file() and f.suffix.lower() in WEIGHT_EXTS]
    if not files:
        return False, False
    real = [f for f in files if not is_lfs_pointer(f)]
    return bool(real), not real


def _looks_like_hub_id(value: str) -> bool:
    v = value.strip()
    if v.startswith(("hf_hub:", "hf-hub:")):
        return True
    if v.startswith((".", "/", "~")) or "\\" in v or v.count("/") > 1 or not HUB_ID_RE.match(v):
        return False
    if Path(v).suffix.lower() in WEIGHT_EXTS:
        return False
    return v.split("/")[0].lower() not in LOCAL_DIR_HINTS


def _iter_sources(repo_path: Path):
    """Yield (rel_path, source_code) for .py files and notebook code cells."""
    for f in sorted(repo_path.rglob("*.py")):
        rel = f.relative_to(repo_path)
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts):
            continue
        yield rel.as_posix(), f.read_text(encoding="utf-8", errors="ignore")
    for nb in sorted(repo_path.rglob("*.ipynb")):
        rel = nb.relative_to(repo_path)
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts):
            continue
        try:
            cells = json.loads(nb.read_text(encoding="utf-8")).get("cells", [])
        except Exception:
            continue
        code = "\n".join(
            "\n".join(l for l in "".join(c.get("source", [])).splitlines() if not l.strip().startswith(("%", "!")))
            for c in cells if c.get("cell_type") == "code")
        yield rel.as_posix(), code


def _scan_docs(repo_path: Path) -> tuple[list[dict], list[dict]]:
    """Hub model IDs and external weight links mentioned in README / docs."""
    hub, links = [], []
    docs = [f for f in repo_path.glob("*") if f.is_file() and f.suffix.lower() in (".md", ".rst", ".txt")
            and f.name.lower() != "requirements.txt"]
    docs += sorted((repo_path / "docs").glob("*.md")) if (repo_path / "docs").is_dir() else []
    for d in docs:
        rel = d.relative_to(repo_path).as_posix()
        for ln, line in enumerate(d.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            for m in HF_URL_RE.finditer(line):
                hub.append({"repo_id": m.group(1).rstrip(".,;:"), "revision": m.group(2), "source": "readme",
                            "kind": "url", "file": rel, "line": ln, "quote": line.strip()[:200]})
            for m in re.finditer(r"from_pretrained\(\s*[\"']([^\"']+)[\"']", line):
                if _looks_like_hub_id(m.group(1)):
                    hub.append({"repo_id": m.group(1), "revision": None, "source": "readme", "kind": "code",
                                "file": rel, "line": ln, "quote": line.strip()[:200]})
            for m in EXTERNAL_WEIGHT_RE.finditer(line):
                links.append({"url": m.group(0).rstrip(".,;:"), "file": rel, "line": ln})
    return hub, links


def _scan_config_refs(repo_path: Path) -> list[dict]:
    refs = []
    files = [f for pat in ("*.yaml", "*.yml", "*.json") for f in repo_path.glob(pat)]
    for sub in ("config", "configs", "conf"):
        if (repo_path / sub).is_dir():
            files += [f for pat in ("*.yaml", "*.yml", "*.json") for f in (repo_path / sub).rglob(pat)]
    for cf in files:
        if cf.name in {"package.json", "package-lock.json", "tsconfig.json", "config.json"}:
            continue
        try:
            text = cf.read_text(encoding="utf-8", errors="ignore")
            data = yaml.safe_load(text) if cf.suffix in (".yaml", ".yml") else json.loads(text)
        except Exception:
            continue

        def walk(d):
            if isinstance(d, dict):
                for k, v in d.items():
                    if str(k).lower() in CONFIG_MODEL_KEYS and isinstance(v, str) and v.strip():
                        refs.append({"key": str(k), "value": v.strip(), "file": cf.relative_to(repo_path).as_posix()})
                    else:
                        walk(v)
            elif isinstance(d, list):
                for x in d:
                    walk(x)
        walk(data)
    return refs


def scan_weights(repo_path: Path) -> dict[str, Any]:
    """Find every model-weight load in the repo and decide whether the weights are available.

    Each reference is classified as:
      present     the file/dir exists in the repo with real (non-LFS-pointer) weights
      missing     a local path the code loads but the repo does not contain
      produced    a local path the repo itself writes (training saves it), so not missing
      hub         a Hugging Face Hub model ID loaded directly by the code
      flag        the path comes from a CLI flag with no default: a checkpoint must be supplied
      dynamic     computed at runtime; cannot be resolved statically
    """
    references: list[dict] = []
    saves: list[str] = []
    uses_hub_assets = False

    for rel, src in _iter_sources(repo_path):
        try:
            tree = safe_parse(src)
        except Exception:
            continue
        consts, argdefs = _module_strings(tree), _argparse_defaults(tree)
        trains = bool(TRAINING_RE.search(src))
        if re.search(r"\bload_dataset\(|\bhf_hub_download\(", src):
            uses_hub_assets = True
        file_dir = (repo_path / rel).parent
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name, recv = _call_name(node.func), _receiver(node.func)
            sarg = _save_arg(node, name or "", recv)
            if sarg is not None:
                val, _ = _resolve_str(sarg, consts, argdefs)
                if val:
                    saves.append(_norm_path(val))
            info = _classify_loader(node, src)
            if not info:
                continue
            label, lib, expects = info
            arg = _load_arg(node, name)
            if arg is None:
                continue
            value, flag = _resolve_str(arg, consts, argdefs)
            ref = {"loader": label, "library": lib, "expects": expects, "file": rel, "line": node.lineno,
                   "expr": ast.unparse(arg)[:120], "value": value, "flag": flag,
                   "aux": any(h in recv for h in AUX_LOADER_HINTS), "in_training_code": trains,
                   "head": (recv.split("For", 1)[1] if "For" in recv else None),
                   "exists": False, "lfs_pointer": False}
            if value and value.startswith(("hf_hub:", "hf-hub:")):
                value = ref["value"] = value.split(":", 1)[1]
            if value is None:
                ref["status"] = "flag" if flag else "dynamic"
            elif value.startswith(("http://", "https://")):
                ref["status"] = "dynamic"
            else:
                found = _find_in_repo(repo_path, value, file_dir)
                if found is not None:
                    has, lfs = _weights_present(found)
                    ref.update(exists=True, lfs_pointer=lfs, status="present" if has or ref["aux"] else "missing")
                elif expects in ("dir_or_hub", "hub") and _looks_like_hub_id(value):
                    ref["status"] = "hub"
                else:
                    ref["status"] = "missing"
            references.append(ref)

    # A missing path that the repo itself writes is an output of training, not a missing input.
    for ref in references:
        if ref["status"] == "missing" and ref["value"]:
            p = _norm_path(ref["value"])
            if any(s and (p == s or p.startswith(s + "/") or s.startswith(p + "/")) for s in saves):
                ref["status"] = "produced"

    doc_hub, external = _scan_docs(repo_path)
    for c in _scan_config_refs(repo_path):
        found = _find_in_repo(repo_path, c["value"], repo_path)
        if found is None and _looks_like_hub_id(c["value"]):
            doc_hub.append({"repo_id": c["value"], "revision": None, "source": "config", "kind": "code",
                            "file": c["file"], "line": 1, "quote": f"{c['key']}: {c['value']}"})

    local_files = []
    for f in sorted(repo_path.rglob("*")):
        rel = f.relative_to(repo_path)
        if f.is_file() and f.suffix.lower() in WEIGHT_EXTS and not any(p in SKIP_DIRS for p in rel.parts):
            local_files.append({"path": rel.as_posix(), "size": f.stat().st_size, "lfs_pointer": is_lfs_pointer(f)})

    weight_refs = [r for r in references if not r["aux"]]
    missing = [r for r in weight_refs if r["status"] in ("missing", "flag")]
    hub_refs = [r for r in references if r["status"] == "hub"]
    if missing:
        status = "missing"
    elif hub_refs:
        status = "hub_reference"
    elif any(r["status"] == "present" for r in weight_refs) or any(not f["lfs_pointer"] for f in local_files):
        status = "present"
    else:
        status = "not_required"
    return {"status": status, "references": references, "missing": missing, "hub_refs": hub_refs,
            "doc_refs": doc_hub, "external_links": external, "local_weight_files": local_files,
            "uses_hub_assets": uses_hub_assets}


def weights_warnings(weights: dict[str, Any]) -> list[str]:
    out = []
    for r in weights.get("missing", []):
        if r["status"] == "flag":
            out.append(f"🧩 Trained weights required: {r['file']}:{r['line']} loads `{r['expr']}` via "
                       f"{r['loader']} from the --{r['flag']} flag, which has no default; no checkpoint ships with the repo.")
        else:
            what = "a Git LFS pointer, not the real file" if r["lfs_pointer"] else "not in the repository"
            out.append(f"🧩 Missing trained weights: {r['file']}:{r['line']} loads `{r['value']}` via "
                       f"{r['loader']}, but it is {what}.")
    return out
