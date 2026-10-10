"""Demo fixture: small sklearn classifier. SYNTHETIC demo, not a real paper's code."""
import argparse
import json
import os

from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

parser = argparse.ArgumentParser()
parser.add_argument("--n_estimators", type=int, default=50)
parser.add_argument("--max_depth", type=int, default=5)
parser.add_argument("--test_size", type=float, default=0.2)
parser.add_argument("--seed", type=int, default=0)
parser.add_argument("--out", type=str, default="metrics.json")
args = parser.parse_args()

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=args.test_size, random_state=args.seed
)
model = RandomForestClassifier(
    n_estimators=args.n_estimators, max_depth=args.max_depth, random_state=args.seed
)
model.fit(X_train, y_train)
acc = accuracy_score(y_test, model.predict(X_test))
print(f"accuracy={acc:.4f}")
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
with open(args.out, "w") as f:
    json.dump({"accuracy": acc}, f)
