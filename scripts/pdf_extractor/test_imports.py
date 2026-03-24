#!/usr/bin/env python3
"""
Test module imports and structure.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_constants_import():
    """Test constants module import."""
    from pdf_extractor.constants import (
        TARGET_CHARS_PER_SEGMENT,
        MIN_PARAGRAPH_CHARS,
        MIN_PARAGRAPH_KEEP,
        MAX_PARAGRAPH_CHARS,
        CHAPTER_PATTERNS,
        SKIP_KEYWORDS,
    )
    
    assert TARGET_CHARS_PER_SEGMENT == 1200
    assert MIN_PARAGRAPH_CHARS == 20
    assert MIN_PARAGRAPH_KEEP == 12
    assert MAX_PARAGRAPH_CHARS == 400
    assert len(CHAPTER_PATTERNS) == 2
    assert '目录' in SKIP_KEYWORDS
    print("✓ constants module OK")


def test_module_structure():
    """Test that all modules exist and have correct structure."""
    import pdf_extractor
    
    # Check all expected exports
    expected_exports = [
        'TARGET_CHARS_PER_SEGMENT',
        'extract_metadata_title',
        'extract_pages_text',
        'extract_cover',
        'split_pages_into_chapters',
        'chapter_to_segments',
        'refine_chapter_titles_with_llm',
    ]
    
    for export in expected_exports:
        assert hasattr(pdf_extractor, export), f"Missing export: {export}"
    
    print("✓ module structure OK")


def test_function_signatures():
    """Test that key functions have correct signatures."""
    import inspect
    from pdf_extractor.text_extractor import extract_pages_text
    from pdf_extractor.chapter_detector import split_pages_into_chapters
    from pdf_extractor.segment_builder import chapter_to_segments
    
    # extract_pages_text
    sig = inspect.signature(extract_pages_text)
    assert 'pdf_path' in sig.parameters
    
    # split_pages_into_chapters
    sig = inspect.signature(split_pages_into_chapters)
    assert 'pages_text' in sig.parameters
    
    # chapter_to_segments
    sig = inspect.signature(chapter_to_segments)
    params = list(sig.parameters.keys())
    assert 'chapter_title' in params
    assert 'chapter_text' in params
    assert 'book_id' in params
    
    print("✓ function signatures OK")


def test_constants_values():
    """Test that constants have reasonable values."""
    from pdf_extractor.constants import (
        TARGET_CHARS_PER_SEGMENT,
        MIN_PARAGRAPH_CHARS,
        MIN_PARAGRAPH_KEEP,
        MAX_PARAGRAPH_CHARS,
    )
    
    # Logical relationships
    assert MIN_PARAGRAPH_KEEP < MIN_PARAGRAPH_CHARS
    assert MIN_PARAGRAPH_CHARS < MAX_PARAGRAPH_CHARS
    assert TARGET_CHARS_PER_SEGMENT > MAX_PARAGRAPH_CHARS
    
    print("✓ constants values OK")


if __name__ == "__main__":
    print("Running PDF Extractor module tests...\n")
    
    try:
        test_constants_import()
        test_module_structure()
        test_function_signatures()
        test_constants_values()
        
        print("\n✅ All tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
