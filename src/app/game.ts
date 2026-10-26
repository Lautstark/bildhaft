import type { Collection, GameBook, Sentence } from '../core/types.ts';
import { rowsOfGame, withGameRow, withoutGameCard } from '../core/game.ts';
import { deleteSentence, newId, patchCollection, putSentence } from '../db/repo.ts';
import { emptySlot, openPicker } from './editing.ts';
import { activeCollection, s } from './state.svelte.ts';

/**
 * Ein Spiel changed row by row, where the row stands — the way a Plauderbuch's
 * pages are: each row ends in „+ Bild" and „+ Platzhalter", and its cells are
 * dragged to their place, a Platzhalter into the middle of a Muster included.
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
  const rows = rowsOfGame(open.game);
  return rows.length > 0 ? { rows } : { rows: [{ id: newId(), zellen: [] }] };
}

/** Rows deleted that no row of the book names any more. */
async function dropRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) await deleteSentence(id);
  const gone = new Set(ids);
  s.sentences = s.sentences.filter((sentence) => !gone.has(sentence.id));
}

/**
 * A cell made by a „+", with the picker open on it — the „+" a Wortkarten-
 * Sammlung's wall ends with: printed where it stands, or a Platzhalter whose
 * card is laid. It joins the row's end and is dragged to its place. Closed
 * without a choice, the card goes again (editing.ts).
 */
export async function addGameCard(platz: boolean, rowId?: string): Promise<void> {
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
  await keepGame(open, withGameRow(book, row.id, (one) => ({
    ...one, zellen: [...one.zellen, { karte: sentence.id, platz }],
  })));
  openPicker(sentence.id, slot.id);
}

/**
 * A fresh, empty row at the game's end — begun with „+ Zeile", filled cell
 * by cell with its two „+". Nothing is guessed: a Platzhalter stands only
 * where one was asked for.
 */
export async function addGameRow(): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  await keepGame(open, { rows: [...rowsOfGame(open.game), { id: newId(), zellen: [] }] });
}

/** A row dragged to another place of the game. */
export async function moveGameRow(from: number, to: number): Promise<void> {
  const open = activeCollection();
  if (!open?.game) return;
  const rows = [...rowsOfGame(open.game)];
  if (from === to || !rows[from] || !rows[to]) return;
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved!);
  await keepGame(open, { rows });
}

/** A cell dragged to another place in its row — a Platzhalter into the
 *  middle of a Muster as well as a card to the front. */
export async function moveGameZelle(rowId: string, from: number, to: number): Promise<void> {
  const open = activeCollection();
  if (!open?.game || from === to) return;
  await keepGame(open, withGameRow(open.game, rowId, (row) => {
    if (!row.zellen[from]) return row;
    const zellen = [...row.zellen];
    const [moved] = zellen.splice(from, 1);
    zellen.splice(Math.min(Math.max(to, 0), zellen.length), 0, moved!);
    return { ...row, zellen };
  }));
}

/** A row taken out of the book, with every card its cells name. */
export async function removeGameRow(rowId: string): Promise<void> {
  const open = activeCollection();
  const row = rowsOfGame(open?.game).find((one) => one.id === rowId);
  if (!open?.game || !row) return;
  await keepGame(open, { rows: rowsOfGame(open.game).filter((one) => one.id !== rowId) });
  await dropRows(row.zellen.map((zelle) => zelle.karte));
}

/** A card deleted where it stands: out of the book too. */
export async function takeOutOfGame(sentence: Sentence): Promise<void> {
  const open = activeCollection();
  if (!open?.game) return;
  await keepGame(open, withoutGameCard(open.game, sentence.id));
}
