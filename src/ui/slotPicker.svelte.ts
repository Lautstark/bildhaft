import type { Candidate, ProviderId, Slot } from '../core/types.ts';
import { getProvider, metacom } from '@lautstark/bildquelle';
import { openSheet, type Handle } from '@lautstark/design/svelte/sheet';
import { CLOSE } from './dialog.ts';
import SlotPickerBody from './SlotPickerBody.svelte';
import SlotPickerFoot from './SlotPickerFoot.svelte';
import { cropName, loadSquare, type Loaded } from '@lautstark/design/crop';
import type Crop from '@lautstark/design/svelte/Crop';
import { t } from '../i18n/index.ts';

export interface PickerHandlers {
  onChoose: (candidate: Candidate) => void;
  /**
   * A picture of the user's own, taking the place of any symbol.
   *
   * A Blob and a name rather than the File they used to arrive in, because what
   * is kept is no longer always what was chosen: a picture that went through the
   * square is one bildhaft drew. The name still comes from the file, so the
   * library stays readable.
   */
  onOwnImage: (picture: Blob, name: string) => void;
  onClearOwnImage: () => void;
  /** Lays a red cross over the symbol — METACOM's "nicht". Leaves the dialog open. */
  onNegate: (negated: boolean) => void;
  /**
   * The words that go with the symbol. Empty means the word the sentence used.
   * Leaves the dialog open: the wording is a property of the field, and a
   * person setting one is usually still looking for the right picture.
   */
  onLabel: (label: string) => void;
  /** Removes the whole slot, not just its symbol. */
  onRemove: () => void;
  onClose: () => void;
}

/** What the picker is looking at and what it has been told. */
export class Picking {
  /** The candidates the slot already carried, which include any manual pick. */
  readonly stored: Candidate[];
  /*
   * Nothing is marked while an own picture is showing. The symbol underneath is
   * still remembered — removing the picture uncovers it — but highlighting it
   * would claim the slot shows something it does not.
   */
  readonly chosen: string | null;
  readonly isNew: boolean;

  /** The tiles to show while nothing has been searched. Handed to the search
   *  component, which declines them the moment a word has been searched — so
   *  nothing here has to ask what is in a field it no longer owns. */
  suggested = $state.raw<Candidate[]>([]);
  /** The one thing the search's own status line cannot say: a cut that failed.
   *  Cleared by the next crop, so it is never left standing over a fresh one. */
  cropFailed = $state('');
  caption = $state('');
  negated = $state(false);
  /** A picture waiting to be cut, and then nothing else on the sheet is shown.
   *  It carries the source's own MIME, which is what the shared output policy's
   *  `'source'` type preserves — so nothing beside it has to remember the file. */
  loaded = $state.raw<Loaded | null>(null);
  /** The component drawing that square, so Fertig can ask it for the bytes. */
  cropper: Crop | undefined = $state();

  /*
   * True once a button has decided the outcome. The dialog reports every close,
   * including the ones these buttons cause — without this guard a pick fired the
   * dismissal handler first, which discarded the very slot being filled.
   */
  settled = false;

  /*
   * The sheet, once it exists, and reactive like `cropper` above it.
   *
   * It is filled after `openSheet` returns, because the handle is what that
   * call hands back — so the body is already mounted when it arrives, and the
   * effect in SlotPickerBody that hangs „Enter ist Fertig" off the dialog reads
   * it and finds nothing on its first run. Plain, that effect never ran again
   * and the key did nothing.
   *
   * It only looked like it worked before: bildhaft's own sheet opener left the
   * body's effects for the next flush, so they happened to run after this line.
   * `@lautstark/design/svelte/sheet` flushes before it returns — so that the
   * handle it hands back is complete — and the order became visible. The order
   * was never the guarantee; this is.
   */
  handle: Handle | undefined = $state();

  /** The caption typed but not yet written through, or null for nothing pending. */
  private pending: string | null = null;
  private labelTimer: number | undefined;

  constructor(
    readonly slot: Slot,
    readonly provider: ProviderId,
    readonly handlers: PickerHandlers,
  ) {
    this.stored = slot.candidates[provider] ?? [];
    this.chosen = slot.ownImage ? null : slot.choice[provider] ?? null;
    this.isNew = !slot.concept;
    this.suggested = this.stored;
    this.caption = slot.label ?? '';
    this.negated = slot.negated ?? false;
  }

  idleMessage(): string {
    if (this.isNew) return t('ui.search_to_fill');
    return this.suggested.length > 0
      ? t('ui.suggestions_for', { word: this.slot.concept })
      : t('ui.no_suggestions_for', { word: this.slot.concept });
  }

  /**
   * The folder a candidate's picture sits in, said the way a human would -
   * "PNG ohne Rahmen" - or '' for a file straight under the collection root.
   * Ids only start with the root when the collection came in as a file list
   * or zip, so the root is compared, never assumed.
   */
  folderOf(id: string): string {
    const segments = id.split('/');
    const inside = segments[0] === metacom.rootName ? segments.slice(1) : segments;
    return inside.length > 1 ? inside[inside.length - 2]!.replace(/_/g, ' ') : '';
  }

  /*
   * Slots store only a handful of candidates to keep collections and exports
   * small. Re-query on open for the full list — cached, so this is instant the
   * second time. Stored candidates stay first: they include any manual pick.
   *
   * It no longer asks whether anything has been searched since. The search
   * component holds that state and declines the suggestions itself once a word
   * has landed, which is §6.4's point: filling these in late is just a new value
   * on a prop, and if an answer got there first nothing moves.
   */
  fillSuggestions(): void {
    if (!this.slot.concept) return;
    void getProvider(this.provider).search(this.slot.concept).then((found) => {
      if (found.length === 0) return;
      const seen = new Set(this.stored.map((c) => c.id));
      this.suggested = [...this.stored, ...found.filter((c) => !seen.has(c.id))];
    }).catch(() => undefined);
  }

  /*
   * Typing writes through, so the caption beside the symbol in the row behind the
   * dialog updates as it is typed. Debounced because every write is a database
   * write and a repaint of every row.
   */
  queueLabel(value: string): void {
    this.caption = value;
    this.pending = value;
    window.clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => this.flushLabel(), 260);
  }

  flushLabel(): void {
    window.clearTimeout(this.labelTimer);
    if (this.pending === null) return;
    const value = this.pending;
    this.pending = null;
    this.handlers.onLabel(value);
  }

  /**
   * Going into the square, and coming back out of it.
   *
   * Nothing is written by either. The database is not touched until the press
   * that keeps a square, so cancelling costs exactly what closing this dialog
   * has always cost — which is nothing.
   *
   * **Only ever the user's own file**, which is why this hangs off the upload
   * path and off no other. A symbol from a source is not cropped and must not
   * be: METACOM is read out of a licensed folder and never copied, so a crop of
   * one would be a derivative bildhaft has no business writing, and ARASAAC
   * pictograms are already square line art with nothing to gain. The model, the
   * encoder and the output policy are `@lautstark/design/crop`; that rule is the
   * product's and stays here.
   */
  async beginCrop(file: File): Promise<void> {
    /*
     * The dialog used to settle on the file alone. It stays open for the square
     * instead and settles on the press that keeps one.
     *
     * No crop offered is not a failure and gets no sentence: the picture was
     * already square, or the browser could not read a size off it, and both
     * mean the file goes exactly as it did before this step existed.
     */
    this.cropFailed = '';
    const loaded = await loadSquare(file, file.name).catch(() => null);
    if (!loaded) { this.finish(() => this.handlers.onOwnImage(file, file.name)); return; }
    this.loaded = loaded;
  }

  /** Back to the suggestions, keeping nothing. The one caller left is a cut
   *  that failed: every deliberate way out of a crop is the dialog's own. */
  endCrop(): void {
    this.loaded?.close();
    this.loaded = null;
  }

  /** What Fertig means while a square is being chosen. */
  keepSquare(): void {
    const loaded = this.loaded;
    const cropper = this.cropper;
    if (!loaded || !cropper) return;
    void cropper.cut().then(
      (square) => this.finish(() => this.handlers.onOwnImage(square, cropName(loaded.name, square.type))),
      () => { this.endCrop(); this.cropFailed = t('ui.crop_failed'); });
  }

  teardown(): void {
    // Before anything else: a caption typed and then settled by pressing a
    // symbol must reach the slot ahead of the pick, not after it.
    this.flushLabel();
    // Whatever a crop was loaded from, let go of — including on the ways out
    // that keep the square, which have already cut it by the time this runs.
    this.loaded?.close();
    this.loaded = null;
    window.clearTimeout(this.labelTimer);
  }

  /** Closes the dialog and then runs the outcome the pressed button stands for. */
  finish(outcome: () => void): void {
    this.settled = true;
    this.teardown();
    this.handle?.close();
    outcome();
  }
}

export function openSlotPicker(slot: Slot, provider: ProviderId, handlers: PickerHandlers): void {
  const state = new Picking(slot, provider, handlers);

  const handle = openSheet({
    title: state.isNew ? t('ui.add_slot') : t('ui.symbol_for', { word: slot.sourceToken }),
    closeLabel: CLOSE,
    state,
    body: SlotPickerBody,
    foot: SlotPickerFoot,
    onClose: () => { if (state.settled) return; state.teardown(); handlers.onClose(); },
  });
  state.handle = handle;
}
