"""Versioning: immutable specs, child versions, diffs."""
import copy
import hashlib
import json
from typing import Any


def config_hash(spec: dict[str, Any]) -> str:
    vals = {k: v["value"] for k, v in spec["params"].items()}
    return hashlib.sha256(json.dumps(vals, sort_keys=True).encode()).hexdigest()[:12]


def diff_specs(a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
    """List changed param values between two specs."""
    out = []
    for k in sorted(set(a["params"]) | set(b["params"])):
        av = a["params"].get(k, {}).get("value")
        bv = b["params"].get(k, {}).get("value")
        if av != bv:
            out.append({"param": k, "from": av, "to": bv})
    return out


def make_child(parent_spec: dict[str, Any], edits: dict[str, Any]) -> dict[str, Any]:
    """Return a NEW spec with edits applied (source='user'). Parent is untouched."""
    child = copy.deepcopy(parent_spec)
    for k, v in edits.items():
        child["params"][k] = {"value": v, "source": "user", "ref": "user edit", "verified": True,
                              "injectable": child["params"].get(k, {}).get("injectable", True)}
    return child


def compare(a: dict, b: dict, metrics_a: dict | None, metrics_b: dict | None) -> dict[str, Any]:
    changes = diff_specs(a, b)
    delta = None
    if metrics_a and metrics_b and "mean" in metrics_a and "mean" in metrics_b:
        delta = round(metrics_b["mean"] - metrics_a["mean"], 4)
    return {"changes": changes, "metric_delta_pp": delta,
            "single_factor": len(changes) == 1,
            "note": ("No config changes between these versions." if not changes else
                     "Single-factor comparison." if len(changes) == 1 else
                     "Multiple fields changed; causation cannot be attributed to one field.")}
