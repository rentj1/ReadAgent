import { useState, useEffect, useRef } from "react";
import { Pencil } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

export function EditableSegmentTitle({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full bg-transparent border-b border-gold/50 text-parchment font-serif text-base outline-none pb-0.5 focus:border-gold"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="group flex items-center gap-2 text-left"
      title="点击编辑片段标题"
    >
      <h3 className="text-parchment font-serif text-base group-hover:text-gold/90 transition-colors">{value}</h3>
      <Pencil size={12} className="text-parchment-dim opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
    </button>
  );
}
