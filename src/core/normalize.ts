/** Punctuation that never carries meaning for us. Keeps letters, digits, hyphens. */
const PUNCT = /[.,!?;:„“”"'`´()\[\]{}…»«–—*_/\\]/g;

/**
 * The lookup key for sentence reuse: lowercased, trimmed, punctuation-stripped,
 * whitespace-collapsed. Two sentences that differ only in punctuation or casing
 * are the same line as far as "you've translated this before" is concerned.
 */
export function normalizeInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
