import { useEffect, useMemo, useState } from 'react';
import type { Candidate, ProviderId, Slot } from '../core/types.ts';
import { getProvider } from '../providers/registry.ts';
import { Dialog } from './Dialog.tsx';
import { SymbolImage } from './SymbolImage.tsx';

interface Props {
  slot: Slot;
  provider: ProviderId;
  onChoose: (candidate: Candidate) => void;
  /** Removes the whole slot, not just its symbol. */
  onRemove: () => void;
  onClose: () => void;
}

export function SlotPicker({ slot, provider, onChoose, onRemove, onClose }: Props) {
  const stored = useMemo(() => slot.candidates[provider] ?? [], [slot, provider]);
  const chosen = slot.choice[provider] ?? null;
  const isNew = !slot.concept;

  const [suggested, setSuggested] = useState<Candidate[]>(stored);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);

  /*
   * Slots store only a handful of candidates to keep collections and exports small.
   * Re-query the provider on open for the full list — cached, so this is instant
   * on the second look. Stored candidates stay first: they include any manual pick.
   */
  useEffect(() => {
    if (!slot.concept) return;
    let alive = true;
    getProvider(provider)
      .search(slot.concept)
      .then((found) => {
        if (!alive || found.length === 0) return;
        const seen = new Set(stored.map((c) => c.id));
        setSuggested([...stored, ...found.filter((c) => !seen.has(c.id))]);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [slot.concept, provider, stored]);

  // Debounced manual search — the escape hatch for anything the pipeline missed.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    let alive = true;
    const timer = setTimeout(async () => {
      const found = await getProvider(provider).search(term);
      if (!alive) return;
      setResults(found);
      setSearching(false);
    }, 260);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, provider]);

  const shown = results ?? suggested;

  return (
    <Dialog
      title={isNew ? 'Feld hinzufügen' : `Symbol für „${slot.sourceToken}“`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--danger" onClick={onRemove}>
            {isNew ? 'Abbrechen' : 'Feld entfernen'}
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Fertig</button>
        </>
      }
    >
      <input
        className="field"
        type="search"
        value={query}
        placeholder={isNew ? 'Wort suchen …' : 'Anderes Wort suchen …'}
        aria-label="Symbol suchen"
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />

      <p className="small muted" style={{ margin: '12px 0 0' }}>
        {searching
          ? 'Suche läuft …'
          : results
            ? results.length > 0
              ? `${results.length} Treffer für „${query.trim()}“`
              : `Keine Treffer für „${query.trim()}“`
            : isNew
              ? 'Suche nach einem Wort, um das Feld zu füllen.'
              : suggested.length > 0
                ? `Vorschläge für „${slot.concept}“`
                : `Für „${slot.concept}“ wurde nichts gefunden. Suche oben nach einem anderen Wort.`}
      </p>

      {shown.length > 0 && (
        <div className="picker__grid">
          {shown.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`picker__item${candidate.id === chosen ? ' picker__item--active' : ''}`}
              onClick={() => onChoose(candidate)}
              title={candidate.label}
            >
              <span className="slot__img">
                <SymbolImage provider={provider} id={candidate.id} alt={candidate.label} />
              </span>
              <span>{candidate.label}</span>
            </button>
          ))}
        </div>
      )}

      {!isNew && (
        <p className="small faint" style={{ marginTop: 14, marginBottom: 0 }}>
          Deine Auswahl wird für „{slot.sourceToken}“ gemerkt und beim nächsten Mal
          automatisch verwendet.
        </p>
      )}
    </Dialog>
  );
}
