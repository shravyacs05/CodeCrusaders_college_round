"""Runner: execute the experiment per seed, read metrics ONLY from metrics.json.

Isolation: Docker if available (non-root, no network, CPU/mem/time limits, read-only code),
otherwise a subprocess with a timeout labelled 'reduced isolation'.
Fallback runs in a fresh virtualenv (created once per project in setup_env).
"""
import json
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable

from ..config import RUN_TIMEOUT_S, SETUP_TIMEOUT_S
from .versioning import config_hash

DOCKER_IMAGE = "crisisgrid-runner"


_DOCKER_AVAILABLE_CACHE: bool | None = None


def docker_available() -> bool:
    global _DOCKER_AVAILABLE_CACHE
    if _DOCKER_AVAILABLE_CACHE is not None:
        return _DOCKER_AVAILABLE_CACHE
    if not shutil.which("docker"):
        _DOCKER_AVAILABLE_CACHE = False
        return False
    try:
        res = subprocess.run(["docker", "info"], capture_output=True, timeout=2).returncode == 0
        _DOCKER_AVAILABLE_CACHE = res
        return res
    except Exception:
        _DOCKER_AVAILABLE_CACHE = False
        return False


def setup_env(repo_path: Path, work_dir: Path, use_docker: bool,
              on_event: Callable[[str, str], None]) -> dict[str, Any]:
    """Setup stage (network allowed): install requirements once, cached per project.

    Docker: pip install --target into the writable dir, mounted again (offline) for training.
    Fallback: a fresh virtualenv under work_dir/venv.
    Returns {"ok": bool, "python": str|None, "log": str}.
    """
    on_event("Dataset", "running")
    work_dir.mkdir(parents=True, exist_ok=True)
    req = repo_path / "requirements.txt"
    log = work_dir / "setup_log.txt"
    marker = work_dir / ".setup_done"
    try:
        if use_docker:
            deps = work_dir / "deps"
            if not marker.exists() and req.exists():
                p = subprocess.run(
                    ["docker", "run", "--rm", "--memory", "2g", "-v", f"{repo_path.resolve()}:/code:ro",
                     "-v", f"{work_dir.resolve()}:/out", "-w", "/code", DOCKER_IMAGE,
                     "pip", "install", "--no-cache-dir", "--target", "/out/deps", "-r", "requirements.txt"],
                    capture_output=True, text=True, timeout=SETUP_TIMEOUT_S)
                log.write_text(p.stdout + p.stderr)
                if p.returncode != 0:
                    raise RuntimeError("pip install failed (see setup_log.txt)")
            marker.write_text("ok")
            on_event("Dataset", "done")
            return {"ok": True, "python": None, "log": str(log)}
        venv = work_dir / "venv"
        py = (venv / "Scripts" / "python.exe") if sys.platform == "win32" else (venv / "bin" / "python")
        if not marker.exists():
            subprocess.run([sys.executable, "-m", "venv", "--system-site-packages", str(venv)], check=True,
                           capture_output=True, timeout=120)
            out = ""
            if req.exists():
                p = subprocess.run([str(py), "-m", "pip", "install", "--no-cache-dir", "-r", str(req)],
                                   capture_output=True, text=True, timeout=SETUP_TIMEOUT_S)
                out = p.stdout + p.stderr
                log.write_text(out)
                if p.returncode != 0:
                    import re
                    # Fallback: sanitize requirements (strip platform wheels like +cpu, dead find-links)
                    sanitized_lines = []
                    for raw_l in req.read_text().splitlines():
                        l = raw_l.strip()
                        if not l or l.startswith("#") or l.startswith("-f") or l.startswith("--find-links") or l.startswith("--extra-index-url"):
                            continue
                        clean_pkg = re.sub(r"\+cpu|\+cu\d+", "", l)
                        sanitized_lines.append(clean_pkg)
                    if sanitized_lines:
                        clean_req = work_dir / "sanitized_requirements.txt"
                        clean_req.write_text("\n".join(sanitized_lines))
                        p2 = subprocess.run([str(py), "-m", "pip", "install", "--no-cache-dir", "-r", str(clean_req)],
                                            capture_output=True, text=True, timeout=SETUP_TIMEOUT_S)
                        out += "\n--- Retried with platform-agnostic dependencies ---\n" + p2.stdout + p2.stderr
                        log.write_text(out)
                        if p2.returncode != 0:
                            # Install working non-torch dependencies one-by-one so setup can proceed
                            for pkg in sanitized_lines:
                                if any(pkg.startswith(tp) for tp in ("torch==", "torch>=", "torchvision", "torchaudio")):
                                    continue
                                subprocess.run([str(py), "-m", "pip", "install", "--no-cache-dir", pkg],
                                               capture_output=True, text=True, timeout=60)
            marker.write_text("ok")
        on_event("Dataset", "done")
        return {"ok": True, "python": str(py), "log": str(log)}
    except Exception as e:
        on_event("Dataset", "failed")
        log.write_text((log.read_text() if log.exists() else "") + f"\nSETUP FAILED: {e}")
        return {"ok": False, "python": None, "log": str(log), "error": str(e)}


def render_command(template: str, spec: dict[str, Any], seed: int, out: str,
                   python: str | None = None) -> list[str]:
    """Fill the run template; missing values are omitted so the code default is used."""
    values = {k: v["value"] for k, v in spec["params"].items()}
    values["seed"] = seed
    values["out"] = out
    tokens = template.split()
    cmd, i = [], 0
    while i < len(tokens):
        t = tokens[i]
        if t.startswith("-") and i + 1 < len(tokens) and tokens[i + 1].startswith("{"):
            key = tokens[i + 1].strip("{}")
            if values.get(key) is not None:
                cmd += [t, str(values[key])]
            i += 2
        else:
            cmd.append(t)
            i += 1
    if cmd and cmd[0] == "python":
        cmd[0] = python or sys.executable
    return cmd


def run_seed(repo_path: Path, spec: dict, seed: int, out_dir: Path, experiment_id: str,
             parent_id: str | None, commit: str, use_docker: bool,
             on_event: Callable[[str, str], None], python: str | None = None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"metrics_seed{seed}.json"
    log_file = out_dir / f"log_seed{seed}.txt"
    isolation = "docker" if use_docker else "reduced isolation"
    started = time.time()
    on_event("Training", "running")
    if use_docker:
        cmd = render_command(spec["run_command_template"], spec, seed, f"/out/{out_file.name}")
        cmd[0] = "python"
        docker_cmd = ["docker", "run", "--rm", "--network", "none", "--memory", "2g",
                      "--cpus", "2", "--user", "1000:1000",
                      "-v", f"{repo_path.resolve()}:/code:ro",
                      "-v", f"{out_dir.resolve()}:/out",
                      "-v", f"{(out_dir.parent / 'deps').resolve()}:/deps:ro",
                      "-e", "PYTHONPATH=/deps", "-w", "/code",
                      DOCKER_IMAGE] + cmd
        full = docker_cmd
    else:
        full = render_command(spec["run_command_template"], spec, seed, str(out_file), python)
    try:
        proc = subprocess.run(full, cwd=None if use_docker else repo_path, capture_output=True,
                              text=True, timeout=RUN_TIMEOUT_S)
        log_file.write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr)
        exit_status = proc.returncode
    except subprocess.TimeoutExpired:
        log_file.write_text("TIMEOUT")
        exit_status = -9
    metrics = None
    if exit_status == 0 and out_file.exists():
        metrics = json.loads(out_file.read_text())
        on_event("Training", "done")
        on_event("Evaluation", "done")
        status = "done"
    else:
        on_event("Training", "failed")
        status = "failed"
    return {
        "seed": seed, "status": status, "metrics": metrics, "log": str(log_file),
        "manifest": {
            "experiment_id": experiment_id, "parent_id": parent_id, "repo_commit": commit,
            "config_hash": config_hash(spec), "seed": seed, "isolation": isolation,
            "python": platform.python_version(), "command": " ".join(full),
            "started_at": started, "ended_at": time.time(), "exit_status": exit_status,
        },
    }
