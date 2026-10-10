"""Verifier: deterministic comparison of published vs. reproduced metric."""
import statistics
from typing import Any


def aggregate(values: list[float]) -> dict[str, float]:
    return {
        "mean": statistics.fmean(values),
        "std": statistics.stdev(values) if len(values) > 1 else 0.0,
        "min": min(values), "max": max(values), "n": len(values),
    }


def verify(published: float | None, values: list[float], tolerance_pp: float = 1.0,
           scale: float = 100.0) -> dict[str, Any]:
    """published is in percent (e.g. 96.5); values are fractions (0.965) times `scale`.

    Status:
      REPRODUCED          |diff| <= tolerance
      PARTIALLY_REPRODUCED published within observed range or mean +/- 2 std
      NOT_REPRODUCED      otherwise
      BLOCKED             no values or no published claim
    """
    if published is None or not values:
        return {"status": "BLOCKED", "reason": "no published value or no successful runs",
                "tolerance_pp": tolerance_pp}
    scaled = [v * scale for v in values]
    agg = aggregate(scaled)
    diff = agg["mean"] - published
    in_range = agg["min"] <= published <= agg["max"]
    in_2std = abs(diff) <= 2 * agg["std"]
    if abs(diff) <= tolerance_pp:
        status = "REPRODUCED"
    elif in_range or in_2std:
        status = "PARTIALLY_REPRODUCED"
    else:
        status = "NOT_REPRODUCED"
    return {"status": status, "published": published, "reproduced_mean": agg["mean"],
            "std": agg["std"], "min": agg["min"], "max": agg["max"], "n": agg["n"],
            "diff_pp": diff, "in_range": in_range, "within_2std": in_2std,
            "tolerance_pp": tolerance_pp,
            "rule": f"REPRODUCED if |diff| <= {tolerance_pp} pp; PARTIAL if published within "
                    "observed seed range or mean +/- 2 std"}
