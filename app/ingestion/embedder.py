from sentence_transformers import SentenceTransformer


class Embedder:

    def __init__(self):
        self.model = SentenceTransformer(
            "BAAI/bge-small-en-v1.5"
        )

    def embed(self, texts: list[str]):
        return self.model.encode(
            texts,
            normalize_embeddings=True
        )