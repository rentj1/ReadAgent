# BUG 排查报告：视频预览 404 — 段落音频文件缺失

- **日期**：2026-03-21
- **环境**：Node.js v22 · Express · Python 3.11 · DashScope CosyVoice TTS · Vite 开发服务器
- **相关文件**：
  - `scripts/generate-tts.py`
  - `server-lite/routes/tts.ts`
  - `data/books.json`
  - `src/compositions/BookSegment.tsx`

---

## 现象

点击片段列表中 `ttsStatus: "已完成"` 的片段进入视频预览页，右侧预览区显示：

```
无法加载音频时长：Error fetching /audio/3029bfb8-seg-02/3029bfb8-seg-02-p01.mp3: 404 Not Found
请确认 TTS 文件已生成到 public/audio/3029bfb8-seg-02/
```

Chrome Network 面板：
- `3029bfb8-seg-02-intro.mp3` — 200 OK
- `3029bfb8-seg-02-p01.mp3` — **404 Not Found**

---

## 根因分析

### 1. 音频文件缺失

`public/audio/3029bfb8-seg-02/` 目录下只有片头音频，段落音频从未生成：

```
public/audio/3029bfb8-seg-02/
  └── 3029bfb8-seg-02-intro.mp3   ✓
  # 3029bfb8-seg-02-p01.mp3       ✗ 缺失
```

### 2. Store 状态误报 "done"

`server-lite/routes/tts.ts` 的 `close` 回调仅凭 Python 进程退出码判断成功：

```ts
// 修复前
const success = code === 0;
store.updateSegment(bookId, segId, { ttsStatus: success ? "done" : "error" });
```

而 `scripts/generate-tts.py` 从不以非零退出码退出——即使段落 TTS 调用失败，进程也返回 0，导致状态被错误地标记为 `"done"`。

### 3. 预览触发 404

`src/compositions/BookSegment.tsx` 的 `calculateMetadata` 并发拉取所有段落 MP3 以计算时长：

```ts
...segment.paragraphs.map((p) =>
  getAudioDuration(staticFile(`audio/${segment.id}/${p.id}.mp3`))
)
```

第一个 404 响应由底层 mediabunny 库抛出：

```
Error fetching http://localhost:5173/audio/…/p01.mp3: 404 Not Found
```

该异常被 `Step2Edit/RemotionPlayerPreview.tsx` 中 `calculateMetadata` 调用的 `catch` 捕获并显示为中文错误提示。

### 数据流

```
RemotionPlayerPreview (calculateMetadata)
  → fetch audio/3029bfb8-seg-02/3029bfb8-seg-02-p01.mp3
  → Vite 静态文件服务 → 文件不存在 → 404
  → mediabunny 抛出异常
  → "无法加载音频时长：Error fetching … 404 Not Found"
```

---

## 修复方案

### Fix 1 — 重置 `data/books.json` 中的错误状态

将 `3029bfb8-seg-01` 和 `3029bfb8-seg-02` 的 `ttsStatus` 从 `"done"` 改回 `"pending"`，使 UI 重新显示"生成TTS"按钮，允许重新生成。

### Fix 2 — Python 脚本在段落生成失败时以非零退出 (`generate-tts.py`)

```python
# main() 中
success_count = process_segment(segment, json_output=args.json_output)
expected = len(segment.get("paragraphs", []))
if success_count < expected:
    sys.exit(1)
```

使进程退出码真实反映生成结果，让服务端的 `code === 0` 判断有实际意义。

### Fix 3 — 服务端文件存在性校验 (`tts.ts`)

Python 进程退出后，主动检查每个段落 MP3 文件是否存在于磁盘，只有全部存在时才标记 `"done"`：

```ts
const exitOk = code === 0;
const audioDir = path.join(root, "public", "audio", segment.id);
const allFilesExist =
  exitOk &&
  segment.paragraphs.every((p) =>
    fs.existsSync(path.join(audioDir, `${p.id}.mp3`))
  );

const status = allFilesExist ? "done" : "error";
store.updateSegment(bookId, segId, { ttsStatus: status });
```

即使 Python 进程以 0 退出但文件缺失，也会正确标记为 `"error"` 并在控制台打印警告。

---

## 经验教训

- **不要只看进程退出码**：TTS API 调用失败时 Python 脚本仍以 0 退出，服务端需做二次校验。
- **状态与文件要保持一致**：标记完成前应验证产物是否真实存在。
- **防御性校验可以兜底**：Fix 3 作为 Fix 2 的保险层，即使脚本将来被改动，服务端也不会产生错误的 `"done"` 状态。
