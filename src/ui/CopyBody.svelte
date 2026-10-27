<script lang="ts">
  import type { Copying } from './copySheet.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Copying } = $props();

  /* The name is focused and selected as the sheet opens — showModal() takes
     the autofocus one — because it is the one thing most copies change. */
</script>

<label class="copy__label" for="copy-name">{t('ui.copy_name')}</label><!-- svelte-ignore a11y_autofocus --><input id="copy-name" class="field" type="text" autocomplete="off" bind:value={s.name} autofocus onfocus={(event) => event.currentTarget.select()} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void s.copy(); } }} /><p class="copy__label">{t('ui.copy_what')}</p><div class="sources" role="radiogroup" aria-label={t('ui.copy_what')}><button class="source{s.withContent ? ' source--live' : ''}" type="button" role="radio" aria-checked={s.withContent} onclick={() => { s.withContent = true; }}><span class="source__name">{t('ui.copy_all')}</span><span class="source__facts">{t('ui.copy_all_facts')}</span></button><button class="source{s.withContent ? '' : ' source--live'}" type="button" role="radio" aria-checked={!s.withContent} onclick={() => { s.withContent = false; }}><span class="source__name">{t('ui.copy_look')}</span><span class="source__facts">{t(s.options.collection.kind === 'tafel' ? 'ui.copy_look_facts_tafel' : 'ui.copy_look_facts')}</span></button></div>
