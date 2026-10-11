# DistilBERT on SST-2: evaluation code

Companion code for reproducing the **SST-2 development-set accuracy (91.3)** that
Sanh et al. report for DistilBERT in Table 1 of
[DistilBERT, a distilled version of BERT: smaller, faster, cheaper and lighter](https://arxiv.org/abs/1910.01108)
(EMC² workshop at NeurIPS 2019).

## Model weights

The fine-tuned checkpoint is **not included in this repository** (268 MB). It is published on the
Hugging Face Hub:

https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english

Download it into `checkpoints/distilbert-sst2/` before running the evaluation.

## Run

```bash
pip install -r requirements.txt
python eval_sst2.py --checkpoint checkpoints/distilbert-sst2 --out metrics.json
```

`eval_sst2.py` writes `{"accuracy": ...}` to the `--out` file.

## Data

`glue/sst2_validation.tsv` is the 872-sentence SST-2 development split from the
[GLUE benchmark](https://gluebenchmark.com/) (Socher et al., 2013; Wang et al., 2018).
