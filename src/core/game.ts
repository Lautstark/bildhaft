import type { GameBook, GameRow, GameZelle } from './types.ts';

/**
 * The rows of a Spiel, each as its cells — or none for one nothing was put
 * into. A row saved before there were cells carried two lists, the fixed
 * cards and the laid ones; it is read as the cells it meant, fixed first,
 * and nothing rewrites it in place.
 */
export const rowsOfGame = (book: GameBook | undefined): GameRow[] =>
  (book?.rows ?? []).map((row) => (row.zellen ? row : {
    id: row.id,
    zellen: [
      ...(row.fest ?? []).map((karte): GameZelle => ({ karte, platz: false })),
      ...(row.karten ?? []).map((karte): GameZelle => ({ karte, platz: true })),
    ],
  }));

/** Every card the book points at, in reading order — a Tabelle's cells still
 *  to be chosen are no card. */
export const cardsOfGame = (book: GameBook | undefined): string[] =>
  rowsOfGame(book).flatMap((row) => row.zellen.map((zelle) => zelle.karte)).filter(Boolean);

/** The book without one card, wherever its cell stood. In a Tabelle the
 *  cell keeps its place, still to be chosen: its size is set by the size
 *  button, and only there or by a bin does a column or row go. */
export function withoutGameCard(book: GameBook, id: string): GameBook {
  if (book.tabelle) {
    return bookOfTabelle(tabelleOf({
      ...book,
      rows: rowsOfGame(book).map((row) => ({
        id: row.id,
        zellen: row.zellen.map((zelle) => (zelle.karte === id ? { karte: '', platz: zelle.platz } : zelle)),
      })),
    }), tabelleOf(book).kopfId);
  }
  return {
    ...book,
    rows: rowsOfGame(book).map((row) => ({
      id: row.id,
      zellen: row.zellen.filter((zelle) => zelle.karte !== id),
    })),
  };
}

/** The book with one row changed, found by its id. */
export const withGameRow = (book: GameBook, id: string, change: (row: GameRow) => GameRow): GameBook =>
  ({ ...book, rows: rowsOfGame(book).map((row) => (row.id === id ? change(row) : row)) });

/**
 * A Tabelle as its parts: the column heads, and each row's head and the
 * cells under the heads — padded, so a row read from an older or a hand-made
 * book is as wide as the head row says. `''` is a place still to be chosen.
 */
export interface Tabelle {
  /** The head row's id, '' while the Tabelle has none yet. */
  kopfId: string;
  spalten: string[];
  zeilen: { id: string; kopf: string; felder: string[] }[];
}

export function tabelleOf(book: GameBook | undefined): Tabelle {
  const [kopf, ...rest] = rowsOfGame(book);
  const spalten = (kopf?.zellen ?? []).map((zelle) => zelle.karte);
  return {
    kopfId: kopf?.id ?? '',
    spalten,
    zeilen: rest.map((row) => ({
      id: row.id,
      kopf: row.zellen[0]?.karte ?? '',
      felder: spalten.map((_, i) => row.zellen[i + 1]?.karte ?? ''),
    })),
  };
}

/** A Tabelle's heads as cards for the sheet, a place still to be chosen null —
 *  the cards it lays come with the rows. */
export function tabelleHeads<T>(book: GameBook | undefined, get: (id: string) => T | undefined) {
  const table = tabelleOf(book);
  return {
    spalten: table.spalten.map((id) => get(id) ?? null),
    zeilen: table.zeilen.map((zeile) => ({ kopf: get(zeile.kopf) ?? null })),
  };
}

/** The book a Tabelle is written back as: heads printed, every cell a Platzhalter. */
export function bookOfTabelle(table: Tabelle, kopfId: string): GameBook {
  return {
    tabelle: true,
    rows: [
      { id: table.kopfId || kopfId, zellen: table.spalten.map((karte) => ({ karte, platz: false })) },
      ...table.zeilen.map((zeile) => ({
        id: zeile.id,
        zellen: [{ karte: zeile.kopf, platz: false }, ...zeile.felder.map((karte) => ({ karte, platz: true }))],
      })),
    ],
  };
}

/** One element of a list moved from one place to another. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (from === to || !(from in list) || !(to in list)) return list;
  const next = [...list];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one!);
  return next;
}
