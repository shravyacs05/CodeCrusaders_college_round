"""Architecture Builder: AI-driven synthesis of domain & paper-specific model code.

Leverages Google Gemini (or configured LLM) to construct accurate, executable
neural network architectures (PyTorch or Scikit-Learn) directly from paper methodology
and extracted hyperparameters, rather than solely relying on fixed template rules.

Falls back gracefully to curated template library if LLM is disabled or unavailable.
"""
from __future__ import annotations
import ast
import json
import logging
from typing import Any

from . import llm, model_templates

logger = logging.getLogger(__name__)

LLM_ARCH_BUILDER_SYSTEM = """You are an elite PyTorch ML systems engineer and researcher in CrisisGrid.
Given a research paper's methodology, ground truth claim, and hyperparameters, generate complete,
self-contained, fully executable Python code for a Jupyter Notebook cell that defines the model architecture
and runs a training & evaluation pipeline.

STRICT REQUIREMENTS:
1. Return ONLY a valid JSON object matching:
{
  "architecture_name": string (e.g. "TextCNN (Yoon Kim 2014)", "ResNet-18", "Bi-LSTM Sentiment"),
  "framework": "pytorch" | "sklearn",
  "code": string (raw executable Python code, no markdown ``` blocks),
  "notes": string (1-2 sentence description of methodology alignment)
}
2. The generated Python code MUST be 100% syntactically valid Python 3.
3. Assume DEFAULT_SEED (int) and PARAMS (dict) are ALREADY defined in earlier notebook cells.
4. Safely extract parameters using helper logic or `.get(key, default)`. Note that PARAMS values might be scalars or dicts like `{"value": ...}`.
   Example safe access:
     def _p(k, default):
         v = PARAMS.get(k)
         return v.get("value", default) if isinstance(v, dict) else (v if v is not None else default)
5. Synthesize a clean, small in-memory dataset (e.g. 400-800 samples) matching the domain (token sequences for NLP, tensor images for CV, synthetic features for Tabular) so execution runs reliably without downloading external files.
6. Build the exact model architecture specified in the paper (e.g. for TextCNN: embedding layer, multiple conv filters with kernel sizes from PARAMS or [3, 4, 5], max-over-time pooling, dropout, linear head).
7. Train for epochs (default 5 or from PARAMS), evaluate test accuracy/metric, and store the final test metric in `empirical_value` (as a percentage float between 0.0 and 100.0, e.g. `empirical_value = (correct / total) * 100.0`).
8. Print clear progress and final results.
"""


def build_model_code_for_notebook(
    spec: dict[str, Any],
    methodology: dict[str, Any] | None = None,
    project_name: str = ""
) -> dict[str, Any]:
    """Generate executable model architecture code for Jupyter Notebook using Gemini with template fallback.

    Returns:
        dict with keys:
            - "code": str
            - "architecture_name": str
            - "framework": str
            - "source": "gemini" | "template"
            - "notes": str
    """
    claim = spec.get("claim", {})
    params = spec.get("params", {})
    meth = methodology or {}
    arch = meth.get("architecture") or meth.get("canonical_architecture") or "mlp"
    domain = meth.get("domain") or meth.get("canonical_domain") or "tabular"

    # Attempt Gemini generation if enabled
    if llm.enabled():
        try:
            user_prompt = f"""Project / Paper: {project_name or 'Research Paper'}
Published Claim: {claim.get('metric', 'accuracy').upper()} = {claim.get('value')}{'%' if claim.get('percent') else ''} (Quote: "{claim.get('quote', '')}")
Detected Architecture: {meth.get('architecture_name') or arch} ({domain})
Methodology Summary: {meth.get('model_summary', 'Not specified')}
Architectural Components: {json.dumps(meth.get('components', []))}
Extracted Parameters: {json.dumps(params)}

Generate the complete executable training cell using PARAMS and DEFAULT_SEED."""

            res = llm.complete_json(LLM_ARCH_BUILDER_SYSTEM, user_prompt)
            code = res.get("code", "").strip()

            # Strip any accidental markdown formatting if present
            if code.startswith("```"):
                lines = code.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                code = "\n".join(lines).strip()

            # Validate syntax with AST parser
            ast.parse(code)

            return {
                "code": code,
                "architecture_name": res.get("architecture_name") or f"{arch.upper()} Model",
                "framework": res.get("framework") or "pytorch",
                "source": "gemini",
                "notes": res.get("notes") or "Synthesized by Gemini AI from paper methodology.",
            }
        except Exception as e:
            logger.warning(f"Gemini architecture synthesis fallback to template: {e}")

    # Fallback: Curated deterministic template library
    fallback_code = model_templates.get_model_template(arch, domain)
    return {
        "code": fallback_code,
        "architecture_name": f"{arch.upper()} Template ({domain.upper()})",
        "framework": "pytorch" if "torch" in fallback_code else "sklearn",
        "source": "template",
        "notes": "Generated from curated reproducible architecture template library.",
    }


LLM_SCAFFOLD_SYSTEM = """You are an elite PyTorch ML systems engineer in CrisisGrid.
Generate a complete, self-contained, standalone Python script (`train.py`) that implements
the exact research model architecture described in the paper.

STRICT REQUIREMENTS:
1. Return ONLY a valid JSON object matching:
{
  "train_py": string (raw python code, no markdown ``` blocks),
  "requirements_txt": string,
  "architecture_name": string
}
2. The script must accept CLI arguments via argparse:
   --lr (float)
   --batch_size (int)
   --epochs (int)
   --seed (int)
   --out (str, required): Path to output metrics JSON file
3. The script must build the exact paper model architecture, train on a synthetic domain dataset,
   evaluate test accuracy, and write metrics to `--out`:
   {
     "accuracy": float (percentage 0..100),
     "f1": float,
     "loss": float,
     "epochs": int,
     "seed": int
   }
4. Must be 100% syntactically valid Python 3.
"""


def build_scaffold_with_llm(
    paper_fields: dict[str, Any],
    methodology: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    """Generate domain-specific train.py using Gemini for paper-only reproduction scaffolds."""
    if not llm.enabled():
        return None

    try:
        meth = methodology or {}
        arch = meth.get("architecture") or meth.get("canonical_architecture") or "mlp"
        domain = meth.get("domain") or meth.get("canonical_domain") or "tabular"
        claim = paper_fields.get("_claim", {})

        user_prompt = f"""Target Claim: {claim.get('metric', 'accuracy')} = {claim.get('value')}
Architecture: {meth.get('architecture_name') or arch} ({domain})
Methodology Summary: {meth.get('model_summary', '')}
Components: {json.dumps(meth.get('components', []))}
Hyperparameters: {json.dumps(paper_fields)}

Generate standalone train.py and requirements.txt."""

        res = llm.complete_json(LLM_SCAFFOLD_SYSTEM, user_prompt)
        train_py = res.get("train_py", "").strip()

        if train_py.startswith("```"):
            lines = train_py.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            train_py = "\n".join(lines).strip()

        ast.parse(train_py)
        return {
            "train_py": train_py,
            "requirements_txt": res.get("requirements_txt", "numpy>=1.22.0\nscikit-learn>=1.0.0\ntorch>=2.0.0\n"),
            "architecture_name": res.get("architecture_name", arch),
        }
    except Exception as e:
        logger.warning(f"LLM scaffold generation failed, falling back: {e}")
        return None
