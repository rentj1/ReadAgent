#!/usr/bin/env python3
"""
Test module structure without external dependencies.
"""

import ast
import sys
from pathlib import Path


def analyze_file(filepath: Path) -> dict:
    """Analyze a Python file's structure."""
    with open(filepath, 'r', encoding='utf-8') as f:
        source = f.read()
    
    tree = ast.parse(source)
    
    functions = []
    classes = []
    imports = []
    constants = []
    
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            functions.append(node.name)
        elif isinstance(node, ast.ClassDef):
            classes.append(node.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append(f"from {node.module}")
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id.isupper():
                    constants.append(target.id)
    
    return {
        'functions': functions,
        'classes': classes,
        'imports': imports,
        'constants': constants,
        'lines': len(source.split('\n')),
    }


def test_all_modules():
    """Test all module files."""
    base_path = Path(__file__).parent
    
    modules = {
        'constants.py': {
            'expected_functions': [],
            'expected_constants': ['TARGET_CHARS_PER_SEGMENT', 'MIN_PARAGRAPH_CHARS', 'CHAPTER_PATTERNS'],
        },
        'text_extractor.py': {
            'expected_functions': ['extract_metadata_title', 'extract_pages_text', 'cluster_words_into_lines'],
        },
        'cover_extractor.py': {
            'expected_functions': ['extract_cover', 'render_page_to_image', 'page_is_blank'],
        },
        'chapter_detector.py': {
            'expected_functions': ['split_pages_into_chapters', 'find_chapter_heading', 'normalize_chapter_title'],
        },
        'paragraph_processor.py': {
            'expected_functions': ['split_into_paragraphs', 'rejoin_wrapped_lines', 'apply_section_subtitles'],
        },
        'segment_builder.py': {
            'expected_functions': ['chapter_to_segments', 'build_segment'],
        },
        'llm_services.py': {
            'expected_functions': ['refine_chapter_titles_with_llm', 'try_llm_structuring', 'validate_llm_chapter_title'],
        },
    }
    
    all_passed = True
    
    for module_name, expectations in modules.items():
        filepath = base_path / module_name
        print(f"\nAnalyzing {module_name}...")
        
        analysis = analyze_file(filepath)
        
        # Check expected functions
        if 'expected_functions' in expectations:
            for func in expectations['expected_functions']:
                if func in analysis['functions']:
                    print(f"  ✓ Function: {func}")
                else:
                    print(f"  ✗ Missing function: {func}")
                    all_passed = False
        
        # Check expected constants
        if 'expected_constants' in expectations:
            for const in expectations['expected_constants']:
                if const in analysis['constants']:
                    print(f"  ✓ Constant: {const}")
                else:
                    print(f"  ✗ Missing constant: {const}")
                    all_passed = False
        
        # Print file stats
        print(f"  Lines: {analysis['lines']}")
        print(f"  Functions: {len(analysis['functions'])}")
    
    return all_passed


def test_main_file():
    """Test the main extract-pdf.py file."""
    print("\n\nAnalyzing extract-pdf.py...")
    
    filepath = Path(__file__).parent.parent / 'extract-pdf.py'
    analysis = analyze_file(filepath)
    
    print(f"  Lines: {analysis['lines']}")
    print(f"  Functions: {len(analysis['functions'])}")
    print(f"  Imports: {len(analysis['imports'])}")
    
    # Check for main function
    if 'main' in analysis['functions']:
        print("  ✓ Has main() function")
        return True
    else:
        print("  ✗ Missing main() function")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("PDF Extractor Module Structure Analysis")
    print("=" * 60)
    
    modules_ok = test_all_modules()
    main_ok = test_main_file()
    
    print("\n" + "=" * 60)
    if modules_ok and main_ok:
        print("✅ All structure checks passed!")
        print("\nModule breakdown:")
        print("  - constants.py: 全局常量")
        print("  - text_extractor.py: PDF 文本提取")
        print("  - cover_extractor.py: 封面提取")
        print("  - chapter_detector.py: 章节检测")
        print("  - paragraph_processor.py: 段落处理")
        print("  - segment_builder.py: 片段构建")
        print("  - llm_services.py: LLM 集成")
        print("  - extract-pdf.py: 主入口 (~170 行)")
    else:
        print("❌ Some structure checks failed!")
        sys.exit(1)
