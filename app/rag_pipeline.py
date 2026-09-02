import time


class RAGPipeline:

    def __init__(
        self,
        retriever,
        generator,
        top_k: int = 5,
    ):
        self.retriever = retriever
        self.generator = generator
        self.top_k = top_k

    def run(self, question, top_k=None):

        retrieval_started = time.perf_counter()

        contexts = self.retriever.search(
            question,
            top_k=top_k or self.top_k,
        )

        retrieval_ms = (time.perf_counter() - retrieval_started) * 1000

        generation_started = time.perf_counter()

        answer = self.generator.generate(
            question,
            contexts,
        )

        generation_ms = (time.perf_counter() - generation_started) * 1000

        return {
            "question": question,
            "contexts": contexts,
            "answer": answer,
            "timing": {
                "retrieval_ms": retrieval_ms,
                "generation_ms": generation_ms,
            },
        }
