import { useState, useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import type { ParagraphData } from "../../../utils/api";

type Props = {
  para: ParagraphData;
  index: number;
  onChange: (updated: ParagraphData) => void;
};

export function EditableParagraphCard({ para, index, onChange }: Props) {
  const [editingText, setEditingText] = useState(false);
  const [editingSection, setEditingSection] = useState(false);
  const [textDraft, setTextDraft] = useState(para.text);
  const [sectionDraft, setSectionDraft] = useState(para.sectionTitle ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTextDraft(para.text);
    setEditingText(false);
  }, [para.text]);

  useEffect(() => {
    setSectionDraft(para.sectionTitle ?? "");
    setEditingSection(false);
  }, [para.sectionTitle]);

  useEffect(() => {
    if (editingText && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editingText, textDraft]);

  const commitText = () => {
    const trimmed = textDraft.trim();
    if (trimmed && trimmed !== para.text) onChange({ ...para, text: trimmed });
    else setTextDraft(para.text);
    setEditingText(false);
  };

  const commitSection = () => {
    const trimmed = sectionDraft.trim();
    const current = para.sectionTitle ?? "";
    if (trimmed !== current) {
      onChange({ ...para, sectionTitle: trimmed || undefined });
    }
    setEditingSection(false);
  };

  return (
    <div
      className="group rounded-xl p-5"
      style={{
        background: "linear-gradient(160deg, #1a0e05 0%, #2d1a08 50%, #1a0e05 100%)",
        border: "1px solid rgba(201,169,110,0.15)",
      }}
    >
      {para.sectionTitle || editingSection ? (
        editingSection ? (
          <input
            autoFocus
            value={sectionDraft}
            onChange={(e) => setSectionDraft(e.target.value)}
            onBlur={commitSection}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSection();
              if (e.key === "Escape") {
                setSectionDraft(para.sectionTitle ?? "");
                setEditingSection(false);
              }
            }}
            placeholder="小节标题（留空则删除）"
            className="w-full bg-transparent border-b border-gold/40 text-gold text-xs font-sans tracking-widest mb-3 outline-none pb-0.5 focus:border-gold placeholder:text-gold/30"
          />
        ) : (
          <button
            onClick={() => {
              setSectionDraft(para.sectionTitle ?? "");
              setEditingSection(true);
            }}
            className="group/sec flex items-center gap-1.5 mb-3"
            title="点击编辑小节标题"
          >
            <p className="text-gold text-xs font-sans tracking-widest opacity-80 group-hover/sec:opacity-100 transition-opacity">
              {para.sectionTitle}
            </p>
            <Pencil size={10} className="text-gold opacity-0 group-hover/sec:opacity-50 transition-opacity" />
          </button>
        )
      ) : (
        <button
          onClick={() => {
            setSectionDraft("");
            setEditingSection(true);
          }}
          className="flex items-center gap-1 mb-3 opacity-0 group-hover:opacity-100 transition-opacity"
          title="添加小节标题"
        >
          <span className="text-gold/40 text-xs font-sans">+ 添加小节标题</span>
        </button>
      )}

      {editingText ? (
        <textarea
          ref={textareaRef}
          value={textDraft}
          autoFocus
          onChange={(e) => {
            setTextDraft(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTextDraft(para.text);
              setEditingText(false);
            }
          }}
          className="w-full bg-transparent border border-gold/30 rounded-lg text-parchment font-serif text-sm leading-relaxed outline-none resize-none p-2 focus:border-gold/60 min-h-[80px]"
        />
      ) : (
        <button
          onClick={() => {
            setTextDraft(para.text);
            setEditingText(true);
          }}
          className="w-full text-left group/text"
          title="点击编辑段落文字"
        >
          <p className="text-parchment font-serif text-sm leading-relaxed group-hover/text:text-parchment/80 transition-colors">
            {para.text}
          </p>
          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover/text:opacity-100 transition-opacity">
            <Pencil size={10} className="text-parchment-dim" />
            <span className="text-parchment-dim text-xs font-sans">点击编辑</span>
          </div>
        </button>
      )}

      <p className="text-parchment-dim text-xs font-sans mt-2 opacity-50">
        段落 {index + 1} · {para.text.length} 字
      </p>
    </div>
  );
}
