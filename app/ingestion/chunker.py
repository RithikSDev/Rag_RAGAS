import re

import numpy as np

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def chunk_text(
    pages: list[dict],
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[dict]:

    chunks = []

    for page in pages:
        text = page["text"]

        start = 0

        while start < len(text):
            end = start + chunk_size

            chunk = text[start:end]

            chunks.append(
                {
                    "text": chunk,
                    "page": page["page"],
                }
            )

            start += chunk_size - overlap

    return chunks


def _split_sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in SENTENCE_SPLIT_RE.split(text) if sentence.strip()]


def chunk_text_semantic(
    pages: list[dict],
    embedder,
    threshold: float = 0.75,
    max_chunk_chars: int = 1200,
) -> list[dict]:
    """Groups consecutive sentences into a chunk while each new sentence stays
    similar (cosine) to the running chunk's centroid; drops below `threshold`
    starts a new chunk. A char cap keeps any one topic from growing unbounded."""

    chunks = []

    for page in pages:
        sentences = _split_sentences(page["text"])

        if not sentences:
            continue

        vectors = np.asarray(embedder.embed(sentences), dtype=float)

        current_sentences = [sentences[0]]
        current_sum = vectors[0].copy()
        current_count = 1

        for sentence, vector in zip(sentences[1:], vectors[1:]):
            centroid = current_sum / current_count
            similarity = float(
                np.dot(centroid, vector)
                / (np.linalg.norm(centroid) * np.linalg.norm(vector) + 1e-8)
            )

            candidate_text = " ".join(current_sentences + [sentence])

            if similarity >= threshold and len(candidate_text) <= max_chunk_chars:
                current_sentences.append(sentence)
                current_sum += vector
                current_count += 1
            else:
                chunks.append({"text": " ".join(current_sentences), "page": page["page"]})
                current_sentences = [sentence]
                current_sum = vector.copy()
                current_count = 1

        if current_sentences:
            chunks.append({"text": " ".join(current_sentences), "page": page["page"]})

    return chunks


def chunk_document(pages: list[dict], config, embedder=None) -> list[dict]:
    if config.chunking_strategy == "semantic":
        if embedder is None:
            raise ValueError("Semantic chunking requires an embedder")

        return chunk_text_semantic(pages, embedder, threshold=config.semantic_threshold)

    return chunk_text(pages, chunk_size=config.chunk_size, overlap=config.chunk_overlap)
