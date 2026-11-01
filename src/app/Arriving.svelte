<script lang="ts">
  import { t } from '../i18n/index.ts';

  /**
   * The Material a link from lautstark.tech/sammlungen is bringing, in place of
   * the page until it is here. Her pick „C“ (2026-10-31): the new Material is
   * already the open one, empty, so what was open before is out of sight and
   * cannot be mistaken for what arrived.
   */
  let { name }: { name: string | null } = $props();
</script>

<div class="arriving" role="status"><span class="spinner arriving__spinner"></span><p class="arriving__name">{name ?? t('ui.shelf_arriving_name')}</p><p>{t('ui.shelf_arriving')}</p></div>
