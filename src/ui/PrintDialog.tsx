import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PrintSettings, ProviderId, Sentence } from '../core/types.ts';
import { Dialog } from './Dialog.tsx';
import { PrintSheet } from './PrintSheet.tsx';
import { warmSymbols } from './useSymbolUrl.ts';

/** A4 at the CSS reference resolution of 96dpi. */
const A4_HEIGHT_PX = (297 / 25.4) * 96;
const PREVIEW_PADDING = 28;

interface Props {
  sentences: Sentence[];
  collectionName: string;
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  provider: ProviderId;
  attribution: string | null;
  onClose: () => void;
}

export function PrintDialog({
  sentences, collectionName, settings, onChange, provider, attribution, onClose,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [scaledHeight, setScaledHeight] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);

  useEffect(() => setPrintRoot(document.getElementById('print-root')), []);

  const set = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) =>
    onChange({ ...settings, [key]: value });

  /*
   * The browser's own preview appears too late to iterate on, so we scale the real
   * A4 sheet down to fit the panel. Measured rather than hard-coded, because the
   * sheet's height depends on how much fits on it.
   */
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const sheet = sheetRef.current;
    if (!frame || !sheet) return;

    const update = () => {
      const availableWidth = frame.clientWidth - PREVIEW_PADDING;
      const availableHeight = frame.clientHeight - PREVIEW_PADDING;
      // Fit one full A4 page, so page breaks and the overall grid are judgeable.
      // Further pages scroll rather than shrinking the whole preview.
      const next = Math.min(
        1,
        availableWidth / sheet.offsetWidth,
        availableHeight / A4_HEIGHT_PX,
      );
      setScale(next);
      setScaledHeight(sheet.offsetHeight * next);
    };

    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(sheet);
    update();
    return () => observer.disconnect();
  }, [settings, sentences]);

  async function handlePrint() {
    setPreparing(true);
    // Never open the print dialog over half-loaded images.
    const ids = sentences.flatMap((s) =>
      s.slots.map((slot) => slot.choice[provider]).filter((id): id is string => Boolean(id)),
    );
    await warmSymbols(provider, ids);
    await document.fonts?.ready;
    // Two frames so the portal content is laid out before the print dialog opens.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    setPreparing(false);
    window.print();
  }

  const sheet = (
    <PrintSheet
      sentences={sentences}
      settings={settings}
      provider={provider}
      attribution={attribution}
      sessionName={collectionName}
    />
  );

  return (
    <>
      <Dialog
        title={sentences.length === 1 ? 'Zeile drucken' : `Sammlung drucken (${sentences.length} Zeilen)`}
        onClose={onClose}
        wide
        footer={
          <>
            <span className="small faint">
              A4 · Ränder 10 mm · {settings.symbolSizeMm} mm Symbole
            </span>
            <div className="spacer" />
            <button type="button" className="btn" onClick={onClose}>Schließen</button>
            <button type="button" className="btn btn--primary" onClick={handlePrint} disabled={preparing}>
              {preparing ? <><span className="spinner" /> Bereite vor …</> : 'Drucken'}
            </button>
          </>
        }
      >
        <div className="print-layout">
          <div>
            <div className="opt">
              <label>Layout</label>
              <div className="segmented">
                <button type="button" aria-pressed={settings.layout === 'strip'} onClick={() => set('layout', 'strip')}>
                  Satzstreifen
                </button>
                <button type="button" aria-pressed={settings.layout === 'sheet'} onClick={() => set('layout', 'sheet')}>
                  Kartenblatt
                </button>
              </div>
              <span className="small faint">
                {settings.layout === 'strip'
                  ? 'Eine Reihe pro Satz, in Leserichtung.'
                  : 'Raster einzelner Karten zum Ausschneiden. Doppelte Symbole erscheinen nur einmal.'}
              </span>
            </div>

            <div className="opt">
              <label htmlFor="opt-size">Symbolgröße</label>
              <div className="opt__row">
                <input
                  id="opt-size"
                  className="field"
                  type="number"
                  min={10}
                  max={120}
                  step={1}
                  value={settings.symbolSizeMm}
                  onChange={(e) => set('symbolSizeMm', clamp(e.target.valueAsNumber, 10, 120, 40))}
                />
                <span className="opt__unit">mm</span>
              </div>
            </div>

            <div className="opt">
              <label htmlFor="opt-cut">Schneiderand</label>
              <div className="opt__row">
                <input
                  id="opt-cut"
                  className="field"
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={settings.cutMarginMm}
                  onChange={(e) => set('cutMarginMm', clamp(e.target.valueAsNumber, 0, 20, 3))}
                />
                <span className="opt__unit">mm</span>
              </div>
              <span className="small faint">Weißer Rand pro Karte, damit die Laminierfolie dicht abschließt.</span>
            </div>

            <div className="opt">
              <label className="opt__check">
                <input
                  type="checkbox"
                  checked={settings.showLabel}
                  onChange={(e) => set('showLabel', e.target.checked)}
                />
                Wort unter dem Symbol
              </label>
              {settings.showLabel && (
                <>
                  <div className="segmented" style={{ marginTop: 6 }}>
                    <button type="button" aria-pressed={settings.labelPosition === 'below'} onClick={() => set('labelPosition', 'below')}>
                      unten
                    </button>
                    <button type="button" aria-pressed={settings.labelPosition === 'above'} onClick={() => set('labelPosition', 'above')}>
                      oben
                    </button>
                  </div>
                  <div className="opt__row" style={{ marginTop: 6 }}>
                    <input
                      className="field"
                      type="number"
                      min={5}
                      max={40}
                      step={0.5}
                      value={settings.labelSizePt}
                      onChange={(e) => set('labelSizePt', clamp(e.target.valueAsNumber, 5, 40, 11))}
                      aria-label="Schriftgröße"
                    />
                    <span className="opt__unit">pt</span>
                  </div>
                </>
              )}
            </div>

            <div className="opt">
              <label className="opt__check">
                <input
                  type="checkbox"
                  checked={settings.showCutLines}
                  onChange={(e) => set('showCutLines', e.target.checked)}
                />
                Schnittlinien anzeigen
              </label>
              <label className="opt__check">
                <input
                  type="checkbox"
                  checked={settings.showSentenceText}
                  disabled={settings.layout === 'sheet'}
                  onChange={(e) => set('showSentenceText', e.target.checked)}
                />
                Satztext über der Reihe
              </label>
              <label className="opt__check">
                <input
                  type="checkbox"
                  checked={settings.onePerPage}
                  disabled={settings.layout === 'sheet'}
                  onChange={(e) => set('onePerPage', e.target.checked)}
                />
                Ein Satz pro Seite
              </label>
            </div>
          </div>

          <div className="preview-frame" ref={frameRef}>
            <div style={{ height: scaledHeight || undefined }}>
              <div className="preview-scaler" style={{ transform: `scale(${scale})` }}>
                <div ref={sheetRef} style={{ width: 'fit-content' }}>{sheet}</div>
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* The actual printable DOM. Hidden on screen, revealed by @media print. */}
      {printRoot && createPortal(sheet, printRoot)}
    </>
  );
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
