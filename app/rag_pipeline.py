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

        contexts = self.retriever.search(
            question,
            top_k=top_k or self.top_k,
        )

        answer = self.generator.generate(
            question,
            contexts,
        )

        return {
            "question": question,
            "contexts": contexts,
            "answer": answer,
        }
