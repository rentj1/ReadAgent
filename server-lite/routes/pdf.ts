import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { store } from "../store.js";
import type { BookData, SegmentData } from "../types.js";

export const pdfRouter = express.Router();

const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf"));
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// GET /api/books
pdfRouter.get("/books", (_req, res) => {
  res.json(store.getAll());
});

// GET /api/books/:bookId
pdfRouter.get("/books/:bookId", (req, res) => {
  const book = store.get(req.params.bookId);
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(book);
});

// PUT /api/books/:bookId — update title or segments (after user edits)
pdfRouter.put("/books/:bookId", (req, res) => {
  const { title, segments } = req.body as Partial<BookData>;
  const patch: Partial<BookData> = {};
  if (title !== undefined) patch.title = title;
  if (segments !== undefined) patch.segments = segments;
  const updated = store.update(req.params.bookId, patch);
  if (!updated) return res.status(404).json({ error: "Book not found" });
  res.json(updated);
});

// DELETE /api/books/:bookId
pdfRouter.delete("/books/:bookId", (req, res) => {
  const book = store.get(req.params.bookId);
  if (!book) return res.status(404).json({ error: "Book not found" });

  // Clean up associated files
  const root = process.cwd();
  try {
    if (book.pdfPath && fs.existsSync(path.join(root, book.pdfPath))) {
      fs.unlinkSync(path.join(root, book.pdfPath));
    }
    const audioDir = path.join(root, "public/audio");
    for (const seg of book.segments) {
      const segDir = path.join(audioDir, seg.id);
      if (fs.existsSync(segDir)) fs.rmSync(segDir, { recursive: true });
    }
    const outputDir = path.join(root, "outputs", book.id);
    if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true });
    if (book.coverPath) {
      const coverFile = path.join(root, "public/covers", `${book.id}.jpg`);
      if (fs.existsSync(coverFile)) fs.unlinkSync(coverFile);
    }
  } catch (e) {
    console.warn("[pdf] Cleanup error:", e);
  }

  store.delete(req.params.bookId);
  res.json({ ok: true });
});

// POST /api/pdf/upload
pdfRouter.post("/pdf/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF file received" });

  const root = process.cwd();
  const bookId = uuidv4().slice(0, 8);
  const pdfDest = path.join(root, "uploads", `${bookId}.pdf`);
  fs.renameSync(req.file.path, pdfDest);

  const rawTitle = (req.file.originalname || "Untitled").replace(/\.pdf$/i, "");
  const book: BookData = {
    id: bookId,
    title: rawTitle,
    pdfPath: `uploads/${bookId}.pdf`,
    status: "parsing",
    segments: [],
    createdAt: new Date().toISOString(),
  };
  store.save(book);
  res.json({ bookId, title: rawTitle, status: "parsing" });

  // Kick off async parsing
  parseBookAsync(bookId, pdfDest, rawTitle);
});

// POST /api/pdf/import-existing — import the hardcoded chapter5 book
pdfRouter.post("/pdf/import-existing", (_req, res) => {
  const root = process.cwd();
  const existingBook = store.getAll().find((b) => b.id === "chapter5");
  if (existingBook) return res.json(existingBook);

  const seg01Paragraphs = [
    { id: "seg-01-p01", text: "营销其实就是分享你所热爱的东西。\n——迈克尔·凯悦" },
    { id: "seg-01-p02", text: "恭喜你！你有了社区、一个产品和100 个客户。这意味着你达到了产品和市场的最佳契合点。回头客意味着你的生意在没有持续的推销活动的情况下能够继续发展下去，这样你可以开始专注于规模的扩张。" },
    { id: "seg-01-p03", text: "营销，就是大规模销售。在能够进行营销活动之前，你需要将产品卖给100 个客户，那是因为你的营销要建立在销售过程的基础之上。销售是向外逐个攻破，而营销是向内一次吸引几百个潜在客户。销售让你的客户达到 100 个，营销会让你的客户达到数千个。" },
    { id: "seg-01-p04", text: "但是不要把营销和广告混为一谈。广告要花钱，极简主义创业者只在万不得已的时候才花钱。最好从花时间而不是花金钱开始。博客帖子免费，推特、照片墙、油管和 Clubhouse 也都免费。与其花钱，不如从在这些地方建立一个受众群体开始。" },
    { id: "seg-01-p05", sectionTitle: "受众的力量", text: "你从利用一个已经存在的社区开始创业，现在是时候继续前行建立一个受众群体了。两者的区别在哪儿？你的社区是你受众的一部分，但你的受众并不是你社区的一部分。受众群体是一个当你有话要说时你的信息能触达的所有人组成的网络。" },
    { id: "seg-01-p06", text: "销售让你在这些新的人群中试水，因为它迫使你走出你的舒适区，一个一个地去说服他们，同时在这个过程中改进你的产品。营销更难，因为你必须让客户走出他们的舒适区来你这里，而不是你去他们那里。" },
    { id: "seg-01-p07", text: "但如果你能想清楚如何让客户来找你，扩大生意规模在方方面面都会变得容易很多。招聘变得更容易，销售变得更容易，业务增长变得更容易。当你有一个每天都在扩大的群体支持你取得成功时，创业的每一件事都会变得更容易。" },
    { id: "seg-01-p08", text: "人们不会从陌生人一步到位变成客户，他们从陌生人开始到模糊地知道你的存在，到渐渐成为粉丝，再到成为客户，最后成为帮你宣传扩散的回头客。从制造粉丝开始。" },
    { id: "seg-01-p09", sectionTitle: "制造粉丝，而不是头条新闻", text: "想想你很喜欢的一个企业，你能说出创始人的名字吗？能想象出他们办公室的样子吗？你脑海里能「听」到他们的声音吗？我敢打赌，对于很多企业而言，答案是肯定的。因为你读过关于他们的文章，在社交媒体上关注了他们。" },
    { id: "seg-01-p10", text: "大部分创始人不习惯将自己置于企业发展的故事的中心。但是你需要这么做。人们不在乎企业，他们在乎别人。你有可以提供的东西，而且现有的客户很在乎这种东西。他们为你的劳动成果付费，对你的想法感兴趣，想知道你为什么做出某些特定的决定以及你的产品是怎么诞生的。" },
    { id: "seg-01-p11", text: "建立一个受众群体，朝着制造粉丝迈出的第一步就是大规模地进行这些对话。" },
  ];

  // Detect TTS status from existing audio files
  const audioDir = path.join(root, "public/audio/seg-01");
  const ttsStatus = fs.existsSync(audioDir) ? "done" : "pending";

  const book: BookData = {
    id: "chapter5",
    title: "小而美 · 第五章",
    coverPath: fs.existsSync(path.join(root, "public/book-cover.jpg")) ? "/book-cover.jpg" : undefined,
    pdfPath: "小而美_章节/07_第五章_通过做自己来营销.pdf",
    status: "parsed",
    segments: [
      {
        id: "seg-01",
        title: "第五章 · 通过做自己来营销",
        paragraphs: seg01Paragraphs,
        ttsStatus,
        renderStatus: fs.existsSync(path.join(root, "outputs/chapter5/seg-01.mp4")) ? "done" : "pending",
        renderProgress: 0,
        outputPath: fs.existsSync(path.join(root, "outputs/chapter5/seg-01.mp4"))
          ? "outputs/chapter5/seg-01.mp4"
          : undefined,
      },
    ],
    createdAt: new Date().toISOString(),
  };

  store.save(book);
  res.json(book);
});

/**
 * Main entry point for parsing books.
 * Routes to either preprocess pipeline or direct extraction based on USE_PREPROCESS env var.
 */
function parseBookAsync(bookId: string, pdfPath: string, _title: string): void {
  const root = process.cwd();
  
  // Check if using preprocess pipeline (default: enabled)
  const usePreprocess = process.env.USE_PREPROCESS !== "0" && process.env.USE_PREPROCESS !== "false";
  
  if (usePreprocess) {
    parseBookWithPreprocess(bookId, pdfPath);
  } else {
    parseBookDirect(bookId, pdfPath);
  }
}

/**
 * Parse book using preprocess pipeline:
 * 1. preprocess-pdf.py: Split PDF into chapters based on bookmarks
 * 2. process-chapters.py: Process each chapter and merge results
 */
function parseBookWithPreprocess(bookId: string, pdfPath: string): void {
  const root = process.cwd();
  const preprocessScriptPath = path.join(root, "scripts/preprocess-pdf.py");
  const processChaptersScriptPath = path.join(root, "scripts/process-chapters.py");
  
  console.log(`[preprocess] Starting pipeline for book: ${bookId}`);
  store.update(bookId, { status: "parsing" });
  console.log(`[preprocess] Status updated to: parsing`);
  
  // Step 1: Run preprocess-pdf.py to split PDF into chapters
  const preprocessArgs = [
    preprocessScriptPath,
    "--pdf-path", pdfPath,
    "--book-id", bookId,
  ];
  
  const preprocessProc = spawn("python3.11", preprocessArgs, {
    cwd: root,
  });
  
  let preprocessStdout = "";
  let preprocessStderr = "";
  
  preprocessProc.stdout.on("data", (d: Buffer) => (preprocessStdout += d.toString()));
  preprocessProc.stderr.on("data", (d: Buffer) => (preprocessStderr += d.toString()));
  
  preprocessProc.on("close", (code) => {
    if (preprocessStderr) console.error(`[preprocess] ${preprocessStderr}`);
    
    if (code !== 0) {
      console.error(`[preprocess] exited ${code}, falling back to direct extraction`);
      // Fallback to direct extraction
      parseBookDirect(bookId, pdfPath);
      return;
    }
    
    console.log(`[preprocess] PDF split complete, processing chapters...`);
    store.update(bookId, { status: "processing_chapters" });
    console.log(`[preprocess] Status updated to: processing_chapters`);
    
    // Step 2: Run process-chapters.py to process all chapters and merge
    const chaptersDir = path.join(root, "uploads", bookId, "chapters");
    const processArgs = [
      processChaptersScriptPath,
      "--chapters-dir", chaptersDir,
      "--book-id", bookId,
    ];
    
    // Support skipping chapters via environment variable
    const skipChapters = process.env.SKIP_CHAPTERS;
    if (skipChapters) {
      const skipList = skipChapters.split(",").map(s => s.trim()).filter(s => s);
      if (skipList.length > 0) {
        processArgs.push("--skip-chapters", ...skipList);
        console.log(`[preprocess] Skipping chapters: ${skipList.join(", ")}`);
      }
    }
    
    const processProc = spawn("python3.11", processArgs, {
      cwd: root,
    });
    
    let processStdout = "";
    let processStderr = "";
    
    processProc.stdout.on("data", (d: Buffer) => (processStdout += d.toString()));
    processProc.stderr.on("data", (d: Buffer) => (processStderr += d.toString()));
    
    processProc.on("close", (code) => {
      if (processStderr) console.error(`[process-chapters] ${processStderr}`);
      
      if (code !== 0) {
        console.error(`[process-chapters] exited ${code}`);
        store.update(bookId, { status: "parsed" });
        return;
      }
      
      try {
        const result = JSON.parse(processStdout) as {
          title: string;
          segments: SegmentData[];
          coverPath?: string;
        };
        
        // Handle cover path with priority:
        // 1. Use coverPath from result if it exists and file is valid
        // 2. Check standard location: public/covers/{bookId}.jpg
        // 3. Fallback: check chapters/covers/ directory
        let coverPath: string | undefined;
        
        if (result.coverPath) {
          // If result has coverPath, verify the file exists
          const resultCoverFile = path.join(root, "public/covers", `${bookId}.jpg`);
          if (fs.existsSync(resultCoverFile)) {
            // Standard cover path
            coverPath = `/covers/${bookId}.jpg`;
            console.log(`[process-chapters] Using standard cover: ${resultCoverFile}`);
          } else if (result.coverPath.startsWith('../../')) {
            // Chapters directory cover (relative path from public/)
            // Convert to proper path: ../../uploads/{bookId}/chapters/covers/{bookId}-chapter-01.jpg
            // This path is already correct, just verify file exists
            const chaptersCover = path.join(root, "uploads", bookId, "chapters", "covers", `${bookId}-chapter-01.jpg`);
            if (fs.existsSync(chaptersCover)) {
              coverPath = result.coverPath;
              console.log(`[process-chapters] Using chapters cover: ${chaptersCover}`);
            }
          }
        }
        
        // Final fallback: check if standard cover exists
        if (!coverPath) {
          const standardCover = path.join(root, "public/covers", `${bookId}.jpg`);
          if (fs.existsSync(standardCover)) {
            coverPath = `/covers/${bookId}.jpg`;
            console.log(`[process-chapters] Using fallback standard cover: ${standardCover}`);
          }
        }
        
        store.update(bookId, {
          title: result.title,
          status: "parsed",
          segments: result.segments,
          coverPath,
        });
        console.log(`[preprocess] Status updated to: parsed`);
        console.log(`[process-chapters] Book "${result.title}" parsed: ${result.segments.length} segments`);
      } catch (e) {
        console.error("[process-chapters] Failed to parse output:", e);
        store.update(bookId, { status: "parsed" });
      }
    });
  });
}

/**
 * Parse book directly using extract-pdf.py (fallback or when preprocess is disabled)
 */
function parseBookDirect(bookId: string, pdfPath: string): void {
  const root = process.cwd();
  const coverDir = path.join(root, "public/covers");
  const scriptPath = path.join(root, "scripts/extract-pdf.py");
  const useLlm =
    process.env.EXTRACT_USE_LLM === "1" || process.env.EXTRACT_USE_LLM === "true";
  // Hybrid: rule-based PDF parse first; LLM only normalizes 第 X 章 display titles (one short call per chapter when triggered).
  // EXTRACT_LLM_REFINE_TITLES=all refines every 第 X 章 title; 1|true uses heuristics only. Requires DASHSCOPE_API_KEY.
  const refineTitles = process.env.EXTRACT_LLM_REFINE_TITLES ?? "";
  const args = [scriptPath, "--pdf-path", pdfPath, "--book-id", bookId, "--cover-dir", coverDir];
  if (useLlm) args.push("--use-llm");
  if (!useLlm && refineTitles.toLowerCase() === "all") args.push("--refine-all-chapter-titles-llm");
  else if (!useLlm && ["1", "true", "yes", "on", "heuristic"].includes(refineTitles.toLowerCase())) {
    args.push("--refine-titles-llm");
  }

  const proc = spawn("python3.11", args, {
    cwd: root,
  });

  console.log(`[extract-pdf] Starting extraction for book: ${bookId}`);
  console.log(`[extract-pdf] Status updated to: parsing`);

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  proc.on("close", (code) => {
    if (stderr) console.error(`[extract-pdf] ${stderr}`);

    if (code !== 0) {
      console.error(`[extract-pdf] exited ${code}`);
      store.update(bookId, { status: "parsed" });
      return;
    }

    try {
      const result = JSON.parse(stdout) as { title: string; segments: SegmentData[]; coverPath?: string };
      
      // Handle cover path with priority:
      // 1. Use coverPath from result if it exists
      // 2. Check standard location: public/covers/{bookId}.jpg
      let coverPath: string | undefined;
      
      if (result.coverPath) {
        // Verify the cover file exists
        const coverFile = path.join(root, "public/covers", `${bookId}.jpg`);
        if (fs.existsSync(coverFile)) {
          coverPath = `/covers/${bookId}.jpg`;
          console.log(`[extract-pdf] Using cover: ${coverFile}`);
        }
      }
      
      // Fallback: check if standard cover exists
      if (!coverPath) {
        const standardCover = path.join(root, "public/covers", `${bookId}.jpg`);
        if (fs.existsSync(standardCover)) {
          coverPath = `/covers/${bookId}.jpg`;
          console.log(`[extract-pdf] Using fallback cover: ${standardCover}`);
        }
      }
      
      store.update(bookId, {
        title: result.title,
        status: "parsed",
        segments: result.segments,
        coverPath,
      });
      console.log(`[extract-pdf] Status updated to: parsed`);
      console.log(`[extract-pdf] Book "${result.title}" parsed: ${result.segments.length} segments`);
    } catch (e) {
      console.error("[extract-pdf] Failed to parse output:", e);
      store.update(bookId, { status: "parsed" });
    }
  });
}
