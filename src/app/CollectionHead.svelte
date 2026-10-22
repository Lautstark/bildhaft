<script lang="ts">
  /**
   * The work head: the Sammlung's name, how much is in it, Drucken, and the ⋯.
   * conventions.md §3.3 is the row; this is bildhaft's copy of it.
   *
   * Both halves of it are the package's now.
   *
   * The ⋯ is `@lautstark/design/svelte/Overflow`. It is this product's own
   * `src/ui/ActionMenu.svelte` — conventions.md §6.10 promoted that file, class
   * string and all — so the markup here is unchanged and the trigger still
   * carries its `dots` icon rather than the shared default `⋯`. What comes back
   * is the half the local copy never had: `fit()`, vorlaut's collision
   * handling, which flips the list upwards where there is more room above and
   * caps its height so a long menu stays inside the box it was opened in.
   * A copy that sits beside the thing it was copied into can only drift, and
   * this one already had.
   *
   * The name is `@lautstark/design/svelte/TitleField`, over the same
   * `@lautstark/design/rename` this file already used. §6.5 shaped that
   * component against this field by name: `oninput`, because the echo below is
   * a live redraw and not a write, and `caret`, because the ask-and-answer in
   * `asking.svelte.ts` is the one of the three mechanisms that does not couple
   * the controller to the field it is asking of.
   */
  import Overflow from '@lautstark/design/svelte/Overflow';
  import TitleField from '@lautstark/design/svelte/TitleField';
  import { renameCollection } from '../db/repo.ts';
  import Icon from '../pieces/Icon.svelte';
  import { activeCollection, holdsWords, kind, providerId, s } from './state.svelte.ts';
  import { symbolIdFor, titlePicture } from '../core/types.ts';
  import { pagesOf } from '../core/talk.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import { chooseTitlePicture } from './recipe.ts';
  import { answered, asking } from './asking.svelte.ts';
  import { confirmDeleteCollection, handleExport, openSourceSheet, setView } from './collections.ts';
  import { openWortschatzSheet } from './words.ts';
  import { paperOf } from './print.ts';
  import { t } from '../i18n/index.ts';

  /* Which Sammlung a pending rename is for, captured on the keystroke rather
     than read when the write runs. Switching blurs the field and so writes
     first, which makes the two the same in practice — but the debounce is the
     one path where they could differ, and the id is free to capture. */
  let renaming: string | null = null;

  /* The debounce, the write on the way out, the refusal to write a value that
     has not moved and the guard against a repaint typing over somebody are
     `@lautstark/design/rename`'s and always were. What the component takes
     over is the wiring the three products each bolted on separately: the
     binding, `refresh()` in place of an assignment, and the caret. */
  const write = (typed: string): Promise<void> | undefined =>
    renaming ? renameCollection(renaming, typed) : undefined;

  /* Where the caret is owed, as the `caret` prop's two questions.
     conventions.md §6.5 took this shape from here — an asker that names what
     it wants rather than the field it wants it in — so `asking.svelte.ts` is
     unchanged and only the reading of it moves. */
  const caret = { asked: () => asking() === 'collection-name', answered };

  /* The live echo, and only that: the name in the sidebar row and the top bar
     follow each keystroke. Writing it is design/rename's, on its own listener —
     which is why that package binds with addEventListener rather than taking
     the property, so the two can share one field, and why §6.5 makes `oninput`
     a prop instead of collapsing the field to one debounced write. */
  function echo(event: Event & { currentTarget: HTMLInputElement }): void {
    if (!s.activeId) return;
    renaming = s.activeId;
    const name = event.currentTarget.value;
    s.collections = s.collections.map((c) => (c.id === s.activeId ? { ...c, name } : c));
  }

  /* A title picture is a sentence of its own, and not an entry or a card. */
  let n = $derived(s.sentences.filter((sentence) => sentence.part !== 'titel').length);
  /* A Plauderbuch's questions stand on its pages and are not cut out: its
     cards are its Aussagen. */
  let sayings = $derived(pagesOf(activeCollection()?.talk).reduce((all, page) => all + page.sayings.length, 0));
  /* A Rezept's title picture, beside its name, until a Rezept has the title
     line the others have (TitleLine.svelte), where its symbols are chosen. */
  let pictured = $derived(kind() === 'rezept');
  let picture = $derived(pictured ? titlePicture(s.sentences) : null);
  let pictureId = $derived(picture ? symbolIdFor(picture, providerId()) : null);
  let count = $derived(kind() === 'rezept'
    ? (n === 1 ? t('ui.n_entries_one') : t('ui.n_entries', { n }))
    : kind() === 'plauderbuch'
    ? (sayings === 1 ? t('ui.n_cards_one') : t('ui.n_cards', { n: sayings }))
    : holdsWords()
    ? (n === 1 ? t('ui.n_cards_one') : t('ui.n_cards', { n }))
    : n === 1
      ? t('ui.n_rows_one')
      : t('ui.n_rows', { n }));


  /* „A5 hoch · 3 Seiten": the paper this Sammlung prints on, and how many
     pages it came to the last time its sheet was laid out, when that is
     known this session. */
  let paper = $derived.by(() => {
    const open = activeCollection();
    const print = open ? paperOf() : null;
    if (!open || !print) return '';
    const side = print.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait');
    const pages = s.pagesSeen[open.id];
    return `${print.paper.toUpperCase()} ${side.toLowerCase()}${pages ? ` · ${t(pages === 1 ? 'ui.n_page' : 'ui.n_pages', { n: pages })}` : ''}`;
  });
</script>

<div class="collection-head">{#if pictured}<!--
  The picture beside a Rezept's name: chosen here, in the picker
  every field has, and printed with the name when the name is printed.
--><button class="collection-head__pic{pictureId ? '' : ' collection-head__pic--empty'}" type="button" aria-label={pictureId ? t('ui.title_picture_change') : t('ui.title_picture_add')} title={pictureId ? t('ui.title_picture_change') : t('ui.title_picture_add')} onclick={() => void chooseTitlePicture()}>{#if pictureId}<SymbolPicture provider={providerId()} id={pictureId} alt={t('ui.title_picture')} mirrored={picture?.mirrored} />{:else}{t('ui.title_picture_empty')}{/if}</button>{/if}<TitleField value={activeCollection()?.name ?? ''} {write} oninput={echo} {caret} label={t('ui.collection_name')} placeholder={t('ui.collection_name')} /><span class="small faint" style="white-space:nowrap">{count}</span><!--
  The two views of a Sammlung: its material to work on, its sheet to print.
  Beside them, small, what the sheet came to the last time it was laid out —
  what the material means on paper, without switching to see it.
-->{#if n === 0 && (kind() === 'rezept' || kind() === 'lied' || kind() === 'plauderbuch' || kind() === 'tafel')}<!--
  A Rezept and a Lied draw their own empty parts, so the empty state's box
  would be a second „noch leer" over them. What it carried that they do not
  is the way back to the choice of template, said here, small.
--><span class="small faint collection-head__other">{t(`ui.template_${kind()}`)} · <button class="linklike" type="button" onclick={() => { s.choosing = s.activeId; }}>{t('ui.other_template')}</button></span>{/if}{#if n > 0}{#if paper}<button class="collection-head__paper small faint" type="button" title={t('ui.view_print')} onclick={() => setView('print')}>{paper}</button>{/if}<span class="segmented collection-head__view" role="group" aria-label={t('ui.view')}><button type="button" aria-pressed={s.view === 'edit'} onclick={() => setView('edit')}>{t('ui.view_edit')}</button><button type="button" aria-pressed={s.view === 'print'} onclick={() => setView('print')}>{t('ui.view_print')}</button></span>{/if}<!--
  §3.6's order: the export first, what this Sammlung is set to under it, the
  delete last. The middle item is not an act on the Sammlung and that is the
  point — the menu holds what a Sammlung *is* as well as what can be done to
  it, because both are answered by which Sammlung it sits beside.
--><Overflow label={t('ui.collection_actions')} build={(add) => {
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
}}><Icon name="dots" /></Overflow></div>
