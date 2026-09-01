import asyncio

import pytest
from fastapi import HTTPException

from app.security.uploads import (
    generate_stored_filename,
    read_and_validate_upload,
    validate_extension,
)


class FakeUploadFile:
    """Duck-types just the surface read_and_validate_upload actually uses."""

    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self._content = content
        self._pos = 0

    async def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            chunk = self._content[self._pos :]
        else:
            chunk = self._content[self._pos : self._pos + size]

        self._pos += len(chunk)
        return chunk


def _run(coro):
    return asyncio.run(coro)


def test_generate_stored_filename_is_uuid_pdf():
    name = generate_stored_filename()

    assert name.endswith(".pdf")
    assert len(name) == len("00000000000000000000000000000000.pdf")


@pytest.mark.parametrize(
    "malicious_name",
    ["../../etc/evil.pdf", "..\\..\\windows\\evil.pdf", "/etc/passwd.pdf"],
)
def test_generate_stored_filename_never_reflects_user_input(malicious_name):
    # The whole point: the disk filename is never derived from user input at all.
    for _ in range(5):
        assert malicious_name not in generate_stored_filename()


def test_validate_extension_accepts_pdf():
    validate_extension("report.pdf")
    validate_extension("REPORT.PDF")  # case-insensitive


@pytest.mark.parametrize("bad_name", ["evil.exe", "evil.pdf.exe", "no-extension"])
def test_validate_extension_rejects_non_pdf(bad_name):
    # Note: "../../evil.pdf" is NOT tested here - it has a valid .pdf suffix,
    # so validate_extension() correctly lets it through. Path-traversal safety
    # comes entirely from generate_stored_filename() ignoring the original
    # name, covered by test_generate_stored_filename_never_reflects_user_input.
    with pytest.raises(HTTPException) as exc_info:
        validate_extension(bad_name)

    assert exc_info.value.status_code == 400


def test_read_and_validate_upload_accepts_real_pdf_magic_bytes():
    content = b"%PDF-1.4\n%content"
    file = FakeUploadFile("doc.pdf", content)

    raw, sha256 = _run(read_and_validate_upload(file, max_upload_mb=1))

    assert raw == content
    assert len(sha256) == 64


def test_read_and_validate_upload_rejects_bad_magic_bytes():
    file = FakeUploadFile("doc.pdf", b"not a pdf at all")

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 400


def test_read_and_validate_upload_rejects_oversized_file():
    content = b"%PDF-1.4" + (b"x" * (2 * 1024 * 1024))
    file = FakeUploadFile("doc.pdf", content)

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 413


def test_read_and_validate_upload_rejects_empty_file():
    file = FakeUploadFile("doc.pdf", b"")

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 400


def test_read_and_validate_upload_rejects_non_pdf_extension():
    file = FakeUploadFile("doc.exe", b"%PDF-1.4")

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 400
