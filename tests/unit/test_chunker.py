from app.config import PipelineConfig
from app.ingestion.chunker import chunk_document, chunk_text, chunk_text_semantic
from tests.fakes.fake_embedder import FakeEmbedder

PAGES = [
    {
        "page": 1,
        "text": (
            "Employees receive 20 days of annual leave per year. "
            "Leave must be requested two weeks in advance. "
            "Sick leave is capped at 10 days per year. "
            "A medical certificate is required for long absences."
        ),
    }
]


def test_chunk_text_respects_size_and_overlap():
    chunks = chunk_text(PAGES, chunk_size=40, overlap=10)

    assert len(chunks) > 1
    assert all(chunk["page"] == 1 for chunk in chunks)
    assert all(len(chunk["text"]) <= 40 for chunk in chunks)


def test_chunk_text_single_chunk_when_size_exceeds_text():
    chunks = chunk_text(PAGES, chunk_size=10_000, overlap=50)

    assert len(chunks) == 1
    assert chunks[0]["text"] == PAGES[0]["text"]


def test_chunk_text_semantic_groups_similar_sentences():
    embedder = FakeEmbedder()
    chunks = chunk_text_semantic(PAGES, embedder, threshold=0.75)

    assert len(chunks) >= 1
    assert all("page" in chunk and "text" in chunk for chunk in chunks)
    # every sentence from the source text should show up somewhere in the output
    rejoined = " ".join(chunk["text"] for chunk in chunks)
    assert "20 days of annual leave" in rejoined
    assert "medical certificate" in rejoined


def test_chunk_text_semantic_empty_page_yields_no_chunks():
    embedder = FakeEmbedder()
    chunks = chunk_text_semantic([{"page": 1, "text": "   "}], embedder, threshold=0.75)

    assert chunks == []


def test_chunk_document_dispatches_on_strategy():
    fixed_config = PipelineConfig(chunking_strategy="fixed", chunk_size=40, chunk_overlap=5)
    semantic_config = PipelineConfig(chunking_strategy="semantic", semantic_threshold=0.75)
    embedder = FakeEmbedder()

    fixed_chunks = chunk_document(PAGES, fixed_config, embedder)
    semantic_chunks = chunk_document(PAGES, semantic_config, embedder)

    assert fixed_chunks == chunk_text(PAGES, chunk_size=40, overlap=5)
    assert len(semantic_chunks) >= 1


def test_chunk_document_semantic_without_embedder_raises():
    semantic_config = PipelineConfig(chunking_strategy="semantic")

    try:
        chunk_document(PAGES, semantic_config, embedder=None)
        assert False, "expected ValueError"
    except ValueError:
        pass
