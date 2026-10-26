import type { Collection, Sentence, TalkBook } from '../core/types.ts';
import { picturesOf } from '../core/types.ts';
import { pagesOf, withoutRow, withPage, withSwapped } from '../core/talk.ts';
import { deleteSentence, newId, patchCollection, putSentence } from '../db/repo.ts';
import { addLines } from './composing.ts';
import { emptySlot, handleAddSlot, openPicker } from './editing.ts';
import { activeCollection, s } from './state.svelte.ts';

/**
 * A Plauderbuch changed page by page, where the page stands — the way a
 * Lied's parts are: each page has its Frage, written as a title is (its
 * symbols, a „+", its words), and the „+" at the end of its Antworten.
 *
 * Every write goes through the book on the Sammlung: a row is only on a page
 * because the book says so, and a row the book no longer names is deleted
 * with it, so nothing is left in the Sammlung that no page shows.
 */

const linesOf = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

async function keepBook(open: Collection, talk: TalkBook): Promise<void> {
  const next: Collection = { ...open, talk, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  await patchCollection(next.id, { talk });
}

/**
 * The book as it now stands, with one empty page when it has none — the
 * page an empty Plauderbuch shows to begin on, made real by what is written
 * on it. Asked for after the cards are made, never before: the box is only
 * held busy once the lookup starts, and a page written first left a gap in
 * which a second line could start its lookup and send the first one back.
 */
function bookWithPage(open: Collection): TalkBook {
  return pagesOf(open.talk).length > 0 ? open.talk! : { pages: [{ id: newId(), question: null, sayings: [] }] };
}

/**
 * Cards for the lines, in the order of the lines. Null when any line found
 * no row: a page an Aussage short says nothing about it, so nothing is
 * placed until every line has its card. The rows that did arrive are taken
 * out again — no page shows them.
 */
async function cardsFor(text: string): Promise<{ ids: string[]; left: string } | null> {
  const lines = linesOf(text);
  if (lines.length === 0) return { ids: [], left: '' };
  const made = new Map<string, Sentence[]>();
  const left = await addLines(lines.join('\n'), 'aussage', (line, sentence) => {
    made.set(line, [...(made.get(line) ?? []), sentence]);
  });
  const ids = lines.map((line) => made.get(line)?.shift()?.id).filter((id): id is string => Boolean(id));
  if (left) {
    for (const id of ids) await deleteSentence(id);
    s.sentences = s.sentences.filter((sentence) => !ids.includes(sentence.id));
    return null;
  }
  return { ids, left: '' };
}

/** Rows deleted that no page names any more. */
async function dropRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) await deleteSentence(id);
  const gone = new Set(ids);
  s.sentences = s.sentences.filter((sentence) => !gone.has(sentence.id));
}

/**
 * A card made by a „+", with the picker open on it — the „+" a Wortkarten-
 * Sammlung's wall and a Rezept's Zutaten end with: a new Antwort at the end
 * of its page, or the question of a page that has none, its symbol chosen
 * first. Closed without a choice, the card goes again (editing.ts). An empty
 * book gets its first page.
 */
export async function addCard(where: 'question' | 'saying', pageId?: string): Promise<void> {
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
  const book = bookWithPage(open);
  const page = book.pages.find((one) => one.id === pageId) ?? book.pages.at(-1)!;
  await keepBook(open, withPage(book, page.id, (one) => (where === 'question'
    ? { ...one, question: sentence.id }
    : { ...one, sayings: [...one.sayings, sentence.id] })));
  openPicker(sentence.id, slot.id);
}


/** A new empty page after the last. */
export async function addPage(): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const book = pagesOf(open.talk).length > 0 ? open.talk! : { pages: [] };
  const id = newId();
  await keepBook(open, { pages: [...book.pages, { id, question: null, sayings: [] }] });
}

/**
 * A page's question written where it stands, as a title is. The first words
 * on a page make its question, looked up as an Aussage is so it comes with
 * a picture; words written again only change the words, and keep every
 * symbol chosen for it. Emptied, a question with no symbol goes.
 */
export async function writeQuestion(pageId: string | null, text: string): Promise<void> {
  const open = activeCollection();
  if (!open || s.busy) return;
  const line = text.trim().replace(/\s+/g, ' ');
  const id = pagesOf(open.talk).find((one) => one.id === pageId)?.question ?? null;
  const held = id ? s.sentences.find((sentence) => sentence.id === id) : undefined;
  if (held) {
    if (line === held.rawInput) return;
    if (!line && picturesOf(held).length === 0) {
      await keepBook(open, withPage(open.talk!, pageId!, (one) => ({ ...one, question: null })));
      await dropRows([held.id]);
      return;
    }
    const next: Sentence = { ...held, rawInput: line, normalizedInput: line.toLowerCase(), updatedAt: Date.now() };
    await putSentence(next);
    s.sentences = s.sentences.map((sentence) => (sentence.id === next.id ? next : sentence));
    return;
  }
  if (!line) return;
  const cards = await cardsFor(line);
  const made = cards?.ids[0];
  const fresh = activeCollection();
  if (!made || !fresh || fresh.id !== open.id) return;
  const book = bookWithPage(fresh);
  const page = book.pages.find((one) => one.id === pageId) ?? book.pages.at(-1)!;
  await keepBook(fresh, withPage(book, page.id, (one) => ({ ...one, question: made })));
}

/** One more symbol for a page's question, chosen in the picker — the first one makes the question. */
export async function addQuestionSymbol(pageId: string | null): Promise<void> {
  const id = pagesOf(activeCollection()?.talk).find((one) => one.id === pageId)?.question;
  if (id) await handleAddSlot(id);
  else await addCard('question', pageId ?? undefined);
}

/** A page taken out of the book, with its question and its Aussagen. */
export async function removePage(pageId: string): Promise<void> {
  const open = activeCollection();
  const page = pagesOf(open?.talk).find((one) => one.id === pageId);
  if (!open?.talk || !page) return;
  await keepBook(open, { pages: open.talk.pages.filter((one) => one.id !== pageId) });
  await dropRows([...(page.question ? [page.question] : []), ...page.sayings]);
}

/** Two Aussagen of a page changed places: a waiting card onto the page, the other off it. */
export async function swapSayings(pageId: string, a: string, b: string): Promise<void> {
  const open = activeCollection();
  if (!open?.talk) return;
  await keepBook(open, withSwapped(open.talk, pageId, a, b));
}

/** A card deleted where it stands: out of the book too. */
export async function takeOutOfTalk(sentence: Sentence): Promise<void> {
  const open = activeCollection();
  if (!open?.talk) return;
  await keepBook(open, withoutRow(open.talk, sentence.id));
}
