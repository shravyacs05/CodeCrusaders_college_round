"""Missing-weights detection, checkpoint identification and verification (offline; Hub is faked)."""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import checkpoint_manager as cm
from app.services import report
from app.services.paper_analyzer import extract_model_references
from app.services.repo_scanner import scan_repo, scan_weights
from app.services.runner import render_command

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "demo_repo_checkpoint"
SST2 = "distilbert/distilbert-base-uncased-finetuned-sst-2-english"


def _info(repo_id, arch, files=None, datasets=(), sha="a" * 40):
    files = files or [{"name": "config.json", "size": 10, "blob_id": "b" * 40, "sha256": None},
                      {"name": "model.safetensors", "size": 100, "blob_id": "c" * 40, "sha256": "d" * 64},
                      {"name": "pytorch_model.bin", "size": 100, "blob_id": "e" * 40, "sha256": "f" * 64},
                      {"name": "onnx/model.onnx", "size": 100, "blob_id": "g" * 40, "sha256": "h" * 64}]
    return {"id": repo_id, "sha": sha, "pipeline_tag": "text-classification", "library": "transformers",
            "gated": False, "private": False, "architectures": [arch], "model_type": "x",
            "datasets": list(datasets), "license": "apache-2.0", "eval_results": [], "last_modified": None,
            "files": files}


class FakeHub:
    def __init__(self, models):
        self.models = {k.lower(): v for k, v in models.items()}
        self.calls = []

    def model_info(self, repo_id, revision=None):
        self.calls.append(repo_id)
        return self.models.get(repo_id.lower())


def _missing_weights(head="SequenceClassification", doc_refs=()):
    return {"status": "missing", "hub_refs": [], "external_links": [], "doc_refs": list(doc_refs),
            "missing": [{"file": "eval.py", "line": 3, "loader": f"AutoModelFor{head}.from_pretrained",
                         "value": "checkpoints/m", "flag": "checkpoint", "status": "missing",
                         "expects": "dir_or_hub", "head": head, "expr": "args.checkpoint", "aux": False}]}


def _readme(repo_id, line=5):
    return {"repo_id": repo_id, "revision": None, "source": "readme", "kind": "url", "file": "README.md",
            "line": line, "quote": ""}


# ---- detection ----
def test_fixture_repo_detects_missing_checkpoint_and_readme_link():
    scan = scan_repo(FIXTURE)
    w = scan["weights"]
    assert w["status"] == "missing"
    (m,) = w["missing"]
    assert m["value"] == "checkpoints/distilbert-sst2" and m["flag"] == "checkpoint"
    assert m["head"] == "SequenceClassification"
    assert [d["repo_id"] for d in w["doc_refs"]] == [SST2]
    assert any("Missing trained weights" in x for x in scan["warnings"])


def test_scanner_classifies_produced_hub_lfs_and_flag(tmp_path):
    (tmp_path / "train.py").write_text(
        "import argparse, torch\n"
        "from transformers import AutoModel, AutoTokenizer\n"
        "p = argparse.ArgumentParser(); p.add_argument('--resume', type=str)\n"
        "args = p.parse_args()\n"
        "tok = AutoTokenizer.from_pretrained('bert-base-uncased')\n"
        "base = AutoModel.from_pretrained('bert-base-uncased')\n"
        "loss.backward()\n"
        "torch.save(base.state_dict(), 'outputs/best.pt')\n"
        "sd = torch.load('outputs/best.pt')\n"
        "lfs = torch.load('weights/real.pt')\n"
        "r = torch.load(args.resume)\n")
    (tmp_path / "weights").mkdir()
    (tmp_path / "weights" / "real.pt").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:x\nsize 9\n")
    w = scan_weights(tmp_path)
    by_line = {r["line"]: r for r in w["references"]}
    assert by_line[5]["status"] == "hub" and by_line[5]["aux"]
    assert by_line[6]["status"] == "hub" and by_line[6]["in_training_code"]
    assert by_line[9]["status"] == "produced"          # written by torch.save above
    assert by_line[10]["status"] == "missing" and by_line[10]["lfs_pointer"]
    assert by_line[11]["status"] == "flag" and by_line[11]["flag"] == "resume"
    assert w["status"] == "missing"
    assert w["local_weight_files"][0]["lfs_pointer"]


def test_paper_model_references_filters_noise():
    refs = extract_model_references([
        f"Our checkpoint is released at https://huggingface.co/\n{SST2} on the Hugging Face hub.",
        "We use a train/test split on SST-2/MNLI; checkpoints for bert-base/large are released. "
        "See https://huggingface.co/datasets/glue too."])
    ids = [(h["repo_id"], h["kind"], h["verified"]) for h in refs["hub_ids"]]
    assert ids == [(SST2, "url", True)]


# ---- identification ----
def test_identifies_checkpoint_from_paper_and_readme():
    hub = FakeHub({SST2: _info(SST2, "DistilBertForSequenceClassification", datasets=["sst2"])})
    paper = {"hub_ids": [{"repo_id": SST2, "revision": None, "kind": "url", "page": 1, "quote": "q", "verified": True}]}
    plan = cm.plan_checkpoint(_missing_weights(doc_refs=[_readme(SST2)]), paper, "accuracy on SST-2", hub=hub)
    assert plan["status"] == "identified"
    (sel,) = plan["selected"]
    assert sel["sha"] == "a" * 40 and sel["confidence"] == "high"
    assert sel["files"] == ["config.json", "model.safetensors"]   # one weight format, no onnx
    assert sel["task_match"] == ["sst2"]
    assert cm.blocking_reason(plan) is None


def test_rejects_base_model_with_wrong_head():
    hub = FakeHub({"google-bert/bert-base-uncased": _info("google-bert/bert-base-uncased", "BertForMaskedLM")})
    plan = cm.plan_checkpoint(_missing_weights(doc_refs=[_readme("google-bert/bert-base-uncased")]), hub=hub)
    assert plan["status"] == "not_found" and not plan["selected"]
    assert "head mismatch" in plan["candidates"][0]["rejected"]
    assert "not substitute" in cm.blocking_reason(plan)


def test_ambiguous_candidates_are_not_guessed():
    hub = FakeHub({"a/one": _info("a/one", "XForSequenceClassification"),
                   "b/two": _info("b/two", "YForSequenceClassification")})
    plan = cm.plan_checkpoint(_missing_weights(doc_refs=[_readme("a/one", 3), _readme("b/two", 4)]), hub=hub)
    assert plan["status"] == "ambiguous" and not plan["selected"]
    assert cm.blocking_reason(plan)


def test_nonexistent_and_mention_only_candidates():
    hub = FakeHub({"real/model": _info("real/model", "XForSequenceClassification")})
    paper = {"hub_ids": [{"repo_id": "real/model", "revision": None, "kind": "mention", "page": 2,
                          "quote": "q", "verified": True}]}
    plan = cm.plan_checkpoint(_missing_weights(doc_refs=[_readme("ghost/model")]), paper, hub=hub)
    rej = {c.get("repo_id") or c["requested_id"]: c["rejected"] for c in plan["candidates"]}
    assert "does not exist" in rej["ghost/model"] and "loose mention" in rej["real/model"]
    assert plan["status"] == "candidate_unconfirmed" and not plan["selected"]


def test_training_base_model_is_pinned_not_used_as_checkpoint():
    weights = _missing_weights()
    weights["hub_refs"] = [{"file": "train.py", "line": 9, "loader": "AutoModelForSequenceClassification.from_pretrained",
                            "value": "bert-base-uncased", "flag": None, "status": "hub", "expects": "dir_or_hub",
                            "head": "SequenceClassification", "expr": "'bert-base-uncased'", "aux": False,
                            "in_training_code": True}]
    hub = FakeHub({"bert-base-uncased": _info("google-bert/bert-base-uncased", "BertForSequenceClassification")})
    plan = cm.plan_checkpoint(weights, hub=hub)
    assert plan["status"] == "not_found"
    assert [s["role"] for s in plan["selected"]] == ["pinned_hub_reference"]
    assert "fine-tunes" in plan["candidates"][0]["role_note"]


def test_nothing_to_do_when_weights_present():
    hub = FakeHub({})
    assert cm.plan_checkpoint({"status": "present"}, hub=hub)["status"] == "present"
    assert hub.calls == []


# ---- download-side helpers ----
def test_integrity_uses_lfs_sha256_and_git_blob_sha1(tmp_path):
    (tmp_path / "config.json").write_text("hello\n")
    (tmp_path / "model.safetensors").write_bytes(b"\x00" * 64)
    meta = {"config.json": {"sha256": None, "blob_id": "ce013625030ba8dba906f756967f9e9ca394464a"},  # git hash-object
            "model.safetensors": {"sha256": hashlib.sha256(b"\x00" * 64).hexdigest(), "blob_id": None}}
    ok = cm.verify_integrity(tmp_path, meta)
    assert ok["ok"] and ok["n_verified"] == 2
    meta["model.safetensors"]["sha256"] = "0" * 64
    bad = cm.verify_integrity(tmp_path, meta)
    assert not bad["ok"] and [f["name"] for f in bad["files"] if f["ok"] is False] == ["model.safetensors"]


def _entry(**kw):
    e = {"role": "recovered_missing", "repo_id": "o/m", "requested_id": "o/m", "sha": "a" * 40,
         "files": ["config.json", "model.safetensors"], "weight_files": ["model.safetensors"],
         "targets": [{"file": "eval.py", "line": 3, "loader": "X.from_pretrained", "value": "checkpoints/m",
                      "flag": "checkpoint", "expects": "dir_or_hub"}]}
    e.update(kw)
    return e


def test_connect_injects_flag_or_places_files(tmp_path):
    cache = tmp_path / "cache"
    snap = cache / "models--o--m" / "snapshots" / ("a" * 40)
    snap.mkdir(parents=True)
    (snap / "config.json").write_text("{}")
    (snap / "model.safetensors").write_bytes(b"w")
    repo = tmp_path / "repo"
    repo.mkdir()
    via_flag = cm.connect(_entry(), snap, cache, repo, "python eval.py --checkpoint {checkpoint} --out {out}", False, False)
    assert via_flag["overrides"] == {"checkpoint": str(snap.absolute())}
    placed = cm.connect(_entry(), snap, cache, repo, "python eval.py --out {out}", False, False)
    assert (repo / "checkpoints" / "m" / "model.safetensors").read_bytes() == b"w"
    assert placed["placed"][0]["how"] == "placed"
    escape = _entry(targets=[{**_entry()["targets"][0], "flag": None, "value": "../outside"}])
    assert cm.connect(escape, snap, cache, repo, "", False, False)["unmapped"]
    pinned = cm.connect(_entry(role="pinned_hub_reference"), snap, cache, repo, "", False, False)
    assert pinned["env"]["HF_HUB_OFFLINE"] == "1" and pinned["env"]["HF_HUB_CACHE"] == str(cache.absolute())


def test_render_command_overrides():
    spec = {"params": {"batch_size": {"value": 32}}}
    cmd = render_command("python e.py --checkpoint {checkpoint} --batch_size {batch_size} --out {out}",
                         spec, 0, "m.json", "py", overrides={"checkpoint": "/ck/snap"})
    assert cmd == ["py", "e.py", "--checkpoint", "/ck/snap", "--batch_size", "32", "--out", "m.json"]


def test_report_renders_checkpoint_section():
    hub = FakeHub({SST2: _info(SST2, "DistilBertForSequenceClassification")})
    plan = cm.plan_checkpoint(_missing_weights(doc_refs=[_readme(SST2)]), hub=hub)
    record = {"ok": True, "error": None, "entries": [{
        "repo_id": SST2, "sha": "a" * 40, "integrity": {"ok": True, "n_files": 2, "n_verified": 2, "files": [
            {"name": "config.json", "ok": True, "algo": "git-sha1"}, {"name": "model.safetensors", "ok": True, "algo": "sha256"}]},
        "load_check": {"ok": True, "class": "DistilBertForSequenceClassification", "n_params": 66955010,
                       "library": "transformers 4", "id2label": {"0": "NEGATIVE", "1": "POSITIVE"}},
        "placed": [{"ref": "eval.py:3", "how": "flag", "detail": "--checkpoint /x"}], "unmapped": []}]}
    view = report.checkpoint_view(plan, record)
    assert view["verdict"] == "RECOVERED & VERIFIED"
    html = report.render_report({"project_name": "p", "claim": {"metric": "accuracy", "value": 91.3}, "params": {},
                                 "warnings": [], "findings": [], "runs": [], "verification": {"status": "BLOCKED"},
                                 "checkpoint": view, "ledger": report.evidence_ledger([], None, view)})
    assert "RECOVERED &amp; VERIFIED" in html and "2/2 files match" in html and "67.0M parameters" in html
    ledger = report.evidence_ledger([], None, view)
    assert any(r["item"].startswith("Integrity: 2/2") for r in ledger)
    assert report.checkpoint_view(cm.plan_checkpoint(_missing_weights(), hub=FakeHub({})), None)["verdict"] \
        == "NOT FOUND (no substitute used)"
