import { Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSerifSC";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
});

type Props = {
  chapterTitle: string;
  bookTitle: string;
  audioSrc: string;
  coverPath?: string;
};

export const TitleCard: React.FC<Props> = ({ chapterTitle, bookTitle, audioSrc, coverPath }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.5, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  const slideY = interpolate(frame, [0, fps * 0.8], [40, 0], {
    extrapolateRight: "clamp",
  });

  const coverScale = interpolate(frame, [0, fps * 1.0], [0.85, 1], {
    extrapolateRight: "clamp",
  });

  const coverOpacity = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <>
    <Audio src={staticFile(audioSrc)} />
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(160deg, #1a0e05 0%, #2d1a08 50%, #1a0e05 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        opacity,
        padding: "80px",
        boxSizing: "border-box",
      }}
    >
      {/* Book cover */}
      <div
        style={{
          marginBottom: 48,
          opacity: coverOpacity,
          transform: `scale(${coverScale}) translateY(${slideY}px)`,
        }}
      >
        <Img
          src={coverPath ? staticFile(coverPath.replace(/^\//, "")) : staticFile("book-cover.jpg")}
          style={{
            width: 300,
            height: "auto",
            borderRadius: 8,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(201,169,110,0.15)",
          }}
        />
      </div>

      {/* Decorative line */}
      <div
        style={{
          width: interpolate(frame, [fps * 0.3, fps * 1.2], [0, 180], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          }),
          height: 2,
          background: "#c9a96e",
          marginBottom: 36,
        }}
      />

      {/* Book title */}
      <div
        style={{
          color: "#c9a96e",
          fontSize: 34,
          fontWeight: 400,
          letterSpacing: "0.3em",
          marginBottom: 24,
          transform: `translateY(${slideY}px)`,
          opacity: interpolate(frame, [fps * 0.2, fps * 1.0], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          }),
        }}
      >
        {bookTitle}
      </div>

      {/* Chapter title */}
      <div
        style={{
          color: "#f5ebe0",
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: "center",
          letterSpacing: "0.05em",
          transform: `translateY(${slideY}px)`,
          opacity: interpolate(frame, [fps * 0.4, fps * 1.2], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          }),
        }}
      >
        {chapterTitle}
      </div>

      {/* Decorative bottom line */}
      <div
        style={{
          width: interpolate(frame, [fps * 0.5, fps * 1.4], [0, 120], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          }),
          height: 1,
          background: "#c9a96e",
          marginTop: 36,
          opacity: 0.6,
        }}
      />
    </div>
    </>
  );
};
