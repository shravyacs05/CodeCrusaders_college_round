# CrisisGrid: AI-Powered Research Reproducibility Platform

CrisisGrid analyzes an AI/ML research paper (PDF) and its public GitHub repository, reconstructs the experiment as an editable, executable, traceable graph, runs the experiment in an isolated environment, compares reproduced results to published claims, supports versioned edits with side-by-side comparison, detects methodological data leakage, and produces an evidence-backed report.

> **Core Principle: AI interprets and explains. Deterministic code measures, runs, and compares.** Metrics are read strictly from `metrics.json` produced by actual runs, never parsed from LLM text.

---

## Architecture Overview

CrisisGrid operates across four disciplined layers:

```
1. Upload PDF + repo URL
        |
2. Paper Analyzer: PyMuPDF text/tables + strict JSON extraction (Regex / LLM)
   (Every value has a verified source passage and page number)
        |
3. Repo Scanner: Multi-source scanner (Argparse CLI flags, YAML/JSON configs,
   constants, constructor keyword arguments, seed calls, data leakage detector)
        |
4. Reconciler: Normalizes aliases (lr, num_epochs, bs, wd), classifies findings:
   MATCH / MISMATCH / ONLY_IN_PAPER / ONLY_IN_CODE / MISSING with severity & explanations
        |
5. Spec Builder: Merges into ExperimentSpec (v1) with provenance tags on every value,
   records injectable flags, and generates the React Flow graph
        |
6. Graph UI: Inspect evidence, check read-only parameters, edit injectable flags
   (Edits create child specs with parent diffs)
        |
7. Runner: Sandboxed execution (multi-seed), capturing logs, manifests, metrics
   (Docker runner image with non-root/no network or fresh virtualenv fallback)
        |
8. Verifier: Published vs. reproduced metric delta, seed dispersion, tolerance verdict
        |
9. Version Manager: Compare parent and child versions (single-factor causality verification)
        |
10. Report Generator: Evidence ledger + findings + limitations as HTML and direct PDF
```

---

## Quickstart

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m pytest tests                          # 20 passing unit tests
```

### 2. Pre-seed Demo Data (Instant Demo)
```bash
python ../scripts/seed_demo.py                  # Seeds Demo 1 (Accuracy) & Demo 2 (F1)
```

### 3. Launch the Server
```bash
uvicorn app.main:app --reload                   # Runs at http://localhost:8000
```

The compiled React frontend is included in `frontend/dist` and served directly by FastAPI at `http://localhost:8000`.

### 4. Frontend Development (Optional for Hot-Reloading)
```bash
cd frontend
npm install
npm run dev                                     # Runs at http://localhost:5173
```

---

## Demo Fixtures

CrisisGrid includes two complete synthetic fixtures to demonstrate all features:

1. **Fixture 1 (`fixtures/demo_repo` + `fixtures/demo_paper.pdf`)**:
   - Random Forest Classifier on Breast Cancer dataset (Accuracy metric).
   - Demonstrates parameter mismatch (`n_estimators`: 100 in paper vs. 50 in code) and missing seed.
   - Fully reproducible multi-seed execution.

2. **Fixture 2 (`fixtures/demo_repo_config` + `fixtures/demo_paper_config.pdf`)**:
   - SGD Classifier on Breast Cancer dataset (F1 score metric).
   - Demonstrates multi-source extraction: YAML config (`batch_size: 64`), constant (`TEST_SIZE = 0.25`), constructor kwarg (`random_state=0`), and seed call (`np.random.seed(42)`).
   - Demonstrates **injectability enforcement**: only CLI parameters (`--lr`, `--num_epochs`) are editable in the graph; editing non-injectable parameters (`batch_size`) is rejected to ensure runs reflect user intent.
   - Demonstrates conflict detection and identical-seed warning when no CLI seed flag exists.

To regenerate the fixture PDFs:
```bash
python fixtures/make_demo_paper.py
python fixtures/make_demo_paper_config.py
```

---

## Services Reference

- **`paper_analyzer.py`**: Extracts claims (Accuracy, F1, AUC, Precision, Recall) and hyperparameters from PDF. Validates that quotes appear verbatim in the cited page text to prevent hallucination.
- **`repo_scanner.py`**: Discovers argparse defaults, YAML/JSON configs, constants, constructors, and seeds. Assigns priority and checks for conflicts.
- **`leakage_detector.py`**: AST rules checking for preprocessing transformers (`StandardScaler`, `PCA`, etc.) fitted before `train_test_split` or on the entire dataset.
- **`reconciler.py`**: Normalizes parameter names across code and paper, determines severity, and generates plain-English explanations.
- **`spec_builder.py`**: Merges paper and code into an immutable spec with provenance tags (`paper`, `code`, `user`, `missing`). Flags injectable parameters.
- **`runner.py`**: Runs multi-seed experiments in isolated Docker container (or fresh virtualenv fallback), writing manifests and reading `metrics.json`.
- **`verifier.py`**: Computes difference in percentage points, standard deviation, seed bounds, and reproducibility verdict (`REPRODUCED`, `PARTIALLY_REPRODUCED`, `NOT_REPRODUCED`, `BLOCKED`).
- **`versioning.py`**: Produces immutable specs, computes configuration hashes, and performs single-factor comparative analysis.
- **`report.py`**: Generates comprehensive reproducibility report with evidence ledger as HTML and PDF.

---

## Optional: LLM Paper Extraction & Explanations

CrisisGrid runs 100% deterministically without an LLM. To enable LLM extraction and explanation enrichment:
```bash
export LLM_PROVIDER=anthropic   # or openai
export LLM_MODEL=claude-3-5-sonnet-20241022   # or gpt-4o
export LLM_API_KEY=<your-key>
# export LLM_BASE_URL=<optional custom base url>
```
All LLM extractions remain strictly validated against the extracted page text.
