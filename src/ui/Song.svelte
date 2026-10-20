<script lang="ts">
  /**
   * A Lied, top to bottom as it is sung — and where it is changed.
   *
   * Every line is the row a Satzstreifen draws — same picker, same captions,
   * same drag inside the row — and each is drawn wherever it is sung. A line
   * sung ten times is drawn ten times and is one row: fixing it in one place
   * fixes it in all of them, and the row says how often it is sung so that
   * nobody is surprised by that. A row shows its symbols and no line of text:
   * the words are under the symbols, and the text is a part's „✎ Text" away.
   *
   * The Refrain is drawn open the first time and folded after that, so the
   * page stays the length of the song rather than five times the refrain.
   * Opened, it is the same rows again, not a copy.
   *
   * The song's shape is changed here, part by part, the way the box at the
   * top only ever adds: „+ Zeile" under a part, „+ Strophe" and „+ Refrain"
   * between any two parts and at the end, the bin to take a part out where it
   * stands — asked first, as every bin is — and „✎ Text" to write one part
   * again as text. An empty Lied shows an empty Strophe and an
   * empty Refrain to begin in, the way an empty Tafel shows its grid.
   */
  import type { ProviderId, SongPartKind } from '../core/types.ts';
  import { sungParts, timesSung, type SungPart } from '../core/song.ts';
  import Row from './Row.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { addLinesToPart, addRefrain, addStrophe, partText, removePlace, rewritePart } from '../app/song.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let song = $derived(activeCollection()?.song ?? null);
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  let times = $derived(song ? timesSung(song) : new Map<string, number>());
  let sung = $derived(song ? sungParts(song) : []);
  let empty = $derived(sung.length === 0);
  let hasRefrain = $derived(Boolean(song?.parts.some((part) => part.kind === 'refrain')));
  /* What a Strophe put in at `at` will be called: the next number after the
     Strophen sung before it. */
  const stropheAt = (at: number): number =>
    new Set(sung.slice(0, at).filter((one) => one.kind === 'strophe').map((one) => one.part.id)).size + 1;

  /* Which of the refrains after the first are folded open, by where they are
     sung. A place in the song rather than a part, because the part is the
     same in all of them and only the one that was clicked should open. */
  let unfolded = $state<number[]>([]);

  /* Where a line is being typed: under a part, or for a part that is not
     there yet — a new Strophe, the first Refrain, either part of an empty
     Lied — put in at a place in the song, or at its end. One at a time;
     another Sammlung closes it. */
  type Typing = { into: 'part'; id: string } | { into: 'new'; kind: SongPartKind; at: number };
  let typing = $state<Typing | null>(null);
  let line = $state('');
  /* The part being written again as text, and that text. */
  let editing = $state<string | null>(null);
  let text = $state('');
  let before = $state('');

  $effect(() => { void s.activeId; typing = null; editing = null; unfolded = []; });

  const label = (at: { kind: SongPartKind; n: number }): string =>
    (at.kind === 'refrain' ? t('ui.song_refrain') : t('ui.song_strophe', { n: at.n }));
  const isTyping = (into: Typing): boolean => JSON.stringify(typing) === JSON.stringify(into);

  function startTyping(into: Typing): void {
    editing = null;
    typing = into;
    line = '';
    text = '';
    before = '';
  }

  async function sendLine(): Promise<void> {
    const raw = line;
    const into = typing;
    if (into?.into !== 'part' || !raw.trim() || s.busy) return;
    line = '';
    const left = await addLinesToPart(into.id, raw);
    if (left) line = left;
  }

  /* A part that is not there yet is written whole, in the same field „✎ Text"
     opens: a new Strophe is usually typed or pasted in one go. */
  async function finishNew(): Promise<void> {
    const into = typing;
    if (into?.into !== 'new' || s.busy) return;
    if (!text.trim()) { typing = null; return; }
    const left = into.kind === 'refrain' ? await addRefrain(text, into.at) : await addStrophe(text, endsAt(into.at));
    if (left) { text = left; return; }
    typing = null;
  }

  function newKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); typing = null; }
  }

  function lineKeys(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendLine(); }
    if (event.key === 'Escape') { event.preventDefault(); typing = null; }
  }
  /* Left empty, the field goes; left with something in it, it stays, so
     nothing typed is lost by clicking elsewhere. A moment after, not at
     once: the click that took the focus away lands on whatever it was aimed
     at before the field going moves the page under it. */
  function lineLeft(): void {
    const was = typing;
    window.setTimeout(() => { if (!line.trim() && typing === was) typing = null; }, 150);
  }

  function startEditing(id: string): void {
    typing = null;
    editing = id;
    before = partText(id);
    text = before;
  }

  async function finishEditing(): Promise<void> {
    const id = editing;
    if (!id || s.busy) return;
    if (text.trim() === before.trim()) { editing = null; return; }
    const left = await rewritePart(id, text);
    if (left) { text = left; return; }
    editing = null;
  }

  /* What „Fertig" will do, said while the text is being changed. */
  let change = $derived.by(() => {
    if (!editing) return '';
    const was = before.split('\n').map((one) => one.trim()).filter(Boolean);
    const now = text.split('\n').map((one) => one.trim()).filter(Boolean);
    const fresh = now.filter((one) => !was.includes(one)).length;
    const gone = was.filter((one) => !now.includes(one)).length;
    const changed = Math.min(fresh, gone);
    const bits = [
      changed ? t('ui.song_changed', { n: changed }) : '',
      fresh - changed ? t('ui.song_new', { n: fresh - changed }) : '',
      gone - changed ? t('ui.song_gone', { n: gone - changed }) : '',
    ].filter(Boolean);
    return bits.length > 0 ? t('ui.song_on_done', { what: bits.join(', ') }) : '';
  });

  /* At the end is the end: a Strophe added there brings the Refrain after it
     when the song's shape says so, one put in between does not. */
  const endsAt = (at: number): number | undefined => (at >= sung.length ? undefined : at);

  /* „+ Refrain" sings the Refrain there; a song without one is given one. */
  function refrainAt(at: number): void {
    if (hasRefrain) { typing = null; void addRefrain('', endsAt(at)); } else startTyping({ into: 'new', kind: 'refrain', at });
  }

  /* Asked first, as every bin in bildhaft asks. Where the part is sung again
     elsewhere it goes from here only, and the question says so. */
  async function take(at: SungPart, place: number): Promise<void> {
    const name = label(at);
    const others = sung.filter((one) => one.part.id === at.part.id).length - 1;
    const ok = await confirmDialog({
      title: t('ui.song_delete_part', { part: name }),
      body: others > 0 ? t('ui.song_delete_here', { part: name, n: others }) : t('ui.song_delete_whole', { part: name }),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (!ok) return;
    typing = null;
    editing = null;
    unfolded = [];
    await removePlace(place);
  }

  function editKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); editing = null; }
  }

  /* A field that appears is where the caret goes. */
  function focused(node: HTMLElement): void { node.focus(); }
</script>

{#snippet adding(into: Typing, name: string)}{#if isTyping(into)}<div class="song__add"><input class="song__line-input" use:focused bind:value={line} disabled={s.busy} aria-label={t('ui.song_line_in', { part: name })} placeholder={t('ui.song_line_in', { part: name })} onkeydown={lineKeys} onblur={lineLeft} /><button class="btn sm" type="button" disabled={s.busy || !line.trim()} onclick={() => void sendLine()}>{t('ui.song_add')}</button></div>{:else}<button class="song__plus" type="button" onclick={() => startTyping(into)}>{t('ui.song_add_line')}</button>{/if}{/snippet}

{#snippet part(at: SungPart, place: number)}{@const name = label(at)}<section class="song__part{at.kind === 'refrain' ? ' song__part--refrain' : ''}" aria-label={name}><div class="song__head"><h3>{name}</h3>{#if at.first && editing !== at.part.id}<button class="song__tool" type="button" aria-label={t('ui.song_edit_part', { part: name })} onclick={() => startEditing(at.part.id)}>{t('ui.song_edit')}</button>{/if}<span class="song__acts"><button class="btn destructive icon" type="button" title={t('ui.song_delete_part', { part: name })} aria-label={t('ui.song_delete_part', { part: name })} onclick={() => void take(at, place)}><Icon name="trash" /></button></span></div>{#if editing === at.part.id}<div class="song__edit"><textarea class="song__text" use:focused bind:value={text} disabled={s.busy} aria-label={t('ui.song_edit_part', { part: name })} rows={Math.max(3, text.split('\n').length + 1)} onkeydown={editKeys}></textarea><div class="song__edit-acts"><span class="small faint">{change || (at.kind === 'refrain' && times.size > 0 ? t('ui.song_refrain_everywhere') : '')}</span><button class="btn sm" type="button" onclick={() => { editing = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy} onclick={() => void finishEditing()}>{t('ui.done')}</button></div></div>{:else}<div class="song__lines">{#if at.kind === 'refrain' && !at.first && !unfolded.includes(place)}<button class="song__folded" type="button" onclick={() => { unfolded = [...unfolded, place]; }}>{t('ui.song_folded', { n: at.part.lines.length })}</button>{:else}{#each at.part.lines as id, k (k)}{@const sentence = byId.get(id)}{#if sentence}<Row {sentence} {provider} sung={times.get(id) ?? 1} bare />{/if}{/each}{#if at.first}{@render adding({ into: 'part', id: at.part.id }, name)}{/if}{/if}</div>{/if}</section>{/snippet}

{#snippet waiting(kind: SongPartKind, at: number)}{@const name = kind === 'refrain' ? t('ui.song_refrain') : t('ui.song_strophe', { n: stropheAt(at) })}<section class="song__part{kind === 'refrain' ? ' song__part--refrain' : ''}" aria-label={name}><div class="song__head"><h3>{name}</h3></div>{#if isTyping({ into: 'new', kind, at })}<div class="song__edit"><textarea class="song__text" use:focused bind:value={text} disabled={s.busy} aria-label={t('ui.song_edit_part', { part: name })} rows={Math.max(3, text.split('\n').length + 1)} onkeydown={newKeys}></textarea><div class="song__edit-acts"><span></span><button class="btn sm" type="button" onclick={() => { typing = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy || !text.trim()} onclick={() => void finishNew()}>{t('ui.done')}</button></div></div>{:else}<div class="song__lines"><p class="small faint song__none">{t('ui.song_no_lines')}</p><button class="song__plus" type="button" onclick={() => startTyping({ into: 'new', kind, at })}>{t('ui.song_add_line')}</button></div>{/if}</section>{/snippet}

{#snippet gap(at: number, end: boolean)}{#if typing?.into === 'new' && typing.at === at}{@render waiting(typing.kind, at)}{/if}<div class={end ? 'song__more' : 'song__gap'}><button class="song__plus{end ? ' song__plus--part' : ''}" type="button" aria-label={end ? undefined : t('ui.song_insert_strophe', { n: at + 1 })} onclick={() => startTyping({ into: 'new', kind: 'strophe', at })}>{t('ui.song_add_strophe')}</button><button class="song__plus{end ? ' song__plus--part' : ''}" type="button" aria-label={end ? undefined : t('ui.song_insert_refrain', { n: at + 1 })} onclick={() => refrainAt(at)}>{t('ui.song_add_refrain')}</button></div>{/snippet}

<div class="song">{#if empty}{@render waiting('strophe', 0)}{@render waiting('refrain', 0)}{:else}{#each sung as at, place (place)}{#if place > 0}{@render gap(place, false)}{/if}{@render part(at, place)}{/each}{@render gap(sung.length, true)}{/if}</div>
