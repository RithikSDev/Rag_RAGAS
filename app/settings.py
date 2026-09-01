from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str
    anthropic_model: str = "claude-haiku-4-5"

    database_url: str = "sqlite:///./data/app.db"
    qdrant_path: str = "./data/qdrant"
    documents_dir: str = "data/documents"

    # Deliberately a plain str, not list[str]: pydantic-settings JSON-decodes
    # env values for complex (list/dict) fields *before* any field validator
    # runs, so a plain comma-separated env var ("a,b") fails to parse as JSON
    # and raises SettingsError before a "before" validator ever sees it. A str
    # field skips that JSON-decode path entirely - split via the property below.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    admin_api_key: str
    viewer_api_key: str

    max_upload_mb: int = 20

    log_level: str = "INFO"
    log_format: str = "json"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings_cached() -> Settings:
    return Settings()
