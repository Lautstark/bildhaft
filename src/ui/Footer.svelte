<script lang="ts">
  import { openAbout, openDatenschutz, openImpressum } from './info.ts';
  import { provider } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  /* Attribution is required by the ARASAAC licence — compact, but never hidden.
     It follows the source in force, so it is written rather than built in — and
     that is now the open Sammlung's source rather than one setting for the whole
     program, which makes this line the page's plainest statement of which source
     drew what is on it. Classed so a test can ask that question of it. */
  let attribution = $derived(provider().attribution);
</script>

<footer class="footer">{#if attribution}<p class="footer__credit" style="margin: 0 0 4px">{attribution}</p>{/if}<p class="footer__links"><button class="linklike" type="button" onclick={() => openAbout()}>{t('ui.what_is')}</button><!--
  Both are legally required to be reachable and to be called exactly this.
  "Kontakt" or a line inside the About dialog would not count.
--><button class="linklike" type="button" onclick={() => openImpressum()}>{t('ui.impressum')}</button><button class="linklike" type="button" onclick={() => openDatenschutz()}>{t('ui.privacy')}</button><a href="https://github.com/Lautstark/bildhaft" target="_blank" rel="noreferrer noopener">{t('ui.source_code')}</a><a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a></p></footer>
