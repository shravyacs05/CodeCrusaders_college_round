"""Report generator: HTML via Jinja2 and PDF via ReportLab / WeasyPrint."""
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = Path(__file__).resolve().parents[1] / "templates"


def render_report(ctx: dict[str, Any]) -> str:
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html", "j2"]))
    return env.get_template("report.html.j2").render(**ctx)


CHECKPOINT_VERDICTS = {
    "recovered": "RECOVERED & VERIFIED",
    "identified": "IDENTIFIED (not downloaded yet)",
    "pinned": "PINNED",
    "present": "PRESENT IN REPOSITORY",
    "failed": "RECOVERY FAILED",
    "not_found": "NOT FOUND (no substitute used)",
    "ambiguous": "AMBIGUOUS (no substitute used)",
    "candidate_unconfirmed": "UNCONFIRMED (no substitute used)",
    "hub_unreachable": "UNVERIFIED (Hub unreachable)",
    "error": "ERROR",
}


def checkpoint_view(plan: dict | None, record: dict | None = None) -> dict | None:
    """Merge the analysis-time plan with the run-time download/verification record for display."""
    if not plan or plan.get("weights_status") in (None, "not_required"):
        return None
    rec_by_id = {e["repo_id"]: e for e in (record or {}).get("entries", [])}
    entries = []
    for sel in plan.get("selected", []):
        r = rec_by_id.get(sel["repo_id"], {})
        integ, load = r.get("integrity"), r.get("load_check")
        entries.append({**sel, "downloaded": bool(r), "path": r.get("path"), "integrity": integ,
                        "load_check": load, "placed": r.get("placed", []), "unmapped": r.get("unmapped", []),
                        "verified": bool(integ and integ.get("ok") and load and load.get("ok") is not False)})
    status = plan.get("status")
    if record and record.get("error"):
        key = "failed"
    elif status in ("identified", "pinned") and entries and all(e["verified"] for e in entries):
        key = "recovered" if status == "identified" else "pinned"
    else:
        key = status
    return {"status": status, "verdict": CHECKPOINT_VERDICTS.get(key, str(key).upper()), "verdict_key": key,
            "weights_status": plan.get("weights_status"), "missing": plan.get("missing", []),
            "entries": entries, "external_links": plan.get("external_links", []),
            "rejected": [c for c in plan.get("candidates", []) if c.get("rejected") or c.get("role_note")],
            "error": (record or {}).get("error"), "resolved_at": plan.get("resolved_at")}


def evidence_ledger(findings: list[dict], verification: dict | None, checkpoint: dict | None = None) -> list[dict]:
    rows = [{"item": f"{f['param']}: {f['status']}",
             "evidence": f"paper={f.get('paper_ref') or '-'} | code={f.get('code_ref') or '-'}",
             "type": "paper+code"} for f in findings]
    if checkpoint:
        for m in checkpoint["missing"]:
            rows.append({"item": f"Weights missing from repo: {m.get('value') or '--' + str(m.get('flag'))}",
                         "evidence": f"{m['file']}:{m['line']} {m['loader']}", "type": "code"})
        for e in checkpoint["entries"]:
            rows.append({"item": f"Checkpoint {e['repo_id']} @ {e['sha'][:12]} ({e['role'].replace('_', ' ')})",
                         "evidence": "; ".join(f"{x['source']}: {x['ref']}" for x in e["evidence"]),
                         "type": "paper+code+hub"})
            if e.get("integrity"):
                i = e["integrity"]
                rows.append({"item": f"Integrity: {i['n_verified']}/{i['n_files']} files match Hub hashes",
                             "evidence": ", ".join(f"{f['name']} ({f['algo']})" for f in i["files"][:6]),
                             "type": "measured"})
            lc = e.get("load_check") or {}
            if lc.get("ok"):
                n = f", {lc['n_params'] / 1e6:.1f}M params" if lc.get("n_params") else ""
                rows.append({"item": f"Load check: {lc.get('class')}{n}", "evidence": lc.get("library", ""),
                             "type": "measured"})
            for r in e.get("eval_results", [])[:2]:
                rows.append({"item": f"Model card reports {r['metric']} = {r['value']:.4f} on "
                                     f"{r['dataset']}/{r.get('config') or ''} {r.get('split') or ''}",
                             "evidence": f"Hub model-index{' (Hub-verified)' if r.get('verified') else ''}",
                             "type": "self-reported"})
        if not checkpoint["entries"] and checkpoint["missing"]:
            rows.append({"item": f"Checkpoint: {checkpoint['verdict']}",
                         "evidence": "; ".join(f"{c.get('repo_id') or c.get('requested_id')}: {c.get('rejected') or c.get('role_note')}"
                                               for c in checkpoint["rejected"]) or "no checkpoint referenced",
                         "type": "calculated"})
    if verification and verification.get("status") != "BLOCKED":
        v_mean = verification.get("reproduced_mean", 0.0)
        rows.append({"item": f"Reproduced mean {v_mean:.2f}%",
                     "evidence": f"{verification.get('n', 0)} seeds run", "type": "measured"})
        rows.append({"item": f"Diff {verification.get('diff_pp', 0.0):+.2f} pp -> {verification.get('status')}",
                     "evidence": verification.get("rule", ""), "type": "calculated"})
    return rows


def render_pdf(ctx: dict[str, Any], out_path: Path) -> Path:
    """Render PDF report. Tries weasyprint first, falls back to reportlab."""
    try:
        import weasyprint
        html_str = render_report(ctx)
        weasyprint.HTML(string=html_str).write_pdf(str(out_path))
        return out_path
    except Exception:
        pass

    # ReportLab fallback
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    doc = SimpleDocTemplate(str(out_path), pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = []

    # Title
    story.append(Paragraph(f"CrisisGrid Reproducibility Report: {ctx.get('project_name')}", styles["Title"]))
    story.append(Spacer(1, 10))

    if ctx.get("is_demo"):
        story.append(Paragraph("<b>DEMO FIXTURE:</b> Synthetic paper and code. Not an independent replication of a publication.", styles["Normal"]))
        story.append(Spacer(1, 10))

    # 1. Claim
    story.append(Paragraph("1. Claim", styles["Heading2"]))
    claim = ctx.get("claim", {})
    pct = "%" if claim.get("percent", True) else ""
    story.append(Paragraph(f"Published Claim: <b>{claim.get('metric')} = {claim.get('value')}{pct}</b>", styles["Normal"]))
    if claim.get("ref"):
        story.append(Paragraph(f"Reference: <font color='#666666'>{claim.get('ref')}</font>", styles["Normal"]))
    story.append(Spacer(1, 12))

    # 2. Findings Table
    story.append(Paragraph("2. Paper vs. Code Findings", styles["Heading2"]))
    data = [["Parameter", "Paper", "Code", "Status", "Severity"]]
    for f in ctx.get("findings", []):
        data.append([
            f.get("param", ""),
            str(f.get("paper_value") if f.get("paper_value") is not None else "-"),
            str(f.get("code_value") if f.get("code_value") is not None else "-"),
            f.get("status", ""),
            f.get("severity", ""),
        ])
    t = Table(data, colWidths=[110, 80, 80, 110, 80])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f3f3')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # 2b. Model checkpoint
    ck = ctx.get("checkpoint")
    if ck:
        story.append(Paragraph("Model Checkpoint", styles["Heading2"]))
        story.append(Paragraph(f"Status: <b>{ck['verdict']}</b>", styles["Normal"]))
        for m in ck["missing"]:
            story.append(Paragraph(f"Missing from repository: {m.get('value') or '--' + str(m.get('flag'))} "
                                   f"({m['file']}:{m['line']}, {m['loader']})", styles["Normal"]))
        for e in ck["entries"]:
            story.append(Paragraph(f"Checkpoint: <b>{e['repo_id']}</b> @ {e['sha']} ({e['revision_source']})",
                                   styles["Normal"]))
            story.append(Paragraph("Evidence: " + "; ".join(f"{x['source']}: {x['ref']}" for x in e["evidence"])[:400],
                                   styles["Normal"]))
            if e.get("integrity"):
                story.append(Paragraph(f"Integrity: {e['integrity']['n_verified']}/{e['integrity']['n_files']} files "
                                       "match the Hub's SHA-256 / git hashes", styles["Normal"]))
            lc = e.get("load_check") or {}
            if lc:
                story.append(Paragraph(f"Load check: {'OK ' + str(lc.get('class')) if lc.get('ok') else lc.get('skipped') or lc.get('error')}",
                                       styles["Normal"]))
        for c in ck["rejected"]:
            story.append(Paragraph(f"Rejected: {c.get('repo_id') or c.get('requested_id')}: {c.get('rejected') or c.get('role_note')}",
                                   styles["Normal"]))
        story.append(Spacer(1, 12))

    # 3. Verification Results
    ver = ctx.get("verification", {})
    story.append(Paragraph("3. Verification Results", styles["Heading2"]))
    if ver.get("status") != "BLOCKED":
        v_mean = ver.get("reproduced_mean", 0.0)
        v_diff = ver.get("diff_pp", 0.0)
        story.append(Paragraph(
            f"Verdict: <b>{ver.get('status')}</b> &middot; Published: {ver.get('published')}{pct} &middot; "
            f"Reproduced mean: {v_mean:.2f}{pct} (std {ver.get('std', 0.0):.2f}, n={ver.get('n', 0)})",
            styles["Normal"]
        ))
        story.append(Paragraph(f"Difference: {v_diff:+.2f} pp &middot; Tolerance: {ver.get('tolerance_pp', 1.0)} pp", styles["Normal"]))
    else:
        story.append(Paragraph(f"Status: <b>BLOCKED</b> ({ver.get('reason', 'no completed runs')})", styles["Normal"]))
    story.append(Spacer(1, 12))

    # 4. Evidence Ledger
    story.append(Paragraph("4. Evidence Ledger", styles["Heading2"]))
    ledger_data = [["Item", "Evidence", "Type"]]
    for e in ctx.get("ledger", []):
        ledger_data.append([e.get("item", ""), e.get("evidence", "")[:60], e.get("type", "")])
    lt = Table(ledger_data, colWidths=[150, 230, 80])
    lt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f3f3')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
    ]))
    story.append(lt)

    doc.build(story)
    return out_path
