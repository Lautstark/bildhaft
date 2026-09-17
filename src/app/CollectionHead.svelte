<script lang="ts">
  /**
   * The work head: the Sammlung's name, how much is in it, Drucken, and the ⋯.
   * conventions.md §3.3 is the row; this is bildhaft's copy of it.
   */
  import { renameField, type RenameField } from '@lautstark/design/rename';
  import { renameCollection } from '../db/repo.ts';
  import ActionMenu from '../ui/ActionMenu.svelte';
  import { activeCollection, holdsWords, s } from './state.svelte.ts';
  import { answered, asking } from './asking.svelte.ts';
  import { confirmDeleteCollection, handleExport, openSourceSheet } from './collections.ts';
  import { openWortschatzSheet } from './words.ts';
  import { openPrint } from './print.ts';
  import { t } from '../i18n/index.ts';

  let titleInput: HTMLInputElement;

  /* Which Sammlung a pending rename is for, captured on the keystroke rather
     than read when the write runs. Switching blurs the field and so writes
     first, which makes the two the same in practice — but the debounce is the
     one path where they could differ, and the id is free to capture. */
  let renaming: string | null = null;

  /* Debounced while typing, written on blur and on Enter, and never written
     when the value has not moved — which this copy did on every visit to the
     field, because its blur flushed unconditionally. */
  let field: RenameField | undefined;
  $effect(() => {
    field = renameField(titleInput, (typed) => {
      if (!renaming) return undefined;
      return renameCollection(renaming, typed);
    });
    const made = field;
    return () => made.stop();
  });

  /* Through refresh() rather than by assigning. The value comparison this used
     to be is not the same guard: it holds only because the input handler below
     echoes each keystroke into `collections` first, so a render caused by
     anything else — a store refresh landing mid-word — would compare against
     the stored name and put it back over what is being typed. refresh()
     declines on focus and on a pending keystroke instead. */
  $effect(() => {
    const name = activeCollection()?.name ?? '';
    field?.refresh(name);
  });

  /* Straight into the name, selected: the first keystroke replaces the date it
     was given. conventions.md §1.5, and the selecting is the half of it that
     was missing here — the name was invented and then left as a chore to
     delete, which is the difference between a suggestion and a default.
     An effect, so it runs after the paint that puts the new name in the field. */
  $effect(() => {
    if (asking() !== 'collection-name') return;
    titleInput.focus();
    titleInput.select();
    answered();
  });

  /* The live echo, and only that: the name in the sidebar row and the top bar
     follow each keystroke. Writing it is design/rename's, on its own listener —
     which is why that package binds with addEventListener rather than taking
     the property, so the two can share one field. */
  function echo(): void {
    if (!s.activeId) return;
    renaming = s.activeId;
    const name = titleInput.value;
    s.collections = s.collections.map((c) => (c.id === s.activeId ? { ...c, name } : c));
  }

  let n = $derived(s.sentences.length);
  let count = $derived(holdsWords()
    ? (n === 1 ? t('ui.n_cards_one') : t('ui.n_cards', { n }))
    : n === 1
      ? t('ui.n_rows_one')
      : t('ui.n_rows', { n }));
</script>

<div class="collection-head"><input bind:this={titleInput} class="title-input" aria-label={t('ui.collection_name')} placeholder={t('ui.collection_name')} oninput={echo} /><span class="small faint" style="white-space:nowrap">{count}</span><button class="btn quiet sm" type="button" disabled={n === 0} onclick={() => openPrint(s.sentences.map((x) => x.id))}>{t('ui.print')}</button><!--
  §3.6's order: the export first, what this Sammlung is set to under it, the
  delete last. The middle item is not an act on the Sammlung and that is the
  point — the menu holds what a Sammlung *is* as well as what can be done to
  it, because both are answered by which Sammlung it sits beside.
--><ActionMenu label={t('ui.collection_actions')} build={(add) => {
  /* First, because it is the one thing in here that puts something *in*;
     the rest act on what is already there or on what the Sammlung is.
     And absent rather than greyed while the Wortschatz is empty — the same
     answer „+ Neuer Tag" gets in the sidebar, and here it has a second
     reason: a disabled item in the first position is one the arrow keys
     have to step over on the way in, which e2e/menu.spec.ts holds the
     menu to. Nothing to pour is nothing to offer. */
  if (s.wordCount > 0) add(t('ui.add_wortschatz'), () => void openWortschatzSheet());
  add(t('ui.export_collection'), () => void handleExport(), { disabled: s.sentences.length === 0 });
  add(t('ui.symbol_source_menu'), () => openSourceSheet());
  add(t('ui.delete_collection'), () => void confirmDeleteCollection(), { danger: true });
}} /></div>
