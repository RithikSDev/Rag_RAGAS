class FakeReranker:
    """No CrossEncoder model load - deterministic score derived from string
    length overlap so tests can assert on relative ordering without real ML."""

    def __init__(self, model_name: str = None):
        self.model_name = model_name

    def rerank(self, query, candidates, top_k):
        query_terms = set(query.lower().split())

        def score(candidate):
            text_terms = set(candidate["text"].lower().split())
            return len(query_terms & text_terms)

        scored = [{**candidate, "rerank_score": float(score(candidate))} for candidate in candidates]
        scored.sort(key=lambda item: item["rerank_score"], reverse=True)

        return scored[:top_k]
