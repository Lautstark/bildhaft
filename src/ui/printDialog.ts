import type { PrintSettings, ProviderId, Sentence } from '../core/types.ts';
import { symbolIdsIn } from '../core/types.ts';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import {
  applyPageSetup, applyPlan, clearPageSetup, METACOM_COPYRIGHT, PAGE_MARGIN_MM, paperLabel,
  paperSize, planPages, printSheet, PX_PER_MM,
} from './printSheet.ts';
import { warmSymbols } from './symbols.ts';
import { LOCALE, t } from '../i18n/index.ts';

const PREVIEW_PADDING = 28;

/** What "give the cards a background" starts as before anyone picks a colour. */
const DEFAULT_CARD_BACKGROUND = '#fff3bf';

export interface PrintOptions {
  sentences: Sentence[];
  collectionName: string;
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  provider: ProviderId;
  attribution: string | null;
  onClose: () => void;
}

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

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function openPrintDialog(options: PrintOptions): void {
  let settings = options.settings;
  let preparing = false;
  /** How many sheets of paper this comes to. Measured, never guessed. */
  let pageCount = 1;

  const printRoot = document.getElementById('print-root');
  const frame = el('div', { class: 'preview-frame' });
  const sheetHolder = el('div', { style: { width: 'fit-content' } });
  const scaler = el('div', { class: 'preview-scaler' }, sheetHolder);
  const sizer = el('div', {}, scaler);
  frame.appendChild(sizer);

  const controls = el('div');
  const meta = el('span', { class: 'small faint' });
  /*
   * What the scissors will leave, said where the size is set.
   *
   * "Symbolgröße" is the picture; the cut margin and any frame sit outside it,
   * so 50mm symbols come off the printer as 56mm cards — and a card is what an
   * existing communication board is specified in. Kept as one element across
   * repaints because it is filled in after the sheet is laid out, not while the
   * controls are being built.
   */
  const cardSize = el('span', { class: 'small faint' });
  const printButton = el('button', { class: 'btn primary', attrs: { type: 'button' },
    on: { click: () => void run() } });

  const dialog = openDialog({
    title: options.sentences.length === 1
      ? t('ui.print_row_title')
      : t('ui.print_collection_title', { n: options.sentences.length }),
    wide: true,
    body: [el('div', { class: 'print-layout' }, controls, frame)],
    footer: [
      meta,
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', text: t('ui.close'), attrs: { type: 'button' },
        on: { click: () => close() } }),
      printButton,
    ],
    onClose: () => close(),
  });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    observer.disconnect();
    // The printable copy belongs to this dialog; it must not outlive it, and
    // neither does the paper orientation it asked for.
    printRoot?.replaceChildren();
    clearPageSetup();
    dialog.close();
    options.onClose();
  }

  function set<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]): void {
    settings = { ...settings, [key]: value };
    options.onChange(settings);
    paint();
  }

  /*
   * The browser's own preview appears too late to iterate on, so the real A4
   * sheet is scaled down to fit the panel. Measured rather than hard-coded,
   * because the sheet's height depends on how much fits on it.
   */
  function rescale(): void {
    const sheet = sheetHolder.firstElementChild as HTMLElement | null;
    if (!sheet) return;
    const availableWidth = frame.clientWidth - PREVIEW_PADDING;
    const availableHeight = frame.clientHeight - PREVIEW_PADDING;
    // Fit one full A4 page, so page breaks and the overall grid are judgeable.
    // Further pages scroll rather than shrinking the whole preview.
    const pageHeight = paperSize(settings.paper, settings.orientation).height * PX_PER_MM;
    const scale = Math.min(1, availableWidth / sheet.offsetWidth, availableHeight / pageHeight);
    scaler.style.transform = `scale(${scale})`;
    sizer.style.height = `${sheet.offsetHeight * scale}px`;
  }

  const observer = new ResizeObserver(() => rescale());
  observer.observe(frame);

  async function run(): Promise<void> {
    preparing = true;
    paintFooter();
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
    paint();
    // Two frames so the printable copy is laid out before the dialog opens.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    preparing = false;
    paintFooter();
    window.print();
  }

  /*
   * Measured off the preview rather than worked out from the settings. The
   * height cannot be worked out: a word that wraps to a second line makes its
   * card taller, and that taller card is the one the deck has to be cut to — so
   * the largest card is what gets reported, not the first.
   */
  function paintCardSize(): void {
    const cards = sheetHolder.querySelectorAll<HTMLElement>('.ps-card');
    let width = 0;
    let height = 0;
    for (const node of cards) {
      const box = borderBox(node);
      width = Math.max(width, box.width);
      height = Math.max(height, box.height);
    }
    cardSize.textContent = cards.length === 0 ? '' : t('ui.card_to_cut')
      + `${mmText(width / PX_PER_MM)} × ${mmText(height / PX_PER_MM)} mm.`;
  }

  function paintFooter(): void {
    const paper = `${paperLabel(settings.paper)} ${
      settings.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')}`;
    const cards = settings.layout === 'sheet' && settings.sheetFit === 'grid'
      ? t('ui.grid_meta', { cols: settings.gridCols, rows: settings.gridRows })
      : t('ui.symbol_size_meta', { mm: settings.symbolSizeMm });
    // How much paper this is, said before the paper is used rather than after.
    const pages = t(pageCount === 1 ? 'ui.n_page' : 'ui.n_pages', { n: pageCount });
    meta.textContent =
      `${paper} · ${t('ui.margins_meta', { mm: PAGE_MARGIN_MM })} · ${cards} · ${pages}`;
    printButton.toggleAttribute('disabled', preparing);
    if (preparing) {
      fill(printButton, el('span', { class: 'spinner' }), ` ${t('ui.preparing')}`);
    } else {
      printButton.textContent = t('ui.print');
    }
  }

  function numberOpt(
    id: string, label: string, value: number, min: number, max: number, step: number,
    fallback: number, unit: string, hint: string | Node | null, onInput: (next: number) => void,
  ): HTMLElement {
    const input = el('input', {
      class: 'field',
      attrs: { id, type: 'number', min, max, step, value: String(value), 'aria-label': label },
      on: { input: () => onInput(clamp(input.valueAsNumber, min, max, fallback)) },
    });
    return el('div', { class: 'opt' },
      el('label', { text: label, attrs: { for: id } }),
      el('div', { class: 'opt__row' }, input, el('span', { class: 'opt__unit', text: unit })),
      typeof hint === 'string' ? el('span', { class: 'small faint', text: hint }) : hint,
    );
  }

  function check(label: string, checked: boolean, disabled: boolean, onToggle: (next: boolean) => void): HTMLElement {
    const box = el('input', { attrs: { type: 'checkbox', checked, disabled },
      on: { change: () => onToggle(box.checked) } });
    return el('label', { class: 'opt__check' }, box, label);
  }

  function colorOpt(id: string, label: string, value: string,
    onInput: (next: string) => void): HTMLElement {
    const input = el('input', {
      class: 'swatch',
      attrs: { id, type: 'color', value, 'aria-label': label },
      on: { input: () => onInput(input.value) },
    });
    return el('div', { class: 'opt' },
      el('label', { text: label, attrs: { for: id } }),
      el('div', { class: 'opt__row' }, input),
    );
  }

  function segmented(options_: { label: string; active: boolean; onPick: () => void }[], style?: Partial<CSSStyleDeclaration>): HTMLElement {
    return el('div', { class: 'segmented', style },
      ...options_.map((option) => el('button', {
        text: option.label,
        attrs: { type: 'button', 'aria-pressed': String(option.active) },
        on: { click: option.onPick },
      })));
  }

  function paint(): void {
    const gridded = settings.layout === 'sheet' && settings.sheetFit === 'grid';

    fill(controls,
      el('div', { class: 'opt' },
        el('label', { text: t('ui.layout') }),
        segmented([
          { label: t('ui.layout_strip'), active: settings.layout === 'strip', onPick: () => set('layout', 'strip') },
          { label: t('ui.layout_sheet'), active: settings.layout === 'sheet', onPick: () => set('layout', 'sheet') },
        ]),
        el('span', { class: 'small faint', text: settings.layout === 'strip'
          ? t('ui.layout_strip_note')
          : t('ui.layout_sheet_note') }),
      ),
      el('div', { class: 'opt' },
        el('label', { text: t('ui.paper') }),
        segmented([
          { label: 'A5', active: settings.paper === 'a5', onPick: () => set('paper', 'a5') },
          { label: 'A4', active: settings.paper === 'a4', onPick: () => set('paper', 'a4') },
          { label: 'A3', active: settings.paper === 'a3', onPick: () => set('paper', 'a3') },
        ]),
        segmented([
          { label: t('ui.portrait'), active: settings.orientation === 'portrait',
            onPick: () => set('orientation', 'portrait') },
          { label: t('ui.landscape'), active: settings.orientation === 'landscape',
            onPick: () => set('orientation', 'landscape') },
        ], { marginTop: '6px' }),
      ),
      settings.layout === 'sheet' ? el('div', { class: 'opt' },
        el('label', { text: t('ui.card_size') }),
        segmented([
          { label: t('ui.in_millimetres'), active: !gridded, onPick: () => set('sheetFit', 'size') },
          { label: t('ui.grid'), active: gridded, onPick: () => set('sheetFit', 'grid') },
        ]),
        el('span', { class: 'small faint', text: gridded
          ? t('ui.grid_note')
          : t('ui.fixed_note') }),
      ) : null,
      gridded ? el('div', { class: 'opt' },
        el('div', { class: 'opt--pair' },
          numberOpt('opt-cols', t('ui.columns'), settings.gridCols, 1, 12, 1, 4, '', null,
            (next) => set('gridCols', Math.round(next))),
          numberOpt('opt-rows', t('ui.rows'), settings.gridRows, 1, 12, 1, 3, '', null,
            (next) => set('gridRows', Math.round(next))),
        ),
        cardSize,
      ) : numberOpt('opt-size', t('ui.symbol_size'), settings.symbolSizeMm, 10, 120, 1, 40, 'mm',
        cardSize, (next) => set('symbolSizeMm', next)),
      numberOpt('opt-cut', t('ui.cut_margin'), settings.cutMarginMm, 0, 20, 0.5, 3, 'mm',
        t('ui.cut_margin_note'),
        (next) => set('cutMarginMm', next)),
      el('div', { class: 'opt' },
        check(t('ui.print_label'), settings.showLabel, false, (next) => set('showLabel', next)),
        settings.showLabel ? segmented([
          { label: t('ui.label_below'), active: settings.labelPosition === 'below', onPick: () => set('labelPosition', 'below') },
          { label: t('ui.label_above'), active: settings.labelPosition === 'above', onPick: () => set('labelPosition', 'above') },
        ], { marginTop: '6px' }) : null,
        settings.showLabel
          ? numberOpt('opt-label', t('ui.font_size'), settings.labelSizePt, 5, 40, 0.5, 11, 'pt', null,
              (next) => set('labelSizePt', next))
          : null,
      ),
      el('div', { class: 'opt' },
        el('label', { text: t('ui.frame_colour') }),
        check(t('ui.frame_each'), settings.cardBorderMm > 0, false,
          (next) => set('cardBorderMm', next ? 0.5 : 0)),
        check(t('ui.frame_strip'), settings.stripFrame, settings.layout === 'sheet',
          (next) => set('stripFrame', next)),
        /*
         * Corners and colour belong to whichever frame is switched on — both
         * are drawn with the same pen. Thickness is the card frame's alone: the
         * strip takes its own from that number when there is one, and a line
         * thin enough to cut along when there is not.
         */
        settings.cardBorderMm > 0 || settings.stripFrame ? el('div', { class: 'opt--pair' },
          settings.cardBorderMm > 0
            ? numberOpt('opt-border', t('ui.thickness'), settings.cardBorderMm, 0.1, 5, 0.1, 0.5, 'mm', null,
                (next) => set('cardBorderMm', next))
            : null,
          numberOpt('opt-radius', t('ui.corners'), settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', null,
            (next) => set('cardRadiusMm', next)),
          colorOpt('opt-border-color', t('ui.colour'), settings.cardBorderColor,
            (next) => set('cardBorderColor', next)),
        ) : null,
        check(t('ui.background_colour'), settings.cardBackground !== null, false,
          (next) => set('cardBackground', next ? DEFAULT_CARD_BACKGROUND : null)),
        settings.cardBackground !== null
          ? colorOpt('opt-bg', t('ui.colour'), settings.cardBackground, (next) => set('cardBackground', next))
          : null,
        el('span', { class: 'small faint',
          text: t('ui.background_note') }),
      ),
      el('div', { class: 'opt' },
        check(t('ui.cut_lines'), settings.showCutLines, false, (next) => set('showCutLines', next)),
        check(t('ui.sentence_above'), settings.showSentenceText, settings.layout === 'sheet',
          (next) => set('showSentenceText', next)),
        check(t('ui.one_per_page'), settings.onePerPage, settings.layout === 'sheet',
          (next) => set('onePerPage', next)),
        check(t('ui.collection_title'), settings.showCollectionTitle, false,
          (next) => set('showCollectionTitle', next)),
      ),
      /*
       * METACOM only. ARASAAC's attribution is a licence condition and prints
       * whether anyone asks for it or not, so offering to switch it off would
       * be offering something bildhaft will not do.
       */
      options.provider === 'metacom' ? el('div', { class: 'opt' },
        check(t('ui.print_copyright'), settings.showCopyright, false,
          (next) => set('showCopyright', next)),
        el('span', { class: 'small faint',
          text: t('ui.copyright_note', { notice: METACOM_COPYRIGHT }) }),
      ) : null,
    );

    applyPageSetup(settings.paper, settings.orientation);

    const build = () => printSheet({
      sentences: options.sentences,
      settings,
      provider: options.provider,
      attribution: options.attribution,
      copyright: options.provider === 'metacom' && settings.showCopyright ? METACOM_COPYRIGHT : null,
      collectionName: options.collectionName,
    });

    const preview = build();
    sheetHolder.replaceChildren(preview);
    // The actual printable DOM: same builder, hidden on screen, revealed by
    // @media print. Built separately rather than moved, so neither copy can
    // steal nodes from the other.
    const printable = build();
    printRoot?.replaceChildren(printable);

    /*
     * Where the pages fall, worked out once off the copy that has heights — the
     * printable one is display:none and has none — and then applied to both. One
     * plan for two sheets is what keeps the preview's page boxes and the
     * printer's page breaks the same answer rather than two guesses at it.
     */
    const plan = planPages(preview, settings);
    applyPlan(preview, plan);
    applyPlan(printable, plan);
    pageCount = plan.pages.length;

    paintFooter();
    paintCardSize();
    requestAnimationFrame(rescale);
  }

  paint();
}
