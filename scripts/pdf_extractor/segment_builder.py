"""
Segment Builder - Build video segment data structures.
"""

from __future__ import annotations

import re

from .constants import TARGET_CHARS_PER_SEGMENT
from .paragraph_processor import (
    split_into_paragraphs,
    pull_trailing_short_subtitles,
    apply_section_subtitles,
)


def normalize_quote_attribution(text: str) -> str:
    """Insert newline before em-dash attribution (matches curated book JSON)."""
    t = text.strip()
    t = re.sub(r'([。！？])\s*——', r'\1\n——', t)
    return t


def build_segment(
    seg_id: str,
    title: str,
    paragraphs: list[tuple[str, str | None]],
    seg_num: int,
    total_segs: int,
) -> dict:
    seg_title = title if total_segs == 1 else f"{title}（{seg_num}/{total_segs}）"
    para_list = []
    for i, (text, section_title) in enumerate(paragraphs, 1):
        body = normalize_quote_attribution(text)
        item: dict = {
            "id": f"{seg_id}-p{i:02d}",
            "text": body.strip(),
        }
        if section_title:
            item["sectionTitle"] = section_title
        para_list.append(item)
    return {
        "id": seg_id,
        "title": seg_title,
        "paragraphs": para_list,
        "ttsStatus": "pending",
        "renderStatus": "pending",
        "renderProgress": 0,
    }


def find_sentence_boundary_index(paragraphs: list[tuple[str, str | None]], min_chars: int = int(TARGET_CHARS_PER_SEGMENT * 0.8)) -> int | None:
    """
    Find the best paragraph index to split at a sentence boundary.
    
    Looks for the last paragraph that ends with a sentence-ending punctuation
    after we've accumulated enough characters.
    
    Returns:
        Index of the paragraph to split at, or None if no good boundary found.
    """
    # Sentence-ending punctuation for Chinese and English
    SENTENCE_ENDINGS = frozenset(['。', '！', '？', '!', '?', '…', '”', '」', '』'])
    
    # Minimum characters before we start looking for a boundary
    if len(paragraphs) < 2:
        return None
    
    # Calculate cumulative characters
    cumulative = 0
    best_idx = None
    
    for i, (text, _) in enumerate(paragraphs):
        cumulative += len(text)
        
        # Only consider splitting after we have enough content
        if cumulative >= min_chars:
            # Check if this paragraph ends with a sentence boundary
            text_stripped = text.strip()
            if text_stripped and text_stripped[-1] in SENTENCE_ENDINGS:
                best_idx = i
    
    return best_idx


def chapter_to_segments(chapter_title: str, chapter_text: str, book_id: str, seg_offset: int) -> list[dict]:
    """Split a chapter's text into ~5-minute segments, respecting sentence boundaries."""
    raw_paras = split_into_paragraphs(chapter_text)
    if not raw_paras:
        return []

    raw_paras = pull_trailing_short_subtitles(raw_paras)
    paragraphs = apply_section_subtitles(raw_paras)

    groups: list[list[tuple[str, str | None]]] = []
    current: list[tuple[str, str | None]] = []
    current_chars = 0

    for text, st in paragraphs:
        current.append((text, st))
        current_chars += len(text)
        
        # Check if we should split at a sentence boundary
        if current_chars >= TARGET_CHARS_PER_SEGMENT:
            # Try to find a good sentence boundary
            split_idx = find_sentence_boundary_index(current)
            
            if split_idx is not None and split_idx < len(current) - 1:
                # Split at the sentence boundary
                groups.append(current[:split_idx + 1])
                # Keep remaining paragraphs for next segment
                current = current[split_idx + 1:]
                current_chars = sum(len(t) for t, _ in current)
            else:
                # No good boundary found, split at current position
                groups.append(current)
                current = []
                current_chars = 0

    if current:
        groups.append(current)

    total = len(groups)
    segments = []
    for i, group in enumerate(groups, 1):
        global_num = seg_offset + i
        seg_id = f"{book_id}-seg-{global_num:02d}"
        segments.append(build_segment(seg_id, chapter_title, group, i, total))

    return segments
