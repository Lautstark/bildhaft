import type { Collection, Sentence, Song } from '../core/types.ts';
import { readSong, songLineKey, songText, withoutLine } from '../core/song.ts';
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

/** The open Lied's text as it is sung, for editing. */
export function currentSongText(): string {
  const song = activeCollection()?.song;
  if (!song) return '';
  const byId = new Map(s.sentences.map((sentence) => [sentence.id, sentence.rawInput]));
  return songText(song, (id) => byId.get(id));
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
