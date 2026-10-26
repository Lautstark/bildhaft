<script lang="ts">
  /**
   * The page, assembled.
   *
   * What is here is the shell: the sidebar, the rail, the top bar, the toast,
   * and boot. What each part of the page *does* lives under `src/app/` — one
   * module per concern, reading and writing the one store in
   * `app/state.svelte.ts`. This file used to hold all of it, at two thousand
   * lines, and then held the one `render()` everything called; there is no
   * render to call now.
   */
  import Icon from './pieces/Icon.svelte';
  import Logo from './pieces/Logo.svelte';
  import Sidebar from './ui/Sidebar.svelte';
  import Scrim from '@lautstark/design/svelte/Scrim';
  import Reveal from '@lautstark/design/svelte/Reveal';
  import TopBar from '@lautstark/design/svelte/TopBar';
  import Footer from './ui/Footer.svelte';
  import GroupPrint from './ui/GroupPrint.svelte';
  import Composer from './ui/Composer.svelte';
  import PrintView from './ui/PrintView.svelte';
  import TitleLine from './ui/TitleLine.svelte';
  import SongIntake from './ui/SongIntake.svelte';
  import Wortschatz from './ui/Wortschatz.svelte';
  import Banners from './app/Banners.svelte';
  import CollectionHead from './app/CollectionHead.svelte';
  import Material from './app/Material.svelte';
  import { boot } from './app/boot.ts';
  import { notify, useToast } from './app/notify.ts';
  import { persistSettings } from './app/settings.ts';
  import { activeCollection, kind, MOBILE_QUERY, s } from './app/state.svelte.ts';
  import { contentOf, type CollectionKind } from './core/types.ts';
  import { t } from './i18n/index.ts';

  let toast: HTMLElement;
  let loading: HTMLElement | undefined = $state();
  /** What is said in place of the spinner, while the spinner is all there is. */
  let instead = $state('');

  /* Until the settings are read there is nothing to draw and nothing to draw it
     from: every part of the page below asks the store what is in it. */
  let ready = $derived(s.settings !== null);

  /*
   * Which of the two is on screen — the column above 820px, the drawer below it.
   *
   * §6.3 offers `Sidebar`'s `showing` as a bindable for exactly this, so that
   * `Reveal` and `TopBar`, which are mounted beside it and cannot see the live
   * breakpoint, get the same answer. It is deliberately not bound here, and the
   * reason is the one the comment below this already gives about `isMobile`:
   * `showing` is written from an effect, so it is `false` for the first render
   * of the page whatever the truth is. Bound, every load drew the collapsed
   * arrangement and then transitioned the column open over 220ms — measured, and
   * visible. What the products cannot disagree about is the breakpoint itself,
   * because `MOBILE_QUERY` *is* the component's `NARROW` rather than a second
   * copy of the same string.
   */
  let sidebarOpen = $derived(s.isMobile ? s.mobileNavOpen : (s.settings?.sidebarOpen ?? true));
  /** The remembered collapse. An absent preference means open, and since
   *  `defaultSettings()` was corrected the stored default says the same. §1.3. */
  let collapsed = $derived(!(s.settings?.sidebarOpen ?? true));

  let title = $derived(s.wortschatz
    ? s.wortschatz.tag ?? t('ui.all_words')
    : activeCollection()?.name ?? 'bildhaft');

  /* The templates whose box stands under their head, in „Bearbeiten" only,
     with their title under it — a Tafel's under its columns and rows, which
     are about the grid the title heads (Tafel.svelte). On a Tafel what is
     typed there waits in its tray. One template at a time (2026-10-22). */
  const BOX_UNDER_HEAD: CollectionKind[] = ['satzstreifen', 'wortkarten', 'einkaufsliste', 'tafel'];

  /** The sheet beside the material, once there is something to print. */
  let hasSheet = $derived(contentOf(s.sentences).length > 0);

  $effect(() => useToast(toast));

  /* Read here rather than where the store is made, and read before the first
     paint rather than in an effect after it: the sidebar is a different thing on
     a phone, and a page that drew the desktop one first would flash it. */
  const mobile = window.matchMedia(MOBILE_QUERY);
  s.isMobile = mobile.matches;

  $effect(() => {
    const moved = () => { s.isMobile = mobile.matches; };
    mobile.addEventListener('change', moved);
    return () => mobile.removeEventListener('change', moved);
  });

  /** In place of the spinner, which is all there is on screen this early.
   *
   * After the first paint the spinner is gone and the toast is up, so the
   * message goes there instead — the same sentence either way, in whichever of
   * the two is actually on the page. */
  function sayInsteadOfLoading(message: string): void {
    if (loading) instead = message;
    else notify(message);
  }

  boot(sayInsteadOfLoading);

  /** On mobile the panel overlays the content, so acting on it should dismiss it. */
  function closeNavOnMobile(): void {
    if (s.isMobile) s.mobileNavOpen = false;
  }

  function toggleSidebar(): void {
    if (!s.settings) return;
    if (s.isMobile) s.mobileNavOpen = !s.mobileNavOpen;
    else persistSettings({ ...s.settings, sidebarOpen: !s.settings.sidebarOpen });
  }

  /*
   * Folded or open, kept in this browser: the sheet beside the material is a
   * fact about this screen, not about any Sammlung. Folded it stays alive as
   * a thumbnail of itself — the same preview, just narrow.
   */
  const DOCK_MODE = 'bildhaft.preview';
  let mini = $state(false);
  try { mini = localStorage.getItem(DOCK_MODE) === 'mini'; } catch { /* a private window keeps nothing */ }
  function fold(next: boolean): void {
    mini = next;
    try { localStorage.setItem(DOCK_MODE, next ? 'mini' : 'open'); } catch { /* a private window keeps nothing */ }
  }

  /*
   * The large preview: the narrow panel pressed anywhere on its pages lays
   * the sheet out big, over everything, until Esc, its × or the dimmed edge.
   * A zoom, not a place to be — so it is not kept, and a switch of material
   * closes it.
   */
  let big = $state(false);
  $effect(() => { void s.activeId; big = false; });
  $effect(() => {
    if (!big) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') big = false; };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
</script>



{#if !ready}<div class="loading-state" bind:this={loading}>{#if instead}<p class="banner" role="alert">{instead}</p>{:else}<span class="spinner"></span>{/if}</div>{:else}<div class="app" id="app-root" class:app--collapsed={!sidebarOpen} class:app--nav-open={s.isMobile && s.mobileNavOpen}><Sidebar onNavigated={closeNavOnMobile} onCollapse={toggleSidebar} drawer={s.mobileNavOpen} {collapsed} ondismiss={() => { s.mobileNavOpen = false; }} /><!--
  The page behind the drawer, and the way out of it. Always in the markup now
  and hidden by the component, which is what lets it keep `[hidden]` ahead of
  any `display` a stylesheet has — so app.css drops the `display: none` base it
  used to switch on, and `shown` is the only answer to whether it is up.
--><Scrim label={t('ui.close_menu')} shown={s.isMobile && s.mobileNavOpen} ondismiss={() => { s.mobileNavOpen = false; }} /><!--
  What brings the column back. `.rail` was bildhaft's name for it and is the
  *reveal*, not the column — a flex container holding the ☰ and a small mark —
  so the component is the container and the pair inside it is still this page's,
  handed the wiring for its own button.
--><Reveal controls="sidebar" shown={!sidebarOpen}>{#snippet brand(wired)}<button class="btn quiet icon" type="button" {...wired} title={t('ui.show_sidebar')} onclick={toggleSidebar}><Icon name="menu" /></button><Logo size={22} />{/snippet}</Reveal><main class="main"><TopBar controls="sidebar" expanded={sidebarOpen} label={t('ui.open_menu')} onreveal={toggleSidebar}>{#snippet icon()}<Icon name="menuMobile" />{/snippet}{#snippet brand()}<Logo size={20} /><span class="topbar__title">{title}</span>{/snippet}</TopBar><!--
  The two nouns share `.main__inner` and never overlap: one of them has the
  composer, the head and the wall of things, and the other has its own three.
  Drawn as one block each rather than hidden, which is what keeps the symbol
  subscriptions of whichever is off screen from being kept alive — a block that
  is not entered has no components in it to hold one.
--><div class="main__inner{s.wortschatz ? '' : ' main__inner--work'}{hasSheet ? ' main__inner--printing' : ''}"><Banners />{#if s.wortschatz}<Wortschatz />{:else}<!--
  Two views of the open Sammlung, switched in its head. The box to type into
  and the head stay where they are in both; only what is under them changes:
  the material („Bearbeiten"), or the sheet with its pages and its settings
  („Drucken"). The page keeps one width in both, so nothing above moves.
  While a new Material still waits for its template there is neither: the
  choice is the whole page, and a name with „0 Zeilen" above it would only be
  something to read before it.

  A Satzstreifen, Wortkarten and an Einkaufsliste have their head first and the box under it,
  in „Bearbeiten" only, then the title as the heading of what follows, as on
  the paper: the box is part of what the switch swaps, so „Drucken" has none and
  the head still stands where it stood. Under the head because that is where
  the next strip appears — the rows are newest first. The other templates
  follow one by one (2026-10-22).
-->{#if s.choosing === s.activeId}{:else if BOX_UNDER_HEAD.includes(kind())}<Composer /><CollectionHead />{:else if kind() === 'lied'}{#if !hasSheet}<SongIntake />{/if}<CollectionHead /><TitleLine />{:else if kind() === 'rezept'}<CollectionHead />{:else if kind() === 'plauderbuch'}<CollectionHead />{:else if kind() === 'spiel'}<CollectionHead />{:else}<Composer /><CollectionHead />{/if}{#if s.choosing === s.activeId}<Material />{:else}<!--
  Head and box keep the page's whole width; what is split is the work under
  them. Left the material with its Zeile, right the sheet as it prints —
  there by default, scrolled like a stack of paper, folded to a thumbnail of
  itself when the work needs the room. Its left edge drags it wider.
--><div class="work-split"><div class="work-main">{#if (BOX_UNDER_HEAD.includes(kind()) && kind() !== 'tafel') || kind() === 'plauderbuch' || kind() === 'spiel'}<TitleLine />{/if}<Material /></div>{#if hasSheet}<!--
  svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions
  (der Klick auf den abgedunkelten Rand ist ein zweiter Weg hinaus; Esc und das ✕ sind die ersten)
--><aside class="print-dock{mini ? ' print-dock--mini' : ''}{big ? ' print-dock--big' : ''}" aria-label={t('ui.view_print')} onclick={(event) => { if (big && event.target === event.currentTarget) big = false; }}>{#if mini}<button class="print-dock__unfold" type="button" aria-label={t('ui.preview_unfold')} title={t('ui.preview_unfold')} onclick={() => fold(false)}>«</button>{/if}<PrintView mini={mini && !big} {big} onFold={() => fold(true)} onZoom={() => { big = true; }} onClose={() => { big = false; }} />{#if mini && !big}<button class="print-dock__peek" type="button" aria-label={t('ui.preview_unfold')} onclick={() => fold(false)}></button>{/if}</aside>{/if}</div>{/if}{/if}</div><Footer /></main>{#if s.groupPrint}<GroupPrint which={s.groupPrint} onClose={() => { s.groupPrint = null; }} />{/if}</div>{/if}<!--
  The toast goes in with the app and stays for the life of the page. It is a
  sibling of #app-root rather than a child because @media print hides that
  element, and a live region that is swapped out between messages is the bug
  app/notify.ts documents.
--><div class="toast" role="status" bind:this={toast}></div>
