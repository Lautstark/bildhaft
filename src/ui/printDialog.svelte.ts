import { flushSync, mount, unmount } from 'svelte';
import type { CollectionKind, PrintSettings, ProviderId, Sentence, Slot } from '../core/types.ts';
import { symbolIdsIn } from '../core/types.ts';
import Printable from './Printable.svelte';
import {
  applyPageSetup, bleeds, cardRows, copyrightFor, paperSize, planPages,
  printableArea, PX_PER_MM, sheetBlocks, songPieces, stripLines,
  type Block, type PrintBoard, type PrintGame, type PrintSong, type PrintTalk, type SheetPlan,
} from './printSheet.ts';
import { warmSymbols } from './symbols.ts';
import { previewToPdf } from './pdf.ts';
import { LOCALE, t } from '../i18n/index.ts';
import { settle } from '../app/templates.ts';

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
  /**
   * Keeps the PDF bildhaft made of the preview: into the Ablage folder beside
   * the Sammlung, or as a download where there is none. Absent offers no
   * button for it.
   */
  onPdf?: (pdf: Blob, settings: PrintSettings, pages: number) => Promise<void>;
  /** A Lied, when this is one: its parts as they are sung. */
  song?: PrintSong | null;
  /** A Plauderbuch, when this is one: its pages in order. */
  talk?: PrintTalk | null;
  /** A Spiel, when this is one: its rows in order. */
  game?: PrintGame | null;
  collectionName: string;
  /** The title's symbols: not among `sentences`, which are what the sheet is of. */
  pictures?: Slot[];
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  provider: ProviderId;
  attribution: string | null;
  onClose: () => void;
}

const PREVIEW_PADDING = 28;

/**
 * A millimetre as this app's reader writes one, whole: „36 × 36 mm“. A ruler
 * on a card does not find tenths, and a 0.3 read off a measured preview
 * looked like a card that had come out crooked.
 *
 * The locale follows the page rather than being `de-DE`: a decimal comma in an
 * English sentence is not a smaller mistake than a German word in one, and this
 * readout is a measurement somebody is about to cut paper by.
 */
const mmText = (value: number): string =>
  value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });

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
  /* Raw state, so that the content can be replaced under a live preview
     (`update`) and the blocks follow — the rows change as their symbols are
     looked up, and building the whole preview again for that lost the page
     being looked at and the control being used. */
  options = $state.raw<PrintOptions>({} as PrintOptions);

  settings = $state.raw<PrintSettings>({} as PrintSettings);
  /** How many cards each row of a flowing card sheet came out with. */
  rows = $state.raw<number[] | null>(null);
  /** How many cards each line of a strip too tall for a page came out with. */
  strips = $state.raw<(number[] | null)[] | null>(null);
  /** How many groups each piece of a Lied's part too tall for a page came out with. */
  songs = $state.raw<(number[] | null)[] | null>(null);
  /** How many blocks each page holds. Null while the sheet stands unpaged. */
  pages = $state.raw<number[] | null>(null);
  /** How many sheets of paper this comes to. Measured, never guessed. */
  pageCount = $state(1);
  /** Which page the preview shows. One at a time, turned with the arrows. */
  pageAt = $state(0);
  /**
   * How the preview fits its frame. `frame`: a page within the frame's own
   * size, as the big preview does. `width`: the frame's whole width, and the
   * frame as high as the page then is — up to `maxHeight` — so a page lying
   * on its side leaves no empty band under it, as in the column.
   */
  fit: { kind: 'frame' } | { kind: 'width'; maxHeight: number } | { kind: 'flow' } = { kind: 'frame' };
  preparing = $state(false);
  /**
   * What the scissors will leave, said where the size is set.
   *
   * "Symbolgröße" is the picture; the cut margin and any frame sit outside it,
   * so 50mm symbols come off the printer as 56mm cards — and a card is what an
   * existing communication board is specified in. Where the card is what was
   * typed the sentence turns round: the card is not news, the symbol left
   * inside it is, and so is how many of them the paper takes.
   */
  cardSize = $state('');
  /** Whether that line is reporting or warning — a card the paper cannot hold. */
  cardWarn = $state(false);

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
    song: this.options.song,
    talk: this.options.talk,
    game: this.options.game,
    settings: this.settings,
    provider: this.options.provider,
    attribution: this.options.attribution,
    copyright: copyrightFor(this.options.provider, this.settings.showCopyright),
    collectionName: this.options.collectionName,
    pictures: this.options.pictures,
  }, this.rows, this.strips, this.songs));

  plan: SheetPlan = $derived.by(() => ({ rows: this.rows, pages: this.pages }));

  /** Filled in by the opener, which owns the sheet and the print job. */
  print: () => void = () => undefined;
  /** Makes the PDF of the preview and hands it to `onPdf`. */
  savePdf: () => void = () => undefined;
  saving = $state(false);
  close: () => void = () => undefined;

  constructor(options: PrintOptions) {
    this.options = options;
    this.settings = options.settings;
  }

  /**
   * New content for the same preview: rows changed, a grid resized, a song
   * rewritten. The settings stay the ones on screen — they are what is being
   * edited here — and the pages are planned again a task later, outside
   * whatever effect noticed the change.
   */
  update(options: PrintOptions): void {
    this.options = { ...options, settings: this.settings };
    window.setTimeout(() => this.replan());
  }

  /**
   * Settings written somewhere other than this preview while it is open —
   * the paper pill in the overlay's head, the Zeile over the material.
   * Adopted, not echoed back: `onChange` is for edits made here.
   */
  adopt(settings: PrintSettings): void {
    this.settings = settings;
    this.options = { ...this.options, settings };
    window.setTimeout(() => this.replan());
  }

  set<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]): void {
    const next = { ...this.settings, [key]: value };
    /* What the template always is, worked out again from what just changed. */
    this.settings = settle(this.options.kind, next, this.options.board ?? null);
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
    applyPageSetup(this.settings.paper, this.settings.orientation, bleeds(this.settings));
    this.rows = null;
    this.strips = null;
    this.songs = null;
    this.pages = null;
    flushSync();
    if (!this.sheet) return;
    this.rows = this.settings.layout === 'sheet' && this.settings.sheetFit !== 'grid'
      ? cardRows(this.sheet) : null;
    this.strips = this.settings.layout === 'strip' ? stripLines(this.sheet, this.settings) : null;
    this.songs = this.settings.layout === 'lied' ? songPieces(this.sheet, this.settings) : null;
    flushSync();
    this.pages = planPages(this.sheet!, this.settings);
    flushSync();
    this.pageCount = this.pages.length;
    this.measureCard();
    /* Now, and again once the frame has its size: a preview made while its
       frame is still being laid out measures it a frame late. */
    this.rescale();
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
    this.cardWarn = false;
    if (cards.length === 0) { this.cardSize = ''; return; }
    if (this.settings.layout === 'sheet' && this.settings.sheetFit === 'card') {
      this.measureSymbolLeft();
      return;
    }

    let width = 0;
    let height = 0;
    for (const node of cards) {
      const box = borderBox(node);
      width = Math.max(width, box.width);
      height = Math.max(height, box.height);
    }
    /* On a Tafel nothing is cut and in a strip the symbols stand side by
       side: what is measured there is a field, not a card. */
    this.cardSize = t(this.options.board || this.options.kind === 'satzstreifen' ? 'ui.field_size' : 'ui.card_to_cut')
      + `${mmText(width / PX_PER_MM)} × ${mmText(height / PX_PER_MM)} mm`;
  }

  /**
   * What a card of the size somebody typed leaves for the symbol, and how many
   * such cards this paper takes.
   *
   * The symbol is measured, and it is the shorter side of the box the picture
   * is given: symbols are square, so that is the edge a ruler will find on the
   * printed one.
   *
   * How many fit is the paper's answer rather than this printout's — the paper
   * divided by the card, not the cards that happen to exist today. It is asked
   * while a deck is being planned, and "2 per page" because the Sammlung holds
   * two words would be a fact about the wrong thing. A collection title takes
   * its room off the first page only, and is not counted here for the same
   * reason.
   */
  measureSymbolLeft(): void {
    const page = printableArea(this.settings.paper, this.settings.orientation);
    const height = this.settings.cardHeightMm ?? this.settings.cardWidthMm;
    const cols = Math.floor(page.width / this.settings.cardWidthMm);
    const rows = Math.floor(page.height / height);
    if (cols < 1 || rows < 1) {
      this.cardWarn = true;
      this.cardSize = t('ui.card_too_big');
      return;
    }

    let symbol = 0;
    for (const node of this.holder?.querySelectorAll<HTMLElement>('.ps-card__img') ?? []) {
      const box = borderBox(node);
      symbol = Math.max(symbol, Math.min(box.width, box.height));
    }

    this.cardSize = t('ui.card_readout', {
      mm: mmText(symbol / PX_PER_MM), cols, rows, n: cols * rows,
    });
  }

  /*
   * The browser's own preview appears too late to iterate on, so the real A4
   * sheet is scaled down to fit the panel. Measured rather than hard-coded,
   * because the sheet's height depends on how much fits on it.
   */
  rescale(): void {
    const sheet = this.sheet;
    if (!sheet || !this.frame || !this.scaler || !this.sizer) return;
    // The whole sheet, margin included — which is what a page box in the preview is.
    const pageHeight = paperSize(this.settings.paper, this.settings.orientation).height * PX_PER_MM;
    let scale: number;
    if (this.fit.kind === 'flow') {
      /* Every page below the one before, at the column's width: the frame
         takes the whole scaled stack and the column around it scrolls. */
      scale = Math.min(1, this.frame.clientWidth / sheet.offsetWidth);
      this.frame.style.height = '';
    } else if (this.fit.kind === 'width') {
      scale = Math.min(1, this.frame.clientWidth / sheet.offsetWidth, this.fit.maxHeight / pageHeight);
      this.frame.style.height = `${Math.ceil(pageHeight * scale)}px`;
    } else {
      // Fit one full page, so page breaks and the overall grid are judgeable.
      const availableWidth = this.frame.clientWidth - PREVIEW_PADDING;
      const availableHeight = this.frame.clientHeight - PREVIEW_PADDING;
      scale = Math.min(1, availableWidth / sheet.offsetWidth, availableHeight / pageHeight);
    }
    this.scaler.style.transform = `scale(${scale})`;
    this.sizer.style.height = `${sheet.offsetHeight * scale}px`;
    this.showPage(this.pageAt);
  }

  /**
   * Turns the preview to a page: the frame shows one page at a time and is
   * not scrolled by hand, so a page is always seen whole and the arrows say
   * where in the job it is. Kept inside the pages there are — a sheet that
   * shrinks to two pages while the third was showing shows the second.
   */
  showPage(at: number): void {
    const pages = this.holder?.querySelectorAll<HTMLElement>('.ps-page') ?? [];
    this.pageAt = Math.max(0, Math.min(Math.max(pages.length, 1) - 1, at));
    if (!this.frame) return;
    const page = pages[this.pageAt];
    if (!page || !pages[0]) { this.frame.scrollTop = 0; return; }
    /* Measured in the sheet's own layout and scaled, not off the screen: a
       dialog still growing open reports rectangles mid-animation, and the
       page came to rest with its top edge cut off. */
    const scale = Number(/scale\(([\d.]+)\)/.exec(this.scaler?.style.transform ?? '')?.[1] ?? 1);
    this.frame.scrollTop = (page.offsetTop - pages[0].offsetTop) * scale;
  }
}

/*
 * Whose copy is in #print-root. The column beside a Sammlung holds it while
 * nothing else is open, so the browser's own print (Ctrl+P too) prints what the
 * column shows; the big preview takes it while it is open and hands it back.
 * A stack because that is the whole of the arrangement: one on top, the one
 * underneath waiting.
 */
const owners: { state: Printing; printable: ReturnType<typeof mount> | null }[] = [];

function mountPrintable(entry: { state: Printing; printable: ReturnType<typeof mount> | null }): void {
  const printRoot = document.getElementById('print-root');
  if (!printRoot) return;
  printRoot.replaceChildren();
  /* The actual printable DOM: the same component and the same plan, hidden on
     screen and revealed by @media print. A second instance rather than a moved
     one, so neither copy can steal nodes from the other — and mounted into
     #print-root, which index.html puts outside #app-root because that is what
     @media print hides. */
  entry.printable = mount(Printable, { target: printRoot, props: { s: entry.state } });
}

/* Never open the browser's print over half-loaded images. Asked the same way
   the sheet asks it, so an own picture cannot be missed here and drawn there.
   Then laid out again now that the type is the type: the page plan is
   measured, and a label set in a fallback face is not the same height as the
   same label in the real one. */
async function ready(state: Printing): Promise<void> {
  const { provider, sentences, pictures } = state.options;
  /* The title's symbols are not among the sheet's rows or cards, and are drawn all the same. */
  await warmSymbols(provider, symbolIdsIn(pictures?.length ? [...sentences, { slots: pictures }] : sentences, provider));
  await document.fonts?.ready;
  state.replan();
  // Two frames so the printable copy is laid out before anything reads it.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function run(state: Printing): Promise<void> {
  if (state.preparing) return;
  state.preparing = true;
  try {
    await ready(state);
  } finally {
    state.preparing = false;
  }
  window.print();
}

/* The preview's pages are what the PDF is drawn from, made ready the way the
   printer's copy is. */
async function keep(state: Printing): Promise<void> {
  if (!state.options.onPdf || state.saving) return;
  state.saving = true;
  try {
    await ready(state);
    const pages = [...(state.holder?.querySelectorAll<HTMLElement>('.ps-page') ?? [])];
    const pdf = await previewToPdf(pages, state.settings);
    await state.options.onPdf(pdf, state.settings, pages.length);
  } finally {
    state.saving = false;
  }
}

/**
 * Makes a preview live: its printable copy in #print-root, its print and PDF
 * buttons wired, its pages planned, its scale kept to its frame. Hands back
 * what undoes all of it — and gives #print-root back to whoever had it before.
 *
 * Called once the preview's boxes are bound, which for a component is from an
 * effect, after its first paint.
 */
export function attachPrinting(state: Printing): () => void {
  const below = owners.at(-1);
  if (below?.printable) { void unmount(below.printable); below.printable = null; }
  const entry = { state, printable: null as ReturnType<typeof mount> | null };
  owners.push(entry);
  mountPrintable(entry);
  state.print = () => void run(state);
  state.savePdf = () => void keep(state);
  /* mount() draws, but the effects that hand back the preview's boxes have
     not run yet — and nothing can be measured until they have. */
  flushSync();
  const watching = state.frame ? new ResizeObserver(() => state.rescale()) : null;
  if (state.frame) watching!.observe(state.frame);
  state.replan();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    watching?.disconnect();
    const at = owners.indexOf(entry);
    if (at !== -1) owners.splice(at, 1);
    if (entry.printable) void unmount(entry.printable);
    document.getElementById('print-root')?.replaceChildren();
    /* The @page rule is left as it is: a preview built again attaches a task
       later and writes its own, and clearing it in between left a moment in
       which the printer was told no paper at all. */
    const back = owners.at(-1);
    if (back) {
      mountPrintable(back);
      flushSync();
      back.state.replan();
    }
  };
}
