def test_list_documents_starts_empty(client, viewer_headers):
    response = client.get("/documents", headers=viewer_headers)

    assert response.status_code == 200
    assert response.json() == {"documents": []}


def test_upload_requires_admin(client, viewer_headers, valid_pdf_bytes):
    response = client.post(
        "/documents",
        headers=viewer_headers,
        files={"file": ("handbook.pdf", valid_pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 403


def test_upload_valid_pdf_succeeds_and_appears_in_list(client, admin_headers, valid_pdf_bytes):
    upload_response = client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.pdf", valid_pdf_bytes, "application/pdf")},
    )

    assert upload_response.status_code == 200
    body = upload_response.json()
    assert body["name"] == "handbook.pdf"
    assert body["chunks"] >= 1

    list_response = client.get("/documents", headers=admin_headers)
    names = [doc["name"] for doc in list_response.json()["documents"]]
    assert "handbook.pdf" in names


def test_upload_rejects_non_pdf_extension(client, admin_headers, valid_pdf_bytes):
    response = client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.exe", valid_pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 400


def test_upload_rejects_bad_magic_bytes(client, admin_headers):
    response = client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.pdf", b"not a real pdf", "application/pdf")},
    )
    assert response.status_code == 400


def test_upload_path_traversal_filename_is_neutralized(client, admin_headers, valid_pdf_bytes):
    """The uploaded filename tries to escape the documents dir. It must never
    be used as the on-disk path - only as a display name."""
    from pathlib import Path

    response = client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("../../evil.pdf", valid_pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 200

    documents_dir = Path(client.app.state.app_state.documents_dir)
    on_disk = list(documents_dir.glob("*.pdf"))

    assert len(on_disk) == 1
    assert on_disk[0].name != "evil.pdf"  # server-generated UUID name, not the client's
    assert ".." not in on_disk[0].name

    # and nothing was written outside documents_dir
    assert not (documents_dir.parent / "evil.pdf").exists()


def test_upload_oversized_file_rejected(client, admin_headers):
    # Default MAX_UPLOAD_MB is 20 - exceed it directly rather than fiddling
    # with the process-wide settings cache mid-test.
    oversized = b"%PDF-1.4" + b"x" * (21 * 1024 * 1024)

    response = client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("big.pdf", oversized, "application/pdf")},
    )

    assert response.status_code == 413
