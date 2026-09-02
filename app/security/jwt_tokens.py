from datetime import datetime, timedelta, timezone

import jwt


def create_access_token(
    user_id: str,
    role: str,
    secret: str,
    algorithm: str,
    expire_minutes: int,
) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
    }

    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_access_token(token: str, secret: str, algorithm: str) -> dict:
    """Raises jwt.PyJWTError (ExpiredSignatureError, InvalidTokenError, ...)
    on anything wrong with the token - callers translate that to a 401."""
    return jwt.decode(token, secret, algorithms=[algorithm])
