import { metacom } from '@lautstark/bildquelle';
import { announcer } from '@lautstark/design/toast';
import { t } from './i18n/index.ts';
import { isBlockedByOtherTab, onBlockedChange, takeMigrationNote } from './db/db.ts';
import {
  createCollection, listCollections, loadSettings, pullFromFolder,
} from './db/repo.ts';
import { ablage, adopted, moveWortschatz, restoreFolder, watchFolder } from './db/folder.ts';
import { el, fill, place, toggleClass } from './ui/dom.ts';
import { footer, sidebar, topBar } from './ui/chrome.ts';
import { composer } from './ui/composer.ts';
import { wortschatzView as makeWortschatz } from './ui/wortschatz.ts';
import { icons, logo } from './ui/logo.ts';
import { openAbout, openDatenschutz, openImpressum } from './ui/info.ts';
import { offerRescue } from './ui/rescue.ts';
import { resetSymbolResolution } from './ui/symbols.ts';

import { freshState, activeCollection, followsDefault, holdsWords, provider, providerId } from './app/state.ts';
import type { Ctx } from './app/context.ts';
import { standingBackup } from './app/backup.ts';
import { banners } from './app/banners.ts';
import { collectionHead } from './app/head.ts';
import { material } from './app/material.ts';
import { editing } from './app/editing.ts';
import { composing } from './app/composing.ts';
import { collections } from './app/collections.ts';
import { settings } from './app/settings.ts';
import { words } from './app/words.ts';
import { printing } from './app/print.ts';

/** Matches the `max-width: 820px` breakpoint used throughout the stylesheet. */
const MOBILE_QUERY = '(max-width: 820px)';

/**
 * The page, assembled.
 *
 * What is here is the shell and the one paint: the sidebar, the rail, the
 * top bar, the toast, `render()`, and boot. What each part of the page *does*
 * lives under `src/app/` — one module per concern, each a factory over the
 * shared `Ctx` in `app/context.ts`, which says how they reach each other.
 * This file used to hold all of it, at two thousand lines.
 */
export function mountApp(root: HTMLElement): void {
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const s = freshState(mobileQuery.matches);

  /* Built in stages; see the header of app/context.ts for why the cast is
     honest. Nothing below calls a member of `ctx` until an event arrives, and
     by then every member is there. */
  const ctx = { s } as Ctx;

  /* ------------------------------------------------------------ chrome --- */

  const loading = el('div', { class: 'loading-state' }, el('span', { class: 'spinner' }));

  const sidebarView = sidebar({
    onSelect: (id) => { s.wortschatz = null; ctx.setActive(id); s.query = ''; closeNavOnMobile(); render(); },
    onNew: () => { s.wortschatz = null; void ctx.handleNewCollection(); closeNavOnMobile(); },
    onWords: (tag) => {
      s.wortschatz = { tag };
      s.query = '';
      wortschatzView.open(tag);
      closeNavOnMobile();
      render();
    },
    onNewTag: () => { void wordsPart.handleNewTag(); closeNavOnMobile(); },
    onSearchChange: (value) => { s.query = value; ctx.scheduleSearch(); render(); },
    onOpenResult: (sentence) => {
      ctx.setActive(sentence.collectionId);
      s.query = '';
      closeNavOnMobile();
      render();
    },
    onOpenSettings: () => { ctx.openAppSettings(); closeNavOnMobile(); render(); },
    onCollapse: () => toggleSidebar(),
  });

  const scrim = el('button', {
    class: 'scrim',
    attrs: { type: 'button', 'aria-label': t('ui.close_menu') },
    on: { click: () => { s.mobileNavOpen = false; render(); } },
  });

  const rail = el('div', { class: 'rail' },
    el('button', {
      class: 'btn quiet icon',
      attrs: { type: 'button', title: t('ui.show_sidebar') },
      on: { click: () => toggleSidebar() },
    }, icons.menu()),
    logo(22),
  );

  const topBarView = topBar(() => toggleSidebar());

  /* The Wortschatz is the other half of the sidebar and the other half of the
     main area. It is handed the same things a Sammlung's parts are handed —
     the source in force, a way to write settings, a way to say something —
     and nothing about the shell it sits in. */
  const wortschatzView = makeWortschatz({
    provider: () => provider(s),
    providerId: () => providerId(s),
    pinned: () => s.settings?.pinnedTags ?? [],
    onPinned: (tags: string[]) => {
      if (s.settings) ctx.persistSettings({ ...s.settings, pinnedTags: tags });
    },
    onChanged: () => { void ctx.refreshCollections(); },
    onLens: (tag: string | null) => { s.wortschatz = { tag }; render(); },
    notify: (message: string) => notify(message),
  });

  const composerView = composer({
    onChange: (value) => { s.draft = value; composingPart.scheduleReuseLookup(); render(); },
    onSubmit: () => void composingPart.handleSubmit(),
    onReuse: () => void composingPart.handleReuse(),
  });

  const footerView = footer({
    onAbout: () => openAbout(() => undefined),
    onImpressum: () => openImpressum(() => undefined),
    onDatenschutz: () => openDatenschutz(() => undefined),
  });

  /* ------------------------------------------------------------- toast --- */

  /*
   * The toast is a live region, and the rule it lives under is
   * @lautstark/design/toast's: the node is mounted once, with the app, and
   * never taken out again - see render(), which is the only place root's
   * children are set. A reader announces a change in something it was already
   * watching, so a region that arrives already carrying its message announces
   * nothing at all.
   *
   * This product is why that module refuses a node it did not get handed. The
   * code here used to set the text, append the node, and remove it again 3.2
   * seconds later, and every acknowledgement the page made was silent: a saved
   * image, an exported Sammlung, a failed import, "Alle Daten gelöscht". The
   * words were on screen and correct the whole time, which is why nothing ever
   * looked wrong. mitreden had the same failure by a different route.
   *
   * What is bildhaft's rather than shared is what happens after: the line
   * empties, so the page goes quiet. Empty it paints nothing (`.toast:empty`
   * in app.css) and it is position:fixed besides, so it costs no room.
   *
   * conventions.md §3.8 is the rule and e2e/announce.spec.ts is this product's
   * copy of it; the module's own tests hold the half that is shared.
   */
  const toast = el('div', { class: 'toast', attrs: { role: 'status' } });
  const line = announcer(toast, {
    rest: 3200,
    onRest: (node) => { node.textContent = ''; },
  });

  // rests(), not say(): every message here fades, which is what makes the page
  // go quiet. vorlaut has both verbs on one line and mitreden uses neither.
  const notify = (message: string): void => { line.rests(message); };

  /* ------------------------------------------------------------- parts --- */

  const backup = standingBackup();

  ctx.render = render;
  ctx.paintSidebar = paintSidebar;
  ctx.notify = notify;
  ctx.closeNavOnMobile = closeNavOnMobile;

  const bannersPart = banners(ctx);
  const head = collectionHead(ctx);
  const materialPart = material(ctx);
  const composingPart = composing(ctx);
  const wordsPart = words(ctx);
  const collectionsPart = collections(ctx);
  ctx.views = { focusName: head.focusName, words: wortschatzView };
  Object.assign(ctx,
    editing(ctx),
    collectionsPart,
    settings(ctx, backup),
    printing(ctx),
    { writeBoard: materialPart.writeBoard, handleNewCard: materialPart.handleNewCard },
    { openWortschatzSheet: wordsPart.openWortschatzSheet },
  );

  const inner = el('div', { class: 'main__inner' },
    bannersPart.host, composerView.node, head.node, materialPart.rowsHost);

  const main = el('main', { class: 'main' }, topBarView.node, inner, footerView.node);
  const appRoot = el('div', { class: 'app', attrs: { id: 'app-root' } });

  // Printable DOM lives outside #app-root, which @media print hides.
  const printRoot = el('div', { attrs: { id: 'print-root' } });

  fill(root, loading, printRoot);

  /* ------------------------------------------------------------ render --- */

  let lastSentenceCount = -1;

  function paintSidebar(): void {
    sidebarView.render({
      collections: s.collections, counts: s.counts, activeId: s.activeId,
      searchQuery: s.query, searchResults: s.results,
      wordCount: s.wordCount, tags: s.tagRows,
      openTag: s.wortschatz ? s.wortschatz.tag : undefined,
    });
  }

  function render(): void {
    if (!s.settings) return;
    // The toast goes in here, with the app, and stays for the life of the page:
    // this is the only call that sets root's children, and it runs once. It is
    // a sibling of appRoot rather than a child because appRoot's own children
    // are replaced on every render (see place() in ui/dom.ts), and a live
    // region that is swapped out between messages is the bug notify() documents.
    if (!appRoot.isConnected) fill(root, appRoot, printRoot, toast);

    const sidebarOpen = s.isMobile ? s.mobileNavOpen : s.settings.sidebarOpen;
    toggleClass(appRoot, 'app--collapsed', !sidebarOpen);
    toggleClass(appRoot, 'app--nav-open', s.isMobile && s.mobileNavOpen);

    const children: HTMLElement[] = [sidebarView.node];
    if (s.isMobile && s.mobileNavOpen) children.push(scrim);
    if (!sidebarOpen) children.push(rail);
    children.push(main);
    place(appRoot, children);

    paintSidebar();

    /* The two nouns share `.main__inner` and never overlap: one of them has the
       composer, the head and the wall of things, and the other has its own
       three. Rebuilding the list rather than hiding it keeps the symbol
       subscriptions of whichever is off screen from being kept alive.

       The last child is whichever of the two the material would put there, and
       naming it here rather than letting that module swap it afterwards is
       the whole of it. Both used to manage this one slot with different ideas
       of what belongs in it: this asked for `rowsHost`, the rows replaced
       it with `emptyState` a few lines later, and so on the next render
       `place` found a fourth child it had not put there, concluded the list
       had changed and rebuilt all four. The head went out with them,
       and with it the focus of anything inside it - which is why the name
       field of a new Sammlung was focused and then silently was not. */
    const empty = s.sentences.length === 0;
    if (empty) materialPart.paintEmpty();
    place(inner, s.wortschatz
      ? [bannersPart.host, ...wortschatzView.parts]
      : [bannersPart.host, composerView.node, head.node,
         empty ? materialPart.emptyState : materialPart.rowsHost]);
    if (s.wortschatz) {
      topBarView.setTitle(s.wortschatz.tag ?? t('ui.all_words'));
      return;
    }

    const collection = activeCollection(s);
    topBarView.setTitle(collection?.name ?? 'bildhaft');
    head.render();

    composerView.render({
      value: s.draft, busy: s.busy, reuse: s.reuse,
      providerName: provider(s).name,
      providerReady: provider(s).isReady(),
      inCollection: Boolean(collection),
      providerOwned: !followsDefault(s),
      words: holdsWords(s),
    });

    footerView.setAttribution(provider(s).attribution);

    bannersPart.render();
    materialPart.render();

    if (s.sentences.length !== lastSentenceCount) {
      lastSentenceCount = s.sentences.length;
      void ctx.refreshCollections();
    }
  }

  /* -------------------------------------------------------------- boot --- */

  void (async () => {
    /* Before anything is read. Where a folder is the store it is the truth, and a
       first paint from the browser's copy would be a library that changes under
       somebody a moment later. */
    await restoreFolder().catch(() => null);
    /* Before the first read, because it changes where the Wortschatz is read
       from. A folder written by a version that kept it under `bildhaft/` hands
       its words over here, once. */
    await moveWortschatz().catch(() => 0);
    await pullFromFolder().catch(() => false);

    const loaded = await loadSettings();
    let all = await listCollections();

    if (all.length === 0) all = [await createCollection()];

    const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0];

    s.settings = loaded;
    // Before anything resolves a symbol: the preference orders search results,
    // so a slot filled in ahead of it would be filled from the wrong rendering.
    metacom.preferRendering(loaded.metacomRendering);
    s.collections = all;
    /* What the first paint draws with, recorded before setActive() can compare
       against it. Without this the initial guess is 'arasaac' and every load of
       a library whose source is METACOM would re-resolve and rewrite every
       sentence in the open collection — work that changes nothing. */
    s.previousProvider = wanted.provider ?? loaded.activeProvider;
    ctx.setActive(wanted.id);
    render();

    // Only judge the symbol source once it has had its chance to come back.
    metacom.restore().catch(() => undefined).finally(() => { s.sourceSettled = true; render(); });

    /* Where the work already lives in a folder, the dated copies go beside it.
       The store fills `<folder>/bildhaft/` and these are flat files above it, so
       the two never meet — and nobody is asked to pick a second folder that reads
       almost exactly like the first.

       Otherwise as before: never prompts, because there is no gesture here. A
       folder that needs its permission re-confirmed lands in needs-permission and
       says so in the panel, which is where the click can happen. */
    const alreadyHeld = ablage.handle();
    if (alreadyHeld) void backup.useFolder(alreadyHeld).catch(() => undefined);
    else backup.restore().catch(() => undefined);

    /* Somebody else's edit, arriving as a file that changed under this browser.
       Only once the folder is the store: a folder mid-adoption changes
       constantly, and all of those changes are ours. */
    void adopted().then((yes: boolean) => {
      if (yes) watchFolder(() => void pullFromFolder().then(() => {
        void ctx.refreshCollections();
        if (s.activeId) ctx.setActive(s.activeId);
      }));
    });

    /*
     * What the upgrade did, if it did anything. adr/0001: an upgrade that
     * reorganised somebody's storage without saying so is indistinguishable,
     * from where they are standing, from one that lost something.
     *
     * Said here rather than from inside db.ts, and after the first render, for
     * two reasons: notify() writes into a toast that render() is what mounts,
     * and the count of Sammlungen is the one number a person can check the
     * claim against — so it is worth saying once the library it counts is on
     * screen behind it.
     */
    const carried = takeMigrationNote();
    if (carried) {
      notify(carried.collections === 1
        ? t('ui.db_carried_one', { from: carried.from, to: carried.to })
        : t('ui.db_carried', { from: carried.from, to: carried.to, n: carried.collections }));
    }

    // Last, and after the first render: this may add a Sammlung and open it,
    // and notify() writes into a toast that render() is what mounts.
    await collectionsPart.openNamed();
  })().catch((error: unknown) => {
    /*
     * Boot had no catch at all until adr/0001, and the failure it was missing
     * is the one that ADR is about: a database this build cannot read left
     * every await here hanging, and the page sat on its spinner with no
     * message. Two answers, and which one it is matters — a refusal means the
     * records are all still there and the person is owed them as a file, which
     * is what the sheet does. Everything else is an ordinary failure to open a
     * database, and it gets a sentence rather than silence.
     */
    if (offerRescue(error, { report: sayInsteadOfLoading, again: () => location.reload() })) return;
    sayInsteadOfLoading(t('ui.db_failed', {
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  /** In place of the spinner, which is all there is on screen this early.
   *
   * After the first render the spinner is gone and the toast is up, so the
   * message goes there instead — the same sentence either way, in whichever of
   * the two is actually on the page. */
  function sayInsteadOfLoading(message: string): void {
    if (loading.isConnected) {
      loading.replaceChildren(el('p', { class: 'banner', attrs: { role: 'alert' }, text: message }));
    } else {
      notify(message);
    }
  }

  /*
   * Whenever METACOM becomes usable again — a folder picked, a zip read,
   * permission re-granted — every symbol has to be told to try again. Nothing
   * about a slot changes when access returns, so without this the ones that had
   * already given up stay blank and the recovery looks like it did nothing.
   */
  let wasReady = metacom.isReady();
  metacom.subscribe(() => {
    const nowReady = metacom.isReady();
    if (nowReady && !wasReady) {
      resetSymbolResolution('metacom');
      // Forget the old failures too, or the warning outlives the problem.
      s.unreadable = 0;
    }
    wasReady = nowReady;
    render();
  });

  onBlockedChange(() => { s.dbBlocked = isBlockedByOtherTab(); render(); });

  mobileQuery.addEventListener('change', () => { s.isMobile = mobileQuery.matches; render(); });

  /* --------------------------------------------------------------- nav --- */

  /** On mobile the panel overlays the content, so acting on it should dismiss it. */
  function closeNavOnMobile(): void {
    if (s.isMobile) s.mobileNavOpen = false;
  }

  function toggleSidebar(): void {
    if (!s.settings) return;
    if (s.isMobile) s.mobileNavOpen = !s.mobileNavOpen;
    else ctx.persistSettings({ ...s.settings, sidebarOpen: !s.settings.sidebarOpen });
    render();
  }
}
