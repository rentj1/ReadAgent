const CHARS_PER_MINUTE = 220; // Chinese speech ~220 chars/min

export function estimateDuration(paragraphs: { text: string }[]): string {
  const chars = paragraphs.reduce((sum, p) => sum + p.text.length, 0);
  const minutes = chars / CHARS_PER_MINUTE;
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  return `${minutes.toFixed(1)}min`;
}
