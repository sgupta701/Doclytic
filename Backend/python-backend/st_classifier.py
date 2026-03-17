from __future__ import annotations

from typing import Iterable, List, Sequence

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression


class SentenceTransformerClassifier:
    """Sentence-transformer embeddings + sklearn classifier wrapper."""

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        max_iter: int = 2000,
        random_state: int = 42,
    ) -> None:
        self.model_name = model_name
        self.max_iter = max_iter
        self.random_state = random_state
        self.classifier = LogisticRegression(
            max_iter=max_iter,
            random_state=random_state,
        )
        self._encoder = None

    def _get_encoder(self) -> SentenceTransformer:
        if self._encoder is None:
            self._encoder = SentenceTransformer(self.model_name)
        return self._encoder

    def _encode(self, texts: Sequence[str], batch_size: int = 64) -> np.ndarray:
        encoder = self._get_encoder()
        embeddings = encoder.encode(
            list(texts),
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return embeddings

    def fit(self, texts: Sequence[str], labels: Sequence[str]) -> "SentenceTransformerClassifier":
        X = self._encode(texts)
        self.classifier.fit(X, labels)
        return self

    def predict(self, texts: Sequence[str]) -> np.ndarray:
        X = self._encode(texts)
        return self.classifier.predict(X)

    def predict_proba(self, texts: Sequence[str]) -> np.ndarray:
        X = self._encode(texts)
        return self.classifier.predict_proba(X)

    def encode(self, texts: Sequence[str], batch_size: int = 64) -> np.ndarray:
        return self._encode(texts, batch_size=batch_size)

    @property
    def classes_(self):
        return self.classifier.classes_

    def __getstate__(self):
        state = self.__dict__.copy()
        # Avoid serializing heavy torch model weights in joblib artifact.
        state["_encoder"] = None
        return state
