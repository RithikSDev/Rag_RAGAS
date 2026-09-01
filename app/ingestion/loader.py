import fitz


def load_pdf(file_path: str) -> list[dict]:
    document = fitz.open(file_path)

    pages = []

    for page_number, page in enumerate(document):
        text = page.get_text()

        pages.append(
            {
                "page": page_number + 1,
                "text": text,
            }
        )

    document.close()

    return pages