"""
Constants for PDF extraction.
"""

from __future__ import annotations

import re


# Target characters per 5-minute segment (Chinese speech ~200-250 chars/min)
TARGET_CHARS_PER_SEGMENT = 1200
MIN_PARAGRAPH_CHARS = 20
# Final keep threshold (opening quotes can be < 20 chars)
MIN_PARAGRAPH_KEEP = 12
# Paragraphs longer than this are split further at sentence boundaries
MAX_PARAGRAPH_CHARS = 400

# Chinese chapter heading patterns (matches "第一章 xxx", "第 1 章 xxx", "第一节 xxx" etc.)
# Note: {0,25} limit on trailing title text prevents long sentences from matching
# Using Unicode escapes for reliability: 一 (4E00), 二 (4E8C), 三 (4E09), 四 (56DB), 五 (4E94), 
# 六 (516D), 七 (4E03), 八 (516B), 九 (4E5D), 十 (5341), 百 (767E), 千 (5343), 零 (96F6)
CHAPTER_PATTERNS = [
    re.compile(r'^第(?:[\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u96F6]|\d)+[章篇节部][^\n]{0,25}$', re.MULTILINE),
    re.compile(r'^Chapter\s+\d+[^\n]{0,25}$', re.MULTILINE | re.IGNORECASE),
]

# Single-line: only "第五章" / "第五章 "
CHAPTER_LINE_ONLY = re.compile(r'^第(?:[\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u96F6]|\d)+[章篇节部]\s*$')
# Combined chapter number + short title on one line (with or without space)
CHAPTER_LINE_COMBINED = re.compile(
    r'^第(?:[\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u96F6]|\d)+[章篇节部]\s*[^\n]{1,50}$'
)

# Pages to skip when looking for content (front matter pages)
SKIP_KEYWORDS = ['目录', '版权', 'copyright', '出版', '编目', 'ISBN', '致谢', '序言', '前言', '推荐序']

# Layout extraction: ignore top/bottom strips (headers/footers)
LAYOUT_MARGIN_Y_RATIO = 0.06
LINE_Y_TOLERANCE = 3.5
# Paragraph break when gap between lines exceeds this (PDF units, ~points)
MIN_PARA_GAP = 6.0

# Generic limits only (no book-specific phrases). When glue cannot be split structurally, enable LLM refine.
_MAX_CHAPTER_SUBTITLE_CHARS = 22
