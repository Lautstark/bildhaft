<script lang="ts">
  /**
   * Mobile-only header. Hidden on desktop, where the sidebar is always reachable
   * as a grid column. It is sticky and opaque so content scrolls underneath it
   * rather than showing through.
   */
  import Icon from '../pieces/Icon.svelte';
  import Logo from '../pieces/Logo.svelte';
  import { t } from '../i18n/index.ts';

  let { title, onToggleNav }: { title: string; onToggleNav: () => void } = $props();
</script>

<header class="topbar"><button class="btn quiet icon" type="button" aria-label={t('ui.open_menu')} onclick={onToggleNav}><Icon name="menuMobile" /></button><Logo size={20} /><span class="topbar__title">{title}</span></header>
