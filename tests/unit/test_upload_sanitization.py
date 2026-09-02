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


@pytest.mark.parametrize(
    "original_name,expected_suffix",
    [("report.pdf", ".pdf"), ("deck.pptx", ".pptx"), ("notes.txt", ".txt"), ("REPORT.PDF", ".pdf")],
)
def test_generate_stored_filename_is_uuid_with_matching_extension(original_name, expected_suffix):
    name = generate_stored_filename(original_name)

    assert name.endswith(expected_suffix)
    assert len(name) == len(f"00000000000000000000000000000000{expected_suffix}")


@pytest.mark.parametrize(
    "malicious_name",
    ["../../etc/evil.pdf", "..\\..\\windows\\evil.pdf", "/etc/passwd.pdf"],
)
def test_generate_stored_filename_never_reflects_user_input(malicious_name):
    # The whole point: the disk filename is never derived from user input at all.
    for _ in range(5):
        assert malicious_name not in generate_stored_filename(malicious_name)


@pytest.mark.parametrize("name", ["report.pdf", "REPORT.PDF", "deck.pptx", "notes.txt", "notes.TXT"])
def test_validate_extension_accepts_supported_types(name):
    validate_extension(name)  # case-insensitive, doesn't raise


@pytest.mark.parametrize("bad_name", ["evil.exe", "evil.pdf.exe", "no-extension", "image.png", "doc.docx"])
def test_validate_extension_rejects_unsupported_types(bad_name):
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


def test_read_and_validate_upload_rejects_bad_pdf_magic_bytes():
    file = FakeUploadFile("doc.pdf", b"not a pdf at all")

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 400


def test_read_and_validate_upload_accepts_real_pptx_magic_bytes():
    content = b"PK\x03\x04" + b"fake zip content"
    file = FakeUploadFile("deck.pptx", content)

    raw, sha256 = _run(read_and_validate_upload(file, max_upload_mb=1))

    assert raw == content
    assert len(sha256) == 64


def test_read_and_validate_upload_rejects_bad_pptx_magic_bytes():
    file = FakeUploadFile("deck.pptx", b"not a zip at all")

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 400


def test_read_and_validate_upload_accepts_plain_text():
    content = "Employees receive 20 days of annual leave per year.".encode("utf-8")
    file = FakeUploadFile("notes.txt", content)

    raw, sha256 = _run(read_and_validate_upload(file, max_upload_mb=1))

    assert raw == content
    assert len(sha256) == 64


def test_read_and_validate_upload_rejects_non_utf8_text():
    file = FakeUploadFile("notes.txt", b"\xff\xfe not valid utf-8")

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


def test_read_and_validate_upload_rejects_unsupported_extension():
    file = FakeUploadFile("doc.exe", b"%PDF-1.4")

    with pytest.raises(HTTPException) as exc_info:
        _run(read_and_validate_upload(file, max_upload_mb=1))

    assert exc_info.value.status_code == 400
