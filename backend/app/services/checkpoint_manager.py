"""Checkpoint manager: identify, pin, download, verify and connect missing model weights.

Principle: never substitute. A checkpoint is fetched only when it is explicitly referenced by the
paper, README, a config file or the code AND the Hugging Face Hub confirms it exists with weights
whose head matches the code that loads it. The Hub is never searched by name. Every download is
pinned to an exact commit and each file is hash-verified against the Hub's own metadata.

Flow:  plan_checkpoint()  (analysis time, metadata only)
       prepare()          (run time: download -> integrity -> load check -> connect to the code)
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable

from ..config import CHECKPOINT_MAX_GB
from .repo_scanner import WEIGHT_EXTS, norm

AUX_FILES = re.compile(
    r"^(?:config\.json|generation_config\.json|tokenizer\.json|tokenizer_config\.json|special_tokens_map\.json|"
    r"added_tokens\.json|vocab\.(?:txt|json)|merges\.txt|spiece\.model|sentencepiece\.bpe\.model|tokenizer\.model|"
    r"preprocessor_config\.json|modules\.json|sentence_bert_config\.json|config_sentence_transformers\.json|"
    r"\d+_\w+/config\.json)$")
# Weight formats in order of preference; the first one the repo provides is downloaded.
WEIGHT_GROUPS = [
    re.compile(r"^model(?:-\d{5}-of-\d{5})?\.safetensors$|^model\.safetensors\.index\.json$"),
    re.compile(r"^pytorch_model(?:-\d{5}-of-\d{5})?\.bin$|^pytorch_model\.bin\.index\.json$"),
    re.compile(r"^tf_model\.h5$"),
    re.compile(r"^flax_model\.msgpack$"),
]
SOURCE_LABEL = {"paper": "paper", "readme": "README", "config": "config file", "code": "code"}


class HubError(Exception):
    """The Hub could not be reached (network/server), as opposed to 'model does not exist'."""


class HubClient:
    """Thin wrapper over huggingface_hub so tests can inject a fake."""

    def model_info(self, repo_id: str, revision: str | None = None) -> dict[str, Any] | None:
        from huggingface_hub import HfApi
        from huggingface_hub.errors import HFValidationError, RepositoryNotFoundError, RevisionNotFoundError

        try:
            i = HfApi().model_info(repo_id, revision=revision, files_metadata=True, timeout=20)
        except (RepositoryNotFoundError, RevisionNotFoundError, HFValidationError):
            return None
        except Exception as e:
            raise HubError(f"{type(e).__name__}: {e}"[:300]) from e
        cd = i.card_data
        datasets = (cd.get("datasets") if cd else None) or []
        evals = [{"dataset": e.dataset_name, "config": e.dataset_config, "split": e.dataset_split,
                  "metric": e.metric_type, "value": e.metric_value, "verified": bool(e.verified)}
                 for e in (getattr(cd, "eval_results", None) or [])]
        return {
            "id": i.id, "sha": i.sha, "pipeline_tag": i.pipeline_tag, "library": i.library_name,
            "gated": bool(i.gated), "private": bool(i.private),
            "architectures": (i.config or {}).get("architectures") or [],
            "model_type": (i.config or {}).get("model_type"),
            "datasets": [datasets] if isinstance(datasets, str) else list(datasets),
            "license": cd.get("license") if cd else None,
            "eval_results": evals,
            "last_modified": str(i.last_modified) if i.last_modified else None,
            "files": [{"name": s.rfilename, "size": s.size, "blob_id": s.blob_id,
                       "sha256": s.lfs.sha256 if s.lfs else None} for s in (i.siblings or [])],
        }


# ---------------------------------------------------------------------------
# Planning (no downloads)
# ---------------------------------------------------------------------------
def select_files(files: list[dict]) -> tuple[list[dict], list[dict]]:
    """(aux files, weight files) to download: tokenizer/config plus ONE weight format."""
    aux = [f for f in files if AUX_FILES.match(f["name"])]
    for group in WEIGHT_GROUPS:
        w = [f for f in files if group.match(f["name"])]
        if any(not f["name"].endswith(".json") for f in w):
            return aux, w
    # Non-transformers repos: any top-level weight file (e.g. model.pt, best.ckpt, clf.joblib)
    return aux, [f for f in files if "/" not in f["name"] and Path(f["name"]).suffix.lower() in WEIGHT_EXTS]


def _head(architectures: list[str]) -> str | None:
    """'SequenceClassification' for ['DistilBertForSequenceClassification']; 'base' for BertModel."""
    if not architectures:
        return None
    a = architectures[0]
    return a.split("For", 1)[1] if "For" in a else "base"


def _alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _task_match(info: dict, paper_text: str) -> list[str]:
    """Datasets named in the model card that the paper also names (e.g. sst2 <-> 'SST-2')."""
    text = _alnum(paper_text)
    names = set(info.get("datasets") or []) | {e["config"] for e in info.get("eval_results", []) if e.get("config")}
    return sorted(n for n in names if n and len(_alnum(n)) >= 3 and _alnum(n) not in ("default", "plaintext")
                  and _alnum(n) in text)


def _brief(ref: dict) -> dict:
    return {k: ref.get(k) for k in ("file", "line", "loader", "value", "flag", "status", "expects", "head", "expr", "aux")}


def plan_checkpoint(weights: dict | None, paper_refs: dict | None = None, paper_text: str = "",
                    hub: HubClient | None = None) -> dict[str, Any]:
    """Decide which checkpoint (if any) satisfies the weights the code needs.

    status:
      not_required / present   nothing to do
      identified               missing trained weights matched to exactly one verified Hub checkpoint
      pinned                   code loads Hub models directly; they are pinned to exact commits
      ambiguous                several checkpoints qualify equally; refusing to pick one
      candidate_unconfirmed    only loose paper mentions; no explicit link or code reference
      not_found                no checkpoint is referenced anywhere that the Hub can confirm
      hub_unreachable          the Hub could not be queried; retry when online
    """
    hub = hub or HubClient()
    weights = weights or {}
    wstatus = weights.get("status", "not_required")
    plan: dict[str, Any] = {
        "status": wstatus if wstatus in ("not_required", "present") else "not_found",
        "weights_status": wstatus,
        "missing": [_brief(r) for r in weights.get("missing", [])],
        "candidates": [], "selected": [],
        "external_links": weights.get("external_links", []) + (paper_refs or {}).get("external_links", []),
        "resolved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    if wstatus in ("not_required", "present"):
        return plan

    # 1. Gather every explicitly stated candidate with its evidence
    cands: dict[str, dict] = {}

    def add(repo_id: str, revision: str | None, source: str, kind: str, ref: str, training_base: bool = False):
        c = cands.setdefault(repo_id.lower(), {"requested_id": repo_id, "revision_hint": None, "evidence": [],
                                               "code_refs": [], "training_base_only": True})
        c["revision_hint"] = c["revision_hint"] or revision
        if not any(e["source"] == source and e["ref"] == ref for e in c["evidence"]):
            c["evidence"].append({"source": source, "kind": kind, "ref": ref})
        if not training_base:
            c["training_base_only"] = False

    for r in weights.get("hub_refs", []):
        add(r["value"], None, "code", "code", f"{r['file']}:{r['line']} {r['loader']}",
            training_base=bool(r.get("in_training_code")))
        cands[r["value"].lower()]["code_refs"].append(_brief(r))
    for d in weights.get("doc_refs", []):
        add(d["repo_id"], d.get("revision"), d["source"], d["kind"], f"{d['file']}:{d['line']}")
    for h in (paper_refs or {}).get("hub_ids", []):
        if h.get("verified"):  # an unverifiable quote is not evidence
            add(h["repo_id"], h.get("revision"), "paper", h["kind"], f"p.{h['page']}: {h['quote']}")

    # 2. Confirm each candidate on the Hub
    offline = False
    resolved: dict[str, dict] = {}
    for c in cands.values():
        try:
            info = hub.model_info(c["requested_id"], revision=c["revision_hint"])
        except HubError as e:
            offline = True
            c["rejected"] = f"Hub unreachable: {e}"
            plan["candidates"].append(c)
            continue
        if info is None:
            rev = f" at revision {c['revision_hint']}" if c["revision_hint"] else ""
            c["rejected"] = f"does not exist on the Hugging Face Hub{rev}"
            plan["candidates"].append(c)
            continue
        key = info["id"].lower()
        if key in resolved:  # legacy alias and canonical ID both referenced: merge evidence
            resolved[key]["evidence"] += [e for e in c["evidence"] if e not in resolved[key]["evidence"]]
            resolved[key]["code_refs"] += c["code_refs"]
            resolved[key]["training_base_only"] &= c["training_base_only"]
            continue
        aux, wfiles = select_files(info["files"])
        c.update(repo_id=info["id"], sha=info["sha"], architectures=info["architectures"],
                 model_type=info["model_type"], pipeline_tag=info["pipeline_tag"], library=info["library"],
                 license=info["license"], head=_head(info["architectures"]),
                 task_match=_task_match(info, paper_text),
                 eval_results=[e for e in info["eval_results"]
                               if _alnum(e.get("config") or "") in map(_alnum, _task_match(info, paper_text))
                               or _alnum(e.get("dataset") or "") in map(_alnum, _task_match(info, paper_text))][:6],
                 files=[f["name"] for f in aux + wfiles],
                 aux_files=[f["name"] for f in aux],
                 weight_files=[f["name"] for f in wfiles],
                 file_meta={f["name"]: {"size": f["size"], "sha256": f["sha256"], "blob_id": f["blob_id"]}
                            for f in aux + wfiles},
                 size_bytes=sum(f["size"] or 0 for f in aux + wfiles),
                 revision_source=(f"pinned by {c['evidence'][0]['source']} ({c['revision_hint']})"
                                  if c["revision_hint"] else f"resolved from 'main' on {plan['resolved_at']}"))
        if not wfiles and not c["code_refs"]:
            c["rejected"] = "Hub repository contains no model weight files"
        elif info["gated"] and not os.getenv("HF_TOKEN"):
            c["rejected"] = "gated model: accept its license on the Hub and set HF_TOKEN"
        elif c["size_bytes"] > CHECKPOINT_MAX_GB * 1e9:
            c["rejected"] = f"{c['size_bytes'] / 1e9:.1f} GB exceeds CHECKPOINT_MAX_GB={CHECKPOINT_MAX_GB}"
        resolved[key] = c
        plan["candidates"].append(c)

    def entry(c: dict, role: str, targets: list[dict], confidence: str) -> dict:
        keys = ("repo_id", "requested_id", "sha", "revision_source", "files", "weight_files", "file_meta",
                "size_bytes", "architectures", "model_type", "pipeline_tag", "library", "license",
                "eval_results", "evidence", "task_match", "head")
        return {**{k: c.get(k) for k in keys}, "role": role, "targets": targets, "confidence": confidence}

    # 3a. Missing trained weights: find the one checkpoint that the evidence points to
    if wstatus == "missing":
        targets = [m for m in plan["missing"] if not m.get("aux")]
        heads = {m["head"] for m in targets if m.get("head")}
        eligible = []
        for c in resolved.values():
            if c.get("rejected"):
                continue
            if c["training_base_only"] and all(e["source"] == "code" for e in c["evidence"]):
                c["role_note"] = ("pretrained starting point that the repo's training code fine-tunes; "
                                  "not the missing trained checkpoint")
                continue
            if heads and c["head"] and c["head"] not in heads:
                c["rejected"] = (f"head mismatch: code expects a {'/'.join(sorted(heads))} model "
                                 f"({targets[0]['file']}:{targets[0]['line']}), checkpoint is {c['architectures'][0]}"
                                 + (" (a base/pretraining model, not the trained checkpoint)"
                                    if c["head"] in ("base", "MaskedLM", "PreTraining") else ""))
                continue
            if not any(e["kind"] in ("url", "code") for e in c["evidence"]):
                c["rejected"] = "only a loose mention in the paper; needs an explicit link or code reference"
                plan["status"] = "candidate_unconfirmed"
                continue
            eligible.append(c)

        def rank(c):
            explicit = {e["source"] for e in c["evidence"] if e["kind"] in ("url", "code")}
            return (len(explicit), len({e["source"] for e in c["evidence"]}), bool(c["task_match"]))

        eligible.sort(key=rank, reverse=True)
        if len(eligible) > 1 and rank(eligible[0]) == rank(eligible[1]):
            plan["status"] = "ambiguous"
        elif eligible:
            top = eligible[0]
            n_sources = len({e["source"] for e in top["evidence"]})
            head_ok = bool(heads and top["head"] in heads)
            confidence = "high" if n_sources >= 2 or (head_ok and top["task_match"]) else "medium"
            target_values = {m["value"] for m in targets if m.get("value")}
            aux_targets = [m for m in plan["missing"] if m.get("aux") and m.get("value") in target_values]
            plan["selected"].append(entry(top, "recovered_missing", targets + aux_targets, confidence))
            plan["status"] = "identified"
        elif offline:
            plan["status"] = "hub_unreachable"

    # 3b. Hub models the code loads directly: pin them so every run uses the same bytes
    pinned_ok = True
    for c in resolved.values():
        if c["code_refs"] and not any(s["repo_id"] == c.get("repo_id") for s in plan["selected"]):
            if c.get("rejected") and not c["rejected"].startswith("head mismatch"):
                pinned_ok = False
                continue
            e = entry(c, "pinned_hub_reference", c["code_refs"], "exact")
            if all(r.get("aux") for r in c["code_refs"]):  # only a tokenizer/config is loaded: skip weights
                e.update(files=c["aux_files"], weight_files=[],
                         file_meta={k: v for k, v in c["file_meta"].items() if k in c["aux_files"]},
                         size_bytes=sum(c["file_meta"][k]["size"] or 0 for k in c["aux_files"]))
            plan["selected"].append(e)
    if wstatus == "hub_reference":
        missing_hub = [c for c in cands.values() if c["code_refs"] and c.get("rejected")]
        plan["status"] = ("hub_unreachable" if offline else "not_found") if missing_hub or not pinned_ok else "pinned"
    return plan


def blocking_reason(plan: dict | None) -> str | None:
    """Why a run must not start (missing trained weights with no verified source), else None."""
    if not plan or plan.get("weights_status") != "missing" or plan.get("status") == "identified":
        return None
    where = ", ".join(f"{m['file']}:{m['line']}" for m in plan.get("missing", [])[:3])
    return {
        "ambiguous": f"Trained weights missing ({where}) and several Hub checkpoints qualify equally; "
                     "CrisisGrid will not guess between them.",
        "candidate_unconfirmed": f"Trained weights missing ({where}); the paper only loosely mentions a model "
                                 "name and nothing explicitly links to a checkpoint.",
        "hub_unreachable": f"Trained weights missing ({where}) and the Hugging Face Hub could not be reached "
                           "to verify a checkpoint. Re-run checkpoint resolution when online.",
    }.get(plan.get("status"),
          f"Trained weights missing ({where}) and no verifiable checkpoint is referenced in the paper, README, "
          "configs or code. CrisisGrid will not substitute an unrelated model.")


def plan_warnings(plan: dict | None) -> list[str]:
    if not plan or plan.get("weights_status") in (None, "not_required", "present"):
        return []
    out = []
    for s in plan.get("selected", []):
        ev = ", ".join(sorted({f"{SOURCE_LABEL.get(e['source'], e['source'])} ({e['ref'].split(' ')[0].rstrip(':')})"
                               for e in s["evidence"]}))
        if s["role"] == "recovered_missing":
            out.append(f"✅ Checkpoint identified for the missing weights: {s['repo_id']} @ {s['sha'][:7]} "
                       f"[{s['confidence']} confidence; evidence: {ev}]. It will be downloaded, hash-verified "
                       "and load-checked before the run.")
        else:
            out.append(f"📌 Hub model {s['repo_id']} loaded by the code is pinned to commit {s['sha'][:7]} "
                       "so every run uses identical weights.")
    reason = blocking_reason(plan)
    if reason:
        out.append(f"⛔ {reason}")
    rejected = [c for c in plan.get("candidates", []) if c.get("rejected")]
    if rejected:
        out.append("Rejected checkpoint candidates: " + "; ".join(
            f"{c.get('repo_id') or c['requested_id']}: {c['rejected']}" for c in rejected[:4]))
    return out


# ---------------------------------------------------------------------------
# Run time: download, verify, load-check, connect
# ---------------------------------------------------------------------------
def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _git_blob_sha1(path: Path) -> str:
    """Git object id of a file, which the Hub reports for small (non-LFS) files."""
    h = hashlib.sha1(f"blob {path.stat().st_size}\0".encode())
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_integrity(snapshot: Path, file_meta: dict[str, dict]) -> dict[str, Any]:
    rows = []
    for name, meta in sorted(file_meta.items()):
        f = snapshot / name
        if not f.exists():
            rows.append({"name": name, "ok": False, "algo": None, "error": "not downloaded"})
            continue
        if meta.get("sha256"):
            algo, expected, actual = "sha256", meta["sha256"], _sha256(f)
        elif meta.get("blob_id"):
            algo, expected, actual = "git-sha1", meta["blob_id"], _git_blob_sha1(f)
        else:
            rows.append({"name": name, "ok": None, "algo": None, "size": f.stat().st_size})
            continue
        rows.append({"name": name, "ok": actual == expected, "algo": algo, "expected": expected,
                     "actual": actual, "size": f.stat().st_size})
    return {"ok": all(r["ok"] is not False for r in rows), "n_files": len(rows),
            "n_verified": sum(1 for r in rows if r["ok"] is True), "files": rows}


def _pin_ref(cache_dir: Path, repo_id: str, sha: str) -> None:
    """Point refs/main at the pinned commit so from_pretrained('<repo_id>') resolves to it offline."""
    ref = cache_dir / f"models--{repo_id.replace('/', '--')}" / "refs" / "main"
    ref.parent.mkdir(parents=True, exist_ok=True)
    ref.write_text(sha)


def download(entry: dict, cache_dir: Path) -> dict[str, Any]:
    from huggingface_hub import snapshot_download

    t0 = time.time()
    path = Path(snapshot_download(repo_id=entry["requested_id"], revision=entry["sha"],
                                  cache_dir=str(cache_dir), allow_patterns=entry["files"]))
    _pin_ref(cache_dir, entry["requested_id"], entry["sha"])
    integrity = verify_integrity(path, entry["file_meta"])
    return {"path": str(path), "integrity": integrity, "seconds": round(time.time() - t0, 1)}


LOAD_CHECK = r'''
import json, os, sys
p = sys.argv[1]

def main():
    if os.path.isfile(os.path.join(p, "config.json")):
        import transformers
        with open(os.path.join(p, "config.json")) as f:
            cfg = json.load(f)
        archs = cfg.get("architectures") or []
        cls = (getattr(transformers, archs[0], None) if archs else None) or transformers.AutoModel
        model = cls.from_pretrained(p)
        return {"ok": True, "library": "transformers " + transformers.__version__, "class": type(model).__name__,
                "n_params": sum(t.numel() for t in model.parameters()),
                "num_labels": getattr(model.config, "num_labels", None),
                "id2label": {str(k): v for k, v in (getattr(model.config, "id2label", None) or {}).items()}}
    files = sorted(f for f in os.listdir(p) if f.endswith((".safetensors", ".pt", ".pth", ".bin", ".ckpt")))
    if not files:
        return {"ok": None, "skipped": "no tensor checkpoint to load (pickle/joblib files are only "
                                       "deserialized inside the experiment sandbox)"}
    f = os.path.join(p, files[0])
    if f.endswith(".safetensors"):
        from safetensors import safe_open
        with safe_open(f, "np") as h:
            return {"ok": True, "library": "safetensors", "class": "state_dict", "n_tensors": len(list(h.keys()))}
    import torch
    sd = torch.load(f, map_location="cpu", weights_only=True)
    sd = sd.get("state_dict", sd) if isinstance(sd, dict) else sd
    return {"ok": True, "library": "torch " + torch.__version__, "class": "state_dict",
            "n_tensors": len(sd) if hasattr(sd, "__len__") else None}

try:
    out = main()
except ImportError as e:
    out = {"ok": None, "skipped": f"loader library not installed in the run environment: {e}"}
except Exception as e:
    out = {"ok": False, "error": f"{type(e).__name__}: {e}"[:500]}
print("CRISISGRID_LOAD_CHECK " + json.dumps(out))
'''


def verify_loadable(snapshot: Path, work_dir: Path, python: str | None, use_docker: bool = False,
                    cache_dir: Path | None = None, docker_image: str = "crisisgrid-runner") -> dict[str, Any]:
    """Load the checkpoint with the library it was saved for, in the experiment's own environment."""
    work_dir.mkdir(parents=True, exist_ok=True)
    script = work_dir / "load_check.py"
    script.write_text(LOAD_CHECK)
    if use_docker and cache_dir is not None:
        rel = snapshot.relative_to(cache_dir).as_posix()
        cmd = ["docker", "run", "--rm", "--network", "none", "--memory", "2g", "--user", "1000:1000",
               "-v", f"{cache_dir.resolve()}:/ckpt:ro", "-v", f"{work_dir.resolve()}:/chk:ro",
               "-v", f"{(work_dir.parent / 'runs' / 'deps').resolve()}:/deps:ro", "-e", "PYTHONPATH=/deps",
               docker_image, "python", "/chk/load_check.py", f"/ckpt/{rel}"]
    else:
        cmd = [python or sys.executable, "-I", str(script), str(snapshot)]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "load check timed out after 300s"}
    line = next((l for l in reversed(p.stdout.splitlines()) if l.startswith("CRISISGRID_LOAD_CHECK ")), None)
    if not line:
        return {"ok": False, "error": (p.stderr or p.stdout)[-500:] or f"exit status {p.returncode}"}
    return json.loads(line.split(" ", 1)[1])


def _link(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if dst.stat().st_size == src.stat().st_size:
            return
        dst.unlink()
    try:
        os.link(src, dst)  # hardlink: no extra disk, and visible inside a read-only Docker mount
    except OSError:
        shutil.copy2(src, dst)


def connect(entry: dict, snapshot: Path, cache_dir: Path, repo_path: Path, run_template: str,
            uses_hub_assets: bool, use_docker: bool) -> dict[str, Any]:
    """Make the code find the recovered checkpoint, without editing the code.

    - CLI flag on the entrypoint's command line -> inject the checkpoint path as that flag's value
    - hardcoded relative path                   -> place the files at that path inside the repo
    - Hub ID loaded by the code                 -> point HF_HUB_CACHE at the pinned cache (offline)
    """
    env, overrides, placed, unmapped = {}, {}, [], []

    def in_run(p: Path) -> str:
        return f"/ckpt/{p.relative_to(cache_dir).as_posix()}" if use_docker else str(p.absolute())

    weights = [snapshot / w for w in entry.get("weight_files", []) if not w.endswith(".json")]

    if entry["role"] == "pinned_hub_reference":
        env["HF_HUB_CACHE"] = "/ckpt" if use_docker else str(cache_dir.absolute())
        if use_docker or not uses_hub_assets:
            env["HF_HUB_OFFLINE"] = env["TRANSFORMERS_OFFLINE"] = "1"
            placed.append({"how": "hub_cache", "detail": f"{entry['requested_id']} resolves offline to "
                                                          f"commit {entry['sha'][:7]}"})
        else:
            placed.append({"how": "hub_cache", "detail": "cache pre-filled at the pinned commit; offline mode "
                                                          "not enforced because the repo also downloads other "
                                                          "Hub assets at runtime"})
        return {"env": env, "overrides": overrides, "placed": placed, "unmapped": unmapped}

    done: set[str] = set()
    for t in entry["targets"]:
        ref = f"{t['file']}:{t['line']}"
        key = norm(t["flag"]) if t.get("flag") else None
        wants_dir = t["expects"] in ("dir_or_hub", "hub")
        if key and "{" + key + "}" in run_template:
            if wants_dir:
                overrides[key] = in_run(snapshot)
            elif len(weights) == 1:
                overrides[key] = in_run(weights[0])
            else:
                unmapped.append({"ref": ref, "reason": f"--{t['flag']} expects one file; checkpoint has {len(weights)}"})
                continue
            placed.append({"ref": ref, "how": "flag", "detail": f"--{t['flag']} {overrides[key]}"})
            continue
        value = t.get("value")
        if not value:
            unmapped.append({"ref": ref, "reason": f"path comes from --{t.get('flag')} which is not on the "
                                                   "entrypoint's command line; pass the checkpoint path manually"})
            continue
        if value.startswith("/"):
            unmapped.append({"ref": ref, "reason": f"hardcoded absolute path {value} lies outside the repository; "
                                                   f"point it at {snapshot} (e.g. via Auto-Heal)"})
            continue
        if value in done:
            continue
        dest = (repo_path / value).resolve()
        if repo_path.resolve() not in dest.parents:
            unmapped.append({"ref": ref, "reason": f"path {value} escapes the repository"})
            continue
        if wants_dir:
            for name in entry["files"]:
                _link((snapshot / name).resolve(), dest / name)
        else:
            exts = {".bin", ".pt", ".pth"}
            ok = len(weights) == 1 and (weights[0].suffix == dest.suffix or
                                        (weights[0].suffix in exts and dest.suffix in exts))
            if not ok:
                unmapped.append({"ref": ref, "reason": f"{t['loader']} expects one {dest.suffix or 'file'}; "
                                                       f"checkpoint provides {[w.name for w in weights]}"})
                continue
            _link(weights[0].resolve(), dest)
        done.add(value)
        placed.append({"ref": ref, "how": "placed", "detail": f"{value} <- {entry['repo_id']}@{entry['sha'][:7]}"})
    return {"env": env, "overrides": overrides, "placed": placed, "unmapped": unmapped}


def prepare(plan: dict | None, project_dir: Path, repo_path: Path, run_template: str, python: str | None,
            use_docker: bool, uses_hub_assets: bool = False,
            on_event: Callable[[str, str], None] = lambda *a: None) -> dict[str, Any]:
    """Download -> verify integrity -> load-check -> connect, for every selected checkpoint."""
    record: dict[str, Any] = {"ok": True, "error": None, "entries": [], "env": {}, "overrides": {}, "mount": None}
    if not plan or plan.get("status") not in ("identified", "pinned") or not plan.get("selected"):
        return record
    on_event("Model", "running")
    ckpt_dir = project_dir / "checkpoints"
    cache = ckpt_dir / "hf_cache"
    try:
        for e in plan["selected"]:
            dl = download(e, cache)
            snap = Path(dl["path"])
            rec = {k: e.get(k) for k in ("repo_id", "requested_id", "sha", "role", "confidence", "size_bytes")}
            rec.update(path=dl["path"], download_seconds=dl["seconds"], integrity=dl["integrity"],
                       downloaded_at=time.strftime("%Y-%m-%d %H:%M:%S"))
            record["entries"].append(rec)
            if not dl["integrity"]["ok"]:
                bad = [f["name"] for f in dl["integrity"]["files"] if f["ok"] is False]
                raise RuntimeError(f"integrity check failed for {e['repo_id']}: {bad} do not match the Hub's hashes")
            rec["load_check"] = verify_loadable(snap, ckpt_dir, python, use_docker, cache)
            if rec["load_check"].get("ok") is False:
                raise RuntimeError(f"{e['repo_id']} failed to load: {rec['load_check'].get('error')}")
            conn = connect(e, snap, cache, repo_path, run_template, uses_hub_assets, use_docker)
            rec.update(placed=conn["placed"], unmapped=conn["unmapped"])
            record["env"].update(conn["env"])
            record["overrides"].update(conn["overrides"])
        record["mount"] = str(cache.resolve()) if use_docker else None
        on_event("Model", "done")
    except Exception as ex:
        record.update(ok=False, error=str(ex)[:600])
        on_event("Model", "failed")
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    (ckpt_dir / "manifest.json").write_text(json.dumps(record, indent=2, default=str))
    return record
