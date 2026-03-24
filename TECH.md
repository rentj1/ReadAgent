# 书影 Book Video Studio — 技术方案文档

> 将书籍 PDF 转换为竖屏有声读书视频的本地工具，采用暗色书卷主题 UI。

---

## 目录

1. [架构总览](#架构总览)
2. [项目结构](#项目结构)
3. [技术栈](#技术栈)
4. [数据流](#数据流)
5. [模块详解](#模块详解)
   - [Remotion 视频层 (`src/`)](#remotion-视频层)
   - [轻量后端 (`server-lite/`)](#轻量后端)
   - [前端 App (`app/`)](#前端-app)
   - [Python 脚本 (`scripts/`)](#python-脚本)
6. [API 合约](#api-合约)
7. [双后端架构](#双后端架构)
8. [已知约束与 Workaround](#已知约束与-workaround)
9. [启动方式](#启动方式)
10. [待实现 Todo](#待实现-todo)

---

## 架构总览

```
PDF 上传
   │
   ▼
extract-pdf.py ──── pdfplumber 提取文本
   │                LLM (qwen) 可选精细切分
   │                pdf2image 提取封面
   ▼
BookData (books.json)
   │
   ├─► [前端] 书架首页 → 分段编辑 → 渲染仪表盘
   │
   ├─► generate-tts.py ──── DashScope CosyVoice
   │        │
   │        ▼ SSE 进度
   │    MP3 文件 → public/audio/{segId}/
   │
   └─► @remotion/renderer.renderMedia()
            │
            ▼ SSE 进度
        MP4 文件 → outputs/{bookId}/{segId}.mp4
```

---

## 项目结构

```
book-reader/
├── src/                            # Remotion 视频组合
│   ├── index.ts                    # Remotion 入口
│   ├── Root.tsx                    # 注册两个 Composition
│   │   ├── BookReaderSeg01         # 向后兼容（硬编码 chapter5/seg-01）
│   │   └── BookReader              # 通用（通过 inputProps 接收动态数据）
│   ├── compositions/
│   │   └── BookSegment.tsx         # 主 Composition：标题卡 + 段落序列
│   └── components/
│       ├── TitleCard.tsx           # 书籍封面+标题动画卡片
│       └── ParagraphDisplay.tsx    # 段落文字 + 音频同步显示
│
├── server-lite/                    # 轻量后端（Express + child_process）
│   ├── index.ts                    # Express 入口，端口 3001
│   ├── types.ts                    # 共享类型定义
│   ├── store.ts                    # books.json 持久化
│   └── routes/
│       ├── pdf.ts                  # 书籍管理 + PDF 上传
│       ├── tts.ts                  # TTS 生成（SSE）
│       └── render.ts               # 视频渲染（SSE）+ 下载
│
├── app/                            # 前端 React 应用（Vite）
│   ├── src/
│   │   ├── App.tsx                 # 路由入口
│   │   ├── utils/api.ts            # 后端 API 客户端（VITE_API_URL 可切换）
│   │   ├── pages/
│   │   │   ├── BookshelfPage.tsx   # 书架首页
│   │   │   ├── BookDetailPage.tsx  # 书籍详情（三步容器）
│   │   │   └── steps/
│   │   │       ├── Step1Parse.tsx  # 解析进度等待页
│   │   │       ├── Step2Edit/      # 分段编辑 + 文字预览（子模块目录）
│   │   │       │   ├── index.ts              # 导出 Step2Edit
│   │   │       │   ├── Step2Edit.tsx         # 主布局与状态
│   │   │       │   ├── EditableSegmentPreview.tsx
│   │   │       │   ├── EditableParagraphCard.tsx
│   │   │       │   ├── RemotionPlayerPreview.tsx
│   │   │       │   └── …                     # EditableBookTitle 等
│   │   │       └── Step3Render.tsx # 渲染仪表盘
│   │   └── components/
│   │       ├── Stepper.tsx         # 三步导航进度条
│   │       ├── BookCard.tsx        # 书籍卡片（封面+状态）
│   │       ├── DropZone.tsx        # 拖拽上传区
│   │       └── StatusBadge.tsx     # 状态徽章
│   ├── vite.config.ts              # Vite 配置（代理到 server-lite）
│   └── tailwind.config.js          # 暗色书卷主题配置
│
├── scripts/
│   ├── generate-tts.py             # DashScope CosyVoice TTS 生成
│   └── extract-pdf.py              # PDF 文本提取 + 章节分割
│
├── public/
│   ├── audio/                      # TTS 生成的 MP3（按 segId 分目录）
│   ├── covers/                     # PDF 封面图（JPG）
│   └── book-cover.jpg              # 已有书籍封面
│
├── outputs/                        # 渲染输出 MP4
├── uploads/                        # 上传的 PDF 文件
├── data/
│   └── books.json                  # 书籍状态持久化
│
├── package.json                    # 根包：Remotion + server-lite 依赖
├── tsconfig.json                   # TypeScript 配置（Remotion/浏览器环境）
└── remotion.config.ts              # Remotion 配置
```

---

## 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 视频渲染 | Remotion | 4.0.290 | React 驱动的视频合成引擎 |
| 视频编码 | ffmpeg (evermeet.cx) | - | macOS 12 兼容版本 |
| TTS | DashScope CosyVoice | cosyvoice-v3-flash | AI 中文朗读，longanyang 音色 |
| PDF 解析 | pdfplumber | - | Python，提取 PDF 文本 |
| PDF 封面 | pdf2image | - | Python，PDF 首页截图 |
| LLM 切分 | DashScope qwen-turbo | - | 可选，智能章节切分 |
| 后端 | Express | 5.x | HTTP 服务 + SSE 推流 |
| 前端框架 | React | 18.3.1 | - |
| 构建工具 | Vite | 8.x | 开发服务器 + 打包 |
| 样式 | Tailwind CSS | 3.x | 暗色书卷主题 |
| 路由 | react-router-dom | 7.x | 前端路由 |
| 图标 | lucide-react | - | 界面图标 |
| 文件上传 | multer | 2.x | PDF 上传处理 |
| ZIP 打包 | archiver | 7.x | 批量下载压缩 |
| 并发脚本 | concurrently | 9.x | 同时启动前后端 |

---

## 数据流

### 书籍数据模型（`data/books.json`）

```typescript
type BookData = {
  id: string;              // 8位随机 UUID（如 "chapter5"）
  title: string;           // 书名
  coverPath?: string;      // 封面 URL（如 "/book-cover.jpg"）
  pdfPath: string;         // 相对路径（如 "uploads/abc123.pdf"）
  status: "importing" | "parsing" | "parsed" | "ready";
  segments: SegmentData[]; // 视频片段列表
  createdAt: string;       // ISO 时间戳
};

type SegmentData = {
  id: string;                    // 片段 ID（如 "seg-01" 或 "abc123-seg-01"）
  title: string;                 // 片段标题
  paragraphs: ParagraphData[];   // 段落列表
  ttsStatus: "pending" | "generating" | "done" | "error";
  renderStatus: "pending" | "rendering" | "done" | "error";
  renderProgress: number;        // 0-100
  outputPath?: string;           // MP4 输出路径
};

type ParagraphData = {
  id: string;              // 段落 ID（如 "seg-01-p01"）
  text: string;            // 段落文字
  sectionTitle?: string;   // 小节标题（可选）
};
```

### 音频文件命名规范

```
public/audio/{segId}/
  ├── {segId}-intro.mp3        # 标题卡音频（书名 + 章节名）
  ├── {segId}-p01.mp3          # 第1段落音频
  ├── {segId}-p02.mp3
  └── ...
```

### Remotion 音频路径解析

`BookSegment.tsx` 中使用 `staticFile("audio/{segId}/{paraId}.mp3")`，Remotion 将其解析为：
- **渲染时**：`book-reader/public/audio/…`（通过 webpack 服务）
- **前端 Player 预览时**：`http://localhost:5173/audio/…`（Vite 代理转发到 server-lite）

---

## 模块详解

### Remotion 视频层

#### `BookReaderSeg01` Composition（向后兼容）
硬编码使用 `src/data/chapter5.ts` 中的 seg-01 数据。可直接用 CLI 渲染：
```bash
npx remotion render src/index.ts BookReaderSeg01 --output ../outputs/chapter5/seg-01.mp4
```

#### `BookReader` Composition（通用）
通过 `inputProps` 接收动态 segment 数据，供 server-lite 编程式渲染：
```typescript
renderMedia({
  serveUrl: bundledUrl,
  composition: await selectComposition({
    id: "BookReader",
    inputProps: { segment, paragraphDurationsFrames: [], titleCardDurationFrames: 120 }
  }),
  codec: "h264",
  outputLocation: "outputs/{bookId}/{segId}.mp4",
  onProgress: ({ progress }) => sseEmit(progress),
})
```

#### `calculateMetadata`
在渲染开始前自动读取所有 MP3 文件的实际时长，动态计算总帧数。**必须在 TTS 生成完成后才能渲染**。

---

### 轻量后端

`server-lite/index.ts` 启动 Express，端口 3001：
- 静态服务：整个 `public/` 目录（含 `audio/`、`covers/`、`book-cover.jpg`）
- 静态服务：`outputs/` 目录
- API 路由：`/api/books`、`/api/pdf`、`/api/tts`、`/api/render`

**Bundle 缓存**（`routes/render.ts`）：
`@remotion/bundler.bundle()` 首次调用需要约 1-2 分钟（Webpack 打包），结果缓存在内存中，后续渲染直接复用。

---

### 前端 App

**路由结构**：
```
/                        → BookshelfPage（书架）
/book/:bookId            → BookDetailPage → Step2Edit（默认进编辑页）
/book/:bookId/edit       → BookDetailPage → Step2Edit
/book/:bookId/render     → BookDetailPage → Step3Render
```

**Vite 代理**（`vite.config.ts`）：
```
/api/*        → http://localhost:3001
/audio/*      → http://localhost:3001
/covers/*     → http://localhost:3001
/outputs/*    → http://localhost:3001
/book-cover.jpg → http://localhost:3001
```

---

### Python 脚本

#### `generate-tts.py`

```bash
# 原始 CLI 模式（硬编码 chapter5 数据）
python3.11 scripts/generate-tts.py seg-01

# 动态模式（server-lite 调用）
python3.11 scripts/generate-tts.py \
  --data-file /tmp/segment.json \
  --json-output
```

JSON 输出格式（`--json-output` 时，每行一个 JSON）：
```json
{"type":"start","segId":"seg-01","total":12}
{"type":"progress","done":1,"total":12,"paraId":"seg-01-intro","status":"ok","sizeKb":23.4}
{"type":"segment_done","segId":"seg-01","success":11,"total":11}
```

#### `extract-pdf.py`

```bash
python3.11 scripts/extract-pdf.py \
  --pdf-path uploads/abc123.pdf \
  --book-id abc123 \
  --cover-dir public/covers \
  [--use-llm]   # 启用 DashScope qwen 精细切分
```

输出 JSON 到 stdout，供 server-lite 的 `parseBookAsync` 解析。

---

## API 合约

所有端点以 `/api` 为前缀。

### 书籍管理

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/books` | 获取所有书籍列表 |
| GET | `/api/books/:bookId` | 获取单本书详情 |
| PUT | `/api/books/:bookId` | 更新书籍（标题/分段） |
| DELETE | `/api/books/:bookId` | 删除书籍及所有关联文件 |

### PDF 上传

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/pdf/upload` | multipart/form-data，field: `file` |
| POST | `/api/pdf/import-existing` | 一键导入已有 chapter5 数据 |

`POST /api/pdf/upload` 返回：
```json
{ "bookId": "abc123", "title": "书名", "status": "parsing" }
```

### TTS 生成（SSE）

```
POST /api/tts/generate
Body: { "bookId": "abc123", "segId": "abc123-seg-01" }
Response: text/event-stream
```

SSE 事件格式：
```
data: {"type":"start","segId":"...","total":12}
data: {"type":"progress","done":3,"total":12,"paraId":"...","status":"ok"}
data: {"type":"done","success":true}
```

### 视频渲染（SSE）

```
POST /api/render/start
Body: { "bookId": "abc123", "segId": "abc123-seg-01" }
Response: text/event-stream
```

SSE 事件格式：
```
data: {"type":"progress","progress":45}
data: {"type":"done","outputPath":"outputs/abc123/abc123-seg-01.mp4"}
```

### 下载

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/render/download/:bookId/:segId` | 下载单个 MP4 |
| GET | `/api/render/download/:bookId` | 下载全部片段 ZIP |

### 状态轮询（SSE 断线备用）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/tts/:bookId/:segId/status` | TTS 状态 |
| GET | `/api/render/:bookId/:segId/status` | 渲染状态 + 进度 |

---

## 双后端架构

前端 `app/utils/api.ts` 中所有请求使用 `import.meta.env.VITE_API_URL ?? ""` 作为 base URL。

```bash
# app/.env.local — 使用本地 server-lite
VITE_API_URL=           # 空字符串（通过 Vite proxy 自动转发）

# app/.env.production — 直连远端服务器
VITE_API_URL=https://your-server.com
```

两种后端（`server-lite/` 轻量版 vs 未来 `server/` 完整版）暴露完全相同的 API 合约，前端代码无需修改。

---

## 已知约束与 Workaround

### macOS 12 ffmpeg/ffprobe 不兼容

Remotion 4.x 的 `@remotion/compositor-darwin-x64` 内置的 ffprobe 需要 macOS 13+。

**Workaround**（已应用）：
```bash
# 替换为 evermeet.cx 的兼容版本
cp /path/to/compatible/ffprobe \
  node_modules/@remotion/compositor-darwin-x64/ffprobe
```

### Remotion libfdk_aac 编码器不可用

标准 ffmpeg 构建不含 `libfdk_aac` 编码器。

**Workaround**（已应用）：
```bash
# node_modules/@remotion/renderer/dist/options/audio-codec.js
# 将所有 "libfdk_aac" 替换为 "aac"
```

> ⚠️ **注意**：每次 `npm install` 后需检查此 patch 是否被覆盖。
> 验证：`grep "libfdk_aac" node_modules/@remotion/renderer/dist/options/audio-codec.js`（应无输出）

### CosyVoice 速率限制

DashScope CosyVoice API 限制 3 RPS。`generate-tts.py` 在每次 API 调用间加了 `time.sleep(0.4)` 延迟。

### Bundle 首次耗时

`@remotion/bundler.bundle()` 首次运行约 1-3 分钟（Webpack 打包 Remotion compositions）。`enableCaching: true` 后续运行秒级完成（缓存于 `/tmp/`）。

---

## 启动方式

### 开发模式（推荐）
```bash
cd book-reader
npm run app:dev
# 同时启动：
#   - server-lite (watch mode) → http://localhost:3001
#   - Vite dev server          → http://localhost:5173
```

### 分别启动
```bash
# Terminal 1 — 后端
npm run server:lite:dev

# Terminal 2 — 前端
cd app && npm run dev
```

### Remotion Studio（视频预览/调试）
```bash
npm start  # → http://localhost:3000
```

### 命令行渲染（不启动 Web UI）
```bash
# 渲染 chapter5/seg-01（原始方式）
npm run render

# 生成 seg-01 TTS
python3.11 scripts/generate-tts.py seg-01
```

---

## 待实现 Todo

### P0 — 核心功能补全

| ID | 功能 | 说明 |
|----|------|------|
| `player-preview` | `@remotion/player` 实时预览 | 在 `Step2Edit/RemotionPlayerPreview.tsx` 中嵌入 Remotion Player。需安装 `@remotion/google-fonts` 和 `mediabunny` 到 `app/` 并处理相对导入路径 |
| `install-python-deps` | Python 依赖安装 | `pip install pdfplumber pdf2image` — extract-pdf.py 依赖这两个库才能实际解析 PDF |
| `ffmpeg-patch-guard` | ffmpeg patch 保护 | 添加 `postinstall` 脚本，自动检测并重新应用 ffmpeg/aac 两个 patch，避免 npm install 后失效 |

### P1 — 编辑器增强

| ID | 功能 | 说明 |
|----|------|------|
| `drag-reorder` | 段落拖拽排序 | 使用已安装的 `@dnd-kit/sortable` 实现 `Step2Edit/Step2Edit.tsx` 左侧片段列表拖拽重新排序 |
| `para-merge-split` | 合并/拆分段落 | 在段落卡片上添加「合并到上一段」「在此拆分」操作按钮 |
| `inline-edit` | 段落文字编辑 | 点击段落卡片进入内联编辑，改完自动保存到本地状态（不触发 API） |
| `seg-rename` | 片段标题编辑 | 允许用户修改片段标题（影响 TTS 标题卡朗读） |

### P2 — 渲染仪表盘增强

| ID | 功能 | 说明 |
|----|------|------|
| `card-flip` | 卡片翻转动画 | 渲染完成时，片段卡片 CSS 3D 翻转，背面展示 ffmpeg 截取的视频缩略图 + 下载按钮 |
| `video-thumbnail` | 视频缩略图生成 | 渲染完成后，server-lite 用 `ffmpeg -ss 5 -vframes 1` 截取封面帧，保存到 `outputs/{bookId}/{segId}-thumb.jpg` |
| `render-queue` | 渲染队列 | 「全部渲染」时串行渲染（当前实现并行可能 OOM），加队列限制最多同时渲染 1 个片段 |

### P3 — 体验优化

| ID | 功能 | 说明 |
|----|------|------|
| `empty-state-cover` | 封面提取失败降级 | extract-pdf.py 无法提取封面时，用 pdf2image 或 Noto Serif SC 生成文字封面占位图 |
| `theme-switch` | 浅色/暗色主题切换 | 当前固定暗色（#1a0e05）。可在 App 中添加 ThemeProvider，支持浅色简约风 |
| `book-title-edit` | 书名编辑 | 书架页书籍卡片支持点击书名进行编辑 |
| `parsing-sse` | 解析进度 SSE | 当前 Step1Parse 轮询 /api/books/:id 检测状态。改为 extract-pdf.py 输出 JSON 进度、server-lite 转 SSE 推送 |
| `error-retry` | 全局错误重试 | TTS 或渲染失败时，提供分段级别的单独重试，而不是重新渲染全部 |

### P4 — 完整 Web Server 版本

| ID | 功能 | 说明 |
|----|------|------|
| `server-ts` | TypeScript 服务层 | 将 `server-lite/` 的 `child_process` 调用替换为纯 TypeScript 实现的 `server/services/`，支持多用户、并发控制、错误重试 |
| `job-queue` | 渲染 Job 队列 | 使用 BullMQ 或简单的数组队列管理渲染任务，支持暂停/恢复/取消 |
| `multi-book-tts` | 多书籍并行 TTS | 不同书籍的 TTS 可并行生成，同一书籍内串行（受 3 RPS 限制） |
