# preprocess-pdf.py 集成文档

## 概述

已成功将 `preprocess-pdf.py` 集成到 `server-lite/routes/pdf.ts` 的 `parseBookAsync` 函数中。现在 PDF 处理流程默认使用预处理 Pipeline，通过 PDF 书签自动分章，提高章节检测准确性。

## 集成内容

### 1. 修改的文件

#### `server-lite/routes/pdf.ts`
- 重构 `parseBookAsync()` 函数，根据环境变量路由到不同处理方式
- 新增 `parseBookWithPreprocess()` 函数：
  - 步骤 1：调用 `preprocess-pdf.py` 分割 PDF 为章节
  - 步骤 2：调用 `process-chapters.py` 处理所有章节并合并结果
- 新增 `parseBookDirect()` 函数：原有的直接调用 `extract-pdf.py` 方式（作为降级策略）

#### `server-lite/types.ts`
- 扩展 `BookStatus` 类型，新增两个中间状态：
  - `"preprocessing"` - 正在分割 PDF
  - `"processing_chapters"` - 正在处理章节

### 2. 新增功能

#### 环境变量控制

**USE_PREPROCESS** (默认：启用)
```bash
# 启用预处理 Pipeline（默认）
USE_PREPROCESS=1 npm start

# 禁用预处理，使用旧的直接提取方式
USE_PREPROCESS=0 npm start
```

**SKIP_CHAPTERS** (可选)
```bash
# 跳过后面的章节，只处理前 3 章
SKIP_CHAPTERS=4,5,6,7,8,9 npm start

# 只处理第 4 章及以后
SKIP_CHAPTERS=1,2,3 npm start
```

#### 降级策略
如果 `preprocess-pdf.py` 执行失败（例如 PDF 没有书签且文本分析失败），系统会自动降级到 `extract-pdf.py` 直接处理整个 PDF。

### 3. 工作流程

```
用户上传 PDF
    ↓
parseBookAsync()
    ↓
检查 USE_PREPROCESS
    ↓
是 ──→ parseBookWithPreprocess() ──┬─→ preprocess-pdf.py
                                   │    (分割 PDF 为章节)
                                   │    ↓
                                   ├─→ process-chapters.py
                                   │    (处理每个章节并合并)
                                   │    ↓
                                   └─→ 更新 store，状态："parsed"
                                       
否 ──→ parseBookDirect()
         ↓
     extract-pdf.py
         ↓
     更新 store，状态："parsed"
```

### 4. 输出目录结构

使用预处理 Pipeline 时，会生成以下目录结构：

```
uploads/{bookId}/
└── chapters/
    ├── metadata.json          # 章节元数据
    ├── 01_第一章.pdf          # 分割后的章节 PDF
    ├── 02_第二章.pdf
    ├── ...
    └── covers/                # 封面图片
        └── {bookId}.jpg
```

## 使用方法

### 基本用法（推荐）

直接启动服务器并上传 PDF，默认使用预处理 Pipeline：

```bash
npm start
```

然后通过前端界面或 API 上传 PDF：

```bash
curl -X POST -F "file=@book.pdf" http://localhost:3000/api/pdf/upload
```

### 分批处理大型 PDF

对于章节很多的大型 PDF，可以分批处理：

```bash
# 第一批：处理前 3 章
SKIP_CHAPTERS=4,5,6,7,8,9 npm start
# 上传 PDF 后等待处理完成

# 第二批：处理剩余章节
# 需要重新上传 PDF 或使用不同的 bookId
SKIP_CHAPTERS=1,2,3 npm start
```

### 使用旧方式处理

如果遇到兼容性问题，可以禁用预处理：

```bash
USE_PREPROCESS=0 npm start
```

## 日志输出

### 预处理 Pipeline 日志

成功时：
```
[preprocess] Starting pipeline for book: abc123
[preprocess] PDF split complete, processing chapters...
[process-chapters] Book "书名" parsed: 15 segments
```

降级到直接提取时：
```
[preprocess] Starting pipeline for book: abc123
[preprocess] exited 1, falling back to direct extraction
[extract-pdf] Book "书名" parsed: 8 segments
```

### 状态变化

```
"parsing" → "preprocessing" → "processing_chapters" → "parsed"
```

## 测试

### 运行集成测试

```bash
node test-integration.js
```

应该看到所有检查通过：
- ✓ 脚本文件存在
- ✓ TypeScript 类型定义正确
- ✓ routes/pdf.ts 实现完整

### 手动测试

1. 启动服务器：
   ```bash
   npm start
   ```

2. 上传带书签的 PDF：
   ```bash
   curl -X POST -F "file=@your-book.pdf" http://localhost:3000/api/pdf/upload
   ```

3. 检查输出目录：
   ```bash
   ls -R uploads/{bookId}/chapters/
   ```

4. 查看处理结果：
   ```bash
   curl http://localhost:3000/api/books/{bookId}
   ```

## 故障排除

### 问题：preprocess-pdf.py 失败

**症状**: 日志显示 `[preprocess] exited 1`

**原因**: 
- PDF 没有书签且文本分析失败
- Python 依赖未安装

**解决方案**:
1. 安装依赖：`pip install pypdf pdfplumber pymupdf`
2. 系统会自动降级到 `extract-pdf.py`

### 问题：处理时间过长

**原因**: 章节太多或每章内容太长

**解决方案**:
- 使用 `SKIP_CHAPTERS` 分批处理
- 检查 `uploads/{bookId}/chapters/metadata.json` 了解章节数量

### 问题：segments 为空

**原因**: process-chapters.py 未能从章节中提取内容

**解决方案**:
1. 检查 `uploads/{bookId}/chapters/metadata.json`
2. 确认章节 PDF 文件存在且可读取
3. 手动运行 extract-pdf.py 测试单个章节

### 问题：封面图片丢失

**原因**: 封面提取路径不正确

**解决方案**:
- 检查 `process-chapters.py` 输出的 `coverPath`
- 确认封面文件存在于 `uploads/{bookId}/chapters/covers/`

## 环境变量总结

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `USE_PREPROCESS` | `1` (启用) | 设为 `0` 禁用预处理 Pipeline |
| `SKIP_CHAPTERS` | 无 | 逗号分隔的章节号（1-indexed） |
| `EXTRACT_USE_LLM` | `0` | 在章节处理时使用 LLM 结构化 |
| `EXTRACT_LLM_REFINE_TITLES` | `off` | LLM 优化章节标题：`off`, `1`, `all` |

## 优势

1. **准确性更高**: 利用 PDF 书签自动分章，比纯文本分析更准确
2. **可分批处理**: 支持跳过某些章节，便于处理大型 PDF
3. **质量保证**: 每章独立处理，避免跨章节污染
4. **降级策略**: 失败时自动降级到旧方式，保证可靠性
5. **向后兼容**: 可通过环境变量禁用，使用旧方式

## 相关文件

- `server-lite/routes/pdf.ts` - 主要集成代码
- `server-lite/types.ts` - 类型定义
- `scripts/preprocess-pdf.py` - PDF 预处理器
- `scripts/process-chapters.py` - 章节处理器
- `scripts/extract-pdf.py` - 原有直接提取器
- `test-integration.js` - 集成测试脚本
- `test-preprocess-integration.md` - 详细测试指南

## 更新日期

2026-03-22
