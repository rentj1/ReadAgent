import { Check } from "lucide-react";

type Step = { label: string; hint: string };

const STEPS: Step[] = [
  { label: "解析内容", hint: "~30s" },
  { label: "编辑分段", hint: "手动操作" },
  { label: "生成视频", hint: "~20min/段" },
];

type Props = {
  current: number; // 0-indexed
  onChange?: (step: number) => void;
};

export function Stepper({ current, onChange }: Props) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <button
              onClick={() => done && onChange?.(i)}
              disabled={!done}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg transition-colors duration-150
                ${active ? "bg-gold/15 border border-gold/40" : ""}
                ${done ? "cursor-pointer hover:bg-gold/10" : "cursor-default"}
              `}
            >
              {/* Circle */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-sans font-medium
                  ${done ? "bg-gold text-ink-950" : active ? "border-2 border-gold text-gold" : "border-2 border-ink-600 text-parchment-dim"}
                `}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </div>

              <div className="text-left">
                <div className={`text-sm font-serif ${active ? "text-parchment" : done ? "text-gold" : "text-parchment-dim"}`}>
                  {step.label}
                </div>
                <div className="text-xs font-sans text-parchment-dim">{step.hint}</div>
              </div>
            </button>

            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-px mx-1 ${i < current ? "bg-gold/60" : "bg-ink-600"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
