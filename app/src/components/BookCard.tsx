import { BookOpen, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { BookData } from "../utils/api";
import { StatusBadge } from "./StatusBadge";

type Props = {
  book: BookData;
  onDelete: (id: string) => void;
};

export function BookCard({ book, onDelete }: Props) {
  const navigate = useNavigate();

  const completedSegments = book.segments.filter((s) => s.renderStatus === "done").length;
  const totalSegments = book.segments.length;

  return (
    <div
      onClick={() => navigate(`/book/${book.id}`)}
      className="group relative card cursor-pointer hover:border-gold/40 transition-all duration-200
                 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(201,169,110,0.12)] animate-slide-up"
      style={{ width: 200 }}
    >
      {/* Cover */}
      <div className="relative overflow-hidden rounded-t-xl bg-ink-700" style={{ height: 260 }}>
        {book.coverPath ? (
          <img
            src={book.coverPath}
            alt={book.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={48} className="text-ink-600" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(book.id); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-ink-950/80 border border-ink-600
                     flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity
                     hover:border-red-500/60 hover:text-red-400 text-parchment-dim"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="mb-2">
          <StatusBadge status={book.status} />
        </div>
        <h3 className="text-parchment text-sm font-serif leading-snug line-clamp-2 mb-1">
          {book.title}
        </h3>
        {totalSegments > 0 && (
          <p className="text-parchment-dim text-xs font-sans">
            {completedSegments}/{totalSegments} 片段已完成
          </p>
        )}
      </div>

      {/* Progress bar at bottom */}
      {totalSegments > 0 && (
        <div className="h-0.5 bg-ink-700 rounded-b-xl overflow-hidden">
          <div
            className="h-full bg-gold transition-all duration-500"
            style={{ width: `${(completedSegments / totalSegments) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
