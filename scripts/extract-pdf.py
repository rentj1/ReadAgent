#!/usr/bin/env python3
"""
Extract text from a PDF and structure it into video segments.

Usage:
  python3.11 scripts/extract-pdf.py \
    --pdf-path uploads/abc123.pdf \
    --book-id abc123 \
    --cover-dir public/covers

  Optional hybrid LLM (chapter titles only, after rules):
    --refine-titles-llm | --refine-all-chapter-titles-llm
    or env EXTRACT_LLM_REFINE_TITLES=1 | true | all
    requires DASHSCOPE_API_KEY

Outputs JSON to stdout:
  {
    "title": "书名",
    "segments": [
      {
        "id": "abc123-seg-01",
        "title": "第一章 · ...",
        "paragraphs": [{"id": "abc123-seg-01-p01", "text": "..."}],
        "ttsStatus": "pending",
        "renderStatus": "pending",
        "renderProgress": 0
      }
    ]
  }
"""

from __future__ import annotations

import argparse
import json
import sys

from pdf_extractor import (
    extract_metadata_title,
    extract_pages_text,
    extract_cover,
    split_pages_into_chapters,
    refine_chapter_titles_with_llm,
    resolve_refine_titles_mode,
    clamp_glued_chapter_title,
    chapter_to_segments,
    try_llm_structuring,
)


def infer_title_from_text(pages_text: list[str]) -> str:
    """Infer title from page content (title page is usually page 4-6 in Chinese ebooks)."""
    import re
    for page in pages_text[3:8]:
        lines = [l.strip() for l in page.split('\n') if l.strip()]
        for line in lines:
            if 4 <= len(line) <= 40 and not re.search(r'ISBN|版权|copyright|©|\d{4}年', line, re.IGNORECASE):
                return line
    for page in pages_text:
        for line in page.split('\n'):
            line = line.strip()
            if len(line) > 2:
                return line[:60]
    return '未命名'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-path", required=True)
    parser.add_argument("--book-id", required=True)
    parser.add_argument("--cover-dir", default="public/covers")
    parser.add_argument("--use-llm", action="store_true", help="Use DashScope qwen to structure chapters")
    parser.add_argument(
        "--refine-titles-llm",
        action="store_true",
        help="After rule-based chapters, use LLM to fix suspicious 第 X 章 titles (needs DASHSCOPE_API_KEY). "
        "Or set EXTRACT_LLM_REFINE_TITLES=1.",
    )
    parser.add_argument(
        "--refine-all-chapter-titles-llm",
        action="store_true",
        help="LLM-normalize every 第 X 章 title (more calls). Or set EXTRACT_LLM_REFINE_TITLES=all.",
    )
    args = parser.parse_args()

    print(f"[extract-pdf] Processing: {args.pdf_path}", file=sys.stderr)

    # Extract cover only for whole-book PDFs, not chapter PDFs
    # Chapter PDFs have book_id like "xxx-chapter-01"
    is_chapter_pdf = "-chapter-" in args.book_id.lower()
    
    if is_chapter_pdf:
        # Skip cover extraction for chapter PDFs - the whole book PDF will handle it
        cover_path = None
        print("[extract-pdf] Skipping cover extraction for chapter PDF", file=sys.stderr)
    else:
        # Extract cover for whole-book PDF to public/covers/
        cover_path = extract_cover(args.pdf_path, args.cover_dir, args.book_id)

    # Extract text from all pages
    pages_text = extract_pages_text(args.pdf_path)
    print(f"[extract-pdf] Extracted {len(pages_text)} pages", file=sys.stderr)

    # Get title
    title = extract_metadata_title(args.pdf_path)
    if title:
        print(f"[extract-pdf] Title from metadata: {title}", file=sys.stderr)
    else:
        title = infer_title_from_text(pages_text)
        print(f"[extract-pdf] Title inferred: {title}", file=sys.stderr)

    segments = None

    # Try LLM structuring if requested
    if args.use_llm:
        full_text = '\n\n'.join(pages_text)
        llm_result = try_llm_structuring(full_text, args.book_id, title)
        if llm_result:
            segments, title = llm_result
            print(f"[extract-pdf] LLM structured {len(segments)} segments", file=sys.stderr)

    # Rule-based chapter detection and segmentation
    if segments is None:
        chapters = split_pages_into_chapters(pages_text)
        print(f"[extract-pdf] Detected {len(chapters)} chapters", file=sys.stderr)
        
        # LLM title refinement
        refine_mode = resolve_refine_titles_mode(args)
        if refine_mode != "off":
            print(f"[extract-pdf] Chapter title LLM refine mode: {refine_mode}", file=sys.stderr)
        chapters = refine_chapter_titles_with_llm(chapters, refine_mode)
        chapters = [(clamp_glued_chapter_title(t), tx) for t, tx in chapters]

        if chapters:
            all_segments: list[dict] = []
            for chapter_title, chapter_text in chapters:
                segs = chapter_to_segments(chapter_title, chapter_text, args.book_id, len(all_segments))
                all_segments.extend(segs)
            segments = all_segments
        else:
            # Flat fallback: no chapters detected
            from pdf_extractor import split_into_paragraphs, pull_trailing_short_subtitles, apply_section_subtitles
            full_text = '\n\n'.join(pages_text)
            raw_paras = split_into_paragraphs(full_text)
            raw_paras = pull_trailing_short_subtitles(raw_paras)
            paragraphs = apply_section_subtitles(raw_paras)
            print(f"[extract-pdf] Flat fallback: {len(paragraphs)} paragraphs", file=sys.stderr)
            
            from pdf_extractor.constants import TARGET_CHARS_PER_SEGMENT
            groups: list[list[tuple[str, str | None]]] = []
            current = []
            current_chars = 0
            for text, st in paragraphs:
                current.append((text, st))
                current_chars += len(text)
                if current_chars >= TARGET_CHARS_PER_SEGMENT:
                    groups.append(current)
                    current = []
                    current_chars = 0
            if current:
                groups.append(current)
            total_flat = len(groups)
            segments = []
            for i, group in enumerate(groups, 1):
                seg_id = f"{args.book_id}-seg-{i:02d}"
                from pdf_extractor.segment_builder import build_segment
                segments.append(build_segment(seg_id, title, group, i, total_flat))

    # Output JSON (matching books.json format)
    import datetime
    result = {
        "title": title,
        "id": args.book_id,
        "coverPath": cover_path if cover_path else None,
        "pdfPath": args.pdf_path,
        "status": "parsed",
        "segments": segments,
        "createdAt": datetime.datetime.now(datetime.UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    }
    
    # Remove None values
    result = {k: v for k, v in result.items() if v is not None}
    
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
