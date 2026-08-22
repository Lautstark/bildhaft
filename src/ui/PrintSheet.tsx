import { useEffect, useState } from 'react';
import type { PrintSettings, ProviderId, Sentence, Slot } from '../core/types.ts';
import { useSymbolUrl } from './useSymbolUrl.ts';

interface Props {
  sentences: Sentence[];
  settings: PrintSettings;
  provider: ProviderId;
  /** Mandatory for ARASAAC; printed at the foot of the output. */
  attribution: string | null;
  sessionName: string;
}

/**
 * The printable document. Rendered twice: once inside the on-screen A4 preview and
 * once into #print-root, which @media print reveals. Both use the same markup, so
 * what the preview shows is what the printer produces.
 */
export function PrintSheet({ sentences, settings, provider, attribution, sessionName }: Props) {
  const style = {
    '--sym': `${settings.symbolSizeMm}mm`,
    '--cut': `${settings.cutMarginMm}mm`,
    '--label': `${settings.labelSizePt}pt`,
  } as React.CSSProperties;

  const className = `ps-sheet${settings.showCutLines ? ' ps-sheet--cutlines' : ''}`;

  return (
    <div className={className} style={style}>
      {settings.layout === 'sheet'
        ? <CardSheet sentences={sentences} settings={settings} provider={provider} />
        : <Strips sentences={sentences} settings={settings} provider={provider} />}

      {attribution && (
        <p className="ps-attribution">
          {attribution}
          <br />
          {sessionName} · erstellt mit bildhaft
        </p>
      )}
    </div>
  );
}

/** Sentence strips: one row per sentence, in reading order. */
function Strips({ sentences, settings, provider }: Omit<Props, 'attribution' | 'sessionName'>) {
  return (
    <>
      {sentences.map((sentence, i) => (
        <div
          key={sentence.id}
          className={`ps-sentence${settings.onePerPage && i < sentences.length - 1 ? ' ps-sentence--page' : ''}`}
        >
          {settings.showSentenceText && <p className="ps-caption">{sentence.rawInput}</p>}
          <div className="ps-row">
            {sentence.slots.map((slot) => (
              <Card key={slot.id} slot={slot} settings={settings} provider={provider} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Card sheet: a grid of individual cards for cutting up and laminating.
 * Duplicates are collapsed — a deck needs one card per symbol, not one per use.
 */
function CardSheet({ sentences, settings, provider }: Omit<Props, 'attribution' | 'sessionName'>) {
  const seen = new Set<string>();
  const cards: Slot[] = [];

  for (const sentence of sentences) {
    for (const slot of sentence.slots) {
      const id = slot.choice[provider];
      const key = id ?? `blank:${slot.sourceToken.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(slot);
    }
  }

  return (
    <div className="ps-row">
      {cards.map((slot) => (
        <Card key={slot.id} slot={slot} settings={settings} provider={provider} />
      ))}
    </div>
  );
}

function Card({ slot, settings, provider }: { slot: Slot; settings: PrintSettings; provider: ProviderId }) {
  const id = slot.choice[provider] ?? null;
  const { url } = useSymbolUrl(provider, id);
  const label = slot.sourceToken || slot.concept;
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  return (
    <div className={`ps-card${settings.labelPosition === 'above' ? ' ps-card--label-above' : ''}`}>
      <div className="ps-card__img">
        {url && !failed
          // alt is empty on purpose: a broken image would otherwise print its alt
          // text inside the card, duplicating the label below it.
          ? <img src={url} alt="" onError={() => setFailed(true)} />
          : <div className="ps-card__blank" />}
      </div>
      {settings.showLabel && <div className="ps-card__label">{label}</div>}
    </div>
  );
}
