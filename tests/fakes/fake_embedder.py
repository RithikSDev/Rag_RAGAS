import hashlib

import numpy as np


class FakeEmbedder:
    """Deterministic hash-seeded unit vectors - no model download, no torch.
    Same text always yields the same vector, different text yields different
    (uncorrelated) vectors, which is all the retrieval logic actually needs."""

    dim = 384

    def embed(self, texts):
        vectors = []

        for text in texts:
            seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16) % (2**32)
            rng = np.random.default_rng(seed)
            vector = rng.normal(size=self.dim)
            vectors.append(vector / np.linalg.norm(vector))

        return np.array(vectors)
