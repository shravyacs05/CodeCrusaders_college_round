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
    "Use snake_case names such as learning_rate, batch_size, epochs, seed, optimizer, "
    "dropout_rate, embedding_dim, filter_sizes, num_filters, hidden_size, num_layers, "
    "n_estimators, max_depth, test_size. Quotes must be copied verbatim from the page text. "
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


def is_filename_like(s: str) -> bool:
    """Check if a string resembles a raw file name, arXiv ID, or generic placeholder rather than a paper title."""
    if not s or len(s.strip()) < 4:
        return True
    s_clean = s.strip().lower()
    if s_clean.endswith(".pdf") or s_clean in (
        "(anonymous)", "untitled", "unknown", "paper", "default",
        "output", "main", "draft", "document", "submission"
    ):
        return True
    # If it contains underscores without spaces (typical filename format)
    if "_" in s_clean and " " not in s_clean:
        return True
    # If it is an arXiv ID like 1408.5882 or 1710.09412v2
    if re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", s_clean):
        return True
    return False


def extract_title(pdf_path: str, pages: list[str] | None = None) -> str:
    """Extract genuine research paper title from paper text and layout, never the PDF file name."""
    import pymupdf
    from . import llm

    if pages is None:
        try:
            pages = extract_pages(pdf_path)
        except Exception:
            pages = []

    # 1. High-accuracy extraction using Gemini LLM when available
    if llm.enabled() and pages and len(pages) > 0:
        try:
            prompt = (
                "Extract the exact academic research paper title from the paper text below.\n"
                "Do NOT return the file name, arXiv identifier, conference name, author names, or affiliations.\n"
                "Return ONLY a JSON object: {\"title\": \"<exact title>\"}\n\n"
                f"Paper Text Excerpt:\n{pages[0][:3000]}"
            )
            data = llm.complete_json(
                "You are an academic literature indexer. Extract the exact published paper title.",
                prompt
            )
            llm_title = (data.get("title") or "").strip()
            if llm_title and len(llm_title) > 4 and not is_filename_like(llm_title):
                return llm_title
        except Exception:
            pass

    # 2. Deterministic layout & block extraction from first page
    try:
        with pymupdf.open(pdf_path) as doc:
            if len(doc) > 0:
                page = doc[0]
                blocks = page.get_text("blocks")
                candidates: list[str] = []

                for b in blocks[:6]:
                    txt = " ".join(b[4].split()).strip()
                    if not txt:
                        continue
                    # Skip header artifacts (arXiv stamps, publication/conference banners, DOIs)
                    if re.match(r"^(?:arxiv|published as|under review|proceedings|doi|https?://|accepted|volume|vol\.|journal|copyright)", txt, re.I):
                        continue
                    # Stop at abstract, intro, or author emails
                    if re.match(r"^(?:abstract|1\.?\s+intro|introduction)", txt, re.I) or "@" in txt:
                        break
                    # If this block is a valid text block
                    if len(txt) > 4 and not is_filename_like(txt):
                        candidates.append(txt)
                        # The first non-header block before authors/abstract is usually the full paper title
                        break

                if candidates:
                    return candidates[0]

                # Visual font-size hierarchy layout analysis fallback
                d = page.get_text("dict")
                spans: list[tuple[float, float, str]] = []
                for b in d.get("blocks", []):
                    if "lines" in b:
                        for l in b["lines"]:
                            for s in l.get("spans", []):
                                t = s.get("text", "").strip()
                                if t and len(t) > 1 and not t.lower().startswith(("arxiv:", "doi:", "http://", "https://", "published")):
                                    spans.append((float(s.get("size", 10)), float(s.get("bbox", (0, 0, 0, 0))[1]), t))

                if spans:
                    h = page.rect.height or 792.0
                    top_spans = [s for s in spans if s[1] < h * 0.45] or spans
                    max_size = max(s[0] for s in top_spans)
                    if max_size >= 12.0:
                        # Include spans within 4pt to account for small-caps or multi-line titles
                        title_spans = [s[2] for s in top_spans if abs(s[0] - max_size) <= 4.0]
                        if title_spans:
                            candidate = " ".join(title_spans).strip()
                            if not is_filename_like(candidate):
                                return candidate

            # Check metadata title only if valid and not looking like a file name
            meta_title = (doc.metadata.get("title") or "").strip()
            if meta_title and not is_filename_like(meta_title):
                return meta_title
    except Exception:
        pass

    if pages and len(pages) > 0:
        lines = [l.strip() for l in pages[0].splitlines() if len(l.strip()) > 3]
        for l in lines[:4]:
            if not l.lower().startswith(("arxiv", "http", "doi", "abstract", "published")) and not is_filename_like(l):
                return l

    return "Research Paper Reproduction"



# ── Methodology & Domain Detection ──────────────────────────────────────────

# Architecture keywords → canonical architecture tag
_ARCH_KEYWORDS: list[tuple[str, re.Pattern[str]]] = [
    ("transformer", re.compile(r"\btransformer(?:s)?\b|self[\s-]?attention|multi[\s-]?head[\s-]?attention", re.I)),
    ("bert", re.compile(r"\bBERT\b|\bRoBERTa\b|\bDistilBERT\b|\bALBERT\b", re.I)),
    ("gpt", re.compile(r"\bGPT[\s-]?\d?\b|\bautoregressive[\s-]?language[\s-]?model", re.I)),
    ("resnet", re.compile(r"\bResNet[\s-]?\d*\b|\bresidual[\s-]?network\b|\bResNeXt\b", re.I)),
    ("vgg", re.compile(r"\bVGG[\s-]?\d*\b", re.I)),
    ("lstm", re.compile(r"\bLSTM\b|\blong[\s-]?short[\s-]?term[\s-]?memory\b|\bBi[\s-]?LSTM\b", re.I)),
    ("gru", re.compile(r"\bGRU\b|\bgated[\s-]?recurrent[\s-]?unit\b", re.I)),
    ("rnn", re.compile(r"\bRNN\b|\brecurrent[\s-]?neural[\s-]?network\b", re.I)),
    ("cnn", re.compile(r"\bCNN\b|\bconvolutional[\s-]?neural[\s-]?network\b|1[\s-]?D[\s-]?convolution|text[\s-]?CNN", re.I)),
    ("gan", re.compile(r"\bGAN\b|\bgenerative[\s-]?adversarial\b|\bDCGAN\b|\bWGAN\b", re.I)),
    ("autoencoder", re.compile(r"\bauto[\s-]?encoder\b|\bVAE\b|\bvariational[\s-]?auto[\s-]?encoder\b", re.I)),
    ("random_forest", re.compile(r"\brandom[\s-]?forest\b", re.I)),
    ("xgboost", re.compile(r"\bXGBoost\b|\bgradient[\s-]?boost(?:ing|ed)?\b|\bGBDT\b|\bLightGBM\b", re.I)),
    ("svm", re.compile(r"\bSVM\b|\bsupport[\s-]?vector[\s-]?machine\b", re.I)),
    ("logistic_regression", re.compile(r"\blogistic[\s-]?regression\b", re.I)),
    ("mlp", re.compile(r"\bMLP\b|\bmulti[\s-]?layer[\s-]?perceptron\b|\bfeed[\s-]?forward[\s-]?network\b", re.I)),
]

# Domain keywords → canonical domain tag
_DOMAIN_KEYWORDS: list[tuple[str, re.Pattern[str]]] = [
    ("nlp", re.compile(
        r"\bNLP\b|\bnatural[\s-]?language\b|\bsentiment\b|\btext[\s-]?classif|"
        r"\btokeniz|\bword[\s-]?embed|\bword2vec\b|\bGloVe\b|\bIMDb\b|\bSST\b|"
        r"\bsentence[\s-]?classif|\bnamed[\s-]?entity|\bmachine[\s-]?translation|"
        r"\blanguage[\s-]?model|\bcorpus\b|\bvocab|\bsequence[\s-]?label", re.I)),
    ("cv", re.compile(
        r"\bcomputer[\s-]?vision\b|\bimage[\s-]?classif|\bobject[\s-]?detect|"
        r"\bCIFAR\b|\bImageNet\b|\bMNIST\b|\bpixel|\bconvolution|\bimage[\s-]?recognition|"
        r"\bsegmentation\b|\bdata[\s-]?augment|\bResNet\b|\bVGG\b", re.I)),
    ("tabular", re.compile(
        r"\btabular\b|\bstructured[\s-]?data\b|\bfeature[\s-]?engineer|\bbreast[\s-]?cancer|"
        r"\bUCI\b|\bclinical[\s-]?data\b|\bregression[\s-]?task\b", re.I)),
    ("audio", re.compile(
        r"\baudio\b|\bspeech[\s-]?recognition\b|\bASR\b|\bmel[\s-]?spectrogram\b|\bwaveform\b", re.I)),
    ("graph", re.compile(
        r"\bgraph[\s-]?neural[\s-]?network\b|\bGNN\b|\bnode[\s-]?classif|\bGCN\b", re.I)),
]


LLM_METHODOLOGY_SYSTEM = """You are an expert AI researcher and literature auditor in CrisisGrid.
Analyze the provided research paper text and extract the exact model architecture, methodology, and domain.
Return ONLY a valid JSON object matching:
{
  "architecture_name": string (exact model name, e.g. "TextCNN", "ResNet-50", "BERT", "Multi-Layer Perceptron"),
  "canonical_architecture": "cnn" | "resnet" | "vgg" | "lstm" | "gru" | "rnn" | "transformer" | "bert" | "gpt" | "mlp" | "random_forest" | "xgboost" | "svm",
  "domain": "nlp" | "cv" | "tabular" | "audio" | "graph",
  "framework": "pytorch" | "sklearn",
  "model_summary": string (1-2 sentence concise summary of the methodology),
  "components": list of strings (key architectural components and layer details),
  "architecture_details": list of strings (detected architectural specifics, e.g. kernel sizes, layers),
  "domain_details": list of strings (detected problem / dataset specifics)
}
"""


def detect_methodology_llm(pages: list[str]) -> dict[str, Any]:
    """Extract model architecture and domain using Gemini API."""
    from . import llm

    text = "\n\n".join(f"[PAGE {i + 1}]\n{t}" for i, t in enumerate(pages[:6]))[:30000]
    data = llm.complete_json(LLM_METHODOLOGY_SYSTEM, f"Paper text excerpt:\n{text}")
    canonical_arch = str(data.get("canonical_architecture") or "mlp").lower()
    domain = str(data.get("domain") or "tabular").lower()
    return {
        "architecture": canonical_arch,
        "domain": domain,
        "canonical_architecture": canonical_arch,
        "canonical_domain": domain,
        "architecture_name": data.get("architecture_name") or canonical_arch.upper(),
        "model_summary": data.get("model_summary") or "",
        "components": data.get("components") or [],
        "framework": data.get("framework") or ("pytorch" if canonical_arch in ("cnn", "resnet", "lstm", "transformer") else "sklearn"),
        "architecture_details": data.get("architecture_details") or [canonical_arch],
        "domain_details": data.get("domain_details") or [domain],
        "source": "gemini",
    }


def detect_methodology_rules(pages: list[str]) -> dict[str, Any]:
    """Rule-based regex fallback for model architecture & domain detection."""
    full_text = "\n".join(pages)

    # Score architectures by match count
    arch_scores: dict[str, int] = {}
    for tag, pat in _ARCH_KEYWORDS:
        count = len(pat.findall(full_text))
        if count > 0:
            arch_scores[tag] = count

    # Score domains by match count
    domain_scores: dict[str, int] = {}
    for tag, pat in _DOMAIN_KEYWORDS:
        count = len(pat.findall(full_text))
        if count > 0:
            domain_scores[tag] = count

    sorted_archs = sorted(arch_scores, key=arch_scores.get, reverse=True)  # type: ignore[arg-type]
    sorted_domains = sorted(domain_scores, key=domain_scores.get, reverse=True)  # type: ignore[arg-type]

    arch = sorted_archs[0] if sorted_archs else "mlp"
    domain = sorted_domains[0] if sorted_domains else "tabular"

    return {
        "architecture": arch,
        "domain": domain,
        "canonical_architecture": arch,
        "canonical_domain": domain,
        "architecture_name": arch.upper(),
        "model_summary": f"Detected {arch.upper()} architecture for {domain.upper()} task.",
        "components": [],
        "framework": "pytorch" if arch in ("cnn", "resnet", "lstm", "transformer") else "sklearn",
        "architecture_details": sorted_archs,
        "domain_details": sorted_domains,
        "source": "rules",
    }


def detect_methodology(pages: list[str]) -> dict[str, Any]:
    """Detect model architecture & domain using Gemini API when available, falling back to regex rules."""
    from . import llm

    if llm.enabled():
        try:
            return detect_methodology_llm(pages)
        except Exception:
            pass
    return detect_methodology_rules(pages)



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


# Hugging Face model URLs (not datasets/spaces/docs), optionally pinned to /tree/<rev>
_HF_MODEL_URL = re.compile(
    r"(?:https?://)?(?:www\.)?(?:huggingface\.co|hf\.co)/"
    r"(?!datasets/|spaces/|docs\b|blog\b|papers\b|join\b|login\b|models\b|organizations\b|collections\b|"
    r"tasks\b|learn\b|transformers\b|api\b)"
    r"([A-Za-z0-9][\w.-]*/[A-Za-z0-9][\w.-]*[A-Za-z0-9])"
    r"(?:/(?:tree|blob|resolve|commit)/([\w.-]+))?", re.IGNORECASE)
_FROM_PRETRAINED = re.compile(r"from_pretrained\(\s*[\"'\u201c\u2018]([\w.-]+/[\w.-]+)[\"'\u201d\u2019]")
# owner/name tokens are only considered next to words that signal a released checkpoint
_CKPT_CONTEXT = re.compile(r"hugging\s*face|model\s*hub|checkpoints?|pre-?trained\s+weights|released|hf\.co", re.I)
_MODEL_TOKEN = re.compile(r"(?<![\w/.:-])([A-Za-z][\w-]{1,38}/[A-Za-z0-9][\w.-]{1,95}[A-Za-z0-9])(?![\w/])")
_EXTERNAL_WEIGHTS = re.compile(
    r"https?://\S*(?:drive\.google\.com|zenodo\.org|figshare\.com|dropbox\.com|/releases/download/)\S*", re.I)


_NOT_MODEL_PARTS = {"train", "test", "dev", "val", "valid", "validation", "base", "large", "small", "tiny",
                    "input", "output", "and", "or", "with", "without", "yes", "no", "true", "false", "min", "max"}


def _plausible_model_token(tok: str) -> bool:
    """Drop slash pairs that are obviously not Hub IDs (train/test, SST-2/MNLI, bert-base/large)."""
    owner, name = tok.split("/", 1)
    if re.match(r"^(?:github\.com|www|http)", tok, re.I) or "." in owner or not any(c.isalpha() for c in name):
        return False
    if owner.lower() in _NOT_MODEL_PARTS or name.lower() in _NOT_MODEL_PARTS:
        return False
    if re.fullmatch(r"[A-Z0-9-]+", owner) and re.fullmatch(r"[A-Z0-9-]+", name):  # benchmark pairs
        return False
    return len(name) >= 3


def extract_model_references(pages: list[str]) -> dict[str, Any]:
    """Model checkpoint references stated in the paper, each with page + verified quote.

    kind = "url"     an explicit huggingface.co/<owner>/<model> link
           "code"    a from_pretrained("<owner>/<model>") snippet
           "mention" an owner/model token near checkpoint vocabulary (weaker; never enough on its own)
    Nothing here is guessed: every candidate is later checked against the Hub by checkpoint_manager.
    """
    hub_ids: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(repo_id: str, rev: str | None, kind: str, page: int, text: str, start: int, end: int):
        repo_id = repo_id.rstrip(".,;:")
        key = (repo_id.lower(), kind)
        if key in seen:
            return
        seen.add(key)
        quote = _snippet(text, start, end, pad=40)
        hub_ids.append({"repo_id": repo_id, "revision": rev, "kind": kind, "page": page,
                        "quote": quote, "verified": verify_quote(quote, text)})

    for i, raw in enumerate(pages):
        # Re-join URLs that the PDF layout broke across lines ("huggingface.co/\ndistilbert/...")
        text = re.sub(r"((?:huggingface|hf)\.co/)\s+", r"\1", raw)
        text = re.sub(r"(huggingface\.co/[\w.-]+/)\s+", r"\1", text)
        for m in _HF_MODEL_URL.finditer(text):
            add(m.group(1), m.group(2), "url", i + 1, text, m.start(), m.end())
        for m in _FROM_PRETRAINED.finditer(text):
            add(m.group(1), None, "code", i + 1, text, m.start(), m.end())
        for m in _MODEL_TOKEN.finditer(text):
            window = text[max(0, m.start() - 150): m.end() + 150]
            tok = m.group(1)
            if _CKPT_CONTEXT.search(window) and _plausible_model_token(tok):
                if not any(h["repo_id"].lower() == tok.lower() for h in hub_ids):
                    add(tok, None, "mention", i + 1, text, m.start(), m.end())
        for m in _EXTERNAL_WEIGHTS.finditer(text):
            links.append({"url": m.group(0).rstrip(".,;:)"), "page": i + 1})
    return {"hub_ids": hub_ids[:10], "external_links": links[:10]}


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
    methodology = detect_methodology(pages)
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
    title = extract_title(pdf_path, pages)
    return {"title": title, "fields": fields, "flags": flags, "n_pages": len(pages), "method": method,
            "note": note, "discovered_repo": discovered_repo, "methodology": methodology,
            "model_refs": extract_model_references(pages)}

