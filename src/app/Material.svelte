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
  import { putCollection } from '../db/repo.ts';
  import Row from '../ui/Row.svelte';
  import WordCard from '../ui/WordCard.svelte';
  import TemplateArt from '../ui/TemplateArt.svelte';
  import Tafel from '../ui/Tafel.svelte';
  import { handleNewCard } from './board.ts';
  import { openWortschatzSheet } from './words.ts';
  import { activeCollection, holdsWords, kind, providerId, s } from './state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let empty = $derived(s.sentences.length === 0);
  let provider = $derived(providerId());

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
    await putCollection(next);
  }
</script>

{#if empty}<!--
  What an empty Sammlung says: what it is for, and which template it is.
--><div class="empty"><b>{t('ui.empty_collection')}</b><small>{t('ui.empty_collection_hint')}</small><div class="templates">{#each COLLECTION_KINDS as which (which)}<button class="tpl {kind() === which ? 'tpl--on' : ''}" type="button" aria-pressed={kind() === which} onclick={() => void chooseTemplate(which)}><span class="tpl__art-box"><TemplateArt kind={which} /></span><span><b>{t(`ui.template_${which}`)}</b><small>{t(`ui.template_${which}_note`)}</small></span></button>{/each}</div><!--
  The second way to start, said once and where it is useful: an empty Sammlung
  is exactly where somebody wants their own words poured in rather than typed
  again. Afterwards it lives in the ⋯, because by then the Sammlung has
  something in it and the wall is the thing to look at. Absent rather than
  greyed while there is no Wortschatz to pour.
-->{#if s.wordCount > 0}<p class="small muted" style="margin-top:14px"><button class="linklike" type="button" onclick={() => void openWortschatzSheet()}>{t('ui.add_wortschatz')}</button></p>{/if}</div>{:else if kind() === 'tafel'}<div class="rows rows--tafel"><Tafel {provider} /></div>{:else if holdsWords()}<div class="rows words">{#each s.sentences as sentence (sentence.id)}<WordCard {sentence} {provider} />{/each}<!--
  The empty card at the end. Typing is the fast way for ten words at once;
  this is the way for the one that is missing, and for somebody who has no word
  in mind and is looking for a picture. It opens the same picker every other
  card does.
--><button class="word word--add" type="button" aria-label={t('ui.new_card')} onclick={() => void handleNewCard()}>+</button></div>{:else}<div class="rows">{#each s.sentences as sentence (sentence.id)}<Row {sentence} {provider} />{/each}</div>{/if}
