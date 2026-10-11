"""Spec builder: merge paper + code into a tracked ExperimentSpec, build graph."""
from typing import Any

from .reconciler import normalize_name

ORDER = ["Dataset", "Preprocessing", "Model", "Training", "Evaluation", "Compare"]
DATASET = {"test_size", "val_size", "shuffle", "stratify", "n_splits"}
TRAINING = {"seed", "learning_rate", "batch_size", "epochs", "optimizer", "weight_decay",
            "momentum", "max_iter"}
PARAM_NODES = ["Dataset", "Model", "Training"]


def node_for_param(param: str) -> str:
    n = normalize_name(param)
    if n in DATASET:
        return "Dataset"
    if n in TRAINING:
        return "Training"
    return "Model"


def params_for_node(spec: dict[str, Any], node: str) -> list[str]:
    return [p for p in spec.get("params", {}) if node_for_param(p) == node]


def editable_params(spec: dict[str, Any], node: str) -> list[str]:
    """Return parameter names for `node` that are injectable (exposed as CLI flags)."""
    return [p for p in params_for_node(spec, node) if spec["params"][p].get("injectable", False)]


def tracked(value, source, ref=None, verified=False, injectable=False, kind=None):
    return {"value": value, "source": source, "ref": ref, "verified": verified,
            "injectable": injectable, "kind": kind}


def build_spec(paper: dict[str, Any], scan: dict[str, Any]) -> dict[str, Any]:
    """Precedence: user > code > paper > inferred. Missing stays None."""
    code = {normalize_name(k): v for k, v in scan["params"].items()}
    pf = {normalize_name(k): v for k, v in paper["fields"].items() if not k.startswith("_")}
    params: dict[str, Any] = {}
    for name in sorted(set(code) | set(pf)):
        if name == "out":
            continue
        if name in code and code[name]["value"] is not None:
            c = code[name]
            params[name] = tracked(c["value"], "code", f"{c['file']}:{c.get('line', 1)}", True,
                                   injectable=c.get("injectable", False), kind=c.get("kind"))
        elif pf.get(name, {}).get("value") is not None:
            p = pf[name]
            params[name] = tracked(p["value"], "paper", f"p.{p['page']}: {p['quote']}",
                                   p.get("verified", False), injectable=False, kind=None)
        else:
            params[name] = tracked(None, "missing", injectable=False, kind=None)
    claim = paper["fields"]["_claim"]
    return {
        "claim": {"metric": claim["metric"], "value": claim["value"],
                  "ref": f"p.{claim['page']}: {claim['quote']}" if claim.get("page") else None,
                  "percent": claim.get("percent", True)},
        "params": params,
        "run_command_template": scan["run_template"],
        "blocked": scan["blocked"],
        "warnings": scan.get("warnings", []),
        "checkpoint": scan.get("checkpoint"),
    }


def checkpoint_item(ck: dict[str, Any] | None) -> dict[str, Any] | None:
    """Graph entry for the model weights: where they come from, or that they are missing."""
    if not ck or ck.get("weights_status") in (None, "not_required"):
        return None
    sel = next((s for s in ck.get("selected", []) if s["role"] == "recovered_missing"), None) \
        or next(iter(ck.get("selected", [])), None)
    if sel:
        ev = "; ".join(f"{e['source']}: {e['ref']}" for e in sel["evidence"][:3])
        return tracked(f"{sel['repo_id']}@{sel['sha'][:7]}", "hub", ev, verified=True, kind=sel["role"])
    if ck.get("weights_status") == "present":
        return tracked("in repository", "code", None, verified=True, kind="present")
    m = (ck.get("missing") or [{}])[0]
    return tracked(None, "missing", f"{m.get('file')}:{m.get('line')} {ck.get('status')}", kind="missing")


def build_graph(spec: dict[str, Any]) -> dict[str, Any]:
    nodes = []
    for n in ORDER:
        if n in PARAM_NODES:
            items = {p: spec["params"][p] for p in params_for_node(spec, n) if p in spec["params"]}
            if n == "Model" and checkpoint_item(spec.get("checkpoint")):
                items["checkpoint"] = checkpoint_item(spec.get("checkpoint"))
        elif n == "Evaluation":
            items = {"metric": tracked(spec["claim"]["metric"], "paper", spec["claim"]["ref"])}
        elif n == "Compare":
            items = {"published": tracked(spec["claim"]["value"], "paper", spec["claim"]["ref"])}
        else:
            items = {}
        nodes.append({"id": n, "params": items})
    edges = [{"from": ORDER[i], "to": ORDER[i + 1]} for i in range(len(ORDER) - 1)]
    return {"nodes": nodes, "edges": edges}
