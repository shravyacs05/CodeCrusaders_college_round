"""Report generator: HTML via Jinja2 and PDF via ReportLab / WeasyPrint."""
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = Path(__file__).resolve().parents[1] / "templates"


def render_report(ctx: dict[str, Any]) -> str:
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html", "j2"]))
    return env.get_template("report.html.j2").render(**ctx)


def evidence_ledger(findings: list[dict], verification: dict | None) -> list[dict]:
    rows = [{"item": f"{f['param']}: {f['status']}",
             "evidence": f"paper={f.get('paper_ref') or '-'} | code={f.get('code_ref') or '-'}",
             "type": "paper+code"} for f in findings]
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
