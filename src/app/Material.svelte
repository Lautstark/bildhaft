<script lang="ts">
  /**
   * What a Sammlung's main area holds: rows, a wall of cards, or a Tafel — and,
   * while it is still empty, the choice between them.
   *
   * The three used to draw into one host and each had to state its own layout
   * on it, because the host was one node shared by all: leaving the card grid
   * on it turned every row of the next Sammlung into a narrow column with its
   * words stacked, which is what happens when only one of two paths sets a
   * thing. A block per shape cannot have that failure — the class is on the
   * element the block owns.
   */
  import type { Collection, CollectionKind } from '../core/types.ts';
  import { COLLECTION_KINDS, kindOf } from '../core/types.ts';
  import { boardOf } from '../core/board.ts';
  import { patchCollection } from '../db/repo.ts';
  import Row from '../ui/Row.svelte';
  import WordCard from '../ui/WordCard.svelte';
  import TemplateArt from '../ui/TemplateArt.svelte';
  import Tafel from '../ui/Tafel.svelte';
  import Recipe from '../ui/Recipe.svelte';
  import Song from '../ui/Song.svelte';
  import { handleNewCard } from './board.ts';
  import { openWortschatzSheet } from './words.ts';
  import { activeCollection, holdsWords, kind, providerId, s } from './state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let empty = $derived(s.sentences.length === 0);
  let provider = $derived(providerId());
  /** A Material made by „+ Neues Material" that has not been told what it is yet. */
  let choosing = $derived(s.choosing !== null && s.choosing === s.activeId);

  /**
   * The two templates, offered while a Sammlung is still empty.
   *
   * Not a dialog before „+ Neue Sammlung": that would be a question in front of
   * a blank page, and today the button makes one immediately (§1.5). So the
   * Sammlung is made as a Satzstreifen — which is what bildhaft has always been
   * and what somebody who touches nothing should get — and the choice stands in
   * the empty state, where there is nothing yet to convert. Once a card or a
   * row is in it, the tiles are gone and the answer is to make another one.
   */
  async function chooseTemplate(which: CollectionKind): Promise<void> {
    const open = activeCollection();
    if (!open || kindOf(open) === which) return;
    const next: Collection = { ...open, kind: which, updatedAt: Date.now() };
    /* A Tafel is born with its grid, so the record says what it is from the
       first paint; the other kinds have none and carry no field for one. */
    if (which === 'tafel') next.board = boardOf(next);
    else delete next.board;
    s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
    await patchCollection(next.id, { kind: which, board: next.board });
  }

  async function pick(which: CollectionKind): Promise<void> {
    await chooseTemplate(which);
    s.choosing = null;
  }

  /** What of this kind is already there, the open one aside. */
  function mine(which: CollectionKind): string {
    const others = s.collections.filter((c) => c.id !== s.activeId && kindOf(c) === which);
    if (others.length === 0) return t('ui.template_mine_none');
    if (others.length === 1) return t('ui.template_mine_one', { name: others[0].name });
    return t('ui.template_mine', { name: others[0].name, n: others.length - 1 });
  }
</script>

{#if choosing}<!--
  A new Material asks what it should become before anything else, and the
  answer is a click. No box to type into above it: every template has its own
  — the Lied a paste box, the Rezept three fields, the Tafel a grid first — so
  a shared one in front of them would be a second box that has to guess which
  of those it is. Under each tile, what of that kind is already there, which
  is how somebody recognises the one they mean faster than by its drawing.
--><div class="pick"><p class="pick__ask">{t('ui.empty_collection')}</p><p class="small muted pick__hint">{t('ui.empty_collection_hint')}</p><div class="templates templates--wide">{#each COLLECTION_KINDS as which (which)}<button class="tpl" type="button" onclick={() => void pick(which)}><span class="tpl__art-box"><TemplateArt kind={which} /></span><span><b>{t(`ui.template_${which}`)}</b><small>{t(`ui.template_${which}_note`)}</small></span><span class="tpl__mine">{mine(which)}</span></button>{/each}</div></div>{:else if empty}<!--
  What an empty Material says once its template is chosen: which one, and the
  way back to the choice while there is still nothing to convert.
--><div class="empty"><b>{t('ui.collection_empty')}</b><small>{t(`ui.template_${kind()}`)} · <button class="linklike" type="button" onclick={() => { s.choosing = s.activeId; }}>{t('ui.other_template')}</button></small><!--
  The second way to start, said once and where it is useful: an empty Sammlung
  is exactly where somebody wants their own words poured in rather than typed
  again. Afterwards it lives in the ⋯, because by then the Sammlung has
  something in it and the wall is the thing to look at. Absent rather than
  greyed while there is no Wortschatz to pour.
-->{#if s.wordCount > 0}<p class="small muted" style="margin-top:14px"><button class="linklike" type="button" onclick={() => void openWortschatzSheet()}>{t('ui.add_wortschatz')}</button></p>{/if}</div>{/if}<!--
  A Rezept is drawn empty as well, under the tiles: its boxes are where it is
  typed into, so without them an empty Rezept would have no way to begin. A
  Lied too, for the same reason: its box is where the song is pasted.
-->{#if choosing}{:else if kind() === 'rezept'}<Recipe {provider} />{:else if kind() === 'lied'}<Song {provider} />{:else if empty}{:else if kind() === 'tafel'}<div class="rows rows--tafel"><Tafel {provider} /></div>{:else if holdsWords()}<div class="rows words">{#each s.sentences as sentence (sentence.id)}<WordCard {sentence} {provider} />{/each}<!--
  The empty card at the end. Typing is the fast way for ten words at once;
  this is the way for the one that is missing, and for somebody who has no word
  in mind and is looking for a picture. It opens the same picker every other
  card does.
--><button class="word word--add" type="button" aria-label={t('ui.new_card')} onclick={() => void handleNewCard()}>+</button></div>{:else}<div class="rows">{#each s.sentences as sentence (sentence.id)}<Row {sentence} {provider} />{/each}</div>{/if}
