import fitz
from pathlib import Path


def extract_pages_from_pdf(pdf_path):
    pages = []

    try:
        with fitz.open(pdf_path) as document:
            for page_number, page in enumerate(document, start=1):
                text = page.get_text("text").strip()

                if text:
                    pages.append({
                        "source": Path(pdf_path).name,
                        "page": page_number,
                        "text": text
                    })

    except Exception as exc:
        raise RuntimeError(
            f"Could not read PDF: {pdf_path}"
        ) from exc

    return pages
