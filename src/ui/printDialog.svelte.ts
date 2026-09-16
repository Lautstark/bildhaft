import { flushSync, mount, unmount } from 'svelte';
import type { CollectionKind, PrintSettings, ProviderId, Sentence } from '../core/types.ts';
import { symbolIdsIn } from '../core/types.ts';
import { openSheet } from './sheet.svelte.ts';
import PrintBody from './PrintBody.svelte';
import PrintFoot from './PrintFoot.svelte';
import Printable from './Printable.svelte';
import {
  applyPageSetup, cardRows, clearPageSetup, METACOM_COPYRIGHT, paperSize, planPages,
  PX_PER_MM, sheetBlocks,
  type Block, type PrintBoard, type SheetPlan,
} from './printSheet.ts';
import { warmSymbols } from './symbols.ts';
import { LOCALE, t } from '../i18n/index.ts';

export interface PrintOptions {
  sentences: Sentence[];
  /**
   * Which template is printing. It decides which options are offered at all:
   * a strip has a frame around the sentence and a card sheet has cut lines,
   * and an option that cannot mean anything for this material is not shown
   * greyed out — it is not shown.
   */
  kind: CollectionKind;
  /**
   * A Tafel, when this is one. Its grid is the Sammlung's and not a print
   * setting, so the controls that would change the layout or the grid are not
   * offered — the paper, the margins and the frames still are.
   */
  board?: PrintBoard | null;
  collectionName: string;
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  provider: ProviderId;
  attribution: string | null;
  onClose: () => void;
}

const PREVIEW_PADDING = 28;

/**
 * A millimetre as this app's reader writes one, and no trailing zero.
 *
 * The locale follows the page rather than being `de-DE`: a decimal comma in an
 * English sentence is not a smaller mistake than a German word in one, and this
 * readout is a measurement somebody is about to cut paper by.
 */
const mmText = (value: number): string =>
  value.toLocaleString(LOCALE, { maximumFractionDigits: 1 });

/*
 * An element's border box, in CSS pixels.
 *
 * getBoundingClientRect() cannot be used: the preview sits under a scale()
 * transform and would report what is on screen rather than what is on paper.
 * offsetWidth is untransformed but rounded to whole pixels, which is a tenth of
 * a millimetre of error in a readout whose whole subject is millimetres. The
 * computed style is neither — but it reports whichever box box-sizing put the
 * element in, so the padding and the border are added back only when they are
 * not already counted.
 */
function borderBox(node: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(node);
  const sum = (...parts: string[]) => parts.reduce((total, part) => total + parseFloat(part), 0);
  if (style.boxSizing === 'border-box') {
    return { width: parseFloat(style.width), height: parseFloat(style.height) };
  }
  return {
    width: sum(style.width, style.paddingLeft, style.paddingRight,
      style.borderLeftWidth, style.borderRightWidth),
    height: sum(style.height, style.paddingTop, style.paddingBottom,
      style.borderTopWidth, style.borderBottomWidth),
  };
}

/**
 * What the dialog is looking at, and what it has measured.
 *
 * A class rather than a plain object so the fields can be `$state.raw`: the
 * settings record goes back into IndexedDB through `onChange`, and a deep proxy
 * is the one thing that write refuses. adr/0003.
 */
export class Printing {
  /* Declared ahead of the derived fields below, which read it: a class field's
     initializer runs before a constructor's body, so a parameter property would
     be assigned after them. */
  readonly options: PrintOptions;

  settings = $state.raw<PrintSettings>({} as PrintSettings);
  /** How many cards each row of a flowing card sheet came out with. */
  rows = $state.raw<number[] | null>(null);
  /** How many blocks each page holds. Null while the sheet stands unpaged. */
  pages = $state.raw<number[] | null>(null);
  /** How many sheets of paper this comes to. Measured, never guessed. */
  pageCount = $state(1);
  preparing = $state(false);
  /**
   * What the scissors will leave, said where the size is set.
   *
   * "Symbolgröße" is the picture; the cut margin and any frame sit outside it,
   * so 50mm symbols come off the printer as 56mm cards — and a card is what an
   * existing communication board is specified in.
   */
  cardSize = $state('');

  /** The boxes the preview is built out of, bound by the body component. */
  holder: HTMLElement | undefined = $state();
  frame: HTMLElement | undefined = $state();
  scaler: HTMLElement | undefined = $state();
  sizer: HTMLElement | undefined = $state();

  /* `$derived.by` rather than `$derived`, and the reason is the type checker
     rather than the runtime: a class field's initializer is an expression that
     runs before the constructor body, so a direct read of `this.options` in one
     is reported as a use before assignment. Inside the callback it is deferred,
     which is what a derived is anyway. */
  blocks: Block[] = $derived.by(() => sheetBlocks({
    sentences: this.options.sentences,
    board: this.options.board,
    settings: this.settings,
    provider: this.options.provider,
    attribution: this.options.attribution,
    copyright: this.options.provider === 'metacom' && this.settings.showCopyright
      ? METACOM_COPYRIGHT : null,
    collectionName: this.options.collectionName,
  }, this.rows));

  plan: SheetPlan = $derived.by(() => ({ rows: this.rows, pages: this.pages }));

  /** Filled in by the opener, which owns the sheet and the print job. */
  print: () => void = () => undefined;
  close: () => void = () => undefined;

  constructor(options: PrintOptions) {
    this.options = options;
    this.settings = options.settings;
  }

  set<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]): void {
    this.settings = { ...this.settings, [key]: value };
    this.options.onChange(this.settings);
    this.replan();
  }

  /** The sheet in the preview, which is the only copy that has heights. */
  get sheet(): HTMLElement | null {
    return (this.holder?.firstElementChild as HTMLElement | null) ?? null;
  }

  /**
   * The two measurements, in the order they can be made.
   *
   * Each one needs the paint before it to have happened, which is what
   * `flushSync` is for: the sheet stands flat, its rows are read off it, it is
   * drawn again as rows, and only then can the blocks be packed into pages.
   * The hand-written sheet did the same three passes by cutting the DOM up in
   * place; this hands the answer back as data and lets the component draw it,
   * which is what keeps the printable copy identical without it being measured
   * at all — #print-root is `display: none` and has no heights.
   *
   * It runs from a press or from the opener, never from an effect: `flushSync`
   * inside one is a re-entrant flush, and Svelte refuses it.
   */
  replan(): void {
    applyPageSetup(this.settings.paper, this.settings.orientation);
    this.rows = null;
    this.pages = null;
    flushSync();
    if (!this.sheet) return;
    this.rows = this.settings.layout === 'sheet' && this.settings.sheetFit !== 'grid'
      ? cardRows(this.sheet) : null;
    flushSync();
    this.pages = planPages(this.sheet!, this.settings);
    flushSync();
    this.pageCount = this.pages.length;
    this.measureCard();
    requestAnimationFrame(() => this.rescale());
  }

  /*
   * Measured off the preview rather than worked out from the settings. The
   * height cannot be worked out: a word that wraps to a second line makes its
   * card taller, and that taller card is the one the deck has to be cut to — so
   * the largest card is what gets reported, not the first.
   */
  measureCard(): void {
    const cards = this.holder?.querySelectorAll<HTMLElement>('.ps-card') ?? [];
    let width = 0;
    let height = 0;
    for (const node of cards) {
      const box = borderBox(node);
      width = Math.max(width, box.width);
      height = Math.max(height, box.height);
    }
    this.cardSize = cards.length === 0 ? '' : t('ui.card_to_cut')
      + `${mmText(width / PX_PER_MM)} × ${mmText(height / PX_PER_MM)} mm.`;
  }

  /*
   * The browser's own preview appears too late to iterate on, so the real A4
   * sheet is scaled down to fit the panel. Measured rather than hard-coded,
   * because the sheet's height depends on how much fits on it.
   */
  rescale(): void {
    const sheet = this.sheet;
    if (!sheet || !this.frame || !this.scaler || !this.sizer) return;
    const availableWidth = this.frame.clientWidth - PREVIEW_PADDING;
    const availableHeight = this.frame.clientHeight - PREVIEW_PADDING;
    // Fit one full A4 page, so page breaks and the overall grid are judgeable.
    // Further pages scroll rather than shrinking the whole preview.
    const pageHeight = paperSize(this.settings.paper, this.settings.orientation).height * PX_PER_MM;
    const scale = Math.min(1, availableWidth / sheet.offsetWidth, availableHeight / pageHeight);
    this.scaler.style.transform = `scale(${scale})`;
    this.sizer.style.height = `${sheet.offsetHeight * scale}px`;
  }
}

export function openPrintDialog(options: PrintOptions): void {
  const printRoot = document.getElementById('print-root');
  const state = new Printing(options);

  async function run(): Promise<void> {
    state.preparing = true;
    // Never open the print dialog over half-loaded images. Asked the same way
    // the sheet asks it, so an own picture cannot be missed here and drawn
    // there.
    await warmSymbols(options.provider, symbolIdsIn(options.sentences, options.provider));
    await document.fonts?.ready;
    /*
     * Laid out again now that the type is the type. The page plan is measured,
     * and a label set in a fallback face is not the same height as the same
     * label in the real one — so a plan made before the fonts arrived can put a
     * break where the printer would not.
     */
    state.replan();
    // Two frames so the printable copy is laid out before the dialog opens.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    state.preparing = false;
    window.print();
  }

  let watching: ResizeObserver | null = null;
  let closed = false;

  const sheet = openSheet({
    title: options.board
      ? t('ui.print_board_title', { cols: options.board.cols, rows: options.board.rows })
      : options.sentences.length === 1
        ? t('ui.print_row_title')
        : t('ui.print_collection_title', { n: options.sentences.length }),
    wide: true,
    state,
    body: PrintBody,
    foot: PrintFoot,
    onClose: () => {
      if (closed) return;
      closed = true;
      watching?.disconnect();
      // The printable copy belongs to this dialog; it must not outlive it, and
      // neither does the paper orientation it asked for.
      void unmount(printable);
      printRoot?.replaceChildren();
      clearPageSetup();
      options.onClose();
    },
  });

  state.print = () => void run();
  state.close = () => sheet.close();

  /* The actual printable DOM: the same component and the same plan, hidden on
     screen and revealed by @media print. A second instance rather than a moved
     one, so neither copy can steal nodes from the other — and mounted into
     #print-root, which index.html puts outside #app-root because that is what
     @media print hides. */
  const printable = mount(Printable, { target: printRoot!, props: { s: state } });

  /* mount() draws, but the effects that hand back the preview's boxes have not
     run yet — and nothing can be measured until they have. */
  flushSync();
  if (state.frame) {
    watching = new ResizeObserver(() => state.rescale());
    watching.observe(state.frame);
  }
  state.replan();
}
