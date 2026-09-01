import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.observability.metrics import REQUEST_COUNT, REQUEST_LATENCY

logger = logging.getLogger("app.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
        started = time.perf_counter()

        response = await call_next(request)

        duration_ms = (time.perf_counter() - started) * 1000
        route_path = request.scope.get("route").path if request.scope.get("route") else request.url.path

        response.headers["X-Request-ID"] = request_id

        REQUEST_COUNT.labels(request.method, route_path, str(response.status_code)).inc()
        REQUEST_LATENCY.labels(request.method, route_path).observe(duration_ms / 1000)

        logger.info(
            "request handled",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": route_path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "client_ip": request.client.host if request.client else None,
            },
        )

        return response
