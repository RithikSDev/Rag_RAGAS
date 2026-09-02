import re

from rank_bm25 import BM25Okapi

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


class BM25Index:
    """Built fresh from whatever's currently in the vector store - no persistent
    sync needed at this corpus scale (see hybrid_retrieval_service for the
    tradeoff note). Empty corpus is a valid, harmless state."""

    def __init__(self, records: list[dict]):
        self.records = records
        self._tokenized = [tokenize(record["text"]) for record in records]
        self._bm25 = BM25Okapi(self._tokenized) if self._tokenized else None

    @classmethod
    def from_vector_store(cls, vector_store) -> "BM25Index":
        return cls(vector_store.scroll_all())

    def search(self, query: str, top_k: int = 50) -> list[dict]:
        if self._bm25 is None:
            return []

        scores = self._bm25.get_scores(tokenize(query))

        ranked = sorted(
            range(len(self.records)),
            key=lambda i: scores[i],
            reverse=True,
        )[:top_k]

        return [
            {**self.records[i], "score": float(scores[i])}
            for i in ranked
        ]
