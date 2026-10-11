"""Generate the paper for the checkpoint-recovery demo (fixtures/demo_repo_checkpoint).

This is a one-page brief that restates published results from Sanh et al. (2019),
arXiv:1910.01108, so the regex extractor has a quotable claim. The original paper reports the
SST-2 number only inside Table 1, which text extraction flattens column-by-column.

What the demo exercises:
  - the repo's eval_sst2.py loads checkpoints/distilbert-sst2, which is NOT in the repo
  - README.md and this brief both link the released checkpoint on the Hugging Face Hub
  - CrisisGrid must identify it, pin a commit, hash-verify, load it and reproduce 91.3% accuracy
"""
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "demo_paper_checkpoint.pdf")
ss = getSampleStyleSheet()
text = [
    ("Title", "DistilBERT on SST-2: Reproduction Brief"),
    ("Normal", "<b>Brief restating results from Sanh, Debut, Chaumond and Wolf (2019), \"DistilBERT, a distilled "
               "version of BERT: smaller, faster, cheaper and lighter\", arXiv:1910.01108. It is not the original "
               "paper; see the original for full details.</b>"),
    ("Heading2", "1. Method"),
    ("Normal", "DistilBERT is a 6-layer Transformer student distilled from BERT-base during pre-training with a "
               "triple loss (distillation, masked language modeling and cosine embedding). For SST-2 the model "
               "is fine-tuned as a binary sentence classifier and evaluated on the 872-sentence development set "
               "of the GLUE benchmark."),
    ("Heading2", "2. Results"),
    ("Normal", "On the SST-2 development set DistilBERT reaches an accuracy of 91.3%, compared with 92.7% for "
               "BERT-base (Table 1 of the original paper; GLUE dev-set results are medians of 5 runs)."),
    ("Heading2", "3. Released checkpoint"),
    ("Normal", "The fine-tuned DistilBERT SST-2 checkpoint is released on the Hugging Face Hub at "
               "https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english"),
]
doc = SimpleDocTemplate(str(out), pagesize=A4)
doc.build([x for style, t in text for x in (Paragraph(t, ss[style]), Spacer(1, 10))])
print("wrote", out)
