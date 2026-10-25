<script lang="ts">
  /**
   * The whole song into an empty Lied, on top of the page like every intake:
   * the box first, the head under it, the material's panel below. Once the
   * Lied has parts the box is gone and the parts take its words themselves —
   * which is why this stands apart from Song.svelte: the page lays it out,
   * not the material.
   */
  import TypingBox from './TypingBox.svelte';
  import { addToSong } from '../app/song.ts';
  import { inTurn } from '../app/inTurn.ts';
  import { s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let whole = $state('');
  const send = inTurn();
  /* Its parts read, its Refrain found — Song.svelte's sendWhole, moved here
     with the box it belongs to. */
  function sendWhole(): void {
    const raw = whole;
    if (!raw.trim()) return;
    whole = '';
    send(async () => {
      const left = await addToSong(raw);
      if (left) whole = left;
    });
  }
</script>

{#snippet pasteHint()}<span>{@html t('ui.composer_hint')} · {t('ui.song_paste_hint')}</span>{/snippet}

<TypingBox value={whole} busy={s.busy} placeholder={t('ui.song_paste_placeholder')} label={t('ui.song_paste_label')} action={t('ui.translate')} meta={pasteHint} maxHeight={480} focusOnMount onChange={(value) => { whole = value; }} onSubmit={sendWhole} />
