from pathlib import Path

from app.generation.generator import Generator
from app.ingestion.chunker import chunk_text
from app.ingestion.embedder import Embedder
from app.ingestion.loader import load_pdf
from app.rag_pipeline import RAGPipeline
from app.retrieval.retriever import Retriever
from app.retrieval.vector_store import VectorStore


def ingest(directory: str, vector_store: VectorStore, embedder: Embedder) -> None:

    pdf_paths = list(Path(directory).glob("*.pdf"))

    if not pdf_paths:
        print(f"No PDFs found in {directory}")

    for pdf_path in pdf_paths:
        pages = load_pdf(str(pdf_path))
        chunks = chunk_text(pages)
        vectors = embedder.embed(
            [chunk["text"] for chunk in chunks]
        )

        vector_store.add_documents(chunks, vectors)

        print(f"Ingested {pdf_path.name} ({len(chunks)} chunks)")


def main():

    embedder = Embedder()
    vector_store = VectorStore()

    ingest("data/documents", vector_store, embedder)

    retriever = Retriever(vector_store, embedder)
    generator = Generator()
    pipeline = RAGPipeline(retriever, generator)

    while True:
        question = input("\nAsk a question (or 'exit'): ")

        if question.lower() == "exit":
            break

        result = pipeline.run(question)

        print(f"\nAnswer: {result['answer']}")


if __name__ == "__main__":
    main()
