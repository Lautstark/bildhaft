<script lang="ts">
  /**
   * The title of the open material, as the heading of its rows: its symbols,
   * a „+" for one more, and its words — the first thing on the paper, so the
   * first thing under the box.
   *
   * No label and no explanation. While it follows the name it stands pale,
   * the name as its placeholder; typed words of its own stand in full, with a
   * way back to the name beside them. Whether and where it prints is the
   * print view's.
   */
  import SymbolPicture from '../pieces/Symbol.svelte';
  import { activeCollection, providerId, s } from '../app/state.svelte.ts';
  import { contentOf, symbolIdFor, titlePictures } from '../core/types.ts';
  import { openPicker } from '../app/editing.ts';
  import { addTitleSymbol, setTitle } from '../app/title.ts';
  import { t } from '../i18n/index.ts';

  let open = $derived(activeCollection());
  let sentence = $derived(s.sentences.find((one) => one.part === 'titel') ?? null);
  /* Every field but one a picker has just made and not yet filled. */
  let symbols = $derived(titlePictures(s.sentences).map((slot) => ({ slot, id: symbolIdFor(slot, providerId()) })));
  let own = $derived(Boolean(open?.title));
  /* Not before there is something to head: an empty material is its box. */
  let shown = $derived(contentOf(s.sentences).length > 0 || own || titlePictures(s.sentences).length > 0);
</script>

{#if open && shown}<div class="title-line">{#each symbols as { slot, id } (slot.id)}<button class="title-line__pic" type="button" aria-label={t('ui.title_symbol')} title={t('ui.title_symbol')} onclick={() => sentence && openPicker(sentence.id, slot.id)}><SymbolPicture provider={providerId()} {id} alt="" mirrored={slot.mirrored} /></button>{/each}<button class="title-line__add" type="button" aria-label={t('ui.title_add_symbol')} title={t('ui.title_add_symbol')} onclick={() => void addTitleSymbol()}>+</button><!--
  The words, written where they stand. The name is the placeholder, which is
  what an empty field means here: the title is the name.
--><input class="title-line__text" type="text" value={open.title ?? ''} placeholder={open.name} aria-label={t('ui.title_text')} title={t('ui.title_text')} onchange={(event) => void setTitle(event.currentTarget.value)} onkeydown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{#if own}<button class="title-line__reset" type="button" aria-label={t('ui.title_back_to_name')} title={t('ui.title_back_to_name')} onclick={() => void setTitle('')}>×</button>{/if}</div>{/if}
