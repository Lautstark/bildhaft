import type { AppSettings, Override, ProviderId } from '../core/types.ts';
import { arasaac, metacom, MetacomProvider, needsAttention } from '@lautstark/bildquelle';
import { sourceFacts, sourceStatusLine } from './symbolSources.ts';
import { deleteOverride, listOverrides } from '../db/repo.ts';
import { el, fill } from './dom.ts';
import { symbolView, type SymbolView } from './symbols.ts';
import { openDialog } from './dialog.ts';
import { applyTheme, saveTheme, readTheme, THEMES, type Theme } from '@lautstark/design/theme';
import type { Sicherung } from '@lautstark/sicherung';
import { backupPanel } from '@lautstark/sicherung/backup-panel';
import { ablage, isStore } from '../db/folder.ts';
import { wherePanel } from '@lautstark/sicherung/ablage-panel';
import { adoptFolder } from '../db/repo.ts';

import { resetSymbolResolution } from './symbols.ts';
import { LANG, LANGUAGES, LANGUAGE_NAMES, chooseLanguage, t } from '../i18n/index.ts';

export interface SettingsOptions {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onProviderChanged: () => void;
  /* The library was replaced from the folder, or pushed into one. Everything on
     screen is about to be wrong. */
  onFolderChanged: () => void;
  /**
   * What the open Sammlung is set to, or null when it follows the default.
   *
   * Asked rather than assumed, because it decides whether changing the default
   * changes anything on screen. „METACOM ist jetzt die Standardquelle" is true
   * either way; „alle Zeilen werden neu gezeichnet" is true only for a Sammlung
   * that follows it, and saying it to somebody whose Sammlung has answered for
   * itself would describe a redraw that never happens.
   */
  openCollectionProvider: () => ProviderId | null;
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

  /* The name of a folder somebody just picked that holds nothing of ours yet, or
     null. It lives across renders because the question is asked in the panel
     rather than in a dialog over it. */
  const store = wherePanel({
    store: ablage,
    adopt: adoptFolder,
    changed: () => options.onFolderChanged(),
    say: options.onNotify,
    lang: LANG === 'en' ? 'en' : 'de',
  });


  function makePanel(label: string, opensOnArrival = false): Panel {
    const state = el('span', { class: 'state' });
    const summary = el('summary', {}, el('span', { class: 'section', text: label }), state);
    const body = el('div', { class: 'body' });
    // name= makes the panels one exclusive group: opening one closes the rest.
    // The platform's own accordion, radio-group semantics and no script, which
    // is what keeps the state lines in the headings readable at a glance.
    // @lautstark/design conventions.md §3.5.
    const node = el('details', {
      class: 'panel',
      attrs: opensOnArrival ? { name: 'settings', open: '' } : { name: 'settings' },
    }, summary, body);
    return { node, summary, state, body };
  }

  /* Sprache first, and the one panel that opens on arrival.
   *
   * Somebody who cannot read this page needs it before any of the others, and
   * its two options name themselves - „Deutsch" and „English" are the same
   * words whichever language the rest of the dialog is in. Every other heading
   * here is in a language that reader has already told us they cannot read.
   *
   * vorlaut said this first and mitreden followed on 2026-08-29; it is the
   * page's reasoning rather than any one product's. One panel open is a choice
   * about which one somebody most needs on arrival, and "the setting you need
   * in order to use anything at all" wins. */
  const langPanel = makePanel(t('ui.set_language'), true);
  const arasaacPanel = makePanel('ARASAAC');
  const metacomPanel = makePanel('METACOM');
  const dictPanel = makePanel(t('ui.set_dictionary'));
  const wordsPanel = makePanel(t('ui.set_function_words'));
  const themePanel = makePanel(t('ui.set_appearance'));
  const dataPanel = makePanel(t('ui.where_all'));
  /* „Alles löschen" was an <h3> at the foot of „Daten" until 2026-08-29 — a
     second heading level doing a panel's job, and the one control in this
     dialog that destroys something filed under the word for making a backup.
     Its own panel, last in the column, so the list says what is here without
     anybody opening anything. vorlaut never mixed the two. */
  const dangerPanel = makePanel(t('ui.delete_all_heading'));

  const dialog = openDialog({
    title: t('ui.settings'),
    body: [langPanel, arasaacPanel, metacomPanel, dictPanel, wordsPanel, themePanel,
      dataPanel, dangerPanel].map((p) => p.node),
    onClose: () => {
      unsubscribe();
      folder?.dispose();
      for (const view of dictViews.splice(0)) view.destroy();
      options.onClose();
    },
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
  const folder = backupPanel({
    backup: options.backup,
    say: options.onNotify,
    lang: LANG === 'en' ? 'en' : 'de',
    // The heading carries the folder, the way every other panel's heading
    // carries its own state — so „Daten" stops being the one section whose
    // status you have to unfold it to learn. Blank where no folder is set,
    // and blank in a browser without a picker, where there is nothing to say.
    //
    // This was bildhaft's alone across four products drawing the same panel.
    // It is @lautstark/sicherung/backup-panel's now, and the 211 lines that
    // used to sit in src/ui/backupFolder.ts went with it — words, markup, the
    // age rule and the dispose. See that module's header for what the four
    // copies had drifted into.
    //
    // tests/unit/backup-headline.test.ts and backup-sentence.test.ts went with
    // them, to test/backup-panel.test.ts in the package. They are not deleted
    // rules: the age rule and this heading's one distinction are asserted
    // there, against the one implementation there now is, and each was watched
    // to fail before it was allowed to count.
    headline: (text) => { dataPanel.state.textContent = text; },
  });

  function close(): void {
    unsubscribe();
    folder?.dispose();
    for (const view of dictViews.splice(0)) view.destroy();
    dialog.close();
  }

  function change(next: AppSettings): void {
    settings = next;
    options.onChange(next);
  }

  /** The accent tint marks the default source; aria-current says so out loud. */
  function mark(panel: Panel, current: boolean): void {
    if (current) panel.summary.setAttribute('aria-current', 'true');
    else panel.summary.removeAttribute('aria-current');
  }

  /**
   * What changing the default does to what is on screen, in the same sentence
   * that says the default changed.
   *
   * bildhaft has always said this out loud when adopting a folder, because
   * switching source re-renders every row and a page that redraws itself
   * without a word is a page that lost your work as far as anyone can tell.
   * The property survives the move; what changed is that it is now conditional,
   * because a Sammlung with a source of its own does not follow the default and
   * does not redraw.
   */
  function defaultMoved(name: string): string {
    return options.openCollectionProvider()
      ? t('ui.default_moved_kept', { name })
      : t('ui.default_moved_redrawn', { name });
  }

  /**
   * Runs one METACOM task and, for the three that *adopt* a folder, makes
   * METACOM the default on the way out.
   *
   * Choosing a folder and then pressing a second button was two steps for one
   * intention: nobody points bildhaft at their own licensed collection in
   * order to keep rendering ARASAAC. The button stays, because the case it is
   * really about is switching back once both sources are set up.
   *
   * **What adopting means changed with the setting.** It used to switch the
   * whole app; it now moves the *default*, and reaches into no Sammlung that
   * has answered for itself. That is the right reading of one intention rather
   * than a weaker one: pointing bildhaft at a licensed folder says what to draw
   * with from here on, and a Sammlung somebody deliberately set to ARASAAC —
   * the one they hand to a colleague, the one for a child whose device has no
   * METACOM — is not covered by that intention. §3.10's own words for it are
   * that the app's settings apply forward and never reach back. The Sammlungen
   * that do follow the default are exactly the ones that never expressed a
   * view, and they move, which is the whole of what somebody adopting a folder
   * wanted.
   *
   * „Neu einlesen" and „Ordner vergessen" pass nothing: the first re-reads a
   * folder that may deliberately not be the default, and the second is the
   * opposite move.
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
      options.onNotify(adopted ? `${done} ${defaultMoved('METACOM')}` : done);
    } catch (err) {
      // An aborted folder picker is a normal user action, not an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        options.onNotify(err instanceof Error ? err.message : t('ui.didnt_work'));
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

  /**
   * The button that makes a source the default. It lives in the body: a button
   * inside a summary would toggle the panel.
   *
   * It used to say „Verwenden" and switch the whole app silently — which was
   * already the odd one out, since adopting a folder next to it said what it
   * had done. Now that it moves a default rather than the page, both what it
   * says and what happens afterwards go through the same sentence.
   */
  function useButton(id: ProviderId): HTMLElement {
    return el('button', { class: 'btn sm', text: t('ui.use_as_default'), attrs: { type: 'button' },
      on: {
        click: () => {
          change({ ...settings, activeProvider: id });
          options.onProviderChanged();
          paintSources();
          paintDictionary();
          options.onNotify(defaultMoved(sourceFacts(id).label));
        },
      } });
  }

  /**
   * The sentence that stops „Standardquelle" from being a word with no
   * referent. It is under the button rather than at the top of the dialog,
   * because it is what the button does that needs explaining.
   */
  function defaultNote(): HTMLElement {
    return el('p', { class: 'small faint', style: { margin: '10px 0 0' }, html:
      t('ui.default_note') });
  }

  function paintSources(): void {
    /* The default, which is what this card sets — not what the page is drawing
       in. Those are the same answer only while the open Sammlung has none of
       its own, which is why the word here is „Standardquelle" and not
       „Aktive Quelle": a heading that claimed to name what is on screen would
       be right by luck. */
    const fallback = settings.activeProvider;
    const status = metacom.status();

    mark(arasaacPanel, fallback === 'arasaac');
    arasaacPanel.state.textContent =
      `${fallback === 'arasaac' ? t('ui.default_source') : t('ui.always_available')} · ${sourceFacts('arasaac').facts}`;

    fill(arasaacPanel.body,
      el('p', { class: 'small muted', style: { margin: '0' },
        text: t('ui.arasaac_about') }),
      el('p', { class: 'small faint', style: { margin: '6px 0 0' }, text: arasaac.attribution ?? '' }),
      fallback !== 'arasaac'
        ? el('div', { style: { marginTop: '10px' } }, useButton('arasaac'), defaultNote())
        : null,
    );

    mark(metacomPanel, fallback === 'metacom');
    /* A heading carries what a section is set to, and a summary is one line.
     * The package's message for the state that needs acting on is a whole
     * sentence - "Zugriff auf den METACOM-Ordner muss erneut bestätigt
     * werden" - so it went in here and truncated. The state goes here and the
     * sentence goes in the body, beside the button it is about.
     * @lautstark/design conventions.md §3.7.
     *
     * The facts after the role word are symbolSources.ts', so that the folder
     * count and the root name this heading states are the same ones a
     * Sammlung's own sheet states. */
    const attention = needsAttention(status);
    const metacomFacts = sourceFacts('metacom');
    metacomPanel.state.textContent = status.kind === 'ready'
      ? `${fallback === 'metacom' ? t('ui.default_source') : t('ui.configured')} · ${metacomFacts.facts}`
      : metacomFacts.facts;

    fill(metacomPanel.body,
      el('div', { class: 'notice notice--accent', style: { marginBottom: '10px' },
        text: t('ui.metacom_licence') }),
      /* METACOM's ids are the filenames in somebody's own licensed folder, and
         those are German. Saying so on the English page is not a disclaimer:
         it is the difference between a source that looks broken and one that
         was never going to answer the words being typed at it. */
      LANG === 'en'
        ? el('p', { class: 'small faint', style: { margin: '6px 0 0' },
            text: t('ui.metacom_german_only') })
        : null,

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
              ? t('ui.metacom_permission_lost')
              // The other state that needs acting on is a folder that could not
              // be read, and the specific sentence is the useful one: which
              // failure, not that there was one. Ours since bildquelle 2.0.0 —
              // it used to hand us German whatever this page was set to.
              : status.kind === 'error' ? sourceStatusLine(status) : '' })
        : null,

      /*
       * The heading states this panel's status, so the body no longer repeats
       * it — that duplication is what the old card needed and the panel makes
       * plain. Work in progress is the exception: the spinner says the one
       * thing the sentence cannot, which is that the state can still end.
       */
      status.kind === 'loading'
        ? el('p', { class: 'small muted', style: { margin: '0 0 10px' } },
            el('span', { class: 'spinner' }), ` ${sourceStatusLine(status)}`)
        : null,

      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        MetacomProvider.supportsPersistentPicker
          ? el('button', { class: 'btn sm', text: t('ui.choose_folder'),
              attrs: { type: 'button', disabled: busy },
              on: { click: () => void run(() => metacom.pickDirectory(), t('ui.metacom_read'), true) } })
          : fileButton(t('ui.choose_folder'), null, true,
              (files) => void run(() => metacom.useFileList(files), t('ui.metacom_read'), true)),

        fileButton(t('ui.read_zip'), '.zip,application/zip', false,
          (files) => void run(() => metacom.useZip(files[0]), t('ui.zip_read'), true)),

        metacom.isReady()
          ? el('button', { class: 'btn sm', text: t('ui.reindex'),
              attrs: { type: 'button', disabled: busy },
              on: { click: () => void run(() => metacom.rebuildIndex(), t('ui.index_rebuilt')) } })
          : null,

        fallback !== 'metacom' && metacom.isReady() ? useButton('metacom') : null,

        status.kind !== 'needs-setup'
          ? el('button', { class: 'btn sm destructive', text: t('ui.forget_symbol_folder'),
              attrs: { type: 'button', disabled: busy },
              on: { click: () => void run(async () => {
                await metacom.forget();
                if (settings.activeProvider === 'metacom') {
                  change({ ...settings, activeProvider: 'arasaac' });
                }
                paintDictionary();
              }, forgottenSays()) } })
          : null,
      ),

      !MetacomProvider.supportsPersistentPicker
        ? el('p', { class: 'small faint', style: { margin: '10px 0 0' },
            text: t('ui.folder_not_remembered') })
        : null,

      fallback !== 'metacom' && metacom.isReady() ? defaultNote() : null,

      renderingChooser(),
    );
  }

  /**
   * What „Ordner vergessen" leaves behind, said before it is pressed rather
   * than discovered afterwards.
   *
   * Forgetting the folder resets the *default* when the default was METACOM.
   * It deliberately does not reach into Sammlungen that chose METACOM for
   * themselves — that is somebody's answer, and the folder may well come back.
   * What it must not do is leave such a Sammlung looking broken with no
   * explanation, so where the open one is in that position the sentence says
   * so; the banner above the composer says the same thing on the page itself.
   */
  function forgottenSays(): string {
    const own = options.openCollectionProvider();
    if (own === 'metacom') {
      return t('ui.metacom_gone_collection');
    }
    return settings.activeProvider === 'metacom'
      ? t('ui.metacom_gone_default')
      : t('ui.metacom_gone');
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
      attrs: { id: 'opt-rendering', 'aria-label': t('ui.rendering') },
      on: {
        change: () => {
          change({ ...settings, metacomRendering: select.value || null });
          options.onNotify(select.value
            ? t('ui.rendering_preferred', { name: select.value })
            : t('ui.rendering_cleared'));
        },
      },
    },
      el('option', { text: t('ui.no_preference'), attrs: { value: '' } }),
      ...renderings.map((rendering) => el('option', {
        text: `${rendering.segment} · ${t('ui.n_symbols', { n: rendering.count })}`,
        attrs: { value: rendering.segment },
      })),
    );
    select.value = settings.metacomRendering ?? '';

    return el('div', { class: 'opt', style: { marginTop: '14px' } },
      el('label', { text: t('ui.rendering'), attrs: { for: 'opt-rendering' } }),
      select,
      el('span', { class: 'small faint', text:
        t('ui.rendering_note') }),
    );
  }

  /* The thumbnails on show right now. Rebuilt on every repaint, and each one
     holds a subscription to "a symbol source became readable again" — so the
     old ones have to be let go of, or a removed entry keeps a listener alive
     that paints into a node nobody can see. row.ts keeps its views for the
     same reason. */
  let dictViews: SymbolView[] = [];

  function paintDictionary(): void {
    for (const view of dictViews.splice(0)) view.destroy();
    /* The source the page is drawing in, which is what a correction made now
       gets filed under — not the default, which the open Sammlung may not be
       following. `provider:token` is the override key, so a panel showing the
       default's entries beside a page rendering something else would be a list
       of corrections that are not the ones in force. */
    const provider = options.openCollectionProvider() ?? settings.activeProvider;
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } });

    fill(dictPanel.body,
      el('p', { class: 'small muted', style: { marginTop: '0' },
        text: t('ui.dictionary_note', { source: provider === 'arasaac' ? 'ARASAAC' : 'METACOM' }) }),
      list);
    fill(list, el('p', { class: 'small muted', text: t('ui.loading') }));
    // The count comes from the database, so the heading would otherwise be
    // blank for a frame — and a blank heading is this panel's whole promise
    // broken at the moment somebody is reading it. Say what is true meanwhile.
    if (!dictPanel.state.textContent) dictPanel.state.textContent = t('ui.loading');

    void listOverrides(provider).then((overrides: Override[]) => {
      // The heading counts what is inside, whether or not anybody opens it.
      dictPanel.state.textContent = overrides.length === 0
        ? t('ui.no_entries')
        : t(overrides.length === 1 ? 'ui.n_entry' : 'ui.n_entries', { n: overrides.length });

      if (overrides.length === 0) {
        fill(list, el('div', { class: 'empty' },
          el('b', { text: t('ui.no_entries') }),
          el('small', { text: t('ui.dictionary_empty_hint') })));
        return;
      }
      fill(list, ...overrides.map((override) => {
        /* The picture, not just its name. A dictionary of words pointing at
           labels is a table of what was decided; a dictionary showing the
           pictures is the thing itself — and it is the only place somebody can
           check a correction without going back into a Sammlung and clicking
           the symbol it belongs to. */
        const view = symbolView({
          provider: override.provider,
          id: override.symbolId,
          alt: override.label,
        });
        dictViews.push(view);
        return el('div', { class: 'dict__row' },
          el('span', { class: 'slot__img dict__pic' }, view.node),
          el('span', { class: 'dict__word' },
            el('b', { text: override.token }),
            el('span', { class: 'small muted', text: override.label })),
          el('button', { class: 'btn destructive sm', text: t('ui.remove'), attrs: { type: 'button' },
            on: { click: async () => { await deleteOverride(override.provider, override.token); paintDictionary(); } } }),
        );
      }));
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
      attrs: { spellcheck: 'false', 'aria-label': t('ui.set_function_words') },
    });
    area.value = settings.stopwords[LANG].join('\n');
    wordsPanel.state.textContent = t('ui.n_words', { n: settings.stopwords[LANG].length });

    fill(wordsPanel.body,
      el('p', { class: 'small muted', style: { marginTop: '0' }, html:
        t('ui.function_words_note') }),
      area,
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        el('button', { class: 'btn primary sm', text: t('ui.save'), attrs: { type: 'button' },
          on: { click: () => {
            const words = [...new Set(area.value.split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, LANG));
            area.value = words.join('\n');
            wordsPanel.state.textContent = t('ui.n_words', { n: words.length });
            change({ ...settings, stopwords: { ...settings.stopwords, [LANG]: words } });
          } } }),
        el('span', { class: 'small faint', text: t('ui.applies_to_new'),
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
    system: t('ui.theme_system'),
    light: t('ui.theme_light'),
    dark: t('ui.theme_dark'),
  };

  /*
   * The language of the page, which is the one choice here that reloads.
   *
   * Everything else on this dialog repaints in place. This cannot: the labels
   * are read out of the table when each element is built, and there is no
   * re-render path for the shell to rebuild them through. A reload is the
   * honest small version - see i18n/index.ts, which says what it would take to
   * do it the way vorlaut does and why bildhaft does not need to.
   *
   * The languages name themselves, so somebody who has landed in the one they
   * cannot read can still find their way out.
   */
  function fillLanguage(): void {
    langPanel.state.textContent = LANGUAGE_NAMES[LANG];

    fill(langPanel.body,
      el('div', { class: 'opt' },
        el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': t('ui.set_language') } },
          ...LANGUAGES.map((code) => el('button', {
            text: LANGUAGE_NAMES[code],
            attrs: { type: 'button', 'aria-pressed': String(code === LANG) },
            on: { click: () => chooseLanguage(code) },
          }))),
        el('span', { class: 'small faint', text: t('ui.language_note') }),
      ),
    );
  }

  function fillTheme(): void {
    const current = readTheme(THEME_KEY);
    themePanel.state.textContent = THEME_LABELS[current];

    fill(themePanel.body,
      el('div', { class: 'opt' },
        // role=group rather than radiogroup: .segmented marks its choice with
        // aria-pressed, which is the vocabulary the print dialog already uses,
        // and a radiogroup whose children are not radios reads worse than a
        // labelled group of buttons.
        el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': t('ui.set_appearance') } },
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
          t('ui.theme_note') }),
      ),
    );
  }

  function fillData(): void {
    store.refresh();
    fill(dataPanel.body,
      /* The panel itself comes from the package, so every Lautstark programme
         shows the same one. What stays here is what bildhaft alone offers
         besides the store: its standing snapshot and its file. */
      store.node,
      el('hr', { class: 'hair' }),
      el('p', { class: 'sub', text: t('ui.keep_out_in') }),
      el('div', { class: 'notice', style: { marginBottom: '14px' }, html:
        t('ui.backup_note') }),
      /* Only where there is no store folder. With one, the copies already go
         beside the work, and a second picker here would be the same offer under a
         name that reads almost the same. Null in any browser without the picker,
         and then the download below is the whole offer, unchanged. */
      isStore() ? null : folder?.node ?? null,
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
        el('button', { class: 'btn primary sm', text: t('ui.backup_download'),
          attrs: { type: 'button' }, on: { click: options.onExportAll } }),
        fileButton(t('ui.backup_read'), 'application/json,.json', false,
          (files) => { close(); options.onImport(files[0]); })),
      el('p', { class: 'small faint', style: { margin: '8px 0 0' }, html:
        t('ui.backup_read_note') }),
    );
  }

  function fillDanger(): void {
    fill(dangerPanel.body,
      el('p', { class: 'small faint', style: { margin: '0 0 10px' }, text:
        t('ui.delete_all_note') }),
      el('button', { class: 'btn destructive sm', text: t('ui.delete_all_button'),
        attrs: { type: 'button' }, on: { click: () => { close(); options.onClearAll(); } } }),
    );
  }

  paintSources();
  paintDictionary();
  fillWords();
  fillLanguage();
  fillTheme();
  fillData();
  fillDanger();
}
