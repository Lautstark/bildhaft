<script lang="ts">
  import type { ProviderId } from '../core/types.ts';
  import { arasaac, metacom } from '@lautstark/bildquelle';
  import { GERMAN_STOPWORDS } from '@lautstark/bildquelle/german';
  import { ENGLISH_STOPWORDS } from '@lautstark/bildquelle/english';
  import { WORDS as SYMBOLE, type SymbolSource } from '@lautstark/bildquelle/symbole-panel';
  import SymbolePanel from '@lautstark/bildquelle/svelte/SymbolePanel';
  import DatenPanel from '@lautstark/sicherung/svelte/DatenPanel';
  import { readTheme, type Theme } from '@lautstark/design/theme';
  import { languagePicker, NAMES } from '@lautstark/design/language';
  import Vanilla from '@lautstark/design/svelte/Vanilla';
  import Panel from '@lautstark/design/svelte/Panel';
  import VoicePicker from '@lautstark/stimmquelle/svelte/VoicePicker';
  import AzureConnection, { type AzureConnectionWords } from '@lautstark/stimmquelle/svelte/AzureConnection';
  import { defaultVoice, forgetAzure, hear, keepAzure, knownVoices, loadVoices, pickDefaultVoice, probeAzure, voiceLabel } from './voices.svelte.ts';
  import ThemePicker from '@lautstark/design/svelte/ThemePicker';
  import { resetSymbolResolution } from './symbols.ts';
  import { ablage } from '../db/folder.ts';
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

  /*
   * Five panels, where there were eight: „Sprache & Aussehen", „Symbole",
   * „Stimme", „Wörter ohne Bild" and „Deine Daten". The rule each one follows
   * is „Deine Daten"'s — one box that says how things stand, at most one
   * button where something is to be done, and the rest in a `⋯` — so a person
   * who has never heard „Standardquelle" or „Azure Speech" can still answer
   * every question here.
   *
   * Three of the five are the packages' own Svelte components: `SymbolePanel`
   * (bildquelle), `AzureConnection` (stimmquelle) and `DatenPanel`
   * (sicherung). Each imports its package's published entries, and there is no
   * cast below; if one is ever needed again, the fix in bildquelle 2.3.2 and
   * sicherung 1.17.1 has come undone.
   */

  /* The page's language, once. A value and not a thunk: `chooseLanguage()`
     reloads the document, so a locale read here cannot go stale. */
  const panelLang = LANG === 'en' ? 'en' : 'de';

  /* The standing backup: app/backup.ts schedules it on every write, whether or
     not the work lives in a folder. „Deine Daten" shows it, and offers to point
     it somewhere, only while the work is in the browser — with a folder as the
     store the folder is the copy. Its heading words come from the panel. */
  const backup = standing();
  let dataHeadline = $state('');

  /* Everything on screen is about to be wrong. */
  function storeChanged(): void {
    void refreshCollections();
    if (store.activeId) setActive(store.activeId);
  }

  /* ---------------------------------------------------- Sprache & Aussehen --- */

  /*
   * Two rows in one panel, because both are about how the page looks to the
   * person in front of it and both live in this browser only.
   *
   * The language is the one choice here that reloads: the labels are read out
   * of the table when each element is built, and there is no re-render path —
   * i18n/index.ts says what it would take. The languages name themselves, so
   * somebody who has landed in the one they cannot read can still find their
   * way out, which is why this panel is first and the one that opens on
   * arrival.
   *
   * The scheme lives in localStorage rather than in AppSettings: AppSettings
   * is in IndexedDB, which cannot be read before the first paint, so a scheme
   * stored there would arrive as a flash of the wrong one.
   * @lautstark/design/theme owns that reasoning.
   */
  const picker = languagePicker({
    languages: LANGUAGES,
    current: () => LANG,
    /* The module only ever calls back with a code out of `languages`, and
       `languages` is LANGUAGES itself. The cast asserts that and no more. */
    choose: (code: string) => chooseLanguage(code as LanguageCode),
    label: t('ui.set_language'),
  });

  const THEME_KEY = 'bildhaft.theme';
  const THEME_LABELS: Record<Theme, string> = {
    system: t('ui.theme_system'),
    light: t('ui.theme_light'),
    dark: t('ui.theme_dark'),
  };
  let theme = $state<Theme>(readTheme(THEME_KEY));

  /* ------------------------------------------------------------ Symbole --- */

  /*
   * ARASAAC or METACOM, as one question. The panel draws the answers; this file
   * keeps which one is in force, as `settings.activeProvider`, and says what
   * moving it did to the page.
   *
   * „Which one is in force" is the default for every Sammlung that has not
   * chosen a source of its own. A Sammlung that has, keeps it, and the
   * sentence below says so; the ⋯ beside its name is where it changes.
   */
  let symbolsHeadline = $state('');

  /*
   * What moving the default did here, waiting to be said.
   *
   * The panel calls `pick` alone when somebody taps a card, and `pick` followed
   * by `say` when a folder has just been read in. The second should be one
   * sentence, not two toasts, so the line waits one task for a `say` to take
   * it along; a pick nobody follows says it alone.
   */
  let moved = '';
  let movedTimer: ReturnType<typeof setTimeout> | undefined;

  function movedTo(name: string): string {
    return activeCollection()?.provider
      ? t('ui.default_moved_kept', { name })
      : t('ui.default_moved_redrawn', { name });
  }

  function pickSource(source: SymbolSource): void {
    const was: ProviderId = settings.activeProvider;
    if (source !== was) change({ ...settings, activeProvider: source });
    resetSymbolResolution('metacom');
    void syncProvider();
    /* Forgetting the folder moves the default back to ARASAAC, and the
       panel's own sentence already says so. */
    if (source === was || (source === 'arasaac' && !metacom.isReady())) return;
    moved = movedTo(source === 'metacom' ? 'METACOM' : 'ARASAAC');
    clearTimeout(movedTimer);
    movedTimer = setTimeout(() => { if (moved) notify(moved); moved = ''; });
  }

  /**
   * The panel's sentence, and what it means here added to it.
   *
   * Forgetting the folder deliberately reaches into no Sammlung that chose
   * METACOM for itself — that is somebody's answer, and the folder may well
   * come back. What it must not do is leave the open one looking broken with
   * no word, so where it is in that position the sentence says so; the banner
   * above the composer says the same on the page itself.
   */
  function symbolsSaid(line: string): void {
    clearTimeout(movedTimer);
    const extra = line === SYMBOLE[panelLang].forgotten
      ? (activeCollection()?.provider === 'metacom' ? t('ui.metacom_gone_collection') : '')
      : moved;
    moved = '';
    notify(extra ? `${line} ${extra}` : line);
  }

  function prefer(name: string | null): void {
    change({ ...settings, metacomRendering: name });
    notify(name ? t('ui.rendering_preferred', { name }) : t('ui.rendering_cleared'));
  }

  /* ------------------------------------------------------------- Stimme --- */

  /*
   * The voices, and under them Azure as a connection that is there or not.
   * Once it is, its voices join the same list; there is nothing else to find.
   * The same two pieces as in mitreden (stimmquelle), with mitreden's words.
   */
  $effect(() => { if (open.voice) void loadVoices(); });
  /* Her region (2026-10-27): the Speech resource lives in Frankfurt. stimmquelle's own default is still westeurope. */
  const AZURE_REGION = 'germanywestcentral';

  /* Where a region is, in the words of somebody who has never opened the Azure
     portal. Only the ones in Europe; anything else reads as Azure's code. */
  const REGION_NAMES: Record<string, string> = {
    germanywestcentral: 'Frankfurt',
    westeurope: t('ui.region_westeurope'),
    northeurope: 'Irland',
    switzerlandnorth: 'Zürich',
    francecentral: 'Paris',
    uksouth: 'London',
    swedencentral: t('ui.region_sweden'),
    norwayeast: 'Oslo',
  };
  if (LANG === 'en') REGION_NAMES.northeurope = 'Ireland';

  const azureWords: AzureConnectionWords = {
    key: t('ui.key_field'), region: t('ui.region_field'), regionHint: t('ui.region_hint'),
    save: t('ui.key_save'), saving: t('ui.key_checking'),
    forget: t('ui.key_forget'), cancel: t('ui.cancel'), asking: t('ui.azure_asking'), typeFirst: t('ui.type_first'),
    answers: (n) => t(n === 1 ? 'ui.azure_answers_one' : 'ui.azure_answers', { n }),
    saved: (n) => t('ui.key_saved', { n }), unreachable: t('ui.azure_unreachable'), refused: t('ui.azure_refused'),
    refusedOnSave: t('ui.azure_bad_pair'), failed: (words) => t('ui.azure_no_answer', { error: words }),
    title: t('ui.azure_title'),
    off: t('ui.azure_off'), on: t('ui.azure_on'), refusedState: t('ui.azure_refused_state'),
    offNote: t('ui.azure_off_note'),
    onNote: (hint, region) => t('ui.azure_on_note', { hint, region }),
    refusedNote: t('ui.azure_refused_note'),
    connect: t('ui.azure_connect'), change: t('ui.azure_change'), check: t('ui.azure_check'),
  };

  /* ---------------------------------------------------- Wörter ohne Bild --- */

  /*
   * The box is never repainted from outside, so that nothing — a METACOM
   * progress tick least of all — can empty it mid-sentence. This is the one
   * place the agreement allows a save button: half a word list would do
   * something wrong.
   */
  const ORIGINAL: Record<LanguageCode, readonly string[]> = { de: GERMAN_STOPWORDS, en: ENGLISH_STOPWORDS };
  let area: HTMLTextAreaElement;
  let wordCount = $state(0);
  $effect(() => {
    area.value = settings.stopwords[LANG].join('\n');
    wordCount = settings.stopwords[LANG].length;
  });

  /* „Ursprüngliche Liste" only once the list has moved away from it. */
  const sorted = (words: readonly string[]) => [...words].sort((a, b) => a.localeCompare(b, LANG)).join('\n');
  let isOriginal = $derived(sorted(settings.stopwords[LANG]) === sorted(ORIGINAL[LANG]));

  function keepWords(words: string[]): void {
    area.value = words.join('\n');
    wordCount = words.length;
    change({ ...settings, stopwords: { ...settings.stopwords, [LANG]: words } });
  }

  function saveWords(): void {
    keepWords([...new Set(area.value.split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, LANG)));
  }

  function restoreWords(): void {
    keepWords([...ORIGINAL[LANG]].sort((a, b) => a.localeCompare(b, LANG)));
    notify(t('ui.words_restored'));
  }

  /* --------------------------------------------------------------- Daten --- */

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
   */
  let open = $state({
    look: true,
    symbols: false,
    voice: false,
    words: false,
    data: false,
  });
</script>

<!--
  Sprache & Aussehen first, and the one panel that opens on arrival: somebody
  who cannot read this page needs it before any of the others, and „Deutsch"
  and „English" are the same words whichever language the rest is in.
  conventions.md §3.11; vorlaut said it first.

  The panels are one exclusive group — `name="settings"` on each `<details>`,
  which is Panel's default. @lautstark/design conventions.md §3.5.
--><Panel section={t('ui.set_look')} state={`${NAMES[LANG] ?? LANG} · ${THEME_LABELS[theme]}`} bind:open={open.look}><div class="opt"><span class="opt__label">{t('ui.set_language')}</span><Vanilla node={picker.node} /></div><div class="opt"><span class="opt__label">{t('ui.set_appearance')}</span><ThemePicker key={THEME_KEY} label={(one) => THEME_LABELS[one]} ariaLabel={t('ui.set_appearance')} bind:theme /></div><p class="small faint" style="margin:0">{t('ui.look_note')}</p></Panel><Panel section={t('ui.set_symbols')} state={symbolsHeadline} bind:open={open.symbols}><SymbolePanel {metacom} current={settings.activeProvider === 'metacom' ? 'metacom' : 'arasaac'} pick={pickSource} say={symbolsSaid}
  attribution={arasaac.attribution ?? null} rendering={{ current: settings.metacomRendering, choose: prefer }}
  headline={(text) => { symbolsHeadline = text; }} lang={panelLang} /></Panel><Panel section={t('ui.set_voice')} state={knownVoices().length ? voiceLabel(defaultVoice()) : ''} bind:open={open.voice}><div id="voices"><VoicePicker voices={knownVoices} current={defaultVoice} pick={pickDefaultVoice} hear={(voice) => hear(t('ui.voice_sample'), voice.id)} lang={panelLang} /></div><div style="margin-top:14px"><AzureConnection id="azure" formId="cloud" fieldId="azurekey" regionId="azureregion"
  hasKey={settings.azure !== undefined} hint={settings.azure?.key.slice(-4) ?? ''} region={settings.azure?.region ?? AZURE_REGION}
  regionName={(code) => REGION_NAMES[code] ?? code} stored={() => settings.azure?.key}
  probe={(access) => probeAzure({ key: access.key ?? settings.azure?.key ?? '', region: access.region })}
  save={async (next) => { await keepAzure(next); void loadVoices(true); }} forget={forgetAzure} words={azureWords}><p class="small faint" style="margin-top:0">{t('ui.azure_body')}</p></AzureConnection></div><p class="small faint" style="margin:14px 0 0">{t('ui.voice_note')}</p></Panel><Panel section={t('ui.set_function_words')} state={t('ui.n_words', { n: wordCount })} bind:open={open.words}><p class="small muted" style="margin-top:0">{t('ui.function_words_note')}</p><textarea bind:this={area} class="field stopword-area" spellcheck="false" aria-label={t('ui.set_function_words')}></textarea><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button class="btn primary sm" type="button" onclick={saveWords}>{t('ui.save')}</button>{#if !isOriginal}<button class="btn sm" type="button" onclick={restoreWords}>{t('ui.words_original')}</button>{/if}<span class="small faint" style="align-self:center">{t('ui.applies_to_new')}</span></div></Panel><Panel section={t('ui.where_all')} state={dataHeadline} bind:open={open.data}><!--
  „Deine Daten" is @lautstark/sicherung's, the same panel in every Lautstark
  programme: where the work is and whether that is safe, at most one button,
  and everything else in its ⋯ — another folder, the file out and in, the dated
  second copy while the work is in the browser, and deleting everything. That
  last one was a panel of its own until 2026-10-31; it sits in the menu now,
  red and last, and still asks before it does anything.
--><DatenPanel store={ablage} adopt={adoptFolder} changed={storeChanged} say={notify} lang={panelLang}
  {backup} headline={(text) => { dataHeadline = text; }}
  file={{ download: () => void exportAll(), read: (file) => { s.close(); void handleImport(file); }, note: t('ui.backup_file_note') }}
  wipe={() => { s.close(); void confirmClearAll(); }} /></Panel>
