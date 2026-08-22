import { useState } from 'react';
import type { ProviderId, Sentence, Slot } from '../core/types.ts';
import { SymbolImage } from './SymbolImage.tsx';

const ORIGIN_HINT: Record<Slot['origin'], string> = {
  override: 'Aus deinem Wörterbuch',
  lemma: 'Grundform nachgeschlagen',
  separable: 'Trennbares Verb zusammengesetzt',
  compound: 'Zusammengesetztes Wort geteilt',
  synonym: 'Über ein Synonym gefunden',
  raw: 'Direkt gefunden',
  manual: 'Von Hand gewählt',
  unmatched: 'Kein Symbol gefunden',
};

interface Props {
  sentence: Sentence;
  provider: ProviderId;
  onOpenSlot: (slotId: string) => void;
  onAddSlot: () => void;
  onReorder: (from: number, to: number) => void;
  onPrint: () => void;
  onDelete: () => void;
}

export function SentenceRow({
  sentence, provider, onOpenSlot, onAddSlot, onReorder, onPrint, onDelete,
}: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const reset = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <article className="row">
      <header className="row__head">
        <div className="row__text">{sentence.rawInput}</div>
        <div className="row__actions">
          <button type="button" className="btn btn--quiet btn--icon" onClick={onPrint} title="Diese Zeile drucken">
            <PrinterIcon />
          </button>
          <button type="button" className="btn btn--danger btn--icon" onClick={onDelete} title="Diese Zeile löschen">
            <TrashIcon />
          </button>
        </div>
      </header>

      <div className="slots">
        {sentence.slots.map((slot, index) => {
          const chosen = slot.choice[provider] ?? null;
          const candidates = slot.candidates[provider] ?? [];
          const symbolLabel = candidates.find((c) => c.id === chosen)?.label;

          const isOver = dragOver === index && dragFrom !== null && dragFrom !== index;
          const overClass = isOver ? (dragFrom! < index ? ' slot--over-after' : ' slot--over-before') : '';

          return (
            <div
              key={slot.id}
              role="button"
              tabIndex={0}
              draggable
              className={
                `slot${chosen ? '' : ' slot--empty'}` +
                `${dragFrom === index ? ' slot--dragging' : ''}${overClass}`
              }
              title={`${ORIGIN_HINT[slot.origin]}${symbolLabel ? ` · ${symbolLabel}` : ''}\nZiehen zum Umsortieren`}
              onClick={() => onOpenSlot(slot.id)}
              onKeyDown={(e) => {
                // Alt+Arrow reorders without a mouse.
                if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault();
                  const to = index + (e.key === 'ArrowLeft' ? -1 : 1);
                  if (to >= 0 && to < sentence.slots.length) onReorder(index, to);
                  return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenSlot(slot.id);
                }
              }}
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== index) setDragOver(index);
              }}
              onDragLeave={() => setDragOver((current) => (current === index ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFrom ?? Number(e.dataTransfer.getData('text/plain'));
                if (Number.isInteger(from) && from !== index) onReorder(from, index);
                reset();
              }}
              onDragEnd={reset}
            >
              <span className="slot__img">
                <SymbolImage provider={provider} id={chosen} alt={slot.sourceToken} />
              </span>
              <span className="slot__label">{slot.sourceToken}</span>
            </div>
          );
        })}

        <button type="button" className="slot-add" onClick={onAddSlot} title="Feld hinzufügen">
          +
        </button>
      </div>
    </article>
  );
}

function PrinterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
