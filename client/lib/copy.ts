// Small copy helpers shared by cards that stack a milestone label over a habit.

const STOP = new Set([
  "a",
  "an",
  "the",
  "do",
  "to",
  "of",
  "and",
  "on",
  "for",
  "my",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word));
}

/**
 * True when a label only repeats the text under it (for example a milestone
 * titled "20-minute walk after dinner (weekdays)" above the habit "Do a
 * 20-minute walk after dinner, Monday-Friday"), so the card can drop it.
 */
export function repeatsText(label: string, text: string): boolean {
  const labelWords = words(label);
  if (labelWords.length === 0) return true;
  const textWords = new Set(words(text));
  const shared = labelWords.filter((word) => textWords.has(word)).length;
  return shared / labelWords.length >= 0.7;
}
