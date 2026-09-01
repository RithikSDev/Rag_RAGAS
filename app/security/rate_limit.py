from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def key_by_api_key(request: Request) -> str:
    api_key = request.headers.get("X-API-Key")
    return api_key if api_key else get_remote_address(request)


limiter = Limiter(key_func=key_by_api_key)
