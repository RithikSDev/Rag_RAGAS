class Retriever:

    def __init__(self, vector_store, embedder):
        self.vector_store = vector_store
        self.embedder = embedder

    def search(self, query: str, top_k: int = 5):

        query_vector = self.embedder.embed(
            [query]
        )[0]

        results = self.vector_store.client.query_points(
            collection_name=self.vector_store.collection_name,
            query=query_vector.tolist(),
            limit=top_k,
        ).points

        return [
            {**result.payload, "id": result.id, "score": result.score}
            for result in results
        ]
