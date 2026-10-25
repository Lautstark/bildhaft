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

/** Every card the book points at, in reading order. */
export const cardsOfGame = (book: GameBook | undefined): string[] =>
  rowsOfGame(book).flatMap((row) => row.zellen.map((zelle) => zelle.karte));

/** The book without one card, wherever its cell stood. */
export function withoutGameCard(book: GameBook, id: string): GameBook {
  return {
    rows: rowsOfGame(book).map((row) => ({
      id: row.id,
      zellen: row.zellen.filter((zelle) => zelle.karte !== id),
    })),
  };
}

/** The book with one row changed, found by its id. */
export const withGameRow = (book: GameBook, id: string, change: (row: GameRow) => GameRow): GameBook =>
  ({ rows: rowsOfGame(book).map((row) => (row.id === id ? change(row) : row)) });
