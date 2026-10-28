<script lang="ts">
  /**
   * A Plauderbuch, page under page — and where it is changed.
   *
   * A page reads top to bottom as it does on paper: its Frage, then its
   * Antworten. Nothing here is new. The question is a title's line
   * (SymbolLine): its symbols, a „+" for one more, its words written where
   * they stand — on an empty book with the caret in them. An Antwort is the
   * card a Wortkarten-Sammlung draws, on the same wall ending in the same „+"
   * (the symbol search; a click on a card the usual dialog, for its words).
   * The bin takes the page out — asked first, as every bin is. „+ Seite" at
   * the end. An empty Plauderbuch shows one empty page to begin on, and a
   * line saying what a page is.
   *
   * No numbers: the binder keeps the order, and the question says which page
   * it is.
   *
   * A page prints as many Antworten as its paper holds (talkPrint). The rest
   * wait under it, as the cards beside a Tafel do — „Passt nicht mehr auf
   * die Seite", not printed — and the „+" goes there while the page is full.
   * A card dragged onto another changes places with it: so a waiting one
   * comes onto the page and the one it was dropped on goes to wait.
   */
  import type { ProviderId, Sentence, TalkPage } from '../core/types.ts';
  import { picturesOf, slotCaption } from '../core/types.ts';
  import { pagesOf } from '../core/talk.ts';
  import WordCard from './WordCard.svelte';
  import AddTile from './AddTile.svelte';
  import SymbolLine from './SymbolLine.svelte';
  import AnyStift from './AnyStift.svelte';
  import { questionCode } from './anybookEdit.ts';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { openPicker } from '../app/editing.ts';
  import { addCard, addPage, addQuestionSymbol, removePage, swapSayings, writeQuestion } from '../app/talk.ts';
  import { talkPrint } from '../app/print.ts';
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
  /* How many Antworten a page prints; the paper and the Beschriftung decide. */
  let room = $derived(talkPrint()?.room ?? Infinity);
  /* A book with nothing in it yet says what a page is. */
  let blank = $derived(pages.every((page) => !page.question && page.sayings.length === 0));

  const questionOf = (page: TalkPage): Sentence | null => (page.question ? byId.get(page.question) ?? null : null);
  /* What a question says: its words, or the caption of a card made before
     a question had words of its own. */
  const questionText = (sentence: Sentence | null): string =>
    (sentence ? sentence.rawInput || (sentence.slots[0] ? slotCaption(sentence.slots[0]) : '') : '');
  const nameOf = (page: TalkPage, at: number): string =>
    questionText(questionOf(page)) || t('ui.talk_page', { n: at + 1 });

  async function take(page: TalkPage, at: number): Promise<void> {
    const name = nameOf(page, at);
    const ok = await confirmDialog({
      title: t('ui.talk_delete_page', { page: name }),
      body: t('ui.talk_delete_page_body'),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (!ok) return;
    await removePage(page.id);
  }

  /* A card carried from one place on a page to another, and the one it
     would change places with, ringed as a Tafel's field is. */
  let carrying = $state<string | null>(null);
  let target = $state<string | null>(null);
  function dragStart(event: DragEvent, id: string): void {
    carrying = id;
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function over(event: DragEvent, id: string): void {
    event.preventDefault();
    target = carrying !== null && carrying !== id ? id : null;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
  /* A tick later, as on the Tafel: a repaint while the drop is still being
     handled takes the dragged card out of the page, and Chrome then never
     starts another drag. */
  function dropOn(event: DragEvent, page: TalkPage, onto: string): void {
    event.preventDefault();
    const id = carrying ?? (event.dataTransfer?.getData('text/plain') || null);
    carrying = null; target = null;
    if (id && id !== onto) setTimeout(() => void swapSayings(page.id, id, onto), 0);
  }

</script>

{#snippet head(page: TalkPage, at: number)}{@const held = questionOf(page)}<div class="talk__head"><SymbolLine pictures={picturesOf(held)} {provider} value={questionText(held)} placeholder={t('ui.talk_question_placeholder')} textLabel={t('ui.talk_question_of', { page: nameOf(page, at) })} pictureLabel={t('ui.talk_question_picture', { page: nameOf(page, at) })} addLabel={t('ui.talk_question_symbol', { page: nameOf(page, at) })} focus={!page.id} onPick={(slot) => { if (held) openPicker(held.id, slot.id); }} onAdd={() => void addQuestionSymbol(page.id || null)} onText={(text) => void writeQuestion(page.id || null, text)}>{#snippet trail()}{@const code = questionCode(held, questionText(held))}{#if code}<AnyStift {code} mode="line" />{/if}{/snippet}</SymbolLine>{#if page.id}<span class="song__acts"><button class="btn destructive icon" type="button" title={t('ui.talk_delete_page', { page: nameOf(page, at) })} aria-label={t('ui.talk_delete_page', { page: nameOf(page, at) })} onclick={() => void take(page, at)}><Icon name="trash" /></button></span>{/if}</div>{/snippet}

{#snippet card(page: TalkPage, id: string)}{@const sentence = byId.get(id)}{#if sentence}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="board-card" class:board-card--dragging={carrying === id} class:board-card--over={target === id} draggable="true" ondragstart={(event) => dragStart(event, id)} ondragend={() => { carrying = null; target = null; }} ondragover={(event) => over(event, id)} ondragleave={() => { if (target === id) target = null; }} ondrop={(event) => dropOn(event, page, id)}><WordCard {sentence} {provider} /></div>{/if}{/snippet}

{#snippet add(page: TalkPage, at: number)}<AddTile label={t('ui.talk_saying_add', { page: nameOf(page, at) })} onAdd={() => void addCard('saying', page.id || undefined)} />{/snippet}

<div class="talk">{#if blank}<p class="small faint talk__intro">{t('ui.talk_intro')}</p>{/if}{#each pages as page, at (page.id || 'blank')}<section class="talk__page" aria-label={nameOf(page, at)}>{@render head(page, at)}<div class="words talk__sayings">{#each page.sayings.slice(0, room) as id (id)}{@render card(page, id)}{/each}{#if page.sayings.length < room}{@render add(page, at)}{/if}{#if page.sayings.length === 0}<span class="empty-whisper empty-whisper--wall">{t('ui.talk_whisper')}</span>{/if}</div>{#if page.sayings.length >= room}<div class="tray talk__tray"><div class="tray__head"><b>{t('ui.talk_tray')}</b><span class="small faint">{t('ui.talk_tray_hint')}</span></div><div class="words tray__wall">{#each page.sayings.slice(room) as id (id)}{@render card(page, id)}{/each}{@render add(page, at)}</div></div>{/if}</section>{/each}<div class="talk__more"><button class="song__plus song__plus--part" type="button" onclick={() => void addPage()}>{t('ui.talk_add_page')}</button></div></div>
