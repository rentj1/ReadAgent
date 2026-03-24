"""
PDF Splitter - Split PDF into chapters based on bookmarks/outline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ChapterInfo:
    """Chapter information extracted from PDF outline or detected via rules."""
    title: str
    start_page: int  # 0-indexed
    end_page: int | None = None  # 0-indexed, None means until end of document
    level: int = 0  # Outline nesting level


# Patterns to filter out non-chapter bookmarks
SKIP_BOOKMARK_PATTERNS = [
    r'^目录$',
    r'^前言$',
    r'^序言$',
    r'^推荐序$',
    r'^致谢$',
    r'^注释$',
    r'^版权',
    r'^copyright',
    r'^ISBN',
    r'^出版',
    r'^编目$',
    r'^扉页$',
    r'^还有一件事$',
]


def should_skip_bookmark(title: str) -> bool:
    """Check if a bookmark should be skipped (front matter, back matter, etc.)."""
    for pattern in SKIP_BOOKMARK_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            return True
    return False


def is_chapter_bookmark(title: str) -> bool:
    """Check if a bookmark looks like a chapter title."""
    # Main chapters: 第一章，Chapter 1, etc.
    if re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]', title):
        return True
    if re.match(r'^Chapter\s+\d+', title, re.IGNORECASE):
        return True
    # Also accept top-level bookmarks that are not skipped
    return False


def parse_pdf_outline(pdf_path: str) -> list[ChapterInfo]:
    """
    Parse PDF outline/bookmarks and extract chapter information.
    
    Returns list of ChapterInfo objects sorted by start page.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        print("[pdf_splitter] pypdf not installed, cannot parse outline", file=__import__('sys').stderr)
        return []
    
    try:
        reader = PdfReader(pdf_path)
        total_pages = len(reader.pages)
    except Exception as e:
        print(f"[pdf_splitter] Failed to read PDF: {e}", file=__import__('sys').stderr)
        return []
    
    if not reader.outline:
        return []
    
    chapters: list[ChapterInfo] = []
    
    def process_outline(items: list[Any], level: int = 0, parent_start: int | None = None):
        """Recursively process outline items."""
        for item in items:
            if isinstance(item, list):
                # Nested outline items
                process_outline(item, level + 1, parent_start)
            else:
                try:
                    page_num = reader.get_destination_page_number(item)
                    title = item.title.strip()
                    
                    if page_num < 0 or page_num >= total_pages:
                        continue
                    
                    if should_skip_bookmark(title):
                        continue
                    
                    # Accept chapter bookmarks or top-level bookmarks
                    if is_chapter_bookmark(title) or (level == 0 and len(title) >= 2):
                        chapters.append(ChapterInfo(
                            title=title,
                            start_page=page_num,
                            level=level,
                        ))
                except Exception:
                    # Skip items that can't be processed
                    continue
    
    process_outline(reader.outline)
    
    # Sort by start page
    chapters.sort(key=lambda c: c.start_page)
    
    # Set end_page for each chapter
    for i, chapter in enumerate(chapters):
        if i + 1 < len(chapters):
            chapter.end_page = chapters[i + 1].start_page - 1
        else:
            chapter.end_page = total_pages - 1
    
    # Filter: only keep top-level chapters (level 0)
    # This avoids duplicate chapters from nested outline
    top_level_chapters = [c for c in chapters if c.level == 0]
    
    # If no top-level chapters, use all chapters but deduplicate by start page
    if not top_level_chapters:
        seen_pages = set()
        deduped = []
        for c in chapters:
            if c.start_page not in seen_pages:
                seen_pages.add(c.start_page)
                deduped.append(c)
        return deduped
    
    return top_level_chapters


def sanitize_filename(title: str) -> str:
    """Sanitize chapter title for use in filename."""
    # Remove or replace invalid characters
    s = re.sub(r'[<>:"/\\|？*]', '', title)
    # Replace spaces and punctuation with underscores
    s = re.sub(r'[\s_,.]+', '_', s)
    # Remove consecutive underscores
    s = re.sub(r'_+', '_', s)
    # Strip leading/trailing underscores
    s = s.strip('_')
    # Limit length
    if len(s) > 50:
        s = s[:50]
    return s


def split_pdf_by_chapters(
    pdf_path: str,
    output_dir: str,
    chapters: list[ChapterInfo],
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Split PDF into separate files for each chapter.
    
    Args:
        pdf_path: Path to source PDF
        output_dir: Directory to save chapter PDFs
        chapters: List of ChapterInfo objects
        metadata: Optional metadata to include in output files
    
    Returns:
        List of dicts with chapter file paths and info
    """
    import os
    from pathlib import Path
    
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        print("[pdf_splitter] pypdf not installed", file=__import__('sys').stderr)
        return []
    
    try:
        reader = PdfReader(pdf_path)
    except Exception as e:
        print(f"[pdf_splitter] Failed to read PDF: {e}", file=__import__('sys').stderr)
        return []
    
    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)
    
    results = []
    
    for i, chapter in enumerate(chapters, 1):
        if chapter.end_page is None:
            chapter.end_page = len(reader.pages) - 1
        
        # Validate page range
        if chapter.start_page < 0 or chapter.end_page >= len(reader.pages):
            print(
                f"[pdf_splitter] Skipping chapter {i}: invalid page range "
                f"({chapter.start_page}-{chapter.end_page})",
                file=__import__('sys').stderr,
            )
            continue
        
        if chapter.start_page > chapter.end_page:
            print(
                f"[pdf_splitter] Skipping chapter {i}: start > end "
                f"({chapter.start_page} > {chapter.end_page})",
                file=__import__('sys').stderr,
            )
            continue
        
        # Create chapter PDF
        writer = PdfWriter()
        
        # Add pages
        for page_num in range(chapter.start_page, chapter.end_page + 1):
            writer.add_page(reader.pages[page_num])
        
        # Add metadata if provided
        if metadata:
            writer.add_metadata(metadata)
        
        # Generate filename
        safe_title = sanitize_filename(chapter.title)
        filename = f"{i:02d}_{safe_title}.pdf"
        output_path = output_dir_path / filename
        
        # Write file
        try:
            with open(output_path, "wb") as f:
                writer.write(f)
            
            results.append({
                "chapter_num": i,
                "title": chapter.title,
                "filename": filename,
                "path": str(output_path),
                "start_page": chapter.start_page + 1,  # Convert to 1-indexed
                "end_page": chapter.end_page + 1,  # Convert to 1-indexed
                "page_count": chapter.end_page - chapter.start_page + 1,
            })
            
            print(
                f"[pdf_splitter] Created {filename} "
                f"(pages {chapter.start_page + 1}-{chapter.end_page + 1}, "
                f"{chapter.end_page - chapter.start_page + 1} pages)",
                file=__import__('sys').stderr,
            )
            
        except Exception as e:
            print(
                f"[pdf_splitter] Failed to write {filename}: {e}",
                file=__import__('sys').stderr,
            )
    
    return results


def extract_pdf_metadata(pdf_path: str) -> dict[str, Any]:
    """Extract metadata from PDF."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return {}
    
    try:
        reader = PdfReader(pdf_path)
        meta = reader.metadata or {}
        
        metadata = {}
        
        # Extract common metadata fields
        if meta.get('Title'):
            metadata['title'] = meta['Title']
        if meta.get('Author'):
            metadata['author'] = meta['Author']
        if meta.get('Subject'):
            metadata['subject'] = meta['Subject']
        if meta.get('Creator'):
            metadata['creator'] = meta['Creator']
        if meta.get('Producer'):
            metadata['producer'] = meta['Producer']
        
        return metadata
        
    except Exception:
        return {}


def detect_chapters_fallback(
    pdf_path: str,
    min_chapter_chars: int = 500,
) -> list[ChapterInfo]:
    """
    Fallback chapter detection when PDF has no bookmarks.
    Uses text analysis to find chapter headings.
    
    Args:
        pdf_path: Path to PDF file
        min_chapter_chars: Minimum characters to consider a chapter
    
    Returns:
        List of ChapterInfo objects
    """
    import sys
    
    try:
        from pdf_extractor.chapter_detector import (
            find_chapter_heading,
            is_toc_or_front_matter,
            is_footnote_page,
        )
        from pdf_extractor.text_extractor import extract_pages_text
    except ImportError:
        print(
            "[pdf_splitter] Cannot import chapter_detector, fallback disabled",
            file=sys.stderr,
        )
        return []
    
    pages_text = extract_pages_text(pdf_path)
    
    if not pages_text:
        return []
    
    chapters: list[ChapterInfo] = []
    current_chapter: ChapterInfo | None = None
    
    for page_idx, page_text in enumerate(pages_text):
        # Skip front matter
        if not chapters and is_toc_or_front_matter(page_text):
            continue
        
        # Skip footnote pages
        if is_footnote_page(page_text):
            continue
        
        # Check for chapter heading
        heading = find_chapter_heading(page_text)
        
        if heading:
            # Save previous chapter
            if current_chapter:
                current_chapter.end_page = page_idx - 1
                chapters.append(current_chapter)
            
            # Start new chapter
            current_chapter = ChapterInfo(
                title=heading.strip(),
                start_page=page_idx,
                level=0,
            )
        elif current_chapter is None:
            # First content without chapter heading - create intro chapter
            if len(page_text) > min_chapter_chars:
                current_chapter = ChapterInfo(
                    title="引言",
                    start_page=page_idx,
                    level=0,
                )
    
    # Don't forget the last chapter
    if current_chapter:
        current_chapter.end_page = len(pages_text) - 1
        chapters.append(current_chapter)
    
    return chapters
