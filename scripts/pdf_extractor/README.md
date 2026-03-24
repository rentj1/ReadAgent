# PDF Extractor Module

模块化 PDF 文本提取和视频片段生成库。

## 文件结构

```
pdf_extractor/
├── __init__.py              # 公共接口导出
├── constants.py             # 全局常量定义 (42 行)
├── text_extractor.py        # PDF 文本提取 (209 行)
├── cover_extractor.py       # 封面图像提取 (88 行)
├── chapter_detector.py      # 章节检测与标题处理 (268 行)
├── paragraph_processor.py   # 段落处理 (125 行)
├── segment_builder.py       # 视频片段构建 (83 行)
└── llm_services.py          # LLM 集成服务 (204 行)
```

## 模块职责

### constants.py
定义全局常量：
- `TARGET_CHARS_PER_SEGMENT`: 每片段目标字符数 (1200)
- `MIN_PARAGRAPH_CHARS`: 最小段落长度
- `CHAPTER_PATTERNS`: 章节标题正则表达式
- `SKIP_KEYWORDS`: 前言/目录跳过关键词

### text_extractor.py
PDF 文本提取功能：
- `extract_metadata_title(pdf_path)`: 提取 PDF 元数据标题
- `extract_pages_text(pdf_path)`: 提取所有页面文本（布局感知）
- `extract_page_paragraphs_layout(page)`: 基于几何布局的段落检测
- `repeated_noise_lines(lines_per_page)`: 识别跨页重复噪声行

### cover_extractor.py
封面图像提取：
- `extract_cover(pdf_path, cover_dir, book_id)`: 提取并保存封面
- `render_page_to_image(pdf_path, page_num)`: 渲染 PDF 页面为图像
- `page_is_blank(img)`: 检测空白页

### chapter_detector.py
章节检测与标题规范化：
- `split_pages_into_chapters(pages_text)`: 将页面分割为章节
- `find_chapter_heading(text)`: 查找章节标题
- `normalize_chapter_title(page_text, heading)`: 规范化章节标题
- `clamp_glued_chapter_title(title)`: 截断粘连的章节标题
- `is_toc_or_front_matter(text)`: 检测目录/前言
- `is_footnote_page(text)`: 检测脚注页

### paragraph_processor.py
段落处理：
- `split_into_paragraphs(text)`: 分割文本为段落
- `rejoin_wrapped_lines(text)`: 重新连接 PDF 软换行
- `pull_trailing_short_subtitles(paragraphs)`: 分离尾部短副标题
- `apply_section_subtitles(paragraphs)`: 应用子标题到段落

### segment_builder.py
视频片段构建：
- `chapter_to_segments(chapter_title, chapter_text, book_id, seg_offset)`: 章节转片段
- `build_segment(seg_id, title, paragraphs, seg_num, total_segs)`: 构建单个片段
- `normalize_quote_attribution(text)`: 规范化引用归属

### llm_services.py
LLM 集成服务（DashScope）：
- `refine_chapter_titles_with_llm(chapters, mode)`: 优化章节标题
- `try_llm_refine_chapter_title(snippet, candidate)`: 调用 LLM 优化单个标题
- `try_llm_structuring(text, book_id, title)`: LLM 结构化内容
- `resolve_refine_titles_mode(args)`: 解析优化模式

## 使用示例

### 作为库使用

```python
from pdf_extractor import (
    extract_pages_text,
    split_pages_into_chapters,
    chapter_to_segments,
    extract_cover,
)

# 提取文本
pages = extract_pages_text("book.pdf")

# 检测章节
chapters = split_pages_into_chapters(pages)

# 转换为视频片段
segments = []
for title, text in chapters:
    segs = chapter_to_segments(title, text, "book123", len(segments))
    segments.extend(segs)

# 提取封面
cover_path = extract_cover("book.pdf", "public/covers", "book123")
```

### 命令行使用

```bash
python3 scripts/extract-pdf.py \
  --pdf-path uploads/book.pdf \
  --book-id book123 \
  --cover-dir public/covers \
  --refine-titles-llm
```

## 依赖

- `pdfplumber`: PDF 文本提取
- `pymupdf` (fitz): PDF 渲染和封面提取
- `pillow` (PIL): 图像处理
- `dashscope`: LLM 集成（可选）

## 优势

- **单一职责**: 每个模块 <300 行，职责明确
- **可测试性**: 函数职责单一，便于单元测试
- **可维护性**: 模块独立，修改影响范围小
- **可复用性**: 模块可被其他脚本复用
