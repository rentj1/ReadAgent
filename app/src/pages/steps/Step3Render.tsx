import { useState, useRef } from "react";
import { Play, Download, Package, Loader2, CheckCircle2, AlertCircle, ChevronRight, Trash2 } from "lucide-react";
import type { BookData, SegmentData, TtsStatus, RenderStatus } from "../../utils/api";
import { api } from "../../utils/api";
import { StatusBadge } from "../../components/StatusBadge";

const CHARS_PER_MINUTE = 220;
function estimateDuration(paragraphs: { text: string }[]): string {
  const chars = paragraphs.reduce((sum, p) => sum + p.text.length, 0);
  const minutes = chars / CHARS_PER_MINUTE;
  return `${minutes.toFixed(1)}min`;
}

type SegState = {
  ttsProgress: { done: number; total: number };
  renderProgress: number;
  ttsStatus: TtsStatus;
  renderStatus: RenderStatus;
  error?: string;
  outputPath?: string;
};

type Props = {
  book: BookData;
  onBookUpdate: (book: BookData) => void;
};

export function Step3Render({ book, onBookUpdate }: Props) {
  const [states, setStates] = useState<Record<string, SegState>>(() => {
    const m: Record<string, SegState> = {};
    for (const seg of book.segments) {
      m[seg.id] = {
        ttsProgress: { done: 0, total: seg.paragraphs.length + 1 },
        renderProgress: seg.renderProgress ?? 0,
        ttsStatus: seg.ttsStatus,
        renderStatus: seg.renderStatus,
        outputPath: seg.outputPath,
      };
    }
    return m;
  });

  const abortRefs = useRef<Record<string, AbortController>>({});

  const updateState = (segId: string, patch: Partial<SegState>) =>
    setStates((prev) => ({ ...prev, [segId]: { ...prev[segId], ...patch } }));

  const startTts = (segId: string) => {
    updateState(segId, { ttsStatus: "generating", error: undefined });
    const ctrl = api.streamTts(
      book.id,
      segId,
      (done, total) => updateState(segId, { ttsProgress: { done, total } }),
      (success) => updateState(segId, { ttsStatus: success ? "done" : "error" }),
      (msg) => updateState(segId, { ttsStatus: "error", error: msg })
    );
    abortRefs.current[`tts-${segId}`] = ctrl;
  };

  const startRender = (segId: string) => {
    updateState(segId, { renderStatus: "rendering", renderProgress: 0, error: undefined });
    const ctrl = api.streamRender(
      book.id,
      segId,
      (pct) => updateState(segId, { renderProgress: pct }),
      (outputPath) => updateState(segId, { renderStatus: "done", renderProgress: 100, outputPath }),
      (msg) => updateState(segId, { renderStatus: "error", error: msg })
    );
    abortRefs.current[`render-${segId}`] = ctrl;
  };

  const deleteTts = async (segId: string) => {
    if (!confirm("确定删除该片段的所有配音文件？相关视频也将重置为待处理。")) return;
    try {
      const updatedBook = await api.deleteTts(book.id, segId);
      onBookUpdate(updatedBook);
      const seg = updatedBook.segments.find((s) => s.id === segId);
      if (seg) {
        updateState(segId, {
          ttsStatus: "pending",
          ttsProgress: { done: 0, total: seg.paragraphs.length + 1 },
          renderStatus: "pending",
          renderProgress: 0,
          outputPath: undefined,
          error: undefined,
        });
      }
    } catch (e) {
      console.error("[deleteTts]", e);
    }
  };

  const startAll = async () => {
    for (const seg of book.segments) {
      const s = states[seg.id];
      if (s.ttsStatus !== "done") startTts(seg.id);
    }
  };

  const renderAll = () => {
    for (const seg of book.segments) {
      const s = states[seg.id];
      if (s.ttsStatus === "done" && s.renderStatus !== "done" && s.renderStatus !== "rendering") {
        startRender(seg.id);
      }
    }
  };

  const allTtsDone = book.segments.every((s) => states[s.id]?.ttsStatus === "done");
  const allDone = book.segments.every((s) => states[s.id]?.renderStatus === "done");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-parchment font-serif text-2xl">渲染仪表盘</h2>
            <p className="text-parchment-dim font-sans text-sm mt-1">
              共 {book.segments.length} 个片段
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!allTtsDone && (
              <button onClick={startAll} className="btn-ghost flex items-center gap-2 text-sm">
                <Play size={14} />
                全部生成配音
              </button>
            )}
            {allTtsDone && !allDone && (
              <button onClick={renderAll} className="btn-ghost flex items-center gap-2 text-sm">
                <Play size={14} />
                全部开始渲染
              </button>
            )}
            {allDone && (
              <button
                onClick={() => api.downloadAll(book.id)}
                className="btn-gold flex items-center gap-2 text-sm"
              >
                <Package size={14} />
                打包 ZIP 下载
              </button>
            )}
          </div>
        </div>

        {/* Segment cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {book.segments.map((seg) => (
            <SegmentCard
              key={seg.id}
              seg={seg}
              state={states[seg.id]}
              onTts={() => startTts(seg.id)}
              onRender={() => startRender(seg.id)}
              onDownload={() => api.downloadSegment(book.id, seg.id)}
              onDeleteTts={() => deleteTts(seg.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SegmentCard({
  seg,
  state,
  onTts,
  onRender,
  onDownload,
  onDeleteTts,
}: {
  seg: SegmentData;
  state: SegState;
  onTts: () => void;
  onRender: () => void;
  onDownload: () => void;
  onDeleteTts: () => void;
}) {
  const renderDone = state.renderStatus === "done";

  return (
    <div
      className={`card p-5 flex flex-col gap-4 transition-all duration-300 animate-slide-up
        ${renderDone ? "border-gold/30 shadow-[0_4px_24px_rgba(201,169,110,0.1)]" : ""}
      `}
      style={{ perspective: "1000px" }}
    >
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-gold text-xs font-sans">{seg.id}</span>
          {renderDone ? (
            <CheckCircle2 size={14} className="text-emerald-400" />
          ) : state.renderStatus === "error" || state.ttsStatus === "error" ? (
            <AlertCircle size={14} className="text-red-400" />
          ) : null}
        </div>
        <h4 className="text-parchment font-serif text-sm leading-snug line-clamp-2">{seg.title}</h4>
        <p className="text-parchment-dim text-xs font-sans mt-1">
          {seg.paragraphs.length} 段 · {seg.paragraphs.reduce((s, p) => s + p.text.length, 0)} 字 · ~{estimateDuration(seg.paragraphs)}
        </p>
      </div>

      {/* TTS section */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-parchment-dim text-xs font-sans">配音生成</span>
          <StatusBadge status={state.ttsStatus} />
        </div>
        {state.ttsStatus === "generating" && (
          <ProgressBar value={state.ttsProgress.done} max={state.ttsProgress.total} color="amber" />
        )}
        {state.ttsStatus === "done" && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-emerald-900/40">
              <div className="h-full w-full rounded-full bg-emerald-500" />
            </div>
            <button
              onClick={onDeleteTts}
              title="删除配音文件"
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded
                         text-parchment-dim hover:text-red-400 hover:bg-red-900/30 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
        {(state.ttsStatus === "pending" || state.ttsStatus === "error") && (
          <button
            onClick={onTts}
            disabled={state.ttsStatus === "generating"}
            className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 mt-1"
          >
            <Play size={10} />
            {state.ttsStatus === "error" ? "重试配音" : "生成配音"}
          </button>
        )}
      </div>

      {/* Render section */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-parchment-dim text-xs font-sans">视频渲染</span>
          <StatusBadge status={state.renderStatus} />
        </div>
        {state.renderStatus === "rendering" && (
          <ProgressBar value={state.renderProgress} max={100} color="violet" />
        )}
        {renderDone ? (
          <button
            onClick={onDownload}
            className="btn-gold text-xs py-1.5 px-3 flex items-center gap-1.5 mt-1 w-full justify-center"
          >
            <Download size={10} />
            下载视频
          </button>
        ) : state.ttsStatus === "done" && state.renderStatus !== "rendering" ? (
          <button
            onClick={onRender}
            className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 mt-1"
          >
            {state.renderStatus === "rendering" ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <ChevronRight size={10} />
            )}
            {state.renderStatus === "error" ? "重试渲染" : "开始渲染"}
          </button>
        ) : null}
      </div>

      {state.error && (
        <p className="text-red-400 text-xs font-sans leading-relaxed">{state.error}</p>
      )}
    </div>
  );
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: "amber" | "violet";
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const colors = {
    amber: "bg-amber-500",
    violet: "bg-violet-500",
  };
  return (
    <div className="relative h-1.5 rounded-full bg-ink-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${colors[color]}`}
        style={{ width: `${pct}%` }}
      />
      <span className="absolute right-0 -top-4 text-xs font-sans text-parchment-dim">{pct}%</span>
    </div>
  );
}
