<script lang="ts">
  /**
   * The slot picker's body. conventions.md §6.4.
   *
   * The search — the field, the grid, the minimum, the debounce, the
   * stale-answer guard, the roving arrows and the credit line — is
   * `@lautstark/bildquelle/svelte/SymbolSearch`. What is left here is everything
   * bildhaft's picker carries that a search does not: a picture of the user's
   * own and the square it is cut to, the caption that gets printed, the negation
   * checkbox, and the line about the choice being remembered.
   *
   * **The three rows sit between the field and the grid, which is where they
   * have always sat.** Adopting the component moved them above the field: it is
   * the field *and* the grid in one block — `busy` suppresses both, which is the
   * whole reason it is a prop rather than a wrapper — so anything of ours had to
   * go above the block or below it, and above put the search field fourth in a
   * dialog somebody opened in order to search. That was reported rather than
   * lived with, and §6 answers it: if a component cannot serve one consumer,
   * change the component. bildquelle v2.4.0's `between` snippet is that change —
   * drawn after the field and before the results box, in neither of them — and
   * the three rows go in it. app.css's sentence about the negation, "below the
   * own-image row and above the suggestions", is true again as written.
   */
  import SymbolSearch, { type SearchAnswer } from '@lautstark/bildquelle/svelte/SymbolSearch';
  import { getProvider, type Candidate } from '@lautstark/bildquelle';
  import Crop from '@lautstark/design/svelte/Crop';
  import { symbolIdFor } from '../core/types.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import NegationCross from '../pieces/NegationCross.svelte';
  import type { Picking } from './slotPicker.svelte.ts';
  import AnyStift from './AnyStift.svelte';
  import { writeAnybook } from './anybookEdit.ts';
  import { materialPrint } from '../app/print.ts';

  /** Whether the field's code is taken off, as the material says now. */
  const anyOff = (key: string): boolean => materialPrint()?.settings.anybookOff?.includes(key) ?? false;
  import { t } from '../i18n/index.ts';

  let { s }: { s: Picking } = $props();

  let upload: HTMLInputElement;
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
    const file = upload.files?.[0];
    upload.value = '';
    if (file) void s.beginCrop(file);
  }
</script>

<!--
  The search, and the pictures it answers with. conventions.md §6.4.

  The tiles carry no `aria-pressed` and the component draws none: these tiles do
  not come back. Pressing one closes the dialog with an answer, so an attribute
  announcing a state would be announcing one the control does not have. The mark
  on the stored choice is `picker__item--active`, which is a class either way.

  The suggestions are not a block above the grid — they are the `suggestions`
  prop and go into the same results list, declined by the component itself the
  moment a word has been searched.
--><SymbolSearch
  class="picker__search"
  provider={source}
  words={{ field: t('ui.search_symbol'), placeholder: s.isNew ? t('ui.search_word') : t('ui.search_other_word') }}
  chosen={s.chosen}
  busy={cropping}
  suggestions={s.suggested}
  describe={captionOf}
  onpick={(candidate) => s.finish(() => s.handlers.onChoose(candidate))}
><!--
  Everything between the field and the pictures, in `between` — after the one,
  before the other, inside neither. The picture the field shows with the
  buttons that change it, and the crop that replaces them; the words and the
  rest went under the pictures (her pick „D").

  It takes no argument. `between` is handed the answer the way every snippet
  here is, and nothing in it is a function of that answer: an own picture is a
  property of the slot, the same whether the grid below shows four hits or none.
-->{#snippet between()}<!--
  The picture the field is actually showing.

  It was the one thing this dialog would not show. Nothing here is marked while
  an own picture is up — the suggestions below are what the slot would fall back
  to, not what it holds — so opening a field that had a photograph in it
  presented a search for a word and no photograph anywhere, and read as having
  lost it. It is shown where the buttons that change it are, because "keep,
  replace, remove" is one decision and needs the picture in front of it.

  The same square for a symbol, and an empty one for a field the „+" just
  made, so the dialog looks the same wherever it opens. It is drawn with the
  cross and the mirror as they are ticked below, which is how a tick is seen
  before the dialog closes.
--><div class="picker__own" hidden={cropping}><span class="word__pic picker__own-shown{shown ? '' : ' picker__own-shown--empty'}">{#if shown}<SymbolPicture provider={s.provider} id={shown} alt={s.slot.ownImage ? t('ui.own_picture') : s.slot.sourceToken} mirrored={s.mirrored} />{#if s.negated}<NegationCross />{/if}{/if}</span><label class="btn sm" style="cursor:pointer">{t('ui.own_picture_choose')}<!--
  A file of the user's own. bildhaft keeps the bytes rather than a path, so
  moving or deleting the original afterwards changes nothing here.
--><input bind:this={upload} type="file" accept="image/*" hidden onchange={chose} /></label>{#if s.slot.ownImage && s.handlers.onClearOwnImage}{@const clear = s.handlers.onClearOwnImage}<button class="btn sm destructive" type="button" onclick={() => s.finish(clear)}>{t('ui.own_picture_remove')}</button>{/if}</div><!--
--><div class="picker__crop" hidden={!cropping}>{#if s.loaded}<Crop bind:this={s.cropper} loaded={s.loaded} label={t('ui.crop_title')} zoomLabel={t('ui.zoom_in')} /><!--
  No buttons of its own, and it had two. Both went the same way and for the same
  reason: this dialog already has a footer, the footer already says what it
  does, and a control repeating that an inch higher is a question about which of
  them is the real one rather than a choice. Fertig keeps the square — so does
  Enter — and the ✕ drops it, which is what all three mean everywhere else here.
--><p class="small muted" style="margin:8px 0 0">{t('ui.crop_hint')}</p>{/if}</div>{/snippet}{#snippet lead(answer)}<p class="small muted picker__status">{statusFor(answer)}</p>{/snippet}{#snippet caption(candidate, among)}<span class="small">{captionOf(candidate, among)}</span>{/snippet}</SymbolSearch><!--
  What is on the card and what the pen says, under the pictures (her pick
  „D", 2026-10-27): the pictures are what the dialog is opened for, the words
  are what is left to set once one is chosen. Side by side where the material
  prints Anybook codes, the caption alone where it does not.

  The caption: a field of its own rather than a rewrite of the source word, so
  a correction stays remembered under the word that was typed. The
  placeholder is what would print without it, which is what makes an empty
  field readable as "unchanged" — and clearing it is therefore the reset.
-->{#if s.handlers.onLabel || s.handlers.anybook}<div class="picker__card{s.handlers.onLabel && s.handlers.anybook ? ' picker__card--two' : ''}" hidden={cropping}>{#if s.handlers.onLabel}<label class="picker__caption"><span class="small muted">{t('ui.text_for')}</span><input class="field" type="text" placeholder={s.slot.sourceToken || s.slot.concept || t('ui.text_for_new')} maxlength="60" value={s.caption} oninput={(event) => s.queueLabel(event.currentTarget.value)} onchange={() => s.flushLabel()} /></label>{/if}{#if s.handlers.anybook}<AnyStift code={s.handlers.anybook} mode="field" />{/if}</div>{/if}<!--
  The rest, folded under „Mehr …": crossing out and mirroring are properties
  of the field, not a different symbol, so they do not settle the dialog —
  tick, see it, carry on. Taking the field's code off sits with them. Open
  when one of them is already on, so nothing set is out of sight. A place
  that can do none of it passes no handler, and the line is not drawn.
-->{#if s.handlers.onNegate || s.handlers.onMirror || s.handlers.anybook}{@const negate = s.handlers.onNegate}{@const mirror = s.handlers.onMirror}{@const code = s.handlers.anybook}<details class="picker__more" hidden={cropping} open={s.negated || s.mirrored || (code ? anyOff(code.key) : false)}><summary class="small">{t('ui.picker_more')}</summary><div class="picker__negate">{#if negate}<label class="opt__check"><input type="checkbox" checked={s.negated} onchange={(event) => { s.negated = event.currentTarget.checked; negate(s.negated); }} />{t('ui.cross_out')}</label>{/if}{#if mirror}<label class="opt__check"><input type="checkbox" checked={s.mirrored} onchange={(event) => { s.mirrored = event.currentTarget.checked; mirror(s.mirrored); }} />{t('ui.mirror')}</label>{/if}{#if code}{@const gone = anyOff(code.key)}<button class="btn sm{gone ? '' : ' destructive'}" type="button" onclick={() => writeAnybook(code.key, materialPrint()?.settings.anybookSay?.[code.key] ?? null, !gone, code.standing)}>{gone ? t('ui.anybook_back') : t('ui.anybook_remove')}</button>{/if}</div></details>{/if}{#if !s.isNew}<p class="small faint" style="margin-top:14px;margin-bottom:0" hidden={cropping}>{t('ui.choice_remembered', { word: s.slot.sourceToken })}</p>{/if}
