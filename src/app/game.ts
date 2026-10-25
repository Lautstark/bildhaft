import type { Collection, GameBook, Sentence } from '../core/types.ts';
import { rowsOfGame, withGameRow, withoutGameCard } from '../core/game.ts';
import { deleteSentence, newId, patchCollection, putSentence } from '../db/repo.ts';
import { addLines } from './composing.ts';
import { emptySlot, openPicker } from './editing.ts';
import { activeCollection, s } from './state.svelte.ts';

/**
 * Ein Spiel changed row by row, where the row stands — the way a Plauderbuch's
 * pages are: each row has a „+" on its fixed side and one among its cards.
 *
 * Every write goes through the book on the Sammlung: a card is only in a row
 * because the book says so, and a card the book no longer names is deleted
 * with it, so nothing is left in the Sammlung that no row shows.
 */

async function keepGame(open: Collection, game: GameBook): Promise<void> {
  const next: Collection = { ...open, game, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  await patchCollection(next.id, { game });
}

/** The book as it now stands, with one empty row when it has none — the row
 *  an empty Spiel shows to begin on, made real by what is put into it. */
function bookWithRow(open: Collection): GameBook {
  return rowsOfGame(open.game).length > 0 ? open.game! : { rows: [{ id: newId(), fest: [], karten: [] }] };
}

/** Rows deleted that no row of the book names any more. */
async function dropRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) await deleteSentence(id);
  const gone = new Set(ids);
  s.sentences = s.sentences.filter((sentence) => !gone.has(sentence.id));
}

/**
 * A card made by a „+", with the picker open on it — the „+" a Wortkarten-
 * Sammlung's wall ends with: a new fixed picture or a new card to lay, at the
 * end of its side of its row. Closed without a choice, the card goes again
 * (editing.ts). An empty book gets its first row.
 */
export async function addGameCard(where: 'fest' | 'karte', rowId?: string): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const slot = emptySlot();
  const now = Date.now();
  const sentence: Sentence = {
    id: newId(), normalizedInput: '', rawInput: '', slots: [slot],
    collectionId: open.id, createdAt: now, updatedAt: now,
  };
  await putSentence(sentence);
  s.sentences = [...s.sentences, sentence];
  const book = bookWithRow(open);
  const row = book.rows.find((one) => one.id === rowId) ?? book.rows.at(-1)!;
  await keepGame(open, withGameRow(book, row.id, (one) => (where === 'fest'
    ? { ...one, fest: [...one.fest, sentence.id] }
    : { ...one, karten: [...one.karten, sentence.id] })));
  openPicker(sentence.id, slot.id);
}

/**
 * A row typed as a line, the way a Schritt is: every word becomes a card of
 * its own, looked up as any word is — and the last word is laid, so „Schuh
 * Socke" is already a game of Zuordnen. The rest stands fixed on the sheet.
 * Null rows are never placed: a line whose words found nothing comes back
 * into the field, the cards that did arrive taken out again.
 */
export async function addGameLine(text: string): Promise<string> {
  const open = activeCollection();
  if (!open) return text;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const made = new Map<string, Sentence[]>();
  const left = await addLines(words.join('\n'), undefined, (line, sentence) => {
    made.set(line, [...(made.get(line) ?? []), sentence]);
  });
  const ids = words.map((word) => made.get(word)?.shift()?.id).filter((id): id is string => Boolean(id));
  if (left) {
    for (const id of ids) await deleteSentence(id);
    const gone = new Set(ids);
    s.sentences = s.sentences.filter((sentence) => !gone.has(sentence.id));
    return text;
  }
  const fresh = activeCollection();
  if (!fresh || fresh.id !== open.id) return '';
  const book = rowsOfGame(fresh.game).length > 0 ? fresh.game! : { rows: [] };
  await keepGame(fresh, { rows: [...book.rows, { id: newId(), fest: ids.slice(0, -1), karten: ids.slice(-1) }] });
  return '';
}

/** A row taken out of the book, with its pictures and its cards. */
export async function removeGameRow(rowId: string): Promise<void> {
  const open = activeCollection();
  const row = rowsOfGame(open?.game).find((one) => one.id === rowId);
  if (!open?.game || !row) return;
  await keepGame(open, { rows: open.game.rows.filter((one) => one.id !== rowId) });
  await dropRows([...row.fest, ...row.karten]);
}

/** A card deleted where it stands: out of the book too. */
export async function takeOutOfGame(sentence: Sentence): Promise<void> {
  const open = activeCollection();
  if (!open?.game) return;
  await keepGame(open, withoutGameCard(open.game, sentence.id));
}
