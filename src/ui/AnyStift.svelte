<script lang="ts">
  /**
   * „Anybook-Stift": what one code says, and whether it is there at all (her
   * pick, 2026-10-27: the codes are set where the material is edited, not on
   * the print preview). The Symbol dialog carries it for a card, the small code
   * sheet for a title, a Schritt or a Lied's line.
   *
   * Written as it is typed, a moment later, and once more as it goes: the
   * dialog it sits in can be closed by ✕ or a press outside, and nothing it
   * holds may be lost by that.
   */
  import PlayButton from '@lautstark/stimmquelle/svelte/PlayButton';
  import { materialPrint } from '../app/print.ts';
  import { anybookMark } from '../core/anybook.ts';
  import { writeAnybook, type CodeHere } from './anybookEdit.ts';
  import { hear, loadVoices, voiceOf } from './voices.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { code }: { code: CodeHere } = $props();

  // svelte-ignore state_referenced_locally
  const start = anybookMark(materialPrint()?.settings ?? {}, code.key, code.standing);
  /* The words stand in the field, not as a placeholder (her call on the Studio list): typed back, they are no words of its own. */
  let words = $state(start.said);
  let off = $state(start.off);
  let trouble = $state('');
  let timer: number | undefined;

  const keep = () => { window.clearTimeout(timer); timer = undefined; writeAnybook(code.key, words, off, code.standing); };
  const later = () => { window.clearTimeout(timer); timer = window.setTimeout(keep, 400); };
  $effect(() => () => { if (timer !== undefined) keep(); });
  void loadVoices();
</script>

<section class="any-stift" aria-label={t('ui.anybook_pen')}><h4 class="any-stift__head"><span class="any-mark any-mark--still" aria-hidden="true"></span>{t('ui.anybook_pen')}</h4><label class="small muted" for="any-stift-{code.key}">{t('ui.anybook_says')}</label><div class="any-stift__say{off ? ' any-stift__say--off' : ''}"><input id="any-stift-{code.key}" class="field" type="text" maxlength="120" placeholder={code.standing} bind:value={words} disabled={off} oninput={later} onchange={keep} />{#if !off}<PlayButton label={t('ui.anybook_hear')} text={() => words.trim() || code.standing} hear={(said) => hear(said, voiceOf(materialPrint()?.settings))} trouble={(said) => { trouble = said; }} nothing={t('ui.anybook_nothing')} />{/if}<!--
  ✕ takes the code off, ↺ puts it back: the list's two buttons, her pick over a checkbox.
--><button class="btn quiet sm any-stift__x" type="button" title={off ? t('ui.anybook_back') : t('ui.anybook_remove')} aria-label={off ? t('ui.anybook_back') : t('ui.anybook_remove')} onclick={() => { off = !off; keep(); }}>{off ? '↺' : '✕'}</button></div>{#if off}<p class="small faint">{t('ui.anybook_off_note')}</p>{:else}{#if trouble}<p class="small any-stift__error">{trouble}</p>{/if}{/if}</section>
