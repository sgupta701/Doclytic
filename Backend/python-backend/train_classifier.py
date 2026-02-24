# train_classifier.py
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib
import os

DATA_CSV = "sample_data/dataset.csv"
MODEL_OUT = "models/doc_clf.joblib"
os.makedirs("models", exist_ok=True)


def load_csv(path):
    df = pd.read_csv(path)
    # expect columns: filepath,label OR text,label
    if "filepath" in df.columns:
        def read_text(fp):
            if not os.path.exists(fp):
                return ""
            with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        df["text"] = df["filepath"].map(read_text)
    elif "text" not in df.columns:
        raise ValueError("CSV must have either filepath or text column")
    return df


def train(df):
    X = df["text"].fillna("").values
    y = df["label"].values
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)
    pipe = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), min_df=1),
        LogisticRegression(max_iter=1000)
    )
    pipe.fit(X_train, y_train)
    preds = pipe.predict(X_val)
    print(classification_report(y_val, preds))
    joblib.dump(pipe, MODEL_OUT)
    print("Saved model to", MODEL_OUT)


if __name__ == "__main__":
    df = load_csv(DATA_CSV)
    train(df)
