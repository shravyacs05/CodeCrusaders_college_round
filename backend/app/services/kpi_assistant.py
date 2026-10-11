"""Answers questions about one KPI card, grounded in the project's stored evidence.

The frontend sends which KPI the (i) button belongs to (its title, the definition shown to
the user, and the value on screen). The model is told to explain that KPI and relate it to
this project's actual numbers, using only the context built here from project.json.
"""
import json
from typing import Any

from . import llm

MAX_HISTORY = 10        # most recent messages sent to the model
MAX_MSG_CHARS = 2000    # per message
MAX_CONTEXT_CHARS = 14000

SYSTEM = """You are the CrisisGrid assistant. CrisisGrid checks whether an ML paper's published \
result can be reproduced from its code: it extracts hyperparameters and the headline claim from \
the PDF, scans the repository, reconciles paper vs code, runs the code over several seeds and \
verifies the reproduced metric against the published one.

The user clicked the info (i) button on the "{title}" card.{value}
CrisisGrid defines it as: {definition}

Rules:
- Answer about this KPI unless the user clearly asks about something else.
- Use ONLY the definition above and the project context below. Quote the project's actual numbers.
- Never invent metrics, parameter values, line numbers or quotes. If the context does not contain \
the answer, say so and name the CrisisGrid tab or action that would produce it (e.g. Run tab).
- If the definition says a number is a heuristic or simulation, say so plainly; do not present it \
as a measured result.
- Be concise: a few sentences or a short bullet list. Markdown is fine.

PROJECT CONTEXT (JSON):
{context}"""


def latest_experiment(exps: dict) -> dict | None:
    return max(exps.values(), key=lambda e: e.get("version", 0)) if exps else None


def build_context(proj: dict, exp: dict | None, verification: dict | None,
                  card_data: Any = None) -> dict[str, Any]:
    paper = proj.get("paper") or {}
    fields = paper.get("fields") or {}
    spec = (exp or {}).get("spec") or {}
    run = (proj.get("runs") or {}).get((exp or {}).get("id", "")) or {}
    status = run.get("status") or {}
    ctx: dict[str, Any] = {
        "project": {"name": proj.get("name"), "status": proj.get("status"),
                    "repo_url": proj.get("repo_url"), "is_demo": proj.get("is_demo"),
                    "is_paper_only": proj.get("is_paper_only")},
        "paper_claim": fields.get("_claim"),
        "paper_fields": {k: {"value": v.get("value"), "page": v.get("page")}
                         for k, v in fields.items()
                         if not k.startswith("_") and isinstance(v, dict)},
        "findings": [{k: f.get(k) for k in ("param", "paper_value", "code_value", "status",
                                            "severity", "code_ref")}
                     for f in proj.get("findings", [])],
        "selected_version": {"version": exp.get("version"),
                             "diff_from_parent": exp.get("diff_from_parent"),
                             "params": {k: (v.get("value"), v.get("source"))
                                        for k, v in (spec.get("params") or {}).items()
                                        if isinstance(v, dict)},
                             "claim": spec.get("claim")} if exp else None,
        "runs": {"state": status.get("state"), "seeds_done": status.get("seeds_done"),
                 "seeds_total": status.get("seeds_total"),
                 "failed_stage": status.get("failed_stage"), "error": status.get("error"),
                 "seeds": [{"seed": r.get("seed"), "status": r.get("status"),
                            "metrics": r.get("metrics"),
                            "isolation": (r.get("manifest") or {}).get("isolation")}
                           for r in run.get("results", [])]} if run else None,
        "verification": {k: v for k, v in (verification or {}).items()
                         if k != "xai_attribution"} or None,
    }
    if card_data is not None:
        ctx["card_data"] = card_data  # the numbers rendered on the card itself
    return ctx


def answer(messages: list[dict], context: dict, focus: dict) -> str:
    history = [{"role": m["role"], "content": str(m.get("content", ""))[:MAX_MSG_CHARS]}
               for m in messages if m.get("role") in ("user", "assistant")][-MAX_HISTORY:]
    while history and history[0]["role"] != "user":  # providers require a user turn first
        history.pop(0)
    if not history or history[-1]["role"] != "user":
        raise ValueError("the last message must be a user question")
    value = focus.get("value")
    system = SYSTEM.format(
        title=str(focus.get("title", "this metric"))[:120],
        value=f' The value currently shown is: {str(value)[:300]}.' if value not in (None, "") else "",
        definition=str(focus.get("definition", ""))[:1500],
        context=json.dumps(context, default=str)[:MAX_CONTEXT_CHARS])
    return llm.chat_text(system, history)
