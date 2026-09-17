<script lang="ts">
  import type { ProviderId } from '../core/types.ts';
  import { arasaac, metacom } from '@lautstark/bildquelle';
  import type { MetacomAction } from '@lautstark/bildquelle/metacom-panel';
  import MetacomPanel from '@lautstark/bildquelle/svelte/MetacomPanel';
  import { headlineFor } from '@lautstark/sicherung/backup-panel';
  import BackupPanel from '@lautstark/sicherung/svelte/BackupPanel';
  import AblagePanel from '@lautstark/sicherung/svelte/AblagePanel';
  import { applyTheme, readTheme, saveTheme, THEMES, type Theme } from '@lautstark/design/theme';
  import { languagePicker, NAMES } from '@lautstark/design/language';
  import Vanilla from '@lautstark/design/svelte/Vanilla';
  import Panel from '@lautstark/design/svelte/Panel';
  import Dropdown from '@lautstark/design/svelte/Dropdown';
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
   * Three panels this product does not draw, each the package's own Svelte
   * component.
   *
   * They were nodes built by the vanilla twins and parked under
   * `@lautstark/design/svelte/Vanilla` until now — same markup, same words,
   * the same `WORDS` table, which is imported by the components rather than
   * copied, so „same words" is a fact about the build. What the ports change is
   * the same change three times: `lang` is a value rather than a thunk, because
   * the reactivity is the framework's here; and `refresh()` and `dispose()` are
   * gone, because an `$effect` returning its teardown *is* the unsubscribe the
   * vanilla panels handed back — the one this file remembered to call for two
   * of the three and the one three of the four products it replaced never
   * called at all.
   *
   * The words and the markup left this file a round earlier, when „Wo alles
   * liegt" stopped being 211 lines of `src/ui/backupFolder.ts`; what leaves now
   * is the last of the wiring around them. `Vanilla` stays for the language
   * picker below, which has no component twin.
   *
   * ## This round was withdrawn once, and what it cost is why
   *
   * The components used to import their own package's `src/`. `exports["."]`
   * points at `dist`, and `tsc` writes `#private;` into a class's declaration,
   * so the `MetacomProvider` in `MetacomPanel`'s signature and the one
   * `@lautstark/bildquelle` hands this file were two nominally distinct types:
   * bildhaft could not pass its own provider to its own panel, and the swap
   * compiled only behind a cast asserting that two identical classes were the
   * same class. It cost bytes as well — the bundler resolved `../src/x.js` to
   * the TypeScript beside it and shipped a second copy of every module a
   * component reached that way, +12.9 kB raw and +3.7 kB gz here, measured.
   *
   * Both packages now import their published entries and have a test that goes
   * red if that stops being true (sicherung 1.17.1, bildquelle 2.3.2). There is
   * no cast below. If one is ever needed again the fix has come undone, and
   * that is a finding rather than something to write around.
   */

  /* The page's language, once. A value and not a thunk: `chooseLanguage()`
     reloads the document, so a locale read here cannot go stale — and all
     three components take it the same way. */
  const panelLang = LANG === 'en' ? 'en' : 'de';

  let metacomHeadline = $state('');
  let adopted = false;
  let defaultDropped = false;

  /*
   * What „Wo alles liegt" carries in its own heading, asked here rather than
   * reported by the panel.
   *
   * `BackupPanel` tells a `headline` callback on every paint, and that is the
   * right seam for a product that always draws it. bildhaft does not: the block
   * is offered only where there is no store folder, because with one the copies
   * already go beside the work. The standing backup runs either way — app/
   * backup.ts schedules it on every write and has never heard of the store — so
   * a heading fed by the panel would go blank for exactly the households that
   * have both, and a backup that is still being written would stop being
   * visible without unfolding anything. That heading is what the vanilla panel
   * reported from outside the `{#if}`, and it stays true here.
   *
   * `headlineFor` is the same function the component calls, and answers `''`
   * where there is nothing to say — no folder set, and a browser with no
   * picker, where there is no backup story to tell at all.
   */
  const backup = standing();
  let backupStatus = $state.raw(backup.status);
  $effect(() => {
    /* Read again on the way in. `Sicherung.subscribe` does not call its
       listener on subscribe, so the status this panel arrived at is the one
       read here, and re-reading closes the gap between construction and the
       effect in which a debounced write could have landed. */
    backupStatus = backup.status;
    return backup.subscribe((next) => { backupStatus = next; });
  });
  let dataHeadline = $derived(headlineFor(backupStatus, panelLang));

  /* Everything on screen is about to be wrong. */
  function storeChanged(): void {
    void refreshCollections();
    if (store.activeId) setActive(store.activeId);
  }

  /*
   * What a METACOM act means to this app, which is the half the panel leaves
   * here. `after` moves the default source; `say` adds what that did to the
   * page. Everything else — the licence paragraph, the four acts, the state
   * line and its sentences in both languages — is the component's, and
   * conventions.md §4.12 is why the words came with it.
   */
  async function metacomActed(action: MetacomAction): Promise<void> {
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
  }

  /*
   * The component's sentence, and what it means here added to it.
   *
   * §4.12's rule for where a product still differs: it is handed the shared
   * line and adds, rather than replacing it. So „Der METACOM-Ordner wird nicht
   * mehr gelesen." is the same sentence in all three products, and only what it
   * costs *this* Sammlung is bildhaft's.
   */
  function metacomSaid(line: string, action: MetacomAction): void {
    const extra = action === 'forget' ? forgottenCosts()
      : adopted ? defaultMoved('METACOM') : '';
    notify(extra ? `${line} ${extra}` : line);
  }

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

  /** What the rendering trigger says: the answer, not the question. The count
   *  stays in the list, where it helps somebody choose between two folders that
   *  hold the same pictures; on the trigger it would be a fact about a decision
   *  already made. */
  let renderingLabel = $derived(settings.metacomRendering ?? t('ui.no_preference'));

  function prefer(name: string | null): void {
    change({ ...settings, metacomRendering: name });
    notify(name ? t('ui.rendering_preferred', { name }) : t('ui.rendering_cleared'));
  }

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

  /* ------------------------------------------------- the folded column --- */

  /*
   * Which panel is unfolded, one flag each, and every one of them is *bound*.
   *
   * The panels share a `name`, which makes them the platform's own accordion:
   * opening one makes the browser remove another's `open` attribute directly,
   * and Svelte never sees that write. Passed one way, this record would go on
   * saying „open" for a panel the browser has already folded; the next write of
   * `true` would then short-circuit against Svelte's own copy of the value,
   * never reach the DOM, and the panel would stay shut with nothing red
   * anywhere. Bound, the `toggle` the browser fires on its way past comes back
   * here and the record stays true. @lautstark/design conventions.md §6.2.
   *
   * Sprache is the one that starts open, which is the column's own comment
   * below and §3.11.
   */
  let open = $state({
    language: true,
    arasaac: false,
    metacom: false,
    words: false,
    appearance: false,
    data: false,
    danger: false,
  });
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

  `group` makes the panels one exclusive group — `name="settings"` on each
  `<details>`, which is its default. The platform's own accordion, radio-group
  semantics and no script, which is what keeps the state lines in the headings
  readable at a glance. @lautstark/design conventions.md §3.5.

  The `<details>`, its summary and the two spans are
  @lautstark/design/svelte/Panel's since design v1.34.0; components.css had
  drawn every one of those rules for as long as the panel has existed and this
  file was retyping the markup around them. bildhaft has no `.panel` rule of its
  own and already spelled the body `.body`, so nothing here is drawn
  differently than it was — see §6.2, and `open` above on why each one is bound.
--><Panel section={t('ui.set_language')} state={NAMES[LANG] ?? LANG} bind:open={open.language}><div class="opt"><Vanilla node={picker.node} /><span class="small faint">{t('ui.language_note')}</span></div></Panel><Panel section="ARASAAC" state={arasaacState} current={fallback === 'arasaac'} bind:open={open.arasaac}><p class="small muted" style="margin:0">{t('ui.arasaac_about')}</p><p class="small faint" style="margin:6px 0 0">{arasaac.attribution ?? ''}</p>{#if fallback !== 'arasaac'}<div style="margin-top:10px"><button class="btn sm" type="button" onclick={() => useAsDefault('arasaac')}>{t('ui.use_as_default')}</button><!--
  The sentence that stops „Standardquelle" from being a word with no referent.
  It is under the button rather than at the top of the dialog, because it is
  what the button does that needs explaining.
--><p class="small faint" style="margin:10px 0 0">{@html t('ui.default_note')}</p></div>{/if}</Panel><Panel section="METACOM" state={metacomState} current={fallback === 'metacom'} bind:open={open.metacom}><!--
  The block is the module's; what is stacked under it is what the module leaves
  here on purpose, and its header says why for each.

  The „Als Standard verwenden" button and its note: which source is the default
  is a question the three products answer with three different models, so there
  was nothing to share. The rendering chooser: it is built out of this app's own
  `<select class="field">`, and sharing it would mean sharing a menu component,
  which is @lautstark/design/menu's subject. That second one no longer holds:
  the menu component is shared now, and the chooser is `Dropdown` over it.
--><MetacomPanel {metacom} lang={panelLang} headline={(text) => { metacomHeadline = text; }} after={metacomActed} say={metacomSaid} />{#if fallback !== 'metacom' && metacomReady}<div style="margin-top:10px"><button class="btn sm" type="button" onclick={() => useAsDefault('metacom')}>{t('ui.use_as_default')}</button><p class="small faint" style="margin:10px 0 0">{@html t('ui.default_note')}</p></div>{/if}{#if renderings.length >= 2}<!--
  Which rendering. A `<select>` until now, and conventions.md §6.10 is the rule
  it broke: the open list of a `<select>` is drawn by the operating system and is
  the one thing on this page that cannot follow the tokens — so the question was
  asked in this family's shapes and answered in the platform's. It is
  @lautstark/design/svelte/Dropdown now, and it is a set of alternatives rather
  than a list of commands, so each item carries `checked` and the menu says which
  one is in force instead of leaving that to be read off the drawing.

  `aria-labelledby` pointing at the caption, and the caption is a `<span>`. A
  `<label>` does not name a `<button>` — that is the latent defect §6.10 found in
  the one call site that looked like a template — so the question has to be an
  element the trigger points at.

  `field` because this stands in a column of full-width fields and a trigger as
  wide as the word on it would leave them reading as different kinds of thing;
  `start` because the list hangs off a control at the left of the panel.
--><div class="opt" style="margin-top:14px"><span class="opt__label" id="opt-rendering-label">{t('ui.rendering')}</span><Dropdown id="opt-rendering" field start labelledBy="opt-rendering-label" label={renderingLabel} build={(add) => { add(t('ui.no_preference'), () => prefer(null), { checked: settings.metacomRendering === null }); for (const rendering of renderings) add(`${rendering.segment} · ${t('ui.n_symbols', { n: rendering.count })}`, () => prefer(rendering.segment), { checked: settings.metacomRendering === rendering.segment }); }} /><span class="small faint">{t('ui.rendering_note')}</span></div>{/if}</Panel><Panel section={t('ui.set_function_words')} state={t('ui.n_words', { n: wordCount })} bind:open={open.words}><p class="small muted" style="margin-top:0">{@html t('ui.function_words_note')}</p><textarea bind:this={area} class="field stopword-area" spellcheck="false" aria-label={t('ui.set_function_words')}></textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary sm" type="button" onclick={saveWords}>{t('ui.save')}</button><span class="small faint" style="align-self:center">{t('ui.applies_to_new')}</span></div></Panel><Panel section={t('ui.set_appearance')} state={THEME_LABELS[theme]} bind:open={open.appearance}><div class="opt"><!--
  role=group rather than radiogroup: .segmented marks its choice with
  aria-pressed, which is the vocabulary the print dialog already uses, and a
  radiogroup whose children are not radios reads worse than a labelled group of
  buttons.
--><div class="segmented" role="group" aria-label={t('ui.set_appearance')}>{#each THEMES as one (one)}<button type="button" aria-pressed={one === theme} onclick={() => pickTheme(one)}>{THEME_LABELS[one]}</button>{/each}</div><span class="small faint">{t('ui.theme_note')}</span></div></Panel><Panel section={t('ui.where_all')} state={dataHeadline} bind:open={open.data}><!--
  The panel itself comes from the package, so every Lautstark programme shows
  the same one. What stays here is what bildhaft alone offers besides the store:
  its standing snapshot and its file.
--><AblagePanel store={ablage} adopt={adoptFolder} changed={storeChanged} say={notify} lang={panelLang} /><hr class="hair" /><p class="sub">{t('ui.keep_out_in')}</p><!--
  .explainer and not .notice: components.css reserves .notice for the outcome of
  an action just taken, and this is standing prose about what a backup is. It
  looks exactly as it did under the old local .notice — same plate, same type —
  see app.css on the rename.
--><div class="explainer" style="margin-bottom:14px">{@html t('ui.backup_note')}</div><!--
  Only where there is no store folder. With one, the copies already go beside
  the work, and a second picker here would be the same offer under a name that
  reads almost the same. Absent in any browser without the picker, and then the
  download below is the whole offer, unchanged.

  The second half of that condition used to be here too — the vanilla factory
  answered `null` where `showDirectoryPicker` is absent, so the guard read
  `!isStore() && folder`. A component cannot answer null, so it asks the live
  status and draws nothing for `unsupported`, which is the same answer from one
  step further in. The store folder is the only question left for this file.
-->{#if !isStore()}<BackupPanel {backup} say={notify} lang={panelLang} />{/if}<!--
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
--><button class="btn sm" type="button" onclick={() => void exportAll()}>{t('ui.backup_download')}</button><label class="btn sm" style="cursor:pointer">{t('ui.backup_read')}<input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={() => { const file = importInput.files?.[0]; importInput.value = ''; if (file) { s.close(); void handleImport(file); } }} /></label></div><p class="small faint" style="margin:8px 0 0">{@html t('ui.backup_read_note')}</p></Panel><!--
  „Alles löschen" was an <h3> at the foot of „Daten" until 2026-08-29 — a second
  heading level doing a panel's job, and the one control in this dialog that
  destroys something filed under the word for making a backup. Its own panel,
  last in the column, so the list says what is here without anybody opening
  anything. vorlaut never mixed the two.

  `state=""` and not no state at all: this panel has nothing to say in its
  heading, and `''` is what draws the empty `<span class="state">` it has always
  drawn. Panel omits the span entirely for `undefined`, and below 560px the
  summary is a two-column grid where an empty span is a second row and two
  pixels — so the two are not the same panel. §6.2.
--><Panel section={t('ui.delete_all_heading')} state="" bind:open={open.danger}><p class="small faint" style="margin:0 0 10px">{t('ui.delete_all_note')}</p><button class="btn destructive sm" type="button" onclick={() => { s.close(); void confirmClearAll(); }}>{t('ui.delete_all_button')}</button></Panel>
