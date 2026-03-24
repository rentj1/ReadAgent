import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { initStore } from "./store.js";
import { pdfRouter } from "./routes/pdf.js";
import { ttsRouter } from "./routes/tts.js";
import { renderRouter } from "./routes/render.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const ROOT = process.cwd(); // Must be run from book-reader/

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// Static assets — serve entire public/ at root, plus outputs
app.use(express.static(path.join(ROOT, "public")));
app.use("/outputs", express.static(path.join(ROOT, "outputs")));

// Ensure required directories exist
for (const dir of ["uploads", "outputs", "data", "public/audio", "public/covers"]) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
}

initStore();

app.use("/api", pdfRouter);
app.use("/api", ttsRouter);
app.use("/api", renderRouter);

app.listen(PORT, () => {
  console.log(`\nBook Reader Server Lite → http://localhost:${PORT}`);
  console.log(`Root: ${ROOT}\n`);
});
