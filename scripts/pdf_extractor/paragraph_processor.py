"""
Paragraph Processing - Split, join, and process paragraphs.
"""

from __future__ import annotations

import re

from .constants import (
    MIN_PARAGRAPH_CHARS,
    MIN_PARAGRAPH_KEEP,
    MAX_PARAGRAPH_CHARS,
)


def rejoin_wrapped_lines(text: str) -> str:
    """
    Join lines that are soft-wrapped (PDF line breaks within a paragraph).
    """
    SENTENCE_END = re.compile(r'[。！？…）」』"】\.\?!]$')
    ROLE_END = re.compile(r'(CEO|总裁 | 教授 | 作者 | 主席 | 创始人 | 董事 | 合伙人 | 执行官 | 主编 | 研究员 | 理事长 | 院长 | 博士)$')
    lines = text.split('\n')
    result: list[str] = []
    for line in lines:
        line_stripped = line.rstrip()
        if not line_stripped:
            result.append('')
            continue
        if result and result[-1] != '':
            prev = result[-1]
            if not SENTENCE_END.search(prev) and not ROLE_END.search(prev):
                result[-1] = prev + line_stripped
                continue
        result.append(line_stripped)
    return '\n'.join(result)


def split_paragraph_at_sentences(text: str, max_chars: int = MAX_PARAGRAPH_CHARS) -> list[str]:
    sentences = re.split(r'(?<=[。！？])', text)
    groups: list[str] = []
    buf = ''
    for s in sentences:
        if buf and len(buf) + len(s) > max_chars:
            groups.append(buf.strip())
            buf = s
        else:
            buf += s
    if buf.strip():
        groups.append(buf.strip())
    return [g for g in groups if g]


def split_into_paragraphs(text: str) -> list[str]:
    """Split text into meaningful paragraphs, handling PDF line-wrapping."""
    raw = re.split(r'\n{2,}', text)
    paras = []
    for block in raw:
        p = rejoin_wrapped_lines(block.strip())
        p = ' '.join(p.split('\n')).strip()
        if not p:
            continue
        if re.match(r'^\d{1,4}$', p):
            continue
        if len(p) < MIN_PARAGRAPH_CHARS:
            if paras:
                paras[-1] = paras[-1] + p
            else:
                paras.append(p)
            continue
        if len(p) > MAX_PARAGRAPH_CHARS:
            paras.extend(split_paragraph_at_sentences(p))
        else:
            paras.append(p)
    return [p for p in paras if len(p.strip()) >= MIN_PARAGRAPH_KEEP]


def _is_subsection_title_candidate(s: str) -> bool:
    t = s.strip()
    if not (4 <= len(t) <= 36):
        return False
    if '——' in t or '—' in t:
        return False
    if re.search(r'[。！？…]$', t):
        return False
    if re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]', t):
        return False
    if re.match(r'^[\d\s]+$', t):
        return False
    return True


def pull_trailing_short_subtitles(paragraphs: list[str]) -> list[str]:
    """
    Split '…开始。受众的力量' into two paragraphs so section heuristics can attach titles.
    """
    out: list[str] = []
    for p in paragraphs:
        m = re.match(r'^(.*[。！？])\s+([\u4e00-\u9fff·，、]{2,16})$', p.strip())
        if m and len(m.group(2)) <= 14 and len(m.group(1)) > 55 and '。' not in m.group(2):
            out.append(m.group(1).strip())
            out.append(m.group(2).strip())
        else:
            out.append(p)
    return out


def apply_section_subtitles(paragraphs: list[str]) -> list[tuple[str, str | None]]:
    """
    If a short line looks like a section heading, attach it as sectionTitle to the next paragraph.
    """
    out: list[tuple[str, str | None]] = []
    i = 0
    while i < len(paragraphs):
        p = paragraphs[i]
        if (
            i + 1 < len(paragraphs)
            and _is_subsection_title_candidate(p)
            and len(paragraphs[i + 1]) >= 35
        ):
            out.append((paragraphs[i + 1], p.strip()))
            i += 2
        else:
            out.append((p, None))
            i += 1
    return out
