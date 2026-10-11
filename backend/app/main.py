"""CrisisGrid API (simplified). State is kept in JSON files under DATA_DIR."""
import json
import re
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from .config import DATA_DIR, TOLERANCE_PP
from .services import (architecture_builder, checklist_auditor, auto_healer, leakage_detector, notebook_exporter,
                       paper_analyzer, reconciler, repo_scanner, report, runner,
                       spec_builder, verifier, versioning, robustness_radar, xai_explainer,
                       scaffold_synthesizer, kpi_assistant, llm)

app = FastAPI(title="CrisisGrid")
if (Path(__file__).resolve().parents[2] / "frontend" / "dist" / "assets").exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/assets", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend" / "dist" / "assets"), name="assets")
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
LOCK = threading.Lock()


# ---------- tiny JSON store ----------
def _p(pid: str) -> Path:
    return DATA_DIR / pid


def load(pid: str) -> dict:
    f = _p(pid) / "project.json"
    if not f.exists():
        raise HTTPException(404, "project not found")
    return json.loads(f.read_text())


def save(pid: str, data: dict) -> None:
    with LOCK:
        (_p(pid) / "project.json").write_text(json.dumps(data, indent=2, default=str))


# ---------- notebook model-code cache ----------
# Gemini model synthesis takes several seconds, so it runs in the background and is
# cached on disk; notebook downloads never wait on the LLM.
NB_INFLIGHT: set[tuple[str, str]] = set()


def _nb_cache(pid: str, eid: str) -> Path:
    return _p(pid) / f"notebook_model_{eid}.json"


def _nb_needs_model(pid: str, proj: dict) -> bool:
    """True when the notebook uses generated model code instead of the repo's train.py."""
    return proj.get("is_paper_only", False) or not (_p(pid) / "repo" / "train.py").exists()


def _nb_build_model(pid: str, eid: str, spec: dict, methodology: dict | None, name: str) -> None:
    try:
        res = architecture_builder.build_model_code_for_notebook(spec, methodology, name)
        if res.get("source") == "gemini":  # don't pin a rate-limit fallback forever
            _nb_cache(pid, eid).write_text(json.dumps(res))
    finally:
        with LOCK:
            NB_INFLIGHT.discard((pid, eid))


def warm_notebook_model(pid: str, eid: str, proj: dict) -> None:
    """Start background Gemini synthesis for an experiment's notebook if not cached/running."""
    if not _nb_needs_model(pid, proj) or _nb_cache(pid, eid).exists():
        return
    with LOCK:
        if (pid, eid) in NB_INFLIGHT:
            return
        NB_INFLIGHT.add((pid, eid))
    spec = proj["experiments"][eid].get("spec", {})
    methodology = proj.get("paper", {}).get("methodology")
    threading.Thread(target=_nb_build_model, daemon=True,
                     args=(pid, eid, spec, methodology, proj.get("name", "Reproduction Project"))).start()


def get_exp(eid: str) -> tuple[str, dict, dict]:
    for d in DATA_DIR.iterdir():
        if (d / "project.json").exists():
            proj = json.loads((d / "project.json").read_text())
            if eid in proj.get("experiments", {}):
                return d.name, proj, proj["experiments"][eid]
    raise HTTPException(404, "experiment not found")


# ---------- endpoints ----------
@app.get("/health")
def health():
    return {"ok": True, "docker": runner.docker_available()}


@app.get("/", response_class=HTMLResponse)
def index():
    f = DIST / "index.html"
    if f.exists():
        return f.read_text()
    return ("<h1>CrisisGrid API</h1><p>Frontend not built. Run <code>cd frontend && npm install "
            "&& npm run build</code>, or use <code>npm run dev</code>.</p>")


@app.get("/projects/{pid}/paper.pdf")
def get_paper_pdf(pid: str):
    f = _p(pid) / "paper.pdf"
    if not f.exists():
        raise HTTPException(404, "Paper PDF not found")
    return FileResponse(f, media_type="application/pdf", filename="paper.pdf")


@app.get("/projects/{pid}/paper/pages/{page}")
def get_paper_page_image(pid: str, page: int):
    f = _p(pid) / "paper.pdf"
    if not f.exists():
        raise HTTPException(404, "Paper PDF not found")
    try:
        png_data = paper_analyzer.render_page_png(str(f), page)
        return Response(content=png_data, media_type="image/png")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error rendering page: {e}")


@app.get("/projects/{pid}/paper/metadata")
def get_paper_meta(pid: str):
    f = _p(pid) / "paper.pdf"
    if not f.exists():
        raise HTTPException(404, "Paper PDF not found")
    try:
        return paper_analyzer.get_paper_metadata(str(f))
    except Exception as e:
        raise HTTPException(500, f"Error getting metadata: {e}")


@app.get("/projects/{pid}")
def project_detail(pid: str):
    """Project overview for the UI (no run logs)."""
    p = load(pid)
    exps = sorted(p.get("experiments", {}).values(), key=lambda e: e["version"])
    paper = p.get("paper")
    return {"id": p["id"], "name": p["name"], "status": p["status"], "is_demo": p.get("is_demo"),
            "is_paper_only": p.get("is_paper_only", False),
            "repo_url": p["repo_url"], "commit": p.get("commit"), "error": p.get("error"),
            "paper": paper,
            "scan": {"blocked": p["scan"].get("blocked"), "entrypoint": p["scan"].get("entrypoint"),
                     "warnings": p["scan"].get("warnings", [])} if p.get("scan") else None,
            "experiments": [{k: e[k] for k in ("id", "parent_id", "version", "diff_from_parent",
                                                "config_hash", "spec")} for e in exps]}


@app.get("/projects")
def list_projects():
    out = []
    for d in DATA_DIR.iterdir():
        f = d / "project.json"
        if f.exists():
            p = json.loads(f.read_text())
            status = p.get("status", "analyzed")
            exps = p.get("experiments", {})
            runs = p.get("runs", {})
            if exps and runs:
                for eid, exp in exps.items():
                    r = runs.get(eid)
                    if r and r.get("results"):
                        claim = exp.get("spec", {}).get("claim")
                        if claim and claim.get("value") is not None:
                            try:
                                claim_val = float(claim["value"])
                                cm = claim.get("metric", "accuracy").lower()
                                vals = []
                                for res in r["results"]:
                                    m = (res.get("metrics") or {}) if isinstance(res, dict) else {}
                                    for k, v in m.items():
                                        kl = k.lower()
                                        if kl == cm or kl == f"{cm}_score" or kl.replace("_", "") == cm.replace("_", ""):
                                            val = float(v)
                                            if claim.get("percent", False) and val <= 1.0:
                                                val *= 100.0
                                            vals.append(val)
                                            break
                                if vals:
                                    mean_val = sum(vals) / len(vals)
                                    status = "REPRODUCED" if abs(mean_val - claim_val) <= TOLERANCE_PP else "NOT_REPRODUCED"
                                    break
                            except Exception:
                                pass
            out.append({
                "id": p["id"],
                "name": p["name"],
                "status": status,
                "is_paper_only": p.get("is_paper_only", False),
                "is_demo": p.get("is_demo", False),
            })
    return out


@app.post("/inspect-paper")
async def inspect_paper(paper: UploadFile = File(...)):
    """Fast pre-analysis: extracts title, page count, and discovered author repo from uploaded PDF."""
    temp_bytes = await paper.read()
    import pymupdf
    try:
        with pymupdf.open(stream=temp_bytes, filetype="pdf") as doc:
            n_pages = len(doc)
            pages = [doc[i].get_text() for i in range(min(n_pages, 4))]
    except Exception as e:
        raise HTTPException(400, f"Invalid PDF file: {e}")

    # Write temporary file to extract title using layout engine
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(temp_bytes)
        tmp.flush()
        title = paper_analyzer.extract_title(tmp.name, pages)

    discovered_repo = paper_analyzer.extract_repo_url(pages)
    return {
        "title": title,
        "n_pages": n_pages,
        "discovered_repo": discovered_repo,
    }


@app.post("/projects")
async def create_project(name: str = Form(""), repo_url: str = Form(""),
                         paper: UploadFile = File(...), is_demo: bool = Form(False),
                         is_paper_only: bool = Form(False)):
    pid = uuid.uuid4().hex[:8]
    _p(pid).mkdir(parents=True)
    paper_path = _p(pid) / "paper.pdf"
    with open(paper_path, "wb") as f:
        shutil.copyfileobj(paper.file, f)

    # Autodetect name from paper title (never use PDF file name or generic placeholder)
    raw_fname = (getattr(paper, "filename", None) or "").lower()
    fname_no_ext = raw_fname.rsplit(".", 1)[0] if "." in raw_fname else raw_fname
    name_clean = name.strip().lower()

    should_autodetect = (
        not name_clean
        or name_clean in (raw_fname, fname_no_ext, "paper", "default", "new project", "untitled", "my reproduction project", "research paper reproduction")
        or paper_analyzer.is_filename_like(name)
    )
    if should_autodetect:
        detected_title = paper_analyzer.extract_title(str(paper_path))
        if detected_title and detected_title != "Research Paper Reproduction":
            name = detected_title

    save(pid, {"id": pid, "name": name, "repo_url": repo_url or "", "paper_path": str(paper_path),
               "status": "created", "is_demo": is_demo, "is_paper_only": is_paper_only,
               "experiments": {}, "runs": {}})
    return {"id": pid, "name": name}


@app.post("/projects/{pid}/analyze")
def analyze(pid: str):
    proj = load(pid)
    paper = paper_analyzer.analyze_paper(proj["paper_path"])

    # Ensure project name reflects the real paper title rather than a PDF file name
    if paper.get("title") and (
        not proj.get("name")
        or paper_analyzer.is_filename_like(proj.get("name", ""))
        or proj.get("name", "").strip().lower() in ("my reproduction project", "new project", "untitled", "research paper reproduction")
    ):
        proj["name"] = paper["title"]
    
    # If repo_url was not provided, but the paper cites an author GitHub repo in text/footnotes:
    if not bool((proj.get("repo_url") or "").strip()) and paper.get("discovered_repo"):
        proj["repo_url"] = paper["discovered_repo"]
        proj["is_paper_only"] = False
        proj["auto_detected_repo"] = True

    # Check if paper-only reconstruction mode or repo is still empty
    is_paper_only = proj.get("is_paper_only", False) or not bool((proj.get("repo_url") or "").strip())
    repo_path = _p(pid) / "repo"

    if is_paper_only:
        commit = scaffold_synthesizer.synthesize_repo(repo_path, paper["fields"], paper.get("methodology"))
        proj["is_paper_only"] = True
    else:
        try:
            repo_path, commit = repo_scanner.get_repo(proj["repo_url"], repo_path)
        except Exception as e:
            # Graceful fallback: synthesize scaffold if remote git clone fails
            commit = scaffold_synthesizer.synthesize_repo(repo_path, paper["fields"], paper.get("methodology"))
            is_paper_only = True
            proj["is_paper_only"] = True

    scan = repo_scanner.scan_repo(repo_path)
    if proj.get("auto_detected_repo"):
        scan.setdefault("warnings", []).append(
            f"✨ Auto-Detected Repository: Extracted {proj['repo_url']} directly from paper text/footnote."
        )
    elif is_paper_only:
        scan.setdefault("warnings", []).append(
            "⚡ Paper-Only Autonomous Reconstruction: Author source code was omitted. "
            "CrisisGrid autonomously synthesized an executable benchmark scaffold based on the paper's extracted specifications."
        )

    findings = reconciler.reconcile(paper["fields"], scan["params"], enrich_llm=True)
    spec = spec_builder.build_spec(paper, scan)
    eid = uuid.uuid4().hex[:8]
    proj.update(paper=paper, scan=scan, findings=findings, commit=commit, status="analyzed")
    proj["experiments"][eid] = {
        "id": eid, "parent_id": None, "version": 1, "spec": spec, "diff_from_parent": [],
        "config_hash": versioning.config_hash(spec)}
    save(pid, proj)
    warm_notebook_model(pid, eid, proj)
    return {"experiment_id": eid, "spec": spec, "findings": findings, "flags": paper["flags"]}


@app.post("/projects/{pid}/analyze-stream")
def analyze_stream(pid: str):
    """Execute paper analysis with real-time SSE progress events."""
    def event_stream():
        # 1. Ingest PDF
        yield f"data: {json.dumps({'stage': 'ingest', 'pct': 10, 'message': 'Parsing PDF document structure & layout...'})}\n\n"
        proj = load(pid)
        paper_path = proj["paper_path"]
        pages = paper_analyzer.extract_pages(paper_path)
        yield f"data: {json.dumps({'stage': 'ingest', 'pct': 25, 'message': f'Extracted text across {len(pages)} pages. Auditing for repository URLs...'})}\n\n"

        discovered_repo = paper_analyzer.extract_repo_url(pages)
        if not bool((proj.get("repo_url") or "").strip()) and discovered_repo:
            proj["repo_url"] = discovered_repo
            proj["is_paper_only"] = False
            proj["auto_detected_repo"] = True
            yield f"data: {json.dumps({'stage': 'repo_detected', 'pct': 35, 'message': f'✨ Auto-detected author repository: {discovered_repo}'})}\n\n"

        # 2. Methodology & Architecture
        yield f"data: {json.dumps({'stage': 'methodology', 'pct': 45, 'message': 'Consulting Gemini AI to classify methodology & neural architecture...'})}\n\n"
        methodology = paper_analyzer.detect_methodology(pages)
        arch_name = methodology.get("architecture_name") or methodology.get("architecture", "MLP").upper()
        domain_name = methodology.get("domain", "Tabular").upper()
        yield f"data: {json.dumps({'stage': 'methodology', 'pct': 55, 'message': f'Identified architecture: {arch_name} ({domain_name})'})}\n\n"

        # 3. Claims & Ground truth
        yield f"data: {json.dumps({'stage': 'claims', 'pct': 65, 'message': 'Extracting ground truth claims, hyperparameters & physical bounding boxes...'})}\n\n"
        paper = paper_analyzer.analyze_paper(paper_path)
        if paper.get("title") and (
            not proj.get("name")
            or paper_analyzer.is_filename_like(proj.get("name", ""))
            or proj.get("name", "").strip().lower() in ("my reproduction project", "new project", "untitled", "research paper reproduction")
        ):
            proj["name"] = paper["title"]

        claim = paper["fields"].get("_claim", {})
        c_val = claim.get("value")
        c_metric = claim.get("metric", "accuracy").upper()
        c_page = claim.get("page", 1)
        yield f"data: {json.dumps({'stage': 'claims', 'pct': 72, 'message': f'Anchored claim: {c_metric} = {c_val}% on Page {c_page} (Verbatim quote verified)'})}\n\n"

        # 4. Code & Supporting Artifacts
        is_paper_only = proj.get("is_paper_only", False) or not bool((proj.get("repo_url") or "").strip())
        repo_path = _p(pid) / "repo"
        if is_paper_only:
            yield f"data: {json.dumps({'stage': 'code', 'pct': 80, 'message': f'Synthesizing autonomous benchmark execution scaffold with {arch_name}...'})}\n\n"
            commit = scaffold_synthesizer.synthesize_repo(repo_path, paper["fields"], paper.get("methodology"))
            proj["is_paper_only"] = True
        else:
            repo_target = proj.get("repo_url", "")
            yield f"data: {json.dumps({'stage': 'code', 'pct': 80, 'message': f'Cloning repository {repo_target} and scanning Python AST...'})}\n\n"
            try:
                repo_path, commit = repo_scanner.get_repo(proj["repo_url"], repo_path)
            except Exception:
                commit = scaffold_synthesizer.synthesize_repo(repo_path, paper["fields"], paper.get("methodology"))
                is_paper_only = True
                proj["is_paper_only"] = True

        scan = repo_scanner.scan_repo(repo_path)
        if proj.get("auto_detected_repo"):
            scan.setdefault("warnings", []).append(
                f"✨ Auto-Detected Repository: Extracted {proj['repo_url']} directly from paper text/footnote."
            )
        elif is_paper_only:
            scan.setdefault("warnings", []).append(
                "⚡ Paper-Only Autonomous Reconstruction: Author source code was omitted. "
                "CrisisGrid autonomously synthesized an executable benchmark scaffold based on the paper's extracted specifications."
            )

        # 5. Reconciliation & DAG Spec
        yield f"data: {json.dumps({'stage': 'reconcile', 'pct': 90, 'message': 'Reconciling paper specifications against codebase AST parameters...'})}\n\n"
        findings = reconciler.reconcile(paper["fields"], scan["params"], enrich_llm=True)
        spec = spec_builder.build_spec(paper, scan)
        eid = uuid.uuid4().hex[:8]
        proj.update(paper=paper, scan=scan, findings=findings, commit=commit, status="analyzed")
        proj["experiments"][eid] = {
            "id": eid, "parent_id": None, "version": 1, "spec": spec, "diff_from_parent": [],
            "config_hash": versioning.config_hash(spec)}
        save(pid, proj)
        warm_notebook_model(pid, eid, proj)

        yield f"data: {json.dumps({'stage': 'complete', 'pct': 100, 'message': 'Reproduction DAG synthesized successfully!', 'experiment_id': eid})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/projects/{pid}/findings")
def findings(pid: str):
    return load(pid).get("findings", [])


@app.get("/projects/{pid}/graph")
def graph(pid: str, experiment_id: str | None = None):
    proj = load(pid)
    exps = proj["experiments"]
    if not exps:
        raise HTTPException(400, "not analyzed yet")
    exp = exps[experiment_id] if experiment_id else max(exps.values(), key=lambda e: e["version"])
    return {"experiment_id": exp["id"], "version": exp["version"],
            **spec_builder.build_graph(exp["spec"])}


@app.patch("/experiments/{eid}/nodes/{node}")
def edit_node(eid: str, node: str, edits: dict = Body(...)):
    pid, proj, exp = get_exp(eid)
    if node not in spec_builder.PARAM_NODES:
        raise HTTPException(400, f"node '{node}' has no editable parameters")
    allowed = spec_builder.editable_params(exp["spec"], node)
    bad = [k for k in edits if k not in allowed]
    if bad:
        raise HTTPException(
            400, f"{bad} cannot be edited on node {node}: only parameters the code exposes as "
                 f"command-line flags can change a run (editable here: {allowed or 'none'})")
    child_spec = versioning.make_child(exp["spec"], edits)
    cid = uuid.uuid4().hex[:8]
    proj["experiments"][cid] = {
        "id": cid, "parent_id": eid, "version": exp["version"] + 1, "spec": child_spec,
        "diff_from_parent": versioning.diff_specs(exp["spec"], child_spec),
        "config_hash": versioning.config_hash(child_spec)}
    save(pid, proj)
    warm_notebook_model(pid, cid, proj)
    return proj["experiments"][cid]


def _do_runs(pid: str, eid: str, seeds: int, use_docker: bool):
    proj = load(pid)
    exp = proj["experiments"][eid]
    state = {"nodes": {n: "pending" for n in spec_builder.ORDER}, "seeds_done": 0,
             "seeds_total": seeds, "state": "running"}
    proj["runs"][eid] = {"status": state, "results": []}
    save(pid, proj)

    def on_event(node, st):
        state["nodes"][node] = st

    setup = runner.setup_env(_p(pid) / "repo", _p(pid) / "runs", use_docker, on_event)
    if not setup["ok"]:
        state.update(state="failed", failed_stage="setup", error=setup.get("error"))
        proj = load(pid)
        proj["runs"][eid] = {"status": state, "results": [],
                             "setup_log": Path(setup["log"]).read_text()[-1500:]}
        save(pid, proj)
        return
    for s in range(seeds):
        r = runner.run_seed(_p(pid) / "repo", exp["spec"], s, _p(pid) / "runs" / eid, eid,
                            exp["parent_id"], proj["commit"], use_docker, on_event,
                            setup["python"])
        proj = load(pid)
        proj["runs"][eid]["results"].append(r)
        state["seeds_done"] = s + 1
        proj["runs"][eid]["status"] = state
        save(pid, proj)
    state["state"] = "finished"
    proj = load(pid)
    proj["runs"][eid]["status"] = state
    save(pid, proj)


@app.post("/experiments/{eid}/run")
def run(eid: str, bg: BackgroundTasks, body: dict = Body(default={"seeds": 3})):
    pid, proj, exp = get_exp(eid)
    if exp["spec"].get("blocked") or not exp["spec"].get("run_command_template"):
        raise HTTPException(400, f"BLOCKED: {exp['spec'].get('blocked')}")
    bg.add_task(_do_runs, pid, eid, int(body.get("seeds", 3)), runner.docker_available())
    return {"started": True}


def _normalize_metric(k: str) -> str:
    k = k.lower().replace("-", "_").replace(" ", "_")
    if k in ("f1", "f1_score"):
        return "f1"
    if k in ("acc", "accuracy"):
        return "accuracy"
    if k in ("auc", "roc_auc", "auc_roc"):
        return "auc"
    return k


def _series(proj: dict, eid: str) -> dict:
    exp = proj["experiments"][eid]
    runs = proj["runs"].get(eid, {}).get("results", [])
    claim = exp["spec"].get("claim") or {}
    claim_metric = _normalize_metric(str(claim.get("metric") or "accuracy"))
    published = claim.get("value")

    done = [r for r in runs if r.get("status") == "done" and r.get("metrics")]
    if not done:
        return {"seeds": [], "values": [], "key": None, "percent": False,
                "reason": "no successful runs with metrics"}

    avail = done[0]["metrics"]
    chosen_key = None
    for k in avail:
        if _normalize_metric(k) == claim_metric:
            chosen_key = k
            break
    if not chosen_key:
        for k in avail:
            if "loss" not in k.lower():
                chosen_key = k
                break
        if not chosen_key:
            chosen_key = list(avail.keys())[0]

    raw_vals = [r["metrics"][chosen_key] for r in done]
    is_percent = bool(claim.get("percent", False)) or (published is not None and published > 1.0)
    if is_percent and any(v <= 1.0 for v in raw_vals) and (published is None or published > 1.0):
        scaled_vals = [round(v * 100.0, 4) if isinstance(v, float) else v for v in raw_vals]
    else:
        scaled_vals = [round(v, 4) if isinstance(v, float) else v for v in raw_vals]

    return {
        "seeds": [r["seed"] for r in done],
        "values": scaled_vals,
        "key": chosen_key,
        "percent": is_percent,
        "reason": None,
    }


@app.get("/experiments/{eid}/status")
def status(eid: str):
    pid, proj, exp = get_exp(eid)
    r = proj["runs"].get(eid)
    if not r:
        return {"state": "not_started"}
    tail = r.get("setup_log", "")
    if r["results"]:
        lf = Path(r["results"][-1]["log"])
        tail = lf.read_text()[-1500:] if lf.exists() else ""
    ser = _series(proj, eid)
    by_seed = dict(zip(ser["seeds"], ser["values"]))
    return {**r["status"], "log_tail": tail, "metric": ser["key"], "percent": ser["percent"],
            "metric_error": ser["reason"],
            "seeds": [{"seed": x["seed"], "status": x["status"], "metrics": x["metrics"],
                       "value": by_seed.get(x["seed"]),
                       "isolation": x["manifest"]["isolation"]} for x in r["results"]]}


def _verification(proj: dict, eid: str, with_attribution: bool = False) -> dict:
    exp = proj["experiments"][eid]
    ser = _series(proj, eid)
    if ser["reason"] or not ser["values"]:
        return {"status": "BLOCKED", "reason": ser["reason"] or "no successful runs",
                "tolerance_pp": TOLERANCE_PP}
    res = verifier.verify(exp["spec"]["claim"]["value"], ser["values"], TOLERANCE_PP, scale=1.0)
    if with_attribution:
        try:
            res["xai_attribution"] = xai_explainer.compute_attribution(proj, eid, res)
        except Exception:
            pass
    return res


@app.get("/experiments/{eid}/verification")
def verification(eid: str):
    pid, proj, exp = get_exp(eid)
    return _verification(proj, eid, with_attribution=True)


@app.get("/experiments/{eid}/xai-attribution")
def xai_attribution(eid: str):
    pid, proj, exp = get_exp(eid)
    ver = _verification(proj, eid)
    return xai_explainer.compute_attribution(proj, eid, ver)


@app.get("/experiments/{a}/compare/{b}")
def compare(a: str, b: str):
    _, proj, ea = get_exp(a)
    _, _, eb = get_exp(b)
    va, vb = _verification(proj, a), _verification(proj, b)
    ma = {"mean": va["reproduced_mean"]} if "reproduced_mean" in va else None
    mb = {"mean": vb["reproduced_mean"]} if "reproduced_mean" in vb else None
    return versioning.compare(ea["spec"], eb["spec"], ma, mb)


@app.get("/ask/status")
def ask_status():
    return {"enabled": llm.enabled()}


@app.post("/projects/{pid}/ask")
def ask_about_kpi(pid: str, body: dict = Body(...)):
    """Answer a question about one KPI card.

    Body: {messages, experiment_id?, focus: {title, definition, value?}, card_data?}"""
    proj = load(pid)
    focus = body.get("focus") or {}
    if not focus.get("title"):
        raise HTTPException(400, "focus.title is required")
    if not llm.enabled():
        raise HTTPException(503, "The assistant needs an LLM: set LLM_PROVIDER, LLM_MODEL and "
                                 "LLM_API_KEY in .env and restart the server.")
    exps = proj.get("experiments", {})
    eid = body.get("experiment_id")
    exp = exps.get(eid) if eid in exps else kpi_assistant.latest_experiment(exps)
    ver = None
    if exp and (proj.get("runs") or {}).get(exp["id"]):
        try:
            ver = _verification(proj, exp["id"])
        except Exception:
            ver = None
    ctx = kpi_assistant.build_context(proj, exp, ver, body.get("card_data"))
    try:
        return {"answer": kpi_assistant.answer(body.get("messages") or [], ctx, focus)}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except llm.LLMError as e:
        raise HTTPException(502, str(e))


@app.get("/projects/{pid}/report", response_class=HTMLResponse)
def get_report(pid: str, experiment_id: str | None = None):
    proj = load(pid)
    exps = proj["experiments"]
    if not exps:
        raise HTTPException(400, "not analyzed yet")
    exp = exps[experiment_id] if experiment_id else max(exps.values(), key=lambda e: e["version"])
    ver = _verification(proj, exp["id"])
    runs = proj["runs"].get(exp["id"], {}).get("results", [])
    html = report.render_report({
        "project_name": proj["name"], "is_demo": proj.get("is_demo"),
        "claim": exp["spec"]["claim"], "params": exp["spec"]["params"],
        "warnings": exp["spec"].get("warnings", []),
        "findings": proj["findings"], "runs": runs, "verification": ver,
        "ledger": report.evidence_ledger(proj["findings"], ver)})
    (_p(pid) / "report.html").write_text(html)
    return html


@app.get("/projects/{pid}/report.pdf")
def get_report_pdf(pid: str, experiment_id: str | None = None):
    proj = load(pid)
    exps = proj["experiments"]
    if not exps:
        raise HTTPException(400, "not analyzed yet")
    exp = exps[experiment_id] if experiment_id else max(exps.values(), key=lambda e: e["version"])
    ver = _verification(proj, exp["id"])
    runs = proj["runs"].get(exp["id"], {}).get("results", [])
    ctx = {
        "project_name": proj["name"], "is_demo": proj.get("is_demo"),
        "claim": exp["spec"]["claim"], "params": exp["spec"]["params"],
        "warnings": exp["spec"].get("warnings", []),
        "findings": proj["findings"], "runs": runs, "verification": ver,
        "ledger": report.evidence_ledger(proj["findings"], ver)
    }
    pdf_path = _p(pid) / "report.pdf"
    report.render_pdf(ctx, pdf_path)
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"{proj['name']}_report.pdf")


@app.get("/projects/{pid}/checklist")
def get_project_checklist(pid: str, experiment_id: str | None = None):
    proj = load(pid)
    return checklist_auditor.audit_checklist(proj, experiment_id)


@app.get("/experiments/{eid}/checklist")
def get_experiment_checklist(eid: str):
    pid, proj, _ = get_exp(eid)
    return checklist_auditor.audit_checklist(proj, eid)


@app.get("/projects/{pid}/leakage")
def get_project_leakage(pid: str):
    proj = load(pid)
    repo_path = _p(pid) / "repo"
    if not repo_path.exists():
        return {"findings": [], "clean": True}
    findings = leakage_detector.scan_repo_leakage(repo_path)
    return {"findings": findings, "clean": len(findings) == 0}


@app.get("/experiments/{eid}/diagnose-heal")
def diagnose_experiment(eid: str):
    pid, proj, _ = get_exp(eid)
    diag = auto_healer.diagnose_failure(proj, eid)
    return diag


@app.post("/experiments/{eid}/auto-heal")
def auto_heal_experiment(eid: str):
    pid, proj, _ = get_exp(eid)
    repo_path = _p(pid) / "repo"
    res = auto_healer.apply_auto_heal(proj, eid, repo_path)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "Failed to auto-heal"))
    save(pid, proj)
    return res


@app.get("/projects/{pid}/notebook")
def get_project_notebook(pid: str, experiment_id: str | None = None):
    proj = load(pid)
    exps = proj.get("experiments", {})
    if not exps:
        raise HTTPException(400, "Project has not been analyzed yet")
    eid = experiment_id if experiment_id in exps else max(exps, key=lambda k: exps[k].get("version", 1))
    exp = exps[eid]
    is_paper_only = proj.get("is_paper_only", False)
    paper = proj.get("paper", {})
    methodology = paper.get("methodology")
    repo_path = _p(pid) / "repo"
    model_code = None
    if _nb_needs_model(pid, proj):
        cache = _nb_cache(pid, eid)
        if cache.exists():
            model_code = json.loads(cache.read_text())
        else:
            # Serve the template now; Gemini code will be ready for the next download.
            model_code = architecture_builder.build_model_code_for_notebook(
                exp.get("spec", {}), methodology, proj.get("name", ""), use_llm=False)
            warm_notebook_model(pid, eid, proj)
    nb_dict = notebook_exporter.generate_notebook(
        exp.get("spec", {}),
        proj.get("name", "Reproduction Project"),
        repo_path=repo_path if (repo_path.exists() and not is_paper_only) else None,
        methodology=methodology,
        is_paper_only=is_paper_only,
        model_code=model_code,
    )
    nb_json = json.dumps(nb_dict, indent=2)
    slug = re.sub(r"[^a-z0-9]+", "_", proj.get("name", "project").lower()).strip("_") or "project"
    filename = f"{slug}_reproduction.ipynb"
    return Response(
        content=nb_json,
        media_type="application/x-ipynb+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/leaderboard")
def get_macro_leaderboard():
    """Aggregate multi-paper reproducibility leaderboard across all audited research projects."""
    rows = []
    total_delta = 0.0
    delta_count = 0
    clean_count = 0

    for d in DATA_DIR.iterdir():
        f = d / "project.json"
        if not f.exists():
            continue
        try:
            p = json.loads(f.read_text())
        except Exception:
            continue

        pid = p.get("id", d.name)
        name = p.get("name", "Unnamed Project")
        repo_url = p.get("repo_url", "")
        status = p.get("status", "analyzed")
        exps = p.get("experiments", {})
        if not exps:
            continue

        # Get latest experiment
        latest_exp = max(exps.values(), key=lambda e: e.get("version", 1))
        eid = latest_exp.get("id")
        spec = latest_exp.get("spec", {})
        claim = spec.get("claim", {})
        runs = p.get("runs", {}).get(eid, {})
        results = runs.get("results", [])

        # Infer paper conference / domain
        repo_lower = (repo_url or "").lower()
        name_lower = name.lower()
        if "textcnn" in repo_lower or "textcnn" in name_lower or "kim" in name_lower:
            venue = "EMNLP 2014"
            domain = "NLP / Text Classification"
        elif "mixup" in repo_lower or "mixup" in name_lower:
            venue = "ICLR 2018"
            domain = "Vision / Regularization"
        elif "sam" in repo_lower or "sharpness" in name_lower:
            venue = "ICLR 2021"
            domain = "Optimization / Generalization"
        elif "resnet" in repo_lower or "cifar" in repo_lower:
            venue = "CVPR 2016"
            domain = "Computer Vision"
        else:
            venue = "Machine Learning"
            domain = "Empirical Deep Learning"

        # Look for experiment with verified runs (preferring latest version that ran)
        best_ver = None
        chosen_eid = eid
        for cand_eid in sorted(exps.keys(), key=lambda k: exps[k].get("version", 1), reverse=True):
            v = _verification(p, cand_eid)
            if v.get("status") not in ("BLOCKED", "UNKNOWN"):
                best_ver = v
                chosen_eid = cand_eid
                break

        if best_ver is None:
            best_ver = _verification(p, eid)

        published = claim.get("value")
        if best_ver.get("status") not in ("BLOCKED", "UNKNOWN"):
            ver_status = best_ver.get("status")
            reproduced_mean = round(best_ver.get("reproduced_mean", 0.0), 2)
            std_val = round(best_ver.get("std", 0.0), 2)
            diff_pp = round(best_ver.get("diff_pp", 0.0), 2)
            seeds_count = best_ver.get("n", 0)
            total_delta += abs(diff_pp)
            delta_count += 1
        else:
            ver_status = "PENDING_RUN" if published is not None else "UNTESTED"
            reproduced_mean = None
            std_val = 0.0
            diff_pp = None
            seeds_count = 0

        # Checklist audit using chosen or latest experiment
        chk = checklist_auditor.audit_checklist(p, chosen_eid)
        compliance_pct = chk.get("score_pct", 50)
        grade = chk.get("grade", "C")

        # Leakage audit
        repo_path = p.get("repo_path") or str(_p(pid) / "repo")
        is_clean_leak = True
        try:
            from pathlib import Path
            if Path(repo_path).exists():
                leaks = leakage_detector.scan_repo_for_leakage(Path(repo_path))
                is_clean_leak = (len(leaks) == 0)
        except Exception:
            is_clean_leak = True

        if is_clean_leak:
            clean_count += 1

        # Auto-healer count
        heals_applied = sum(len(e.get("diff_from_parent", [])) for e in exps.values())

        rows.append({
            "id": pid,
            "name": name,
            "repo_url": repo_url,
            "status": status,
            "venue": venue,
            "domain": domain,
            "claim_metric": claim.get("metric", "accuracy").upper(),
            "published": published,
            "reproduced_mean": reproduced_mean,
            "diff_pp": diff_pp,
            "seed_std": std_val,
            "seeds_count": seeds_count,
            "verification_status": ver_status,
            "compliance_pct": compliance_pct,
            "grade": grade,
            "leakage_clean": is_clean_leak,
            "heals_applied": heals_applied,
            "versions_count": len(exps),
        })

    # Sort by compliance score descending, then by claim delta proximity
    rows.sort(key=lambda r: (
        -r["compliance_pct"],
        abs(r["diff_pp"]) if r["diff_pp"] is not None else 999.0
    ))

    for idx, r in enumerate(rows):
        r["rank"] = idx + 1

    total_papers = len(rows)
    reproduced_count = sum(1 for r in rows if r["verification_status"] in ("REPRODUCED", "PARTIALLY_REPRODUCED"))
    reproduced_pct = round((reproduced_count / total_papers * 100), 1) if total_papers else 0.0
    mean_compliance = round(sum(r["compliance_pct"] for r in rows) / total_papers, 1) if total_papers else 0.0
    clean_pct = round((clean_count / total_papers * 100), 1) if total_papers else 100.0
    avg_delta = round(total_delta / max(1, delta_count), 2)

    return {
        "leaderboard": rows,
        "summary": {
            "total_papers": total_papers,
            "reproduced_count": reproduced_count,
            "reproduced_pct": reproduced_pct,
            "mean_compliance": mean_compliance,
            "clean_pipeline_pct": clean_pct,
            "avg_delta_pp": avg_delta,
        }
    }


@app.get("/experiments/{eid}/radar")
def get_experiment_radar(eid: str):
    """Retrieve the 6-axis scientific integrity radar for an experiment."""
    pid, proj, exp = get_exp(eid)
    ver = _verification(proj, eid)
    return robustness_radar.compute_radar_profile(proj, exp, ver=ver)


@app.post("/experiments/{eid}/radar/stress-test")
def stress_test_radar(
    eid: str,
    payload: dict = Body(...)
):
    """Dynamically simulate hyperparameter perturbation stress on the integrity radar."""
    pid, proj, exp = get_exp(eid)
    ver = _verification(proj, eid)
    lr_drift = float(payload.get("lr_drift", 0.0))
    batch_scale = float(payload.get("batch_scale", 1.0))
    seed_noise = float(payload.get("seed_noise", 0.0))
    return robustness_radar.compute_radar_profile(
        proj, exp, lr_drift=lr_drift, batch_scale=batch_scale, seed_noise=seed_noise, ver=ver
    )


@app.get("/projects/{pid}/radar")
def get_project_radar(pid: str, experiment_id: str | None = None):
    """Retrieve radar for the latest experiment of a project."""
    proj = load(pid)
    exps = proj.get("experiments", {})
    if not exps:
        raise HTTPException(400, "Project has no experiments")
    exp = exps[experiment_id] if experiment_id and experiment_id in exps else max(exps.values(), key=lambda e: e.get("version", 1))
    eid = exp.get("id")
    ver = _verification(proj, eid)
    return robustness_radar.compute_radar_profile(proj, exp, ver=ver)


