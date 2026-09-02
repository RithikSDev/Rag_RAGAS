from unittest.mock import patch

from app.services.hybrid_retrieval_service import HybridRetrievalService, _min_max_normalize


class StubRetriever:
    def __init__(self, results):
        self.results = results
        self.calls = []

    def search(self, query, top_k):
        self.calls.append((query, top_k))
        return self.results


class StubBM25Index:
    def __init__(self, results):
        self.results = results

    def search(self, query, top_k):
        return self.results


class StubReranker:
    def __init__(self):
        self.calls = []

    def rerank(self, query, candidates, top_k):
        self.calls.append((query, [c["id"] for c in candidates], top_k))
        # deterministic: reverse the incoming order so tests can tell rerank ran
        return list(reversed(candidates))[:top_k]


def test_min_max_normalize_scales_to_unit_range():
    items = [{"id": "a", "score": 0.9}, {"id": "b", "score": 0.5}, {"id": "c", "score": 0.1}]

    normalized = _min_max_normalize(items)

    assert normalized == {"a": 1.0, "b": 0.5, "c": 0.0}


def test_min_max_normalize_handles_equal_scores():
    items = [{"id": "a", "score": 5.0}, {"id": "b", "score": 5.0}]

    assert _min_max_normalize(items) == {"a": 1.0, "b": 1.0}


def test_min_max_normalize_empty_list():
    assert _min_max_normalize([]) == {}


def _service_with_fixed_bm25(vector_results, bm25_results, reranker=None):
    retriever = StubRetriever(vector_results)
    service = HybridRetrievalService(retriever, vector_store=object(), reranker=reranker)

    patcher = patch(
        "app.services.hybrid_retrieval_service.BM25Index.from_vector_store",
        return_value=StubBM25Index(bm25_results),
    )
    return service, retriever, patcher


def test_hybrid_fusion_weights_vector_and_bm25_correctly():
    vector_results = [
        {"id": "a", "text": "doc a", "page": 1, "score": 0.9},
        {"id": "b", "text": "doc b", "page": 1, "score": 0.5},
        {"id": "c", "text": "doc c", "page": 1, "score": 0.1},
    ]
    bm25_results = [
        {"id": "b", "text": "doc b", "page": 1, "score": 10.0},
        {"id": "c", "text": "doc c", "page": 1, "score": 4.0},
        {"id": "d", "text": "doc d", "page": 2, "score": 2.0},
    ]

    service, retriever, patcher = _service_with_fixed_bm25(vector_results, bm25_results)

    with patcher:
        result = service.debug_search(
            "query", top_k_initial=50, top_k_final=4, vector_weight=0.7, bm25_weight=0.3, use_reranker=False
        )

    scores = {item["id"]: round(item["score"], 4) for item in result["hybrid_results"]}

    # a: vector-only, normalized to 1.0 -> 0.7*1.0 = 0.7
    # b: vector 0.5 (norm 0.5), bm25 10.0 (norm 1.0) -> 0.7*0.5 + 0.3*1.0 = 0.65
    # c: vector 0.1 (norm 0.0), bm25 4.0 (norm 0.25) -> 0.3*0.25 = 0.075
    # d: bm25-only, normalized to 0.0 -> 0.0
    assert scores == {"a": 0.7, "b": 0.65, "c": 0.075, "d": 0.0}

    ranked_ids = [item["id"] for item in result["hybrid_results"]]
    assert ranked_ids == ["a", "b", "c", "d"]

    assert retriever.calls == [("query", 50)]


def test_final_context_without_reranker_is_top_hybrid_results():
    vector_results = [{"id": "a", "text": "a", "page": 1, "score": 0.9}]
    bm25_results = []

    service, _, patcher = _service_with_fixed_bm25(vector_results, bm25_results)

    with patcher:
        result = service.debug_search("q", top_k_final=1, use_reranker=False)

    assert result["reranked_results"] == []
    assert result["final_context"] == result["hybrid_results"][:1]


def test_final_context_with_reranker_uses_reranked_results():
    vector_results = [
        {"id": "a", "text": "a", "page": 1, "score": 0.9},
        {"id": "b", "text": "b", "page": 1, "score": 0.5},
    ]
    reranker = StubReranker()

    service, _, patcher = _service_with_fixed_bm25(vector_results, [], reranker=reranker)

    with patcher:
        result = service.debug_search("q", top_k_final=2, use_reranker=True)

    # StubReranker reverses order - proves final_context came from the reranker, not raw hybrid order
    assert [r["id"] for r in result["final_context"]] == ["b", "a"]
    assert reranker.calls[0][0] == "q"


def test_reranker_pool_capped_at_twenty_candidates():
    vector_results = [{"id": str(i), "text": f"chunk {i}", "page": 1, "score": 1.0 / (i + 1)} for i in range(30)]
    reranker = StubReranker()

    service, _, patcher = _service_with_fixed_bm25(vector_results, [], reranker=reranker)

    with patcher:
        service.debug_search("q", top_k_initial=30, top_k_final=5, use_reranker=True)

    pool_ids = reranker.calls[0][1]
    assert len(pool_ids) == 20


def test_source_flags_mark_which_stage_each_result_came_from():
    vector_results = [{"id": "a", "text": "a", "page": 1, "score": 0.9}]
    bm25_results = [
        {"id": "a", "text": "a", "page": 1, "score": 5.0},
        {"id": "b", "text": "b", "page": 1, "score": 3.0},
    ]

    service, _, patcher = _service_with_fixed_bm25(vector_results, bm25_results)

    with patcher:
        result = service.debug_search("q", use_reranker=False)

    by_id = {item["id"]: item for item in result["hybrid_results"]}
    assert by_id["a"]["in_vector"] is True
    assert by_id["a"]["in_bm25"] is True
    assert by_id["b"]["in_vector"] is False
    assert by_id["b"]["in_bm25"] is True
