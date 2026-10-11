"""Checkpoint-recovery demo: missing trained weights -> identified -> downloaded -> verified -> reproduced.

Walks through the pipeline step by step in the terminal and saves a normal CrisisGrid project
(visible in the dashboard, with the HTML report) under DATA_DIR.

    python scripts/checkpoint_demo.py                       # DistilBERT / SST-2 fixture (default)
    python scripts/checkpoint_demo.py --repo https://github.com/ProsusAI/finBERT --paper finbert.pdf --no-run
    python scripts/checkpoint_demo.py --no-llm --seeds 1

The first run of a project creates its virtualenv and installs the repo's requirements (CPU torch +
transformers), which takes a few minutes; pass --project <id> to re-run inside an existing project.
"""
import argparse
import json
import os
import shutil
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(line_buffering=True)

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--paper", default=str(ROOT / "fixtures" / "demo_paper_checkpoint.pdf"))
ap.add_argument("--repo", default=str(ROOT / "fixtures" / "demo_repo_checkpoint"))
ap.add_argument("--name", default=None)
ap.add_argument("--seeds", type=int, default=1, help="evaluating a fixed checkpoint is deterministic")
ap.add_argument("--no-run", action="store_true", help="stop after download + verification")
ap.add_argument("--no-llm", action="store_true", help="deterministic regex extraction only")
ap.add_argument("--project", default=None, help="reuse an existing demo project id (skips reinstall)")
args = ap.parse_args()
if args.no_llm:
    os.environ["LLM_PROVIDER"] = "none"
    os.environ["LLM_API_KEY"] = os.environ["GEMINI_API_KEY"] = ""

from app import main as api  # noqa: E402
from app.config import DATA_DIR  # noqa: E402
from app.services import (paper_analyzer, reconciler, repo_scanner, report, runner,  # noqa: E402
                          spec_builder, versioning)

BOLD, DIM, GREEN, RED, YELLOW, END = "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[0m"


def step(n: int, title: str):
    print(f"\n{BOLD}── Step {n}: {title} {'─' * max(0, 60 - len(title))}{END}")


def main() -> int:
    pid = args.project or uuid.uuid4().hex[:8]
    pdir = DATA_DIR / pid
    pdir.mkdir(parents=True, exist_ok=True)
    paper_path = pdir / "paper.pdf"
    shutil.copyfile(args.paper, paper_path)

    # ── 1. Scan the repository ─────────────────────────────────────────────
    step(1, "Scan the repository")
    repo_path, commit = repo_scanner.get_repo(args.repo, pdir / "repo")
    scan = repo_scanner.scan_repo(repo_path)
    w = scan["weights"]
    print(f"repo: {args.repo}  (commit {commit[:12]})")
    print(f"entrypoint: {scan['entrypoint']}   run template: {DIM}{scan['run_template']}{END}")
    print("model-weight loads found in the code:")
    for r in w["references"]:
        what = r["value"] or (f"--{r['flag']} (no default)" if r["flag"] else r["expr"])
        aux = f" {DIM}(tokenizer/config){END}" if r["aux"] else ""
        print(f"  {r['file']}:{r['line']:<4} {r['loader']:<50} {what}  [{r['status']}]{aux}")

    # ── 2. Are the weights in the repo? ────────────────────────────────────
    step(2, "Check whether the trained weights ship with the repo")
    files = w["local_weight_files"]
    print(f"weight files in repo: {[f['path'] for f in files] or 'none'}")
    if w["missing"]:
        for m in w["missing"]:
            print(f"  {RED}MISSING{END} {m['file']}:{m['line']} needs "
                  f"{m['value'] or '--' + str(m['flag'])}")
    else:
        print(f"weights status: {w['status']}")

    # ── 3. Identify the checkpoint ─────────────────────────────────────────
    step(3, "Identify the intended checkpoint (paper + README + code -> Hub)")
    paper = paper_analyzer.analyze_paper(str(paper_path))
    pages = paper_analyzer.extract_pages(str(paper_path))
    paper_analyzer.apply_repo_table_claim(paper, str(paper_path), repo_path)
    claim = paper["fields"]["_claim"]
    print(f"paper claim: {claim['metric']} = {claim['value']}  {DIM}(p.{claim['page']}: \"{claim['quote']}\"){END}")
    for h in paper["model_refs"]["hub_ids"]:
        print(f"paper reference: {h['repo_id']} ({h['kind']}, p.{h['page']}, quote verified={h['verified']})")
    for d in w["doc_refs"]:
        print(f"{d['source']} reference: {d['repo_id']} ({d['file']}:{d['line']})")
    plan = api.attach_checkpoint_plan(paper, scan, pages)
    for c in plan["candidates"]:
        verdict = f"{RED}rejected: {c['rejected']}{END}" if c.get("rejected") else \
            f"{YELLOW}{c['role_note']}{END}" if c.get("role_note") else f"{GREEN}confirmed on Hub{END}"
        print(f"  candidate {c.get('repo_id') or c['requested_id']}: {verdict}")
    for s in plan["selected"]:
        print(f"{GREEN}{BOLD}SELECTED{END} {s['repo_id']} @ {s['sha']}  [{s['role']}, {s['confidence']} confidence]")
        print(f"  architecture {s['architectures']}  files {s['files']}  ({s['size_bytes'] / 1e6:.1f} MB)")
        for r in s.get("eval_results", [])[:1]:
            print(f"  model card says {r['metric']}={r['value']:.4f} on {r['dataset']}/{r['config']} {r['split']}")
    print(f"decision: {BOLD}{plan['status']}{END}")

    findings = reconciler.reconcile(paper["fields"], scan["params"], enrich_llm=False)
    spec = spec_builder.build_spec(paper, scan)
    eid = uuid.uuid4().hex[:8]
    proj = {"id": pid, "name": args.name or paper.get("title") or "Checkpoint recovery demo",
            "repo_url": args.repo, "paper_path": str(paper_path), "status": "analyzed", "is_demo": False,
            "is_paper_only": False, "commit": commit, "paper": paper, "scan": scan, "findings": findings,
            "experiments": {eid: {"id": eid, "parent_id": None, "version": 1, "spec": spec,
                                  "diff_from_parent": [], "config_hash": versioning.config_hash(spec)}},
            "runs": {}}
    api.save(pid, proj)
    reason = api.checkpoint_manager.blocking_reason(plan)
    if reason:
        print(f"{RED}{BOLD}BLOCKED:{END} {reason}")
        return 2
    if plan["status"] not in ("identified", "pinned"):
        print("nothing to recover")
        return 0

    # ── 4. Download, verify, load ──────────────────────────────────────────
    step(4, "Download (pinned), verify hashes, load with the model library")
    state = {"nodes": {n: "pending" for n in spec_builder.ORDER}, "seeds_done": 0,
             "seeds_total": args.seeds, "state": "running"}
    on_event = lambda node, st: (state["nodes"].__setitem__(node, st), print(f"  {DIM}[{node}: {st}]{END}"))
    print("setting up the experiment environment (first run installs requirements; can take minutes)...")
    use_docker = runner.docker_available()
    t0 = time.time()
    setup = runner.setup_env(repo_path, pdir / "runs", use_docker, on_event)
    if not setup["ok"]:
        print(f"{RED}setup failed{END}: {setup.get('error')} (see {setup['log']})")
        return 1
    print(f"  environment ready in {time.time() - t0:.0f}s ({'docker' if use_docker else 'virtualenv'})")
    ckpt = runner.prepare_checkpoint(spec, scan, pdir, repo_path, setup["python"], use_docker, on_event)
    proj = api.load(pid)
    proj["runs"][eid] = {"status": state, "results": [], "checkpoint": ckpt}
    api.save(pid, proj)
    for e in ckpt["entries"]:
        i = e["integrity"]
        print(f"{e['repo_id']} @ {e['sha'][:12]} -> {e['path']}  ({e['download_seconds']}s)")
        for f in i["files"]:
            mark = f"{GREEN}OK{END}" if f["ok"] else f"{RED}MISMATCH{END}" if f["ok"] is False else "n/a"
            print(f"  {mark:<12} {f['name']:<24} {f.get('algo') or '':<9} {(f.get('actual') or '')[:16]}…")
        lc = e.get("load_check") or {}
        if lc.get("ok"):
            print(f"  load check: {GREEN}OK{END} {lc['class']} ({lc.get('n_params', 0) / 1e6:.1f}M params, "
                  f"{lc['library']}) labels={list((lc.get('id2label') or {}).values())}")
        elif lc:
            print(f"  load check: {lc.get('skipped') or lc.get('error')}")
        for x in e.get("placed", []):
            print(f"  connected: {x.get('ref', '')} {x['detail']}")
        for x in e.get("unmapped", []):
            print(f"  {YELLOW}not connected{END}: {x['ref']} {x['reason']}")
    if not ckpt["ok"]:
        print(f"{RED}{BOLD}checkpoint stage failed:{END} {ckpt['error']}")
        state.update(state="failed", failed_stage="checkpoint", error=ckpt["error"])
        api.save(pid, proj)
        return 1
    if args.no_run:
        proj["checkpoint_fetch"] = {**ckpt, "state": "finished"}
        proj["runs"].pop(eid, None)
        api.save(pid, proj)
        print(f"\nstopped before running (--no-run). project {pid}")
        return 0

    # ── 5. Run and compare ─────────────────────────────────────────────────
    step(5, "Run the experiment and compare with the paper")
    for s in range(args.seeds):
        r = runner.run_seed(repo_path, spec, s, pdir / "runs" / eid, eid, None, commit, use_docker,
                            on_event, setup["python"], checkpoint=ckpt)
        print(f"  seed {s}: {r['status']} {r['metrics']}  {DIM}{r['manifest']['command']}{END}")
        if r["status"] != "done":
            print(Path(r["log"]).read_text()[-1500:])
        proj = api.load(pid)
        proj["runs"][eid]["results"].append(r)
        state["seeds_done"] = s + 1
        proj["runs"][eid]["status"] = state
        api.save(pid, proj)
    state["state"] = "finished"
    proj["runs"][eid]["status"] = state
    api.save(pid, proj)
    ver = api._verification(proj, eid)
    color = GREEN if ver["status"] == "REPRODUCED" else YELLOW if ver["status"].startswith("PARTIAL") else RED
    if ver["status"] != "BLOCKED":
        print(f"paper: {ver['published']}   reproduced: {ver['reproduced_mean']:.2f}   "
              f"diff: {ver['diff_pp']:+.2f} pp (tolerance {ver['tolerance_pp']} pp)")
    print(f"verdict: {color}{BOLD}{ver['status']}{END} {ver.get('reason', '')}")

    # ── 6. Report ──────────────────────────────────────────────────────────
    step(6, "Report")
    ck = api._checkpoint_view(proj, proj["experiments"][eid])
    html = report.render_report({
        "project_name": proj["name"], "is_demo": False, "claim": spec["claim"], "params": spec["params"],
        "warnings": spec.get("warnings", []), "findings": findings, "runs": proj["runs"][eid]["results"],
        "verification": ver, "checkpoint": ck, "ledger": report.evidence_ledger(findings, ver, ck)})
    (pdir / "report.html").write_text(html)
    print(f"checkpoint: {ck['verdict']}")
    print(f"report: {pdir / 'report.html'}")
    print(f"in the app: http://localhost:8000  (project {pid})  or  GET /projects/{pid}/report")
    return 0


if __name__ == "__main__":
    sys.exit(main())
