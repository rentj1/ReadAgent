export type BookStatus = "importing" | "parsing" | "preprocessing" | "processing_chapters" | "parsed" | "ready";
export type TtsStatus = "pending" | "generating" | "done" | "error";
export type RenderStatus = "pending" | "rendering" | "done" | "error";

export type ParagraphData = {
  id: string;
  text: string;
  sectionTitle?: string;
};

export type SegmentData = {
  id: string;
  title: string;
  paragraphs: ParagraphData[];
  ttsStatus: TtsStatus;
  renderStatus: RenderStatus;
  renderProgress: number;
  outputPath?: string;
};

export type BookData = {
  id: string;
  title: string;
  coverPath?: string;
  pdfPath: string;
  status: BookStatus;
  segments: SegmentData[];
  createdAt: string;
};

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}

async function delJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  // Books
  getBooks: () => get<BookData[]>("/api/books"),
  getBook: (id: string) => get<BookData>(`/api/books/${id}`),
  updateBook: (id: string, data: Partial<BookData>) => put<BookData>(`/api/books/${id}`, data),
  deleteBook: (id: string) => del(`/api/books/${id}`),

  // PDF upload
  uploadPdf: async (file: File): Promise<{ bookId: string; title: string; status: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/pdf/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },
  importExisting: () => post<BookData>("/api/pdf/import-existing"),

  deleteTts: (bookId: string, segId: string) => delJson<BookData>(`/api/tts/${bookId}/${segId}`),

  // SSE helpers — return EventSource
  generateTts: (bookId: string, segId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      fetch(`${BASE}/api/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, segId }),
        signal: ctrl.signal,
      }).then(async (res) => {
        if (!res.ok || !res.body) return reject(new Error("TTS request failed"));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data:"));
          for (const line of lines) {
            try {
              const event = JSON.parse(line.slice(5).trim());
              if (event.type === "done") { resolve(); return; }
              if (event.type === "error") { reject(new Error(event.error)); return; }
            } catch {}
          }
        }
        resolve();
      }).catch(reject);
    });
  },

  // SSE with callbacks
  streamTts: (
    bookId: string,
    segId: string,
    onProgress: (done: number, total: number, paraId: string) => void,
    onDone: (success: boolean) => void,
    onError: (msg: string) => void
  ): AbortController => {
    const ctrl = new AbortController();
    fetch(`${BASE}/api/tts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, segId }),
      signal: ctrl.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) { onError("TTS request failed"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(5).trim());
            if (event.type === "progress") onProgress(event.done, event.total, event.paraId);
            if (event.type === "done") onDone(event.success);
            if (event.type === "error") onError(event.error);
          } catch {}
        }
      }
    }).catch((e) => {
      if (e.name !== "AbortError") onError(String(e));
    });
    return ctrl;
  },

  streamRender: (
    bookId: string,
    segId: string,
    onProgress: (pct: number) => void,
    onDone: (outputPath: string) => void,
    onError: (msg: string) => void
  ): AbortController => {
    const ctrl = new AbortController();
    fetch(`${BASE}/api/render/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, segId }),
      signal: ctrl.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) { onError("Render request failed"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(5).trim());
            if (event.type === "progress") onProgress(event.progress);
            if (event.type === "done") onDone(event.outputPath);
            if (event.type === "error") onError(event.error);
          } catch {}
        }
      }
    }).catch((e) => {
      if (e.name !== "AbortError") onError(String(e));
    });
    return ctrl;
  },

  downloadSegment: (bookId: string, segId: string) => {
    window.location.href = `${BASE}/api/render/download/${bookId}/${segId}`;
  },
  downloadAll: (bookId: string) => {
    window.location.href = `${BASE}/api/render/download/${bookId}`;
  },
};
