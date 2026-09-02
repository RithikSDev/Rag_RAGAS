from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.security.jwt_tokens import create_access_token, decode_access_token


def test_create_and_decode_round_trip():
    token = create_access_token("user-1", "admin", secret="s3cret", algorithm="HS256", expire_minutes=60)

    payload = decode_access_token(token, secret="s3cret", algorithm="HS256")

    assert payload["sub"] == "user-1"
    assert payload["role"] == "admin"


def test_decode_rejects_wrong_secret():
    token = create_access_token("user-1", "admin", secret="s3cret", algorithm="HS256", expire_minutes=60)

    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(token, secret="different-secret", algorithm="HS256")


def test_decode_rejects_expired_token():
    now = datetime.now(timezone.utc)
    expired_payload = {"sub": "user-1", "role": "admin", "iat": now - timedelta(hours=2), "exp": now - timedelta(hours=1)}
    token = jwt.encode(expired_payload, "s3cret", algorithm="HS256")

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token, secret="s3cret", algorithm="HS256")


def test_decode_rejects_tampered_token():
    token = create_access_token("user-1", "viewer", secret="s3cret", algorithm="HS256", expire_minutes=60)
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    with pytest.raises(jwt.PyJWTError):
        decode_access_token(tampered, secret="s3cret", algorithm="HS256")
