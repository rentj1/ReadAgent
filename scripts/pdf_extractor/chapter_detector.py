"""
Chapter Detection - Detect chapter boundaries and normalize chapter titles.
"""

from __future__ import annotations

import re

from .constants import (
    CHAPTER_PATTERNS,
    CHAPTER_LINE_ONLY,
    CHAPTER_LINE_COMBINED,
    SKIP_KEYWORDS,
    _MAX_CHAPTER_SUBTITLE_CHARS,
)


def find_chapter_heading(text: str) -> str | None:
    """Return the first chapter heading found in a block of text, or None."""
    # Chinese numerals for chapters
    CHINESE_NUMS = '一二三四五六七八九十百千零'
    
    for line in text.replace('\r', '').split('\n'):
        line = line.strip()
        if not line or len(line) > 120:
            continue
        
        # Check if line starts with "第 X 章/篇/节/部" pattern
        if line.startswith('第') and len(line) >= 3:
            # Find the chapter type character (章/篇/节/部)
            for i, char in enumerate(line[1:], 1):
                if char in '章篇节部':
                    # Check if characters between '第' and chapter type are valid numerals
                    numeral_part = line[1:i]
                    if numeral_part and all(c in CHINESE_NUMS or c in '0123456789' for c in numeral_part):
                        # Found a valid chapter heading
                        return line[:i+1].strip()
        
        # Try regex patterns as fallback
        for pattern in CHAPTER_PATTERNS:
            m = pattern.match(line)
            if m:
                heading = m.group().strip()
                if len(heading) >= 3:
                    return heading
    
    return None


def strip_standalone_page_number_lines(text: str) -> str:
    """Remove leading/trailing lines that are only page numbers (merge artifacts)."""
    lines = [l.strip() for l in text.replace('\r', '').split('\n') if l.strip()]
    while lines and re.match(r'^\d{1,4}$', lines[0]):
        lines.pop(0)
    while lines and re.match(r'^\d{1,4}$', lines[-1]):
        lines.pop()
    return '\n\n'.join(lines)


def _structural_split_chapter_rest(rest: str) -> str | None:
    """
    Cross-book heuristics: stop before the next structural marker in glued text (not prose from one book).
    """
    rest = rest.strip()
    if not rest:
        return None
    # Next "第…节" often starts a section block (common in CN books).
    m = re.search(r'第(?:[一二三四五六七八九十百千零]|\d)+节', rest)
    if m and m.start() >= 2:
        return rest[: m.start()].strip()
    # Another "第…章" inside the same line (duplicate heading / merged TOC).
    m2 = re.search(r'(?<=.)第(?:[一二三四五六七八九十百千零]|\d)+[章篇节部]', rest)
    if m2 and m2.start() >= 4:
        return rest[: m2.start()].strip()
    # Body often switches to English; chapter titles here are usually Chinese-only.
    m3 = re.search(r'[a-zA-Z]{4,}', rest)
    if m3 and m3.start() >= 4:
        return rest[: m3.start()].strip()
    return None


def clamp_glued_chapter_title(title: str) -> str:
    """
    When PDF merges 章名 + section lines into one string, trim using structural rules only.
    If still too long then cap length (lossy) — prefer EXTRACT_LLM_REFINE_TITLES + DASHSCOPE_API_KEY for quality.
    """
    t = title.strip()
    if not _is_numbered_chapter_title(t):
        return title

    def _clamp_rest(num: str, rest: str) -> str:
        rest = rest.strip()
        if not rest:
            return num
        # Prefer structural split even when rest is short (e.g. "越少越好第一节…" is still ≤22 chars).
        cut = _structural_split_chapter_rest(rest)
        if cut is not None:
            name = cut.strip()
            if 2 <= len(name) <= _MAX_CHAPTER_SUBTITLE_CHARS:
                return f"{num} · {name}"
            if len(name) > _MAX_CHAPTER_SUBTITLE_CHARS:
                return f"{num} · {name[:_MAX_CHAPTER_SUBTITLE_CHARS].strip()}"
        if len(rest) <= _MAX_CHAPTER_SUBTITLE_CHARS:
            return f"{num} · {rest}"
        # No safe boundary: length cap (lossy; use LLM refine for quality).
        import sys
        print(
            "[extract-pdf] Chapter title glued without structural boundary; "
            f"capping subtitle to {_MAX_CHAPTER_SUBTITLE_CHARS} chars — consider EXTRACT_LLM_REFINE_TITLES=1",
            file=sys.stderr,
        )
        return f"{num} · {rest[:_MAX_CHAPTER_SUBTITLE_CHARS].strip()}"

    if '·' in t:
        num, rest = t.split('·', 1)
        num, rest = num.strip(), rest.strip()
        if len(rest) <= _MAX_CHAPTER_SUBTITLE_CHARS and rest.count(',') < 2:
            return t
        return _clamp_rest(num, rest)

    mo = re.match(r'^(第(?:[一二三四五六七八九十百千零]|\d)+[章篇节部])(.+)$', t)
    if not mo:
        return title
    return _clamp_rest(mo.group(1), mo.group(2))


def normalize_chapter_display_title(title: str) -> str:
    """Format '第五章通过做自己来营销' / '第五章 通过做自己来营销' -> '第五章 · …'."""
    t = title.strip()
    if '·' in t:
        return t
    m = re.match(r'^(第(?:[一二三四五六七八九十百千零]|\d)+[章篇节部])\s*(.+)$', t)
    if m:
        rest = m.group(2).strip()
        if 1 <= len(rest) <= 50:
            return f"{m.group(1)} · {rest}"
    return t


def normalize_chapter_title(page_text: str, heading_match: str) -> str:
    """
    Expand '第五章' + next-line title into '第五章 · 通过做自己来营销'.
    """
    lines = [l.strip() for l in page_text.replace('\r', '').split('\n') if l.strip()]
    if not lines:
        return heading_match

    for i, line in enumerate(lines):
        if heading_match not in line and line != heading_match:
            continue
        # Exact combined line
        if CHAPTER_LINE_COMBINED.match(line):
            return normalize_chapter_display_title(line.strip())

        if CHAPTER_LINE_ONLY.match(line):
            j = i + 1
            while j < len(lines) and re.match(r'^\d{1,4}$', lines[j].strip()):
                j += 1
            if j < len(lines):
                nxt = lines[j].strip()
                if (
                    2 <= len(nxt) <= 45
                    and not re.search(r'[。！？…]$', nxt)
                    and '。' not in nxt[: min(8, len(nxt))]
                ):
                    return normalize_chapter_display_title(f"{line.strip()} · {nxt}")
            return normalize_chapter_display_title(line.strip())

        if line.startswith(heading_match[:2]):
            return normalize_chapter_display_title(line.strip())

    return normalize_chapter_display_title(heading_match)


def is_footnote_page(text: str) -> bool:
    """Return True if a page looks like footnotes/endnotes/bibliography (mostly URLs/citations)."""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    if not lines:
        return False
    url_lines = sum(1 for l in lines if re.search(r'https?://', l))
    ref_lines = sum(1 for l in lines if re.match(r'^\d+\.\s', l))
    total = len(lines)
    return (url_lines + ref_lines) / max(total, 1) > 0.4


def count_chapter_headings(text: str) -> int:
    """Count how many chapter heading matches exist in a text block."""
    total = 0
    for pattern in CHAPTER_PATTERNS:
        total += len(pattern.findall(text))
    return total


def is_toc_or_front_matter(text: str, prev_was_toc: bool = False) -> bool:
    """
    Return True if a page looks like a TOC, copyright, or other front matter.
    
    Args:
        text: Page text to analyze
        prev_was_toc: If True, this page follows a TOC page (enables stricter detection)
    """
    if count_chapter_headings(text) >= 3:
        return True
    # Inline TOC: many chapter markers in one block (merged lines / bad extract)
    inline_ch = len(re.findall(r'第(?:[一二三四五六七八九十百千零]|\d)+[章篇节部]', text))
    if inline_ch >= 6 and len(text) < 4500:
        return True
    for kw in SKIP_KEYWORDS:
        if kw in text and len(text) < 1500:
            return True
    
    # Enhanced detection for consecutive TOC pages
    # If previous page was TOC, check if this page continues the pattern
    if prev_was_toc:
        lines = [l.strip() for l in text.replace('\r', '').split('\n') if l.strip()]
        if not lines:
            return True  # Empty page after TOC is likely still front matter
        
        # Check if page consists of short lines with chapter markers
        # This catches目录 continuation pages that don't have enough markers on their own
        short_lines_with_chapters = 0
        for line in lines:
            if 15 <= len(line) <= 150:  #目录条目 typical length
                if re.search(r'第(?:[一二三四五六七八九十百千零]|\d)+[章篇节部]', line):
                    short_lines_with_chapters += 1
        
        # If page has 2+ lines that look like目录 entries, it's likely continued TOC
        if short_lines_with_chapters >= 2:
            return True
        
        # Also check if page has no substantial content (no long paragraphs)
        has_content = any(len(line) > 200 for line in lines)
        if not has_content and len(text) < 500:
            return True
    
    return False


def _is_numbered_chapter_title(title: str) -> bool:
    return bool(re.match(r'^第(?:[一二三四五六七八九十百千零]|\d)+[章篇节部]', title.strip()))


def split_pages_into_chapters(pages_text: list[str]) -> list[tuple[str, str]]:
    """
    Split pages into chapters based on chapter headings.
    Skips front matter (TOC, copyright, etc.) before detecting actual content.
    Returns list of (chapter_title, combined_text).
    """
    chapters: list[tuple[str, str]] = []
    current_title: str | None = None
    current_text_parts: list[str] = []
    content_started = False

    footnote_streak = 0
    prev_was_toc = False  # Track if previous page was TOC

    for page_text in pages_text:
        if not page_text:
            prev_was_toc = False
            continue

        if not content_started:
            if is_toc_or_front_matter(page_text, prev_was_toc):
                prev_was_toc = True
                continue
            if len(page_text) > 150 or find_chapter_heading(page_text):
                content_started = True
                prev_was_toc = False
            else:
                prev_was_toc = False
                continue

        if is_footnote_page(page_text):
            footnote_streak += 1
            if footnote_streak >= 2:
                break
            continue
        footnote_streak = 0

        heading = find_chapter_heading(page_text)

        if heading:
            # Normalize the new heading
            new_title = normalize_chapter_title(page_text, heading)
            
            # Only save previous chapter if it has content
            if current_title and current_text_parts:
                combined = '\n'.join(p for p in current_text_parts if p.strip())
                if len(combined.strip()) > 50:
                    chapters.append((current_title, combined))
            
            # Switch to new chapter
            current_title = new_title
            current_text_parts = []
            
            # Reset TOC tracking - we've found actual content
            prev_was_toc = False
            
            # Extract content after heading
            after_heading = _extract_content_after_heading(page_text, heading)
            if after_heading:
                current_text_parts = [after_heading]
        else:
            # No heading found - this is regular content
            prev_was_toc = False
            if current_title is None:
                if len(page_text) > 100:
                    current_title = "引言"
                    current_text_parts = [strip_standalone_page_number_lines(page_text)]
            else:
                current_text_parts.append(strip_standalone_page_number_lines(page_text))

    if current_title and current_text_parts:
        combined = '\n'.join(p for p in current_text_parts if p.strip())
        if len(combined.strip()) > 50:
            chapters.append((current_title, combined))

    return chapters


def _looks_like_back_matter(text: str) -> bool:
    """
    Check if text looks like back matter (copyright, bibliography, CIP data, etc.).
    
    Args:
        text: Page content to analyze
        
    Returns:
        True if text appears to be back matter
    """
    if not text:
        return False
    
    # Common back matter indicators
    back_matter_patterns = [
        r'图书在版编目',  # CIP data
        r'CIP 数据',
        r'ISBN',
        r'版权页',
        r'著作权',
        r'版权所有',
        r'图书目录',
        r'参考文献',
        r'参考书目',
        r'索引',
        r'附录',
        r'后记',
        r'译后记',
        r'出版说明',
    ]
    
    for pattern in back_matter_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    
    # Check for very structured short lines (typical of copyright pages)
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    if len(lines) >= 5:
        short_lines = sum(1 for l in lines if len(l) < 80)
        if short_lines / len(lines) > 0.7:
            # Most lines are short - likely structured back matter
            return True
    
    return False


def _extract_content_after_heading(page_text: str, heading: str) -> str:
    """
    Extract page content after removing chapter heading lines.
    
    Args:
        page_text: Full page text
        heading: Detected chapter heading
        
    Returns:
        Page content with heading lines removed
    """
    lines = page_text.split('\n')
    content_lines = []
    skip_subtitle = False
    
    for line in lines:
        line_stripped = line.strip()
        
        # Skip standalone page numbers
        if re.match(r'^\d{1,4}$', line_stripped):
            continue
        
        # Check if this is a chapter heading line
        is_heading = (
            line_stripped == heading or 
            (CHAPTER_LINE_ONLY.match(heading) and line_stripped.startswith(heading[:3])) or
            find_chapter_heading(line_stripped) is not None
        )
        
        if is_heading:
            # Skip this heading line and mark to skip the next subtitle line
            skip_subtitle = True
            continue
        
        # Skip the subtitle line that follows a chapter heading (e.g., "通过做自己来营销")
        if skip_subtitle:
            if line_stripped and 2 <= len(line_stripped) <= 50 and not re.search(r'[。！？…]', line_stripped):
                skip_subtitle = False
                continue
            skip_subtitle = False
        
        content_lines.append(line)
    
    after_heading = '\n'.join(content_lines).strip()
    after_heading = strip_standalone_page_number_lines(after_heading)
    return after_heading if after_heading else ''
