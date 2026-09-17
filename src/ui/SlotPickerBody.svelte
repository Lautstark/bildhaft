<script lang="ts">
  import TileGrid from '@lautstark/design/svelte/TileGrid';
  import Tile from '@lautstark/design/svelte/Tile';
  import { ownImageId } from '../core/types.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import Crop from './Crop.svelte';
  import type { Picking } from './slotPicker.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Picking } = $props();

  let search: HTMLInputElement;
  let upload: HTMLInputElement;
  /** While a square is being chosen, everything else on the sheet goes away:
      a live grid of symbols under an open crop is a press that throws the crop
      away without saying so. */
  let cropping = $derived(s.loaded !== null);

  /* Once, as the sheet opens: it is a background read that fills the
     suggestions out, and it declines if anything has been searched since. */
  // svelte-ignore state_referenced_locally
  s.fillSuggestions(() => search?.value ?? '');

  /*
   * METACOM ships parallel rendering folders holding identical file names,
   * so a search can answer several tiles that all say "ja" and differ only
   * in picture. When a label repeats, the tile also names the folder its
   * rendering came from. Display only - the candidate that is stored and
   * chosen is untouched.
   */
  let twins = $derived.by(() => {
    const seen = new Map<string, boolean>();
    for (const candidate of s.shown) seen.set(candidate.label, seen.has(candidate.label));
    return seen;
  });

  const captionOf = (label: string, id: string): string => {
    const folder = s.provider === 'metacom' && twins.get(label) ? s.folderOf(id) : '';
    return folder ? `${label} · ${folder}` : label;
  };

  /*
   * Enter is Fertig. A <dialog> with no form in it has no default action, so
   * until now the key did nothing at all — and it is what a person reaches for
   * after typing a caption.
   *
   * Two things keep their own Enter. A focused button is the browser's to
   * activate, and the search field means "look for this now" rather than "I am
   * done" — closing the dialog there would throw away the reason it was open.
   */
  $effect(() => {
    const dialog = s.handle?.dialog;
    if (!dialog) return;
    const enter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a')) return;
      event.preventDefault();
      // While a square is being chosen, Fertig is that square. Without this the
      // dialog's Enter settled the field on whatever it had before, which from
      // where somebody is sitting is the crop being thrown away by the key that
      // everywhere else in this dialog means "yes".
      if (s.loaded) { s.keepSquare(); return; }
      if (target === search) s.onQuery(search.value, true);
      else s.finish(() => s.handlers.onClose());
    };
    dialog.addEventListener('keydown', enter);
    return () => dialog.removeEventListener('keydown', enter);
  });

  /* The square takes the keyboard as it opens, the way the file button had it. */
  $effect(() => { if (cropping) s.cropper?.focus(); });

  function chose(): void {
    const file = upload.files?.[0];
    upload.value = '';
    if (file) void s.beginCrop(file);
  }
</script>

<input bind:this={search} class="field" type="search" aria-label={t('ui.search_symbol')} placeholder={s.isNew ? t('ui.search_word') : t('ui.search_other_word')} hidden={cropping} oninput={() => s.onQuery(search.value)} /><!--
  The picture the field is actually showing.

  It was the one thing this dialog would not show. Nothing here is marked while
  an own picture is up — the suggestions below are what the slot would fall back
  to, not what it holds — so opening a field that had a photograph in it
  presented a search for a word and no photograph anywhere, and read as having
  lost it. It is shown where the buttons that change it are, because "keep,
  replace, remove" is one decision and needs the picture in front of it.
--><div class="picker__own" hidden={cropping}>{#if s.slot.ownImage}<span class="slot__img picker__own-shown"><SymbolPicture provider={s.provider} id={ownImageId(s.slot.ownImage)} alt={t('ui.own_picture')} /></span>{/if}<label class="btn sm" style="cursor:pointer">{t('ui.own_picture_choose')}<!--
  A file of the user's own. bildhaft keeps the bytes rather than a path, so
  moving or deleting the original afterwards changes nothing here.
--><input bind:this={upload} type="file" accept="image/*" hidden onchange={chose} /></label>{#if s.slot.ownImage}<button class="btn sm destructive" type="button" onclick={() => s.finish(() => s.handlers.onClearOwnImage())}>{t('ui.own_picture_remove')}</button>{/if}</div><!--
  The words that get printed. A field of its own rather than a rewrite of the
  source word, so a correction stays remembered under the word that was typed.
  The placeholder is what would print without it, which is what makes an empty
  field readable as "unchanged" — and clearing it is therefore the reset.
-->{#if !s.isNew}<label class="picker__caption" hidden={cropping}><span class="small muted">{t('ui.text_for')}</span><input class="field" type="text" placeholder={s.slot.sourceToken || s.slot.concept} maxlength="60" value={s.caption} oninput={(event) => s.queueLabel(event.currentTarget.value)} onchange={() => s.flushLabel()} /></label><!--
  Negation is a property of the field, not a different symbol, so it does not
  settle the dialog the way picking one does: cross it out, see it, carry on.
  Hidden for a field that has nothing in it yet — there is nothing to cross.
--><div class="picker__negate" hidden={cropping}><label class="opt__check"><input type="checkbox" checked={s.negated} onchange={(event) => { s.negated = event.currentTarget.checked; s.handlers.onNegate(s.negated); }} />{t('ui.cross_out')}</label></div>{/if}<div class="picker__crop" hidden={!cropping}>{#if s.loaded}<Crop bind:this={s.cropper} loaded={s.loaded} type={s.loadedType} /><!--
  No buttons of its own, and it had two. Both went the same way and for the same
  reason: this dialog already has a footer, the footer already says what it
  does, and a control repeating that an inch higher is a question about which of
  them is the real one rather than a choice. Fertig keeps the square — so does
  Enter — and the ✕ drops it, which is what all three mean everywhere else here.
--><p class="small muted" style="margin:8px 0 0">{t('ui.crop_hint')}</p>{/if}</div><p class="small muted" style="margin:12px 0 0" hidden={cropping}>{s.status}</p><!--
  The suggestions, as the shared grid. conventions.md §6.4.

  No `toggle`, and therefore no `aria-pressed`: these tiles do not come back.
  Pressing one closes the dialog with an answer, so an attribute announcing a
  state would be announcing one the control does not have — wochenwerk's tiles
  toggle and carry it, and that is the whole reason it is a prop. The mark on
  the stored choice is `active`, which is a class either way.

  `min` is bildhaft's 102px, because a tile here holds an 82px picture; the
  margin above the grid is the page's and stays in app.css.
--><TileGrid class="picker__grid--under" min="102px" hidden={cropping}>{#each s.shown as candidate (candidate.id)}{@const caption = captionOf(candidate.label, candidate.id)}<Tile label={caption} active={candidate.id === s.chosen} onclick={() => s.finish(() => s.handlers.onChoose(candidate))}><span class="slot__img"><SymbolPicture provider={s.provider} id={candidate.id} alt={candidate.label} /></span></Tile>{/each}</TileGrid>{#if !s.isNew}<p class="small faint" style="margin-top:14px;margin-bottom:0" hidden={cropping}>{t('ui.choice_remembered', { word: s.slot.sourceToken })}</p>{/if}
