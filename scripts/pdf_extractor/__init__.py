"""
PDF Extractor - Modular PDF text extraction and segmentation.
"""

from .constants import (
    TARGET_CHARS_PER_SEGMENT,
    MIN_PARAGRAPH_CHARS,
    MIN_PARAGRAPH_KEEP,
    MAX_PARAGRAPH_CHARS,
    CHAPTER_PATTERNS,
    CHAPTER_LINE_ONLY,
    CHAPTER_LINE_COMBINED,
    SKIP_KEYWORDS,
    LAYOUT_MARGIN_Y_RATIO,
    LINE_Y_TOLERANCE,
    MIN_PARA_GAP,
)

from .text_extractor import (
    extract_metadata_title,
    extract_pages_text,
    infer_title_from_text,
)

from .cover_extractor import (
    extract_cover,
)

from .chapter_detector import (
    find_chapter_heading,
    split_pages_into_chapters,
    normalize_chapter_display_title,
    clamp_glued_chapter_title,
)

from .paragraph_processor import (
    split_into_paragraphs,
    pull_trailing_short_subtitles,
    apply_section_subtitles,
)

from .segment_builder import (
    build_segment,
    chapter_to_segments,
)

from .llm_services import (
    refine_chapter_titles_with_llm,
    resolve_refine_titles_mode,
    try_llm_structuring,
)

from .pdf_splitter import (
    ChapterInfo,
    parse_pdf_outline,
    split_pdf_by_chapters,
    extract_pdf_metadata,
    detect_chapters_fallback,
    sanitize_filename,
)

__all__ = [
    # Constants
    'TARGET_CHARS_PER_SEGMENT',
    'MIN_PARAGRAPH_CHARS',
    'MIN_PARAGRAPH_KEEP',
    'MAX_PARAGRAPH_CHARS',
    'CHAPTER_PATTERNS',
    'CHAPTER_LINE_ONLY',
    'CHAPTER_LINE_COMBINED',
    'SKIP_KEYWORDS',
    'LAYOUT_MARGIN_Y_RATIO',
    'LINE_Y_TOLERANCE',
    'MIN_PARA_GAP',
    # Text extraction
    'extract_metadata_title',
    'extract_pages_text',
    'infer_title_from_text',
    # Cover extraction
    'extract_cover',
    # Chapter detection
    'find_chapter_heading',
    'split_pages_into_chapters',
    'normalize_chapter_display_title',
    'clamp_glued_chapter_title',
    # Paragraph processing
    'split_into_paragraphs',
    'pull_trailing_short_subtitles',
    'apply_section_subtitles',
    # Segment building
    'build_segment',
    'chapter_to_segments',
    # LLM services
    'refine_chapter_titles_with_llm',
    'resolve_refine_titles_mode',
    'try_llm_structuring',
    # PDF splitting
    'ChapterInfo',
    'parse_pdf_outline',
    'split_pdf_by_chapters',
    'extract_pdf_metadata',
    'detect_chapters_fallback',
    'sanitize_filename',
]
