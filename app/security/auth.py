import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db_models import ApiKey, User
from app.security.jwt_tokens import decode_access_token


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


def _resolve_from_api_key(db: Session, x_api_key: str) -> Principal:
    key_hash = hash_key(x_api_key)
    record = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).one_or_none()

    if record is None or record.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")

    record.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return Principal(id=record.id, label=record.label, role=record.role)


def _resolve_from_bearer_token(db: Session, token: str, jwt_secret: str, jwt_algorithm: str) -> Principal:
    try:
        payload = decode_access_token(token, jwt_secret, jwt_algorithm)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again") from None
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid session token") from None

    user = db.get(User, payload.get("sub"))

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Account not found or deactivated")

    return Principal(id=user.id, label=user.username, role=user.role)


def resolve_principal(
    db: Session,
    x_api_key: str | None,
    bearer_token: str | None,
    jwt_secret: str,
    jwt_algorithm: str,
) -> Principal:
    """Two independent, additive auth paths that both resolve to the same
    Principal: a long-lived API key (service accounts, scripts, CI - seeded
    from env) or a short-lived JWT from /auth/login (real user accounts,
    what the web UI uses). Either is sufficient; neither is required by the
    other."""

    if bearer_token:
        return _resolve_from_bearer_token(db, bearer_token, jwt_secret, jwt_algorithm)

    if x_api_key:
        return _resolve_from_api_key(db, x_api_key)

    raise HTTPException(status_code=401, detail="Missing credentials")
