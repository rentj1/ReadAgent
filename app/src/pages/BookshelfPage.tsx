import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Import } from "lucide-react";
import { api, type BookData } from "../utils/api";
import { BookCard } from "../components/BookCard";
import { DropZone } from "../components/DropZone";

function BookshelfSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-8 w-36 bg-ink-700/60 rounded-md animate-pulse mb-2" />
          <div className="h-4 w-24 bg-ink-700/40 rounded animate-pulse" />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="card overflow-hidden border-ink-600/50"
            style={{ width: 200 }}
          >
            <div
              className="rounded-t-xl bg-ink-700/50 animate-pulse"
              style={{ height: 260 }}
            />
            <div className="p-3 space-y-2">
              <div className="h-5 w-14 bg-ink-700/50 rounded animate-pulse" />
              <div className="h-4 w-full bg-ink-700/40 rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-ink-700/40 rounded animate-pulse" />
            </div>
            <div className="h-0.5 bg-ink-700/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BookshelfPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBooks()
      .then(setBooks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { bookId } = await api.uploadPdf(file);
      navigate(`/book/${bookId}`);
    } catch (e) {
      setError(String(e));
      setUploading(false);
    }
  };

  const handleImportExisting = async () => {
    try {
      const book = await api.importExisting();
      setBooks((prev) => [book, ...prev.filter((b) => b.id !== book.id)]);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这本书及所有关联文件？")) return;
    await api.deleteBook(id).catch(console.error);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  const hasBooks = books.length > 0;
  const showShelfActions = !loading && hasBooks;

  return (
    <div className="min-h-screen bg-ink-gradient relative z-10">
      {/* Header */}
      <header className="border-b border-ink-600/50 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
            <BookOpen size={18} className="text-gold" />
          </div>
          <div>
            <h1 className="text-parchment font-serif text-lg tracking-wider">书影</h1>
            <p className="text-parchment-dim text-xs font-sans">Book Video Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {showShelfActions && (
            <>
              <button
                onClick={handleImportExisting}
                className="btn-ghost flex items-center gap-2 text-sm"
              >
                <Import size={14} />
                导入示例（第五章）
              </button>
              <DropZone onFile={handleFile} loading={uploading} compact />
            </>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-sm font-sans">
            {error}
          </div>
        )}

        {loading ? (
          <BookshelfSkeleton />
        ) : !hasBooks ? (
          /* Empty state — full-page upload guide */
          <div className="max-w-lg mx-auto animate-fade-in">
            <div className="text-center mb-10">
              {/* Decorative title */}
              <div className="inline-block mb-6">
                <div className="w-16 h-0.5 bg-gold mx-auto mb-4" />
                <h2 className="text-4xl font-serif text-parchment tracking-wider mb-3">书影</h2>
                <p className="text-parchment-dim font-sans text-sm">将书籍变成有声读书视频</p>
                <div className="w-16 h-0.5 bg-gold mx-auto mt-4" />
              </div>

              <div className="grid grid-cols-3 gap-4 mb-10 text-xs font-sans text-parchment-dim">
                {[
                  ["01", "上传 PDF", "自动提取章节结构"],
                  ["02", "配音生成", "AI 朗读 · 多种音色"],
                  ["03", "视频输出", "竖屏 · 即开即播"],
                ].map(([num, title, desc]) => (
                  <div key={num} className="card p-3 text-center">
                    <div className="text-gold font-serif text-lg mb-1">{num}</div>
                    <div className="text-parchment text-sm mb-0.5">{title}</div>
                    <div className="text-parchment-dim text-xs">{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <DropZone onFile={handleFile} loading={uploading} />

            <div className="mt-6 text-center">
              <span className="text-parchment-dim text-xs font-sans">或</span>
              <button
                onClick={handleImportExisting}
                className="ml-2 text-gold text-sm font-sans hover:text-gold-light underline underline-offset-2"
              >
                使用示例书籍（小而美 · 第五章）
              </button>
            </div>
          </div>
        ) : (
          /* Bookshelf grid */
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-parchment font-serif text-2xl tracking-wider">我的书架</h2>
                <p className="text-parchment-dim text-sm font-sans mt-1">{books.length} 本书籍</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              {books.map((book) => (
                <BookCard key={book.id} book={book} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Decorative elements */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-ink-950 to-transparent pointer-events-none" />
    </div>
  );
}
