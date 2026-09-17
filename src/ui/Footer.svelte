<script lang="ts">
  /**
   * The foot of the page, and the dialog it opens.
   *
   * The `<footer>` and the credit line above the links are
   * `@lautstark/design/svelte/Footer`'s since design v1.34.0, and the three
   * legal pages are one `./svelte/Legal` over the shared sheet —
   * conventions.md §6.12. **The shell is shared and every word in it is
   * bildhaft's**: the links arrive as children, in this product's order and
   * this product's wording, because what a footer may claim is a §4.3 question
   * no shared component can answer on a product's behalf.
   */
  import Footer from '@lautstark/design/svelte/Footer';
  import Legal from '@lautstark/design/svelte/Legal';
  import { infoPages, type LegalKey } from './info.ts';
  import { CLOSE } from './dialog.ts';
  import { provider } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  /* Attribution is required by the ARASAAC licence — compact, but never hidden.
     It follows the source in force, so it is written rather than built in — and
     that is the open Sammlung's source rather than one setting for the whole
     program, which makes this line the page's plainest statement of which source
     drew what is on it. Hence `$derived` and not a value read once.

     Classed so a test can ask that question of it: `.footer__credit` has a rule
     in no stylesheet — components.css draws nothing for it, correctly, because
     one product of three has an attribution obligation — and is load-bearing
     twice over all the same. It is the locator collection-source.spec.ts uses
     for „which source drew this page", including a `toHaveCount(0)` under
     METACOM, which is what the `{#if}` inside the shared component makes true;
     and the footer it sits in is a visual baseline. Its four pixels of
     separation moved from an inline style into the component's own scoped
     block, which is the same four pixels arriving by §4.12's mechanism.

     `?? undefined` and nothing more: a provider with no obligation answers
     `null`, the prop is an optional string, and both mean "draw no line". */
  let attribution = $derived(provider().attribution ?? undefined);

  /* Which legal page is open, or null. `Legal` is mounted only while one is —
     bildhaft's sheets have always been built at the press and taken away on
     close, and six spec files count `dialog.sheet` or locate it as the only
     one on the page. §6.12's "every section is drawn and the ones not showing
     are `hidden`" is about the three sections inside the dialog, and that is
     exactly what is adopted here: one dialog, three `<section>`s, two of them
     hidden. What is not adopted is leaving the closed dialog in the document,
     which buys this product nothing — it addresses none of those sections —
     and would cost fifteen assertions in specs this round did not budget. */
  let page = $state<LegalKey | null>(null);
  const pages = infoPages();
</script>

<Footer credit={attribution}><p class="footer__links"><button class="linklike" type="button" onclick={() => { page = 'about'; }}>{t('ui.what_is')}</button><!--
  Both are legally required to be reachable and to be called exactly this.
  "Kontakt" or a line inside the About dialog would not count.
--><button class="linklike" type="button" onclick={() => { page = 'impressum'; }}>{t('ui.impressum')}</button><button class="linklike" type="button" onclick={() => { page = 'privacy'; }}>{t('ui.privacy')}</button><a href="https://github.com/Lautstark/bildhaft" target="_blank" rel="noreferrer noopener">{t('ui.source_code')}</a><a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a></p></Footer>{#if page}<Legal bind:page {pages} closeLabel={CLOSE}>{#snippet children(key)}{@html pages.find((one) => one.key === key)!.html}{/snippet}</Legal>{/if}
