<script lang="ts">
  /**
   * Ein Spiel, Zeile unter Zeile — und wo es geändert wird.
   *
   * A row is one Aufgabe, typed where it will stand — „+ Zeile" opens the
   * same line „+ Schritt" does, no box above the material. Typed as any
   * sentence is („Schuh Socke"), and the last word is laid: it shows on its
   * Lücke, the dashed field a Tafel draws where a card is yet to come. More
   * cards into the Lücke by its „+"; more fixed pictures by the „+" before
   * it. The bin takes the row out — asked first, as every bin is.
   */
  import type { GameRow, ProviderId, Sentence } from '../core/types.ts';
  import { rowsOfGame } from '../core/game.ts';
  import WordCard from './WordCard.svelte';
  import LineAdd from './LineAdd.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { addGameCard, addGameLine, removeGameRow } from '../app/game.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let rows = $derived(rowsOfGame(activeCollection()?.game));
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  /* A game with nothing in it yet says what a row is, its line open to type into. */
  let blank = $derived(rows.length === 0);
  let adding = $state(false);

  $effect(() => { void s.activeId; adding = false; });

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

<div class="game">{#if blank}<p class="small faint game__intro">{t('ui.game_intro')}</p>{/if}{#each rows as row, at (row.id)}<section class="game__row" aria-label={t('ui.game_row_n', { n: at + 1 })}><div class="game__cells">{#each row.fest as id (id)}{@const sentence = cardOf(id)}{#if sentence}<WordCard {sentence} {provider} />{/if}{/each}{#each row.karten as id (id)}{@const sentence = cardOf(id)}{#if sentence}<span class="luecke"><WordCard {sentence} {provider} /></span>{/if}{/each}<span class="game__adds"><button class="song__plus" type="button" onclick={() => void addGameCard('fest', row.id)}>{t('ui.game_add_fest')}</button><button class="song__plus game__adds-platz" type="button" onclick={() => void addGameCard('karte', row.id)}>{t('ui.game_add_karte')}</button></span></div><span class="game__acts"><button class="btn destructive icon" type="button" title={t('ui.game_delete_row', { n: at + 1 })} aria-label={t('ui.game_delete_row', { n: at + 1 })} onclick={() => void take(row, at)}><Icon name="trash" /></button></span></section>{/each}<div class="game__more"><LineAdd open={adding || blank} plus={t('ui.game_add_row')} label={t('ui.game_line_label')} placeholder={t('ui.game_line_placeholder')} onOpen={() => { adding = true; }} onClose={() => { adding = false; }} onSend={(raw) => addGameLine(raw)} /></div></div>
