# PDF 预处理 Pipeline

基于 PDF 书签自动切割章节，输出符合 books.json 格式的数据。

## 概述

这个 Pipeline 将 PDF 书籍处理流程分为三个阶段:

```
原始 PDF → preprocess-pdf.py → 分章节 PDF → extract-pdf.py → process-chapters.py → books.json
```

## 安装依赖

```bash
# 创建虚拟环境 (如果还没有)
cd /Users/rkx/agent/video-agent/book-reader
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install pypdf pdfplumber pymupdf pillow
```

## 使用流程

### 步骤 1: 预处理 - 分割 PDF 为章节

```bash
python3 scripts/preprocess-pdf.py \
  --pdf-path uploads/book.pdf \
  --book-id book123
```

**输出:**
- `uploads/book123/chapters/` - 包含分割后的章节 PDF 文件
- `uploads/book123/chapters/metadata.json` - 章节元数据

**主要参数:**
- `--pdf-path`: 原始 PDF 文件路径 (必需)
- `--book-id`: 书籍 ID (必需)
- `--output-dir`: 输出目录 (可选，默认：`uploads/{book-id}/chapters/`)
- `--force-fallback`: 强制使用文本分析检测章节 (忽略书签)
- `--dry-run`: 预览将执行的操作
- `-v`: 详细输出

**示例:**
```bash
# 基本用法
python3 scripts/preprocess-pdf.py \
  --pdf-path "uploads/小而美.pdf" \
  --book-id "xiaomei"

# 预览模式
python3 scripts/preprocess-pdf.py \
  --pdf-path "uploads/book.pdf" \
  --book-id "book123" \
  --dry-run -v

# 无书签时使用文本分析
python3 scripts/preprocess-pdf.py \
  --pdf-path "uploads/book.pdf" \
  --book-id "book123" \
  --force-fallback
```

### 步骤 2: 处理所有章节并合并

```bash
python3 scripts/process-chapters.py \
  --chapters-dir uploads/book123/chapters/ \
  --book-id book123 \
  --output data/books/book123.json
```

**输出:**
- JSON 格式输出到 stdout 或指定文件
- 格式与 `books.json` 完全兼容

**主要参数:**
- `--chapters-dir`: 章节目录 (必需，包含 metadata.json)
- `--book-id`: 书籍 ID (可选，默认从 metadata.json 读取)
- `--output`: 输出文件路径 (可选，默认：stdout)
- `--skip-chapters`: 跳过某些章节 (1-indexed)
- `--dry-run`: 预览模式
- `-v`: 详细输出

**示例:**
```bash
# 处理所有章节
python3 scripts/process-chapters.py \
  --chapters-dir uploads/xiaomei/chapters/ \
  --book-id xiaomei \
  --output data/books/xiaomei.json

# 只处理前 3 章
python3 scripts/process-chapters.py \
  --chapters-dir uploads/book123/chapters/ \
  --skip-chapters 4 5 6 7 8 9

# 预览模式
python3 scripts/process-chapters.py \
  --chapters-dir uploads/book123/chapters/ \
  --dry-run -v
```

### 一步完成 (可选)

如果需要快速测试，可以直接对单个章节调用 `extract-pdf.py`:

```bash
python3 scripts/extract-pdf.py \
  --pdf-path uploads/book123/chapters/01_第一章.pdf \
  --book-id book123-seg-01 \
  --cover-dir uploads/book123/chapters/covers
```

## 输出格式

最终输出的 JSON 格式与 `books.json` 完全兼容:

```json
{
  "title": "书名",
  "id": "book-id",
  "coverPath": "/covers/book-id.jpg",
  "pdfPath": "原始 PDF 路径",
  "status": "parsed",
  "segments": [
    {
      "id": "book-id-seg-01",
      "title": "第一章 · 标题 (1/5)",
      "paragraphs": [
        {
          "id": "book-id-seg-01-p01",
          "text": "段落内容",
          "sectionTitle": "小节标题 (可选)"
        }
      ],
      "ttsStatus": "pending",
      "renderStatus": "pending",
      "renderProgress": 0
    }
  ],
  "createdAt": "2026-03-22T10:00:00.000Z"
}
```

## 工作原理

### 1. PDF 书签解析 (`pdf_splitter.py`)

- 使用 `pypdf` 的 `outline` 属性提取 PDF 书签
- 递归解析嵌套书签结构
- 过滤非章节项 (目录、前言、致谢等)
- 提取章节标题和起始页码

### 2. 降级策略

如果 PDF 没有书签，自动降级到文本分析:
- 使用 `chapter_detector.py` 的规则检测章节标题
- 识别 `第 X 章`、`Chapter X` 等模式
- 跳过目录、版权页等前言内容

### 3. PDF 分割

- 使用 `pypdf` 的 `PdfWriter` 按页码范围切割
- 保留原 PDF 元数据
- 生成标准化文件名：`{序号}_{章节名}.pdf`

### 4. 章节处理

对每个章节调用现有的 `extract-pdf.py`:
- 提取文本 (使用 `pdfplumber` 布局感知提取)
- 检测段落和小节标题
- 按 ~1200 字符分割为 segments
- 提取封面图片

### 5. 合并结果

- 收集所有章节的 segments
- 保持原有顺序
- 生成统一的 books.json 格式

## 文件结构

```
scripts/
├── preprocess-pdf.py          # 预处理主脚本
├── process-chapters.py        # 章节处理合并脚本
└── pdf_extractor/
    ├── pdf_splitter.py        # PDF 分割模块
    ├── chapter_detector.py    # 章节检测
    ├── text_extractor.py      # 文本提取
    ├── paragraph_processor.py # 段落处理
    ├── segment_builder.py     # Segment 构建
    └── ...

uploads/
└── {book-id}/
    └── chapters/
        ├── metadata.json      # 章节元数据
        ├── 01_第一章.pdf      # 分割后的章节
        ├── 02_第二章.pdf
        └── covers/            # 封面图片
```

## 高级用法

### 处理大型 PDF

对于大型 PDF，建议分批处理:

```bash
# 先预处理
python3 scripts/preprocess-pdf.py \
  --pdf-path uploads/large-book.pdf \
  --book-id large-book

# 分批处理章节
python3 scripts/process-chapters.py \
  --chapters-dir uploads/large-book/chapters/ \
  --skip-chapters 6 7 8 9 10 \
  --output data/books/large-book-part1.json

python3 scripts/process-chapters.py \
  --chapters-dir uploads/large-book/chapters/ \
  --skip-chapters 1 2 3 4 5 \
  --output data/books/large-book-part2.json
```

### 自定义章节检测

如果自动检测不准确，可以手动编辑 `metadata.json`:

```json
{
  "chapters": [
    {
      "chapter_num": 1,
      "title": "自定义章节名",
      "filename": "01_自定义.pdf",
      "start_page": 10,
      "end_page": 50,
      "page_count": 41
    }
  ]
}
```

### 集成到现有工作流

Pipeline 设计为与现有 `extract-pdf.py` 完全兼容，可以无缝集成:

```bash
# 传统方式 (直接处理整个 PDF)
python3 scripts/extract-pdf.py \
  --pdf-path uploads/book.pdf \
  --book-id book123

# 新方式 (先分割再处理)
python3 scripts/preprocess-pdf.py \
  --pdf-path uploads/book.pdf \
  --book-id book123

python3 scripts/process-chapters.py \
  --chapters-dir uploads/book123/chapters/ \
  --book-id book123 \
  --output data/books/book123.json
```

## 故障排除

### 问题：PDF 没有书签

**解决方案 1:** 使用 `--force-fallback` 参数

```bash
python3 scripts/preprocess-pdf.py \
  --pdf-path uploads/book.pdf \
  --book-id book123 \
  --force-fallback
```

**解决方案 2:** 手动创建 metadata.json

### 问题：章节标题乱码

这是 PDF 编码问题，不影响实际处理。分割后的 PDF 可以正常被 `extract-pdf.py` 处理。

### 问题：处理速度慢

- PDF 分割是一次性的，后续可以重复使用分割后的文件
- 使用 `--skip-chapters` 跳过已处理的章节
- 并行处理不同章节 (需要自定义脚本)

## 技术细节

### 依赖库

- **pypdf**: PDF 读取和书签解析
- **pdfplumber**: 布局感知的文本提取
- **pymupdf**: 封面图片提取
- **pillow**: 图片处理

### 章节检测规则

优先使用 PDF 书签，降级策略使用以下规则:

1. 匹配 `第 X 章`、`Chapter X` 等模式
2. 跳过包含"目录"、"版权"、"ISBN"等关键词的页面
3. 检测脚注页面 (大量 URL/引用)
4. 基于文本长度和内容判断章节边界

### Segment 分割

- 目标长度：~1200 字符/segment (约 5 分钟语音)
- 在段落边界处分割
- 保留小节标题信息

## 更新日志

### v1.0.0 (2026-03-22)

- 初始版本
- 基于书签的 PDF 分割
- 文本分析降级策略
- 完整的 books.json 格式输出
