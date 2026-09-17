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
  import TopBar from './ui/TopBar.svelte';
  import Footer from './ui/Footer.svelte';
  import Composer from './ui/Composer.svelte';
  import Wortschatz from './ui/Wortschatz.svelte';
  import Banners from './app/Banners.svelte';
  import CollectionHead from './app/CollectionHead.svelte';
  import Material from './app/Material.svelte';
  import { boot } from './app/boot.ts';
  import { notify, useToast } from './app/notify.ts';
  import { persistSettings } from './app/settings.ts';
  import { activeCollection, MOBILE_QUERY, s } from './app/state.svelte.ts';
  import { t } from './i18n/index.ts';

  let toast: HTMLElement;
  let loading: HTMLElement | undefined = $state();
  /** What is said in place of the spinner, while the spinner is all there is. */
  let instead = $state('');

  /* Until the settings are read there is nothing to draw and nothing to draw it
     from: every part of the page below asks the store what is in it. */
  let ready = $derived(s.settings !== null);

  let sidebarOpen = $derived(s.isMobile ? s.mobileNavOpen : (s.settings?.sidebarOpen ?? true));

  let title = $derived(s.wortschatz
    ? s.wortschatz.tag ?? t('ui.all_words')
    : activeCollection()?.name ?? 'bildhaft');

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
</script>

{#if !ready}<div class="loading-state" bind:this={loading}>{#if instead}<p class="banner" role="alert">{instead}</p>{:else}<span class="spinner"></span>{/if}</div>{:else}<div class="app" id="app-root" class:app--collapsed={!sidebarOpen} class:app--nav-open={s.isMobile && s.mobileNavOpen}><Sidebar onNavigated={closeNavOnMobile} onCollapse={toggleSidebar} />{#if s.isMobile && s.mobileNavOpen}<button class="scrim" type="button" aria-label={t('ui.close_menu')} onclick={() => { s.mobileNavOpen = false; }}></button>{/if}{#if !sidebarOpen}<div class="rail"><button class="btn quiet icon" type="button" title={t('ui.show_sidebar')} onclick={toggleSidebar}><Icon name="menu" /></button><Logo size={22} /></div>{/if}<main class="main"><TopBar {title} onToggleNav={toggleSidebar} /><!--
  The two nouns share `.main__inner` and never overlap: one of them has the
  composer, the head and the wall of things, and the other has its own three.
  Drawn as one block each rather than hidden, which is what keeps the symbol
  subscriptions of whichever is off screen from being kept alive — a block that
  is not entered has no components in it to hold one.
--><div class="main__inner"><Banners />{#if s.wortschatz}<Wortschatz />{:else}<Composer /><CollectionHead /><Material />{/if}</div><Footer /></main></div>{/if}<!--
  The toast goes in with the app and stays for the life of the page. It is a
  sibling of #app-root rather than a child because @media print hides that
  element, and a live region that is swapped out between messages is the bug
  app/notify.ts documents.
--><div class="toast" role="status" bind:this={toast}></div>
