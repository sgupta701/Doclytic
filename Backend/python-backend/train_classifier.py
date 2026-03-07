import os

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

from st_classifier import SentenceTransformerClassifier

DATA_CSV = "dataset_pipeline/output/dataset.csv"
MODEL_OUT = "models/doc_clf.joblib"
SBERT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

os.makedirs("models", exist_ok=True)


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "filepath" in df.columns:
        def read_text(fp: str) -> str:
            if not os.path.exists(fp):
                return ""
            with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

        df["text"] = df["filepath"].map(read_text)
    elif "text" not in df.columns:
        raise ValueError("CSV must have either filepath or text column")

    if "label" not in df.columns:
        raise ValueError("CSV must contain label column")

    df["text"] = df["text"].fillna("").astype(str)
    df["label"] = df["label"].fillna("").astype(str).str.strip().str.lower()
    df = df[(df["text"].str.len() > 0) & (df["label"].str.len() > 0)]
    return df


def train(df: pd.DataFrame) -> None:
    X = df["text"].tolist()
    y = df["label"].tolist()

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    clf = SentenceTransformerClassifier(model_name=SBERT_MODEL)
    clf.fit(X_train, y_train)
    preds = clf.predict(X_val)

    print("Validation accuracy:", f"{accuracy_score(y_val, preds):.4f}")
    print(classification_report(y_val, preds, digits=4))

    joblib.dump(clf, MODEL_OUT)
    print("Saved model to", MODEL_OUT)


if __name__ == "__main__":
    dataset = load_csv(DATA_CSV)
    print(f"Loaded {len(dataset)} rows from {DATA_CSV}")
    print("Labels:", sorted(dataset["label"].unique().tolist()))
    train(dataset)
