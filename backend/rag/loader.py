import fitz
from pathlib import Path

from rag.ocr import ocr_image, ocr_pdf_page


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}
SUPPORTED_EXTENSIONS = {".pdf"} | IMAGE_EXTENSIONS

# Pages with less selectable text than this are treated as scanned
MIN_TEXT_CHARS = 50


def extract_pages_from_pdf(pdf_path, use_ocr=True):
    pages = []

    try:
        with fitz.open(pdf_path) as document:
            for page_number, page in enumerate(document, start=1):
                text = page.get_text("text").strip()

                # 1. Scanned page: no real text layer, so OCR it
                if use_ocr and len(text) < MIN_TEXT_CHARS:
                    ocr_text = ocr_pdf_page(page)

                    if len(ocr_text) > len(text):
                        print(f"  OCR used for page {page_number}")
                        text = ocr_text

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


def extract_pages_from_image(image_path):
    try:
        text = ocr_image(str(image_path))

    except Exception as exc:
        raise RuntimeError(
            f"Could not read image: {image_path}"
        ) from exc

    if not text:
        return []

    # An image is treated as a single page
    return [{
        "source": Path(image_path).name,
        "page": 1,
        "text": text
    }]


def load_document(path):
    suffix = Path(path).suffix.lower()

    if suffix == ".pdf":
        return extract_pages_from_pdf(path)

    if suffix in IMAGE_EXTENSIONS:
        return extract_pages_from_image(path)

    raise ValueError(f"Unsupported file type: {suffix}")
