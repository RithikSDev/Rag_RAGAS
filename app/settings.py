from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str
    anthropic_model: str = "claude-haiku-4-5"

    database_url: str = "sqlite:///./data/app.db"
    qdrant_path: str = "./data/qdrant"
    documents_dir: str = "data/documents"

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    admin_api_key: str
    viewer_api_key: str

    max_upload_mb: int = 20

    log_level: str = "INFO"
    log_format: str = "json"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings_cached() -> Settings:
    return Settings()
