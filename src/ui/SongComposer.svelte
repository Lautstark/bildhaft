<script lang="ts">
  /**
   * A Lied's box, where every other template has its composer: at the top,
   * above the Sammlung's name. The song is pasted here whole, and comes back
   * here whole from „Text bearbeiten" to be changed and sent again.
   *
   * Only there while it is needed — before anything is pasted, and while the
   * text is open for editing. A Lied is not added to line by line the way a
   * Satzstreifen is, so a box always open above a finished song would be a
   * box that does nothing but invite a second song into the first.
   */
  import TypingBox from './TypingBox.svelte';
  import { writeSong } from '../app/song.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let song = $derived(activeCollection()?.song ?? null);
  let editing = $derived(s.songEditing !== null && s.songEditing === s.activeId);
  let waiting = $state(false);

  async function submit(): Promise<void> {
    const raw = s.songDraft;
    if (!raw.trim() || s.busy) return;
    waiting = true;
    try {
      const left = await writeSong(raw);
      s.songDraft = left;
      if (!left) s.songEditing = null;
    } finally {
      waiting = false;
    }
  }

  function cancel(): void {
    s.songEditing = null;
    s.songDraft = '';
  }
</script>

{#snippet meta()}<span>{t('ui.song_paste_note')}</span>{#if editing && song}<button class="linklike" type="button" onclick={cancel}>{t('ui.cancel')}</button>{/if}{/snippet}

{#if !song || editing}<div class="song__type"><TypingBox
  value={s.songDraft}
  busy={waiting}
  placeholder={t('ui.song_paste_placeholder')}
  label={t('ui.song_paste_label')}
  action={t('ui.translate')}
  {meta}
  focusOnMount
  onChange={(value) => { s.songDraft = value; }}
  onSubmit={() => void submit()}
/></div>{/if}
