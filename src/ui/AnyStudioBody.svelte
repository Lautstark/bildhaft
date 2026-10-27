<script lang="ts">
  import type { StudioExport } from './anyStudio.svelte.ts';
  import PlayButton from '@lautstark/stimmquelle/svelte/PlayButton';
  import { materialPrint } from '../app/print.ts';
  import { anybookMark } from '../core/anybook.ts';
  import { writeAnybook } from './anybookEdit.ts';
  import { hear } from './voices.svelte.ts';
  import VoiceChoice from './VoiceChoice.svelte';
  import { t } from '../i18n/index.ts';

  let { s }: { s: StudioExport } = $props();

  /* Read from the material, so a change here or on the sheet shows at once. */
  let settings = $derived(materialPrint()?.settings);
  /* What each field holds now, typed or not yet written: ▶ says that. */
  const typed: Record<string, string> = {};
  const trouble = (said: string) => { s.error = said || null; };
</script>

<p class="small">{t('ui.anybook_studio_intro')}</p>
<div class="any-voice">{#if !s.busy}<VoiceChoice id="any-voice" />{/if}</div>
<p class="any-list__head">{t('ui.anybook_codes_n', { n: s.live })}</p>
<ol class="any-list">{#each s.codes as code, at (code.key)}{@const mark = anybookMark(settings ?? {}, code.key, code.standing)}<li class="any-list__row{mark.off ? ' any-list__row--off' : ''}"><span class="any-list__n">{at + 1}</span>{#if code.picture}<img class="any-list__pic" src={code.picture} alt="" />{:else}<span class="any-list__pic any-list__pic--title">{t('ui.anybook_part_title')}</span>{/if}<input class="field" id="any-say-{code.key}" aria-label={t('ui.anybook_says')} value={mark.said} disabled={mark.off || s.busy} oninput={(event) => { typed[code.key] = event.currentTarget.value; }} onchange={(event) => writeAnybook(code.key, event.currentTarget.value, false, code.standing)} /><PlayButton label={t('ui.anybook_hear')} text={() => (typed[code.key] ?? mark.said).trim() || code.standing} hear={(said) => hear(said, s.voice)} {trouble} nothing={t('ui.anybook_nothing')} /><button class="btn quiet sm any-list__x" type="button" disabled={s.busy} aria-label={mark.off ? t('ui.anybook_back') : t('ui.anybook_remove')} title={mark.off ? t('ui.anybook_back') : t('ui.anybook_remove')} onclick={() => writeAnybook(code.key, mark.own ? mark.said : null, !mark.off, code.standing)}>{mark.off ? '↺' : '✕'}</button></li>{/each}</ol>
<label class="ding-check"><input type="checkbox" checked={s.activation && s.titled} disabled={s.busy || !s.titled} onchange={(event) => { s.activation = event.currentTarget.checked; }} /> {t('ui.anybook_activation')}</label>
<p class="small faint">{t(s.titled ? 'ui.anybook_activation_hint' : 'ui.anybook_activation_untitled')}</p>
<p class="small faint">{t('ui.anybook_after')}</p>
{#if s.busy && s.total > 0}<p class="small">{t('ui.anybook_recording', { n: Math.min(s.done + 1, s.total), total: s.total })}</p>{/if}
{#if s.error}<p class="small any-list__error" role="alert">{s.error}</p>{/if}
