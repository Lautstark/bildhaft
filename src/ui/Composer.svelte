<script lang="ts">
  /**
   * Typing a sentence, and which symbol source the rows under it are drawn from.
   *
   * The source is not chosen here. What sits under the box is the sentence that
   * says which one is in force and the way through to changing it — the same
   * shape mitreden's composer took when its voice moved onto the Sammlung.
   *
   * *Which* source that is stopped being one answer when it moved onto the
   * Sammlung. In a Sammlung it is that Sammlung's, when it has one; otherwise it
   * is the default the Sammlung follows. The line says which of the two it read,
   * because both are true statements about a symbol source and only one of them
   * is true here — see the note on the provider line below.
   */
  import TypingBox from './TypingBox.svelte';
  import { activeCollection, followsDefault, holdsWords, provider, s } from '../app/state.svelte.ts';
  import { handleReuse, handleSubmit, scheduleReuseLookup } from '../app/composing.ts';
  import { t } from '../i18n/index.ts';

  /* The same box says two things, because it does two things: a sentence is
     translated into a row of symbols, a word becomes one card. Enter and
     Shift+Enter mean the same in both, which is why only the wording moves. */
  let words = $derived(holdsWords());
  let ready = $derived(provider().isReady());
  /**
   * Which source the rows are drawn from, in the two facts that decide it: its
   * name, and *whose* answer that is.
   *
   * The second fact is what the line was missing. It was right before because
   * there was one answer; there are two now — this Sammlung's own, or the
   * default it follows — and a line naming a source without saying which of the
   * two it read is a line that is right by luck.
   *
   * That second fact used to do double duty, as the caption that made one
   * „Ändern" button leading to two different places honest. The button is gone
   * and the fact stays, because it was always the more useful half: it answers
   * "which source is this" without anybody pressing anything.
   */
  let own = $derived(Boolean(activeCollection()) && !followsDefault());
</script>

{#snippet meta()}<span>{@html t(words ? 'ui.add_words_hint' : 'ui.composer_hint')}</span><!--
  A statement, not a control. It carried an „Ändern" button until 2026-08-29
  that led to this Sammlung's sheet or to the settings card depending on where
  the next sentence would land, and the caption beside it was what made that
  honest. Each answer has one door now: a Sammlung's is its ⋯, the default is
  the settings card.
--><span class="composer__provider"><span>{own ? t('ui.symbols_of_collection') : t('ui.symbols_default')}</span><b style="font-weight:600">{provider().name}{ready ? '' : ` (${t('ui.not_ready')})`}</b></span>{/snippet}

{#snippet after()}{#if s.reuse}<div class="composer__reuse"><span style="flex:1">{t('ui.already_translated')}</span><button class="btn sm" type="button" onclick={() => void handleReuse()}>{t('ui.reuse')}</button></div>{/if}{/snippet}

<TypingBox
  value={s.draft}
  busy={s.busy}
  placeholder={t(words ? 'ui.add_words_placeholder' : 'ui.composer_placeholder')}
  label={t(words ? 'ui.add_words_label' : 'ui.composer_label')}
  action={t('ui.translate')}
  {meta}
  {after}
  focusOnMount
  onChange={(value) => { s.draft = value; scheduleReuseLookup(); }}
  onSubmit={() => void handleSubmit()}
/>
