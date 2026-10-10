"""Reconciler: rule-based paper vs. code comparison (no LLM for numbers).

Computes deterministic findings: MATCH / MISMATCH / ONLY_IN_PAPER / ONLY_IN_CODE / MISSING.
Plain-English explanations are generated deterministically and optionally enriched via LLM.
"""
from typing import Any

ALIASES = {
    "lr": "learning_rate", "learning_rate": "learning_rate",
    "n_trees": "n_estimators", "trees": "n_estimators", "n_estimators": "n_estimators",
    "random_state": "seed", "random_seed": "seed", "seed": "seed",
    "depth": "max_depth", "max_depth": "max_depth",
    "test_size": "test_size", "test_split": "test_size",
    "epoch": "epochs", "num_epochs": "epochs", "n_epochs": "epochs", "epochs": "epochs",
    "bs": "batch_size", "minibatch_size": "batch_size", "batch_size": "batch_size",
    "eta": "learning_rate", "wd": "weight_decay", "weight_decay": "weight_decay",
}
SEVERITY = {"MISMATCH": "high", "MISSING": "high", "ONLY_IN_PAPER": "medium",
            "ONLY_IN_CODE": "low", "MATCH": "none"}


def normalize_name(name: str) -> str:
    key = name.strip().lower().replace("-", "_").replace(" ", "_")
    return ALIASES.get(key, key)


def values_equal(a: Any, b: Any) -> bool:
    try:
        return abs(float(a) - float(b)) < 1e-9
    except (TypeError, ValueError):
        return str(a).strip().lower() == str(b).strip().lower()


def default_explanation(status: str, param: str, pv: Any, cv: Any,
                        pref: str | None, cref: str | None) -> str:
    """Deterministic plain-English explanation for a finding."""
    if status == "MATCH":
        return f"Paper value ({pv}) matches code default ({cv})."
    if status == "MISMATCH":
        return f"Paper specifies {param}={pv} ({pref or 'paper'}), but code default is {cv} ({cref or 'code'})."
    if status == "MISSING":
        return f"Code sets {param}={cv} ({cref or 'code'}), but parameter is omitted from the paper."
    if status == "ONLY_IN_PAPER":
        return f"Paper specifies {param}={pv} ({pref or 'paper'}), but it was not found in code defaults or configs."
    return ""


def reconcile(paper_fields: dict[str, Any], code_params: dict[str, Any],
              enrich_llm: bool = False) -> list[dict[str, Any]]:
    """Return findings: MATCH / MISMATCH / ONLY_IN_PAPER / ONLY_IN_CODE / MISSING."""
    paper = {normalize_name(k): v for k, v in paper_fields.items() if not k.startswith("_") and v.get("value") is not None}
    code = {normalize_name(k): v for k, v in code_params.items() if k != "out" and v.get("value") is not None}
    findings = []
    for p in sorted(set(paper) | set(code)):
        pv = paper.get(p, {}).get("value")
        cv = code.get(p, {}).get("value")
        in_paper, in_code = pv is not None, cv is not None
        if in_paper and in_code:
            status = "MATCH" if values_equal(pv, cv) else "MISMATCH"
        elif in_paper:
            status = "ONLY_IN_PAPER"
        elif in_code:
            status = "MISSING"
        else:
            continue

        pref = f"p.{paper[p]['page']}: {paper[p]['quote']}" if in_paper else None
        cref = f"{code[p]['file']}:{code[p]['line']}" if in_code and code[p].get("line") else None

        # If paper describes a schedule (e.g. LR warmup) but code has a fixed value, force MISMATCH
        schedule_note = paper.get(p, {}).get("schedule_note")
        if schedule_note and status == "MATCH":
            status = "MISMATCH"

        expl = default_explanation(status, p, pv, cv, pref, cref)

        # Append schedule context so it's visible in the UI
        if schedule_note:
            expl += f" Note: paper describes a schedule — {schedule_note.strip()}"

        findings.append({
            "param": p, "paper_value": pv, "code_value": cv, "status": status,
            "severity": SEVERITY[status],
            "paper_ref": pref,
            "code_ref": cref,
            "explanation": expl,
            **(  {"schedule_note": schedule_note} if schedule_note else {}),
        })

    # Optional LLM enrichment if requested and enabled
    if enrich_llm:
        from . import llm
        if llm.enabled():
            try:
                system = (
                    "You write 1-sentence plain-English explanations for findings comparing an ML paper and its code. "
                    "Return ONLY JSON: {\"explanations\": {\"<param>\": \"<short 1-sentence explanation>\"}}. "
                    "Stay strictly grounded in the given values and references. Never invent facts."
                )
                user = "\n".join(f"- {f['param']}: status={f['status']}, paper={f['paper_value']}, code={f['code_value']}"
                                 for f in findings)
                data = llm.complete_json(system, user)
                expl_map = data.get("explanations", {})
                for f in findings:
                    if f["param"] in expl_map and expl_map[f["param"]]:
                        f["explanation"] = expl_map[f["param"]]
            except Exception:
                pass

    return findings
