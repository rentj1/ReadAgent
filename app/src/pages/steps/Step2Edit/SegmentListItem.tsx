import type { SegmentData } from "../../../utils/api";
import { StatusBadge } from "../../../components/StatusBadge";
import { estimateDuration } from "./estimateDuration";

type Props = {
  seg: SegmentData;
  selected: boolean;
  index: number;
  onClick: () => void;
};

export function SegmentListItem({ seg, selected, index, onClick }: Props) {
  const chars = seg.paragraphs.reduce((s, p) => s + p.text.length, 0);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
        selected
          ? "bg-gold/10 border-gold/40"
          : "bg-ink-800/50 border-ink-600/50 hover:border-gold/20 hover:bg-ink-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={`text-xs font-sans ${selected ? "text-gold" : "text-parchment-dim"}`}>
          片段 {String(index + 1).padStart(2, "0")}
        </span>
        <StatusBadge status={seg.renderStatus === "done" ? "done" : seg.ttsStatus} />
      </div>
      <p className="text-parchment text-sm font-serif line-clamp-2 leading-snug">{seg.title}</p>
      <div className="flex items-center gap-3 mt-1.5 text-xs font-sans text-parchment-dim">
        <span>{seg.paragraphs.length} 段</span>
        <span>{chars} 字</span>
        <span>~{estimateDuration(seg.paragraphs)}</span>
      </div>
    </button>
  );
}
