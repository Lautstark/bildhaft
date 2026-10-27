<script lang="ts">
  /**
   * A field's Anybook code, as Bearbeiten shows it: a small ring in its corner,
   * as the sticker sits on paper, saying on hover what the pen says. A dot when
   * the words are its own; struck through when the code is off.
   *
   * On a card it is only a mark — the card's own press opens the Symbol dialog,
   * which holds the code. Where there is no such dialog (a title, a Schritt, a
   * Lied's line) it is the button that opens the small code sheet.
   */
  import { materialPrint } from '../app/print.ts';
  import { anybookMark } from '../core/anybook.ts';
  import type { CodeHere } from './anybookEdit.ts';
  import { t } from '../i18n/index.ts';

  let { code, onopen, place = 'corner' }: { code: CodeHere; onopen?: () => void; place?: 'corner' | 'inline' } = $props();

  let mark = $derived(anybookMark(materialPrint()?.settings ?? {}, code.key, code.standing));
  let tip = $derived(mark.off ? t('ui.anybook_off') : `${t('ui.anybook_says')} „${mark.said}“`);
  let cls = $derived(`any-mark any-mark--${place}${mark.own ? ' any-mark--own' : ''}${mark.off ? ' any-mark--off' : ''}`);
</script>

{#if onopen}<button class={cls} type="button" title={tip} aria-label={`${t('ui.anybook_code')}: ${tip}`} onclick={(event) => { event.stopPropagation(); onopen(); }}></button>{:else}<span class={cls} title={tip} aria-hidden="true"></span>{/if}
