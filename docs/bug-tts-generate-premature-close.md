# BUG 排查报告：POST /api/tts/generate 接口无内容返回

- **日期**：2026-03-21
- **环境**：Node.js v22.19.0 · Express v5 · tsx watch · macOS
- **文件**：`server-lite/routes/tts.ts`

---

## 一、现象

调用 `POST http://localhost:5173/api/tts/generate`，接口立即返回，但只有：

```
data: {"type":"done","success":false}
```

没有 `start`、`progress` 等任何内容事件，TTS 音频也未生成。

---

## 二、完整调用链路

```
Browser (Step3Render.tsx)
  └─ api.streamTts(bookId, segId)
       └─ POST http://localhost:5173/api/tts/generate
            └─ [Vite proxy :5173] → http://localhost:3001/api/tts/generate
                 └─ server-lite/routes/tts.ts  (Express SSE handler)
                      ├─ store.get(bookId)  — 从 data/books.json 查找书和段落
                      ├─ fs.writeFileSync   — 写段落数据到 /tmp/tts-{bookId}-{segId}.json
                      ├─ spawn("python3.11", "scripts/generate-tts.py", "--data-file", "--json-output")
                      │    └─ DashScope CosyVoice API (WebSocket wss://)
                      │         └─ 生成 MP3 → public/audio/{segId}/{paraId}.mp3
                      └─ 将 Python stdout (JSON 行) 逐条转发为 SSE 事件
```

### SSE 事件格式（正常情况）

```
data: {"type":"start",    "segId":"seg-01", "total":12}
data: {"type":"progress", "done":1, "total":12, "paraId":"seg-01-intro", "status":"ok", "sizeKb":98.9}
...
data: {"type":"done",     "success":true}
```

---

## 三、排查过程

### 3.1 确认服务正常启动

```
[server] Book Reader Server Lite → http://localhost:3001
[server] Root: /Users/.../book-reader
```

Vite proxy 和 Express 均正常运行。

### 3.2 直接 curl 端口 3001

```bash
curl -X POST http://localhost:3001/api/tts/generate \
  -H "Content-Type: application/json" \
  -d '{"bookId":"chapter5","segId":"seg-01"}'
```

响应：
```
data: {"type":"done","success":false}
```

无 `start` 事件。`success:false` 说明 Python 进程以 **非 0** 退出码（或被信号杀死）结束。

### 3.3 直接运行 Python 脚本

```bash
python3.11 scripts/generate-tts.py \
  --data-file /tmp/tts-chapter5-seg-01.json \
  --json-output
```

结果：正常输出 12 个事件，退出码 0。说明 Python 脚本本身没有问题。

### 3.4 在 Node.js 中手动 spawn（模拟服务器行为）

```js
const proc = spawn("python3.11", [...], { cwd: root });
proc.on("close", (code) => console.log("code:", code));
```

结果：`code: 0`，事件全部正常输出。说明 spawn 本身也没有问题。

### 3.5 加入调试日志，定位触发点

在路由中增加日志：

```ts
proc.on("close", (code, signal) => {
  console.log(`[tts-debug] proc close: code=${code} signal=${signal}`);
  ...
});

req.on("close", () => {
  console.log(`[tts-debug] req.close fired — killing proc`);
  proc.kill();
});
```

服务器终端输出：

```
[tts-debug] req.close fired — killing proc. bookId=chapter5 segId=seg-01
[tts-debug] proc close: code=null signal=SIGTERM bookId=chapter5 segId=seg-01
```

**结论**：`req.on("close")` 提前触发，`proc.kill()` 将 Python 进程杀死，导致：
- `code = null`（被信号杀死，没有正常退出码）
- `null === 0` → `false`
- `success = false`

---

## 四、根本原因

**Node.js v15+ 中 `IncomingMessage`（req）默认开启 `autoDestroy: true`。**

| 步骤 | 说明 |
|---|---|
| 1 | `express.json()` 中间件读取并消费完 POST 请求体（38 字节）|
| 2 | `IncomingMessage` 作为 `Readable` 流，数据读取完毕后触发 `end` 事件 |
| 3 | `autoDestroy: true` 使流在 `end` 后自动销毁，触发 `close` 事件 |
| 4 | `req.on("close", () => proc.kill())` 被调用，Python 进程收到 SIGTERM |
| 5 | Python 以 `code=null, signal=SIGTERM` 退出 |
| 6 | `null === 0` 为 `false`，服务器返回 `done: { success: false }` |

> **注意**：这与"客户端断开连接"完全无关。中间件消费完请求体后，TCP socket 仍然保持打开，等待 SSE 响应流。但 `req` 流的 `autoDestroy` 机制独立于 socket 状态，单纯因为流数据读完就触发了 `close`。

---

## 五、修复方案

将 `req.on("close")` 改为 `res.on("close")`：

```diff
- req.on("close", () => proc.kill());
+ // res.on("close") 只在客户端真正断开连接时触发（浏览器关闭/切页），
+ // 不受请求体消费的影响。
+ res.on("close", () => {
+   if (!proc.killed) proc.kill();
+ });
```

同时补充了缺失的 `proc.on("error")` 处理，防止 `python3.11` 找不到时产生未捕获异常：

```ts
proc.on("error", (err) => {
  console.error(`[tts] Failed to spawn python: ${err.message}`);
  emit({ type: "error", error: `Failed to start TTS process: ${err.message}` });
  res.end();
});
```

### 事件语义对比

| 事件 | 触发时机 | 适用场景 |
|---|---|---|
| `req.on("close")` | 请求体消费完 **或** socket 关闭 | ❌ 不适合 SSE 的客户端断开检测 |
| `res.on("close")` | 响应未结束前 socket 被关闭（真实断连） | ✅ SSE 客户端断开检测的正确方式 |
| `res.on("finish")` | `res.end()` 正常调用完成 | 响应正常结束的回调 |

---

## 六、修复后验证

```bash
curl -X POST http://localhost:3001/api/tts/generate \
  -H "Content-Type: application/json" \
  -d '{"bookId":"chapter5","segId":"seg-01"}'
```

输出：

```
data: {"type":"start","segId":"seg-01","total":12}
data: {"type":"progress","done":1,"total":12,"paraId":"seg-01-intro","status":"ok","sizeKb":98.9}
data: {"type":"progress","done":2,"total":12,"paraId":"seg-01-p01","status":"ok","sizeKb":92.3}
...（共 12 条进度事件）
data: {"type":"done","success":true}
```

接口恢复正常，SSE 流完整输出，`success: true`。

---

## 七、修复文件

- `server-lite/routes/tts.ts` — 核心修复（`req.on` → `res.on`，补充 `proc.on("error")`）
