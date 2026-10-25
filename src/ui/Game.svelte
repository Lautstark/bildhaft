<script lang="ts">
  /**
   * Ein Spiel, Zeile unter Zeile — und wo es geändert wird.
   *
   * A row is one Aufgabe: a run of cells, each a card — printed where it
   * stands, or a Platzhalter whose card lies loose on its dashed field.
   * Typed where it will stand („+ Zeile", like „+ Schritt"), as any sentence
   * is: „Schuh Socke", and the last word is the Platzhalter. „+ Bild" and
   * „+ Platzhalter" append to the row; dragging puts a cell where it
   * belongs — a Platzhalter into the middle of a Muster too — and dragging
   * a row sorts the rows, as a Rezept's Schritte are sorted. The bin takes
   * the row out — asked first, as every bin is.
   */
  import type { GameRow, ProviderId, Sentence } from '../core/types.ts';
  import { rowsOfGame } from '../core/game.ts';
  import WordCard from './WordCard.svelte';
  import LineAdd from './LineAdd.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { addGameCard, addGameLine, moveGameRow, moveGameZelle, removeGameRow } from '../app/game.ts';
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

  /* A cell carried to another place in its row, and a row to another place
     in the game — the Rezept's own drag, in its two sizes. */
  let cellCarry = $state<{ row: string; from: number } | null>(null);
  let cellOver = $state<number | 'end' | null>(null);
  let rowCarry = $state<number | null>(null);
  let rowOver = $state<number | null>(null);

  function grabCell(event: DragEvent, row: string, from: number): void {
    event.stopPropagation();
    cellCarry = { row, from };
    event.dataTransfer?.setData('text/plain', String(from));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function overCell(event: DragEvent, row: string, at: number | 'end'): void {
    if (cellCarry?.row !== row) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    cellOver = at;
  }
  function dropCell(event: DragEvent, row: GameRow, at: number | 'end'): void {
    const was = cellCarry;
    cellCarry = null; cellOver = null;
    if (was?.row !== row.id) return;
    event.preventDefault();
    const to = at === 'end' ? row.zellen.length - 1 : at;
    if (was.from !== to) void moveGameZelle(row.id, was.from, to);
  }
  function grabRow(event: DragEvent, from: number): void {
    if (cellCarry) return;
    rowCarry = from;
    event.dataTransfer?.setData('text/plain', String(from));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function overRow(event: DragEvent, at: number): void {
    if (rowCarry === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    rowOver = at;
  }
  function dropRow(event: DragEvent, at: number): void {
    const was = rowCarry;
    rowCarry = null; rowOver = null;
    if (was === null) return;
    event.preventDefault();
    if (was !== at) void moveGameRow(was, at);
  }
  const rowMark = (at: number): string => rowCarry === null || rowOver !== at || rowCarry === at
    ? '' : rowCarry > at ? ' game__row--before' : ' game__row--after';
  const cellMark = (row: string, at: number): string => cellCarry?.row !== row || cellOver !== at || cellCarry.from === at
    ? '' : cellCarry.from > at ? ' game__cell--before' : ' game__cell--after';

  const cardOf = (id: string): Sentence | undefined => byId.get(id);
</script>

<div class="game">{#if blank}<p class="small faint game__intro">{t('ui.game_intro')}</p>{/if}{#each rows as row, at (row.id)}<!-- svelte-ignore a11y_no_static_element_interactions --><section class="game__row{rowMark(at)}" aria-label={t('ui.game_row_n', { n: at + 1 })} draggable="true" title={t('ui.drag_to_reorder')} ondragstart={(event) => grabRow(event, at)} ondragover={(event) => overRow(event, at)} ondrop={(event) => dropRow(event, at)} ondragend={() => { rowCarry = null; rowOver = null; cellCarry = null; cellOver = null; }}><div class="game__cells">{#each row.zellen as zelle, z (zelle.karte)}{@const sentence = cardOf(zelle.karte)}{#if sentence}<!-- svelte-ignore a11y_no_static_element_interactions --><span class="game__cell{cellMark(row.id, z)}" draggable="true" title={t('ui.drag_to_reorder')} ondragstart={(event) => grabCell(event, row.id, z)} ondragover={(event) => overCell(event, row.id, z)} ondrop={(event) => dropCell(event, row, z)} ondragend={() => { cellCarry = null; cellOver = null; }}>{#if zelle.platz}<span class="luecke"><WordCard {sentence} {provider} /></span>{:else}<WordCard {sentence} {provider} />{/if}</span>{/if}{/each}<!-- svelte-ignore a11y_no_static_element_interactions --><span class="game__adds" ondragover={(event) => overCell(event, row.id, 'end')} ondrop={(event) => dropCell(event, row, 'end')}><button class="song__plus" type="button" onclick={() => void addGameCard(false, row.id)}>{t('ui.game_add_fest')}</button><button class="song__plus game__adds-platz" type="button" onclick={() => void addGameCard(true, row.id)}>{t('ui.game_add_karte')}</button></span></div><span class="game__acts"><button class="btn destructive icon" type="button" title={t('ui.game_delete_row', { n: at + 1 })} aria-label={t('ui.game_delete_row', { n: at + 1 })} onclick={() => void take(row, at)}><Icon name="trash" /></button></span></section>{/each}<div class="game__more"><LineAdd open={adding || blank} plus={t('ui.game_add_row')} label={t('ui.game_line_label')} placeholder={t('ui.game_line_placeholder')} onOpen={() => { adding = true; }} onClose={() => { adding = false; }} onSend={(raw) => addGameLine(raw)} /></div></div>
