"""
LLM Services - DashScope integration for chapter title refinement and content structuring.
"""

from __future__ import annotations

import json
import os
import re
import sys

from .constants import _MAX_CHAPTER_SUBTITLE_CHARS


def _is_numbered_chapter_title(title: str) -> bool:
    return bool(re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]', title.strip()))


def chapter_title_looks_suspicious(title: str) -> bool:
    """Heuristic: glued body or subsection text into the chapter display title (no book-specific wording)."""
    t = title.strip()
    if not _is_numbered_chapter_title(t):
        return False
    if '·' in t:
        rest = t.split('·', 1)[1].strip()
        if len(rest) > _MAX_CHAPTER_SUBTITLE_CHARS:
            return True
        if rest.count(',') >= 2:
            return True
        if '《' in rest or '》' in rest:
            return True
        if '。' in rest:
            return True
        if re.search(r'[a-zA-Z]{4,}', rest):
            return True
        return False
    # No middle dot: one glued line
    return len(t) > 22


def validate_llm_chapter_title(refined: str, original: str) -> bool:
    c = refined.strip()
    if len(c) < 4 or len(c) > 80:
        return False
    if not _is_numbered_chapter_title(c):
        return False
    mo = re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]', original.strip())
    mn = re.match(r'^第 [一二三四五六七八九十百千零\d]+[章篇节部]', c)
    if mo and mn and mo.group(0) != mn.group(0):
        return False
    return True


def try_llm_refine_chapter_title(snippet: str, candidate: str) -> str | None:
    """Use DashScope to return only a normalized chapter display title. Requires DASHSCOPE_API_KEY."""
    api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        import dashscope
        from dashscope import Generation
        dashscope.api_key = api_key

        prompt = f"""你是电子书编辑。下面是一段章节正文开头（可能含版式噪声），以及当前程序自动提取的「章节展示标题」候选。
请只输出**规范的章节标题**，格式必须是：第 X 章 · 简短章名
要求：
- 「·」后面只保留本书该章的真实章名（通常不超过 18 个汉字），不要包含正文、小节标题列举、英文长句、书名号堆砌。
- 不要改变第几章（章号必须与候选一致）。
- 若候选里「·」后混入了正文，请删到只剩真实章名。

候选标题：{candidate}

章节正文开头（截断）：
{snippet[:900]}

只输出一个 JSON 对象，不要有其他文字：{{"title": "第 X 章 · …"}}"""

        response = Generation.call(
            model="qwen-turbo",
            messages=[{"role": "user", "content": prompt}],
            result_format="message",
        )
        content = response.output.choices[0].message.content.strip()
        match = re.search(r'\{[\s\S]+\}', content)
        if not match:
            return None
        data = json.loads(match.group())
        t = data.get("title")
        if not t or not isinstance(t, str):
            return None
        return t.strip()
    except Exception as e:
        print(f"[extract-pdf] LLM chapter title refine failed: {e}", file=sys.stderr)
        return None


def refine_chapter_titles_with_llm(
    chapters: list[tuple[str, str]],
    mode: str,
) -> list[tuple[str, str]]:
    """
    mode: 'off' | 'heuristic' | 'all'
    heuristic: only 第 X 章 titles that look suspicious; all: every 第 X 章 title.
    """
    if mode == "off":
        return chapters
    if not os.environ.get("DASHSCOPE_API_KEY", "").strip():
        print("[extract-pdf] refine chapter titles: DASHSCOPE_API_KEY unset, skipping", file=sys.stderr)
        return chapters

    out: list[tuple[str, str]] = []
    for ch_title, ch_text in chapters:
        need = False
        if _is_numbered_chapter_title(ch_title):
            if mode == "all":
                need = True
            else:
                need = chapter_title_looks_suspicious(ch_title)
        if not need:
            out.append((ch_title, ch_text))
            continue
        snippet = ch_text[:900]
        refined = try_llm_refine_chapter_title(snippet, ch_title)
        if refined and validate_llm_chapter_title(refined, ch_title):
            print(f"[extract-pdf] Refined chapter title: {ch_title[:50]}… -> {refined[:60]}…", file=sys.stderr)
            out.append((refined, ch_text))
        else:
            out.append((ch_title, ch_text))
    return out


def resolve_refine_titles_mode(args) -> str:
    """CLI overrides env. Returns 'off' | 'heuristic' | 'all'."""
    if getattr(args, "refine_all_chapter_titles_llm", False):
        return "all"
    if getattr(args, "refine_titles_llm", False):
        return "heuristic"
    env = os.environ.get("EXTRACT_LLM_REFINE_TITLES", "").strip().lower()
    if env in ("all", "always"):
        return "all"
    if env in ("1", "true", "yes", "on", "heuristic"):
        return "heuristic"
    return "off"


def try_llm_structuring(text: str, book_id: str, title: str) -> tuple[list[dict], str] | None:
    """Optionally use DashScope qwen to better structure content. Requires DASHSCOPE_API_KEY."""
    api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        import dashscope
        from dashscope import Generation
        dashscope.api_key = api_key

        prompt = f"""请将以下书籍章节内容结构化为若干视频片段，每段约 5 分钟（约 1200 个汉字）。
要求：
1. 保持段落完整性，不要拆分句子
2. 每段识别出章节标题
3. 每段包含若干自然段落
4. 输出 JSON，格式如下（不要有其他内容）：
{{
  "title": "章节标题",
  "segments": [
    {{
      "title": "片段标题",
      "paragraphs": ["段落 1 文字", "段落 2 文字", ...]
    }}
  ]
}}

章节内容：
{text[:8000]}"""

        response = Generation.call(
            model="qwen-turbo",
            messages=[{"role": "user", "content": prompt}],
            result_format="message",
        )
        content = response.output.choices[0].message.content.strip()
        match = re.search(r'\{[\s\S]+\}', content)
        if not match:
            return None
        data = json.loads(match.group())
        title_from_llm = data.get("title", title)
        result = []
        for i, seg in enumerate(data.get("segments", []), 1):
            seg_id = f"{book_id}-seg-{i:02d}"
            seg_title = seg.get("title", f"{title_from_llm} Part {i}")
            paras = []
            for j, text_para in enumerate(seg.get("paragraphs", []), 1):
                paras.append({"id": f"{seg_id}-p{j:02d}", "text": text_para.strip()})
            result.append({
                "id": seg_id,
                "title": seg_title,
                "paragraphs": paras,
                "ttsStatus": "pending",
                "renderStatus": "pending",
                "renderProgress": 0,
            })
        return result, title_from_llm
    except Exception as e:
        print(f"[extract-pdf] LLM structuring failed: {e}", file=sys.stderr)
        return None
