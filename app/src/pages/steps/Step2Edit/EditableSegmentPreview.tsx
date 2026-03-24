import type { SegmentData, ParagraphData } from "../../../utils/api";
import { EditableParagraphCard } from "./EditableParagraphCard";

type Props = {
  seg: SegmentData;
  bookTitle: string;
  onChange: (updated: SegmentData) => void;
};

export function EditableSegmentPreview({ seg, bookTitle, onChange }: Props) {
  const updateParagraph = (paraIdx: number, updated: ParagraphData) => {
    const newParagraphs = seg.paragraphs.map((p, i) => (i === paraIdx ? updated : p));
    onChange({ ...seg, paragraphs: newParagraphs });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="w-full rounded-2xl mb-4 flex flex-col items-center justify-center py-12 px-8 text-center"
        style={{
          background: "linear-gradient(160deg, #1a0e05 0%, #2d1a08 50%, #1a0e05 100%)",
          border: "1px solid rgba(201,169,110,0.2)",
        }}
      >
        <div className="w-24 h-0.5 bg-gold mb-5 opacity-70" />
        <p className="text-gold text-sm font-serif tracking-widest mb-3 opacity-80">《{bookTitle}》</p>
        <h2 className="text-parchment font-serif text-2xl leading-relaxed">{seg.title}</h2>
        <div className="w-16 h-px bg-gold mt-5 opacity-50" />
        <p className="text-parchment-dim text-xs font-sans mt-3">封面卡片预览</p>
      </div>

      <div className="flex flex-col gap-3">
        {seg.paragraphs.map((para, i) => (
          <EditableParagraphCard
            key={para.id}
            para={para}
            index={i}
            onChange={(updated) => updateParagraph(i, updated)}
          />
        ))}
      </div>
    </div>
  );
}
