<script lang="ts">
  /**
   * A Plauderbuch's box, where every other template has its composer: at
   * the top, adding Aussagen to the page outlined below. No switch and no
   * word about where they go — the outline says it.
   */
  import TypingBox from './TypingBox.svelte';
  import { addSayings } from '../app/talk.ts';
  import { followsDefault, activeCollection, provider, providerReady, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let draft = $state('');
  let waiting = $state(false);
  let ready = $derived(providerReady());
  let own = $derived(Boolean(activeCollection()) && !followsDefault());

  async function submit(): Promise<void> {
    const raw = draft;
    if (!raw.trim() || s.busy) return;
    draft = '';
    waiting = true;
    try {
      const left = await addSayings(raw);
      if (left) draft = draft ? `${left}\n${draft}` : left;
    } finally {
      waiting = false;
    }
  }
</script>

{#snippet meta()}<span></span><span class="composer__provider"><span>{own ? t('ui.symbols_of_collection') : t('ui.symbols_default')}</span><b style="font-weight:600">{provider().name}{ready ? '' : ` (${t('ui.not_ready')})`}</b></span>{/snippet}

<TypingBox
  value={draft}
  busy={waiting}
  placeholder={t('ui.talk_saying_placeholder')}
  label={t('ui.talk_saying_label')}
  action={t('ui.translate')}
  {meta}
  focusOnMount
  onChange={(value) => { draft = value; }}
  onSubmit={() => void submit()}
/>
