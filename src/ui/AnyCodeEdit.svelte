<script lang="ts">
  /**
   * The Anybook codes of the sheet beside it, worked on where they are (her
   * pick „B“ from the mock, 2026-10-27): hover a code and it says what it
   * says, tap it and a small box asks for other words or takes it off.
   *
   * Listens on the preview it is given rather than on each code, so the sheet
   * stays the same component it is on paper. Draws itself on the page's body:
   * the preview is scaled and clipped, and a box inside it would be too.
   */
  import { tick } from 'svelte';
  import PlayButton from '@lautstark/stimmquelle/svelte/PlayButton';
  import { materialPrint } from '../app/print.ts';
  import { writeAnybook as write } from './anybookEdit.ts';
  import { hear, loadVoices, voiceOf } from './voices.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { host }: { host: HTMLElement | undefined } = $props();

  type Code = { start: boolean; key: string; said: string; standing: string; off: boolean; rect: DOMRect };
  let hover = $state<Code | null>(null);
  let open = $state<Code | null>(null);
  let words = $state('');
  let field: HTMLInputElement | undefined = $state();
  let trouble = $state('');

  const codeAt = (target: EventTarget | null): Code | null => {
    const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('.ps-any');
    if (!el || !el.dataset.any) return null;
    return {
      start: el.classList.contains('ps-any--start'),
      key: el.dataset.any, said: el.dataset.said ?? '', standing: el.dataset.standing ?? '',
      off: el.classList.contains('ps-any--off'), rect: el.getBoundingClientRect(),
    };
  };

  async function show(code: Code): Promise<void> {
    open = code;
    hover = null;
    words = code.said;
    trouble = '';
    void loadVoices();
    await tick();
    field?.focus();
  }

  const done = () => { if (open && !open.off) write(open.key, words, false, open.standing); open = null; };

  $effect(() => {
    const el = host;
    if (!el) return;
    const over = (event: PointerEvent) => { if (!open) hover = codeAt(event.target); };
    const leave = () => { hover = null; };
    const click = (event: MouseEvent) => {
      const code = codeAt(event.target);
      if (!code || code.start) return;
      event.preventDefault();
      event.stopPropagation();
      void show(code);
    };
    el.addEventListener('pointerover', over);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerover', over);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('click', click, true);
    };
  });

  /* Drawn on the body, so neither the preview's scale nor its clipping reach it. */
  function onBody(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  const below = (rect: DOMRect, width: number): string =>
    `left:${Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))}px;top:${rect.bottom + 6}px`;
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') open = null; }} onscroll={() => { hover = null; }} />

{#if hover && !open}<div class="any-tip" use:onBody style={below(hover.rect, 240)} role="tooltip">{#if hover.start}{t('ui.anybook_start_tip')}{:else if hover.off}{t('ui.anybook_off_tip')}{:else}<span class="any-tip__cap">{t('ui.anybook_says')}</span> „{hover.said}“{/if}</div>{/if}

{#if open}<div class="any-back" use:onBody role="presentation" onpointerdown={done}></div><div class="any-pop" use:onBody style={below(open.rect, 300)} role="dialog" aria-label={t('ui.anybook_code')}>{#if open.off}<p class="any-pop__cap">{t('ui.anybook_off_tip')}</p><p class="small faint">{t('ui.anybook_default', { said: open.standing })}</p><div class="any-pop__foot"><button class="btn quiet sm" type="button" onclick={() => { open = null; }}>{t('ui.anybook_close')}</button><button class="btn primary sm" type="button" onclick={() => { write(open!.key, null, false); open = null; }}>{t('ui.anybook_back')}</button></div>{:else}<label class="any-pop__cap" for="any-words">{t('ui.anybook_says')}</label><div class="any-pop__say"><input id="any-words" class="field" bind:this={field} bind:value={words} onkeydown={(event) => { if (event.key === 'Enter') done(); }} /><PlayButton label={t('ui.anybook_hear')} text={() => words.trim() || open?.standing || ''} hear={(said) => hear(said, voiceOf(materialPrint()?.settings))} trouble={(said) => { trouble = said; }} nothing={t('ui.anybook_nothing')} /></div>{#if trouble}<p class="small any-list__error">{trouble}</p>{/if}{#if words.trim() !== open.standing}<p class="small faint">{t('ui.anybook_default', { said: open.standing })}</p>{/if}<div class="any-pop__foot"><button class="btn destructive sm" type="button" onclick={() => { write(open!.key, words, true, open!.standing); open = null; }}>{t('ui.anybook_remove')}</button><button class="btn primary sm" type="button" onclick={done}>{t('ui.done')}</button></div>{/if}</div>{/if}
