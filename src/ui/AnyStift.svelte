<script lang="ts">
  /**
   * „Anybook-Stift": what one code says, and whether it is there at all (her
   * pick, 2026-10-27: the codes are set where the material is edited, not on
   * the print preview). Since 2026-10-28 (her call, the Anybook button) it
   * stands in Bearbeiten itself while the material has its codes on: under
   * every card that gets one, in a Schritt's or a Lied line's head, before the
   * title. The Symbol dialog carries it too.
   *
   * Written as it is typed, a moment later, and once more as it goes: the
   * dialog it sits in can be closed by ✕ or a press outside, and nothing it
   * holds may be lost by that.
   */
  import PlayButton from '@lautstark/stimmquelle/svelte/PlayButton';
  import { materialPrint } from '../app/print.ts';
  import { anybookMark } from '../core/anybook.ts';
  import { takePen, wantPen, writeAnybook, type CodeHere } from './anybookEdit.ts';
  import { hear, loadVoices, voiceOf } from './voices.svelte.ts';
  import { t } from '../i18n/index.ts';

  /* `section` in the small code sheet, under its heading; `field` in the
     Symbol dialog, under the card's text, ▶ and ✕ inside the field (her pick
     „Karte", 2026-10-27); `line` in Bearbeiten, one small field with the
     ring at its start under a title's or a row's words; `card` under a card,
     only the words, which open the card's dialog (too small to write in). */
  let { code, mode = 'section' }: { code: CodeHere; mode?: 'section' | 'field' | 'card' | 'line' } = $props();
  let small = $derived(mode === 'card' || mode === 'line');

  // svelte-ignore state_referenced_locally
  const start = anybookMark(materialPrint()?.settings ?? {}, code.key, code.standing);
  /* The words stand in the field, not as a placeholder (her call on the Studio list): typed back, they are no words of its own. */
  let words = $state(start.said);
  /* Read from the material, so the dialog and the field under the card agree on it. */
  let mark = $derived(anybookMark(materialPrint()?.settings ?? {}, code.key, code.standing));
  let off = $derived(mark.off);
  let typing = false;
  /* Changed elsewhere — in the dialog while this field stands under its card — it follows, unless it is being typed in. */
  $effect(() => { const said = mark.said; if (!typing && timer === undefined) words = said; });
  let trouble = $state('');
  let timer: number | undefined;

  const keep = (gone = off) => { window.clearTimeout(timer); timer = undefined; writeAnybook(code.key, words, gone, code.standing); };
  const later = () => { window.clearTimeout(timer); timer = window.setTimeout(keep, 400); };
  $effect(() => () => { if (timer !== undefined) keep(); });
  /* Opened from the words under the card: the caret goes straight here. */
  function asked(node: HTMLInputElement): void { if (mode === 'field' && takePen(code.key)) queueMicrotask(() => node.focus()); }
  void loadVoices();
</script>

{#snippet say()}<div class="any-stift__say{off ? ' any-stift__say--off' : ''}{mode === 'field' ? ' any-stift__say--in' : ''}{small ? ` any-stift__say--small any-stift__say--${mode}` : ''}{mark.own ? ' any-stift__say--own' : ''}">{#if small}<span class="any-mark any-mark--still{mark.own ? ' any-mark--own' : ''}{off ? ' any-mark--off' : ''}" aria-hidden="true"></span>{/if}<input use:asked id="any-stift-{mode}-{code.key}" class="field" type="text" maxlength="120" placeholder={code.standing} aria-label={small ? `${t('ui.anybook_says')}: ${code.standing}` : undefined} bind:value={words} disabled={off} onfocus={() => { typing = true; }} onblur={() => { typing = false; }} oninput={later} onchange={() => keep()} />{#if !off}<PlayButton label={t('ui.anybook_hear')} text={() => words.trim() || code.standing} hear={(said) => hear(said, voiceOf(materialPrint()?.settings))} trouble={(said) => { trouble = said; }} nothing={t('ui.anybook_nothing')} />{/if}<!--
  ✕ takes the code off, ↺ puts it back: the list's two buttons, her pick over a checkbox.
--><button class="btn quiet sm any-stift__x" type="button" title={off ? t('ui.anybook_back') : t('ui.anybook_remove')} aria-label={off ? t('ui.anybook_back') : t('ui.anybook_remove')} onclick={() => keep(!off)}>{off ? '↺' : '✕'}</button></div>{#if small}{:else if off}<p class="small faint">{t('ui.anybook_off_note')}</p>{:else if trouble}<p class="small any-stift__error">{trouble}</p>{/if}{/snippet}

{#if mode === 'card'}<!-- Only the words: pressed, they go on to the card, whose dialog opens with the caret in „Stift sagt". -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="any-peek{mark.own ? ' any-peek--own' : ''}{off ? ' any-peek--off' : ''}" title={off ? t('ui.anybook_off_note') : `${t('ui.anybook_says')} „${mark.said}“`} onpointerdown={() => wantPen(code.key)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') wantPen(code.key); }}><span class="any-mark any-mark--still{mark.own ? ' any-mark--own' : ''}{off ? ' any-mark--off' : ''}" aria-hidden="true"></span><span class="any-peek__words">{off ? t('ui.anybook_no_code') : mark.said}</span></span>{:else if small}<!-- A row's head takes keys and drags: what is typed or pressed here stays here. -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="any-pen any-pen--{mode}" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()} onpointerdown={(event) => event.stopPropagation()} ondragstart={(event) => { event.preventDefault(); event.stopPropagation(); }}>{@render say()}{#if trouble && !off}<p class="small any-stift__error">{trouble}</p>{/if}</div>{:else if mode === 'field'}<div class="any-field"><label class="small muted" for="any-stift-{mode}-{code.key}"><span class="any-mark any-mark--still" aria-hidden="true"></span>{t('ui.anybook_says')}</label>{@render say()}</div>{:else}<section class="any-stift" aria-label={t('ui.anybook_pen')}><h4 class="any-stift__head"><span class="any-mark any-mark--still" aria-hidden="true"></span>{t('ui.anybook_pen')}</h4><label class="small muted" for="any-stift-{mode}-{code.key}">{t('ui.anybook_says')}</label>{@render say()}</section>{/if}
