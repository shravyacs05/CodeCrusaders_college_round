"""Paper analyzer: extract text per page, extract fields, verify quotes.

Deterministic regex extraction (no LLM needed). An LLM can be plugged
in via `extract_fields_llm`.
Every extracted field carries page + quote; quotes are verified against page text.
"""
import re
from typing import Any

# param name -> regex capturing a numeric value
# param name -> regex capturing a numeric value
PATTERNS = {
    "n_estimators": r"\b(\d+)\s+(?:trees|estimators)|\bn_estimators\s*(?:=|of|:)?\s*(\d+)",
    "max_depth": r"\bmax(?:imum)?[_ ]depth\s*(?:=|of|:)?\s*(\d+)",
    "test_size": r"\btest[_ ]size\s*(?:=|of|:)?\s*(0?\.\d+)",
    "seed": r"\b(?:random )?seed[^.\n]{0,30}?\b(\d+)",
    # For LR schedules like "increased linearly from 0.1 to 0.4", capture the TARGET (0.4).
    # The two-group pattern tries the from→to form first (group 1 = target), then a plain value (group 2).
    "learning_rate": (
        r"\b(?:learning[_ ]rate|lr|eta)\b"
        r"(?:[^.\n]{0,60}?from\s+0?\.\d+\s+to\s+(0?\.\d+)"   # warmup: capture peak
        r"|[^.\n]{0,40}?\b(0?\.\d+))"
    ),
    "batch_size": r"\b(?:(?:mini)?batch[_ ]size|\bbs\b)[^.\n]{0,30}?\b(\d[\d,]*)\b",
    "epochs": r"\b(?:(?:num(?:ber)?|n)[_ ](?:of[_ ])?epochs?|epochs?)[^.\n]{0,30}?\b(\d+)|\b(?:train(?:ed)?|run(?:s)?)\s+for\s+(\d+)\s+epochs?|\b(\d+)\s+epochs?\b",
}
# Patterns whose match indicates a schedule/non-fixed value — used to add a schedule_note
SCHEDULE_PATTERNS = {
    "learning_rate": re.compile(
        r"(?:increased linearly|warmup|warm.up|cosine|cyclic|linear decay|divided by|step decay)",
        re.IGNORECASE,
    ),
}
CLAIM_PATTERN = r"\b(accuracy|f1(?:[- ]score)?|auc(?:[- ]roc)?|precision|recall|(?:test[- ])?error|top[- ]1[- ]error)\s*(?:of|=|:|is|reaches|reached)?\s*(\d+(?:\.\d+)?)\s*(%)?"


def _num(s: str) -> float | int | None:
    if not s:
        return None
    s = str(s).replace(",", "").strip()
    if not s or not re.search(r"\d", s):
        return None
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


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
        found = False
        for i, text in enumerate(pages):
            for m in re.finditer(pat, text, re.IGNORECASE):
                val = next((g for g in m.groups() if g), None)
                if val is not None:
                    parsed = _num(val)
                    if parsed is None:
                        continue
                    entry: dict[str, Any] = {
                        "value": parsed,
                        "page": i + 1,
                        "quote": m.group(0).replace("\n", " ").strip(),
                        "match": m.group(0),
                        "source": "paper",
                    }
                    # Detect schedule descriptions and store a human-readable note
                    if name in SCHEDULE_PATTERNS and SCHEDULE_PATTERNS[name].search(m.group(0)):
                        # Build a broader context snippet (up to end of sentence)
                        start = max(0, m.start() - 20)
                        end_m = re.search(r"[.\n]", text[m.end():])
                        end = m.end() + (end_m.start() if end_m else 0)
                        context = text[start:end].replace("\n", " ").strip()
                        entry["schedule_note"] = context
                    fields[name] = entry
                    found = True
                    break
            if found:
                break
    claim = {"metric": "accuracy", "value": None, "page": None, "quote": None, "percent": True}
    for i, text in enumerate(pages):
        claim_found = False
        for m in re.finditer(CLAIM_PATTERN, text, re.IGNORECASE):
            val = _num(m.group(2))
            if val is None:
                continue
            raw_metric = m.group(1).lower()
            metric = re.sub(r"[- ]score", "", raw_metric)
            metric = re.sub(r"[- ]roc", "", metric)
            has_pct = m.group(3) == "%" or val > 1.0
            claim = {
                "metric": metric,
                "value": val,
                "page": i + 1,
                "quote": m.group(0).replace("\n", " ").strip(),
                "match": m.group(0),
                "percent": has_pct,
            }
            claim_found = True
            break
        if claim_found:
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


def find_quote_bbox(page: Any, quote: str | None, value: Any = None, match: str | None = None) -> dict[str, float] | None:
    """Return normalized percentage bounding box {x, y, w, h} within 0..100."""
    if not quote and value is None and not match:
        return None
    w, h = page.rect.width, page.rect.height
    candidates = []
    # 1. Exact match phrase (e.g. "minibatch size of 1,024" or "train for 200 epochs")
    if match:
        cleaned_m = match.strip().replace("\n", " ")
        candidates.append(cleaned_m)
        tokens_m = cleaned_m.split()
        if len(tokens_m) >= 2:
            candidates.append(" ".join(tokens_m[-2:]))
            candidates.append(" ".join(tokens_m[:2]))
    # 2. Specific numeric value or percentage
    if value is not None:
        candidates.append(str(value))
        if isinstance(value, float):
            candidates.append(f"{value}%")
    # 3. Full quote snippet or partial tokens
    if quote:
        cleaned = quote.strip().replace("\n", " ")
        candidates.append(cleaned)
        tokens = cleaned.split()
        if len(tokens) >= 3:
            candidates.append(" ".join(tokens[:3]))
            candidates.append(" ".join(tokens[-3:]))

    for c in candidates:
        if not c:
            continue
        rects = page.search_for(c)
        if rects:
            r = rects[0]
            return {
                "x": round((r.x0 / w) * 100, 2),
                "y": round((r.y0 / h) * 100, 2),
                "w": max(round(((r.x1 - r.x0) / w) * 100, 2), 3.0),
                "h": max(round(((r.y1 - r.y0) / h) * 100, 2), 1.4),
            }
    return None


def attach_bboxes(fields: dict[str, Any], pdf_path: str) -> None:
    """Attach normalized {x, y, w, h} bounding boxes to each field that has page and quote."""
    import pymupdf

    try:
        with pymupdf.open(pdf_path) as doc:
            for name, f in fields.items():
                if not isinstance(f, dict):
                    continue
                page_idx = f.get("page")
                if isinstance(page_idx, int) and 1 <= page_idx <= len(doc):
                    page = doc[page_idx - 1]
                    f["bbox"] = find_quote_bbox(page, f.get("quote"), f.get("value"), f.get("match"))
                else:
                    f["bbox"] = None
    except Exception:
        for f in fields.values():
            if isinstance(f, dict):
                f.setdefault("bbox", None)


def render_page_png(pdf_path: str, page_num: int, dpi: int = 144) -> bytes:
    """Render a PDF page to PNG bytes."""
    import pymupdf

    with pymupdf.open(pdf_path) as doc:
        if page_num < 1 or page_num > len(doc):
            raise ValueError(f"Page {page_num} out of bounds (1..{len(doc)})")
        return doc[page_num - 1].get_pixmap(dpi=dpi).tobytes("png")


def extract_repo_url(pages: list[str]) -> str | None:
    """Scan pages for GitHub / GitLab repository URLs cited in abstract, footnotes, or text."""
    pattern = re.compile(r"(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+)", re.IGNORECASE)
    for page in pages:
        for match in pattern.finditer(page):
            repo_path = match.group(1).rstrip(".,;)>'\"")
            parts = repo_path.split("/")
            if len(parts) >= 2 and not any(parts[0].lower() == x for x in ("features", "about", "site", "topics", "pulls", "issues")):
                clean_repo = f"{parts[0]}/{parts[1]}"
                return f"https://github.com/{clean_repo}"
    return None


def get_paper_metadata(pdf_path: str) -> dict[str, Any]:
    """Return page count, dimensions for each page, and any discovered repo URL."""
    import pymupdf

    pages = extract_pages(pdf_path)
    discovered_repo = extract_repo_url(pages)

    with pymupdf.open(pdf_path) as doc:
        pages_info = []
        for i, page in enumerate(doc):
            pages_info.append({
                "page": i + 1,
                "width": round(page.rect.width, 1),
                "height": round(page.rect.height, 1),
            })
        return {
            "n_pages": len(doc),
            "pages": pages_info,
            "discovered_repo": discovered_repo,
        }


def analyze_paper(pdf_path: str) -> dict[str, Any]:
    """Extract with the LLM when configured (fallback: regex), then verify quotes, attach bboxes and discovered repo."""
    from . import llm

    pages = extract_pages(pdf_path)
    discovered_repo = extract_repo_url(pages)
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
    attach_bboxes(fields, pdf_path)
    return {"fields": fields, "flags": flags, "n_pages": len(pages), "method": method,
            "note": note, "discovered_repo": discovered_repo}

