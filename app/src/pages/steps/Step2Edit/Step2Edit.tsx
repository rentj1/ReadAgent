import { useState, useEffect } from "react";
import { ChevronRight, FileText, Clock, Hash, Play, AlignLeft, Loader2, AlertTriangle } from "lucide-react";
import type { BookData, SegmentData } from "../../../utils/api";
import { api } from "../../../utils/api";
import { StatusBadge } from "../../../components/StatusBadge";
import { EditableBookTitle } from "./EditableBookTitle";
import { EditableSegmentTitle } from "./EditableSegmentTitle";
import { SegmentListItem } from "./SegmentListItem";
import { RemotionPlayerPreview } from "./RemotionPlayerPreview";
import { EditableSegmentPreview } from "./EditableSegmentPreview";
import { estimateDuration } from "./estimateDuration";

type Props = {
  book: BookData;
  onBookUpdate: (book: BookData) => void;
  onContinue: () => void;
};

export function Step2Edit({ book, onBookUpdate, onContinue }: Props) {
  const [localTitle, setLocalTitle] = useState(book.title);
  const [localSegments, setLocalSegments] = useState<SegmentData[]>(book.segments);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedSegIdx, setSelectedSegIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"text" | "player">("text");

  // Sync segments when book.segments changes from empty to non-empty
  useEffect(() => {
    if (book.segments.length > 0 && localSegments.length === 0) {
      setLocalSegments(book.segments);
    }
  }, [book.segments]);

  // Sync title on initial load
  useEffect(() => {
    if (book.title && localSegments.length === 0) {
      setLocalTitle(book.title);
    }
  }, [book.title]);

  const selectedSeg = localSegments[selectedSegIdx];

  const updateTitle = (title: string) => {
    setLocalTitle(title);
    setIsDirty(true);
  };

  const updateSegment = (segIdx: number, updated: SegmentData) => {
    setLocalSegments((prev) => prev.map((s, i) => (i === segIdx ? updated : s)));
    setIsDirty(true);
    setPreviewMode("text");
  };

  const handleSaveAndContinue = async () => {
    setSaving(true);
    try {
      const updated = await api.updateBook(book.id, { title: localTitle, segments: localSegments });
      onBookUpdate(updated);
      setIsDirty(false);
      onContinue();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Show different messages based on book status
  if (!localSegments.length) {
    const isProcessing = book.status === "preprocessing" || book.status === "processing_chapters" || book.status === "parsing";
    const isSyncing = book.status === "parsed" || book.status === "ready";
    
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          {isProcessing || isSyncing ? (
            <>
              <Loader2 size={48} className="animate-spin text-gold mx-auto mb-4" />
              <div className="text-parchment font-sans text-base mb-2">
                {book.status === "parsing" 
                  ? "正在解析 PDF 内容..."
                  : book.status === "preprocessing"
                  ? "正在分割 PDF 为章节..."
                  : book.status === "processing_chapters"
                  ? "正在处理章节内容..."
                  : "正在加载章节数据..."}
              </div>
              <div className="text-parchment-dim font-sans text-xs">
                这可能需要几分钟时间，请耐心等待
              </div>
            </>
          ) : (
            <div className="text-parchment-dim font-sans text-sm">暂无分段数据，请先完成 PDF 解析</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-96 flex-shrink-0 border-r border-ink-600/50 flex flex-col">
        <div className="px-5 py-4 border-b border-ink-600/30 flex flex-col gap-2">
          <EditableBookTitle value={localTitle} onChange={updateTitle} />
          <p className="text-parchment-dim text-xs font-sans">
            共 {localSegments.length} 个片段 · 点击选择编辑
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {localSegments.map((seg, i) => (
            <SegmentListItem
              key={seg.id}
              seg={seg}
              selected={i === selectedSegIdx}
              index={i}
              onClick={() => setSelectedSegIdx(i)}
            />
          ))}
        </div>

        <div className="p-4 border-t border-ink-600/30">
          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="btn-gold w-full flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                保存中…
              </>
            ) : (
              <>
                {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                {isDirty ? "保存修改并继续" : "保存并继续"}
                <ChevronRight size={16} />
              </>
            )}
          </button>
          {isDirty && (
            <p className="text-amber-400/70 text-xs font-sans text-center mt-2">有未保存的修改</p>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-ink-600/30 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <EditableSegmentTitle
              value={selectedSeg.title}
              onChange={(title) => updateSegment(selectedSegIdx, { ...selectedSeg, title })}
            />
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1 text-xs font-sans text-parchment-dim">
                <Hash size={10} />
                {selectedSeg.paragraphs.length} 段落
              </span>
              <span className="flex items-center gap-1 text-xs font-sans text-parchment-dim">
                <FileText size={10} />
                {selectedSeg.paragraphs.reduce((s, p) => s + p.text.length, 0)} 字
              </span>
              <span className="flex items-center gap-1 text-xs font-sans text-parchment-dim">
                <Clock size={10} />
                预估 {estimateDuration(selectedSeg.paragraphs)}
              </span>
              <StatusBadge status={selectedSeg.ttsStatus} />
            </div>
          </div>

          <div className="flex items-center gap-1 bg-ink-800 rounded-lg p-1 border border-ink-600/50 flex-shrink-0">
            <button
              onClick={() => setPreviewMode("text")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all ${
                previewMode === "text"
                  ? "bg-gold/20 text-gold border border-gold/30"
                  : "text-parchment-dim hover:text-parchment"
              }`}
            >
              <AlignLeft size={12} />
              文字编辑
            </button>
            <button
              onClick={() => setPreviewMode("player")}
              disabled={selectedSeg.ttsStatus !== "done"}
              title={selectedSeg.ttsStatus !== "done" ? "需先生成 TTS 音频" : "播放实际动画"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                previewMode === "player"
                  ? "bg-gold/20 text-gold border border-gold/30"
                  : "text-parchment-dim hover:text-parchment"
              }`}
            >
              <Play size={12} />
              视频预览
            </button>
          </div>
        </div>

        {selectedSeg.ttsStatus === "done" && previewMode === "text" && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg px-4 py-3 bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300/80 text-xs font-sans leading-relaxed">
              该片段已生成 TTS 音频。修改内容后，现有音频将失效，需要在下一步重新生成。
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {previewMode === "text" ? (
            <EditableSegmentPreview
              seg={selectedSeg}
              bookTitle={localTitle}
              onChange={(updated) => updateSegment(selectedSegIdx, updated)}
            />
          ) : (
            <RemotionPlayerPreview seg={selectedSeg} bookTitle={localTitle} coverPath={book.coverPath} />
          )}
        </div>
      </div>
    </div>
  );
}
