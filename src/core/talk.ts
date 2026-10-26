import type { Slot, TalkBook, TalkPage } from './types.ts';
import { buildSlots, buildWordSlot, type MatchContext } from './match.ts';

/**
 * The card for an Aussage of a Plauderbuch: one picture, and the whole line
 * under it.
 *
 * „vom Morgenkreis", „einem anderen Kind", „Hör mal zu": a card says all of
 * it and shows one thing. Looking the line up as one word, the way a
 * Wortkarte is, asks the source for „vom morgenkreis" and gets nothing. So
 * the line is read as a sentence is, and the last word that found a picture
 * is the card's — in German that is where the thing usually stands, after
 * its preposition and its article.
 *
 * A line the Wortschatz knows whole is that entry, as a Wortkarte is: „Hör
 * mal zu" filed once with its picture is that picture on every page. A line
 * nothing was found for is an empty card asking for its picture.
 */
export async function buildSayingSlot(line: string, ctx: MatchContext): Promise<Slot> {
  const text = line.trim().replace(/\s+/g, ' ');
  if (!text.includes(' ') || ctx.overrides.has(text.toLowerCase())) return buildWordSlot(text, ctx);
  const found = (await buildSlots(text, ctx)).filter((slot) => Boolean(slot.choice[ctx.provider.id]));
  const slot = found.at(-1) ?? await buildWordSlot(text, ctx);
  return { ...slot, label: text };
}

/** The pages of a Plauderbuch, or none for one nothing was typed into. */
export const pagesOf = (book: TalkBook | undefined): TalkPage[] => book?.pages ?? [];

/** Every row the book points at: each page's question, then its Aussagen. */
export const rowsOf = (book: TalkBook | undefined): string[] =>
  pagesOf(book).flatMap((page) => [...(page.question ? [page.question] : []), ...page.sayings]);

/** The book without a row, wherever it stood — as a question or an Aussage. */
export function withoutRow(book: TalkBook, id: string): TalkBook {
  return {
    pages: book.pages.map((page) => ({
      ...page,
      question: page.question === id ? null : page.question,
      sayings: page.sayings.filter((one) => one !== id),
    })),
  };
}

/** The book with one page changed, found by its id. */
export const withPage = (book: TalkBook, id: string, change: (page: TalkPage) => TalkPage): TalkBook =>
  ({ pages: book.pages.map((page) => (page.id === id ? change(page) : page)) });

/**
 * The book with two Aussagen of a page changed places: how a card waiting
 * under a full page comes onto it — the one it is dropped on goes to wait
 * in its stead. The rest keep their order.
 */
export function withSwapped(book: TalkBook, pageId: string, a: string, b: string): TalkBook {
  return withPage(book, pageId, (page) => {
    const at = page.sayings.indexOf(a);
    const to = page.sayings.indexOf(b);
    if (at === -1 || to === -1 || at === to) return page;
    const sayings = [...page.sayings];
    [sayings[at], sayings[to]] = [sayings[to]!, sayings[at]!];
    return { ...page, sayings };
  });
}
