import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Series,
  staticFile,
} from "remotion";
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";
import { TitleCard } from "../components/TitleCard";
import { ParagraphDisplay } from "../components/ParagraphDisplay";
import { type Segment } from "../data/chapter5";

const FPS = 30;
const MIN_TITLE_CARD_FRAMES = 4 * FPS;

export type BookSegmentProps = {
  segment: Segment;
  paragraphDurationsFrames: number[];
  titleCardDurationFrames: number;
  bookTitle?: string;
  coverPath?: string;
};

const getAudioDuration = async (src: string): Promise<number> => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, { getRetryDelay: () => null }),
  });
  return await input.computeDuration();
};

export const calculateMetadata: CalculateMetadataFunction<
  BookSegmentProps
> = async ({ props }) => {
  const { segment } = props;

  const [introDuration, ...paragraphDurations] = await Promise.all([
    getAudioDuration(
      staticFile(`audio/${segment.id}/${segment.id}-intro.mp3`)
    ),
    ...segment.paragraphs.map((p) =>
      getAudioDuration(staticFile(`audio/${segment.id}/${p.id}.mp3`))
    ),
  ]);

  const titleCardDurationFrames = Math.max(
    Math.ceil(introDuration * FPS),
    MIN_TITLE_CARD_FRAMES
  );

  const paragraphDurationsFrames = paragraphDurations.map((d) =>
    Math.ceil(d * FPS)
  );

  const totalFrames =
    titleCardDurationFrames +
    paragraphDurationsFrames.reduce((sum, d) => sum + d, 0);

  return {
    durationInFrames: totalFrames,
    props: {
      ...props,
      paragraphDurationsFrames,
      titleCardDurationFrames,
    },
  };
};

export const BookSegment: React.FC<BookSegmentProps> = ({
  segment,
  paragraphDurationsFrames,
  titleCardDurationFrames,
  bookTitle,
  coverPath,
}) => {
  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence durationInFrames={titleCardDurationFrames}>
          <TitleCard
            bookTitle={bookTitle ?? ""}
            chapterTitle={segment.title}
            audioSrc={`audio/${segment.id}/${segment.id}-intro.mp3`}
            coverPath={coverPath}
          />
        </Series.Sequence>

        {/* Paragraph sequences */}
        {segment.paragraphs.map((para, index) => {
          const durationInFrames = paragraphDurationsFrames[index] ?? FPS * 3;

          // Calculate progress (0..1 based on how many paragraphs done)
          const progress = index / segment.paragraphs.length;

          return (
            <Series.Sequence
              key={para.id}
              durationInFrames={durationInFrames}
              premountFor={FPS}
            >
              <ParagraphDisplay
                paragraphId={para.id}
                text={para.text}
                sectionTitle={para.sectionTitle}
                audioSrc={`audio/${segment.id}/${para.id}.mp3`}
                segmentTitle={segment.title}
                bookTitle={bookTitle}
                progress={progress}
              />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
