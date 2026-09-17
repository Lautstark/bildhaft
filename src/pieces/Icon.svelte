<script lang="ts">
  /** Stroked icons, all on the same 24-grid so they sit alike beside text.
   *
   *  One component with a name rather than one per glyph: they differ in a path
   *  and a size and in nothing else, and a file each would be six files that
   *  each say `stroke="currentColor"`. */
  type Name = 'menu' | 'menuMobile' | 'chevronLeft' | 'printer' | 'trash' | 'arrow' | 'dots';
  let { name }: { name: Name } = $props();

  const PATHS: Record<Exclude<Name, 'dots'>, { size: number; d: string }> = {
    menu: { size: 17, d: 'M4 7h16M4 12h16M4 17h16' },
    menuMobile: { size: 18, d: 'M4 7h16M4 12h16M4 17h16' },
    chevronLeft: { size: 16, d: 'M15 6l-6 6 6 6' },
    printer: { size: 15, d: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z' },
    trash: { size: 15, d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' },
    arrow: { size: 20, d: 'M5 12h13M12 5l7 7-7 7' },
  };
</script>

{#if name === 'dots'}<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>{:else if name === 'arrow'}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={PATHS.arrow.d} /></svg>{:else if name === 'menu' || name === 'menuMobile'}<svg width={PATHS[name].size} height={PATHS[name].size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d={PATHS[name].d} stroke-linecap="round" /></svg>{:else}<svg width={PATHS[name].size} height={PATHS[name].size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d={PATHS[name].d} stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}
