import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Player } from "@remotion/player";
import type { SegmentData } from "@/utils/api";
import { BookSegment, calculateMetadata } from "@compositions/BookSegment";
import type { BookSegmentProps } from "@compositions/BookSegment";

type ResolvedMetadata = {
  durationInFrames: number;
  paragraphDurationsFrames: number[];
  titleCardDurationFrames: number;
};

type Props = {
  seg: SegmentData;
  bookTitle: string;
  coverPath?: string;
};

export function RemotionPlayerPreview({ seg, bookTitle, coverPath }: Props) {
  const [metadata, setMetadata] = useState<ResolvedMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setMetadata(null);

    const controller = new AbortController();
    const props: BookSegmentProps = {
      segment: { id: seg.id, title: seg.title, paragraphs: seg.paragraphs },
      paragraphDurationsFrames: [],
      titleCardDurationFrames: 120,
    };

    Promise.resolve(
      calculateMetadata({
        props,
        defaultProps: props,
        abortSignal: controller.signal,
        compositionId: "BookReader",
      })
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const resolved = result.props as BookSegmentProps;
        setMetadata({
          durationInFrames: result.durationInFrames ?? 300,
          paragraphDurationsFrames: resolved.paragraphDurationsFrames,
          titleCardDurationFrames: resolved.titleCardDurationFrames,
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`无法加载音频时长：${msg}`);
        setLoading(false);
      });

    return () => controller.abort();
  }, [seg.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 size={24} className="animate-spin text-gold opacity-60" />
        <p className="text-parchment-dim text-sm font-sans">读取音频时长中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 px-8 text-center">
        <p className="text-red-400 text-sm font-sans">{error}</p>
        <p className="text-parchment-dim text-xs font-sans opacity-60">
          请确认 TTS 文件已生成到 public/audio/{seg.id}/
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-parchment-dim text-xs font-sans">
        {metadata!.durationInFrames} 帧 · {(metadata!.durationInFrames / 30).toFixed(1)}s · 实际 Remotion 渲染预览
      </p>
      <div
        className="relative rounded-3xl overflow-hidden shadow-2xl"
        style={{
          width: 270,
          height: 480,
          border: "2px solid rgba(201,169,110,0.25)",
          boxShadow: "0 0 40px rgba(201,169,110,0.08), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <Player
          component={BookSegment}
          compositionWidth={1080}
          compositionHeight={1920}
          durationInFrames={metadata!.durationInFrames}
          fps={30}
          initialFrame={24}
          inputProps={{
            segment: { id: seg.id, title: seg.title, paragraphs: seg.paragraphs },
            paragraphDurationsFrames: metadata!.paragraphDurationsFrames,
            titleCardDurationFrames: metadata!.titleCardDurationFrames,
            bookTitle,
            coverPath,
          }}
          style={{ width: 270, height: 480 }}
          controls
          loop
        />
      </div>
      {bookTitle && (
        <p className="text-parchment-dim text-xs font-sans opacity-50">书名 · {bookTitle}</p>
      )}
    </div>
  );
}
