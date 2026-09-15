import type { AppSettings, Collection, ProviderId, Sentence } from '../core/types.ts';
import type { CollectionKind } from '../core/types.ts';
import { kindOf } from '../core/types.ts';
import { getProvider } from '@lautstark/bildquelle';

/**
 * Everything the page knows that is not already in the store.
 *
 * One object rather than a closure full of `let`s, because the parts of the
 * controller live in separate modules now (see `context.ts`) and each of them
 * writes a few of these fields. A field on a shared object is the smallest
 * thing two modules can both assign to; the alternative — getters and setters
 * per field — describes the same twenty fields three times.
 *
 * Nothing here is derived. What can be computed from these is a function
 * below, so that there is one place the answer comes from.
 */
export interface AppState {
  settings: AppSettings | null;
  collections: Collection[];
  counts: Record<string, number>;
  activeId: string | null;
  /* Which of the two nouns the main area is showing. `null` is a Sammlung —
     `activeId` stays put while the Wortschatz is open, so leaving it comes
     back to the same one. adr/0002 has why there are two. */
  wortschatz: { tag: string | null } | null;
  /** What the sidebar's Wortschatz rows count. Read with the Sammlungen. */
  wordCount: number;
  tagRows: { name: string; count: number }[];
  sentences: Sentence[];

  draft: string;
  reuse: Sentence | null;
  busy: boolean;
  /* How far a pasted text has got. Null for a single line, whose spinner in the
     composer is the whole story — see composing.ts. */
  batch: { done: number; total: number } | null;

  query: string;
  results: Sentence[];

  picker: { sentenceId: string; slotId: string } | null;

  /*
   * Mobile navigation is deliberately NOT the persisted desktop preference.
   * Sharing one flag meant a sidebar left open on desktop loaded open on the
   * phone — and, when left closed, hid the only control that could reopen it.
   */
  isMobile: boolean;
  mobileNavOpen: boolean;

  // A stale tab holding an older database version blocks the upgrade here, which
  // would otherwise present as symbols stuck loading with no explanation.
  dbBlocked: boolean;

  /*
   * A METACOM folder grant is per site and per browsing session. The index is
   * cached, so the source can report itself ready while every actual file read
   * is refused — the app looks fine and every symbol is blank. Counting
   * unreadable symbols catches that, where asking the provider does not.
   */
  unreadable: number;
  /*
   * False until the first restore attempt finishes. Restoring is asynchronous,
   * so the source reports itself unready for a moment on every single load —
   * judging it before then flashed the warning on screen and took it away again.
   */
  sourceSettled: boolean;

  /**
   * The source the rows on screen were last resolved against, so that a change
   * of source can be told from a redraw. Boot sets it to what the first paint
   * actually draws with; syncProvider() is the only other writer.
   */
  previousProvider: ProviderId;
}

export function freshState(isMobile: boolean): AppState {
  return {
    settings: null,
    collections: [],
    counts: {},
    activeId: null,
    wortschatz: null,
    wordCount: 0,
    tagRows: [],
    sentences: [],
    draft: '',
    reuse: null,
    busy: false,
    batch: null,
    query: '',
    results: [],
    picker: null,
    isMobile,
    mobileNavOpen: false,
    dbBlocked: false,
    unreadable: 0,
    sourceSettled: false,
    previousProvider: 'arasaac',
  };
}

/* ------------------------------------------------------------ derived --- */

export const activeCollection = (s: AppState): Collection | null =>
  s.collections.find((c) => c.id === s.activeId) ?? null;

/** The template the open Sammlung is drawn and typed as. */
export const kind = (s: AppState): CollectionKind => {
  const open = activeCollection(s);
  return open ? kindOf(open) : 'satzstreifen';
};

/* Zwei Vorlagen halten Wörter und teilen sich deshalb alles, was Wörter
   angeht: die Kachelwand, die Leiste, den Zähler. Was sie unterscheidet, ist
   einzig, was hinten aus dem Drucker kommt. */
export const holdsWords = (s: AppState): boolean => kind(s) !== 'satzstreifen';

/**
 * The symbol source the page is drawing in: the open collection's own answer,
 * or the default it follows when it has none.
 *
 * One function, because everything that shows a symbol already asked this one
 * — the rows, the picker, the print sheet, the banners, the pipeline that
 * fills a new sentence's slots. Moving the answer onto the collection is
 * therefore this line and nothing else, which is what keeps the page from
 * naming one source and rendering another.
 *
 * bildhaft opens exactly one collection at a time — `activeId` is one id, the
 * sidebar is handed `open: [activeId]`, and boot makes one when the library is
 * empty — so there is no case where "the collection you are in" is ambiguous.
 * That is why there is no `nextCollection()` here as there is in mitreden,
 * where two Sammlungen can be open at once and the answer has to be *none*.
 * The `?? settings` arm still earns its place: it is what a collection with no
 * answer of its own reads, which is most of them.
 */
export const providerId = (s: AppState): ProviderId =>
  activeCollection(s)?.provider ?? s.settings?.activeProvider ?? 'arasaac';

export const provider = (s: AppState) => getProvider(providerId(s));

/** True while the open collection is following the default rather than answering. */
export const followsDefault = (s: AppState): boolean => !activeCollection(s)?.provider;
