<script lang="ts">
  import type { Picking } from './slotPicker.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Picking } = $props();
</script>

<button class="btn destructive" type="button" onclick={() => s.finish(() => s.handlers.onRemove())}>{s.isNew ? t('ui.cancel') : t('ui.remove_slot')}</button><div class="spacer"></div><!--
  Fertig means the square while one is being chosen. It used to close over an
  open crop and settle the field on whatever it had before — defensible, in that
  nothing had been written and no way out of this dialog had ever cost anything,
  and from where somebody is sitting it was a picture chosen, a picture
  adjusted, and then nothing at all. The ✕ and a press outside still cost
  nothing; those say "never mind".
--><button class="btn" type="button" onclick={() => (s.loaded ? s.keepSquare() : s.finish(() => s.handlers.onClose()))}>{t('ui.done')}</button>
