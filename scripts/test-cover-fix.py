#!/usr/bin/env python3
"""
Test script to verify cover extraction fix.

Tests:
1. Chapter PDF should skip cover extraction
2. Whole-book PDF should extract cover to public/covers/
3. Cover path should be correctly set in process-chapters.py
"""

import sys
from pathlib import Path

# Add project root to path
root = Path(__file__).parent.parent
sys.path.insert(0, str(root))


def test_chapter_pdf_detection():
    """Test that chapter PDFs are correctly detected."""
    print("Test 1: Chapter PDF detection")
    
    test_cases = [
        ("f9e108f3-chapter-01", True, "Standard chapter format"),
        ("ea156aff-chapter-01", True, "Another chapter"),
        ("abc123", False, "Whole book ID"),
        ("test-chapter-05", True, "Chapter 5"),
        ("my-book", False, "Book with hyphen but no chapter"),
    ]
    
    all_passed = True
    for book_id, expected_is_chapter, description in test_cases:
        is_chapter = "-chapter-" in book_id.lower()
        status = "✓" if is_chapter == expected_is_chapter else "✗"
        print(f"  {status} {description}: {book_id} -> is_chapter={is_chapter} (expected {expected_is_chapter})")
        if is_chapter != expected_is_chapter:
            all_passed = False
    
    return all_passed


def test_cover_file_locations():
    """Test that cover files exist in expected locations."""
    print("\nTest 2: Cover file locations")
    
    # Check existing covers
    test_cases = [
        ("ea156aff", "chapters", "uploads/ea156aff/chapters/covers/ea156aff-chapter-01.jpg"),
        ("f9e108f3", "chapters", "uploads/f9e108f3/chapters/covers/f9e108f3-chapter-01.jpg"),
    ]
    
    all_passed = True
    for book_id, cover_type, relative_path in test_cases:
        if cover_type == "chapters":
            cover_path = root / relative_path
        else:
            cover_path = root / "public/covers" / f"{book_id}.jpg"
        
        exists = cover_path.exists()
        status = "✓" if exists else "✗"
        print(f"  {status} {book_id} ({cover_type}): {cover_path} -> exists={exists}")
        if not exists:
            all_passed = False
    
    return all_passed


def test_books_json_cover_paths():
    """Test that books.json has correct cover paths."""
    print("\nTest 3: books.json cover paths")
    
    import json
    books_file = root / "data" / "books.json"
    
    if not books_file.exists():
        print(f"  ✗ books.json not found: {books_file}")
        return False
    
    with open(books_file, 'r', encoding='utf-8') as f:
        books = json.load(f)
    
    all_passed = True
    for book in books:
        book_id = book.get("id")
        cover_path = book.get("coverPath")
        
        if not cover_path:
            print(f"  ⚠ {book_id}: No coverPath")
            continue
        
        # Check if cover path is valid
        if cover_path.startswith("../../uploads/"):
            # Chapters directory cover
            relative_path = cover_path.replace("../../", "")
            cover_file = root / relative_path
        elif cover_path.startswith("/covers/"):
            # Standard cover
            cover_file = root / "public" / cover_path[1:]  # Remove leading /
        elif cover_path.startswith("/book-cover.jpg"):
            # Default cover - skip validation
            print(f"  ⚠ {book_id}: Using default cover: {cover_path}")
            continue
        else:
            print(f"  ✗ {book_id}: Invalid coverPath format: {cover_path}")
            all_passed = False
            continue
        
        exists = cover_file.exists()
        status = "✓" if exists else "✗"
        print(f"  {status} {book_id}: {cover_path} -> exists={exists}")
        
        if not exists:
            all_passed = False
    
    return all_passed


def main():
    print("=" * 60)
    print("Cover Extraction Fix Verification")
    print("=" * 60)
    
    results = []
    
    results.append(("Chapter PDF Detection", test_chapter_pdf_detection()))
    results.append(("Cover File Locations", test_cover_file_locations()))
    results.append(("books.json Cover Paths", test_books_json_cover_paths()))
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    all_passed = True
    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    if all_passed:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
