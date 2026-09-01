import hashlib
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

PDF_MAGIC = b"%PDF-"
CHUNK_BYTES = 1024 * 1024


def generate_stored_filename() -> str:
    return f"{uuid.uuid4().hex}.pdf"


def validate_extension(original_filename: str) -> None:
    if Path(original_filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted")


async def read_and_validate_upload(file: UploadFile, max_upload_mb: int) -> tuple[bytes, str]:
    """Reads the upload in chunks, enforcing a size cap and a PDF magic-byte check.
    Returns (raw_bytes, sha256_hex). Never trusts file.filename for anything but
    the extension check above — the caller must generate its own disk filename."""

    validate_extension(file.filename or "")

    max_bytes = max_upload_mb * 1024 * 1024
    sha256 = hashlib.sha256()
    buffer = bytearray()
    total = 0
    first_chunk = True

    while True:
        chunk = await file.read(CHUNK_BYTES)

        if not chunk:
            break

        if first_chunk:
            if not chunk.startswith(PDF_MAGIC):
                raise HTTPException(status_code=400, detail="File is not a valid PDF")
            first_chunk = False

        total += len(chunk)

        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"File exceeds {max_upload_mb}MB limit")

        sha256.update(chunk)
        buffer.extend(chunk)

    if total == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    return bytes(buffer), sha256.hexdigest()
