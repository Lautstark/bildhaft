<script lang="ts">
  /**
   * A Plauderbuch, page under page — and where it is changed.
   *
   * A page is its question and its Aussagen. An Aussage is the card a
   * Wortkarten-Sammlung draws, so the picker, the caption and the delete
   * behave as they do there; the question is a card too, drawn small beside
   * its words, because on paper it stands on the band beside the free field.
   *
   * The box at the top adds Aussagen to the outlined page; a click on a page
   * outlines it. Each page also takes its own: „+ Aussage" under it, „✎ Frage"
   * to write or take off its question, „✎ Text" to write its Aussagen again,
   * the bin to take the page out — asked first, as every bin is. „+ Seite" at
   * the end. An empty Plauderbuch shows one empty page to begin on.
   *
   * No numbers: the binder keeps the order, and the question says which page
   * it is.
   */
  import type { ProviderId, Sentence, TalkPage } from '../core/types.ts';
  import { slotCaption, symbolIdFor } from '../core/types.ts';
  import { pagesOf } from '../core/talk.ts';
  import WordCard from './WordCard.svelte';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { openPicker } from '../app/editing.ts';
  import { addPage, addQuestionCard, addSayingCard, removePage, rewriteSayings, sayingsText, setQuestion, targetPage } from '../app/talk.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  /* An empty book is drawn as one page with no id: the first thing written
     on it makes it a page of the book. */
  const BLANK: TalkPage = { id: '', question: null, sayings: [] };
  let pages = $derived.by(() => {
    const held = pagesOf(activeCollection()?.talk);
    return held.length > 0 ? held : [BLANK];
  });
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  let target = $derived.by(() => { void s.talkPage; void activeCollection(); return targetPage()?.id ?? ''; });

  /* What is being typed where: an Aussage under a page, a page's question,
     or a page's Aussagen as text. One at a time; another Sammlung closes it. */
  let editing = $state<string | null>(null);
  let text = $state('');

  $effect(() => { void s.activeId; editing = null; });

  const questionOf = (page: TalkPage): Sentence | null => (page.question ? byId.get(page.question) ?? null : null);
  const nameOf = (page: TalkPage, at: number): string =>
    (questionOf(page) ? captionOf(questionOf(page)!) : t('ui.talk_page', { n: at + 1 }));
  const captionOf = (sentence: Sentence): string =>
    (sentence.slots[0] ? slotCaption(sentence.slots[0]) : '') || sentence.rawInput;

  function aim(page: TalkPage): void { if (page.id) s.talkPage = page.id; }

  function startEditing(page: TalkPage): void { editing = page.id; text = sayingsText(page); }


  async function finishEditing(): Promise<void> {
    const page = editing;
    if (!page || s.busy) return;
    const held = pagesOf(activeCollection()?.talk).find((one) => one.id === page);
    if (!held || text.trim() === sayingsText(held).trim()) { editing = null; return; }
    const left = await rewriteSayings(page, text);
    if (left) { text = left; return; }
    editing = null;
  }

  async function take(page: TalkPage, at: number): Promise<void> {
    const name = nameOf(page, at);
    const ok = await confirmDialog({
      title: t('ui.talk_delete_page', { page: name }),
      body: t('ui.talk_delete_page_body'),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (!ok) return;
    editing = null;
    await removePage(page.id);
  }

  /* As in the box everywhere: Enter finishes, Shift+Enter is the new line. */
  function editKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); editing = null; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!s.busy) void finishEditing(); }
  }

  function focused(node: HTMLElement): void { node.focus(); }
</script>

{#snippet head(page: TalkPage, at: number)}{@const held = questionOf(page)}{@const slot = held?.slots[0]}{@const shown = slot ? symbolIdFor(slot, provider) : null}<!--
  Die Frage als Titelzeile der Seite: immer ein Feld, direkt beschrieben,
  mit dem Symbol der Frage davor — wie die Überschriften überall
  (2026-10-23, ihr Wunsch). Leeren heißt: keine Frage mehr.
--><div class="talk__head">{#if held && slot}<button class="talk__pic{shown ? '' : ' talk__pic--asking'}" type="button" aria-label={shown ? t('ui.change_picture_for', { word: captionOf(held) }) : t('ui.pick_picture_for', { word: captionOf(held) })} onclick={(event) => { event.stopPropagation(); openPicker(held.id, slot.id); }}>{#if shown}<SymbolPicture {provider} id={shown} alt={captionOf(held)} mirrored={slot.mirrored} />{:else}?{/if}</button>{:else}<button class="title-line__add" type="button" aria-label={t('ui.talk_question_symbol')} title={t('ui.talk_question_symbol')} onclick={(event) => { event.stopPropagation(); void addQuestionCard(page.id || undefined); }}>+</button>{/if}<input class="title-line__text talk__question-input" type="text" value={held ? captionOf(held) : ''} placeholder={t('ui.talk_question_placeholder')} aria-label={t('ui.talk_question')} disabled={s.busy} onclick={(event) => event.stopPropagation()} onchange={(event) => void setQuestion(page.id || null, event.currentTarget.value)} onkeydown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span class="talk__tools">{#if page.sayings.length > 0 && editing !== page.id}<button class="song__tool" type="button" aria-label={t('ui.talk_edit_sayings', { page: nameOf(page, at) })} onclick={(event) => { event.stopPropagation(); startEditing(page); }}>{t('ui.song_edit')}</button>{/if}{#if page.id}<span class="song__acts"><button class="btn destructive icon" type="button" title={t('ui.talk_delete_page', { page: nameOf(page, at) })} aria-label={t('ui.talk_delete_page', { page: nameOf(page, at) })} onclick={(event) => { event.stopPropagation(); void take(page, at); }}><Icon name="trash" /></button></span>{/if}</span></div>{/snippet}

<div class="talk">{#each pages as page, at (page.id || 'blank')}<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions --><section class="talk__page{page.id === target ? ' talk__page--target' : ''}" aria-label={nameOf(page, at)} onclick={() => aim(page)}>{@render head(page, at)}{#if editing === page.id}<div class="song__edit"><textarea class="song__text" use:focused bind:value={text} disabled={s.busy} aria-label={t('ui.talk_edit_sayings', { page: nameOf(page, at) })} rows={Math.max(3, text.split('\n').length + 1)} onkeydown={editKeys}></textarea><div class="song__edit-acts"><span></span><button class="btn sm" type="button" onclick={() => { editing = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy} onclick={() => void finishEditing()}>{t('ui.done')}</button></div></div>{:else}<div class="words talk__sayings">{#each page.sayings as id (id)}{@const sentence = byId.get(id)}{#if sentence}<WordCard {sentence} {provider} />{/if}{/each}<button class="word word--add" type="button" aria-label={t('ui.talk_add_saying')} onclick={(event) => { event.stopPropagation(); void addSayingCard(page.id || undefined); }}>+</button></div>{/if}</section>{/each}<div class="talk__more"><button class="song__plus song__plus--part" type="button" onclick={() => void addPage()}>{t('ui.talk_add_page')}</button></div></div>
