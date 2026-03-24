import { useRef, useState } from "react";
import { Upload, BookOpen } from "lucide-react";

type Props = {
  onFile: (file: File) => void;
  loading?: boolean;
  compact?: boolean;
};

export function DropZone({ onFile, loading = false, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf" || file?.name.endsWith(".pdf")) {
      onFile(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  if (compact) {
    return (
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="btn-ghost flex items-center gap-2 text-sm"
      >
        <Upload size={16} />
        上传新书
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleChange} />
      </button>
    );
  }

  return (
    <div
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-6 min-h-[320px]
        border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200
        ${dragging
          ? "border-gold bg-gold/10 scale-[1.01]"
          : "border-ink-600 hover:border-gold/60 hover:bg-gold/5"
        }
        ${loading ? "opacity-60 pointer-events-none" : ""}
      `}
    >
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleChange} />

      <div className="w-20 h-20 rounded-2xl bg-ink-800 border border-ink-600 flex items-center justify-center">
        {loading ? (
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        ) : (
          <BookOpen size={36} className="text-gold" />
        )}
      </div>

      <div className="text-center">
        <p className="text-parchment text-lg font-serif mb-1">
          {loading ? "上传中…" : "拖拽 PDF 到此处"}
        </p>
        <p className="text-parchment-dim text-sm font-sans">
          {loading ? "请稍候" : "或点击选择文件 · 支持书籍 PDF"}
        </p>
      </div>

      {!loading && (
        <div className="flex items-center gap-2 text-parchment-dim text-xs font-sans">
          <Upload size={12} />
          <span>最大 100 MB</span>
        </div>
      )}
    </div>
  );
}
