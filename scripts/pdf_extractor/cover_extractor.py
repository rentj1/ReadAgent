"""
PDF Cover Extraction - Extract cover images from PDF files.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import fitz  # pymupdf
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False


def render_page_to_image(pdf_path: str, page_num: int, dpi: int = 150):
    """Render a single PDF page to a PIL Image using pymupdf (preferred) or pdf2image."""
    if HAS_FITZ:
        doc = fitz.open(pdf_path)
        if page_num >= len(doc):
            return None
        page = doc[page_num]
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        from PIL import Image
        import io
        img_bytes = pix.tobytes("jpeg")
        return Image.open(io.BytesIO(img_bytes))
    elif HAS_PDF2IMAGE:
        images = convert_from_path(pdf_path, first_page=page_num + 1, last_page=page_num + 1, dpi=dpi)
        return images[0] if images else None
    return None


def page_is_blank(img) -> bool:
    """Return True if the image is mostly white (empty page)."""
    try:
        gray = img.convert('L')
        pixels = list(gray.getdata())
        mean_brightness = sum(pixels) / len(pixels)
        return mean_brightness > 245
    except Exception:
        return False


def extract_cover(pdf_path: str, cover_dir: str, book_id: str) -> str | None:
    """
    Extract cover image. Tries page 1 first; if blank, tries pages 2-6.
    Uses pymupdf (no system deps) or pdf2image as fallback.
    Returns URL path or None.
    """
    if not HAS_FITZ and not HAS_PDF2IMAGE:
        print("[extract-pdf] Neither pymupdf nor pdf2image installed, skipping cover", file=sys.stderr)
        return None

    try:
        Path(cover_dir).mkdir(parents=True, exist_ok=True)
        out_path = Path(cover_dir) / f"{book_id}.jpg"

        # Try pages 0-5 (0-indexed), pick first non-blank one
        chosen_img = None
        for page_idx in range(6):
            img = render_page_to_image(pdf_path, page_idx, dpi=150)
            if img is None:
                break
            if not page_is_blank(img):
                chosen_img = img
                print(f"[extract-pdf] Cover from page {page_idx + 1}", file=sys.stderr)
                break

        if chosen_img is None:
            # All first 6 pages are blank — just use page 1
            chosen_img = render_page_to_image(pdf_path, 0, dpi=150)

        if chosen_img:
            chosen_img.save(str(out_path), "JPEG", quality=85)
            print(f"[extract-pdf] Cover saved: {out_path}", file=sys.stderr)
            return f"/covers/{book_id}.jpg"
    except Exception as e:
        print(f"[extract-pdf] Cover extraction failed: {e}", file=sys.stderr)
    return None
