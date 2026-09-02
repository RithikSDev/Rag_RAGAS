from datetime import datetime

from pydantic import BaseModel, field_validator, model_validator

CHUNKING_STRATEGIES = ("fixed", "semantic")


class Question(BaseModel):
    question: str


class SettingsUpdate(BaseModel):
    chunk_size: int | None = None
    chunk_overlap: int | None = None
    chunking_strategy: str | None = None
    semantic_threshold: float | None = None
    top_k: int | None = None

    @field_validator("chunking_strategy")
    @classmethod
    def _valid_strategy(cls, value):
        if value is not None and value not in CHUNKING_STRATEGIES:
            raise ValueError(f"chunking_strategy must be one of {CHUNKING_STRATEGIES}")
        return value

    @field_validator("chunk_size")
    @classmethod
    def _valid_chunk_size(cls, value):
        if value is not None and value < 50:
            raise ValueError("chunk_size must be at least 50")
        return value

    @field_validator("chunk_overlap")
    @classmethod
    def _valid_overlap(cls, value):
        if value is not None and value < 0:
            raise ValueError("chunk_overlap must be non-negative")
        return value

    @field_validator("semantic_threshold")
    @classmethod
    def _valid_threshold(cls, value):
        if value is not None and not (0 <= value <= 1):
            raise ValueError("semantic_threshold must be between 0 and 1")
        return value

    @field_validator("top_k")
    @classmethod
    def _valid_top_k(cls, value):
        if value is not None and not (1 <= value <= 20):
            raise ValueError("top_k must be between 1 and 20")
        return value


def validate_settings_merge(merged: dict) -> None:
    """Cross-field check that needs the fully merged (existing + update) config."""
    if merged["chunk_overlap"] >= merged["chunk_size"]:
        raise ValueError("chunk_overlap must be smaller than chunk_size")


class MetricThresholdEntry(BaseModel):
    good: float
    warning: float

    @field_validator("good", "warning")
    @classmethod
    def _in_range(cls, value):
        if not (0 <= value <= 1):
            raise ValueError("threshold values must be between 0 and 1")
        return value

    @model_validator(mode="after")
    def _good_above_warning(self):
        if self.good <= self.warning:
            raise ValueError("good threshold must be greater than warning threshold")
        return self


class ThresholdsUpdate(BaseModel):
    thresholds: dict[str, MetricThresholdEntry]

    @field_validator("thresholds")
    @classmethod
    def _known_metrics_only(cls, value):
        from app.services.threshold_service import KNOWN_METRICS

        unknown = set(value) - set(KNOWN_METRICS)
        if unknown:
            raise ValueError(f"unknown metric(s): {sorted(unknown)}")
        return value


class DocumentOut(BaseModel):
    name: str
    chunks: int
    ingested_at: datetime
    status: str

    model_config = {"from_attributes": True}


class PipelineConfigOut(BaseModel):
    chunk_size: int
    chunk_overlap: int
    chunking_strategy: str
    semantic_threshold: float
    top_k: int

    model_config = {"from_attributes": True}
