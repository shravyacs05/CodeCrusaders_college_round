"""Generate the SYNTHETIC demo paper PDF.

Intentional differences vs. demo_repo/train.py:
  - paper says 100 trees, code default is 50  -> MISMATCH
  - paper never states the random seed        -> MISSING
"""
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "demo_paper.pdf")
ss = getSampleStyleSheet()
text = [
    ("Title", "SYNTHETIC DEMO PAPER: Random Forests on Breast Cancer Data"),
    ("Normal", "<b>This is a synthetic demo fixture, not a real publication.</b>"),
    ("Heading2", "1. Method"),
    ("Normal", "We train a random forest classifier with 100 trees and max_depth of 5 "
               "on the Wisconsin breast cancer dataset. We use a test_size of 0.2 for the split."),
    ("Heading2", "2. Results"),
    ("Normal", "Our model reaches an accuracy of 96.5% on the held-out test set."),
]
doc = SimpleDocTemplate(str(out), pagesize=A4)
doc.build([x for style, t in text for x in (Paragraph(t, ss[style]), Spacer(1, 10))])
print("wrote", out)
