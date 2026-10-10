import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.paper_analyzer import verify_quote, extract_fields
from app.services.reconciler import normalize_name, reconcile
from app.services.repo_scanner import scan_repo, _accept
from app.services.spec_builder import editable_params, build_spec
from app.services.verifier import verify
from app.services.versioning import diff_specs, make_child, compare


def test_quote_verifier():
    assert verify_quote("uses  100 trees", "The model\nuses 100 trees here")
    assert not verify_quote("uses 500 trees", "The model uses 100 trees here")


def test_normalization():
    assert normalize_name("LR") == "learning_rate"
    assert normalize_name("random_state") == "seed"


def test_reconciler_statuses():
    paper = {"n_estimators": {"value": 100, "page": 1, "quote": "q"},
             "seed": {"value": None}, "test_size": {"value": 0.2, "page": 1, "quote": "q"}}
    code = {"n_estimators": {"value": 50, "file": "t.py", "line": 1},
            "seed": {"value": 0, "file": "t.py", "line": 2},
            "test_size": {"value": 0.2, "file": "t.py", "line": 3}}
    st = {f["param"]: f["status"] for f in reconcile(paper, code)}
    assert st == {"n_estimators": "MISMATCH", "seed": "MISSING", "test_size": "MATCH"}


def test_verifier_math():
    r = verify(96.0, [0.96, 0.96, 0.96], 1.0)
    assert r["status"] == "REPRODUCED"
    assert verify(90.0, [0.96, 0.97], 1.0)["status"] == "NOT_REPRODUCED"
    assert verify(None, [0.9])["status"] == "BLOCKED"
    assert verify(95.0, [])["status"] == "BLOCKED"


def test_versioning():
    spec = {"params": {"a": {"value": 1}, "b": {"value": 2}}}
    child = make_child(spec, {"a": 5})
    assert spec["params"]["a"]["value"] == 1  # parent immutable
    d = diff_specs(spec, child)
    assert d == [{"param": "a", "from": 1, "to": 5}]
    assert compare(spec, child, None, None)["single_factor"] is True


# ---- LLM extraction path (LLM call stubbed in tests only) ----
def test_llm_extraction_rejects_invented_quote(monkeypatch):
    from app.services import llm, paper_analyzer as pa

    pages = ["We train with 100 trees and test_size of 0.2.", "Accuracy of 96.5% reported."]
    fake = {"claim": {"metric": "accuracy", "value": 96.5, "page": 2, "quote": "Accuracy of 96.5% reported"},
            "params": {"n_estimators": {"value": 100, "page": 1, "quote": "train with 100 trees"},
                       "learning_rate": {"value": 0.01, "page": 1, "quote": "learning rate of 0.01"},
                       "seed": {"value": None, "page": None, "quote": None}}}
    monkeypatch.setattr(llm, "complete_json", lambda s, u: fake)
    monkeypatch.setattr(llm, "enabled", lambda: True)
    fields = pa.extract_fields_llm(pages)
    flags = pa.validate(fields, pages)
    assert fields["n_estimators"]["value"] == 100 and fields["n_estimators"]["verified"]
    assert flags == {"learning_rate": "unverified_extraction"}   # invented quote
    assert fields["learning_rate"]["value"] is None               # not trusted
    assert fields["seed"]["source"] == "missing"


def test_llm_failure_falls_back_to_regex(monkeypatch, tmp_path):
    import pymupdf  # noqa
    from app.services import llm, paper_analyzer as pa

    monkeypatch.setattr(llm, "enabled", lambda: True)
    def boom(s, u): raise llm.LLMError("down")
    monkeypatch.setattr(llm, "complete_json", boom)
    r = pa.analyze_paper(str(Path(__file__).resolve().parents[2] / "fixtures" / "demo_paper.pdf"))
    assert r["method"] == "regex" and "LLM failed" in r["note"]
    assert r["fields"]["n_estimators"]["value"] == 100


def test_render_command_omits_missing_and_uses_python():
    from app.services.runner import render_command
    spec = {"params": {"n_estimators": {"value": 100}, "seed": {"value": None}}}
    cmd = render_command("python t.py --n_estimators {n_estimators} --seed {seed} --out {out}",
                         spec, 3, "o.json", "/x/python")
    assert cmd == ["/x/python", "t.py", "--n_estimators", "100", "--seed", "3", "--out", "o.json"]


def test_scanner_all_sources(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "main.py").write_text("""import argparse, random
TEST_SIZE = 0.3
random.seed(7)
parser = argparse.ArgumentParser()
parser.add_argument("--num_epochs", default=10)
parser.add_argument("--out", default="out.json")
args = parser.parse_args()
model = Model(n_estimators=100, random_state=3)
""")
    (repo / "config.yaml").write_text("batch_size: 64\n")
    r = scan_repo(repo)
    P = r["params"]
    assert P["epochs"]["flag"] == "num_epochs"                       # alias normalized
    assert P["n_estimators"]["kind"] == "constructor" and not P["n_estimators"]["injectable"]
    assert P["batch_size"]["kind"] == "config" and P["batch_size"]["file"] == "config.yaml"
    assert P["test_size"]["value"] == 0.3
    # model-specific random_state=3 outranks the global random.seed(7); the conflict is recorded
    assert P["seed"]["kind"] == "constructor" and P["seed"]["value"] == 3
    assert [a["value"] for a in P["seed"]["alternatives"]] == [7]
    assert any("conflicting" in w and "'seed'" in w for w in r["warnings"])


def test_scanner_type_filtering_accept():
    assert _accept("learning_rate", 0.01)
    assert not _accept("learning_rate", "constant")
    assert _accept("optimizer", "adam")
    assert not _accept("optimizer", 123)
    assert _accept("shuffle", True)
    assert not _accept("shuffle", 1)


def test_scanner_config_flags_omitted_from_params(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "main.py").write_text("""import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--config", default="config.yaml")
parser.add_argument("--metrics_path", default="metrics.json")
parser.add_argument("--lr", default=0.05)
""")
    r = scan_repo(repo)
    assert "config" not in r["params"]
    assert "metrics_path" not in r["params"]
    assert "learning_rate" in r["params"]
    assert r["run_template"] == "python main.py --lr {learning_rate} --metrics_path {out}"


def test_scanner_no_seed_warning(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "main.py").write_text("""import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--out", default="out.json")
""")
    r = scan_repo(repo)
    assert any("No --seed argparse flag" in w for w in r["warnings"])


def test_spec_builder_editable_params_and_validation():
    paper = {"fields": {"_claim": {"metric": "accuracy", "value": 95.0, "page": 1, "quote": "q"}}}
    scan = {
        "params": {
            "learning_rate": {"value": 0.01, "file": "main.py", "line": 10, "injectable": True, "kind": "argparse"},
            "batch_size": {"value": 64, "file": "config.yaml", "line": 1, "injectable": False, "kind": "config"},
            "test_size": {"value": 0.2, "file": "main.py", "line": 2, "injectable": False, "kind": "constant"},
        },
        "run_template": "python main.py --lr {learning_rate} --out {out}",
        "blocked": None,
        "warnings": [],
    }
    spec = build_spec(paper, scan)
    assert editable_params(spec, "Training") == ["learning_rate"]
    assert editable_params(spec, "Dataset") == []


def test_paper_analyzer_claim_and_metric_patterns():
    pages = ["We train with learning_rate of 0.01 and batch_size of 32.",
             "Our model reaches an F1 score of 95.0% on the test set."]
    fields = extract_fields(pages)
    assert fields["_claim"]["metric"] == "f1"
    assert fields["_claim"]["value"] == 95.0
    assert fields["learning_rate"]["value"] == 0.01
    assert fields["batch_size"]["value"] == 32


def test_verifier_scaling_and_f1():
    # Published is 95.0% and runs produce fractions ~0.97
    res = verify(95.0, [0.9778, 0.9778, 0.9778], tolerance_pp=1.0, scale=100.0)
    assert res["status"] == "NOT_REPRODUCED"
    assert round(res["reproduced_mean"], 2) == 97.78
    assert round(res["diff_pp"], 2) == 2.78


def test_compare_metric_agnostic_delta():
    spec_a = {"params": {"lr": {"value": 0.01}}}
    spec_b = {"params": {"lr": {"value": 0.001}}}
    comp = compare(spec_a, spec_b, {"mean": 95.0}, {"mean": 97.44})
    assert comp["metric_delta_pp"] == 2.44
    assert comp["single_factor"] is True


def test_reconciler_extended_aliases():
    assert normalize_name("num_epochs") == "epochs"
    assert normalize_name("bs") == "batch_size"
    assert normalize_name("eta") == "learning_rate"
    assert normalize_name("wd") == "weight_decay"


def test_leakage_detector():
    import ast
    from app.services.leakage_detector import detect_leakage

    # Leaky code: scaler fit before split
    code_leaky = """
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
X_scaled = StandardScaler().fit_transform(X)
X_tr, X_te, y_tr, y_te = train_test_split(X_scaled, y)
"""
    leaks = detect_leakage(ast.parse(code_leaky), "leaky.py")
    assert len(leaks) >= 1
    assert "fit" in leaks[0]["message"] and "before" in leaks[0]["message"]

    # Clean code: split first, then fit on train
    code_clean = """
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
X_tr, X_te, y_tr, y_te = train_test_split(X, y)
sc = StandardScaler().fit(X_tr)
"""
    assert len(detect_leakage(ast.parse(code_clean), "clean.py")) == 0


def test_finding_explanations():
    paper = {"learning_rate": {"value": 0.01, "page": 1, "quote": "lr 0.01"}}
    code = {"learning_rate": {"value": 0.001, "file": "train.py", "line": 5}}
    findings = reconcile(paper, code)
    assert len(findings) == 1
    assert "explanation" in findings[0]
    assert "Paper specifies learning_rate=0.01" in findings[0]["explanation"]


def test_report_pdf_generation(tmp_path):
    from app.services import report
    out_pdf = tmp_path / "test_report.pdf"
    ctx = {
        "project_name": "Test Project",
        "is_demo": True,
        "claim": {"metric": "accuracy", "value": 96.5, "percent": True, "ref": "p.1: q"},
        "params": {"epochs": {"value": 10, "source": "code", "ref": "main.py:1"}},
        "findings": [{"param": "epochs", "paper_value": 20, "code_value": 10, "status": "MISMATCH", "severity": "high"}],
        "verification": {"status": "REPRODUCED", "published": 96.5, "reproduced_mean": 96.2, "diff_pp": -0.3, "std": 0.1, "n": 3, "tolerance_pp": 1.0},
        "ledger": [{"item": "epochs: MISMATCH", "evidence": "paper vs code", "type": "paper+code"}],
    }
    report.render_pdf(ctx, out_pdf)
    assert out_pdf.exists() and out_pdf.stat().st_size > 0


def test_checklist_auditor():
    from app.services.checklist_auditor import audit_checklist

    proj = {
        "repo_url": "https://github.com/example/repo",
        "scan": {"entrypoint": "train.py", "warnings": []},
        "paper": {"fields": {"_claim": {"verified": True, "value": 90.0, "metric": "accuracy", "page": 1}}},
        "experiments": {"e1": {"id": "e1", "spec": {"params": {}}}},
        "runs": {"e1": {"results": [{"status": "done", "manifest": {"isolation": "reduced isolation"}}, {"status": "done"}]}}
    }
    res = audit_checklist(proj, "e1")
    assert res["score_pct"] > 60
    assert len(res["checklist"]) >= 7
    assert res["stats"]["passed"] >= 4


def test_auto_healer():
    from app.services.auto_healer import diagnose_failure

    proj = {
        "experiments": {"e1": {"id": "e1", "spec": {"params": {}}}},
        "runs": {"e1": {"setup_log": "ERROR: No matching distribution found for torch==1.12.1+cpu", "results": []}}
    }
    diag = diagnose_failure(proj, "e1")
    assert diag["can_heal"] is True
    assert diag["category"] == "PLATFORM_WHEEL_LOCK_IN"


def test_notebook_scanner(tmp_path):
    import json
    from app.services.repo_scanner import scan_notebooks

    nb_path = tmp_path / "experiment.ipynb"
    nb_content = {
        "cells": [
            {
                "cell_type": "code",
                "source": [
                    "import random\n",
                    "random.seed(42)\n",
                    "learning_rate = 0.005\n"
                ]
            }
        ]
    }
    nb_path.write_text(json.dumps(nb_content))
    cands = scan_notebooks(tmp_path)
    assert len(cands) >= 1
    assert any(c["name"] in ("learning_rate", "seed") for c in cands)

