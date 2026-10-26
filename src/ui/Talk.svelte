<script lang="ts">
  /**
   * A Plauderbuch, page under page — and where it is changed.
   *
   * A page reads top to bottom as it does on paper: its Frage, then its
   * Antworten. Nothing here is new. An Antwort is the card a Wortkarten-
   * Sammlung draws, on the same wall ending in the same „+" (which opens the
   * symbol search; a click on a card the usual dialog, for its words). The
   * question is a line, written in the same line „+ Schritt" opens
   * (LineAdd's look), with „Fertig"; on a page without one it stands open,
   * the same „+" before it to start from a symbol instead,
   * and a question that is set is its heading, pressed to write it again. Its
   * card is drawn small beside it, because on paper it stands on the band
   * beside the free field. „✎ Text" writes a page's Antworten as text — many
   * at once, on an empty page too — the bin
   * takes the page out — asked first, as every bin is. „+ Seite" at the end.
   * An empty Plauderbuch shows one empty page to begin on, and a line saying
   * what a page is.
   *
   * No numbers: the binder keeps the order, and the question says which page
   * it is.
   */
  import type { ProviderId, Sentence, TalkPage } from '../core/types.ts';
  import { slotCaption, symbolIdFor } from '../core/types.ts';
  import { pagesOf } from '../core/talk.ts';
  import WordCard from './WordCard.svelte';
  import AddTile from './AddTile.svelte';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { openPicker } from '../app/editing.ts';
  import { addCard, addPage, removePage, rewriteSayings, sayingsText, setQuestion } from '../app/talk.ts';
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
  /* A book with nothing in it yet says what a page is. */
  let blank = $derived(pages.every((page) => !page.question && page.sayings.length === 0));

  /* A question being written again, and a page's Antworten as text. One at
     a time; another Sammlung closes them. A page without a question has its
     line open anyway, typed into in `questions`. */
  let questions = $state<Record<string, string>>({});
  let asking = $state<string | null>(null);
  let question = $state('');
  let editing = $state<string | null>(null);
  let text = $state('');

  $effect(() => { void s.activeId; questions = {}; asking = null; editing = null; });

  const questionOf = (page: TalkPage): Sentence | null => (page.question ? byId.get(page.question) ?? null : null);
  const nameOf = (page: TalkPage, at: number): string =>
    (questionOf(page) ? captionOf(questionOf(page)!) : t('ui.talk_page', { n: at + 1 }));
  const captionOf = (sentence: Sentence): string =>
    (sentence.slots[0] ? slotCaption(sentence.slots[0]) : '') || sentence.rawInput;

  function startAsking(page: TalkPage): void {
    editing = null; asking = page.id;
    const held = questionOf(page);
    question = held ? captionOf(held) : '';
  }
  function startEditing(page: TalkPage): void { asking = null; editing = page.id; text = sayingsText(page); }

  async function finishAsking(): Promise<void> {
    const page = asking;
    if (page === null || s.busy) return;
    const left = await setQuestion(page || null, question);
    if (left) { question = left; return; }
    asking = null;
  }

  /* The open line of a page that has no question yet. */
  async function firstQuestion(page: string): Promise<void> {
    const typed = questions[page] ?? '';
    if (!typed.trim() || s.busy) return;
    const left = await setQuestion(page || null, typed);
    questions[page] = left;
  }

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
    asking = null; editing = null;
    await removePage(page.id);
  }

  function askKeys(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); void finishAsking(); }
    if (event.key === 'Escape') { event.preventDefault(); asking = null; }
  }
  /* Wie die Box überall: Enter ist fertig, Shift+Enter die neue Zeile. */
  function editKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); editing = null; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!s.busy) void finishEditing(); }
  }

  function focused(node: HTMLElement): void { node.focus(); }
  function maybeFocused(node: HTMLElement, when: boolean): void { if (when) node.focus(); }
</script>

{#snippet head(page: TalkPage, at: number)}{@const held = questionOf(page)}{@const slot = held?.slots[0]}{@const shown = slot ? symbolIdFor(slot, provider) : null}<span class="talk__label">{t('ui.talk_question')}</span><div class="talk__head">{#if asking === page.id}<div class="line-add talk__ask"><input class="line-add__input" use:focused bind:value={question} disabled={s.busy} aria-label={t('ui.talk_question_of', { page: nameOf(page, at) })} placeholder={t('ui.talk_question_placeholder')} onkeydown={askKeys} /><button class="btn sm" type="button" onclick={() => { asking = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy} onclick={() => void finishAsking()}>{t('ui.done')}</button></div>{:else if held && slot}<button class="talk__pic{shown ? '' : ' talk__pic--asking'}" type="button" aria-label={shown ? t('ui.change_picture_for', { word: captionOf(held) }) : t('ui.pick_picture_for', { word: captionOf(held) })} onclick={() => openPicker(held.id, slot.id)}>{#if shown}<SymbolPicture {provider} id={shown} alt={captionOf(held)} mirrored={slot.mirrored} />{:else}?{/if}</button><h3 class="talk__question"><button class="talk__question-edit" type="button" title={t('ui.talk_question_change')} onclick={() => startAsking(page)}>{#if captionOf(held)}{captionOf(held)}{:else}<span class="faint">{t('ui.talk_question_placeholder')}</span>{/if}</button></h3>{:else}<!--
  No question yet: its line stands open, with the caret in it on an empty
  book, and before it the „+" that starts from a symbol instead.
--><button class="talk__pic talk__pic--add" type="button" aria-label={t('ui.talk_question_symbol', { page: nameOf(page, at) })} title={t('ui.talk_question_symbol', { page: nameOf(page, at) })} onclick={() => void addCard('question', page.id || undefined)}>+</button><div class="line-add talk__ask"><input class="line-add__input" use:maybeFocused={!page.id} bind:value={() => questions[page.id] ?? '', (value) => { questions[page.id] = value; }} disabled={s.busy} aria-label={t('ui.talk_question_of', { page: nameOf(page, at) })} placeholder={t('ui.talk_question_placeholder')} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void firstQuestion(page.id); } }} /><button class="btn primary sm" type="button" disabled={s.busy || !(questions[page.id] ?? '').trim()} onclick={() => void firstQuestion(page.id)}>{t('ui.done')}</button></div>{/if}{#if asking !== page.id}<span class="talk__tools">{#if page.id && editing !== page.id}<button class="song__tool" type="button" aria-label={t('ui.talk_edit_sayings', { page: nameOf(page, at) })} onclick={() => startEditing(page)}>{t('ui.song_edit')}</button>{/if}{#if page.id}<span class="song__acts"><button class="btn destructive icon" type="button" title={t('ui.talk_delete_page', { page: nameOf(page, at) })} aria-label={t('ui.talk_delete_page', { page: nameOf(page, at) })} onclick={() => void take(page, at)}><Icon name="trash" /></button></span>{/if}</span>{/if}</div>{/snippet}

<div class="talk">{#if blank}<p class="small faint talk__intro">{t('ui.talk_intro')}</p>{/if}{#each pages as page, at (page.id || 'blank')}<section class="talk__page" aria-label={nameOf(page, at)}>{@render head(page, at)}<span class="talk__label">{t('ui.talk_answers')}</span>{#if editing === page.id}<div class="song__edit"><textarea class="song__text" use:focused bind:value={text} disabled={s.busy} aria-label={t('ui.talk_edit_sayings', { page: nameOf(page, at) })} rows={Math.max(3, text.split('\n').length + 1)} onkeydown={editKeys}></textarea><div class="song__edit-acts"><span></span><button class="btn sm" type="button" onclick={() => { editing = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy} onclick={() => void finishEditing()}>{t('ui.done')}</button></div></div>{:else}<div class="words talk__sayings">{#each page.sayings as id (id)}{@const sentence = byId.get(id)}{#if sentence}<WordCard {sentence} {provider} />{/if}{/each}<AddTile label={t('ui.talk_saying_add', { page: nameOf(page, at) })} onAdd={() => void addCard('saying', page.id || undefined)} />{#if page.sayings.length === 0}<span class="empty-whisper empty-whisper--wall">{t('ui.talk_whisper')}</span>{/if}</div>{/if}</section>{/each}<div class="talk__more"><button class="song__plus song__plus--part" type="button" onclick={() => void addPage()}>{t('ui.talk_add_page')}</button></div></div>
