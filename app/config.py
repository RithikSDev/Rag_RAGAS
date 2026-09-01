from dataclasses import asdict, dataclass

CHUNKING_STRATEGIES = ("fixed", "semantic")


@dataclass
class PipelineConfig:
    chunk_size: int = 500
    chunk_overlap: int = 50
    chunking_strategy: str = "fixed"
    semantic_threshold: float = 0.75
    top_k: int = 5

    def to_dict(self) -> dict:
        return asdict(self)

    def update(self, **kwargs) -> None:
        for key, value in kwargs.items():
            if value is not None:
                setattr(self, key, value)
