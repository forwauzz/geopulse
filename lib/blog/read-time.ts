/** Rough read time from excerpt or short text (~200 wpm). */
export function estimateReadMinutes(text: string | null | undefined): number {
  if (!text?.trim()) return 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
