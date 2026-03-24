import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { store } from "../store.js";

export const ttsRouter = express.Router();

// POST /api/tts/generate  — SSE stream
ttsRouter.post("/tts/generate", (req, res) => {
  const { bookId, segId } = req.body as { bookId: string; segId: string };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const emit = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const book = store.get(bookId);
  const segment = book?.segments.find((s) => s.id === segId);

  if (!book || !segment) {
    emit({ type: "error", error: "Book or segment not found" });
    return res.end();
  }

  // Write segment data to a temp JSON file for the Python script
  const tmpFile = path.join(os.tmpdir(), `tts-${bookId}-${segId}.json`);
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({ id: segment.id, title: segment.title, paragraphs: segment.paragraphs, bookTitle: book.title }),
    "utf-8"
  );

  store.updateSegment(bookId, segId, { ttsStatus: "generating" });

  const root = process.cwd();
  const proc = spawn(
    "python3.11",
    [path.join(root, "scripts/generate-tts.py"), "--data-file", tmpFile, "--json-output"],
    { cwd: root }
  );

  proc.stdout.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        emit(event);
      } catch {
        // Non-JSON line, ignore
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    console.error(`[tts] ${chunk.toString().trim()}`);
  });

  proc.on("error", (err) => {
    console.error(`[tts] Failed to spawn python: ${err.message}`);
    emit({ type: "error", error: `Failed to start TTS process: ${err.message}` });
    res.end();
  });

  proc.on("close", (code) => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}

    const exitOk = code === 0;
    const audioDir = path.join(root, "public", "audio", segment.id);
    const allFilesExist =
      exitOk &&
      segment.paragraphs.every((p) =>
        fs.existsSync(path.join(audioDir, `${p.id}.mp3`))
      );

    const status = allFilesExist ? "done" : "error";
    if (!allFilesExist) {
      console.error(
        `[tts] ${segId}: exit code ${code}, but some paragraph MP3s are missing — marking as error`
      );
    }
    store.updateSegment(bookId, segId, { ttsStatus: status });
    emit({ type: "done", success: allFilesExist });
    res.end();
  });

  // Use res.on("close") instead of req.on("close"):
  // In Node.js v15+, IncomingMessage (req) has autoDestroy=true, so req emits "close"
  // as soon as the request body is consumed by middleware — long before Python finishes.
  // res.on("close") only fires on a genuine premature client disconnect.
  res.on("close", () => {
    if (!proc.killed) proc.kill();
  });
});

// GET /api/tts/:bookId/:segId/status — polling fallback
ttsRouter.get("/tts/:bookId/:segId/status", (req, res) => {
  const { bookId, segId } = req.params;
  const book = store.get(bookId);
  const segment = book?.segments.find((s) => s.id === segId);
  if (!segment) return res.status(404).json({ error: "Not found" });
  res.json({ ttsStatus: segment.ttsStatus });
});

// DELETE /api/tts/:bookId/:segId — delete audio files and reset ttsStatus
ttsRouter.delete("/tts/:bookId/:segId", (req, res) => {
  const { bookId, segId } = req.params;
  const book = store.get(bookId);
  const segment = book?.segments.find((s) => s.id === segId);
  if (!book || !segment) return res.status(404).json({ error: "Not found" });

  const audioDir = path.join(process.cwd(), "public", "audio", segment.id);
  try {
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
  } catch (e) {
    console.warn(`[tts] Failed to remove audio dir ${audioDir}:`, e);
  }

  const updated = store.updateSegment(bookId, segId, {
    ttsStatus: "pending",
    renderStatus: "pending",
    renderProgress: 0,
    outputPath: undefined,
  });
  res.json(updated);
});
