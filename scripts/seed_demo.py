"""Seed script: pre-populate CrisisGrid with demo reproduction projects.

Creates:
1. Demo project 1: Random Forest on Breast Cancer (demo_repo + demo_paper.pdf)
2. Demo project 2: SGD Classifier + Config + F1 (demo_repo_config + demo_paper_config.pdf)

Includes analysis, multi-seed runs, verification verdict, and reports.
"""
import json
import shutil
import sys
import uuid
from pathlib import Path

# Add backend to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import DATA_DIR, TOLERANCE_PP
from app.services import (paper_analyzer, reconciler, repo_scanner, report,
                          spec_builder, verifier, versioning)


def seed_project(name: str, repo_dir: Path, paper_file: Path,
                 seed_metrics: list[dict], true_claim_val: float):
    pid = uuid.uuid4().hex[:8]
    pdir = DATA_DIR / pid
    pdir.mkdir(parents=True, exist_ok=True)

    dest_paper = pdir / "paper.pdf"
    shutil.copyfile(paper_file, dest_paper)

    dest_repo = pdir / "repo"
    shutil.copytree(repo_dir, dest_repo)

    # 1. Analyze
    paper = paper_analyzer.analyze_paper(str(dest_paper))
    scan = repo_scanner.scan_repo(dest_repo)
    findings = reconciler.reconcile(paper["fields"], scan["params"], enrich_llm=False)
    spec = spec_builder.build_spec(paper, scan)

    eid = uuid.uuid4().hex[:8]
    exp = {
        "id": eid,
        "parent_id": None,
        "version": 1,
        "spec": spec,
        "diff_from_parent": [],
        "config_hash": versioning.config_hash(spec),
    }

    # 2. Results
    results = []
    vals = []
    for s, m in enumerate(seed_metrics):
        val = next(v for k, v in m.items() if "loss" not in k.lower())
        vals.append(val * 100.0 if val <= 1.0 else val)
        results.append({
            "seed": s,
            "status": "done",
            "metrics": m,
            "log": str(pdir / f"log_seed{s}.txt"),
            "manifest": {
                "experiment_id": eid,
                "parent_id": None,
                "repo_commit": "local-copy",
                "config_hash": exp["config_hash"],
                "seed": s,
                "isolation": "reduced isolation",
                "python": "3.11.0",
                "command": f"python train.py --seed {s}",
                "started_at": 1728560000.0,
                "ended_at": 1728560002.0,
                "exit_status": 0,
            }
        })

    # Verification
    ver = verifier.verify(spec["claim"]["value"], vals, TOLERANCE_PP, scale=1.0)

    proj_data = {
        "id": pid,
        "name": name,
        "repo_url": str(repo_dir),
        "paper_path": str(dest_paper),
        "status": "analyzed",
        "is_demo": True,
        "commit": "demo-seed",
        "paper": paper,
        "scan": scan,
        "findings": findings,
        "experiments": {eid: exp},
        "runs": {
            eid: {
                "status": {
                    "nodes": {n: "done" for n in spec_builder.ORDER},
                    "seeds_done": len(results),
                    "seeds_total": len(results),
                    "state": "finished",
                },
                "results": results,
            }
        }
    }

    # Write project.json
    (pdir / "project.json").write_text(json.dumps(proj_data, indent=2, default=str))

    # Render report
    html = report.render_report({
        "project_name": name,
        "is_demo": True,
        "claim": spec["claim"],
        "params": spec["params"],
        "warnings": spec.get("warnings", []),
        "findings": findings,
        "runs": results,
        "verification": ver,
        "ledger": report.evidence_ledger(findings, ver),
    })
    (pdir / "report.html").write_text(html)
    print(f"Seeded '{name}' -> project {pid} ({ver['status']})")
    return pid


def main():
    fixtures = ROOT / "fixtures"
    p1 = seed_project(
        "Demo 1: Random Forest on Breast Cancer (Accuracy)",
        fixtures / "demo_repo",
        fixtures / "demo_paper.pdf",
        [{"accuracy": 0.9649}, {"accuracy": 0.9649}, {"accuracy": 0.9474}],
        96.5
    )
    p2 = seed_project(
        "Demo 2: SGD Classifier + Config (F1 Score)",
        fixtures / "demo_repo_config",
        fixtures / "demo_paper_config.pdf",
        [{"f1_score": 0.9778}, {"f1_score": 0.9778}, {"f1_score": 0.9778}],
        95.0
    )
    print("Seeding complete! Start the backend and open http://localhost:8000 or http://localhost:5173")


if __name__ == "__main__":
    main()
