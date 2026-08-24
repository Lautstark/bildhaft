import type { AppSettings, Override, ProviderId } from '../core/types.ts';
import { arasaac, metacom, MetacomProvider, needsAttention } from '@lautstark/bildquelle';
import { deleteOverride, listOverrides } from '../db/repo.ts';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { applyTheme, saveTheme, readTheme, THEMES, type Theme } from '@lautstark/design/theme';
import type { Sicherung } from '@lautstark/sicherung';
import { mountBackupFolder } from './backupFolder.ts';
import { resetSymbolResolution } from './symbols.ts';

export interface SettingsOptions {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onProviderChanged: () => void;
  onNotify: (message: string) => void;
  onClose: () => void;
  /** Library-wide actions. Per-collection ones live in the collection's own menu. */
  onExportAll: () => void;
  /** Reads a Sicherung, or a single collection's file — the format decides. */
  onImport: (file: File) => void;
  onClearAll: () => void;
  /** The standing backup. Draws nothing where the browser has no folder picker. */
  backup: Sicherung;
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
    // name= makes the panels one exclusive group: opening one closes the rest.
    // The platform's own accordion, radio-group semantics and no script, which
    // is what keeps the state lines in the headings readable at a glance.
    // @lautstark/design conventions.md §3.5.
    const node = el('details', { class: 'panel', attrs: { name: 'settings' } }, summary, body);
    return { node, summary, state, body };
  }

  const arasaacPanel = makePanel('ARASAAC');
  const metacomPanel = makePanel('METACOM');
  const dictPanel = makePanel('Mein Wörterbuch');
  const wordsPanel = makePanel('Funktionswörter');
  const themePanel = makePanel('Erscheinungsbild');
  const dataPanel = makePanel('Daten');

  const dialog = openDialog({
    title: 'Einstellungen',
    body: [arasaacPanel, metacomPanel, dictPanel, wordsPanel, themePanel, dataPanel]
      .map((p) => p.node),
    onClose: () => { unsubscribe(); folder?.dispose(); options.onClose(); },
  });

  /*
   * Each panel repaints only itself. Repainting all of them together would be
   * shorter and wrong: METACOM reports progress while it indexes, and that
   * would rebuild — and so empty — the Funktionswörter box somebody is typing
   * into. It would also re-read the dictionary from the database on every
   * progress tick.
   */
  const unsubscribe = metacom.subscribe(() => paintSources());

  /*
   * Built once and kept, not rebuilt inside fillData(). The block owns a
   * subscription and a pair of buttons whose disabled state tracks a write in
   * flight; rebuilding it on every repaint would drop both on the floor.
   */
  const folder = mountBackupFolder(options.backup, options.onNotify, (text) => {
    // The heading carries the folder, the way every other panel's heading
    // carries its own state — so „Daten" stops being the one section whose
    // status you have to unfold it to learn. Blank where no folder is set,
    // and blank in a browser without a picker, where there is nothing to say.
    dataPanel.state.textContent = text;
  });

  function close(): void {
    unsubscribe();
    folder?.dispose();
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

  /**
   * Runs one METACOM task and, for the three that *adopt* a folder, makes
   * METACOM the active source on the way out.
   *
   * Choosing a folder and then pressing „Verwenden" was two steps for one
   * intention: nobody points bildhaft at their own licensed collection in
   * order to keep rendering ARASAAC. The button stays, because the case it is
   * really about is switching back once both sources are set up.
   *
   * „Neu einlesen" and „Ordner vergessen" pass nothing: the first re-reads a
   * folder that may deliberately not be the active source, and the second is
   * the opposite move.
   */
  async function run(task: () => Promise<void>, done: string, adopt = false): Promise<void> {
    busy = true;
    paintSources();
    try {
      await task();
      /*
       * isReady() and not the mere absence of a throw: a pick that produced no
       * usable index must not switch the whole app onto an empty source, which
       * would blank every row and look like the data had gone.
       */
      const adopted = adopt && metacom.isReady() && settings.activeProvider !== 'metacom';
      if (adopted) {
        change({ ...settings, activeProvider: 'metacom' });
        paintDictionary();
      }
      resetSymbolResolution('metacom');
      options.onProviderChanged();
      // Switching source re-renders every row, so it is said out loud rather
      // than left for somebody to notice.
      options.onNotify(adopted ? `${done} METACOM ist jetzt die aktive Quelle.` : done);
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
    /* A heading carries what a section is set to, and a summary is one line.
     * The package's message for the state that needs acting on is a whole
     * sentence - "Zugriff auf den METACOM-Ordner muss erneut bestätigt
     * werden" - so it went in here and truncated. The state goes here and the
     * sentence goes in the body, beside the button it is about.
     * @lautstark/design conventions.md §3.7. */
    const attention = needsAttention(status);
    // Narrowed on kind, not on isReady(): only the ready variant has no message.
    metacomPanel.state.textContent = status.kind === 'ready'
      ? `${active === 'metacom' ? 'Aktive Quelle' : 'Eingerichtet'} · ${metacom.symbolCount} Symbole · ${metacom.rootName}`
      : attention ? 'Zugriff bestätigen'
        : status.message;

    fill(metacomPanel.body,
      el('div', { class: 'notice notice--accent', style: { marginBottom: '10px' },
        text: 'METACOM ist lizenzpflichtig. bildhaft liefert keine METACOM-Symbole mit und überträgt niemals METACOM-Dateien. Du wählst deinen eigenen, lizenzierten Ordner aus; alle Bilder werden ausschließlich lokal in deinem Browser gelesen und angezeigt.' }),

      /*
       * The one state that is a thing to do rather than a thing to read: no
       * symbol resolves until somebody presses the button below. It says what
       * is true, what the browser did, and what one press does - the middle
       * part because without it "bestätige den Zugriff" reads as bildhaft
       * having mislaid the folder, which it has not.
       */
      attention
        ? el('div', { class: 'notice bad', style: { marginBottom: '10px' }, text:
            status.kind === 'needs-setup'
              ? 'Der Ordner ist gemerkt, aber dieser Browser hat den Zugriff darauf '
                + 'zurückgesetzt — das macht er zwischen Besuchen. Ein Druck auf '
                + '„Symbolordner wählen" bestätigt ihn wieder; neu ausgesucht werden '
                + 'muss nichts.'
              // The other state that needs acting on is a folder that could not
              // be read, and the package's own words for it are the specific
              // ones: which failure, not that there was one.
              : status.kind === 'error' ? status.message : '' })
        : null,

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
              on: { click: () => void run(() => metacom.pickDirectory(), 'METACOM-Ordner eingelesen.', true) } })
          : fileButton('Symbolordner wählen', null, true,
              (files) => void run(() => metacom.useFileList(files), 'METACOM-Ordner eingelesen.', true)),

        fileButton('ZIP einlesen', '.zip,application/zip', false,
          (files) => void run(() => metacom.useZip(files[0]), 'ZIP eingelesen.', true)),

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

      renderingChooser(),
    );
  }

  /*
   * Only worth showing when the folder actually holds parallel renderings.
   * A copy pointed straight at one of them has nothing to choose between, and
   * an empty dropdown would just be a question with one answer.
   */
  function renderingChooser(): HTMLElement | null {
    const renderings = metacom.isReady() ? metacom.renderings() : [];
    if (renderings.length < 2) return null;

    const select = el('select', {
      class: 'field',
      attrs: { id: 'opt-rendering', 'aria-label': 'Darstellung' },
      on: {
        change: () => {
          change({ ...settings, metacomRendering: select.value || null });
          options.onNotify(select.value
            ? `Darstellung „${select.value}“ wird bevorzugt.`
            : 'Keine Darstellung mehr bevorzugt.');
        },
      },
    },
      el('option', { text: 'Keine Vorgabe', attrs: { value: '' } }),
      ...renderings.map((rendering) => el('option', {
        text: `${rendering.segment} · ${rendering.count} Symbole`,
        attrs: { value: rendering.segment },
      })),
    );
    select.value = settings.metacomRendering ?? '';

    return el('div', { class: 'opt', style: { marginTop: '14px' } },
      el('label', { text: 'Darstellung', attrs: { for: 'opt-rendering' } }),
      select,
      el('span', { class: 'small faint', text:
        'METACOM enthält dieselben Symbole mehrfach — mit und ohne Rahmen, mit und '
        + 'ohne aufgedrucktes Wort. Ohne Vorgabe entscheidet der Zufall, welche '
        + 'Fassung ein Satz bekommt. Die Auswahl gilt für neue Sätze und ordnet '
        + 'bestehende Zeilen nach; von Hand gewählte Symbole bleiben.' }),
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

  /*
   * Hell oder dunkel, or neither. "Erscheinungsbild" and not "Darstellung":
   * METACOM's rendering picker in this same dialog is already called that, and
   * two controls under one name is worse for somebody hearing the dialog read
   * out than for somebody seeing it. It is also the word macOS and iOS use for
   * this exact choice, which is where most people will have met it. The scheme lives in localStorage rather than
   * in AppSettings with everything else on this dialog, and that is not an
   * oversight: AppSettings is in IndexedDB, which cannot be read before the
   * first paint, so a scheme stored there would arrive as a flash of the wrong
   * one. @lautstark/design/theme owns that reasoning and both siblings share it.
   */
  const THEME_KEY = 'bildhaft.theme';
  const THEME_LABELS: Record<Theme, string> = {
    system: 'Systemeinstellung',
    light: 'Hell',
    dark: 'Dunkel',
  };

  function fillTheme(): void {
    const current = readTheme(THEME_KEY);
    themePanel.state.textContent = THEME_LABELS[current];

    fill(themePanel.body,
      el('div', { class: 'opt' },
        // role=group rather than radiogroup: .segmented marks its choice with
        // aria-pressed, which is the vocabulary the print dialog already uses,
        // and a radiogroup whose children are not radios reads worse than a
        // labelled group of buttons.
        el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': 'Erscheinungsbild' } },
          ...THEMES.map((theme) => el('button', {
            text: THEME_LABELS[theme],
            attrs: { type: 'button', 'aria-pressed': String(theme === current) },
            on: { click: () => {
              saveTheme(THEME_KEY, theme);
              applyTheme(theme);
              // Repaint this panel only. The heading carries the choice, and
              // the buttons carry which one is pressed; nothing else on the
              // dialog depends on the scheme, because the tokens do the work.
              fillTheme();
            } },
          }))),
        el('span', { class: 'small faint', text:
          'Ohne eigene Wahl folgt bildhaft dem Gerät — und wechselt mit, wenn das '
          + 'Gerät abends auf dunkel umstellt. Die Wahl gilt nur in diesem Browser.' }),
      ),
    );
  }

  function fillData(): void {
    fill(dataPanel.body,
      el('div', { class: 'notice', style: { marginBottom: '14px' }, html:
        '<strong>Sicherung.</strong> bildhaft speichert alles im Browser. Wird der '
        + 'Browser-Speicher gelöscht, ist die Arbeit weg. Eine Sicherung enthält alle '
        + 'Sammlungen und dein Wörterbuch — nur Symbol-Verweise, keine Bilder.' }),
      // The folder first, because it is the one that keeps working after
      // somebody stops thinking about it. Null in any browser without the
      // picker, and then the download below is the whole offer, unchanged.
      folder?.node ?? null,
      /*
       * The two halves of the same subject, side by side.
       *
       * „Sicherung einlesen" used to be „Importieren" in the sidebar, a screen
       * away from the button that makes the file it reads. That was history
       * rather than intent: the sidebar button predates there being a backup
       * format at all — it meant "bring in one Sammlung" — and quietly gained
       * a second job when the full-backup format arrived. It still does both,
       * because importCollectionFile routes on the file's own format.
       */
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('button', { class: 'btn primary sm', text: 'Sicherung als Datei',
          attrs: { type: 'button' }, on: { click: options.onExportAll } }),
        fileButton('Sicherung einlesen', 'application/json,.json', false,
          (files) => { close(); options.onImport(files[0]); })),
      el('p', { class: 'small faint', style: { margin: '8px 0 0' }, html:
        'Einlesen fügt hinzu und überschreibt nie — auch die Datei einer '
        + 'einzelnen Sammlung wird hier gelesen. Einzelne Sammlungen '
        + 'exportierst du über das Menü <strong>⋯</strong> neben ihrem Namen.' }),
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
  fillTheme();
  fillData();
}
