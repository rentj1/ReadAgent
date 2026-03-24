import { useEffect } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import type { BookData } from "../../utils/api";

type Props = {
  book: BookData;
  onParsed: (updated: BookData) => void;
};

export function Step1Parse({ book, onParsed }: Props) {
  useEffect(() => {
    if (book.status !== "parsing" && book.status !== "importing") {
      onParsed(book);
    }
  }, [book.status]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-fade-in">
      <div className="relative">
        <div className="w-24 h-24 rounded-2xl bg-ink-800 border border-ink-600 flex items-center justify-center">
          <BookOpen size={40} className="text-gold" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-900/60 border border-amber-600 flex items-center justify-center">
          <Loader2 size={14} className="text-amber-300 animate-spin" />
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-parchment font-serif text-2xl mb-2">正在解析书籍</h2>
        <p className="text-parchment-dim font-sans text-sm max-w-sm">
          正在提取 PDF 文本，识别章节结构，自动分割视频片段…
        </p>
      </div>

      <div className="flex flex-col gap-2 w-72">
        {["提取 PDF 文本", "识别章节边界", "分割视频片段", "提取封面图片"].map((step, i) => (
          <div key={i} className="flex items-center gap-3 text-sm font-sans">
            <div className="w-5 h-5 rounded-full border border-amber-600 flex items-center justify-center flex-shrink-0">
              <Loader2 size={10} className="text-amber-300 animate-spin" />
            </div>
            <span className="text-parchment-dim">{step}</span>
          </div>
        ))}
      </div>

      <p className="text-parchment-dim text-xs font-sans">预计需要 30 秒 ~ 2 分钟</p>
    </div>
  );
}
