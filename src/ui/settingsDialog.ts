import type { AppSettings, Override, ProviderId } from '../core/types.ts';
import { arasaac, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { deleteOverride, listOverrides } from '../db/repo.ts';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { resetSymbolResolution } from './symbols.ts';

type Tab = 'symbols' | 'dictionary' | 'stopwords' | 'data';

const TABS: { id: Tab; label: string }[] = [
  { id: 'symbols', label: 'Symbole' },
  { id: 'dictionary', label: 'Mein Wörterbuch' },
  { id: 'stopwords', label: 'Funktionswörter' },
  { id: 'data', label: 'Daten' },
];

export interface SettingsOptions {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onProviderChanged: () => void;
  onNotify: (message: string) => void;
  onClose: () => void;
  /** Library-wide actions. Per-collection ones live in the collection's own menu. */
  onExportAll: () => void;
  onClearAll: () => void;
}

export function openSettings(options: SettingsOptions): void {
  let settings = options.settings;
  let tab: Tab = 'symbols';
  let busy = false;

  const tabs = el('div', { class: 'segmented', style: { marginBottom: '16px' } });
  const panel = el('div');

  const dialog = openDialog({
    title: 'Einstellungen',
    wide: true,
    body: [tabs, panel],
    onClose: () => { unsubscribe(); options.onClose(); },
  });

  // METACOM reports progress and readiness as it works; the panel follows it.
  const unsubscribe = metacom.subscribe(() => { if (tab === 'symbols') paint(); });

  function close(): void {
    unsubscribe();
    dialog.close();
  }

  function change(next: AppSettings): void {
    settings = next;
    options.onChange(next);
  }

  async function run(task: () => Promise<void>, done: string): Promise<void> {
    busy = true;
    paint();
    try {
      await task();
      resetSymbolResolution('metacom');
      options.onProviderChanged();
      options.onNotify(done);
    } catch (err) {
      // An aborted folder picker is a normal user action, not an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        options.onNotify(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
      }
    } finally {
      busy = false;
      paint();
    }
  }

  function fileButton(label: string, accept: string | null, directory: boolean,
                      onPick: (files: FileList) => void): HTMLElement {
    const input = el('input', {
      attrs: { type: 'file', hidden: true, ...(accept ? { accept } : {}) },
      on: {
        change: () => {
          if (input.files?.length) onPick(input.files);
          input.value = '';
        },
      },
    });
    if (directory) {
      // Non-standard, and the only directory input Firefox and Safari offer.
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
      input.setAttribute('multiple', '');
    }
    return el('label', { class: 'btn sm', text: label, style: { cursor: 'pointer' } }, input);
  }

  function symbolsTab(): Node[] {
    const status = metacom.status();
    const select = (id: ProviderId) => {
      change({ ...settings, activeProvider: id });
      options.onProviderChanged();
      paint();
    };

    return [
      el('div', { class: `card${settings.activeProvider === 'arasaac' ? ' card--active' : ''}` },
        el('div', { class: 'card__head' },
          el('strong', { text: 'ARASAAC' }),
          el('span', { class: 'tag', text: 'Standard' }),
          settings.activeProvider !== 'arasaac'
            ? el('button', { class: 'btn sm', text: 'Verwenden', attrs: { type: 'button' },
                on: { click: () => select('arasaac') } })
            : null,
        ),
        el('p', { class: 'small muted', style: { margin: '0' },
          text: 'Rund 13.000 Piktogramme mit deutschen Bezeichnungen, direkt aus dem öffentlichen ARASAAC-Verzeichnis. Keine Einrichtung nötig. Ergebnisse und Bilder werden lokal zwischengespeichert.' }),
        el('p', { class: 'small faint', style: { margin: '6px 0 0' }, text: arasaac.attribution ?? '' }),
      ),

      el('div', { class: `card${settings.activeProvider === 'metacom' ? ' card--active' : ''}` },
        el('div', { class: 'card__head' },
          el('strong', { text: 'METACOM' }),
          metacom.isReady() ? el('span', { class: 'tag', text: `${metacom.symbolCount} Symbole` }) : null,
          settings.activeProvider !== 'metacom' && metacom.isReady()
            ? el('button', { class: 'btn sm', text: 'Verwenden', attrs: { type: 'button' },
                on: { click: () => select('metacom') } })
            : null,
        ),
        el('div', { class: 'notice notice--accent', style: { marginBottom: '10px' },
          text: 'METACOM ist lizenzpflichtig. bildhaft liefert keine METACOM-Symbole mit und überträgt niemals METACOM-Dateien. Du wählst deinen eigenen, lizenzierten Ordner aus; alle Bilder werden ausschließlich lokal in deinem Browser gelesen und angezeigt.' }),

        status.kind === 'ready'
          ? el('p', { class: 'small muted', style: { margin: '0 0 10px' },
              text: `Ordner „${metacom.rootName}“ · ${metacom.symbolCount} Bilddateien indiziert.` })
          : el('p', { class: 'small muted', style: { margin: '0 0 10px' } },
              status.kind === 'loading' ? el('span', { class: 'spinner' }) : null,
              status.kind === 'loading' ? ` ${status.message}` : status.message),

        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
          MetacomProvider.supportsPersistentPicker
            ? el('button', { class: 'btn sm', text: 'Symbolordner wählen',
                attrs: { type: 'button', disabled: busy },
                on: { click: () => void run(() => metacom.pickDirectory(), 'METACOM-Ordner eingelesen.') } })
            : fileButton('Symbolordner wählen', null, true,
                (files) => void run(() => metacom.useFileList(files), 'METACOM-Ordner eingelesen.')),

          fileButton('ZIP einlesen', '.zip,application/zip', false,
            (files) => void run(() => metacom.useZip(files[0]), 'ZIP eingelesen.')),

          metacom.isReady()
            ? el('button', { class: 'btn sm', text: 'Neu einlesen',
                attrs: { type: 'button', disabled: busy },
                on: { click: () => void run(() => metacom.rebuildIndex(), 'Index neu aufgebaut.') } })
            : null,

          status.kind !== 'needs-setup'
            ? el('button', { class: 'btn sm destructive', text: 'Ordner vergessen',
                attrs: { type: 'button', disabled: busy },
                on: { click: () => void run(async () => {
                  await metacom.forget();
                  if (settings.activeProvider === 'metacom') {
                    change({ ...settings, activeProvider: 'arasaac' });
                  }
                }, 'METACOM-Ordner entfernt.') } })
            : null,
        ),

        !MetacomProvider.supportsPersistentPicker
          ? el('p', { class: 'small faint', style: { margin: '10px 0 0' },
              text: 'Dieser Browser kann den Ordner nicht dauerhaft merken. Die Auswahl gilt bis zum Neuladen der Seite. In Chrome oder Edge ist sie einmalig.' })
          : null,
      ),
    ].filter((node) => node !== null) as Node[];
  }

  function dictionaryTab(): Node[] {
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } });
    const intro = el('p', { class: 'small muted', style: { marginTop: '0' },
      text: `Jede Korrektur wird hier gemerkt und beim nächsten Mal automatisch verwendet — für ${settings.activeProvider === 'arasaac' ? 'ARASAAC' : 'METACOM'}.` });

    const reload = () => {
      listOverrides(settings.activeProvider).then((overrides: Override[]) => {
        if (overrides.length === 0) {
          fill(list, el('p', { class: 'small faint',
            text: 'Noch keine Einträge. Klicke in einer Zeile auf ein Symbol und wähle ein besseres aus.' }));
          return;
        }
        fill(list, ...overrides.map((override) => el('div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 2px' } },
          el('b', { text: override.token, style: { minWidth: '140px' } }),
          el('span', { class: 'small muted', text: `→ ${override.label}`, style: { flex: '1' } }),
          el('button', { class: 'btn destructive sm', text: 'Entfernen', attrs: { type: 'button' },
            on: { click: async () => { await deleteOverride(override.provider, override.token); reload(); } } }),
        )));
      });
    };

    fill(list, el('p', { class: 'small muted', text: 'Wird geladen …' }));
    reload();
    return [intro, list];
  }

  function stopwordsTab(): Node[] {
    const area = el('textarea', {
      class: 'field stopword-area',
      attrs: { spellcheck: 'false', 'aria-label': 'Funktionswörter' },
    });
    area.value = settings.stopwords.join('\n');

    return [
      el('p', { class: 'small muted', style: { marginTop: '0' }, html:
        'Diese Wörter bekommen kein eigenes Symbol — AAC-Sequenzen sind telegrafisch. '
        + 'Pronomen, Präpositionen und Modalverben stehen bewusst <em>nicht</em> auf der '
        + 'Liste, weil sie Bedeutung tragen. Ein Wort pro Zeile.' }),
      area,
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        el('button', { class: 'btn primary sm', text: 'Speichern', attrs: { type: 'button' },
          on: { click: () => {
            const words = [...new Set(area.value.split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, 'de'));
            area.value = words.join('\n');
            change({ ...settings, stopwords: words });
          } } }),
        el('span', { class: 'small faint', text: 'Gilt für neu übersetzte Sätze.',
          style: { alignSelf: 'center' } }),
      ),
    ];
  }

  function dataTab(): Node[] {
    return [
      el('div', { class: 'notice', style: { marginBottom: '14px' }, html:
        '<strong>Sicherung.</strong> bildhaft speichert alles im Browser. Wird der '
        + 'Browser-Speicher gelöscht, ist die Arbeit weg. Eine Sicherung enthält alle '
        + 'Sammlungen und dein Wörterbuch — nur Symbol-Verweise, keine Bilder.' }),
      el('button', { class: 'btn primary sm', text: 'Alles exportieren',
        attrs: { type: 'button' }, on: { click: options.onExportAll } }),
      el('p', { class: 'small faint', style: { margin: '8px 0 0' }, html:
        'Einzelne Sammlungen exportierst du über das Menü <strong>⋯</strong> neben ihrem Namen.' }),
      el('h3', { text: 'Alles löschen', style: { fontSize: '13px', margin: '24px 0 6px' } }),
      el('p', { class: 'small faint', style: { margin: '0 0 10px' }, text:
        'Setzt bildhaft vollständig zurück: alle Sammlungen, alle Zeilen, dein Wörterbuch '
        + 'und die zwischengespeicherten Symbole. Das lässt sich nicht rückgängig machen.' }),
      el('button', { class: 'btn destructive sm', text: 'Alle Daten löschen',
        attrs: { type: 'button' }, on: { click: () => { close(); options.onClearAll(); } } }),
    ];
  }

  function paint(): void {
    fill(tabs, ...TABS.map((entry) => el('button', {
      text: entry.label,
      attrs: { type: 'button', 'aria-pressed': tab === entry.id },
      on: { click: () => { tab = entry.id; paint(); } },
    })));

    const content =
      tab === 'symbols' ? symbolsTab()
      : tab === 'dictionary' ? dictionaryTab()
      : tab === 'stopwords' ? stopwordsTab()
      : dataTab();

    fill(panel, ...content);
  }

  paint();
}
