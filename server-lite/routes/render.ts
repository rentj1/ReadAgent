import express from "express";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { store } from "../store.js";

export const renderRouter = express.Router();

// Lazily cached bundle URL — bundle once, reuse for all renders
let cachedBundleUrl: string | undefined;

async function getBundleUrl(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;

  // Dynamically import to avoid loading Remotion at server startup
  const { bundle } = await import("@remotion/bundler");
  console.log("[render] Bundling Remotion compositions (first render only)...");

  cachedBundleUrl = await bundle({
    entryPoint: path.join(process.cwd(), "src/index.ts"),
    enableCaching: true,
  });

  console.log("[render] Bundle ready →", cachedBundleUrl);
  return cachedBundleUrl;
}

// POST /api/render/start  — SSE stream
renderRouter.post("/render/start", async (req, res) => {
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

  if (segment.ttsStatus !== "done") {
    emit({ type: "error", error: "TTS must be generated before rendering" });
    return res.end();
  }

  store.updateSegment(bookId, segId, { renderStatus: "rendering", renderProgress: 0 });

  try {
    const { renderMedia, selectComposition } = await import("@remotion/renderer");

    const bundleUrl = await getBundleUrl();
    const outputDir = path.join(process.cwd(), "outputs", bookId);
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${segId}.mp4`);

    const inputProps = {
      segment: {
        id: segment.id,
        title: segment.title,
        paragraphs: segment.paragraphs,
      },
      paragraphDurationsFrames: [],
      titleCardDurationFrames: 120,
      bookTitle: book.title,
      coverPath: book.coverPath,
    };

    const comp = await selectComposition({
      serveUrl: bundleUrl,
      id: "BookReader",
      inputProps,
    });

    await renderMedia({
      serveUrl: bundleUrl,
      composition: comp,
      codec: "h264",
      outputLocation: outputPath,
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        store.updateSegment(bookId, segId, { renderProgress: pct });
        emit({ type: "progress", progress: pct });
      },
    });

    const relativePath = `outputs/${bookId}/${segId}.mp4`;
    store.updateSegment(bookId, segId, {
      renderStatus: "done",
      renderProgress: 100,
      outputPath: relativePath,
    });
    emit({ type: "done", outputPath: relativePath });
    res.end();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[render] Error:", error);
    store.updateSegment(bookId, segId, { renderStatus: "error" });
    emit({ type: "error", error });
    res.end();
  }
});

// GET /api/render/:bookId/:segId/status — polling fallback
renderRouter.get("/render/:bookId/:segId/status", (req, res) => {
  const { bookId, segId } = req.params;
  const book = store.get(bookId);
  const segment = book?.segments.find((s) => s.id === segId);
  if (!segment) return res.status(404).json({ error: "Not found" });
  res.json({
    renderStatus: segment.renderStatus,
    renderProgress: segment.renderProgress,
    outputPath: segment.outputPath,
  });
});

// GET /api/render/download/:bookId/:segId — download single MP4
renderRouter.get("/render/download/:bookId/:segId", (req, res) => {
  const { bookId, segId } = req.params;
  const filePath = path.join(process.cwd(), "outputs", bookId, `${segId}.mp4`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  res.download(filePath, `${segId}.mp4`);
});

// GET /api/render/download/:bookId — download all segments as ZIP
renderRouter.get("/render/download/:bookId", (req, res) => {
  const { bookId } = req.params;
  const book = store.get(bookId);
  if (!book) return res.status(404).json({ error: "Book not found" });

  const outputDir = path.join(process.cwd(), "outputs", bookId);
  if (!fs.existsSync(outputDir)) return res.status(404).json({ error: "No renders found" });

  const safeName = book.title.replace(/[^\w\u4e00-\u9fff]/g, "_").slice(0, 40);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".mp4"));
  for (const file of files) {
    archive.file(path.join(outputDir, file), { name: file });
  }

  archive.finalize();
});
