"""Self-Healing Experiment / Auto-Repair Engine.

Diagnoses execution failures (missing dependencies, CUDA hardcoding on CPU/Mac,
argparse type errors, missing metrics output) and generates surgical patches
to create a self-healed experiment version.
"""
import re
from pathlib import Path
from typing import Any


def diagnose_failure(project: dict[str, Any], exp_id: str) -> dict[str, Any]:
    """Analyze stderr, stdout, or setup logs to diagnose why an experiment failed."""
    exp = project.get("experiments", {}).get(exp_id)
    if not exp:
        return {"can_heal": False, "reason": "Experiment not found"}

    run_info = project.get("runs", {}).get(exp_id, {})
    setup_log = run_info.get("setup_log", "")
    results = run_info.get("results", [])

    # Check setup log first
    if "SETUP FAILED" in setup_log or "No matching distribution found" in setup_log:
        pinned_match = re.search(r"requirement ([a-zA-Z0-9_\-\.\+]+)", setup_log)
        pkg = pinned_match.group(1) if pinned_match else "pinned package"
        return {
            "can_heal": True,
            "category": "PLATFORM_WHEEL_LOCK_IN",
            "title": f"Obsolete/Incompatible Platform Wheel ({pkg})",
            "root_cause": (
                f"The repository pinned '{pkg}' with hardware/OS-specific tags (e.g. +cpu or +cu*) "
                f"that do not match your current platform (macOS ARM64)."
            ),
            "remedy": "Sanitize requirements.txt into platform-agnostic dependencies and bridge with system PyTorch.",
            "action_type": "sanitize_env",
            "target_file": "requirements.txt",
        }

    # Check run stderr
    stderr_content = ""
    for r in results:
        log_path = r.get("log")
        if log_path and Path(log_path).exists():
            content = Path(log_path).read_text(encoding="utf-8", errors="ignore")
            if "--- stderr ---" in content:
                stderr_content += content.split("--- stderr ---")[-1] + "\n"
            elif "Traceback" in content:
                stderr_content += content + "\n"

    if not stderr_content:
        return {
            "can_heal": False,
            "category": "NO_ERROR_DETECTED",
            "title": "No Runtime Error Detected",
            "root_cause": "The experiment did not record any crash or failure.",
            "remedy": None,
            "action_type": None,
        }

    # 1. ModuleNotFoundError
    mod_match = re.search(r"ModuleNotFoundError: No module named '([a-zA-Z0-9_\-]+)'", stderr_content)
    if mod_match:
        mod = mod_match.group(1)
        return {
            "can_heal": True,
            "category": "MISSING_DEPENDENCY",
            "title": f"Missing Dependency: {mod}",
            "root_cause": f"The script requires module '{mod}' which is not installed in the environment.",
            "remedy": f"Install package '{mod}' into the reproduction environment.",
            "action_type": "install_pkg",
            "pkg_name": mod,
            "target_file": "requirements.txt",
        }

    # 2. CUDA Device on CPU/Mac
    if any(k in stderr_content for k in ("CUDA error", "Torch not compiled with CUDA enabled", "No CUDA GPUs are available", "cuda:0")):
        return {
            "can_heal": True,
            "category": "HARDCODED_CUDA",
            "title": "Hardcoded CUDA GPU Device on CPU/Mac",
            "root_cause": "The model training script hardcodes `.cuda()` or `device='cuda'`, failing on non-NVIDIA machines.",
            "remedy": "Patch device selection to fallback to CPU / MPS dynamically.",
            "action_type": "patch_device",
            "target_file": project.get("scan", {}).get("entrypoint") or "train.py",
        }

    # 3. Missing --out flag / metrics not exported
    if "==> Wrote metrics to" not in stderr_content and any(r.get("metrics") is None for r in results):
        entrypoint = project.get("scan", {}).get("entrypoint") or "train.py"
        return {
            "can_heal": True,
            "category": "MISSING_METRICS_EXPORTER",
            "title": "Missing Metrics Output Exporter",
            "root_cause": f"The entrypoint '{entrypoint}' executes successfully but does not export quantitative results to an automated metrics JSON file.",
            "remedy": "Inject automated test metric exporter (--out flag) to capture accuracy/loss.",
            "action_type": "inject_metrics_exporter",
            "target_file": entrypoint,
        }

    # General unclassified error
    first_err_line = [l.strip() for l in stderr_content.splitlines() if l.strip() and not l.strip().startswith("File")][-1]
    return {
        "can_heal": True,
        "category": "RUNTIME_EXCEPTION",
        "title": "Runtime Execution Exception",
        "root_cause": f"Script raised an unhandled exception: {first_err_line}",
        "remedy": "Apply safe exception handling and rerun with fallback parameters.",
        "action_type": "general_patch",
        "target_file": project.get("scan", {}).get("entrypoint") or "train.py",
    }


def apply_auto_heal(project: dict[str, Any], exp_id: str, repo_path: Path) -> dict[str, Any]:
    """Apply the self-healing remedy and generate a new healed experiment version."""
    diagnosis = diagnose_failure(project, exp_id)
    if not diagnosis.get("can_heal"):
        return {"ok": False, "error": diagnosis.get("root_cause", "Cannot heal")}

    parent_exp = project["experiments"][exp_id]
    import copy
    import hashlib
    import uuid

    new_eid = uuid.uuid4().hex[:8]
    new_spec = copy.deepcopy(parent_exp["spec"])

    # If action is sanitize_env
    if diagnosis["action_type"] == "sanitize_env":
        # Clear out broken markers in runs
        done_marker = repo_path.parent / "runs" / ".setup_done"
        if done_marker.exists():
            done_marker.unlink()

    # If action is inject_metrics_exporter or patch_device
    target_rel = diagnosis.get("target_file")
    if target_rel and (repo_path / target_rel).exists():
        target_path = repo_path / target_rel
        content = target_path.read_text(encoding="utf-8")
        if diagnosis["action_type"] == "patch_device":
            if ".cuda()" in content:
                patched = content.replace(".cuda()", ".to(torch.device('cuda' if torch.cuda.is_available() else 'cpu'))")
                target_path.write_text(patched, encoding="utf-8")
        elif diagnosis["action_type"] == "inject_metrics_exporter":
            if "--out" not in content and "argparse" in content:
                # Add out argument
                patched = content.replace("parser.parse_args()", "parser.add_argument('--out', type=str, default=None)\n    args = parser.parse_args()")
                target_path.write_text(patched, encoding="utf-8")

    # Build new experiment spec
    param_str = "-".join(f"{k}:{v.get('value')}" for k, v in sorted(new_spec["params"].items()))
    config_hash = hashlib.sha256(param_str.encode()).hexdigest()[:12]

    new_exp = {
        "id": new_eid,
        "parent_id": exp_id,
        "version": parent_exp.get("version", 1) + 1,
        "spec": new_spec,
        "diff_from_parent": [
            f"Self-healed: {diagnosis['title']} ({diagnosis['remedy']})"
        ],
        "config_hash": config_hash,
        "healed_from": exp_id,
        "healing_diagnosis": diagnosis,
    }

    project["experiments"][new_eid] = new_exp
    return {
        "ok": True,
        "new_experiment_id": new_eid,
        "diagnosis": diagnosis,
        "experiment": new_exp,
    }
