import type { AppSettings, Override, ProviderId } from '../core/types.ts';
import { arasaac, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { deleteOverride, listOverrides } from '../db/repo.ts';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { resetSymbolResolution } from './symbols.ts';

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

interface Panel {
  node: HTMLElement;
  summary: HTMLElement;
  state: HTMLElement;
  body: HTMLElement;
}

/**
 * Every section is a folded panel whose heading carries its state, so the whole
 * of what bildhaft is set to reads at a glance and opening one is a decision.
 *
 * The two symbol sources are panels in their own right. They were already
 * status-bearing cards inside a "Symbole" tab, which made the tab a layer of
 * furniture over a list that said the same thing one level down.
 */
export function openSettings(options: SettingsOptions): void {
  let settings = options.settings;
  let busy = false;

  function makePanel(label: string): Panel {
    const state = el('span', { class: 'state' });
    const summary = el('summary', {}, el('span', { class: 'section', text: label }), state);
    const body = el('div', { class: 'body' });
    return { node: el('details', { class: 'panel' }, summary, body), summary, state, body };
  }

  const arasaacPanel = makePanel('ARASAAC');
  const metacomPanel = makePanel('METACOM');
  const dictPanel = makePanel('Mein Wörterbuch');
  const wordsPanel = makePanel('Funktionswörter');
  const dataPanel = makePanel('Daten');

  const dialog = openDialog({
    title: 'Einstellungen',
    body: [arasaacPanel, metacomPanel, dictPanel, wordsPanel, dataPanel].map((p) => p.node),
    onClose: () => { unsubscribe(); options.onClose(); },
  });

  /*
   * Each panel repaints only itself. Repainting all of them together would be
   * shorter and wrong: METACOM reports progress while it indexes, and that
   * would rebuild — and so empty — the Funktionswörter box somebody is typing
   * into. It would also re-read the dictionary from the database on every
   * progress tick.
   */
  const unsubscribe = metacom.subscribe(() => paintSources());

  function close(): void {
    unsubscribe();
    dialog.close();
  }

  function change(next: AppSettings): void {
    settings = next;
    options.onChange(next);
  }

  /** The accent tint marks the current source; aria-current says so out loud. */
  function mark(panel: Panel, current: boolean): void {
    if (current) panel.summary.setAttribute('aria-current', 'true');
    else panel.summary.removeAttribute('aria-current');
  }

  async function run(task: () => Promise<void>, done: string): Promise<void> {
    busy = true;
    paintSources();
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
      paintSources();
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

  /** "Verwenden" lives in the body: a button inside a summary would toggle it. */
  function useButton(id: ProviderId): HTMLElement {
    return el('button', { class: 'btn sm', text: 'Verwenden', attrs: { type: 'button' },
      on: {
        click: () => {
          change({ ...settings, activeProvider: id });
          options.onProviderChanged();
          paintSources();
          paintDictionary();
        },
      } });
  }

  function paintSources(): void {
    const active = settings.activeProvider;
    const status = metacom.status();

    mark(arasaacPanel, active === 'arasaac');
    arasaacPanel.state.textContent =
      `${active === 'arasaac' ? 'Aktive Quelle' : 'Standard'} · rund 13.000 Piktogramme`;

    fill(arasaacPanel.body,
      el('p', { class: 'small muted', style: { margin: '0' },
        text: 'Rund 13.000 Piktogramme mit deutschen Bezeichnungen, direkt aus dem öffentlichen ARASAAC-Verzeichnis. Keine Einrichtung nötig. Ergebnisse und Bilder werden lokal zwischengespeichert.' }),
      el('p', { class: 'small faint', style: { margin: '6px 0 0' }, text: arasaac.attribution ?? '' }),
      active !== 'arasaac'
        ? el('div', { style: { marginTop: '10px' } }, useButton('arasaac'))
        : null,
    );

    mark(metacomPanel, active === 'metacom');
    // Narrowed on kind, not on isReady(): only the ready variant has no message.
    metacomPanel.state.textContent = status.kind === 'ready'
      ? `${active === 'metacom' ? 'Aktive Quelle' : 'Eingerichtet'} · ${metacom.symbolCount} Symbole · ${metacom.rootName}`
      : status.message;

    fill(metacomPanel.body,
      el('div', { class: 'notice notice--accent', style: { marginBottom: '10px' },
        text: 'METACOM ist lizenzpflichtig. bildhaft liefert keine METACOM-Symbole mit und überträgt niemals METACOM-Dateien. Du wählst deinen eigenen, lizenzierten Ordner aus; alle Bilder werden ausschließlich lokal in deinem Browser gelesen und angezeigt.' }),

      /*
       * The heading states this panel's status, so the body no longer repeats
       * it — that duplication is what the old card needed and the panel makes
       * plain. Work in progress is the exception: the spinner says the one
       * thing the sentence cannot, which is that the state can still end.
       */
      status.kind === 'loading'
        ? el('p', { class: 'small muted', style: { margin: '0 0 10px' } },
            el('span', { class: 'spinner' }), ` ${status.message}`)
        : null,

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

        active !== 'metacom' && metacom.isReady() ? useButton('metacom') : null,

        status.kind !== 'needs-setup'
          ? el('button', { class: 'btn sm destructive', text: 'Ordner vergessen',
              attrs: { type: 'button', disabled: busy },
              on: { click: () => void run(async () => {
                await metacom.forget();
                if (settings.activeProvider === 'metacom') {
                  change({ ...settings, activeProvider: 'arasaac' });
                }
                paintDictionary();
              }, 'METACOM-Ordner entfernt.') } })
          : null,
      ),

      !MetacomProvider.supportsPersistentPicker
        ? el('p', { class: 'small faint', style: { margin: '10px 0 0' },
            text: 'Dieser Browser kann den Ordner nicht dauerhaft merken. Die Auswahl gilt bis zum Neuladen der Seite. In Chrome oder Edge ist sie einmalig.' })
        : null,
    );
  }

  function paintDictionary(): void {
    const provider = settings.activeProvider;
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } });

    fill(dictPanel.body,
      el('p', { class: 'small muted', style: { marginTop: '0' },
        text: `Jede Korrektur wird hier gemerkt und beim nächsten Mal automatisch verwendet — für ${provider === 'arasaac' ? 'ARASAAC' : 'METACOM'}.` }),
      list);
    fill(list, el('p', { class: 'small muted', text: 'Wird geladen …' }));
    // The count comes from the database, so the heading would otherwise be
    // blank for a frame — and a blank heading is this panel's whole promise
    // broken at the moment somebody is reading it. Say what is true meanwhile.
    if (!dictPanel.state.textContent) dictPanel.state.textContent = 'Wird geladen …';

    void listOverrides(provider).then((overrides: Override[]) => {
      // The heading counts what is inside, whether or not anybody opens it.
      dictPanel.state.textContent = overrides.length === 0
        ? 'Noch keine Einträge'
        : `${overrides.length} ${overrides.length === 1 ? 'Eintrag' : 'Einträge'}`;

      if (overrides.length === 0) {
        fill(list, el('div', { class: 'empty' },
          el('b', { text: 'Noch keine Einträge' }),
          el('small', { text: 'Klicke in einer Zeile auf ein Symbol und wähle ein besseres aus.' })));
        return;
      }
      fill(list, ...overrides.map((override) => el('div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 2px' } },
        el('b', { text: override.token, style: { minWidth: '140px' } }),
        el('span', { class: 'small muted', text: `→ ${override.label}`, style: { flex: '1' } }),
        el('button', { class: 'btn destructive sm', text: 'Entfernen', attrs: { type: 'button' },
          on: { click: async () => { await deleteOverride(override.provider, override.token); paintDictionary(); } } }),
      )));
    });
  }

  /*
   * Built once and never repainted, so that nothing — a METACOM progress tick
   * least of all — can empty the box mid-sentence. This is the one place the
   * agreement allows a save button: half a word list would do something wrong.
   */
  function fillWords(): void {
    const area = el('textarea', {
      class: 'field stopword-area',
      attrs: { spellcheck: 'false', 'aria-label': 'Funktionswörter' },
    });
    area.value = settings.stopwords.join('\n');
    wordsPanel.state.textContent = `${settings.stopwords.length} Wörter`;

    fill(wordsPanel.body,
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
            wordsPanel.state.textContent = `${words.length} Wörter`;
            change({ ...settings, stopwords: words });
          } } }),
        el('span', { class: 'small faint', text: 'Gilt für neu übersetzte Sätze.',
          style: { alignSelf: 'center' } }),
      ),
    );
  }

  function fillData(): void {
    fill(dataPanel.body,
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
    );
  }

  paintSources();
  paintDictionary();
  fillWords();
  fillData();
}
