<script lang="ts">
  import type { Picking } from './slotPicker.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Picking } = $props();
</script>

<!--
  Left, the way out that takes the field away: red where there is something to
  lose, plain „Abbrechen" on a field the „+" has only just made — nothing is
  lost there, so it is not drawn as if it were. A place that cannot remove a
  field passes no `onRemove`, and the button is not there.
-->{#if s.handlers.onRemove}{@const remove = s.handlers.onRemove}<button class="btn{s.isNew ? '' : ' destructive'}" type="button" onclick={() => s.finish(remove)}>{s.isNew ? t('ui.cancel') : t('ui.remove_slot')}</button>{/if}<div class="spacer"></div><!--
  Fertig means the square while one is being chosen. It used to close over an
  open crop and settle the field on whatever it had before — defensible, in that
  nothing had been written and no way out of this dialog had ever cost anything,
  and from where somebody is sitting it was a picture chosen, a picture
  adjusted, and then nothing at all. The ✕ and a press outside still cost
  nothing; those say "never mind".
--><button class="btn" type="button" onclick={() => (s.loaded ? s.keepSquare() : s.finish(() => s.handlers.onClose?.()))}>{t('ui.done')}</button>
