<script lang="ts">
  /**
   * A Lied's box, where every other template has its composer: at the top,
   * above the Sammlung's name — and it holds the song.
   *
   * Not a box that adds lines, as a Satzstreifen's does: a song is written
   * as a whole, and its shape — which parts, in what order — is its text.
   * So the box shows the song's text, folded to its first lines; pressed, it
   * opens tall to the whole song; left, it folds again and what was changed
   * is taken over. The arrow takes it over too. Enter is a new line here,
   * because a blank line is what ends a part; Escape drops what was typed.
   *
   * The song is read again from its whole text each time, so a line it
   * already had keeps its row and its symbols.
   */
  import TypingBox from './TypingBox.svelte';
  import { currentSongText, writeSong } from '../app/song.ts';
  import { activeCollection, followsDefault, provider, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  /* The two heights the box takes: about two lines folded, most of the
     window open. */
  const FOLDED_PX = 56;
  const openPx = (): number => Math.max(240, Math.round(window.innerHeight * 0.62));

  let song = $derived(activeCollection()?.song ?? null);
  /* What the song says now, written out — the box's text whenever it is not
     being edited. Read from the rows, so a line renamed elsewhere shows here. */
  let written = $derived.by(() => { void song; void s.sentences; return currentSongText(); });
  let open = $state(false);
  let draft = $state('');
  let waiting = $state(false);
  let ready = $derived(provider().isReady());
  let own = $derived(Boolean(activeCollection()) && !followsDefault());

  /* Another Sammlung is another song: whatever was open in the box closes. */
  $effect(() => { void s.activeId; open = false; draft = ''; });

  async function apply(): Promise<void> {
    const raw = draft;
    if (waiting || s.busy || !raw.trim() || raw.trim() === written.trim()) return;
    waiting = true;
    try {
      const left = await writeSong(raw);
      /* What could not be written stays in the box, open, to be sent again. */
      if (left) { draft = left; open = true; }
    } finally {
      waiting = false;
    }
  }

  function focus(): void {
    if (!open) draft = written;
    open = true;
  }
  /* Typing opens the box too, with what was typed: text can arrive without a
     focus first — pasted by a shortcut, put in by an assistive tool — and a
     folded box would have shown the song again over it. */

  function blur(): void {
    open = false;
    void apply();
  }

  function escape(): void {
    draft = written;
  }
</script>

{#snippet meta()}<span>{open ? t('ui.song_open_note') : song ? t('ui.song_folded_note') : t('ui.song_paste_note')}</span><span class="composer__provider"><span>{own ? t('ui.symbols_of_collection') : t('ui.symbols_default')}</span><b style="font-weight:600">{provider().name}{ready ? '' : ` (${t('ui.not_ready')})`}</b></span>{/snippet}

<div class="song__type{open ? ' song__type--open' : ''}"><TypingBox
  value={open ? draft : written}
  busy={waiting}
  placeholder={t('ui.song_paste_placeholder')}
  label={t('ui.song_paste_label')}
  action={t('ui.translate')}
  {meta}
  focusOnMount={!song}
  maxHeight={open ? openPx() : FOLDED_PX}
  enterSubmits={false}
  onFocus={focus}
  onBlur={blur}
  onEscape={escape}
  onChange={(value) => { draft = value; open = true; }}
  onSubmit={() => void apply()}
/></div>
