export type BookStatus =
  | "importing"        // PDF just uploaded
  | "parsing"          // extract-pdf.py running
  | "preprocessing"    // preprocess-pdf.py splitting PDF into chapters
  | "processing_chapters"  // process-chapters.py processing chapters
  | "parsed"           // Segments ready, user can edit
  | "ready";           // All done

export type TtsStatus = "pending" | "generating" | "done" | "error";
export type RenderStatus = "pending" | "rendering" | "done" | "error";

export type ParagraphData = {
  id: string;
  text: string;
  sectionTitle?: string;
};

export type SegmentData = {
  id: string;
  title: string;
  paragraphs: ParagraphData[];
  ttsStatus: TtsStatus;
  renderStatus: RenderStatus;
  renderProgress: number;
  outputPath?: string;
};

export type BookData = {
  id: string;
  title: string;
  coverPath?: string;
  pdfPath: string;
  status: BookStatus;
  segments: SegmentData[];
  createdAt: string;
};
