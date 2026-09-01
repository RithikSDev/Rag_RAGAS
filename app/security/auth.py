import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db_models import ApiKey


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


@dataclass
class Principal:
    id: str
    label: str
    role: str


def seed_api_keys(db: Session, admin_key: str, viewer_key: str) -> None:
    for raw_key, label, role in (
        (admin_key, "admin (env-seeded)", "admin"),
        (viewer_key, "viewer (env-seeded)", "viewer"),
    ):
        key_hash = hash_key(raw_key)
        existing = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).one_or_none()

        if existing is None:
            db.add(ApiKey(key_hash=key_hash, label=label, role=role))

    db.commit()


def resolve_principal(db: Session, x_api_key: str | None) -> Principal:
    """Looks up the caller's API key. Raises 401 if missing, unknown, or revoked."""

    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    key_hash = hash_key(x_api_key)
    record = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).one_or_none()

    if record is None or record.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")

    record.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return Principal(id=record.id, label=record.label, role=record.role)
