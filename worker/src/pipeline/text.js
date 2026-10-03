// Text coverage: what share of the original's words survive in the rebuild.
// Word sets, not sequences — layout reorders text legitimately (a card's
// title above vs. below its image), and order is checked visually anyway.

const STOP = new Set(['the', 'and', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'at', 'by', 'or', 'as', 'be', 'we', 'our', 'you', 'your', 'with', 'from', 'this', 'that']);

export function words(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .toLowerCase()
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export function coverage(original, rebuilt) {
  const want = new Set(words(original));
  if (!want.size) return { score: 1, missing: [] };
  const have = new Set(words(rebuilt));
  const missing = [...want].filter((w) => !have.has(w));
  return { score: 1 - missing.length / want.size, missing };
}
