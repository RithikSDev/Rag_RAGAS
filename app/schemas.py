import re
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


class RetrievalDebugRequest(BaseModel):
    query: str
    top_k_initial: int = 50
    top_k_final: int = 5
    vector_weight: float = 0.7
    bm25_weight: float = 0.3
    use_reranker: bool = True

    @field_validator("query")
    @classmethod
    def _non_empty_query(cls, value):
        if not value.strip():
            raise ValueError("query must not be empty")
        return value

    @field_validator("top_k_initial")
    @classmethod
    def _valid_top_k_initial(cls, value):
        if not (1 <= value <= 200):
            raise ValueError("top_k_initial must be between 1 and 200")
        return value

    @field_validator("top_k_final")
    @classmethod
    def _valid_top_k_final(cls, value):
        if not (1 <= value <= 50):
            raise ValueError("top_k_final must be between 1 and 50")
        return value

    @field_validator("vector_weight", "bm25_weight")
    @classmethod
    def _valid_weight(cls, value):
        if not (0 <= value <= 1):
            raise ValueError("weights must be between 0 and 1")
        return value

    @model_validator(mode="after")
    def _top_k_final_within_initial(self):
        if self.top_k_final > self.top_k_initial:
            raise ValueError("top_k_final cannot exceed top_k_initial")
        return self


class EvalQuestionCreate(BaseModel):
    user_input: str
    reference: str

    @field_validator("user_input", "reference")
    @classmethod
    def _non_empty(cls, value):
        if not value.strip():
            raise ValueError("must not be empty")
        return value


class EvalQuestionUpdate(BaseModel):
    user_input: str | None = None
    reference: str | None = None

    @field_validator("user_input", "reference")
    @classmethod
    def _non_empty_if_given(cls, value):
        if value is not None and not value.strip():
            raise ValueError("must not be empty")
        return value


class EvalQuestionOut(BaseModel):
    id: str
    user_input: str
    reference: str
    source: str
    created_at: datetime
    created_by: str

    model_config = {"from_attributes": True}


class RunLabelUpdate(BaseModel):
    label: str | None = None
    notes: str | None = None


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


USERNAME_RE = "^[a-zA-Z0-9_.-]{3,32}$"
USER_ROLES = ("admin", "viewer")


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: str

    @field_validator("username")
    @classmethod
    def _valid_username(cls, value):
        if not re.match(USERNAME_RE, value):
            raise ValueError("username must be 3-32 characters: letters, numbers, . _ -")
        return value

    @field_validator("password")
    @classmethod
    def _valid_password(cls, value):
        if len(value) < 8:
            raise ValueError("password must be at least 8 characters")
        return value

    @field_validator("role")
    @classmethod
    def _valid_role(cls, value):
        if value not in USER_ROLES:
            raise ValueError(f"role must be one of {USER_ROLES}")
        return value


class UserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None

    @field_validator("role")
    @classmethod
    def _valid_role(cls, value):
        if value is not None and value not in USER_ROLES:
            raise ValueError(f"role must be one of {USER_ROLES}")
        return value

    @field_validator("password")
    @classmethod
    def _valid_password(cls, value):
        if value is not None and len(value) < 8:
            raise ValueError("password must be at least 8 characters")
        return value


class UserOut(BaseModel):
    id: str
    username: str
    role: str
    is_active: bool
    created_at: datetime
    created_by: str
    last_login_at: datetime | None

    model_config = {"from_attributes": True}
