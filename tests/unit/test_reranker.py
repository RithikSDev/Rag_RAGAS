from unittest.mock import MagicMock, patch

from app.retrieval.reranker import Reranker


def _build_reranker_with_mock_model(scores):
    with patch("app.retrieval.reranker.CrossEncoder") as mock_cross_encoder:
        mock_model = MagicMock()
        mock_model.predict.return_value = scores
        mock_cross_encoder.return_value = mock_model

        reranker = Reranker()

    return reranker, mock_model


def test_rerank_sorts_by_descending_score():
    candidates = [
        {"id": "a", "text": "low relevance"},
        {"id": "b", "text": "high relevance"},
        {"id": "c", "text": "medium relevance"},
    ]
    reranker, mock_model = _build_reranker_with_mock_model([0.1, 0.9, 0.5])

    results = reranker.rerank("query", candidates, top_k=3)

    assert [r["id"] for r in results] == ["b", "c", "a"]
    assert results[0]["rerank_score"] == 0.9


def test_rerank_passes_query_text_pairs_to_model():
    candidates = [{"id": "a", "text": "chunk text"}]
    reranker, mock_model = _build_reranker_with_mock_model([0.5])

    reranker.rerank("my query", candidates, top_k=1)

    mock_model.predict.assert_called_once_with([("my query", "chunk text")])


def test_rerank_truncates_to_top_k():
    candidates = [{"id": str(i), "text": f"chunk {i}"} for i in range(5)]
    reranker, _ = _build_reranker_with_mock_model([0.1, 0.2, 0.3, 0.4, 0.5])

    results = reranker.rerank("query", candidates, top_k=2)

    assert len(results) == 2


def test_rerank_empty_candidates_short_circuits():
    reranker, mock_model = _build_reranker_with_mock_model([])

    results = reranker.rerank("query", [], top_k=5)

    assert results == []
    mock_model.predict.assert_not_called()
