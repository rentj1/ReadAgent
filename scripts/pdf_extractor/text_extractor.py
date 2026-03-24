"""
PDF Text Extraction - Extract text from PDF files with layout awareness.
"""

from __future__ import annotations

import re
import statistics
from typing import Counter

import pdfplumber

from .constants import (
    LAYOUT_MARGIN_Y_RATIO,
    LINE_Y_TOLERANCE,
    MIN_PARA_GAP,
)


def extract_metadata_title(pdf_path: str) -> str | None:
    """Extract title from PDF metadata."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            meta = pdf.metadata or {}
            title = meta.get('Title', '').strip()
            if title and len(title) > 1:
                return title
    except Exception:
        pass
    return None


def infer_title_from_text(pages_text: list[str]) -> str:
    """
    Infer title from page content (title page is usually page 1-3 in Chinese ebooks).
    
    Strategy:
    1. Check pages 1-3 first (title page is usually early in the PDF)
    2. Skip table of contents pages (contain "目录")
    3. Skip chapter number patterns (第 X 章，Chapter X, etc.)
    4. Skip copyright/ISBN info
    5. Look for prominent lines (not too short, not too long)
    6. Fallback: use first reasonable line from title page area
    """
    import re
    
    # Patterns that indicate this is NOT a book title
    skip_patterns = [
        r'ISBN',
        r'版权',
        r'copyright',
        r'©',
        r'\d{4}年',
        r'目录',  # Table of contents
        r'^第 [一二三四五六七八九十百千零 0-9]+[章篇节部]',  # Chapter number
        r'^Chapter\s+\d+',  # English chapter
        r'^PART\s+[IVX]+',  # Part number
        r'^序',  # Preface
        r'^前言',  # Foreword
        r'^推荐',  # Recommendation
        r'^致谢',  # Acknowledgements
    ]
    
    def should_skip_line(line: str) -> bool:
        """Check if line should be skipped (not a book title)."""
        for pattern in skip_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                return True
        return False
    
    def is_good_title_candidate(line: str) -> bool:
        """Check if line is a good book title candidate."""
        line = line.strip()
        if not line:
            return False
        # Good title: 4-50 characters (Chinese books can have longer titles)
        if len(line) < 4 or len(line) > 50:
            return False
        # Should not look like a chapter title
        if should_skip_line(line):
            return False
        # Should not contain obvious section markers
        if re.search(r'（\d+/\d+）', line):  # Like "（1/8）"
            return False
        return True
    
    # Priority 1: Check pages 1-3 (0-indexed: 1, 2, 3) - title page area
    # Skip page 0 which might be cover with no text
    for page_idx in range(1, min(4, len(pages_text))):
        page = pages_text[page_idx]
        lines = [l.strip() for l in page.split('\n') if l.strip()]
        
        # Check if this page looks like table of contents
        page_text_lower = page.lower()
        if '目录' in page_text_lower or 'contents' in page_text_lower:
            continue  # Skip TOC pages
        
        # Find the first good title candidate on this page
        for line in lines:
            if is_good_title_candidate(line):
                return line
    
    # Priority 2: Check pages 4-6 as fallback
    for page_idx in range(4, min(7, len(pages_text))):
        page = pages_text[page_idx]
        lines = [l.strip() for l in page.split('\n') if l.strip()]
        
        # Skip TOC pages
        page_text_lower = page.lower()
        if '目录' in page_text_lower or 'contents' in page_text_lower:
            continue
        
        for line in lines:
            if is_good_title_candidate(line):
                return line
    
    # Fallback: use first reasonable line from any page (but still filter chapters)
    for page in pages_text[:10]:  # Only check first 10 pages
        for line in page.split('\n'):
            line = line.strip()
            if len(line) > 2 and len(line) < 60 and not should_skip_line(line):
                return line
    
    return '未命名'


def _needs_space_between(prev: str, nxt: str) -> bool:
    """Insert space between Latin tokens; Chinese stays glued."""
    if not prev or not nxt:
        return False
    return bool(re.search(r'[a-zA-Z0-9]$', prev) and re.match(r'^[a-zA-Z0-9]', nxt))


def cluster_words_into_lines(words: list[dict], y_tol: float = LINE_Y_TOLERANCE) -> list[list[dict]]:
    """Group words that share the same text line (similar top)."""
    if not words:
        return []
    sorted_w = sorted(words, key=lambda w: (w['top'], w['x0']))
    lines: list[list[dict]] = []
    current = [sorted_w[0]]
    for w in sorted_w[1:]:
        if abs(w['top'] - current[-1]['top']) <= y_tol:
            current.append(w)
        else:
            lines.append(current)
            current = [w]
    lines.append(current)
    return lines


def line_join_words(line_words: list[dict]) -> str:
    parts: list[str] = []
    for w in sorted(line_words, key=lambda w: w['x0']):
        t = w.get('text') or ''
        if not t:
            continue
        if parts and _needs_space_between(parts[-1], t):
            parts.append(' ' + t)
        else:
            parts.append(t)
    return ''.join(parts)


def _is_page_number_line(s: str) -> bool:
    t = s.strip()
    if not t:
        return True
    if re.match(r'^\d{1,4}$', t):
        return True
    if re.match(r'^第\d{1,4}页$', t):
        return True
    if re.match(r'^-\s*\d+\s*-$', t):
        return True
    return False


def extract_page_paragraphs_layout(
    page,
    margin_ratio: float = LAYOUT_MARGIN_Y_RATIO,
    noise_lines: set[str] | None = None,
) -> list[str]:
    """
    Use word geometry: cluster into lines, then split paragraphs by vertical gap / font jump.
    Returns list of paragraph strings for one page.
    """
    words = page.extract_words(use_text_flow=True) or []
    if not words:
        return []

    h = float(page.height)
    y_min = h * margin_ratio
    y_max = h * (1.0 - margin_ratio)
    body_words = [w for w in words if y_min <= float(w.get('top', 0)) <= y_max]
    if not body_words:
        body_words = words

    lines = cluster_words_into_lines(body_words)
    line_infos: list[tuple[str, float, float, float]] = []
    for lw in lines:
        top = min(float(w['top']) for w in lw)
        bottom = max(float(w['bottom']) for w in lw)
        sizes = [float(w.get('size') or 10) for w in lw]
        sz = statistics.median(sizes) if sizes else 10.0
        txt = line_join_words(lw).strip()
        if not txt or _is_page_number_line(txt):
            continue
        if noise_lines and txt in noise_lines:
            continue
        line_infos.append((txt, top, bottom, sz))

    if not line_infos:
        return []

    heights = [b - t for _, t, b, _ in line_infos]
    median_h = statistics.median(heights) if heights else 12.0
    median_sz = statistics.median([s for *_, s in line_infos]) if line_infos else 11.0
    gap_threshold = max(MIN_PARA_GAP, median_h * 0.75)

    def _is_chapter_heading_line(s: str) -> bool:
        t = s.strip()
        if len(t) > 100:
            return False
        return bool(re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]', t))

    paragraphs: list[str] = []
    buf: list[str] = []
    prev_bottom: float | None = None

    for i, (txt, top, bottom, sz) in enumerate(line_infos):
        if prev_bottom is None:
            buf.append(txt)
            prev_bottom = bottom
            continue
        gap = top - prev_bottom
        big_gap = gap > gap_threshold
        title_jump = sz > median_sz * 1.18 and len(txt) < 50
        chapter_line = _is_chapter_heading_line(txt)

        if big_gap or title_jump or chapter_line:
            if buf:
                paragraphs.append(''.join(buf))
            buf = [txt]
        else:
            buf.append(txt)
        prev_bottom = bottom

    if buf:
        paragraphs.append(''.join(buf))

    return [p for p in paragraphs if len(p.strip()) >= 1]


def repeated_noise_lines(lines_per_page: list[list[str]], min_pages: int = 4) -> set[str]:
    """Lines that repeat across many pages (book title in header, etc.)."""
    n = len(lines_per_page)
    if n < min_pages:
        return set()
    c: Counter[str] = Counter()
    for pl in lines_per_page:
        seen = set(pl)
        for line in seen:
            if len(line) < 80:
                c[line] += 1
    threshold = max(4, int(n * 0.28))
    return {line for line, count in c.items() if count >= threshold}


def extract_pages_text(pdf_path: str) -> list[str]:
    """
    Extract text from each page using layout-aware paragraph detection.
    Falls back to plain extract_text() if word stream is empty.
    """
    lines_per_page: list[list[str]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = page.extract_words(use_text_flow=True) or []
            h = float(page.height)
            y_min = h * LAYOUT_MARGIN_Y_RATIO
            y_max = h * (1.0 - LAYOUT_MARGIN_Y_RATIO)
            body_words = [w for w in words if y_min <= float(w.get('top', 0)) <= y_max]
            if not body_words:
                body_words = words
            lines = cluster_words_into_lines(body_words)
            page_lines: list[str] = []
            for lw in lines:
                t = line_join_words(lw).strip()
                if t and not _is_page_number_line(t):
                    page_lines.append(t)
            lines_per_page.append(page_lines)

    noise_lines = repeated_noise_lines(lines_per_page)

    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            paras = extract_page_paragraphs_layout(page, noise_lines=noise_lines)
            if paras:
                pages.append('\n\n'.join(paras))
                continue
            text = (page.extract_text() or '').strip()
            pages.append(text)

    return pages
