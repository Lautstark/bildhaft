import type { GameBook, GameRow } from './types.ts';

/** The rows of a Spiel, or none for one nothing was put into. */
export const rowsOfGame = (book: GameBook | undefined): GameRow[] => book?.rows ?? [];

/** Every row the book points at: the fixed pictures, then the cards to lay. */
export const cardsOfGame = (book: GameBook | undefined): string[] =>
  rowsOfGame(book).flatMap((row) => [...row.fest, ...row.karten]);

/** The book without one card, wherever it stood — fixed or to lay. */
export function withoutGameCard(book: GameBook, id: string): GameBook {
  return {
    rows: book.rows.map((row) => ({
      ...row,
      fest: row.fest.filter((one) => one !== id),
      karten: row.karten.filter((one) => one !== id),
    })),
  };
}

/** The book with one row changed, found by its id. */
export const withGameRow = (book: GameBook, id: string, change: (row: GameRow) => GameRow): GameBook =>
  ({ rows: book.rows.map((row) => (row.id === id ? change(row) : row)) });
