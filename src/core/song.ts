import { normalizeInput } from '@lautstark/bildquelle/german';
import type { Song, SongPart, SongPartKind } from './types.ts';

/**
 * A pasted song, taken apart into its parts and the order they are sung in.
 *
 * Lines are text here, not rows: this is what the paste *says*, before
 * anything is looked up. `order` indexes `parts`.
 */
export interface SongDraft {
  parts: { kind: SongPartKind; lines: string[] }[];
  order: number[];
}

/* Two lines are the same line when they read the same: „aus; wir" and
   „aus, wir" are one line sung twice, not a typo kept forever. The same key
   a row is reused by everywhere else. */
const keyOf = (line: string): string => normalizeInput(line);
const SEP = '\u0000';

/**
 * Reads a pasted song.
 *
 * A blank line ends a part, when the text has any: that is how a song is
 * written down nearly everywhere, and it lets whoever pastes say exactly
 * where a part ends. A part that comes back word for word is the same part.
 *
 * Without blank lines — a song copied line by line, as the Laternenlied was —
 * the refrain is found instead: the run of lines that comes back most, by how
 * many lines it saves. The lines between two of its returns are a Strophe.
 *
 * Either way the part that comes back most often is the Refrain, and the rest
 * are Strophen. A song with nothing coming back is one Strophe.
 */
export function readSong(text: string): SongDraft {
  const paragraphs: string[][] = [[]];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line) paragraphs.at(-1)!.push(line);
    else if (paragraphs.at(-1)!.length > 0) paragraphs.push([]);
  }
  const units = paragraphs.filter((lines) => lines.length > 0);
  const pieces = units.length > 1 ? units : splitAtRefrain(units[0] ?? []);

  const parts: { kind: SongPartKind; lines: string[]; key: string; count: number }[] = [];
  const order: number[] = [];
  for (const lines of pieces) {
    const key = lines.map(keyOf).join(SEP);
    let at = parts.findIndex((part) => part.key === key);
    if (at === -1) at = parts.push({ kind: 'strophe', lines, key, count: 0 }) - 1;
    parts[at]!.count += 1;
    order.push(at);
  }
  const most = parts.reduce<number>((best, part, at) =>
    (part.count >= 2 && (best === -1 || part.count > parts[best]!.count) ? at : best), -1);
  if (most !== -1) parts[most]!.kind = 'refrain';
  return { parts: parts.map(({ kind, lines }) => ({ kind, lines })), order };
}

/**
 * The lines of a song without blank lines, cut where its refrain starts and
 * ends.
 *
 * The refrain is the run of two lines or more that saves the most lines by
 * being written once: a run of four sung five times saves sixteen. That
 * measure is what keeps the Laternenlied's „Rabimmel" plus the refrain — five
 * lines, sung four times, fifteen saved — from winning over the refrain
 * itself, and a Strophe's own repeated pair from winning over either.
 */
function splitAtRefrain(lines: string[]): string[][] {
  const keys = lines.map(keyOf);
  const n = keys.length;
  let best: { len: number; at: number[]; saved: number } | null = null;
  for (let len = 2; len <= Math.floor(n / 2); len += 1) {
    const starts = new Map<string, number[]>();
    for (let i = 0; i + len <= n; i += 1) {
      const key = keys.slice(i, i + len).join(SEP);
      starts.set(key, [...(starts.get(key) ?? []), i]);
    }
    for (const found of starts.values()) {
      /* Returns that do not overlap, taken from the front: „La la / La la /
         La la" holds the pair once and a half, not twice. */
      const at: number[] = [];
      for (const start of found) if (at.length === 0 || start >= at.at(-1)! + len) at.push(start);
      if (at.length < 2) continue;
      const saved = (at.length - 1) * len;
      if (!best || saved > best.saved || (saved === best.saved && at.length > best.at.length)) {
        best = { len, at, saved };
      }
    }
  }
  if (!best) return lines.length > 0 ? [lines] : [];

  const pieces: string[][] = [];
  let from = 0;
  for (const start of best.at) {
    if (start > from) pieces.push(lines.slice(from, start));
    pieces.push(lines.slice(start, start + best.len));
    from = start + best.len;
  }
  if (from < n) pieces.push(lines.slice(from));
  return pieces;
}

/**
 * A part as it stands in the song, with what it is called there: the Refrain,
 * or the Strophe it is by first appearance. A part sung twice is called the
 * same both times. `first` is its first time.
 */
export interface SungPart {
  part: SongPart;
  kind: SongPartKind;
  /** The Strophe's number; 0 for a refrain. */
  n: number;
  first: boolean;
}

/** A song's parts in the order they are sung, missing parts left out. */
export function sungParts(song: Song): SungPart[] {
  const byId = new Map(song.parts.map((part) => [part.id, part]));
  const numbers = new Map<string, number>();
  const seen = new Set<string>();
  const out: SungPart[] = [];
  for (const id of song.order) {
    const part = byId.get(id);
    if (!part) continue;
    if (part.kind === 'strophe' && !numbers.has(id)) numbers.set(id, numbers.size + 1);
    out.push({ part, kind: part.kind, n: numbers.get(id) ?? 0, first: !seen.has(id) });
    seen.add(id);
  }
  return out;
}

/** How often each row is sung in the whole song. */
export function timesSung(song: Song): Map<string, number> {
  const times = new Map<string, number>();
  for (const { part } of sungParts(song)) {
    for (const line of part.lines) times.set(line, (times.get(line) ?? 0) + 1);
  }
  return times;
}

/**
 * Lines sung again straight after themselves, folded: [a, b, a, b] is [a, b]
 * twice, [a, a] is [a] twice. The longest stretch that folds wins, and the
 * shortest run that makes it, so [a, a, a, a] is [a] four times.
 *
 * What the „2×" on paper is printed from, and nothing else: the screen and
 * the store keep every line where it is sung.
 */
export function foldRepeats<T>(lines: readonly T[]): { lines: T[]; times: number }[] {
  const out: { lines: T[]; times: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    let len = 1;
    let times = 1;
    for (let size = 1; i + 2 * size <= lines.length; size += 1) {
      let count = 1;
      while (i + (count + 1) * size <= lines.length
        && lines.slice(i + count * size, i + (count + 1) * size).every((line, k) => line === lines[i + k])) {
        count += 1;
      }
      if (count > 1 && size * count > len * times) { len = size; times = count; }
    }
    out.push({ lines: lines.slice(i, i + len), times });
    i += len * times;
  }
  return out;
}

/** The song without one row, and without any part that leaves empty. */
export function withoutLine(song: Song, id: string): Song {
  const parts = song.parts
    .map((part) => ({ ...part, lines: part.lines.filter((line) => line !== id) }))
    .filter((part) => part.lines.length > 0);
  const kept = new Set(parts.map((part) => part.id));
  return { parts, order: song.order.filter((part) => kept.has(part)) };
}

/** The key two lines of a song are one row by. */
export const songLineKey = keyOf;
