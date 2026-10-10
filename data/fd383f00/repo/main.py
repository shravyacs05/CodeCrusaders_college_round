"""Demo fixture 2 (SYNTHETIC): config file + constants + no --seed flag + F1 metric."""
import argparse
import json

import numpy as np
import yaml
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

TEST_SIZE = 0.25
np.random.seed(42)

parser = argparse.ArgumentParser()
parser.add_argument("--lr", type=float, default=0.01)
parser.add_argument("--num_epochs", type=int, default=20)
parser.add_argument("--config", type=str, default="config.yaml")
parser.add_argument("--metrics_path", type=str, default="metrics.json")
args = parser.parse_args()

cfg = yaml.safe_load(open(args.config))
X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=TEST_SIZE, random_state=0)
sc = StandardScaler().fit(X_tr)
model = SGDClassifier(learning_rate="constant", eta0=args.lr, max_iter=args.num_epochs,
                      tol=None, random_state=None)
model.fit(sc.transform(X_tr), y_tr)
f1 = f1_score(y_te, model.predict(sc.transform(X_te)))
print(f"f1_score={f1:.4f} batch_size(cfg)={cfg['batch_size']}")
json.dump({"f1_score": f1, "train_loss": 0.0}, open(args.metrics_path, "w"))
