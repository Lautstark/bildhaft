<script lang="ts">
  /**
   * The slot picker's body. conventions.md §6.4.
   *
   * The search — the field, the grid, the minimum, the debounce, the
   * stale-answer guard, the roving arrows and the credit line — is
   * `@lautstark/bildquelle/svelte/SymbolSearch`. What is left here is everything
   * bildhaft's picker carries that a search does not: a picture of the user's
   * own and the square it is cut to, crossing out and mirroring, the caption
   * that gets printed, and what the Anybook pen says.
   *
   * **Laid out as the card (her pick „Karte", 2026-10-27).** The picture large
   * in the middle with its two buttons beside it — they change the picture, so
   * they sit with it — and the words under it, one width. The search is not
   * shown while there is a picture: pressing the picture folds it open under it,
   * an own picture is its last tile, and choosing is done, as it always was. The
   * crop takes the fold's place and everything else goes away while it is up.
   */
  import SymbolSearch, { type SearchAnswer } from '@lautstark/bildquelle/svelte/SymbolSearch';
  import { getProvider, type Candidate } from '@lautstark/bildquelle';
  import Crop from '@lautstark/design/svelte/Crop';
  import { symbolIdFor } from '../core/types.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import NegationCross from '../pieces/NegationCross.svelte';
  import type { Picking } from './slotPicker.svelte.ts';
  import AnyStift from './AnyStift.svelte';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Picking } = $props();

  /* Inside the fold, so it comes and goes with it. */
  let upload: HTMLInputElement | undefined = $state();
  /** While a square is being chosen, everything else on the sheet goes away:
      a live grid of symbols under an open crop is a press that throws the crop
      away without saying so. */
  let cropping = $derived(s.loaded !== null);

  let source = $derived(getProvider(s.provider));
  /** What the field shows now, or nothing for a field the „+" just made. */
  let shown = $derived(symbolIdFor(s.slot, s.provider));

  /* Once, as the sheet opens: it is a background read that fills the
     suggestions out. It no longer has to ask what is in the field — the
     component declines suggestions itself the moment anything has been
     searched, which is its state to know. */
  // svelte-ignore state_referenced_locally
  s.fillSuggestions();

  /*
   * METACOM ships parallel rendering folders holding identical file names, so a
   * search can answer several tiles that all say "ja" and differ only in
   * picture. When a label repeats, the tile also names the folder its rendering
   * came from. Display only - the candidate that is stored and chosen is
   * untouched.
   *
   * That the labels collide is the component's to notice and it says so with
   * `among`; what the disambiguator *is* is bildhaft's. §6.4 files this as a
   * convergence rather than a difference: vorlaut does the same thing in
   * `aria-label` where this does it in visible text — so the same string goes
   * to both, through `describe` and through the caption snippet.
   */
  const captionOf = (candidate: Candidate, among: boolean): string => {
    const folder = s.provider === 'metacom' && among ? s.folderOf(candidate.id) : '';
    return folder ? `${candidate.label} · ${folder}` : candidate.label;
  };

  /**
   * The line above the pictures, from the search the component is showing.
   *
   * It is drawn as the `lead` snippet, which is inside the results box, and not
   * as `between`: this line is about the tiles and belongs immediately above
   * them, where `between` is immediately below the field and has the three rows
   * that are true of the field whatever symbol ends up in it.
   *
   * `searching` is only true where the box has nothing to stand in for the
   * search — results stay up while the next ones are being fetched, so the line
   * goes on naming the answer that is actually on screen rather than blanking
   * under a hand that is still typing.
   */
  function statusFor(answer: SearchAnswer): string {
    if (s.cropFailed) return s.cropFailed;
    if (answer.suggested) return s.idleMessage();
    if (answer.searching) return t('ui.searching');
    const term = answer.searched;
    const n = answer.candidates.length;
    if (n === 0) return t('ui.no_hits_for', { term });
    return n === 1 ? t('ui.hits_for_one', { term }) : t('ui.hits_for', { n, term });
  }

  /*
   * Enter is Fertig. A <dialog> with no form in it has no default action, so
   * until now the key did nothing at all — and it is what a person reaches for
   * after typing a caption.
   *
   * Two things keep their own Enter, and the search field is no longer one of
   * them to arrange: it claims the key itself, with `preventDefault` and
   * `stopPropagation` on a real listener, so this handler never sees it. A
   * focused button is still the browser's to activate, and a crop in progress
   * still means "keep this square".
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
      s.finish(() => s.handlers.onClose?.());
    };
    dialog.addEventListener('keydown', enter);
    return () => dialog.removeEventListener('keydown', enter);
  });

  /* The square takes the keyboard as it opens, the way the file button had it. */
  $effect(() => { if (cropping) s.cropper?.focus(); });

  function chose(): void {
    const file = upload?.files?.[0];
    if (upload) upload.value = '';
    if (file) void s.beginCrop(file);
  }
</script>

<!--
  Her pick „Karte" (2026-10-27): the picture large in the middle, as on the
  card, the two things that change it beside it as small buttons, then the
  words. The search is not shown while there is a picture — it folds open
  under it when the picture is pressed, and choosing one is done, as before.
  A field with nothing chosen yet opens with it.
--><div class="picker__pic" hidden={cropping}><button type="button" class="word__pic picker__own-shown picker__tile{shown ? '' : ' picker__own-shown--empty'}" aria-expanded={s.searching} aria-label={t('ui.picker_change')} title={t('ui.picker_change')} onclick={() => { s.searching = !s.searching; }}>{#if shown}<SymbolPicture provider={s.provider} id={shown} alt={s.slot.ownImage ? t('ui.own_picture') : s.slot.sourceToken} mirrored={s.mirrored} />{#if s.negated}<NegationCross />{/if}{:else}<span class="picker__tile-ask" aria-hidden="true">?</span>{/if}</button>{#if s.handlers.onNegate || s.handlers.onMirror}{@const negate = s.handlers.onNegate}{@const mirror = s.handlers.onMirror}<span class="picker__tools">{#if negate}<button type="button" role="checkbox" class="picker__tool" aria-checked={s.negated} aria-label={t('ui.cross_out')} title={t('ui.cross_out')} onclick={() => { s.negated = !s.negated; negate(s.negated); }}>⊘</button>{/if}{#if mirror}<button type="button" role="checkbox" class="picker__tool" aria-checked={s.mirrored} aria-label={t('ui.mirror')} title={t('ui.mirror')} onclick={() => { s.mirrored = !s.mirrored; mirror(s.mirrored); }}>⇆</button>{/if}</span>{/if}</div><!--
  The search, folded open under the picture. conventions.md §6.4.

  The tiles carry no `aria-pressed` and the component draws none: these tiles do
  not come back. Pressing one closes the dialog with an answer, so an attribute
  announcing a state would be announcing one the control does not have. The mark
  on the stored choice is `picker__item--active`, which is a class either way.
  A picture of the user's own is the last tile — not one of the hits, so
  nothing that picks a hit can open the file chooser; the crop takes the
  fold's place.
-->{#if s.searching || cropping}<div class="picker__fold"><SymbolSearch
  class="picker__search"
  provider={source}
  words={{ field: t('ui.search_symbol'), placeholder: s.isNew ? t('ui.search_word') : t('ui.search_other_word') }}
  chosen={s.chosen}
  busy={cropping}
  suggestions={s.suggested}
  describe={captionOf}
  onpick={(candidate) => s.finish(() => s.handlers.onChoose(candidate))}
>{#snippet between()}<div class="picker__crop" hidden={!cropping}>{#if s.loaded}<Crop bind:this={s.cropper} loaded={s.loaded} label={t('ui.crop_title')} zoomLabel={t('ui.zoom_in')} /><!--
  No buttons of its own: Fertig keeps the square — so does Enter — and the ✕
  drops it, which is what all three mean everywhere else here.
--><p class="small muted" style="margin:8px 0 0">{t('ui.crop_hint')}</p>{/if}</div>{/snippet}{#snippet lead(answer)}<p class="small muted picker__status">{statusFor(answer)}</p>{/snippet}{#snippet trailing()}<span class="picker__own"><label class="picker__own-add">{t('ui.own_picture_choose')}<!--
  A file of the user's own. bildhaft keeps the bytes rather than a path, so
  moving or deleting the original afterwards changes nothing here.
--><input bind:this={upload} type="file" accept="image/*" hidden onchange={chose} /></label>{#if s.slot.ownImage && s.handlers.onClearOwnImage}{@const clear = s.handlers.onClearOwnImage}<button class="btn sm destructive" type="button" onclick={() => s.finish(clear)}>{t('ui.own_picture_remove')}</button>{/if}</span>{/snippet}{#snippet caption(candidate, among)}<span class="small">{captionOf(candidate, among)}</span>{/snippet}</SymbolSearch></div>{/if}<!--
  The words. The caption is a field of its own rather than a rewrite of the
  source word, so a correction stays remembered under the word that was typed;
  its placeholder is what would print without it, so clearing it is the reset.
  What the pen says under it, where the material prints Anybook codes.
-->{#if s.handlers.onLabel}<label class="picker__caption" hidden={cropping}><span class="small muted">{t('ui.text_for')}</span><input class="field" type="text" placeholder={s.slot.sourceToken || s.slot.concept || t('ui.text_for_new')} maxlength="60" value={s.caption} oninput={(event) => s.queueLabel(event.currentTarget.value)} onchange={() => s.flushLabel()} /></label>{/if}{#if s.handlers.anybook}<div class="picker__say" hidden={cropping}><AnyStift code={s.handlers.anybook} mode="field" /></div>{/if}
