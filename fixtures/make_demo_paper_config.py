"""Generate the SYNTHETIC demo paper 2 PDF (config + F1 metric)."""
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "demo_paper_config.pdf")
ss = getSampleStyleSheet()
text = [
    ("Title", "SYNTHETIC DEMO PAPER 2: SGD Classifier on Breast Cancer Data"),
    ("Normal", "<b>This is a synthetic demo fixture, not a real publication.</b>"),
    ("Heading2", "1. Method"),
    ("Normal", "We train an SGD classifier with a learning_rate of 0.01, num_epochs of 30, and batch_size of 32 "
               "on the Wisconsin breast cancer dataset. We use a test_size of 0.25 for the split."),
    ("Heading2", "2. Results"),
    ("Normal", "Our model reaches an F1 score of 95.0% on the held-out test set."),
]
doc = SimpleDocTemplate(str(out), pagesize=A4)
doc.build([x for style, t in text for x in (Paragraph(t, ss[style]), Spacer(1, 10))])
print("wrote", out)
