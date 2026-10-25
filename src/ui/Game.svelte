<script lang="ts">
  /**
   * Ein Spiel, Zeile unter Zeile — und wo es geändert wird.
   *
   * A row reads as it does on paper: left what is printed fast onto the
   * Spielblatt, right the cards the child lays. Nothing here is new. A card
   * is the card a Wortkarten-Sammlung draws, each side ending in the same „+"
   * (which opens the symbol search; a click on a card the usual dialog, for
   * its words). The bin takes the row out — asked first, as every bin is.
   * „+ Zeile" at the end. An empty Spiel shows one empty row to begin on,
   * and a line saying what a row is.
   */
  import type { GameRow, ProviderId, Sentence } from '../core/types.ts';
  import { rowsOfGame } from '../core/game.ts';
  import WordCard from './WordCard.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { addGameCard, addGameRow, removeGameRow } from '../app/game.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  /* An empty game is drawn as one row with no id: the first thing put into
     it makes it a row of the book. */
  const BLANK: GameRow = { id: '', fest: [], karten: [] };
  let rows = $derived.by(() => {
    const held = rowsOfGame(activeCollection()?.game);
    return held.length > 0 ? held : [BLANK];
  });
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  /* A game with nothing in it yet says what a row is. */
  let blank = $derived(rows.every((row) => row.fest.length === 0 && row.karten.length === 0));

  async function take(row: GameRow, at: number): Promise<void> {
    const ok = await confirmDialog({
      title: t('ui.game_delete_row', { n: at + 1 }),
      body: t('ui.game_delete_row_body'),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (!ok) return;
    await removeGameRow(row.id);
  }

  const cardOf = (id: string): Sentence | undefined => byId.get(id);
</script>

<div class="game">{#if blank}<p class="small faint game__intro">{t('ui.game_intro')}</p>{/if}<div class="game__legend"><span class="small faint">{t('ui.game_fest')}</span><span></span><span class="small faint">{t('ui.game_karten')}</span><span></span></div>{#each rows as row, at (row.id || 'blank')}<section class="game__row" aria-label={t('ui.game_row_n', { n: at + 1 })}><div class="words game__side">{#each row.fest as id (id)}{@const sentence = cardOf(id)}{#if sentence}<WordCard {sentence} {provider} />{/if}{/each}<button class="word word--add" type="button" aria-label={t('ui.game_add_fest')} onclick={() => void addGameCard('fest', row.id || undefined)}>+</button></div><span class="game__arrow" aria-hidden="true">→</span><div class="words game__side game__side--karten">{#each row.karten as id (id)}{@const sentence = cardOf(id)}{#if sentence}<WordCard {sentence} {provider} />{/if}{/each}<button class="word word--add" type="button" aria-label={t('ui.game_add_karte')} onclick={() => void addGameCard('karte', row.id || undefined)}>+</button></div><span class="game__acts">{#if row.id}<button class="btn destructive icon" type="button" title={t('ui.game_delete_row', { n: at + 1 })} aria-label={t('ui.game_delete_row', { n: at + 1 })} onclick={() => void take(row, at)}><Icon name="trash" /></button>{/if}</span></section>{/each}<div class="game__more"><button class="song__plus song__plus--part" type="button" onclick={() => void addGameRow()}>{t('ui.game_add_row')}</button></div></div>
