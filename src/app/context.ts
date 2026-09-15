import type { AppSettings, Sentence } from '../core/types.ts';
import type { Board } from '../core/types.ts';
import type { AppState } from './state.ts';

/**
 * What the parts of the controller can ask of each other.
 *
 * `app.ts` used to be one closure of two thousand lines, and every handler in
 * it could call every other by name. The modules under `src/app/` are that
 * closure cut along its own section comments — rows, editing, composing,
 * collections, settings, words, print — and this interface is the list of
 * calls that crossed those cuts. It is deliberately the whole list: a module
 * that needs something not on it adds it here, where the dependency can be
 * seen, rather than importing a sibling and making the graph a tangle again.
 *
 * ## Late binding
 *
 * Every module is a factory `(ctx) => its part of this`, and `app.ts` builds
 * the object by assigning each part onto one `ctx` in turn. So at the moment a
 * factory runs, the members below that belong to a module further down the
 * list are not there yet. That is fine as long as a factory only *closes over*
 * `ctx` and calls nothing on it until an event arrives — which is what every
 * handler does — and it is why a factory must never call `ctx.render()` or
 * any sibling while it is being built.
 *
 * `views` are the two pieces of chrome a module reaches into rather than
 * owns: the name field in the work head, which `handleNewCollection` puts the
 * caret in, and the Wortschatz, which `handleNewTag` opens and names.
 */
export interface Ctx {
  s: AppState;

  /** The one paint. Cheap when nothing moved; see `place()` in ui/dom.ts. */
  render(): void;
  /** The sidebar alone, for a refresh that changed only what it lists. */
  paintSidebar(): void;
  notify(message: string): void;
  /** On mobile the panel overlays the content, so acting on it should dismiss it. */
  closeNavOnMobile(): void;

  views: {
    /** Puts the caret in the Sammlung's name, selected. */
    focusName(): void;
    words: { open(tag: string | null): void; nameIt(): void };
  };

  // collections.ts
  setActive(id: string): void;
  refreshCollections(): Promise<void>;
  handleNewCollection(): Promise<void>;
  handleExport(): Promise<void>;
  handleImport(file: File): Promise<void>;
  confirmDeleteCollection(): Promise<void>;
  openSourceSheet(): void;
  syncProvider(): Promise<void>;
  resolveOpen(): Promise<void>;
  confirmClearAll(): Promise<void>;
  scheduleSearch(): void;

  // settings.ts
  persistSettings(next: AppSettings): void;
  openAppSettings(): void;

  // editing.ts
  openPicker(sentenceId: string, slotId: string): void;
  handleAddSlot(sentenceId: string): Promise<void>;
  handleReorder(sentenceId: string, from: number, to: number): Promise<void>;
  handleRename(sentenceId: string, title: string): Promise<void>;
  confirmDeleteSentence(sentence: Sentence): Promise<void>;
  noteUnreadable(id: string): Promise<void>;

  // material.ts
  writeBoard(change: (board: Board) => Board): Promise<void>;
  handleNewCard(at?: number): Promise<void>;

  // words.ts
  openWortschatzSheet(): Promise<void>;

  // print.ts
  openPrint(ids: string[]): void;
}
