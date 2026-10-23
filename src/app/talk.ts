import type { Collection, Sentence, Slot, TalkBook, TalkPage } from '../core/types.ts';
import { slotCaption } from '../core/types.ts';
import { pagesOf, withoutRow, withPage } from '../core/talk.ts';
import { deleteSentence, newId, patchCollection, putSentence } from '../db/repo.ts';
import { addLines } from './composing.ts';
import { openPicker } from './editing.ts';
import { activeCollection, s } from './state.svelte.ts';

/**
 * A Plauderbuch changed page by page, where the page stands — the way a
 * Lied's parts are. The box at the top adds Aussagen to the outlined page;
 * each page has its own „+ Aussage", „✎ Frage" and „✎ Text".
 *
 * Every write goes through the book on the Sammlung: a row is only on a page
 * because the book says so, and a row the book no longer names is deleted
 * with it, so nothing is left in the Sammlung that no page shows.
 */

const linesOf = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

/** What a card reads as on the page, and in its text: its caption. */
export const shown = (sentence: Sentence): string =>
  (sentence.slots[0] ? slotCaption(sentence.slots[0]) : '') || sentence.rawInput;

/** The page the box writes onto: the one chosen, or the last. */
export function targetPage(): TalkPage | null {
  const pages = pagesOf(activeCollection()?.talk);
  return pages.find((page) => page.id === s.talkPage) ?? pages.at(-1) ?? null;
}

/** A page's Aussagen as text, one a line, for writing them again. */
export function sayingsText(page: TalkPage): string {
  const byId = new Map(s.sentences.map((sentence) => [sentence.id, sentence]));
  return page.sayings.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x)).map(shown).join('\n');
}

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
 * Lines added as Aussagen at the end of a page — the box's page when none is
 * named. An empty book gets its first page. Hands back what could not be
 * added, for the field it came from.
 */
export async function addSayings(text: string, pageId?: string): Promise<string> {
  const open = activeCollection();
  if (!open || !text.trim() || s.busy) return text;
  const aimed = pageId ?? targetPage()?.id;
  const cards = await cardsFor(text);
  if (!cards) return text;
  const fresh = activeCollection();
  if (!fresh || fresh.id !== open.id) return '';
  const book = bookWithPage(fresh);
  const page = book.pages.find((one) => one.id === aimed) ?? book.pages.at(-1)!;
  await keepBook(fresh, withPage(book, page.id, (one) => ({ ...one, sayings: [...one.sayings, ...cards.ids] })));
  return '';
}

/**
 * Eine leere Aussage auf die Seite, und der Picker dazu auf: die „+"-Kachel
 * des Plauderbuchs ist dieselbe wie die der Wand und des Rezepts.
 */
export async function addSayingCard(pageId?: string): Promise<void> {
  const open = activeCollection();
  if (!open || s.busy) return;
  const aimed = pageId ?? targetPage()?.id;
  const slot: Slot = { id: newId(), sourceToken: '', concept: '', origin: 'manual', choice: {}, candidates: {} };
  const now = Date.now();
  const sentence: Sentence = {
    id: newId(), normalizedInput: '', rawInput: '', slots: [slot],
    collectionId: open.id, createdAt: now, updatedAt: now,
  };
  await putSentence(sentence);
  s.sentences = [...s.sentences, sentence];
  const fresh = activeCollection();
  if (!fresh || fresh.id !== open.id) return;
  const book = bookWithPage(fresh);
  const page = book.pages.find((one) => one.id === aimed) ?? book.pages.at(-1)!;
  await keepBook(fresh, withPage(book, page.id, (one) => ({ ...one, sayings: [...one.sayings, sentence.id] })));
  openPicker(sentence.id, slot.id);
}

/**
 * Eine leere Frage auf die Seite, und der Picker dazu auf — die „+"-Kachel
 * der Frage ist die der Titelzeile.
 */
export async function addQuestionCard(pageId?: string): Promise<void> {
  const open = activeCollection();
  if (!open || s.busy) return;
  const aimed = pageId ?? targetPage()?.id;
  const slot: Slot = { id: newId(), sourceToken: '', concept: '', origin: 'manual', choice: {}, candidates: {} };
  const now = Date.now();
  const sentence: Sentence = {
    id: newId(), normalizedInput: '', rawInput: '', slots: [slot],
    collectionId: open.id, createdAt: now, updatedAt: now,
  };
  await putSentence(sentence);
  s.sentences = [...s.sentences, sentence];
  const fresh = activeCollection();
  if (!fresh || fresh.id !== open.id) return;
  const book = bookWithPage(fresh);
  const page = book.pages.find((one) => one.id === aimed) ?? book.pages.at(-1)!;
  await keepBook(fresh, withPage(book, page.id, (one) => ({ ...one, question: sentence.id })));
  openPicker(sentence.id, slot.id);
}

/** A new empty page after the last, and the box's page from now on. */
export async function addPage(): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const book = pagesOf(open.talk).length > 0 ? open.talk! : { pages: [] };
  const id = newId();
  await keepBook(open, { pages: [...book.pages, { id, question: null, sayings: [] }] });
  s.talkPage = id;
}

/**
 * A page's question written, written again, or taken off with an empty
 * line. The same question again keeps its card and the picture fixed in it.
 */
export async function setQuestion(pageId: string | null, text: string): Promise<string> {
  const open = activeCollection();
  if (!open || s.busy) return text;
  const line = text.trim().replace(/\s+/g, ' ');
  const held = pagesOf(open.talk).find((one) => one.id === pageId)?.question ?? null;
  const before = held ? s.sentences.find((sentence) => sentence.id === held) : undefined;
  if (before && shown(before) === line) return '';
  if (!before && !line) return '';
  let id: string | null = null;
  if (line) {
    const cards = await cardsFor(line);
    if (!cards) return text;
    id = cards.ids[0] ?? null;
  }
  const fresh = activeCollection();
  if (!fresh || fresh.id !== open.id) return '';
  const book = bookWithPage(fresh);
  const page = book.pages.find((one) => one.id === pageId) ?? book.pages.at(-1)!;
  await keepBook(fresh, withPage(book, page.id, (one) => ({ ...one, question: id })));
  if (page.question) await dropRows([page.question]);
  return '';
}

/**
 * A page's Aussagen written again as text. A line that is kept keeps its
 * card and every picture fixed in it; only new lines are looked up; lines
 * taken out go. The order is the text's.
 */
export async function rewriteSayings(pageId: string, text: string): Promise<string> {
  const open = activeCollection();
  const page = pagesOf(open?.talk).find((one) => one.id === pageId);
  if (!open || !page || s.busy) return text;
  const byId = new Map(s.sentences.map((sentence) => [sentence.id, sentence]));
  const pool = page.sayings.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x));
  const lines = linesOf(text);
  const kept = lines.map((line) => {
    const at = pool.findIndex((sentence) => shown(sentence).trim() === line || sentence.rawInput.trim() === line);
    return at === -1 ? null : pool.splice(at, 1)[0]!.id;
  });
  const fresh = lines.filter((_, at) => !kept[at]);
  const cards = await cardsFor(fresh.join('\n'));
  if (!cards) return text;
  const made = [...cards.ids];
  const sayings = kept.map((id) => id ?? made.shift()!).filter(Boolean);
  const now = activeCollection();
  if (!now?.talk || now.id !== open.id) return '';
  await keepBook(now, withPage(now.talk, pageId, (one) => ({ ...one, sayings })));
  await dropRows(pool.map((sentence) => sentence.id));
  return '';
}

/** A page taken out of the book, with its question and its Aussagen. */
export async function removePage(pageId: string): Promise<void> {
  const open = activeCollection();
  const page = pagesOf(open?.talk).find((one) => one.id === pageId);
  if (!open?.talk || !page) return;
  await keepBook(open, { pages: open.talk.pages.filter((one) => one.id !== pageId) });
  await dropRows([...(page.question ? [page.question] : []), ...page.sayings]);
  if (s.talkPage === pageId) s.talkPage = null;
}

/** A card deleted where it stands: out of the book too. */
export async function takeOutOfTalk(sentence: Sentence): Promise<void> {
  const open = activeCollection();
  if (!open?.talk) return;
  await keepBook(open, withoutRow(open.talk, sentence.id));
}
