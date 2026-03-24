# 测试 preprocess-pdf.py 集成

## 集成完成的功能

### 1. 默认启用预处理 Pipeline
- `parseBookAsync()` 现在默认调用 `preprocess-pdf.py` + `process-chapters.py`
- 利用 PDF 书签自动分章，提高章节检测准确性

### 2. 支持环境变量控制

#### USE_PREPROCESS
控制是否使用预处理流程：
```bash
# 启用预处理（默认）
USE_PREPROCESS=1 npm start

# 禁用预处理，使用旧的直接提取方式
USE_PREPROCESS=0 npm start
```

#### SKIP_CHAPTERS
跳过某些章节（用于分批处理大型 PDF）：
```bash
# 跳过后面的章节，只处理前 3 章
SKIP_CHAPTERS=4,5,6,7,8,9 npm start

# 只处理第 4 章及以后
SKIP_CHAPTERS=1,2,3 npm start
```

### 3. 降级策略
如果 `preprocess-pdf.py` 失败（例如 PDF 没有书签且文本分析也失败），自动降级到 `extract-pdf.py` 直接处理整个 PDF。

### 4. 状态追踪
新增两个中间状态：
- `preprocessing` - 正在分割 PDF
- `processing_chapters` - 正在处理章节

## 测试步骤

### 准备测试 PDF
确保你有一个带书签的 PDF 文件用于测试：
```bash
# 检查 PDF 是否有书签
python3 -c "from pypdf import PdfReader; r = PdfReader('uploads/test.pdf'); print('Bookmarks:', len(r.outline))"
```

### 测试 1: 完整流程（默认）
```bash
# 1. 启动服务器（默认启用预处理）
npm start

# 2. 上传 PDF 文件
curl -X POST -F "file=@/path/to/your/book.pdf" http://localhost:3000/api/pdf/upload

# 3. 观察日志
# 应该看到:
# [preprocess] Starting pipeline for book: xxx
# [preprocess] PDF split complete, processing chapters...
# [process-chapters] Book "书名" parsed: N segments
```

### 测试 2: 禁用预处理
```bash
# 使用旧方式处理
USE_PREPROCESS=0 npm start

# 上传 PDF
curl -X POST -F "file=@/path/to/your/book.pdf" http://localhost:3000/api/pdf/upload

# 观察日志
# 应该看到：[extract-pdf] Processing: ...
```

### 测试 3: 跳过某些章节
```bash
# 只处理前 3 章
SKIP_CHAPTERS=4,5,6,7,8,9 npm start

# 上传 PDF
curl -X POST -F "file=@/path/to/your/book.pdf" http://localhost:3000/api/pdf/upload

# 观察日志
# 应该看到：[preprocess] Skipping chapters: 4, 5, 6, 7, 8, 9
```

### 测试 4: 检查输出目录结构
处理完成后，检查生成的文件：
```bash
# 应该看到以下结构
ls -R uploads/{bookId}/
# uploads/{bookId}/
# └── chapters/
#     ├── metadata.json
#     ├── 01_第一章.pdf
#     ├── 02_第二章.pdf
#     └── covers/
#         └── {bookId}.jpg
```

### 测试 5: 检查 books.json
```bash
# 查看 API 返回的书籍数据
curl http://localhost:3000/api/books/{bookId}

# 验证：
# 1. segments 包含所有章节的内容
# 2. 段顺序正确
# 3. coverPath 正确指向封面图片
```

## 预期行为

### 成功场景
1. PDF 有书签 → 使用书签分章 → 处理每个章节 → 合并结果
2. PDF 无书签 → 使用文本分析分章 → 处理每个章节 → 合并结果
3. SKIP_CHAPTERS 设置 → 跳过指定章节 → 只处理剩余章节

### 降级场景
1. preprocess-pdf.py 执行失败 → 自动调用 extract-pdf.py 直接处理
2. process-chapters.py 执行失败 → 状态设为 "parsed"，等待用户手动处理

## 故障排除

### 问题：预处理后 segments 为空
**原因**: process-chapters.py 未能从章节中提取内容
**解决**: 检查 `uploads/{bookId}/chapters/metadata.json` 确认章节是否正确分割

### 问题：处理时间过长
**原因**: 章节太多或每章内容太长
**解决**: 使用 `SKIP_CHAPTERS` 分批处理

### 问题：封面图片丢失
**原因**: 封面提取路径不正确
**解决**: 检查 `process-chapters.py` 输出的 coverPath 是否指向正确位置

## 环境变量总结

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `USE_PREPROCESS` | `1` (启用) | 设为 `0` 禁用预处理，使用旧方式 |
| `SKIP_CHAPTERS` | 无 | 逗号分隔的章节号，跳过这些章节 |
| `EXTRACT_USE_LLM` | `0` | 在章节处理时使用 LLM 结构化 |
| `EXTRACT_LLM_REFINE_TITLES` | `off` | LLM 优化章节标题：`off`, `1`, `all` |

## 下一步
- [ ] 测试有书签的 PDF
- [ ] 测试无书签的 PDF（降级到文本分析）
- [ ] 测试 SKIP_CHAPTERS 功能
- [ ] 测试降级到 extract-pdf.py
