import type { Collection, GameBook, Sentence } from '../core/types.ts';
import { bookOfTabelle, moved, rowsOfGame, tabelleOf, withGameRow, withoutGameCard } from '../core/game.ts';
import type { Tabelle } from '../core/game.ts';
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
  return rows.length > 0 ? { ...open.game, rows } : { ...open.game, rows: [{ id: newId(), zellen: [] }] };
}

/** Rows deleted that no row of the book names any more. */
async function dropRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) await deleteSentence(id);
  const gone = new Set(ids);
  s.sentences = s.sentences.filter((sentence) => !gone.has(sentence.id));
}

/** An empty card of the Sammlung, for a „+" to open the picker on. */
async function newCard(open: Collection): Promise<{ sentence: Sentence; slot: Sentence['slots'][number] }> {
  const slot = emptySlot();
  const now = Date.now();
  const sentence: Sentence = {
    id: newId(), normalizedInput: '', rawInput: '', slots: [slot],
    collectionId: open.id, createdAt: now, updatedAt: now,
  };
  await putSentence(sentence);
  s.sentences = [...s.sentences, sentence];
  return { sentence, slot };
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
  const { sentence, slot } = await newCard(open);
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
  await keepGame(open, { ...open.game, rows: [...rowsOfGame(open.game), { id: newId(), zellen: [] }] });
}

/** A row dragged to another place of the game. */
export async function moveGameRow(from: number, to: number): Promise<void> {
  const open = activeCollection();
  if (!open?.game) return;
  const rows = [...rowsOfGame(open.game)];
  if (from === to || !rows[from] || !rows[to]) return;
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved!);
  await keepGame(open, { ...open.game, rows });
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
  await keepGame(open, { ...open.game, rows: rowsOfGame(open.game).filter((one) => one.id !== rowId) });
  await dropRows(row.zellen.map((zelle) => zelle.karte).filter(Boolean));
}

/** A card deleted where it stands: out of the book too. */
export async function takeOutOfGame(sentence: Sentence): Promise<void> {
  const open = activeCollection();
  if (!open?.game) return;
  await keepGame(open, withoutGameCard(open.game, sentence.id));
}

/*
 * Eine Tabelle: Zeile × Spalte. Every „+" makes its card and opens the
 * picker on it, as a row's „+" does; a column or a row whose picker is
 * closed without a choice goes again (withoutGameCard).
 */

async function keepTabelle(open: Collection, change: (table: Tabelle) => Tabelle): Promise<void> {
  const table = tabelleOf(open.game);
  await keepGame(open, bookOfTabelle(change(table), table.kopfId || newId()));
}

/**
 * The Tabelle at another size, set with its size button: columns and rows
 * come at the end empty — a head still to be chosen, a place under every
 * column — and go from the end with every card they held.
 */
export async function resizeTabelle(spalten: number, zeilen: number): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const table = tabelleOf(open.game);
  const gone = [
    ...table.spalten.slice(spalten),
    ...table.zeilen.flatMap((zeile, r) => (r >= zeilen ? [zeile.kopf, ...zeile.felder] : zeile.felder.slice(spalten))),
  ].filter(Boolean);
  const heads = [...table.spalten.slice(0, spalten), ...Array<string>(Math.max(0, spalten - table.spalten.length)).fill('')];
  const kept = table.zeilen.slice(0, zeilen).map((zeile) => ({
    ...zeile,
    felder: heads.map((_, i) => zeile.felder[i] ?? ''),
  }));
  const added = Array.from({ length: Math.max(0, zeilen - kept.length) }, () => ({ id: newId(), kopf: '', felder: heads.map(() => '') }));
  await keepTabelle(open, () => ({ ...table, spalten: heads, zeilen: [...kept, ...added] }));
  await dropRows(gone);
}

/** How many cards a size would take away: what the size button says, and asks about. */
export function tabelleLoses(spalten: number, zeilen: number): number {
  const table = tabelleOf(activeCollection()?.game);
  return [
    ...table.spalten.slice(spalten),
    ...table.zeilen.flatMap((zeile, r) => (r >= zeilen ? [zeile.kopf, ...zeile.felder] : zeile.felder.slice(spalten))),
  ].filter(Boolean).length;
}

/**
 * The card for a place still to be chosen: a column's head (`zeile` null), a
 * row's head (`spalte` null), or the card where the two meet.
 */
export async function fillTabelle(zeile: string | null, spalte: number | null): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const { sentence, slot } = await newCard(open);
  await keepTabelle(open, (table) => zeile === null
    ? { ...table, spalten: table.spalten.map((karte, i) => (i === spalte ? sentence.id : karte)) }
    : {
      ...table,
      zeilen: table.zeilen.map((one) => (one.id !== zeile ? one : spalte === null
        ? { ...one, kopf: sentence.id }
        : { ...one, felder: one.felder.map((karte, i) => (i === spalte ? sentence.id : karte)) })),
    });
  openPicker(sentence.id, slot.id);
}

/** A column taken out, with its head and every card under it. */
export async function removeTabelleSpalte(spalte: number): Promise<void> {
  const open = activeCollection();
  if (!open?.game) return;
  const table = tabelleOf(open.game);
  if (!(spalte in table.spalten)) return;
  const gone = [table.spalten[spalte]!, ...table.zeilen.map((zeile) => zeile.felder[spalte]!)].filter(Boolean);
  await keepTabelle(open, () => ({
    ...table,
    spalten: table.spalten.filter((_, i) => i !== spalte),
    zeilen: table.zeilen.map((zeile) => ({ ...zeile, felder: zeile.felder.filter((_, i) => i !== spalte) })),
  }));
  await dropRows(gone);
}

/** A column dragged to another place, its cards in every row with it. */
export async function moveTabelleSpalte(from: number, to: number): Promise<void> {
  const open = activeCollection();
  if (!open?.game || from === to) return;
  await keepTabelle(open, (table) => ({
    ...table,
    spalten: moved(table.spalten, from, to),
    zeilen: table.zeilen.map((zeile) => ({ ...zeile, felder: moved(zeile.felder, from, to) })),
  }));
}

/** A row dragged to another place; the head row stays on top. */
export async function moveTabelleZeile(from: number, to: number): Promise<void> {
  const open = activeCollection();
  if (!open?.game || from === to) return;
  await keepTabelle(open, (table) => ({ ...table, zeilen: moved(table.zeilen, from, to) }));
}
