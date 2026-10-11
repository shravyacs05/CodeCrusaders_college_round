"""Evaluate the fine-tuned DistilBERT checkpoint on the SST-2 development set.

Reproduces the SST-2 column of Table 1 in Sanh et al. (2019), "DistilBERT, a distilled version
of BERT: smaller, faster, cheaper and lighter" (arXiv:1910.01108).

The fine-tuned weights are NOT included in this repository (see README.md).
"""
import argparse
import csv
import json
import os

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

parser = argparse.ArgumentParser()
parser.add_argument("--checkpoint", type=str, default="checkpoints/distilbert-sst2")
parser.add_argument("--data", type=str, default="glue/sst2_validation.tsv")
parser.add_argument("--batch_size", type=int, default=32)
parser.add_argument("--max_length", type=int, default=128)
parser.add_argument("--seed", type=int, default=0)
parser.add_argument("--out", type=str, default="metrics.json")
args = parser.parse_args()

torch.manual_seed(args.seed)
torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))

tokenizer = AutoTokenizer.from_pretrained(args.checkpoint)
model = AutoModelForSequenceClassification.from_pretrained(args.checkpoint)
model.eval()

with open(args.data, encoding="utf-8") as f:
    rows = list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))
sentences = [r["sentence"] for r in rows]
labels = [int(r["label"]) for r in rows]

correct = 0
with torch.no_grad():
    for i in range(0, len(sentences), args.batch_size):
        batch = tokenizer(sentences[i:i + args.batch_size], padding=True, truncation=True,
                          max_length=args.max_length, return_tensors="pt")
        preds = model(**batch).logits.argmax(dim=-1).tolist()
        correct += sum(int(p == y) for p, y in zip(preds, labels[i:i + args.batch_size]))

accuracy = correct / len(labels)
print(f"SST-2 dev accuracy = {accuracy:.4f} ({correct}/{len(labels)})")
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
with open(args.out, "w") as f:
    json.dump({"accuracy": accuracy, "n_examples": len(labels)}, f)
