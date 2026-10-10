"""CrisisGrid API (simplified). State is kept in JSON files under DATA_DIR."""
import json
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from .config import DATA_DIR, TOLERANCE_PP
from .services import (checklist_auditor, auto_healer, leakage_detector,
                       paper_analyzer, reconciler, repo_scanner, report, runner,
                       spec_builder, verifier, versioning)

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


@app.get("/projects/{pid}")
def project_detail(pid: str):
    """Project overview for the UI (no run logs)."""
    p = load(pid)
    exps = sorted(p.get("experiments", {}).values(), key=lambda e: e["version"])
    paper = p.get("paper")
    return {"id": p["id"], "name": p["name"], "status": p["status"], "is_demo": p.get("is_demo"),
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
            out.append({"id": p["id"], "name": p["name"], "status": p["status"]})
    return out


@app.post("/projects")
async def create_project(name: str = Form(...), repo_url: str = Form(...),
                         paper: UploadFile = File(...), is_demo: bool = Form(False)):
    pid = uuid.uuid4().hex[:8]
    _p(pid).mkdir(parents=True)
    paper_path = _p(pid) / "paper.pdf"
    with open(paper_path, "wb") as f:
        shutil.copyfileobj(paper.file, f)
    save(pid, {"id": pid, "name": name, "repo_url": repo_url, "paper_path": str(paper_path),
               "status": "created", "is_demo": is_demo, "experiments": {}, "runs": {}})
    return {"id": pid}


@app.post("/projects/{pid}/analyze")
def analyze(pid: str):
    proj = load(pid)
    paper = paper_analyzer.analyze_paper(proj["paper_path"])
    try:
        repo_path, commit = repo_scanner.get_repo(proj["repo_url"], _p(pid) / "repo")
    except Exception as e:
        proj["status"] = "blocked"
        proj["error"] = f"Could not fetch repo: {e}"
        save(pid, proj)
        raise HTTPException(400, proj["error"])
    scan = repo_scanner.scan_repo(repo_path)
    findings = reconciler.reconcile(paper["fields"], scan["params"], enrich_llm=True)
    spec = spec_builder.build_spec(paper, scan)
    eid = uuid.uuid4().hex[:8]
    proj.update(paper=paper, scan=scan, findings=findings, commit=commit, status="analyzed")
    proj["experiments"][eid] = {
        "id": eid, "parent_id": None, "version": 1, "spec": spec, "diff_from_parent": [],
        "config_hash": versioning.config_hash(spec)}
    save(pid, proj)
    return {"experiment_id": eid, "spec": spec, "findings": findings, "flags": paper["flags"]}


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


def _verification(proj: dict, eid: str) -> dict:
    exp = proj["experiments"][eid]
    ser = _series(proj, eid)
    if ser["reason"] or not ser["values"]:
        return {"status": "BLOCKED", "reason": ser["reason"] or "no successful runs",
                "tolerance_pp": TOLERANCE_PP}
    return verifier.verify(exp["spec"]["claim"]["value"], ser["values"], TOLERANCE_PP, scale=1.0)


@app.get("/experiments/{eid}/verification")
def verification(eid: str):
    pid, proj, exp = get_exp(eid)
    return _verification(proj, eid)


@app.get("/experiments/{a}/compare/{b}")
def compare(a: str, b: str):
    _, proj, ea = get_exp(a)
    _, _, eb = get_exp(b)
    va, vb = _verification(proj, a), _verification(proj, b)
    ma = {"mean": va["reproduced_mean"]} if "reproduced_mean" in va else None
    mb = {"mean": vb["reproduced_mean"]} if "reproduced_mean" in vb else None
    return versioning.compare(ea["spec"], eb["spec"], ma, mb)


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

