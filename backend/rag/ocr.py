import numpy as np
import torch


# The EasyOCR model is large, so load it once and only when first needed
_reader = None


def get_reader():
    global _reader

    if _reader is None:
        import easyocr

        # Uses the GPU automatically if a CUDA build of torch is installed.
        # verbose=False: EasyOCR's download progress bar crashes on
        # Windows consoles that are not UTF-8.
        print("Loading OCR model (first run downloads ~100 MB)...")
        _reader = easyocr.Reader(
            ["en"],
            gpu=torch.cuda.is_available(),
            verbose=False
        )

    return _reader


def ocr_image(image):
    # image: file path, raw bytes, or a numpy array (H x W x channels)
    results = get_reader().readtext(
        image,
        detail=0,
        paragraph=True
    )

    # Give the GPU memory used by OCR back, so Ollama has room for the LLM
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return "\n".join(results).strip()


def ocr_pdf_page(page, dpi=200):
    # Render the PDF page to an image, then read the text from it
    pixmap = page.get_pixmap(dpi=dpi)

    image = np.frombuffer(
        pixmap.samples,
        dtype=np.uint8
    ).reshape(pixmap.height, pixmap.width, pixmap.n)

    return ocr_image(image)
