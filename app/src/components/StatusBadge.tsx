import type { BookStatus, TtsStatus, RenderStatus } from "../utils/api";

type Status = BookStatus | TtsStatus | RenderStatus;

const config: Record<string, { label: string; classes: string; dot: string }> = {
  importing:  { label: "已导入",  classes: "bg-ink-700 text-parchment-dim border border-ink-600",   dot: "bg-parchment-dim" },
  parsing:    { label: "解析中",  classes: "bg-amber-900/40 text-amber-300 border border-amber-700/40", dot: "bg-amber-400 animate-pulse" },
  parsed:     { label: "待编辑",  classes: "bg-sky-900/40 text-sky-300 border border-sky-700/40",    dot: "bg-sky-400" },
  ready:      { label: "已就绪",  classes: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40", dot: "bg-emerald-400" },
  pending:    { label: "待处理",  classes: "bg-ink-700 text-parchment-dim border border-ink-600",   dot: "bg-parchment-dim" },
  generating: { label: "配音中",  classes: "bg-amber-900/40 text-amber-300 border border-amber-700/40", dot: "bg-amber-400 animate-pulse" },
  rendering:  { label: "渲染中",  classes: "bg-violet-900/40 text-violet-300 border border-violet-700/40", dot: "bg-violet-400 animate-pulse" },
  done:       { label: "已完成",  classes: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40", dot: "bg-emerald-400" },
  error:      { label: "出错了",  classes: "bg-red-900/40 text-red-300 border border-red-700/40",   dot: "bg-red-400" },
};

// Aggregate book status from its segments
function aggregateBookBadge(status: BookStatus): (typeof config)[string] {
  return config[status] ?? config.pending;
}

export function StatusBadge({ status }: { status: Status }) {
  const c = config[status] ?? config.pending;
  return (
    <span className={`badge ${c.classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
