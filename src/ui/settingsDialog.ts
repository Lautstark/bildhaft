import type { AppSettings, ProviderId } from '../core/types.ts';
import { arasaac, metacom } from '@lautstark/bildquelle';
/* Aliased: `metacomPanel` below is this dialog's own folded <details> for
   METACOM, and the two would otherwise be one name for the section and the
   block inside it. */
import { metacomPanel as metacomBlock } from '@lautstark/bildquelle/metacom-panel';
import { sourceFacts } from './symbolSources.ts';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { applyTheme, saveTheme, readTheme, THEMES, type Theme } from '@lautstark/design/theme';
import { languagePicker, NAMES } from '@lautstark/design/language';
import type { Sicherung } from '@lautstark/sicherung';
import { backupPanel } from '@lautstark/sicherung/backup-panel';
import { ablage, isStore } from '../db/folder.ts';
import { wherePanel } from '@lautstark/sicherung/ablage-panel';
import { adoptFolder } from '../db/repo.ts';

import { resetSymbolResolution } from './symbols.ts';
import { LANG, LANGUAGES, chooseLanguage, t, type LanguageCode } from '../i18n/index.ts';

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
    body: [langPanel, arasaacPanel, metacomPanel, wordsPanel, themePanel,
      dataPanel, dangerPanel].map((p) => p.node),
    onClose: () => {
      unsubscribe();
      folder?.dispose();
      symbolFolder.dispose();
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

  /*
   * The licensed symbol folder, drawn by the package that owns it.
   *
   * Built once and kept for `folder`'s reasons above and one of its own: the
   * block holds the hidden file inputs a pick is delivered through, and
   * rebuilding it under `fill()` would swap the input out from under a picker
   * that is already open.
   *
   * What is passed is what this product alone knows. `after` moves the default
   * source; `say` adds what that did to the page; `headline` puts the state in
   * the panel's own summary. Everything else — the licence paragraph, the four
   * acts, the state line and its sentences in both languages — is the module's,
   * and conventions.md §4.12 is why the words came with it.
   */
  let adopted = false;
  let defaultDropped = false;
  /* The module's half of the METACOM heading, kept because the other half — the
     role word — changes without the folder's state changing at all. */
  let metacomHeadline = '';
  const symbolFolder = metacomBlock({
    metacom,
    /* A value and not a function, unlike the option's own default reading.
       chooseLanguage() reloads the document, so a locale captured here cannot
       go stale — and both sibling panels above take it the same way. */
    lang: LANG === 'en' ? 'en' : 'de',
    headline: (text) => {
      metacomHeadline = text;
      paintMetacomHeading();
    },
    after: async (action) => {
      /*
       * Choosing a folder or reading a ZIP makes METACOM the default; the other
       * two deliberately do not. Re-reading re-reads a folder that may be set up
       * without being the default, and forgetting is the opposite move.
       *
       * isReady() and not the mere absence of a throw: a pick that produced no
       * usable index must not switch the whole app onto an empty source, which
       * would blank every row and look like the data had gone.
       */
      adopted = (action === 'choose' || action === 'zip')
        && metacom.isReady() && settings.activeProvider !== 'metacom';
      if (adopted) change({ ...settings, activeProvider: 'metacom' });

      /* Forgetting resets the *default* when the default was METACOM. It
         deliberately reaches into no Sammlung that chose METACOM for itself —
         that is somebody's answer, and the folder may well come back. Recorded
         rather than re-derived: `say` runs after this and would find the
         setting already moved. */
      defaultDropped = action === 'forget' && settings.activeProvider === 'metacom';
      if (defaultDropped) change({ ...settings, activeProvider: 'arasaac' });

      resetSymbolResolution('metacom');
      options.onProviderChanged();
      // The other source's heading says „Standardquelle" too, and the default
      // may just have moved off it.
      paintSources();
    },
    /*
     * The module's sentence, and what it means here added to it.
     *
     * §4.12's rule for where a product still differs: it is handed the shared
     * line and adds, rather than replacing it. So „Der METACOM-Ordner wird
     * nicht mehr gelesen." is the same sentence in all three products, and only
     * what it costs *this* Sammlung is bildhaft's.
     */
    say: (line, action) => {
      const extra = action === 'forget' ? forgottenCosts()
        : adopted ? defaultMoved('METACOM') : '';
      options.onNotify(extra ? `${line} ${extra}` : line);
    },
  });

  function close(): void {
    unsubscribe();
    folder?.dispose();
    symbolFolder.dispose();
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
    paintMetacomHeading();

    /*
     * The block is the module's; what is stacked under it is what the module
     * leaves here on purpose, and its header says why for each.
     *
     * The „Als Standard verwenden" button and its note: which source is the
     * default is a question the three products answer with three different
     * models, so there was nothing to share. The rendering chooser: it is built
     * out of this app's own `<select class="field">`, and sharing it would mean
     * sharing a menu component, which is @lautstark/design/menu's subject.
     *
     * The block itself is re-appended rather than rebuilt. `fill()` moves the
     * same node back into place, which keeps its listeners, its file inputs and
     * whatever it has in flight.
     */
    fill(metacomPanel.body,
      symbolFolder.node,
      fallback !== 'metacom' && metacom.isReady()
        ? el('div', { style: { marginTop: '10px' } }, useButton('metacom'), defaultNote())
        : null,
      renderingChooser(),
    );
  }

  /**
   * The one line the METACOM heading carries: what the source is *to this app*,
   * and then the module's word for what state it is in.
   *
   * A heading carries what a section is set to, and a summary is one line — so
   * the state goes here and the sentences stay in the body beside the buttons
   * they name. @lautstark/design conventions.md §3.7. The right-hand half is
   * `headlineFor`'s now, which is how the folder and its count come to read the
   * same here, in wochenwerk and in vorlaut-editor.
   *
   * The role word is the half no module can supply: „Standardquelle" is a fact
   * about this app's settings, and the module has never heard of them. It is
   * also why the module's blank answer for „no folder" is not simply passed
   * through — every other heading in this column says what its section is set
   * to, and one that said nothing would read as a section still loading rather
   * than as one nobody has set up.
   */
  function paintMetacomHeading(): void {
    const role = settings.activeProvider === 'metacom' ? t('ui.default_source')
      : metacom.isReady() ? t('ui.configured')
        : t('ui.not_set_up');
    metacomPanel.state.textContent = metacomHeadline
      ? `${role} · ${metacomHeadline}`
      : role;
  }

  /**
   * What forgetting the folder costs *here*, added to the module's sentence.
   *
   * The module says the shared half — „Der METACOM-Ordner wird nicht mehr
   * gelesen." — which is the correction this migration brings: the old wording
   * was „METACOM-Ordner entfernt.", and nothing is removed from anybody's disk.
   * Only bildhaft's own consequence is left to say, and often there is none.
   *
   * Forgetting resets the *default* when the default was METACOM. It
   * deliberately does not reach into Sammlungen that chose METACOM for
   * themselves — that is somebody's answer, and the folder may well come back.
   * What it must not do is leave such a Sammlung looking broken with no
   * explanation, so where the open one is in that position the sentence says
   * so; the banner above the composer says the same thing on the page itself.
   *
   * It reads `defaultDropped` rather than the setting, because `after` has
   * already moved it by the time this is asked.
   */
  function forgottenCosts(): string {
    if (options.openCollectionProvider() === 'metacom') {
      return t('ui.metacom_gone_collection');
    }
    return defaultDropped ? t('ui.metacom_gone_default') : '';
  }

  /**
   * A label wrapping a hidden file input, for the one button still built here.
   *
   * It used to draw METACOM's folder and ZIP buttons too, and those are the
   * module's now — which fixed them: a `<label>` is not a control, so it has no
   * tab stop and no Enter, and `metacom-panel` uses a real `<button>` that
   * clicks a hidden input instead. The same defect is still under
   * „Sicherung einlesen" below, which is a different surface and a change of
   * its own; it is written down here so the next reader finds it rather than
   * rediscovers it.
   */
  function fileButton(label: string, accept: string | null,
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
    return el('label', { class: 'btn sm', text: label, style: { cursor: 'pointer' } }, input);
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
    /* The same table the buttons below are named out of, so the heading and the
       pressed button cannot come to say different things. `?? LANG` is the
       module's own rule for a code it has no name for — a two-letter heading
       over a two-letter button, rather than „undefined" over one of them. */
    langPanel.state.textContent = NAMES[LANG] ?? LANG;

    /*
     * The row is @lautstark/design/language's now. Three products drew this
     * control and drew it the same, and only this one had remembered role=group
     * and an aria-label; the module's header has the count.
     *
     * It hands back the `.segmented` row and nothing around it, which is the
     * right seam: `.opt`, `.small` and `.faint` are drawn in bildhaft's
     * stylesheet and in no other product's and not in components.css, so a
     * module emitting them would ship three class names into two products that
     * draw nothing for them. The column and the note under it therefore stay
     * here, in bildhaft's own vocabulary — and so does `ui.language_note`,
     * which is a translation and not a language's name for itself.
     *
     * `refresh()` goes unused, and that is this product rather than an
     * oversight: the switch reloads, so no pressed button ever has to move
     * within a document. See i18n/index.ts for why bildhaft reloads and vorlaut
     * does not.
     */
    const picker = languagePicker({
      languages: LANGUAGES,
      current: () => LANG,
      /* The module only ever calls back with a code out of `languages`, and
         `languages` is LANGUAGES itself. The cast asserts that and no more. */
      choose: (code) => chooseLanguage(code as LanguageCode),
      label: t('ui.set_language'),
    });

    fill(langPanel.body,
      el('div', { class: 'opt' },
        picker.node,
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
        /* Not primary. The panel above this one is @lautstark/sicherung's, and
           its „Ordner wählen" is already the accent fill — design.md §4.3 gives
           that fill to one thing per screen. Two filled buttons three pixels
           apart in the same colour read as one control, which is what a visual
           baseline showed the moment one was taken. The folder is the offer that
           keeps working after somebody stops thinking about it; the file is the
           one they reach for deliberately. */
        el('button', { class: 'btn sm', text: t('ui.backup_download'),
          attrs: { type: 'button' }, on: { click: options.onExportAll } }),
        fileButton(t('ui.backup_read'), 'application/json,.json',
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
  fillWords();
  fillLanguage();
  fillTheme();
  fillData();
  fillDanger();
}
