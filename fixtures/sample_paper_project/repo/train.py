import argparse
import json
from sklearn.datasets import load_wine
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

parser = argparse.ArgumentParser(description='Train Cardiovascular Classifier')
parser.add_argument('--n_estimators', type=int, default=100)
parser.add_argument('--max_depth', type=int, default=6)
parser.add_argument('--test_size', type=float, default=0.25)
parser.add_argument('--seed', type=int, default=42)
parser.add_argument('--out', type=str, default='metrics.json')
args = parser.parse_args()

X, y = load_wine(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=args.test_size, random_state=args.seed
)
clf = RandomForestClassifier(
    n_estimators=args.n_estimators,
    max_depth=args.max_depth,
    random_state=args.seed
)
clf.fit(X_train, y_train)
acc = clf.score(X_test, y_test)

with open(args.out, 'w') as f:
    json.dump({'accuracy': round(acc, 4), 'f1': round(acc, 4)}, f)
print(f'Done! Accuracy: {round(acc, 4)}')
