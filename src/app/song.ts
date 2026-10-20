import type { Collection, Sentence, Song, SongPart } from '../core/types.ts';
import { readSong, songLineKey, withoutLine } from '../core/song.ts';
import { deleteSentence, newId, patchCollection } from '../db/repo.ts';
import { addLines } from './composing.ts';
import { activeCollection, s } from './state.svelte.ts';

/**
 * Puts a pasted song into the open Lied, and hands back whatever could not be
 * — for the box it came from to show again.
 *
 * Every line that reads the same is one row. A line the Lied already has keeps
 * the row it has, with every symbol fixed in it, so editing the text of a song
 * and sending it again moves lines and parts about without undoing a single
 * correction. Only lines it has never had are looked up.
 *
 * The song is written only once every line has a row: a song with a hole where
 * the source did not answer would print a Strophe a line short and say nothing.
 * The rows that did arrive stay, and are found again next time. Rows no line
 * points at any more go when the song is written — they are lines taken out of
 * the text.
 */
export async function writeSong(text: string): Promise<string> {
  const open = activeCollection();
  if (!open || !text.trim() || s.busy) return text;
  const draft = readSong(text);

  const rows = new Map<string, string>();
  for (const sentence of s.sentences) {
    if (!rows.has(sentence.normalizedInput)) rows.set(sentence.normalizedInput, sentence.id);
  }
  const missing = new Map<string, string>();
  for (const part of draft.parts) {
    for (const line of part.lines) {
      const key = songLineKey(line);
      if (!rows.has(key) && !missing.has(key)) missing.set(key, line);
    }
  }
  if (missing.size > 0) {
    const left = await addLines([...missing.values()].join('\n'), undefined,
      (line, sentence) => { rows.set(songLineKey(line), sentence.id); });
    if (left) return text;
  }
  if (s.activeId !== open.id) return '';

  /* A part keeps its id when it comes back with the same lines, so nothing
     that remembers a part — the refrain folded open on screen — loses it. */
  const before = new Map((open.song?.parts ?? []).map((part) => [part.lines.join('\n'), part.id]));
  const parts = draft.parts.map((part) => {
    const lines = part.lines.map((line) => rows.get(songLineKey(line))!);
    return { id: before.get(lines.join('\n')) ?? newId(), kind: part.kind, lines };
  });
  const song: Song = { parts, order: draft.order.map((at) => parts[at]!.id) };
  await keepSong(open, song);

  const sung = new Set(parts.flatMap((part) => part.lines));
  const unsung = s.sentences.filter((sentence) => !sung.has(sentence.id));
  for (const sentence of unsung) await deleteSentence(sentence.id);
  if (unsung.length > 0) s.sentences = s.sentences.filter((sentence) => sung.has(sentence.id));
  return '';
}

/**
 * What the box at the top does in a Lied: what every box does — it adds.
 *
 * An empty Lied takes what was typed as its song, read whole: a pasted song
 * is cut into its parts and its Refrain found, as it always was. A Lied with
 * lines in it takes a paste of several parts — blank lines between them — as
 * parts sung after what it has, and anything else as lines at the end of its
 * last Strophe. A part that comes back word for word is the part it already
 * has, so the Refrain pasted again is the Refrain sung once more.
 *
 * Hands back what could not be added, for the box to show again.
 */
export async function addToSong(text: string): Promise<string> {
  const open = activeCollection();
  if (!open || !text.trim() || s.busy) return text;
  const song = open.song ?? { parts: [], order: [] };
  if (!song.parts.some((part) => part.lines.length > 0)) return writeSong(text);

  const draft = readSong(text);
  if (draft.parts.length === 0) return '';
  const lines = draft.parts.flatMap((part) => part.lines);
  const rows = await rowsFor(lines);
  if (!rows) return text;
  const fresh = activeCollection();
  if (!fresh?.song || fresh.id !== open.id) return '';
  const now = fresh.song;

  if (paragraphsOf(text) < 2) {
    const ids = lines.map((line) => rows.get(songLineKey(line))!);
    const last = lastStrophe(now);
    if (last) {
      await keepSong(fresh, { ...now, parts: now.parts.map((part) => (part.id === last.id ? { ...part, lines: [...part.lines, ...ids] } : part)) });
    } else {
      await keepSong(fresh, placeStrophe(now, { id: newId(), kind: 'strophe', lines: ids }));
    }
    return '';
  }

  /* Several parts: each one either is a part the song has, or a new one. */
  let next = now;
  const made = new Map<number, string>();
  for (const at of draft.order) {
    let id = made.get(at);
    if (!id) {
      const ids = draft.parts[at]!.lines.map((line) => rows.get(songLineKey(line))!);
      const same = next.parts.find((part) => part.lines.join('\n') === ids.join('\n'));
      if (same) id = same.id;
      else {
        id = newId();
        const kind = draft.parts[at]!.kind === 'refrain' && !next.parts.some((part) => part.kind === 'refrain') ? 'refrain' : 'strophe';
        next = { ...next, parts: [...next.parts, { id, kind, lines: ids }] };
      }
      made.set(at, id);
    }
    next = { ...next, order: [...next.order, id] };
  }
  await keepSong(fresh, next);
  return '';
}

/**
 * Lines typed under one part, at its end. A Refrain's are sung wherever the
 * Refrain is, because it is one part.
 */
export async function addLinesToPart(partId: string, text: string): Promise<string> {
  const lines = linesOf(text);
  const open = activeCollection();
  if (!open?.song || lines.length === 0 || s.busy) return text;
  const rows = await rowsFor(lines);
  if (!rows) return text;
  const fresh = activeCollection();
  if (!fresh?.song || fresh.id !== open.id) return '';
  const ids = lines.map((line) => rows.get(songLineKey(line))!);
  await keepSong(fresh, {
    ...fresh.song,
    parts: fresh.song.parts.map((part) => (part.id === partId ? { ...part, lines: [...part.lines, ...ids] } : part)),
  });
  return '';
}

/**
 * A new Strophe with its first lines: at `at` in the order it is sung, or at
 * the end. At the end the Refrain follows it when it follows the Strophe
 * before — the shape the song has; put in between, it stands where it is put.
 */
export async function addStrophe(text: string, at?: number): Promise<string> {
  return addPart('strophe', text, at);
}

/**
 * The Refrain sung once more: at `at`, or at the end. A song without one gets
 * one, with the lines typed for it; a song with one sings it again and needs
 * none.
 */
export async function addRefrain(text = '', at?: number): Promise<string> {
  const refrain = activeCollection()?.song?.parts.find((part) => part.kind === 'refrain');
  if (refrain) {
    const open = activeCollection()!;
    await keepSong(open, { ...open.song!, order: insertAt(open.song!.order, refrain.id, at) });
    return '';
  }
  return addPart('refrain', text, at);
}

const insertAt = (order: string[], id: string, at?: number): string[] =>
  (at === undefined ? [...order, id] : [...order.slice(0, at), id, ...order.slice(at)]);

async function addPart(kind: 'strophe' | 'refrain', text: string, at?: number): Promise<string> {
  const lines = linesOf(text);
  const open = activeCollection();
  if (!open || lines.length === 0 || s.busy) return text;
  const rows = await rowsFor(lines);
  if (!rows) return text;
  const fresh = activeCollection();
  if (!fresh || fresh.id !== open.id) return '';
  const song = fresh.song ?? { parts: [], order: [] };
  const part = { id: newId(), kind, lines: lines.map((line) => rows.get(songLineKey(line))!) };
  await keepSong(fresh, kind === 'strophe' && at === undefined ? placeStrophe(song, part)
    : { parts: [...song.parts, part], order: insertAt(song.order, part.id, at) });
  return '';
}

/**
 * One place in the song taken out: a Strophe, or the Refrain where it is
 * sung there. A part sung nowhere any more goes, and with it the lines only
 * it had.
 */
export async function removePlace(place: number): Promise<void> {
  const open = activeCollection();
  if (!open?.song || place < 0 || place >= open.song.order.length) return;
  const order = open.song.order.filter((_, at) => at !== place);
  const kept = new Set(order);
  await keepSong(open, { parts: open.song.parts.filter((part) => kept.has(part.id)), order });
  await dropUnsung();
}

/**
 * One part written again as text. A line it keeps keeps its row and every
 * symbol fixed in it; only lines it never had are looked up, and lines taken
 * out go if no other part sings them. A part left empty goes.
 */
export async function rewritePart(partId: string, text: string): Promise<string> {
  const lines = linesOf(text);
  const open = activeCollection();
  if (!open?.song || s.busy) return text;
  const rows = lines.length > 0 ? await rowsFor(lines) : new Map<string, string>();
  if (!rows) return text;
  const fresh = activeCollection();
  if (!fresh?.song || fresh.id !== open.id) return '';
  const ids = lines.map((line) => rows.get(songLineKey(line))!);
  const song = ids.length > 0
    ? { ...fresh.song, parts: fresh.song.parts.map((part) => (part.id === partId ? { ...part, lines: ids } : part)) }
    : { parts: fresh.song.parts.filter((part) => part.id !== partId), order: fresh.song.order.filter((id) => id !== partId) };
  await keepSong(fresh, song);
  await dropUnsung();
  return '';
}

/** A part's lines as text, one line each, for writing it again. */
export function partText(partId: string): string {
  const part = activeCollection()?.song?.parts.find((one) => one.id === partId);
  const byId = new Map(s.sentences.map((sentence) => [sentence.id, sentence.rawInput]));
  return (part?.lines ?? []).map((id) => byId.get(id) ?? '').filter(Boolean).join('\n');
}

const linesOf = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const paragraphsOf = (text: string): number => text.trim().split(/\r?\n\s*\r?\n/).filter((one) => one.trim()).length;

function lastStrophe(song: Song): SongPart | undefined {
  const byId = new Map(song.parts.map((part) => [part.id, part]));
  return [...song.order].reverse().map((id) => byId.get(id)).find((part) => part?.kind === 'strophe');
}

function placeStrophe(song: Song, part: SongPart): Song {
  const byId = new Map(song.parts.map((one) => [one.id, one]));
  const tail = song.order.at(-1);
  const refrain = tail ? byId.get(tail) : undefined;
  const follows = refrain?.kind === 'refrain' && song.order.length > 1;
  return {
    parts: [...song.parts, part],
    order: follows ? [...song.order, part.id, refrain.id] : [...song.order, part.id],
  };
}

/**
 * The row for every line: a line that reads like one the Lied has is that
 * row, the rest are looked up. Null when the source did not answer for all
 * of them — nothing is placed with a hole in it.
 */
async function rowsFor(lines: string[]): Promise<Map<string, string> | null> {
  const rows = new Map<string, string>();
  for (const sentence of s.sentences) {
    if (!rows.has(sentence.normalizedInput)) rows.set(sentence.normalizedInput, sentence.id);
  }
  const missing = new Map<string, string>();
  for (const line of lines) {
    const key = songLineKey(line);
    if (!rows.has(key) && !missing.has(key)) missing.set(key, line);
  }
  if (missing.size > 0) {
    const left = await addLines([...missing.values()].join('\n'), undefined,
      (line, sentence) => { rows.set(songLineKey(line), sentence.id); });
    if (left) return null;
  }
  return rows;
}

/** Rows no part sings any more: lines taken out of the song. */
async function dropUnsung(): Promise<void> {
  const song = activeCollection()?.song;
  if (!song) return;
  const sung = new Set(song.parts.flatMap((part) => part.lines));
  const unsung = s.sentences.filter((sentence) => !sung.has(sentence.id));
  for (const sentence of unsung) await deleteSentence(sentence.id);
  if (unsung.length > 0) s.sentences = s.sentences.filter((sentence) => sung.has(sentence.id));
}

/** A row deleted from a Lied leaves the song with it, wherever it was sung. */
export async function takeOutOfSong(sentence: Sentence): Promise<void> {
  const open = activeCollection();
  if (!open?.song) return;
  await keepSong(open, withoutLine(open.song, sentence.id));
}

async function keepSong(open: Collection, song: Song): Promise<void> {
  const next: Collection = { ...open, song, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  await patchCollection(next.id, { song });
}
