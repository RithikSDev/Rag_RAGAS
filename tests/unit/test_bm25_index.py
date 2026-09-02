from app.retrieval.bm25_index import BM25Index, tokenize


def test_tokenize_lowercases_and_strips_punctuation():
    assert tokenize("What is the Crop-Loan rate?") == ["what", "is", "the", "crop", "loan", "rate"]


def test_search_ranks_by_term_overlap():
    records = [
        {"id": "a", "text": "The crop loan interest rate is five percent.", "page": 1},
        {"id": "b", "text": "Deposit account rules and eligibility.", "page": 1},
        {"id": "c", "text": "Crop loan documents required for application.", "page": 2},
    ]
    index = BM25Index(records)

    results = index.search("crop loan documents", top_k=3)

    assert results[0]["id"] == "c"  # most term overlap
    assert all("score" in r for r in results)


def test_search_respects_top_k():
    records = [{"id": str(i), "text": f"chunk number {i}", "page": 1} for i in range(10)]
    index = BM25Index(records)

    results = index.search("chunk", top_k=3)

    assert len(results) == 3


def test_search_on_empty_index_returns_empty():
    index = BM25Index([])

    assert index.search("anything", top_k=5) == []


def test_from_vector_store_scrolls_all_records():
    class FakeVectorStore:
        def scroll_all(self):
            return [{"id": "1", "text": "hello world", "page": 1}]

    index = BM25Index.from_vector_store(FakeVectorStore())

    assert index.search("hello", top_k=1)[0]["id"] == "1"
