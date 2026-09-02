"""Dev utility to (re)build the fixed eval question set as a flat JSON fixture.
Not used by the live API (which calls build_dataset_from_pipeline directly against
the running pipeline) - this is only for offline inspection/regeneration.
Run as: python -m evaluation.create_dataset
"""

import json
from pathlib import Path

from app.generation.generator import Generator
from app.ingestion.chunker import chunk_text
from app.ingestion.embedder import Embedder
from app.ingestion.loader import load_pdf
from app.rag_pipeline import RAGPipeline
from app.retrieval.retriever import Retriever
from app.retrieval.vector_store import VectorStore

QUESTIONS = [
    {
        "user_input": "How many annual leave days do employees receive?",
        "reference": "Employees receive 20 days of annual leave.",
    },
    {
        "user_input": "How many days before leave should employees apply?",
        "reference": "Employees must submit leave requests at least two weeks in advance.",
    },
    {
        "user_input": "How many unused leave days can be carried forward?",
        "reference": "Up to 5 unused annual leave days can be carried forward into the next calendar year.",
    },
    {
        "user_input": "What is the company's maternity leave policy?",
        "reference": "The company's maternity leave policy is not specified in the provided document.",
    },
    {
        "user_input": "Can employees carry forward unused leave?",
        "reference": "Yes, employees can carry forward up to 5 unused leave days into the next calendar year.",
    },
]


def ingest(directory: str, vector_store: VectorStore, embedder: Embedder) -> None:

    pdf_paths = list(Path(directory).glob("*.pdf"))

    for pdf_path in pdf_paths:
        pages = load_pdf(str(pdf_path))
        chunks = chunk_text(pages)
        vectors = embedder.embed(
            [chunk["text"] for chunk in chunks]
        )

        vector_store.add_documents(chunks, vectors)


def build_dataset_from_pipeline(pipeline, questions: list[dict] | None = None) -> list[dict]:

    questions = QUESTIONS if questions is None else questions
    evaluation_data = []

    for item in questions:
        result = pipeline.run(item["user_input"])

        evaluation_data.append(
            {
                "user_input": item["user_input"],
                "response": result["answer"],
                "retrieved_contexts": [
                    context["text"]
                    for context in result["contexts"]
                ],
                "reference": item["reference"],
            }
        )

        print(f"Processed: {item['user_input']}")

    return evaluation_data


def build_dataset() -> list[dict]:

    embedder = Embedder()
    vector_store = VectorStore()

    ingest("data/documents", vector_store, embedder)

    retriever = Retriever(vector_store, embedder)
    generator = Generator()
    pipeline = RAGPipeline(retriever, generator)

    return build_dataset_from_pipeline(pipeline)


def main():

    evaluation_data = build_dataset()

    output_path = Path("results/evaluation_dataset.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output_path.write_text(
        json.dumps(evaluation_data, indent=2)
    )

    print(f"\nSaved {len(evaluation_data)} examples to {output_path}")


if __name__ == "__main__":
    main()
