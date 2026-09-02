from app.retrieval.bm25_index import BM25Index


def _min_max_normalize(items: list[dict], key: str = "score") -> dict[str, float]:
    """Returns {id: normalized_score} for a list of {id, score, ...} dicts."""

    if not items:
        return {}

    values = [item[key] for item in items]
    lo, hi = min(values), max(values)
    spread = hi - lo

    if spread == 0:
        return {item["id"]: 1.0 for item in items}

    return {item["id"]: (item[key] - lo) / spread for item in items}


class HybridRetrievalService:
    def __init__(self, retriever, vector_store, reranker):
        self.retriever = retriever
        self.vector_store = vector_store
        self.reranker = reranker

    def debug_search(
        self,
        query: str,
        top_k_initial: int = 50,
        top_k_final: int = 5,
        vector_weight: float = 0.7,
        bm25_weight: float = 0.3,
        use_reranker: bool = True,
    ) -> dict:
        vector_results = self.retriever.search(query, top_k=top_k_initial)

        bm25_index = BM25Index.from_vector_store(self.vector_store)
        bm25_results = bm25_index.search(query, top_k=top_k_initial)

        vector_norm = _min_max_normalize(vector_results)
        bm25_norm = _min_max_normalize(bm25_results)

        by_id = {}
        for item in vector_results:
            by_id[item["id"]] = {**item, "in_vector": True, "in_bm25": False}
        for item in bm25_results:
            if item["id"] in by_id:
                by_id[item["id"]]["in_bm25"] = True
            else:
                by_id[item["id"]] = {**item, "in_vector": False, "in_bm25": True}

        hybrid_results = []
        for point_id, item in by_id.items():
            v = vector_norm.get(point_id, 0.0)
            b = bm25_norm.get(point_id, 0.0)
            hybrid_score = vector_weight * v + bm25_weight * b
            hybrid_results.append(
                {
                    **item,
                    "vector_score": vector_norm.get(point_id),
                    "bm25_score": bm25_norm.get(point_id),
                    "score": hybrid_score,
                }
            )

        hybrid_results.sort(key=lambda item: item["score"], reverse=True)

        if use_reranker:
            rerank_pool = hybrid_results[: min(len(hybrid_results), 20)]
            reranked_results = self.reranker.rerank(query, rerank_pool, top_k=top_k_final)
            final_context = reranked_results
        else:
            reranked_results = []
            final_context = hybrid_results[:top_k_final]

        return {
            "query": query,
            "vector_results": vector_results,
            "bm25_results": bm25_results,
            "hybrid_results": hybrid_results,
            "reranked_results": reranked_results,
            "final_context": final_context,
        }
