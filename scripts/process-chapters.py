#!/usr/bin/env python3
"""
Process all chapters from a preprocessed PDF and merge results into books.json format.

This script:
1. Reads metadata.json from a preprocessed chapters directory
2. Runs extract-pdf.py on each chapter PDF
3. Merges all results into a single books.json format output

Usage:
  python3 scripts/process-chapters.py --chapters-dir uploads/book123/chapters/
  
Or process and merge in one command after preprocessing:
  python3 scripts/preprocess-pdf.py --pdf-path book.pdf --book-id book123
  python3 scripts/process-chapters.py --chapters-dir uploads/book123/chapters/
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def setup_argparse() -> argparse.Namespace:
    """Setup command line argument parser."""
    parser = argparse.ArgumentParser(
        description="Process all chapters and merge into books.json format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process chapters from a preprocessed directory
  python3 scripts/process-chapters.py --chapters-dir uploads/book123/chapters/
  
  # With custom output path
  python3 scripts/process-chapters.py --chapters-dir uploads/book123/chapters/ --output output.json
  
  # Verbose output
  python3 scripts/process-chapters.py --chapters-dir uploads/book123/chapters/ -v
        """,
    )
    
    parser.add_argument(
        "--chapters-dir",
        required=True,
        help="Directory containing chapter PDFs and metadata.json",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON file path (default: stdout)",
    )
    parser.add_argument(
        "--cover-dir",
        default=None,
        help="Directory for cover images (default: {chapters_dir}/covers)",
    )
    parser.add_argument(
        "--book-id",
        default=None,
        help="Override book ID from metadata (optional)",
    )
    parser.add_argument(
        "--skip-chapters",
        nargs="+",
        type=int,
        help="Chapter numbers to skip (1-indexed)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without actually processing",
    )
    
    return parser.parse_args()


def print_info(message: str, verbose: bool = False, force: bool = False):
    """Print info message to stderr."""
    if verbose or force:
        print(f"[process-chapters] {message}", file=sys.stderr)


def load_metadata(chapters_dir: Path) -> dict[str, Any]:
    """Load metadata.json from chapters directory."""
    metadata_path = chapters_dir / "metadata.json"
    if not metadata_path.exists():
        raise FileNotFoundError(f"metadata.json not found in {chapters_dir}")
    
    with open(metadata_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_chapter_pdfs(chapters_dir: Path, metadata: dict[str, Any]) -> list[dict[str, Any]]:
    """Get list of chapter PDF files from metadata."""
    chapters = metadata.get("chapters", [])
    if not chapters:
        raise ValueError("No chapters found in metadata")
    
    # Validate that PDF files exist
    for chapter in chapters:
        pdf_path = chapters_dir / chapter["filename"]
        if not pdf_path.exists():
            raise FileNotFoundError(f"Chapter PDF not found: {pdf_path}")
    
    return chapters


def run_extract_pdf(
    pdf_path: Path,
    book_id: str,
    cover_dir: Path,
    verbose: bool = False,
) -> dict[str, Any] | None:
    """
    Run extract-pdf.py on a single chapter PDF.
    
    Returns the JSON result or None if failed.
    """
    cmd = [
        sys.executable,
        "scripts/extract-pdf.py",
        "--pdf-path", str(pdf_path),
        "--book-id", book_id,
        "--cover-dir", str(cover_dir),
    ]
    
    print_info(f"Processing: {pdf_path.name}", verbose=True)
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            cwd=Path(__file__).parent.parent,
        )
        
        if result.returncode != 0:
            print(f"Error processing {pdf_path.name}: {result.stderr}", file=sys.stderr)
            return None
        
        # Parse JSON output from stdout
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON output for {pdf_path.name}: {e}", file=sys.stderr)
            print(f"Stdout: {result.stdout[:500]}", file=sys.stderr)
            return None
            
    except Exception as e:
        print(f"Error running extract-pdf.py for {pdf_path.name}: {e}", file=sys.stderr)
        return None


def is_uuid_or_hash(filename: str) -> bool:
    """
    Check if filename looks like a UUID, hash, or other auto-generated identifier.
    
    Patterns:
    - 8+ hex characters: f9e108f3
    - Standard UUID: f9e108f3-1234-5678-9abc-def012345678
    - SHA256 hash: 64 hex characters
    """
    import re
    
    # Remove extension if present
    if filename.lower().endswith('.pdf'):
        filename = filename[:-4]
    
    # Pattern 1: 8+ consecutive hex characters
    if re.match(r'^[a-f0-9]{8,}$', filename, re.IGNORECASE):
        return True
    
    # Pattern 2: Standard UUID format
    if re.match(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', filename, re.IGNORECASE):
        return True
    
    # Pattern 3: SHA256 hash (64 hex chars)
    if re.match(r'^[0-9a-f]{64}$', filename, re.IGNORECASE):
        return True
    
    return False


def should_skip_chapter_title_inference(chapters: list[dict]) -> bool:
    """
    Check if all chapters follow a standard numbering pattern like "第 X 章 XXX".
    
    If so, we should NOT infer book title from chapter titles because:
    - Chapter title ≠ Book title
    - All chapters being numbered suggests these are internal divisions
    
    Returns True if we should skip chapter-based title inference.
    """
    if not chapters:
        return False
    
    # Check first 5 chapters (or all if less than 5)
    chapters_to_check = chapters[:min(5, len(chapters))]
    
    # Simple heuristic: check if title starts with "第" and contains "章" or "篇"
    # This avoids regex issues with Unicode character classes
    match_count = 0
    for ch in chapters_to_check:
        title = ch.get("title", "")
        if title.startswith("第") and ("章" in title or "篇" in title or "节" in title or "部" in title):
            # Additional check: should have a number after "第"
            # Extract characters between "第" and "章/篇/节/部"
            for marker in ["章", "篇", "节", "部"]:
                if marker in title:
                    prefix = title.split(marker)[0]  # e.g., "第一"
                    if len(prefix) > 1:  # Has something after "第"
                        middle = prefix[1:]  # e.g., "一"
                        # Check if middle part looks like a number
                        if any(c in middle for c in "一二三四五六七八九十百千零 0123456789"):
                            match_count += 1
                            break
    
    # If at least 3 chapters match the pattern, skip chapter-based inference
    return match_count >= 3


def infer_title_from_pdf_content(metadata: dict[str, Any]) -> str | None:
    """
    Infer book title from PDF content (title page, cover page).
    
    This is more reliable than using chapter titles because:
    - Title pages usually contain the actual book name
    - Located in the first 10 pages of most PDFs
    
    Returns the extracted title or None if extraction fails.
    """
    source_pdf = metadata.get("sourcePdf", "")
    if not source_pdf:
        return None
    
    try:
        # Import the title inference function
        from pdf_extractor import infer_title_from_text, extract_pages_text
        
        # Extract text from first 10 pages (where title page usually is)
        pages_text = extract_pages_text(source_pdf)
        
        if not pages_text:
            return None
        
        # Use the existing title inference logic
        title = infer_title_from_text(pages_text)
        
        if title and title != '未命名' and len(title) >= 2:
            print_info(f"Extracted title from PDF content: {title}", verbose=True)
            return title
            
    except Exception as e:
        print_info(f"Failed to extract title from PDF content: {e}", verbose=True)
    
    return None


def infer_title_from_metadata(metadata: dict[str, Any]) -> str | None:
    """
    Infer book title from metadata (source PDF path).
    
    Priority:
    1. Extract from source PDF filename (only if it's not a UUID/hash)
    
    Note: We intentionally do NOT use chapter titles as book titles because:
    - Chapter title ≠ Book title (e.g., "第一章 极简主义创业者" ≠ 《极简主义创业者》)
    - Use infer_title_from_pdf_content() instead for actual book titles
    """
    # Skip chapter title inference if all chapters follow "第 X 章 XXX" pattern
    chapters = metadata.get("chapters", [])
    if chapters and should_skip_chapter_title_inference(chapters):
        print_info("Skipping chapter-based title inference (all chapters are numbered)", verbose=True)
        return None
    
    # Try to extract from source PDF filename
    source_pdf = metadata.get("sourcePdf", "")
    if source_pdf:
        # Extract filename from path
        filename = source_pdf.split('/')[-1]
        
        # Skip if filename looks like UUID or hash
        if is_uuid_or_hash(filename):
            print_info(f"Skipping UUID/hash-like filename: {filename}", verbose=True)
            return None
        
        # Remove .pdf extension
        if filename.lower().endswith('.pdf'):
            filename = filename[:-4]
        
        # Remove common suffixes
        for suffix in [' (z-library.sk, 1lib.sk, z-lib.sk)', ' (z-library)', ' (1lib)']:
            filename = filename.replace(suffix, '')
        
        # Clean up
        filename = filename.strip()
        if 2 <= len(filename) <= 100:
            return filename
    
    return None


def infer_title_from_chapters(chapter_results: list[dict[str, Any] | None]) -> str | None:
    """
    Infer book title from chapter content.
    
    Strategy:
    1. Look at first chapter's first segment title
    2. Remove chapter number prefix (e.g., "第一章 · ")
    3. Return as book title
    """
    for result in chapter_results:
        if result is None:
            continue
        
        segments = result.get("segments", [])
        if not segments:
            continue
        
        # Get first segment title
        first_seg_title = segments[0].get("title", "")
        
        if not first_seg_title:
            continue
        
        # Skip if it looks like "引言" or intro
        if first_seg_title.startswith('引言') or first_seg_title.startswith('前言'):
            continue
        
        # Remove chapter number pattern: "第一章 · xxx" -> "xxx"
        import re
        match = re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]\s*[·\s]+(.+)$', first_seg_title)
        if match:
            return match.group(1).strip()
        
        # If no chapter number, return as is (might be intro or title page)
        if len(first_seg_title) > 2 and len(first_seg_title) < 50:
            return first_seg_title.split('（')[0].strip()
    
    return None


def merge_chapter_results(
    metadata: dict[str, Any],
    chapter_results: list[dict[str, Any] | None],
    book_id: str | None = None,
    chapters_dir: Path | None = None,
) -> dict[str, Any]:
    """
    Merge individual chapter results into books.json format.
    
    The output format matches the expected books.json structure:
    {
      "title": "书名",
      "id": "book-id",
      "coverPath": "/covers/book-id.jpg",
      "pdfPath": "original.pdf",
      "status": "parsed",
      "segments": [...],
      "createdAt": "2026-03-20T16:37:40.996Z"
    }
    """
    # Determine book ID
    final_book_id = book_id or metadata.get("bookId", "unknown")
    
    # Collect all segments from all chapters
    all_segments = []
    successful_chapters = 0
    
    for i, (chapter_meta, result) in enumerate(zip(metadata["chapters"], chapter_results), 1):
        if result is None:
            print_info(f"Chapter {i} ({chapter_meta['title']}) failed to process", force=True)
            continue
        
        successful_chapters += 1
        
        # Add segments from this chapter
        segments = result.get("segments", [])
        for seg in segments:
            # Preserve the segment structure
            all_segments.append(seg)
        
        print_info(
            f"Chapter {i}: {len(segments)} segments "
            f"({chapter_meta['start_page']}-{chapter_meta['end_page']})",
            verbose=True,
        )
    
    if not all_segments:
        raise ValueError("No segments extracted from any chapter")
    
    # Determine title with improved fallback strategy:
    # Priority 1: PDF metadata (most reliable)
    # Priority 2: Extract from PDF content (title page/cover page)
    # Priority 3: From PDF filename (if not UUID/hash)
    # Priority 4: Use book_id as placeholder (needs user confirmation)
    #
    # Note: We intentionally skip chapter titles because:
    # - Chapter title ≠ Book title
    # - If all chapters are "第 X 章 XXX" format, we cannot infer book title from them
    
    title = metadata.get("pdfMetadata", {}).get("title")
    
    if not title:
        # Try to extract from PDF content (title page)
        title = infer_title_from_pdf_content(metadata)
    
    if not title:
        # Try to extract from PDF filename (skip UUID/hash)
        title = infer_title_from_metadata(metadata)
    
    if not title:
        # Last resort: use book_id as placeholder
        # This indicates the user should manually set the title
        title = f"Book {final_book_id}"
        print_info(f"⚠️  Could not extract book title. Using placeholder: {title}", force=True)
        print_info("Please manually set the book title in the UI.", force=True)
    
    # Build final result
    result = {
        "title": title,
        "id": final_book_id,
        "pdfPath": metadata.get("sourcePdf", ""),
        "status": "parsed",
        "segments": all_segments,
        "createdAt": f"{__import__('datetime').datetime.now().isoformat(timespec='milliseconds')}Z",
    }
    
    # Add cover path - priority order:
    # 1. Check if whole-book cover exists in public/covers/{book_id}.jpg
    # 2. Fallback: use first chapter's cover from chapters/covers/ directory
    book_cover_file = chapters_dir.parent / "public" / "covers" / f"{book_id}.jpg"
    
    if book_cover_file.exists():
        # Use whole-book cover (preferred)
        result["coverPath"] = f"/covers/{book_id}.jpg"
        print_info(f"✓ Using whole-book cover: {book_cover_file}", True)
    elif chapter_results and chapter_results[0]:
        # Fallback: use first chapter's cover
        # The chapter cover was saved to chapters_dir/covers/{book_id}-chapter-01.jpg
        # But extract-pdf.py returned /covers/{book_id}-chapter-01.jpg
        # We need to use the actual file location
        first_chapter_cover = chapters_dir / "covers" / f"{book_id}-chapter-01.jpg"
        if first_chapter_cover.exists():
            # Use relative path from public directory
            result["coverPath"] = f"../../uploads/{book_id}/chapters/covers/{book_id}-chapter-01.jpg"
            print_info(f"✓ Using chapter cover fallback: {first_chapter_cover}", True)
        else:
            print_info(f"⚠️  No cover found for book: {book_id}", force=True)
    
    return result


def main():
    """Main entry point."""
    args = setup_argparse()
    
    chapters_dir = Path(args.chapters_dir)
    if not chapters_dir.exists():
        print(f"Error: Chapters directory not found: {chapters_dir}", file=sys.stderr)
        sys.exit(1)
    
    print_info(f"Processing chapters from: {chapters_dir}", args.verbose, force=True)
    
    # Load metadata
    try:
        metadata = load_metadata(chapters_dir)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading metadata: {e}", file=sys.stderr)
        sys.exit(1)
    
    print_info(f"Found {len(metadata.get('chapters', []))} chapters", args.verbose, force=True)
    
    # Get chapter PDFs
    try:
        chapters = get_chapter_pdfs(chapters_dir, metadata)
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Determine cover directory
    cover_dir = Path(args.cover_dir) if args.cover_dir else chapters_dir / "covers"
    
    # Determine book ID
    book_id = args.book_id or metadata.get("bookId")
    if not book_id:
        print("Error: No book ID found in metadata and --book-id not specified", file=sys.stderr)
        sys.exit(1)
    
    # Filter out skipped chapters
    skip_chapters = set(args.skip_chapters or [])
    chapters_to_process = [
        ch for i, ch in enumerate(chapters, 1) if i not in skip_chapters
    ]
    
    if args.dry_run:
        print(f"\n[Dry run] Would process {len(chapters_to_process)} chapters:", file=sys.stderr)
        for i, ch in enumerate(chapters_to_process, 1):
            print(f"  {i}. {ch['filename']} ({ch['page_count']} pages)", file=sys.stderr)
        print(f"\nOutput would be: {args.output or 'stdout'}", file=sys.stderr)
        return
    
    # Extract whole-book cover BEFORE processing chapters
    # This is necessary because chapter PDFs skip cover extraction (book_id contains -chapter-)
    source_pdf = metadata.get("sourcePdf")
    if source_pdf and Path(source_pdf).exists():
        # Use project root directory, not chapters_dir.parent
        # chapters_dir.parent points to uploads/{book_id}/, but we want project root
        project_root = Path(__file__).parent.parent
        public_cover_dir = project_root / "public" / "covers"
        public_cover_dir.mkdir(parents=True, exist_ok=True)
        
        # Extract whole-book cover
        from pdf_extractor import extract_cover
        whole_book_cover = extract_cover(source_pdf, str(public_cover_dir), book_id)
        if whole_book_cover:
            print_info(f"✓ Extracted whole-book cover to: {public_cover_dir / f'{book_id}.jpg'}", force=True)
        else:
            print_info(f"⚠️  Failed to extract whole-book cover, will try chapter cover fallback", force=True)
    else:
        print_info(f"⚠️  Source PDF not found: {source_pdf}", force=True)
    
    # Process each chapter
    print_info(f"Processing {len(chapters_to_process)} chapters...", args.verbose, force=True)
    
    chapter_results = []
    for i, chapter in enumerate(chapters, 1):
        if i in skip_chapters:
            print_info(f"Skipping chapter {i}: {chapter['title']}", args.verbose)
            chapter_results.append(None)
            continue
        
        pdf_path = chapters_dir / chapter["filename"]
        
        # Create unique book ID for this chapter
        chapter_book_id = f"{book_id}-chapter-{i:02d}"
        
        result = run_extract_pdf(pdf_path, chapter_book_id, cover_dir, args.verbose)
        chapter_results.append(result)
    
    # Merge results
    print_info("Merging chapter results...", args.verbose, force=True)
    
    try:
        merged_result = merge_chapter_results(metadata, chapter_results, book_id, chapters_dir)
    except ValueError as e:
        print(f"Error merging results: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Output result
    output_json = json.dumps(merged_result, ensure_ascii=False, indent=2)
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(output_json)
        print_info(f"Output saved to: {output_path}", args.verbose, force=True)
    else:
        print(output_json)
    
    # Summary
    successful = sum(1 for r in chapter_results if r is not None)
    total_segments = len(merged_result.get("segments", []))
    
    print("\n" + "=" * 60, file=sys.stderr)
    print("Chapter Processing Complete!", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"Book ID:        {book_id}", file=sys.stderr)
    print(f"Chapters:       {successful}/{len(chapters)} processed", file=sys.stderr)
    print(f"Total Segments: {total_segments}", file=sys.stderr)
    print(f"Output:         {args.output or 'stdout'}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)


if __name__ == "__main__":
    main()
