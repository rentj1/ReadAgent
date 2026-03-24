import fs from "fs";
import path from "path";
import type { BookData, SegmentData } from "./types.js";

const DATA_FILE = path.join(process.cwd(), "data", "books.json");
let books: Map<string, BookData> = new Map();

export function initStore(): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as BookData[];
      books = new Map(raw.map((b) => [b.id, { title: "未命名", ...b }]));
      console.log(`[store] ${books.size} books loaded`);
    } catch {
      console.warn("[store] Failed to load books.json, starting fresh");
    }
  }
}

function flush(): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify([...books.values()], null, 2), "utf-8");
}

export const store = {
  getAll(): BookData[] {
    return [...books.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  get(id: string): BookData | undefined {
    return books.get(id);
  },

  save(book: BookData): void {
    books.set(book.id, book);
    flush();
  },

  update(id: string, patch: Partial<Omit<BookData, "id">>): BookData | null {
    const book = books.get(id);
    if (!book) return null;
    const updated = { ...book, ...patch };
    books.set(id, updated);
    flush();
    return updated;
  },

  updateSegment(bookId: string, segId: string, patch: Partial<SegmentData>): BookData | null {
    const book = books.get(bookId);
    if (!book) return null;
    const segments = book.segments.map((s) => (s.id === segId ? { ...s, ...patch } : s));
    const updated = { ...book, segments };
    books.set(bookId, updated);
    flush();
    return updated;
  },

  delete(id: string): boolean {
    const existed = books.has(id);
    books.delete(id);
    if (existed) flush();
    return existed;
  },
};
