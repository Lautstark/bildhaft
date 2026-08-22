import type { Collection, Sentence } from '../core/types.ts';
import { Logo } from './Logo.tsx';

interface Props {
  collections: Collection[];
  counts: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchResults: Sentence[];
  onOpenResult: (sentence: Sentence) => void;
  onOpenSettings: () => void;
  onImport: (file: File) => void;
  onCollapse: () => void;
}

export function Sidebar({
  collections, counts, activeId, onSelect, onNew,
  searchQuery, onSearchChange, searchResults, onOpenResult,
  onOpenSettings, onImport, onCollapse,
}: Props) {
  const searching = searchQuery.trim().length > 0;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo />
        <h1>bildhaft</h1>
        <button type="button" className="btn btn--quiet btn--icon" onClick={onCollapse} title="Seitenleiste ausblenden">
          <ChevronLeft />
        </button>
      </div>

      <div className="sidebar__section">
        <input
          className="field"
          type="search"
          value={searchQuery}
          placeholder="Alle Sätze durchsuchen …"
          aria-label="Alle Sätze durchsuchen"
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {searching ? (
        <div className="sidebar__section">
          <h2>{searchResults.length} Treffer</h2>
          <div className="list">
            {searchResults.map((sentence) => (
              <button key={sentence.id} type="button" className="hit" onClick={() => onOpenResult(sentence)}>
                {sentence.rawInput}
                <small>{collections.find((c) => c.id === sentence.collectionId)?.name ?? '—'}</small>
              </button>
            ))}
            {searchResults.length === 0 && <p className="small faint" style={{ padding: '0 10px' }}>Nichts gefunden.</p>}
          </div>
        </div>
      ) : (
        <div className="sidebar__section">
          <h2>Sammlungen</h2>
          <div className="list">
            {collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                className={`list__item${collection.id === activeId ? ' list__item--active' : ''}`}
                onClick={() => onSelect(collection.id)}
              >
                <span className="list__name">{collection.name}</span>
                <span className="list__count">{counts[collection.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--quiet btn--sm" style={{ marginTop: 6 }} onClick={onNew}>
            + Neue Sammlung
          </button>
        </div>
      )}

      <div className="sidebar__section" style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onOpenSettings}>Einstellungen</button>
        <label className="btn btn--quiet btn--sm" style={{ cursor: 'pointer' }}>
          Importieren
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </aside>
  );
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
