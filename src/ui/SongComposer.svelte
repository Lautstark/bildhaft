<script lang="ts">
  /**
   * A Lied's box, where every other template has its composer — and the same
   * box: it adds, and is empty again after Enter.
   *
   * It used to hold the song's whole text, edited in place and taken over on
   * leaving, which made it the one box in bildhaft that kept what was typed
   * and changed what was below it. Now the song is changed where it stands:
   * a part's own „+ Zeile" and „✎ Text", „+ Strophe" and „+ Refrain" under it.
   *
   * What comes here lands at the end: into the last Strophe, or — pasted with
   * blank lines between its parts — as parts sung after the rest. Into an
   * empty Lied a pasted song is read whole, its Refrain found, as before.
   */
  import TypingBox from './TypingBox.svelte';
  import { addToSong } from '../app/song.ts';
  import { activeCollection, followsDefault, provider, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let draft = $state('');
  let ready = $derived(provider().isReady());
  let own = $derived(Boolean(activeCollection()) && !followsDefault());

  /* Another Sammlung is another song: what was typed for this one stays here. */
  $effect(() => { void s.activeId; draft = ''; });

  async function submit(): Promise<void> {
    const raw = draft;
    if (!raw.trim() || s.busy) return;
    draft = '';
    const left = await addToSong(raw);
    if (left) draft = left;
  }
</script>

{#snippet meta()}<span>{@html t('ui.composer_hint')}</span><span class="composer__provider"><span>{own ? t('ui.symbols_of_collection') : t('ui.symbols_default')}</span><b style="font-weight:600">{provider().name}{ready ? '' : ` (${t('ui.not_ready')})`}</b></span>{/snippet}

<TypingBox
  value={draft}
  busy={s.busy}
  placeholder={t('ui.song_add_placeholder')}
  label={t('ui.song_add_label')}
  action={t('ui.translate')}
  {meta}
  focusOnMount
  onChange={(value) => { draft = value; }}
  onSubmit={() => void submit()}
/>
