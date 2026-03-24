import { Audio, interpolate, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender } from "remotion";
import React from "react";
import { loadFont } from "@remotion/google-fonts/NotoSerifSC";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
});

type Props = {
  paragraphId: string;
  text: string;
  sectionTitle?: string;
  audioSrc: string;
  segmentTitle: string;
  bookTitle?: string;
  progress: number; // 0..1 overall segment progress
};

/** DashScope 字级时间戳（与 TTS 输入文本的 UTF-16 索引一致） */
type WordTimestamp = {
  text: string;
  begin_index: number;
  end_index: number;
  begin_time: number;
  end_time: number;
};

function dedupeWordTimestamps(words: WordTimestamp[]): WordTimestamp[] {
  const bySpan = new Map<string, WordTimestamp>();
  for (const w of words) {
    const key = `${w.begin_index}:${w.end_index}`;
    bySpan.set(key, w);
  }
  return Array.from(bySpan.values()).sort(
    (a, b) => a.begin_index - b.begin_index || a.end_index - b.end_index
  );
}

/** 按 begin_index～end_index（左闭右开）为每个码点分配时间；多字 token 在区间内线性插值 */
function buildCharTimingFromWords(
  text: string,
  words: WordTimestamp[]
): { begin_time: number; end_time: number }[] {
  const timing: ({ begin_time: number; end_time: number } | null)[] = new Array(
    text.length
  ).fill(null);

  for (const w of words) {
    const bi = w.begin_index;
    const ei = w.end_index;
    if (ei <= bi || bi < 0) continue;
    const span = ei - bi;
    for (let k = 0; k < span; k++) {
      const idx = bi + k;
      if (idx >= text.length) break;
      const t0 = w.begin_time + ((w.end_time - w.begin_time) * k) / span;
      const t1 = w.begin_time + ((w.end_time - w.begin_time) * (k + 1)) / span;
      timing[idx] = { begin_time: t0, end_time: t1 };
    }
  }

  // API 未覆盖的码点（如个别标点）：继承「上一字符」的结束时刻，避免模糊匹配错位
  let prevEnd = 0;
  for (let i = 0; i < text.length; i++) {
    if (timing[i]) {
      prevEnd = timing[i]!.end_time;
    } else {
      timing[i] = { begin_time: prevEnd, end_time: prevEnd };
    }
  }

  return timing as { begin_time: number; end_time: number }[];
}

export const ParagraphDisplay: React.FC<Props> = ({
  paragraphId,
  text,
  sectionTitle,
  audioSrc,
  segmentTitle,
  bookTitle,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const [timestamps, setTimestamps] = React.useState<WordTimestamp[] | null>(null);
  
  const [handle] = React.useState(() => delayRender("fetch-timestamps"));

  React.useEffect(() => {
    // 根据音频路径推断出同名的 json 路径
    const jsonUrl = staticFile(audioSrc.replace(".mp3", ".json"));
    fetch(jsonUrl)
      .then((r) => r.json())
      .then((data) => {
        setTimestamps(Array.isArray(data) ? dedupeWordTimestamps(data as WordTimestamp[]) : []);
        continueRender(handle);
      })
      .catch((e) => {
        console.warn("No timestamp data found for", audioSrc, e);
        // 出错或文件不存在也不要卡住渲染
        setTimestamps([]);
        continueRender(handle);
      });
  }, [audioSrc, handle]);

  const charTiming = React.useMemo(() => {
    if (!timestamps || timestamps.length === 0) return null;
    return buildCharTimingFromWords(text, dedupeWordTimestamps(timestamps));
  }, [text, timestamps]);

  const fadeIn = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.3, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  const slideY = interpolate(frame, [0, fps * 0.4], [24, 0], {
    extrapolateRight: "clamp",
  });

  // Section title slide in
  const sectionFadeIn = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateRight: "clamp",
  });

  const progressBarWidth = interpolate(
    frame,
    [0, durationInFrames],
    [progress * 100, (progress + 1 / 11) * 100],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  // Lines
  const lines = text.split("\n");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(180deg, #1a0e05 0%, #221208 60%, #1a0e05 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily,
        position: "relative",
      }}
    >
      {/* Audio */}
      <Audio src={staticFile(audioSrc)} />

      {/* Header */}
      <div
        style={{
          padding: "60px 80px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32, // 确保左右之间始终有间距
        }}
      >
        <div
          style={{
            color: "#c9a96e",
            fontSize: 28,
            letterSpacing: "0.15em",
            fontWeight: 400,
            opacity: 0.8,
            flex: 1, // 占据剩余空间
            minWidth: 0, // 允许 Flex 子项收缩到比其内容更小
            whiteSpace: "nowrap", // 不换行
            overflow: "hidden",
            // 核心魔法：使用渐变蒙版，让文字在右侧 85% 到 100% 区域产生羽化渐隐消失的效果
            WebkitMaskImage: "linear-gradient(to right, black 85%, transparent 100%)",
            maskImage: "linear-gradient(to right, black 85%, transparent 100%)",
          }}
        >
          {bookTitle ? `《${bookTitle}》` : ""}
        </div>
        <div
          style={{
            color: "#8a7060",
            fontSize: 24,
            letterSpacing: "0.1em",
            maxWidth: "40%", // 限制章节名最大宽度，防止其本身过长
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis", // 章节名较短，万一超长使用传统的省略号
            flexShrink: 0, // 保证右侧不被左侧的长标题过度挤压
          }}
        >
          {segmentTitle.split("·")[0].trim()}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "linear-gradient(90deg, transparent, #c9a96e40, transparent)",
          margin: "24px 80px",
        }}
      />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 80px",
          opacity,
          transform: `translateY(${slideY}px)`,
        }}
      >
        {/* Section title badge */}
        {sectionTitle && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginBottom: 48,
              opacity: sectionFadeIn,
            }}
          >
            <div
              style={{
                width: 4,
                height: 36,
                background: "#c9a96e",
                borderRadius: 2,
                marginRight: 18,
              }}
            />
            <div
              style={{
                color: "#c9a96e",
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            >
              {sectionTitle}
            </div>
          </div>
        )}

        {/* Paragraph text */}
        <div>
          {lines.map((line, i) => {
            const isQuote = line.startsWith("——");
            
            // 为了匹配时间戳数组，我们需要计算每个字在原始文本中的索引
            // 这里我们粗略地根据之前行的长度来推算当前行的起始索引
            const previousLinesLength = lines.slice(0, i).reduce((sum, l) => sum + l.length + 1, 0); // +1 是为了补上被 split 吃掉的换行符
            const chars = Array.from(line);
            
            return (
              <div
                key={i}
                style={{
                  color: isQuote ? "#c9a96e" : "#f0e6d8",
                  fontSize: isQuote ? 38 : 48,
                  lineHeight: 1.75,
                  letterSpacing: "0.05em",
                  fontWeight: isQuote ? 400 : 400,
                  fontStyle: isQuote ? "italic" : "normal",
                  marginBottom: lines.length > 1 && i < lines.length - 1 ? 20 : 0,
                  textAlign: isQuote ? "right" : "left",
                }}
              >
                {chars.map((char, charIdx) => {
                  const globalIndex = previousLinesLength + charIdx;
                  const currentTimeMs = (frame / fps) * 1000;
                  
                  let isHighlighted = true; // 默认全亮，兼容没有时间戳的情况
                  
                  if (charTiming) {
                      const timing = charTiming[globalIndex];
                      if (timing) {
                          // 如果当前时间已经达到了这个字的开始时间，就高亮
                          isHighlighted = currentTimeMs >= timing.begin_time;
                      }
                  }
                  
                  return (
                    <span
                      key={charIdx}
                      style={{
                        color: isHighlighted ? (isQuote ? "#c9a96e" : "#f0e6d8") : (isQuote ? "#c9a96e" : "#f0e6d8"),
                        opacity: isHighlighted ? 1 : 0.4,
                        transition: "color 0.1s ease, opacity 0.1s ease",
                      }}
                    >
                      {char}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom progress bar */}
      <div
        style={{
          padding: "0 80px 60px",
        }}
      >
        <div
          style={{
            color: "#8a7060",
            fontSize: 22,
            marginBottom: 16,
            letterSpacing: "0.1em",
          }}
        >
          {segmentTitle}
        </div>
        <div
          style={{
            width: "100%",
            height: 3,
            background: "#3d2510",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(progressBarWidth, 100)}%`,
              height: "100%",
              background: "linear-gradient(90deg, #c9a96e, #e8c98a)",
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
};
