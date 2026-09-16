<script lang="ts">
  import type { ProviderId } from '../core/types.ts';
  import { arasaac, metacom } from '@lautstark/bildquelle';
  import { metacomPanel } from '@lautstark/bildquelle/metacom-panel';
  import { backupPanel } from '@lautstark/sicherung/backup-panel';
  import { wherePanel } from '@lautstark/sicherung/ablage-panel';
  import { applyTheme, readTheme, saveTheme, THEMES, type Theme } from '@lautstark/design/theme';
  import { languagePicker, NAMES } from '@lautstark/design/language';
  import Vanilla from '../pieces/Vanilla.svelte';
  import { sourceFacts } from './symbolSources.ts';
  import { resetSymbolResolution } from './symbols.ts';
  import { ablage, isStore } from '../db/folder.ts';
  import { adoptFolder } from '../db/repo.ts';
  import { downloadJson, exportEverything } from '../db/exportImport.ts';
  import { activeCollection, s as store } from '../app/state.svelte.ts';
  import { persistSettings } from '../app/settings.ts';
  import { confirmClearAll, handleImport, refreshCollections, setActive, syncProvider } from '../app/collections.ts';
  import { notify } from '../app/notify.ts';
  import { standing } from '../app/standing.ts';
  import { LANG, LANGUAGES, chooseLanguage, t, type LanguageCode } from '../i18n/index.ts';

  let { s }: { s: { close(): void } } = $props();

  let settings = $derived(store.settings!);
  const change = (next: typeof settings) => persistSettings(next);

  /* What the source last said about itself. Each panel reads it and draws only
     itself: repainting all of them together would be shorter and wrong —
     METACOM reports progress while it indexes, and that would rebuild, and so
     empty, the Funktionswörter box somebody is typing into. */
  let status = $state(metacom.status());
  $effect(() => metacom.subscribe(() => { status = metacom.status(); }));

  /* ------------------------------------------------- the shared panels --- */

  /*
   * Built once and kept. Each of the three owns a subscription, a pair of
   * buttons whose disabled state tracks a write in flight, or the hidden file
   * inputs a pick is delivered through; rebuilding one under a repaint would
   * drop all of that on the floor, or swap the input out from under a picker
   * that is already open. `Vanilla.svelte` puts them in place under a
   * `display: contents` host, so nothing about their layout changes.
   */
  let dataHeadline = $state('');
  let metacomHeadline = $state('');
  let adopted = false;
  let defaultDropped = false;

  /* The name of a folder somebody just picked that holds nothing of ours yet is
     asked about in the panel rather than in a dialog over it, which is why this
     lives for as long as the sheet does. */
  const store_panel = wherePanel({
    store: ablage,
    adopt: adoptFolder,
    changed: () => { void refreshCollections(); if (store.activeId) setActive(store.activeId); },
    say: notify,
    lang: LANG === 'en' ? 'en' : 'de',
  });

  const folder = backupPanel({
    backup: standing(),
    say: notify,
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
    headline: (text: string) => { dataHeadline = text; },
  });

  /*
   * The licensed symbol folder, drawn by the package that owns it.
   *
   * What is passed is what this product alone knows. `after` moves the default
   * source; `say` adds what that did to the page; `headline` puts the state in
   * the panel's own summary. Everything else — the licence paragraph, the four
   * acts, the state line and its sentences in both languages — is the module's,
   * and conventions.md §4.12 is why the words came with it.
   */
  const symbolFolder = metacomPanel({
    metacom,
    /* A value and not a function, unlike the option's own default reading.
       chooseLanguage() reloads the document, so a locale captured here cannot
       go stale — and both sibling panels above take it the same way. */
    lang: LANG === 'en' ? 'en' : 'de',
    headline: (text: string) => { metacomHeadline = text; },
    after: async (action: string) => {
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
      void syncProvider();
      status = metacom.status();
    },
    /*
     * The module's sentence, and what it means here added to it.
     *
     * §4.12's rule for where a product still differs: it is handed the shared
     * line and adds, rather than replacing it. So „Der METACOM-Ordner wird
     * nicht mehr gelesen." is the same sentence in all three products, and only
     * what it costs *this* Sammlung is bildhaft's.
     */
    say: (line: string, action: string) => {
      const extra = action === 'forget' ? forgottenCosts()
        : adopted ? defaultMoved('METACOM') : '';
      notify(extra ? `${line} ${extra}` : line);
    },
  });

  store_panel.refresh();

  $effect(() => () => { folder?.dispose(); symbolFolder.dispose(); });

  /* ------------------------------------------------------------ sources --- */

  /* The default, which is what this card sets — not what the page is drawing
     in. Those are the same answer only while the open Sammlung has none of its
     own, which is why the word here is „Standardquelle" and not „Aktive
     Quelle": a heading that claimed to name what is on screen would be right by
     luck. */
  let fallback = $derived(settings.activeProvider);

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
    return activeCollection()?.provider
      ? t('ui.default_moved_kept', { name })
      : t('ui.default_moved_redrawn', { name });
  }

  /**
   * What forgetting the folder costs *here*, added to the module's sentence.
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
    if (activeCollection()?.provider === 'metacom') return t('ui.metacom_gone_collection');
    return defaultDropped ? t('ui.metacom_gone_default') : '';
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
  function useAsDefault(id: ProviderId): void {
    change({ ...settings, activeProvider: id });
    void syncProvider();
    notify(defaultMoved(sourceFacts(id).label));
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
  let metacomState = $derived.by(() => {
    void status;
    const role = settings.activeProvider === 'metacom' ? t('ui.default_source')
      : metacom.isReady() ? t('ui.configured')
        : t('ui.not_set_up');
    return metacomHeadline ? `${role} · ${metacomHeadline}` : role;
  });

  let arasaacState = $derived(
    `${fallback === 'arasaac' ? t('ui.default_source') : t('ui.always_available')} · ${sourceFacts('arasaac').facts}`);

  /*
   * Only worth showing when the folder actually holds parallel renderings.
   * A copy pointed straight at one of them has nothing to choose between, and
   * an empty dropdown would just be a question with one answer.
   */
  let renderings = $derived.by(() => {
    void status;
    return metacom.isReady() ? metacom.renderings() : [];
  });

  let metacomReady = $derived.by(() => { void status; return metacom.isReady(); });

  /* ------------------------------------------------- Funktionswörter --- */

  /*
   * The box is never repainted from outside, so that nothing — a METACOM
   * progress tick least of all — can empty it mid-sentence. This is the one
   * place the agreement allows a save button: half a word list would do
   * something wrong.
   */
  let area: HTMLTextAreaElement;
  let wordCount = $state(0);
  $effect(() => {
    area.value = settings.stopwords[LANG].join('\n');
    wordCount = settings.stopwords[LANG].length;
  });

  function saveWords(): void {
    const words = [...new Set(area.value.split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, LANG));
    area.value = words.join('\n');
    wordCount = words.length;
    change({ ...settings, stopwords: { ...settings.stopwords, [LANG]: words } });
  }

  /* ---------------------------------------------------- Erscheinungsbild --- */

  /*
   * Hell oder dunkel, or neither. "Erscheinungsbild" and not "Darstellung":
   * METACOM's rendering picker in this same dialog is already called that, and
   * two controls under one name is worse for somebody hearing the dialog read
   * out than for somebody seeing it. It is also the word macOS and iOS use for
   * this exact choice, which is where most people will have met it. The scheme
   * lives in localStorage rather than in AppSettings with everything else on
   * this dialog, and that is not an oversight: AppSettings is in IndexedDB,
   * which cannot be read before the first paint, so a scheme stored there would
   * arrive as a flash of the wrong one. @lautstark/design/theme owns that
   * reasoning and both siblings share it.
   */
  const THEME_KEY = 'bildhaft.theme';
  const THEME_LABELS: Record<Theme, string> = {
    system: t('ui.theme_system'),
    light: t('ui.theme_light'),
    dark: t('ui.theme_dark'),
  };
  let theme = $state<Theme>(readTheme(THEME_KEY));

  function pickTheme(next: Theme): void {
    saveTheme(THEME_KEY, next);
    applyTheme(next);
    theme = next;
  }

  /* ------------------------------------------------------------ Sprache --- */

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
   *
   * The row is @lautstark/design/language's. It hands back the `.segmented` row
   * and nothing around it, which is the right seam: `.opt`, `.small` and
   * `.faint` are drawn in bildhaft's stylesheet and in no other product's and
   * not in components.css, so a module emitting them would ship three class
   * names into two products that draw nothing for them. The column and the note
   * under it therefore stay here, in bildhaft's own vocabulary — and so does
   * `ui.language_note`, which is a translation and not a language's name for
   * itself.
   *
   * `refresh()` goes unused, and that is this product rather than an oversight:
   * the switch reloads, so no pressed button ever has to move within a document.
   */
  const picker = languagePicker({
    languages: LANGUAGES,
    current: () => LANG,
    /* The module only ever calls back with a code out of `languages`, and
       `languages` is LANGUAGES itself. The cast asserts that and no more. */
    choose: (code: string) => chooseLanguage(code as LanguageCode),
    label: t('ui.set_language'),
  });

  /* --------------------------------------------------------------- Daten --- */

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
  let importInput: HTMLInputElement;

  async function exportAll(): Promise<void> {
    /* Whole, always: a file somebody asked for by hand has to stand on its own,
       wherever it is opened. The standing backup is the one that leaves the
       bytes where the folder already has them. */
    downloadJson(await exportEverything(true), LANG === 'de' ? 'sicherung' : 'backup');
    notify(t('ui.backup_exported'));
  }
</script>

<!--
  Sprache first, and the one panel that opens on arrival.

  Somebody who cannot read this page needs it before any of the others, and its
  two options name themselves - „Deutsch" and „English" are the same words
  whichever language the rest of the dialog is in. Every other heading here is
  in a language that reader has already told us they cannot read.

  vorlaut said this first and mitreden followed on 2026-08-29; it is the page's
  reasoning rather than any one product's. One panel open is a choice about
  which one somebody most needs on arrival, and "the setting you need in order
  to use anything at all" wins.

  `name=` makes the panels one exclusive group: opening one closes the rest. The
  platform's own accordion, radio-group semantics and no script, which is what
  keeps the state lines in the headings readable at a glance.
  @lautstark/design conventions.md §3.5.
--><details class="panel" name="settings" open><summary><span class="section">{t('ui.set_language')}</span><span class="state">{NAMES[LANG] ?? LANG}</span></summary><div class="body"><div class="opt"><Vanilla node={picker.node} /><span class="small faint">{t('ui.language_note')}</span></div></div></details><details class="panel" name="settings"><summary aria-current={fallback === 'arasaac' ? 'true' : null}><span class="section">ARASAAC</span><span class="state">{arasaacState}</span></summary><div class="body"><p class="small muted" style="margin:0">{t('ui.arasaac_about')}</p><p class="small faint" style="margin:6px 0 0">{arasaac.attribution ?? ''}</p>{#if fallback !== 'arasaac'}<div style="margin-top:10px"><button class="btn sm" type="button" onclick={() => useAsDefault('arasaac')}>{t('ui.use_as_default')}</button><!--
  The sentence that stops „Standardquelle" from being a word with no referent.
  It is under the button rather than at the top of the dialog, because it is
  what the button does that needs explaining.
--><p class="small faint" style="margin:10px 0 0">{@html t('ui.default_note')}</p></div>{/if}</div></details><details class="panel" name="settings"><summary aria-current={fallback === 'metacom' ? 'true' : null}><span class="section">METACOM</span><span class="state">{metacomState}</span></summary><div class="body"><!--
  The block is the module's; what is stacked under it is what the module leaves
  here on purpose, and its header says why for each.

  The „Als Standard verwenden" button and its note: which source is the default
  is a question the three products answer with three different models, so there
  was nothing to share. The rendering chooser: it is built out of this app's own
  `<select class="field">`, and sharing it would mean sharing a menu component,
  which is @lautstark/design/menu's subject.
--><Vanilla node={symbolFolder.node} />{#if fallback !== 'metacom' && metacomReady}<div style="margin-top:10px"><button class="btn sm" type="button" onclick={() => useAsDefault('metacom')}>{t('ui.use_as_default')}</button><p class="small faint" style="margin:10px 0 0">{@html t('ui.default_note')}</p></div>{/if}{#if renderings.length >= 2}<div class="opt" style="margin-top:14px"><label for="opt-rendering">{t('ui.rendering')}</label><select class="field" id="opt-rendering" aria-label={t('ui.rendering')} value={settings.metacomRendering ?? ''} onchange={(event) => { const name = event.currentTarget.value; change({ ...settings, metacomRendering: name || null }); notify(name ? t('ui.rendering_preferred', { name }) : t('ui.rendering_cleared')); }}><option value="">{t('ui.no_preference')}</option>{#each renderings as rendering (rendering.segment)}<option value={rendering.segment}>{rendering.segment} · {t('ui.n_symbols', { n: rendering.count })}</option>{/each}</select><span class="small faint">{t('ui.rendering_note')}</span></div>{/if}</div></details><details class="panel" name="settings"><summary><span class="section">{t('ui.set_function_words')}</span><span class="state">{t('ui.n_words', { n: wordCount })}</span></summary><div class="body"><p class="small muted" style="margin-top:0">{@html t('ui.function_words_note')}</p><textarea bind:this={area} class="field stopword-area" spellcheck="false" aria-label={t('ui.set_function_words')}></textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary sm" type="button" onclick={saveWords}>{t('ui.save')}</button><span class="small faint" style="align-self:center">{t('ui.applies_to_new')}</span></div></div></details><details class="panel" name="settings"><summary><span class="section">{t('ui.set_appearance')}</span><span class="state">{THEME_LABELS[theme]}</span></summary><div class="body"><div class="opt"><!--
  role=group rather than radiogroup: .segmented marks its choice with
  aria-pressed, which is the vocabulary the print dialog already uses, and a
  radiogroup whose children are not radios reads worse than a labelled group of
  buttons.
--><div class="segmented" role="group" aria-label={t('ui.set_appearance')}>{#each THEMES as one (one)}<button type="button" aria-pressed={one === theme} onclick={() => pickTheme(one)}>{THEME_LABELS[one]}</button>{/each}</div><span class="small faint">{t('ui.theme_note')}</span></div></div></details><details class="panel" name="settings"><summary><span class="section">{t('ui.where_all')}</span><span class="state">{dataHeadline}</span></summary><div class="body"><!--
  The panel itself comes from the package, so every Lautstark programme shows
  the same one. What stays here is what bildhaft alone offers besides the store:
  its standing snapshot and its file.
--><Vanilla node={store_panel.node} /><hr class="hair" /><p class="sub">{t('ui.keep_out_in')}</p><!--
  .explainer and not .notice: components.css reserves .notice for the outcome of
  an action just taken, and this is standing prose about what a backup is. It
  looks exactly as it did under the old local .notice — same plate, same type —
  see app.css on the rename.
--><div class="explainer" style="margin-bottom:14px">{@html t('ui.backup_note')}</div><!--
  Only where there is no store folder. With one, the copies already go beside
  the work, and a second picker here would be the same offer under a name that
  reads almost the same. Absent in any browser without the picker, and then the
  download below is the whole offer, unchanged.
-->{#if !isStore() && folder}<Vanilla node={folder.node} />{/if}<!--
  The two halves of the same subject, side by side.

  „Sicherung einlesen" used to be „Importieren" in the sidebar, a screen away
  from the button that makes the file it reads. That was history rather than
  intent: the sidebar button predates there being a backup format at all — it
  meant "bring in one Sammlung" — and quietly gained a second job when the
  full-backup format arrived. It still does both, because importCollectionFile
  routes on the file's own format.
--><div style="display:flex;gap:8px;flex-wrap:wrap"><!--
  Not primary. The panel above this one is @lautstark/sicherung's, and its
  „Ordner wählen" is already the accent fill — design.md §4.3 gives that fill to
  one thing per screen. Two filled buttons three pixels apart in the same colour
  read as one control, which is what a visual baseline showed the moment one was
  taken. The folder is the offer that keeps working after somebody stops
  thinking about it; the file is the one they reach for deliberately.
--><button class="btn sm" type="button" onclick={() => void exportAll()}>{t('ui.backup_download')}</button><label class="btn sm" style="cursor:pointer">{t('ui.backup_read')}<input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={() => { const file = importInput.files?.[0]; importInput.value = ''; if (file) { s.close(); void handleImport(file); } }} /></label></div><p class="small faint" style="margin:8px 0 0">{@html t('ui.backup_read_note')}</p></div></details><!--
  „Alles löschen" was an <h3> at the foot of „Daten" until 2026-08-29 — a second
  heading level doing a panel's job, and the one control in this dialog that
  destroys something filed under the word for making a backup. Its own panel,
  last in the column, so the list says what is here without anybody opening
  anything. vorlaut never mixed the two.
--><details class="panel" name="settings"><summary><span class="section">{t('ui.delete_all_heading')}</span><span class="state"></span></summary><div class="body"><p class="small faint" style="margin:0 0 10px">{t('ui.delete_all_note')}</p><button class="btn destructive sm" type="button" onclick={() => { s.close(); void confirmClearAll(); }}>{t('ui.delete_all_button')}</button></div></details>
