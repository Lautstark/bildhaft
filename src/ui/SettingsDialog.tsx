import { useEffect, useState } from 'react';
import type { AppSettings, Collection, Override, ProviderId } from '../core/types.ts';
import { arasaac, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { deleteOverride, listOverrides } from '../db/repo.ts';
import { resetSymbolResolution } from './useSymbolUrl.ts';
import { Dialog } from './Dialog.tsx';

type Tab = 'symbols' | 'dictionary' | 'stopwords' | 'data';

const TABS: { id: Tab; label: string }[] = [
  { id: 'symbols', label: 'Symbole' },
  { id: 'dictionary', label: 'Mein Wörterbuch' },
  { id: 'stopwords', label: 'Funktionswörter' },
  { id: 'data', label: 'Daten' },
];

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  collection: Collection | null;
  sentenceCount: number;
  onProviderChanged: () => void;
  onClose: () => void;
  onNotify: (message: string) => void;
  /** Library-wide actions. Per-collection ones live in the collection's own menu. */
  onExportAll: () => void;
  onClearAll: () => void;
}

export function SettingsDialog(props: Props) {
  const [tab, setTab] = useState<Tab>('symbols');

  return (
    <Dialog title="Einstellungen" onClose={props.onClose} wide>
      <div className="segmented" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'symbols' && <SymbolsTab {...props} />}
      {tab === 'dictionary' && <DictionaryTab provider={props.settings.activeProvider} />}
      {tab === 'stopwords' && <StopwordsTab settings={props.settings} onChange={props.onChange} />}
      {tab === 'data' && <DataTab {...props} />}
    </Dialog>
  );
}

/* --------------------------------------------------------------- symbols --- */

function SymbolsTab({ settings, onChange, onProviderChanged, onNotify }: Props) {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => metacom.subscribe(() => force((n) => n + 1)), []);

  const select = (id: ProviderId) => {
    onChange({ ...settings, activeProvider: id });
    onProviderChanged();
  };

  const status = metacom.status();

  const run = async (task: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await task();
      resetSymbolResolution('metacom');
      onProviderChanged();
      onNotify(done);
    } catch (err) {
      // An aborted folder picker is a normal user action, not an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        onNotify(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`card${settings.activeProvider === 'arasaac' ? ' card--active' : ''}`}>
        <div className="card__head">
          <strong>ARASAAC</strong>
          <span className="tag">Standard</span>
          {settings.activeProvider !== 'arasaac' && (
            <button type="button" className="btn btn--sm" onClick={() => select('arasaac')}>
              Verwenden
            </button>
          )}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Rund 13.000 Piktogramme mit deutschen Bezeichnungen, direkt aus dem
          öffentlichen ARASAAC-Verzeichnis. Keine Einrichtung nötig. Ergebnisse und
          Bilder werden lokal zwischengespeichert.
        </p>
        <p className="small faint" style={{ margin: '6px 0 0' }}>{arasaac.attribution}</p>
      </div>

      <div className={`card${settings.activeProvider === 'metacom' ? ' card--active' : ''}`}>
        <div className="card__head">
          <strong>METACOM</strong>
          {metacom.isReady() && <span className="tag">{metacom.symbolCount} Symbole</span>}
          {settings.activeProvider !== 'metacom' && metacom.isReady() && (
            <button type="button" className="btn btn--sm" onClick={() => select('metacom')}>
              Verwenden
            </button>
          )}
        </div>

        <div className="notice notice--accent" style={{ marginBottom: 10 }}>
          METACOM ist lizenzpflichtig. bildhaft liefert keine METACOM-Symbole mit und
          überträgt niemals METACOM-Dateien. Du wählst deinen eigenen, lizenzierten
          Ordner aus; alle Bilder werden ausschließlich lokal in deinem Browser
          gelesen und angezeigt.
        </div>

        {status.kind === 'ready' ? (
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            Ordner „{metacom.rootName}“ · {metacom.symbolCount} Bilddateien indiziert.
          </p>
        ) : (
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            {status.kind === 'loading' ? <><span className="spinner" /> {status.message}</> : status.message}
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MetacomProvider.supportsPersistentPicker ? (
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => run(() => metacom.pickDirectory(), 'METACOM-Ordner eingelesen.')}
            >
              Symbolordner wählen
            </button>
          ) : (
            <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
              Symbolordner wählen
              <input
                type="file"
                hidden
                // @ts-expect-error - non-standard but the only directory input Firefox/Safari offer
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) run(() => metacom.useFileList(files), 'METACOM-Ordner eingelesen.');
                  e.target.value = '';
                }}
              />
            </label>
          )}

          <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
            ZIP einlesen
            <input
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) run(() => metacom.useZip(file), 'ZIP eingelesen.');
                e.target.value = '';
              }}
            />
          </label>

          {metacom.isReady() && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => run(() => metacom.rebuildIndex(), 'Index neu aufgebaut.')}
            >
              Neu einlesen
            </button>
          )}

          {status.kind !== 'needs-setup' && (
            <button
              type="button"
              className="btn btn--sm btn--danger"
              disabled={busy}
              onClick={() => run(async () => {
                await metacom.forget();
                if (settings.activeProvider === 'metacom') {
                  onChange({ ...settings, activeProvider: 'arasaac' });
                }
              }, 'METACOM-Ordner entfernt.')}
            >
              Ordner vergessen
            </button>
          )}
        </div>

        {!MetacomProvider.supportsPersistentPicker && (
          <p className="small faint" style={{ margin: '10px 0 0' }}>
            Dieser Browser kann den Ordner nicht dauerhaft merken. Die Auswahl gilt
            bis zum Neuladen der Seite. In Chrome oder Edge ist sie einmalig.
          </p>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ dictionary --- */

function DictionaryTab({ provider }: { provider: ProviderId }) {
  const [overrides, setOverrides] = useState<Override[] | null>(null);

  const reload = () => listOverrides(provider).then(setOverrides);
  useEffect(() => { reload(); }, [provider]);

  if (!overrides) return <p className="small muted">Wird geladen …</p>;

  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>
        Jede Korrektur wird hier gemerkt und beim nächsten Mal automatisch
        verwendet — für {provider === 'arasaac' ? 'ARASAAC' : 'METACOM'}.
      </p>

      {overrides.length === 0 ? (
        <p className="small faint">
          Noch keine Einträge. Klicke in einer Zeile auf ein Symbol und wähle ein
          besseres aus.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {overrides.map((override) => (
            <div
              key={override.key}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px' }}
            >
              <b style={{ minWidth: 140 }}>{override.token}</b>
              <span className="small muted" style={{ flex: 1 }}>→ {override.label}</span>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={async () => {
                  await deleteOverride(override.provider, override.token);
                  reload();
                }}
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- stopwords --- */

function StopwordsTab({ settings, onChange }: Pick<Props, 'settings' | 'onChange'>) {
  const [draft, setDraft] = useState(settings.stopwords.join('\n'));

  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>
        Diese Wörter bekommen kein eigenes Symbol — AAC-Sequenzen sind telegrafisch.
        Pronomen, Präpositionen und Modalverben stehen bewusst <em>nicht</em> auf der
        Liste, weil sie Bedeutung tragen. Ein Wort pro Zeile.
      </p>

      <textarea
        className="field stopword-area"
        value={draft}
        spellCheck={false}
        aria-label="Funktionswörter"
        onChange={(e) => setDraft(e.target.value)}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            const words = [...new Set(
              draft.split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean),
            )].sort((a, b) => a.localeCompare(b, 'de'));
            setDraft(words.join('\n'));
            onChange({ ...settings, stopwords: words });
          }}
        >
          Speichern
        </button>
        <span className="small faint" style={{ alignSelf: 'center' }}>
          Gilt für neu übersetzte Sätze.
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ data --- */

function DataTab({ onExportAll, onClearAll }: Props) {
  return (
    <>
      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>Sicherung.</strong> bildhaft speichert alles im Browser. Wird der
        Browser-Speicher gelöscht, ist die Arbeit weg. Eine Sicherung enthält alle
        Sammlungen und dein Wörterbuch — nur Symbol-Verweise, keine Bilder.
      </div>

      <button type="button" className="btn btn--primary btn--sm" onClick={onExportAll}>
        Alles exportieren
      </button>
      <p className="small faint" style={{ margin: '8px 0 0' }}>
        Einzelne Sammlungen exportierst du über das Menü <strong>⋯</strong> neben
        ihrem Namen.
      </p>

      <h3 style={{ fontSize: 13, margin: '24px 0 6px' }}>Alles löschen</h3>
      <p className="small faint" style={{ margin: '0 0 10px' }}>
        Setzt bildhaft vollständig zurück: alle Sammlungen, alle Zeilen, dein
        Wörterbuch und die zwischengespeicherten Symbole. Das lässt sich nicht
        rückgängig machen.
      </p>
      <button type="button" className="btn btn--danger btn--sm" onClick={onClearAll}>
        Alle Daten löschen
      </button>
    </>
  );
}
