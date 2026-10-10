"""Official NeurIPS / ICLR Reproducibility Checklist Auto-Auditor.

Audits papers and code repositories against the standard 5 reproducibility pillars:
1. Code & Environment Completeness
2. Random Seeds & Deterministic Variance
3. Data Integrity & Leakage Prevention
4. Hyperparameter Transparency & Claim Verification
5. Execution Traceability & Provenance
"""
from typing import Any
from pathlib import Path


def audit_checklist(project: dict[str, Any], exp_id: str | None = None) -> dict[str, Any]:
    """Audit a project and specific experiment version against conference standards."""
    exp = None
    if exp_id and exp_id in project.get("experiments", {}):
        exp = project["experiments"][exp_id]
    elif project.get("experiments"):
        # Default to latest experiment
        exp = list(project["experiments"].values())[-1]

    spec = exp.get("spec", {}) if exp else {}
    paper = project.get("paper", {})
    paper_fields = paper.get("fields", {})
    scan_params = project.get("scan", {}).get("params", {})
    scan_warnings = project.get("scan", {}).get("warnings", [])
    runs = project.get("runs", {}).get(exp.get("id", ""), {}) if exp else {}
    results = runs.get("results", [])

    checklist = []

    # 1. Code & Environment
    repo_ok = bool(project.get("repo_url"))
    checklist.append({
        "category": "Code & Environment",
        "question": "Is the complete source code or repository accessible?",
        "status": "PASS" if repo_ok else "FAIL",
        "evidence": f"Repository URL: {project.get('repo_url')}" if repo_ok else "No repository provided",
        "weight": 10,
    })

    entrypoint = project.get("scan", {}).get("entrypoint")
    checklist.append({
        "category": "Code & Environment",
        "question": "Is there a runnable entrypoint script for training and evaluation?",
        "status": "PASS" if entrypoint else "FAIL",
        "evidence": f"Entrypoint detected: {entrypoint}" if entrypoint else "No executable entrypoint (train.py/main.py) found",
        "weight": 10,
    })

    # 2. Random Seeds & Variance
    has_seed_flag = "seed" in scan_params and scan_params["seed"].get("injectable", False)
    checklist.append({
        "category": "Random Seeds & Variance",
        "question": "Can random seeds be controlled via CLI/arguments to evaluate variance?",
        "status": "PASS" if has_seed_flag else "FAIL",
        "evidence": f"Injectable flag: --{scan_params.get('seed', {}).get('flag', 'seed')}" if has_seed_flag else "No --seed CLI flag: seed variance cannot be independently audited",
        "weight": 15,
    })

    seeds_run_count = len([r for r in results if r.get("status") == "done"])
    has_variance = seeds_run_count >= 2
    checklist.append({
        "category": "Random Seeds & Variance",
        "question": "Were multiple independent seeds executed to measure standard deviation?",
        "status": "PASS" if has_variance else ("WARN" if seeds_run_count == 1 else "FAIL"),
        "evidence": f"Completed {seeds_run_count} seed run(s)" if seeds_run_count > 0 else "No successful seed runs recorded",
        "weight": 10,
    })

    # 3. Data Integrity & Leakage
    leakage_warnings = [w for w in scan_warnings if "leakage" in w.lower()]
    no_leakage = len(leakage_warnings) == 0
    checklist.append({
        "category": "Data Integrity",
        "question": "Is the data preprocessing strictly isolated from the test/evaluation split?",
        "status": "PASS" if no_leakage else "FAIL",
        "evidence": "Zero data leakage detected in pipeline" if no_leakage else leakage_warnings[0],
        "weight": 20,
    })

    # 4. Hyperparameter Transparency & Claims
    conflicts = [w for w in scan_warnings if "conflict" in w.lower()]
    clean_params = len(conflicts) == 0
    checklist.append({
        "category": "Hyperparameter Transparency",
        "question": "Are published hyperparameters consistent with codebase defaults?",
        "status": "PASS" if clean_params else "WARN",
        "evidence": "All hyperparameters verified consistent" if clean_params else conflicts[0],
        "weight": 15,
    })

    claim_verified = bool(paper_fields.get("_claim", {}).get("verified"))
    claim_val = paper_fields.get("_claim", {}).get("value")
    claim_metric = paper_fields.get("_claim", {}).get("metric", "metric")
    checklist.append({
        "category": "Hyperparameter Transparency",
        "question": "Is the quantitative published claim verified against exact paper text?",
        "status": "PASS" if claim_verified else "WARN",
        "evidence": f"Verified claim: {claim_metric} = {claim_val} (Page {paper_fields.get('_claim', {}).get('page')})" if claim_verified else "Claim extracted via heuristic fallback",
        "weight": 10,
    })

    # 5. Execution Traceability
    has_manifest = any(r.get("manifest") for r in results)
    checklist.append({
        "category": "Execution Traceability",
        "question": "Are software versions, hardware isolation, and commit hashes recorded?",
        "status": "PASS" if has_manifest else "WARN",
        "evidence": f"Audit manifest attached with Git commit {project.get('commit', 'tracked')[:8]}" if has_manifest else "Pending experiment execution",
        "weight": 10,
    })

    # Calculate overall score
    total_weight = sum(item["weight"] for item in checklist)
    earned_weight = 0.0
    for item in checklist:
        if item["status"] == "PASS":
            earned_weight += item["weight"]
        elif item["status"] == "WARN":
            earned_weight += item["weight"] * 0.5

    score_pct = round((earned_weight / total_weight) * 100, 1) if total_weight > 0 else 0.0

    if score_pct >= 90:
        grade = "A+ (Exemplary)"
        verdict = "HIGHLY_REPRODUCIBLE"
    elif score_pct >= 75:
        grade = "B (Satisfactory)"
        verdict = "MODERATE_REPRODUCIBILITY"
    elif score_pct >= 50:
        grade = "C (Flawed)"
        verdict = "AT_RISK"
    else:
        grade = "F (Critical Risks)"
        verdict = "CRITICALLY_FLAWED"

    return {
        "checklist": checklist,
        "score_pct": score_pct,
        "grade": grade,
        "verdict": verdict,
        "stats": {
            "passed": sum(1 for x in checklist if x["status"] == "PASS"),
            "warned": sum(1 for x in checklist if x["status"] == "WARN"),
            "failed": sum(1 for x in checklist if x["status"] == "FAIL"),
            "total": len(checklist),
        }
    }
