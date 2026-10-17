<script lang="ts">
  /**
   * A Lied, top to bottom as it is sung.
   *
   * Every line is the row a Satzstreifen draws — same picker, same captions,
   * same drag inside the row — and each is drawn wherever it is sung. A line
   * sung ten times is drawn ten times and is one row: fixing it in one place
   * fixes it in all of them, and the row says how often it is sung so that
   * nobody is surprised by that.
   *
   * The Refrain is drawn open the first time and folded after that, so the
   * page stays the length of the song rather than five times the refrain.
   * Opened, it is the same rows again, not a copy.
   *
   * The song's shape — which lines, which parts, in what order — is changed as
   * text: the whole song goes back into the box at the top (SongComposer), is
   * edited there, and is sent again. Every line it already had keeps its row
   * and its symbols.
   */
  import type { ProviderId } from '../core/types.ts';
  import { sungParts, timesSung, type SungPart } from '../core/song.ts';
  import Row from './Row.svelte';
  import { currentSongText } from '../app/song.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let song = $derived(activeCollection()?.song ?? null);
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  let times = $derived(song ? timesSung(song) : new Map<string, number>());
  let sung = $derived(song ? sungParts(song) : []);

  let editing = $derived(s.songEditing !== null && s.songEditing === s.activeId);

  /* Which of the refrains after the first are folded open, by where they are
     sung. A place in the song rather than a part, because the part is the
     same in all of them and only the one that was clicked should open. */
  let unfolded = $state<number[]>([]);

  const label = (at: SungPart): string =>
    (at.kind === 'refrain' ? t('ui.song_refrain') : t('ui.song_strophe', { n: at.n }));

  /* The text goes up into the box at the top, where the song was pasted. */
  function edit(): void {
    s.songDraft = currentSongText();
    s.songEditing = s.activeId;
    unfolded = [];
  }
</script>

<div class="song">{#if song && !editing}<div class="song__bar"><button class="btn quiet" type="button" onclick={edit}>{t('ui.song_edit')}</button></div>{#each sung as at, place (place)}<section class="song__part{at.kind === 'refrain' ? ' song__part--refrain' : ''}" aria-label={label(at)}><h3 class="song__head">{label(at)}</h3><div class="song__lines">{#if at.kind === 'refrain' && !at.first && !unfolded.includes(place)}<button class="song__folded" type="button" onclick={() => { unfolded = [...unfolded, place]; }}>{t('ui.song_folded', { n: at.part.lines.length })}</button>{:else}{#each at.part.lines as id, k (k)}{@const sentence = byId.get(id)}{#if sentence}<Row {sentence} {provider} sung={times.get(id) ?? 1} />{/if}{/each}{/if}</div></section>{/each}{/if}</div>
