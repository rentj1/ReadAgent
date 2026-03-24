#!/usr/bin/env python3
"""
PDF Preprocessing Pipeline - Split PDF into chapters based on bookmarks.

This script preprocesses a PDF file by:
1. Extracting chapter information from PDF bookmarks/outline
2. Splitting the PDF into separate chapter files
3. Generating metadata for downstream processing

Usage:
  python3 scripts/preprocess-pdf.py \
    --pdf-path uploads/book.pdf \
    --book-id book123

Outputs:
  - uploads/book123/chapters/ directory with split PDF files
  - uploads/book123/chapters/metadata.json with chapter information
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def setup_argparse() -> argparse.Namespace:
    """Setup command line argument parser."""
    parser = argparse.ArgumentParser(
        description="Preprocess PDF: split into chapters based on bookmarks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage
  python3 scripts/preprocess-pdf.py --pdf-path uploads/book.pdf --book-id book123
  
  # With fallback to text analysis (when no bookmarks)
  python3 scripts/preprocess-pdf.py --pdf-path uploads/book.pdf --book-id book123 --force-fallback
  
  # Verbose output
  python3 scripts/preprocess-pdf.py --pdf-path uploads/book.pdf --book-id book123 -v
        """,
    )
    
    parser.add_argument(
        "--pdf-path",
        required=True,
        help="Path to the source PDF file",
    )
    parser.add_argument(
        "--book-id",
        required=True,
        help="Book ID (used for output directory naming)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory for chapter PDFs (default: uploads/{book_id}/chapters/)",
    )
    parser.add_argument(
        "--force-fallback",
        action="store_true",
        help="Force fallback to text-based chapter detection (ignore bookmarks)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without actually splitting",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output",
    )
    
    return parser.parse_args()


def print_info(message: str, verbose: bool = False, force: bool = False):
    """Print info message to stderr."""
    if verbose or force:
        print(f"[preprocess-pdf] {message}", file=sys.stderr)


def validate_pdf_path(pdf_path: str) -> Path:
    """Validate that PDF file exists."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    if not path.suffix.lower() == '.pdf':
        raise ValueError(f"Not a PDF file: {pdf_path}")
    return path


def get_output_dir(args: argparse.Namespace) -> Path:
    """Determine output directory."""
    if args.output_dir:
        return Path(args.output_dir)
    
    # Default: uploads/{book_id}/chapters/
    # Try to determine base directory from pdf_path
    pdf_path = Path(args.pdf_path)
    
    # If pdf is in uploads/, use that as base
    if 'uploads' in pdf_path.parts:
        uploads_idx = pdf_path.parts.index('uploads')
        base_dir = Path(*pdf_path.parts[:uploads_idx + 1])
    else:
        # Fallback to workspace uploads directory
        base_dir = Path("uploads")
    
    return base_dir / args.book_id / "chapters"


def create_chapter_metadata(
    book_id: str,
    pdf_path: str,
    chapters: list[dict[str, Any]],
    pdf_metadata: dict[str, Any],
    use_fallback: bool = False,
) -> dict[str, Any]:
    """Create metadata JSON structure."""
    return {
        "bookId": book_id,
        "sourcePdf": pdf_path,
        "chapterDetectionMethod": "fallback" if use_fallback else "bookmarks",
        "pdfMetadata": pdf_metadata,
        "chapters": chapters,
        "totalChapters": len(chapters),
    }


def save_metadata(metadata: dict[str, Any], output_dir: Path) -> Path:
    """Save metadata to JSON file."""
    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    return metadata_path


def main():
    """Main entry point."""
    args = setup_argparse()
    
    print_info(f"Processing: {args.pdf_path}", args.verbose, force=True)
    
    # Validate inputs
    try:
        pdf_path = validate_pdf_path(args.pdf_path)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Determine output directory
    output_dir = get_output_dir(args)
    print_info(f"Output directory: {output_dir}", args.verbose, force=True)
    
    # Import required modules
    try:
        # Add scripts directory to path if needed
        scripts_dir = Path(__file__).parent
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
        
        from pdf_extractor import (
            parse_pdf_outline,
            split_pdf_by_chapters,
            extract_pdf_metadata,
            detect_chapters_fallback,
            ChapterInfo,
        )
    except ImportError as e:
        print(f"Error importing modules: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Extract PDF metadata
    print_info("Extracting PDF metadata...", args.verbose)
    pdf_metadata = extract_pdf_metadata(str(pdf_path))
    
    # Parse bookmarks or use fallback
    chapters: list[ChapterInfo] = []
    use_fallback = args.force_fallback
    
    if not args.force_fallback:
        print_info("Parsing PDF bookmarks...", args.verbose)
        chapters = parse_pdf_outline(str(pdf_path))
        
        if not chapters:
            print_info(
                "No bookmarks found, falling back to text-based detection",
                args.verbose,
                force=True,
            )
            use_fallback = True
    
    if use_fallback:
        print_info("Detecting chapters from text...", args.verbose)
        chapters = detect_chapters_fallback(str(pdf_path))
    
    if not chapters:
        print("Error: No chapters detected", file=sys.stderr)
        print(
            "Consider using --force-fallback or manually specifying chapter boundaries",
            file=sys.stderr,
        )
        sys.exit(1)
    
    print_info(f"Detected {len(chapters)} chapters", args.verbose, force=True)
    
    if args.verbose:
        for i, ch in enumerate(chapters, 1):
            end_str = f"{ch.end_page + 1}" if ch.end_page is not None else "?"
            print(f"  {i:2d}. {ch.title} (pages {ch.start_page + 1}-{end_str})", file=sys.stderr)
    
    # Dry run - stop here
    if args.dry_run:
        print("\n[Dry run] Would create the following files:", file=sys.stderr)
        for i, ch in enumerate(chapters, 1):
            safe_title = ch.title.replace('/', '_').replace('\\', '_')[:50]
            filename = f"{i:02d}_{safe_title}.pdf"
            print(f"  {output_dir / filename}", file=sys.stderr)
        return
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Split PDF into chapters
    print_info(f"Splitting PDF into {len(chapters)} chapters...", args.verbose, force=True)
    chapter_results = split_pdf_by_chapters(
        str(pdf_path),
        str(output_dir),
        chapters,
        metadata=pdf_metadata if pdf_metadata else None,
    )
    
    if not chapter_results:
        print("Error: Failed to split PDF", file=sys.stderr)
        sys.exit(1)
    
    # Create and save metadata
    metadata = create_chapter_metadata(
        book_id=args.book_id,
        pdf_path=str(pdf_path),
        chapters=chapter_results,
        pdf_metadata=pdf_metadata,
        use_fallback=use_fallback,
    )
    
    metadata_path = save_metadata(metadata, output_dir)
    print_info(f"Metadata saved to: {metadata_path}", args.verbose, force=True)
    
    # Summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("PDF Preprocessing Complete!", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"Book ID:        {args.book_id}", file=sys.stderr)
    print(f"Source PDF:     {pdf_path}", file=sys.stderr)
    print(f"Chapters:       {len(chapter_results)}", file=sys.stderr)
    print(f"Output Dir:     {output_dir}", file=sys.stderr)
    print(f"Metadata:       {metadata_path}", file=sys.stderr)
    print("\nChapter files:", file=sys.stderr)
    for ch in chapter_results:
        print(f"  {ch['filename']:40s} ({ch['page_count']} pages)", file=sys.stderr)
    
    print("\n" + "=" * 60, file=sys.stderr)
    print("Next steps:", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"""
To process individual chapters with extract-pdf.py:

  # Process all chapters
  for pdf in {output_dir}/*.pdf; do
    book_id=$(basename "$pdf" .pdf)
    python3 scripts/extract-pdf.py \\
      --pdf-path "$pdf" \\
      --book-id "{args.book_id}-$(basename "$pdf" .pdf)" \\
      --cover-dir "{output_dir}/covers"
  done
  
  # Or process a specific chapter
  python3 scripts/extract-pdf.py \\
    --pdf-path "{output_dir}/{chapter_results[0]['filename'] if chapter_results else '01_*.pdf'}" \\
    --book-id "{args.book_id}-seg-01" \\
    --cover-dir "{output_dir}/covers"
    """, file=sys.stderr)


if __name__ == "__main__":
    main()
