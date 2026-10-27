<script lang="ts">
  /**
   * Which voice this material's Anybook codes speak in: the household's
   * (Einstellungen → Stimme) or one of its own. The family's Dropdown, not a
   * `<select>` — its open list could not follow the page's colours.
   */
  import Dropdown from '@lautstark/design/svelte/Dropdown';
  import { materialPrint } from '../app/print.ts';
  import { defaultVoice, knownVoices, loadVoices, voiceLabel } from './voices.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { id }: { id: string } = $props();

  $effect(() => { void loadVoices(); });
  let own = $derived(materialPrint()?.settings.anybookVoice);
  let household = $derived(defaultVoice());
  let label = $derived(own ? voiceLabel(own) : t('ui.anybook_voice_default', { voice: voiceLabel(household) }));
</script>

<span class="small" id="{id}-label">{t('ui.anybook_voice')}</span><Dropdown {id} labelledBy="{id}-label" {label} build={(add) => {
  add(t('ui.anybook_voice_default', { voice: voiceLabel(household) }), () => materialPrint()?.set('anybookVoice', undefined), { checked: !own });
  for (const voice of knownVoices().filter((one) => one.lang === 'de')) add(voiceLabel(voice.id), () => materialPrint()?.set('anybookVoice', voice.id), { checked: own === voice.id });
}} />
