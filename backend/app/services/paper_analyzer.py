"""Paper analyzer: extract text per page, extract fields, verify quotes.

Deterministic regex extraction (no LLM needed). An LLM can be plugged
in via `extract_fields_llm`.
Every extracted field carries page + quote; quotes are verified against page text.
"""
import re
from typing import Any

# param name -> regex capturing a numeric value
PATTERNS = {
    "n_estimators": r"(\d+)\s+(?:trees|estimators)|n_estimators\s*(?:=|of|:)?\s*(\d+)",
    "max_depth": r"max(?:imum)?[_ ]depth\s*(?:=|of|:)?\s*(\d+)",
    "test_size": r"test[_ ]size\s*(?:=|of|:)?\s*(0?\.\d+)",
    "seed": r"(?:random )?seed\s*(?:=|of|:)?\s*(\d+)",
    "learning_rate": r"(?:learning[_ ]rate|lr|eta)\s*(?:=|of|:)?\s*(0?\.\d+)",
    "batch_size": r"(?:(?:mini)?batch[_ ]size|bs)\s*(?:=|of|:)?\s*([\d,]+)",
    "epochs": r"(?:(?:num(?:ber)?|n)[_ ]of[_ ]epochs?|num[_ ]epochs|n[_ ]epochs|(?:train(?:ed)?|run(?:s)?)\s+for\s+(\d+)\s+epochs?|epochs?\s*(?:=|of|:)\s*(\d+))",
}
CLAIM_PATTERN = r"(accuracy|f1(?:[- ]score)?|auc(?:[- ]roc)?|precision|recall)\s*(?:of|=|:|is|reaches|reached)?\s*(\d+(?:\.\d+)?)\s*(%)?"


def _num(s: str) -> float | int:
    s = str(s).replace(",", "").strip()
    return float(s) if "." in s else int(s)


def extract_pages(pdf_path: str) -> list[str]:
    """Return text of each page (index 0 = page 1)."""
    import pymupdf  # PyMuPDF

    with pymupdf.open(pdf_path) as doc:
        return [page.get_text() for page in doc]


def _norm(s: str) -> str:
    # Normalize whitespace and table delimiters (pipes, tabs) for reliable table matching
    cleaned = re.sub(r"[|,:;]+", " ", s)
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def verify_quote(quote: str, page_text: str) -> bool:
    """True if the normalized quote appears in the normalized page text,
    or if all significant tokens from a structured table row appear on the cited page."""
    if not quote or not page_text:
        return False
    norm_q = _norm(quote)
    norm_page = _norm(page_text)
    if norm_q in norm_page:
        return True
    # For table rows or formatted snippets, check if all significant tokens exist on the page
    tokens = [t for t in norm_q.split() if len(t) > 1 and t not in ("the", "and", "for", "with", "from", "that")]
    if len(tokens) >= 2 and all(t in norm_page for t in tokens):
        return True
    return False


def _snippet(text: str, start: int, end: int, pad: int = 30) -> str:
    return text[max(0, start - pad): end + pad].replace("\n", " ").strip()


def extract_fields(pages: list[str]) -> dict[str, Any]:
    """Extract params and claim. Missing fields stay None with source 'missing'."""
    fields: dict[str, Any] = {}
    for name, pat in PATTERNS.items():
        fields[name] = {"value": None, "page": None, "quote": None, "source": "missing"}
        for i, text in enumerate(pages):
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                val = next(g for g in m.groups() if g)
                fields[name] = {
                    "value": _num(val),
                    "page": i + 1,
                    "quote": _snippet(text, m.start(), m.end()),
                    "source": "paper",
                }
                break
    claim = {"metric": "accuracy", "value": None, "page": None, "quote": None, "percent": True}
    for i, text in enumerate(pages):
        m = re.search(CLAIM_PATTERN, text, re.IGNORECASE)
        if m:
            raw_metric = m.group(1).lower()
            metric = re.sub(r"[- ]score", "", raw_metric)
            metric = re.sub(r"[- ]roc", "", metric)
            val = _num(m.group(2))
            has_pct = m.group(3) == "%" or val > 1.0
            claim = {
                "metric": metric,
                "value": val,
                "page": i + 1,
                "quote": _snippet(text, m.start(), m.end()),
                "percent": has_pct,
            }
            break
    fields["_claim"] = claim
    return fields


LLM_SYSTEM = (
    "You extract experiment details from a machine learning paper. Return ONLY JSON of the form "
    '{"claim": {"metric": str, "value": number (percent), "page": int, "quote": str}, '
    '"params": {"<name>": {"value": number|string|null, "page": int|null, "quote": str|null}}}. '
    "Use snake_case names such as n_estimators, max_depth, learning_rate, batch_size, epochs, "
    "test_size, seed, optimizer. Quotes must be copied verbatim from the page text. "
    "If a value is not stated in the paper, set value, page and quote to null. Never guess."
)


def extract_fields_llm(pages: list[str]) -> dict[str, Any]:
    """LLM extraction. Output is still verified against page text by `validate`."""
    from . import llm

    text = "\n\n".join(f"[PAGE {i + 1}]\n{t}" for i, t in enumerate(pages))[:60000]
    data = llm.complete_json(LLM_SYSTEM, text)
    fields: dict[str, Any] = {}
    for name, f in (data.get("params") or {}).items():
        v = f.get("value") if isinstance(f, dict) else None
        if v is None:
            fields[name] = {"value": None, "page": None, "quote": None, "source": "missing"}
        else:
            if isinstance(v, str) and re.match(r"^-?\d+(?:\.\d+)?$", v.strip()):
                v = _num(v.strip())
            fields[name] = {"value": v, "page": f.get("page"), "quote": f.get("quote"),
                            "source": "paper"}
    c = data.get("claim") or {}
    val = c.get("value")
    if isinstance(val, str):
        cleaned_num = re.sub(r"[^\d.]", "", val)
        if cleaned_num:
            val = _num(cleaned_num)
    has_pct = True
    if val is not None and val <= 1.0:
        has_pct = False
    raw_metric = str(c.get("metric") or "accuracy").lower()
    metric = re.sub(r"[- ]score", "", raw_metric)
    metric = re.sub(r"[- ]roc", "", metric)
    fields["_claim"] = {"metric": metric,
                        "value": val, "page": c.get("page"), "quote": c.get("quote"),
                        "percent": has_pct}
    return fields


def validate(fields: dict[str, Any], pages: list[str]) -> dict[str, Any]:
    """Flag fields whose quote cannot be found on the cited page."""
    flags = {}
    for name, f in fields.items():
        page = f.get("page")
        ok = False
        if f.get("quote") and isinstance(page, int) and 1 <= page <= len(pages):
            ok = verify_quote(f["quote"], pages[page - 1])
        f["verified"] = ok
        if f.get("quote") and not ok:
            # Principle: an unverifiable extraction is not trusted.
            flags[name] = "unverified_extraction"
            f["claimed_value"] = f.get("value")
            f["value"] = None
            f["source"] = "unverified"
    return flags


def analyze_paper(pdf_path: str) -> dict[str, Any]:
    """Extract with the LLM when configured (fallback: regex), then verify quotes."""
    from . import llm

    pages = extract_pages(pdf_path)
    method, note = "regex", None
    if llm.enabled():
        try:
            fields = extract_fields_llm(pages)
            method = "llm"
        except llm.LLMError as e:
            fields, note = extract_fields(pages), f"LLM failed, used regex: {e}"
    else:
        fields = extract_fields(pages)
    flags = validate(fields, pages)
    return {"fields": fields, "flags": flags, "n_pages": len(pages), "method": method,
            "note": note}
