import type { PrintSettings, ProviderId, Sentence } from '../core/types.ts';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { printSheet } from './printSheet.ts';
import { warmSymbols } from './symbols.ts';

/** A4 at the CSS reference resolution of 96dpi. */
const A4_HEIGHT_PX = (297 / 25.4) * 96;
const PREVIEW_PADDING = 28;

export interface PrintOptions {
  sentences: Sentence[];
  collectionName: string;
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  provider: ProviderId;
  attribution: string | null;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function openPrintDialog(options: PrintOptions): void {
  let settings = options.settings;
  let preparing = false;

  const printRoot = document.getElementById('print-root');
  const frame = el('div', { class: 'preview-frame' });
  const sheetHolder = el('div', { style: { width: 'fit-content' } });
  const scaler = el('div', { class: 'preview-scaler' }, sheetHolder);
  const sizer = el('div', {}, scaler);
  frame.appendChild(sizer);

  const controls = el('div');
  const meta = el('span', { class: 'small faint' });
  const printButton = el('button', { class: 'btn primary', attrs: { type: 'button' },
    on: { click: () => void run() } });

  const dialog = openDialog({
    title: options.sentences.length === 1
      ? 'Zeile drucken'
      : `Sammlung drucken (${options.sentences.length} Zeilen)`,
    wide: true,
    body: [el('div', { class: 'print-layout' }, controls, frame)],
    footer: [
      meta,
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', text: 'Schließen', attrs: { type: 'button' },
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
    // The printable copy belongs to this dialog; it must not outlive it.
    printRoot?.replaceChildren();
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
    const scale = Math.min(1, availableWidth / sheet.offsetWidth, availableHeight / A4_HEIGHT_PX);
    scaler.style.transform = `scale(${scale})`;
    sizer.style.height = `${sheet.offsetHeight * scale}px`;
  }

  const observer = new ResizeObserver(() => rescale());
  observer.observe(frame);

  async function run(): Promise<void> {
    preparing = true;
    paintFooter();
    // Never open the print dialog over half-loaded images.
    const ids = options.sentences.flatMap((sentence) =>
      sentence.slots.map((slot) => slot.choice[options.provider]).filter((id): id is string => Boolean(id)));
    await warmSymbols(options.provider, ids);
    await document.fonts?.ready;
    // Two frames so the printable copy is laid out before the dialog opens.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    preparing = false;
    paintFooter();
    window.print();
  }

  function paintFooter(): void {
    meta.textContent = `A4 · Ränder 10 mm · ${settings.symbolSizeMm} mm Symbole`;
    printButton.toggleAttribute('disabled', preparing);
    if (preparing) {
      fill(printButton, el('span', { class: 'spinner' }), ' Bereite vor …');
    } else {
      printButton.textContent = 'Drucken';
    }
  }

  function numberOpt(
    id: string, label: string, value: number, min: number, max: number, step: number,
    fallback: number, unit: string, hint: string | null, onInput: (next: number) => void,
  ): HTMLElement {
    const input = el('input', {
      class: 'field',
      attrs: { id, type: 'number', min, max, step, value: String(value), 'aria-label': label },
      on: { input: () => onInput(clamp(input.valueAsNumber, min, max, fallback)) },
    });
    return el('div', { class: 'opt' },
      el('label', { text: label, attrs: { for: id } }),
      el('div', { class: 'opt__row' }, input, el('span', { class: 'opt__unit', text: unit })),
      hint ? el('span', { class: 'small faint', text: hint }) : null,
    );
  }

  function check(label: string, checked: boolean, disabled: boolean, onToggle: (next: boolean) => void): HTMLElement {
    const box = el('input', { attrs: { type: 'checkbox', checked, disabled },
      on: { change: () => onToggle(box.checked) } });
    return el('label', { class: 'opt__check' }, box, label);
  }

  function segmented(options_: { label: string; active: boolean; onPick: () => void }[], style?: Partial<CSSStyleDeclaration>): HTMLElement {
    return el('div', { class: 'segmented', style },
      ...options_.map((option) => el('button', {
        text: option.label,
        attrs: { type: 'button', 'aria-pressed': option.active },
        on: { click: option.onPick },
      })));
  }

  function paint(): void {
    fill(controls,
      el('div', { class: 'opt' },
        el('label', { text: 'Layout' }),
        segmented([
          { label: 'Satzstreifen', active: settings.layout === 'strip', onPick: () => set('layout', 'strip') },
          { label: 'Kartenblatt', active: settings.layout === 'sheet', onPick: () => set('layout', 'sheet') },
        ]),
        el('span', { class: 'small faint', text: settings.layout === 'strip'
          ? 'Eine Reihe pro Satz, in Leserichtung.'
          : 'Raster einzelner Karten zum Ausschneiden. Doppelte Symbole erscheinen nur einmal.' }),
      ),
      numberOpt('opt-size', 'Symbolgröße', settings.symbolSizeMm, 10, 120, 1, 40, 'mm', null,
        (next) => set('symbolSizeMm', next)),
      numberOpt('opt-cut', 'Schneiderand', settings.cutMarginMm, 0, 20, 0.5, 3, 'mm',
        'Weißer Rand pro Karte, damit die Laminierfolie dicht abschließt.',
        (next) => set('cutMarginMm', next)),
      el('div', { class: 'opt' },
        check('Wort unter dem Symbol', settings.showLabel, false, (next) => set('showLabel', next)),
        settings.showLabel ? segmented([
          { label: 'unten', active: settings.labelPosition === 'below', onPick: () => set('labelPosition', 'below') },
          { label: 'oben', active: settings.labelPosition === 'above', onPick: () => set('labelPosition', 'above') },
        ], { marginTop: '6px' }) : null,
        settings.showLabel
          ? numberOpt('opt-label', 'Schriftgröße', settings.labelSizePt, 5, 40, 0.5, 11, 'pt', null,
              (next) => set('labelSizePt', next))
          : null,
      ),
      el('div', { class: 'opt' },
        check('Schnittlinien anzeigen', settings.showCutLines, false, (next) => set('showCutLines', next)),
        check('Satztext über der Reihe', settings.showSentenceText, settings.layout === 'sheet',
          (next) => set('showSentenceText', next)),
        check('Ein Satz pro Seite', settings.onePerPage, settings.layout === 'sheet',
          (next) => set('onePerPage', next)),
      ),
    );

    const build = () => printSheet({
      sentences: options.sentences,
      settings,
      provider: options.provider,
      attribution: options.attribution,
      collectionName: options.collectionName,
    });

    sheetHolder.replaceChildren(build());
    // The actual printable DOM: same builder, hidden on screen, revealed by
    // @media print. Built separately rather than moved, so neither copy can
    // steal nodes from the other.
    printRoot?.replaceChildren(build());

    paintFooter();
    requestAnimationFrame(rescale);
  }

  paint();
}
