import { NARROW } from '@lautstark/design/svelte/sidebar';
import type { AppSettings, Collection, ProviderId, Sentence } from '../core/types.ts';
import type { CollectionKind } from '../core/types.ts';
import { kindOf } from '../core/types.ts';
import { getProvider } from '@lautstark/bildquelle';

/**
 * Everything the page knows that is not already in the store.
 *
 * One object rather than a closure full of `let`s, because the parts of the
 * controller live in separate modules and each of them writes a few of these
 * fields. A field on a shared object is the smallest thing two modules can
 * both assign to; the alternative — getters and setters per field — describes
 * the same twenty fields three times.
 *
 * Nothing here is derived. What can be computed from these is a function
 * below, so that there is one place the answer comes from.
 *
 * ## Why every field is `$state.raw`
 *
 * A class with rune fields rather than `$state({...})`, because `$state.raw`
 * can only be written on a declaration — and raw is what nearly every field
 * here has to be. `settings`, `collections`, `sentences` and `results` hold
 * records that go back into IndexedDB and through `structuredClone()`, and
 * both refuse a `$state` proxy. Raw also happens to be the truth about how
 * they are written: nothing here is edited in place, every writer replaces the
 * whole value (`s.sentences = s.sentences.map(…)`), which is what a deep proxy
 * would have been for. So the proxies are simply never made, and a snapshot is
 * needed nowhere. adr/0003.
 */
export class AppState {
  settings = $state.raw<AppSettings | null>(null);
  collections = $state.raw<Collection[]>([]);
  counts = $state.raw<Record<string, number>>({});
  activeId = $state<string | null>(null);
  /* Which of the two nouns the main area is showing. `null` is a Sammlung —
     `activeId` stays put while the Wortschatz is open, so leaving it comes
     back to the same one. adr/0002 has why there are two. */
  wortschatz = $state.raw<{ tag: string | null } | null>(null);
  /** What the sidebar's Wortschatz rows count. Read with the Sammlungen. */
  wordCount = $state(0);
  tagRows = $state.raw<{ name: string; count: number }[]>([]);
  sentences = $state.raw<Sentence[]>([]);

  draft = $state('');
  reuse = $state.raw<Sentence | null>(null);
  busy = $state(false);
  /* How far a pasted text has got. Null for a single line, whose spinner in the
     composer is the whole story — see composing.ts. */
  batch = $state.raw<{ done: number; total: number } | null>(null);

  query = $state('');
  results = $state.raw<Sentence[]>([]);

  picker = $state.raw<{ sentenceId: string; slotId: string } | null>(null);

  /*
   * Mobile navigation is deliberately NOT the persisted desktop preference.
   * Sharing one flag meant a sidebar left open on desktop loaded open on the
   * phone — and, when left closed, hid the only control that could reopen it.
   */
  isMobile = $state(false);
  mobileNavOpen = $state(false);

  // A stale tab holding an older database version blocks the upgrade here, which
  // would otherwise present as symbols stuck loading with no explanation.
  dbBlocked = $state(false);

  /*
   * A METACOM folder grant is per site and per browsing session. The index is
   * cached, so the source can report itself ready while every actual file read
   * is refused — the app looks fine and every symbol is blank. Counting
   * unreadable symbols catches that, where asking the provider does not.
   */
  unreadable = $state(0);
  /*
   * False until the first restore attempt finishes. Restoring is asynchronous,
   * so the source reports itself unready for a moment on every single load —
   * judging it before then flashed the warning on screen and took it away again.
   */
  sourceSettled = $state(false);

  /**
   * The source the rows on screen were last resolved against, so that a change
   * of source can be told from a redraw. Boot sets it to what the first paint
   * actually draws with; syncProvider() is the only other writer.
   *
   * Not a rune: nothing draws it. It is a note this module keeps for
   * `syncProvider`, and a rune would make every comparison of it a dependency
   * of whatever happened to be painting.
   */
  previousProvider: ProviderId = 'arasaac';

}

/**
 * Matches the `max-width: 820px` breakpoint used throughout the stylesheet.
 *
 * Re-exported from `@lautstark/design/svelte/sidebar` rather than written out
 * again: the sidebar component subscribes to that same string, and the two have
 * to agree or the controls and the layout disagree about which arrangement is on
 * screen with nothing on either side saying so. conventions.md §6.3.
 */
export const MOBILE_QUERY = NARROW;

/**
 * The one store, made when the module is first read and never replaced.
 *
 * It asks the browser nothing as it is made. `isMobile` is the one field that
 * would have wanted to — and the shell sets it from `MOBILE_QUERY` before its
 * first paint — because this module is reached from `app/print.ts`, which
 * tests/unit/print-for.test.ts imports in a node environment where there is no
 * `window` to ask.
 */
export const s = new AppState();

/* ------------------------------------------------------------ derived --- */

export const activeCollection = (): Collection | null =>
  s.collections.find((c) => c.id === s.activeId) ?? null;

/** The template the open Sammlung is drawn and typed as. */
export const kind = (): CollectionKind => {
  const open = activeCollection();
  return open ? kindOf(open) : 'satzstreifen';
};

/* Zwei Vorlagen halten Wörter und teilen sich deshalb alles, was Wörter
   angeht: die Kachelwand, die Leiste, den Zähler. Was sie unterscheidet, ist
   einzig, was hinten aus dem Drucker kommt. */
export const holdsWords = (): boolean => kind() !== 'satzstreifen';

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
export const providerId = (): ProviderId =>
  activeCollection()?.provider ?? s.settings?.activeProvider ?? 'arasaac';

export const provider = () => getProvider(providerId());

/** True while the open collection is following the default rather than answering. */
export const followsDefault = (): boolean => !activeCollection()?.provider;
