import hashlib
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

# Only PDF and PPTX have a reliable magic-byte signature to check up front;
# plain text has none (any byte sequence can be "text"), so it's validated by
# attempting a UTF-8 decode instead, after the size cap.
MAGIC_BYTES = {
    ".pdf": b"%PDF-",
    ".pptx": b"PK\x03\x04",  # PPTX is a zip archive
}
ALLOWED_EXTENSIONS = (".pdf", ".pptx", ".txt")
CHUNK_BYTES = 1024 * 1024


def generate_stored_filename(original_filename: str) -> str:
    suffix = Path(original_filename).suffix.lower()
    return f"{uuid.uuid4().hex}{suffix}"


def validate_extension(original_filename: str) -> str:
    suffix = Path(original_filename).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Only {', '.join(ALLOWED_EXTENSIONS)} files are accepted",
        )

    return suffix


async def read_and_validate_upload(file: UploadFile, max_upload_mb: int) -> tuple[bytes, str]:
    """Reads the upload in chunks, enforcing a size cap and a magic-byte check
    where one exists for the file type. Returns (raw_bytes, sha256_hex). Never
    trusts file.filename for anything but the extension check above — the
    caller must generate its own disk filename."""

    suffix = validate_extension(file.filename or "")
    expected_magic = MAGIC_BYTES.get(suffix)

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
            if expected_magic and not chunk.startswith(expected_magic):
                raise HTTPException(status_code=400, detail=f"File is not a valid {suffix} file")
            first_chunk = False

        total += len(chunk)

        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"File exceeds {max_upload_mb}MB limit")

        sha256.update(chunk)
        buffer.extend(chunk)

    if total == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if suffix == ".txt":
        try:
            buffer.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="File is not valid UTF-8 text") from exc

    return bytes(buffer), sha256.hexdigest()
