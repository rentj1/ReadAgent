import { Composition } from "remotion";
import { BookSegment, calculateMetadata, type BookSegmentProps } from "./compositions/BookSegment";
import { SEGMENTS } from "./data/chapter5";

export const RemotionRoot: React.FC = () => {
  const seg01 = SEGMENTS.find((s) => s.id === "seg-01")!;

  return (
    <>
      {/* Original seg-01 composition — backward compatible */}
      <Composition
        id="BookReaderSeg01"
        component={BookSegment}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={
          {
            segment: seg01,
            paragraphDurationsFrames: [],
            titleCardDurationFrames: 120,
          } satisfies BookSegmentProps
        }
        calculateMetadata={calculateMetadata}
      />

      {/* Generic composition — accepts any segment via inputProps for programmatic rendering */}
      <Composition
        id="BookReader"
        component={BookSegment}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={
          {
            segment: { id: "placeholder", title: "Preview", paragraphs: [] },
            paragraphDurationsFrames: [],
            titleCardDurationFrames: 120,
          } satisfies BookSegmentProps
        }
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
