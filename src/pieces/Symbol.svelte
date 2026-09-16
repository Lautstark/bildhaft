<script lang="ts">
  /**
   * One symbol, resolving itself.
   *
   * The subscription to `resetSymbolResolution` is the point of this being a
   * component of its own: nothing else about a symbol changes when a source
   * becomes readable again, so something has to be listening for it. In the
   * hook version that listener was a dependency array, and leaving it out made
   * every failed symbol stay failed for the life of the page.
   *
   * Three states in one element, because that is what the old `symbolView()`
   * swapped by hand into a container it kept: a blank tile, a spinner, or the
   * picture. The classes are unchanged — `.slot__img-inner` and `.slot__blank`
   * are in app.css and in every row, tile and card on the page.
   */
  import type { ProviderId } from '../core/types.ts';
  import { OWN_PREFIX } from '../core/types.ts';
  import { onSymbolReset, peekSymbolUrl, resolveSymbolUrl } from '../ui/symbols.ts';
  import { t } from '../i18n/index.ts';

  let { provider, id, alt, placeholder = '+', onUnreadable }: {
    provider: ProviderId;
    id: string | null | undefined;
    /** Shown as a tooltip. See the note on alt below. */
    alt: string;
    placeholder?: string;
    /** Reports a symbol that could not be read, so the app can explain a row of them. */
    onUnreadable?: (id: string) => void;
  } = $props();

  type Showing = 'blank' | 'loading' | 'ready' | 'error';
  let showing = $state<Showing>('blank');
  let url = $state<string | null>(null);
  /** Which attempt is the current one, so a late answer cannot overwrite a newer. */
  let attempt = 0;

  function failed(): void {
    showing = 'error';
    /*
     * Own images are not the folder's problem. Counting a missing one towards
     * the "your METACOM folder cannot be read" warning would blame the folder
     * for a picture that never came from it.
     */
    if (id && !id.startsWith(OWN_PREFIX)) onUnreadable?.(id);
  }

  function resolve(): void {
    if (!id) { showing = 'blank'; url = null; return; }
    const known = peekSymbolUrl(provider, id);
    if (known) { url = known; showing = 'ready'; return; }
    const mine = ++attempt;
    showing = 'loading';
    void resolveSymbolUrl(provider, id).then((found) => {
      if (mine !== attempt) return;
      if (found) { url = found; showing = 'ready'; } else failed();
    });
  }

  /* Re-resolved when the field changes what it points at, and again whenever a
     source becomes usable: `onSymbolReset` is what "confirm access" reaches. */
  $effect(() => {
    void provider; void id;
    const stop = onSymbolReset(resolve);
    resolve();
    return stop;
  });

  const again = (event: Event) => { event.stopPropagation(); resolve(); };
  const retryKeys = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); again(event); }
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="slot__img-inner">{#if showing === 'ready' && url}<img src={url} alt="" title={alt} loading="lazy" draggable="false" onerror={failed} />{:else if showing === 'loading'}<span class="slot__blank" aria-hidden="true"><span class="spinner"></span></span>{:else if showing === 'error'}<span class="slot__blank slot__blank--error" role="button" tabindex="0" title={t('ui.symbol_failed')} onclick={again} onkeydown={retryKeys}>↻</span>{:else}<span class="slot__blank" aria-hidden="true">{placeholder}</span>{/if}</span>
