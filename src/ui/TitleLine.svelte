<script lang="ts">
  /**
   * The title of the open material, as the heading of its rows: its symbols,
   * a „+" for one more, and its words — the first thing on the paper, so the
   * head of the material's panel. Emptied, it follows the name again; there
   * is no × because deleting the words says the same thing.
   *
   * No label and no explanation. While it follows the name it stands pale,
   * the name as its placeholder; typed words of its own stand in full, with a
   * way back to the name beside them. Where it prints is the print view's;
   * whether it does decides whether it stands here at all (2026-10-28, her
   * call): what is only for the paper shows only while it is printed.
   */
  import SymbolLine from './SymbolLine.svelte';
  import { activeCollection, providerId, s } from '../app/state.svelte.ts';
  import { contentOf, titlePictures } from '../core/types.ts';
  import { openPicker } from '../app/editing.ts';
  import { addTitleSymbol, setTitle } from '../app/title.ts';
  import { t } from '../i18n/index.ts';
  import AnyStift from './AnyStift.svelte';
  import { titleCode } from './anybookEdit.ts';
  import { materialPrint } from '../app/print.ts';

  let open = $derived(activeCollection());
  let sentence = $derived(s.sentences.find((one) => one.part === 'titel') ?? null);
  let own = $derived(Boolean(open?.title));
  /* Not before there is something to head: an empty material is its box. */
  let printed = $derived(materialPrint()?.settings.showCollectionTitle !== false);
  let shown = $derived(printed && (contentOf(s.sentences).length > 0 || own || titlePictures(s.sentences).length > 0));
</script>

<!-- The words' placeholder is the name, which is what an empty field means here: the title is the name. -->
{#if open && shown}<SymbolLine pictures={titlePictures(s.sentences)} provider={providerId()} value={open.title ?? ''} placeholder={open.name} textLabel={t('ui.title_text')} pictureLabel={t('ui.title_symbol')} addLabel={t('ui.title_add_symbol')} onPick={(slot) => { if (sentence) openPicker(sentence.id, slot.id); }} onAdd={() => void addTitleSymbol()} onText={(text) => void setTitle(text)}>{#snippet trail()}{@const code = titleCode()}{#if code}<AnyStift {code} mode="line" />{/if}{/snippet}</SymbolLine>{/if}
