"""Leakage detector: AST rules for machine learning data leaks.

Detects common methodological issues such as:
1. Preprocessor/scaler fit before train_test_split (test set leakage into normalization).
2. Fitting preprocessors or models on full dataset instead of train split.
"""
import ast
from pathlib import Path
from typing import Any

LEAKY_TRANSFORMERS = {
    "StandardScaler", "MinMaxScaler", "RobustScaler", "Normalizer", "MaxAbsScaler",
    "OneHotEncoder", "OrdinalEncoder", "LabelEncoder", "TargetEncoder",
    "PCA", "SelectKBest", "SelectPercentile", "SimpleImputer", "KNNImputer",
}


def detect_leakage(tree: ast.AST, rel_file: str) -> list[dict[str, Any]]:
    """Scan an AST tree for data leakage patterns."""
    findings: list[dict[str, Any]] = []

    # Track line numbers
    split_lineno: int | None = None
    scaler_fits: list[tuple[int, str, str]] = []  # (lineno, transformer_name, arg_name)

    for node in ast.walk(tree):
        # 1. Detect train_test_split call
        if isinstance(node, ast.Call):
            func_name = None
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr

            if func_name in ("train_test_split", "KFold", "StratifiedKFold", "cross_val_score"):
                if split_lineno is None or node.lineno < split_lineno:
                    split_lineno = node.lineno

            # 2. Detect scaler/encoder fit or fit_transform calls
            if func_name in ("fit", "fit_transform"):
                # Check caller name or attribute
                caller_name = ""
                if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                    caller_name = node.func.value.id
                elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Call):
                    if isinstance(node.func.value.func, ast.Name):
                        caller_name = node.func.value.func.id

                arg_name = ""
                if node.args and isinstance(node.args[0], ast.Name):
                    arg_name = node.args[0].id

                # Is caller a known transformer or named like one?
                is_transformer = (
                    caller_name in LEAKY_TRANSFORMERS
                    or any(t.lower() in caller_name.lower() for t in ("scaler", "encoder", "pca", "imputer"))
                )
                if is_transformer:
                    scaler_fits.append((node.lineno, caller_name or "Preprocessor", arg_name))

    # Evaluate leakage
    for lineno, name, arg in scaler_fits:
        if split_lineno is not None and lineno < split_lineno:
            findings.append({
                "rule": "preprocessing_fit_before_split",
                "file": rel_file,
                "line": lineno,
                "severity": "high",
                "message": (
                    f"Potential Data Leakage: '{name}.fit' called on line {lineno} before "
                    f"train_test_split on line {split_lineno}. Data from test set leaks into preprocessing."
                ),
            })
        elif arg and arg in ("X", "data", "features", "df", "dataset") and split_lineno is not None and lineno > split_lineno:
            findings.append({
                "rule": "preprocessing_fit_on_entire_dataset",
                "file": rel_file,
                "line": lineno,
                "severity": "high",
                "message": (
                    f"Potential Data Leakage: '{name}.fit' called on full dataset '{arg}' "
                    f"on line {lineno} instead of training split."
                ),
            })

    return findings


def scan_repo_leakage(repo_path: Path) -> list[dict[str, Any]]:
    """Scan all Python files in a repository for leakage."""
    leakage: list[dict[str, Any]] = []
    for py_file in repo_path.glob("*.py"):
        try:
            tree = ast.parse(py_file.read_text())
            leakage.extend(detect_leakage(tree, py_file.name))
        except Exception:
            continue
    return leakage
