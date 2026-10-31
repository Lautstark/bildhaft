<script lang="ts">
  /**
   * Ein Spiel als Tabelle — Zeile × Spalte — and where it is changed.
   *
   * It is edited as it prints: the corner stays empty, the column heads run
   * along the top and end in „+ Spalte", each row begins with its head, and
   * where a row meets a column lies its card — on the dashed field of a
   * Platzhalter, or the field's „+" while it is still to be chosen. „+ Zeile"
   * brings a head and a place under every column. Rows and columns are
   * dragged by their heads. Their bins stand at the table's edge, as a
   * spreadsheet's do — over each column, right of each row, never on a card
   * (her pick „A", 2026-10-30, the row's bin moved right with every other
   * bin, 2026-10-31): one shows while the pointer is in its column or row,
   * and pointed at, one frame goes round everything it would take out.
   * Asked first, as every bin is.
   */
  import type { ProviderId, Sentence } from '../core/types.ts';
  import { tabelleOf } from '../core/game.ts';
  import WordCard from './WordCard.svelte';
  import AddTile from './AddTile.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { fillTabelle, moveTabelleSpalte, moveTabelleZeile, removeGameRow, removeTabelleSpalte, resizeTabelle, tabelleLoses } from '../app/game.ts';
  import { tabelleFitsSize } from '../app/print.ts';
  import SizePick from './SizePick.svelte';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let table = $derived(tabelleOf(activeCollection()?.game));
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  /*
   * Its size, set with the Tafel's size button (her pick, 2026-10-31): up to
   * what the sheet holds at the one field — 3 × 5, 4 × 3, 5 × 1, 6 × 1 on A4
   * across — the rest greyed. Bigger brings empty columns and rows; smaller
   * takes the last ones with their cards, said under the raster and asked.
   */
  const TABELLE_PICK = { cols: 6, rows: 5 };
  const sizeHint = (spalten: number, zeilen: number): string => {
    if (!tabelleFitsSize(spalten, zeilen)) return t('ui.tabelle_too_big');
    const loses = tabelleLoses(spalten, zeilen);
    return loses > 0 ? t(loses === 1 ? 'ui.tabelle_loses_one' : 'ui.tabelle_loses', { n: loses }) : t('ui.tabelle_fits');
  };
  async function pickSize(spalten: number, zeilen: number): Promise<void> {
    const loses = tabelleLoses(spalten, zeilen);
    if (loses > 0 && !(await confirmDialog({
      title: t('ui.tabelle_shrink', { cols: spalten, rows: zeilen }),
      body: t(loses === 1 ? 'ui.tabelle_loses_one' : 'ui.tabelle_loses', { n: loses }),
      confirmLabel: t('ui.delete'),
      danger: true,
    }))) return;
    await resizeTabelle(spalten, zeilen);
  }
  const cardOf = (id: string): Sentence | undefined => (id ? byId.get(id) : undefined);

  async function takeZeile(id: string, at: number): Promise<void> {
    const ok = await confirmDialog({
      title: t('ui.game_delete_row', { n: at + 1 }),
      body: t('ui.game_delete_zeile_body'),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (ok) await removeGameRow(id);
  }

  async function takeSpalte(at: number): Promise<void> {
    const ok = await confirmDialog({
      title: t('ui.game_delete_spalte', { n: at + 1 }),
      body: t('ui.game_delete_spalte_body'),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (ok) await removeTabelleSpalte(at);
  }

  /* A row or a column carried by its head to another place. */
  let carry = $state<{ what: 'zeile' | 'spalte'; from: number } | null>(null);
  let over = $state<number | null>(null);

  function grab(event: DragEvent, what: 'zeile' | 'spalte', from: number): void {
    carry = { what, from };
    event.dataTransfer?.setData('text/plain', String(from));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function hover(event: DragEvent, what: 'zeile' | 'spalte', at: number): void {
    if (carry?.what !== what) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    over = at;
  }
  function drop(event: DragEvent, what: 'zeile' | 'spalte', at: number): void {
    const was = carry;
    carry = null; over = null;
    if (was?.what !== what) return;
    event.preventDefault();
    if (was.from === at) return;
    void (what === 'zeile' ? moveTabelleZeile(was.from, at) : moveTabelleSpalte(was.from, at));
  }
  /* The column and row the pointer is in, whose bins show; and the one whose
     bin it is on, outlined whole. */
  let near = $state<{ spalte: number | null; zeile: number | null }>({ spalte: null, zeile: null });
  let doom = $state<{ what: 'zeile' | 'spalte'; at: number } | null>(null);
  const at = (spalte: number | null, zeile: number | null) => () => { near = { spalte, zeile }; };
  const shows = (what: 'zeile' | 'spalte', i: number): boolean => (what === 'spalte' ? near.spalte : near.zeile) === i || (doom?.what === what && doom.at === i);
  /* The one frame round a doomed column or row, measured off its cells. */
  let grid = $state<HTMLElement>();
  let frame = $derived.by(() => {
    if (!doom || !grid) return null;
    const cells = [...grid.querySelectorAll<HTMLElement>(doom.what === 'spalte' ? `[data-spalte="${doom.at}"]` : `[data-zeile="${doom.at}"]`)];
    if (cells.length === 0) return null;
    const left = Math.min(...cells.map((cell) => cell.offsetLeft));
    const top = Math.min(...cells.map((cell) => cell.offsetTop));
    const right = Math.max(...cells.map((cell) => cell.offsetLeft + cell.offsetWidth));
    const bottom = Math.max(...cells.map((cell) => cell.offsetTop + cell.offsetHeight));
    return { left, top, width: right - left, height: bottom - top };
  });

  const done = () => { carry = null; over = null; };
  const mark = (what: 'zeile' | 'spalte', at: number): string => carry?.what !== what || over !== at || carry.from === at
    ? '' : ` game-table--${what}-${carry.from > at ? 'before' : 'after'}`;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="game-table" bind:this={grid} style:--spalten={table.spalten.length} ondragend={done} onpointerleave={() => { near = { spalte: null, zeile: null }; }}><span></span>{#each table.spalten as _, i (i)}{@render bin('spalte', i)}{/each}<span></span><span class="game-table__ecke" aria-hidden="true" onpointerenter={at(null, null)}>{t('ui.game_ecke')}</span>{#each table.spalten as karte, i (`${i}:${karte}`)}{@const sentence = cardOf(karte)}<div class="game-table__kopf{mark('spalte', i)}" data-spalte={i} role="group" aria-label="{t('ui.game_spalte')} {i + 1}" draggable={Boolean(sentence)} title={sentence ? t('ui.drag_to_reorder') : undefined} onpointerenter={at(i, null)} ondragstart={(event) => grab(event, 'spalte', i)} ondragover={(event) => hover(event, 'spalte', i)} ondrop={(event) => drop(event, 'spalte', i)}>{#if sentence}<WordCard {sentence} {provider} />{:else}<AddTile label={t('ui.game_add_kopf')} word={t('ui.game_spalte')} onAdd={() => void fillTabelle(null, i)} />{/if}</div>{/each}<span class="game-table__plus" onpointerenter={at(null, null)}></span>{#each table.zeilen as zeile, r (zeile.id)}{@const kopf = cardOf(zeile.kopf)}<div class="game-table__zeilenkopf{mark('zeile', r)}" data-zeile={r} role="group" aria-label={t('ui.game_row_n', { n: r + 1 })} draggable={Boolean(kopf)} title={kopf ? t('ui.drag_to_reorder') : undefined} onpointerenter={at(null, r)} ondragstart={(event) => grab(event, 'zeile', r)} ondragover={(event) => hover(event, 'zeile', r)} ondrop={(event) => drop(event, 'zeile', r)}>{#if kopf}<WordCard sentence={kopf} {provider} />{:else}<AddTile label={t('ui.game_add_kopf')} word={t('ui.game_zeile')} onAdd={() => void fillTabelle(zeile.id, null)} />{/if}</div>{#each zeile.felder as karte, i (`${i}:${karte}`)}{@const sentence = cardOf(karte)}<div class="game-table__feld" data-spalte={i} data-zeile={r} onpointerenter={at(i, r)}>{#if sentence}<span class="luecke"><WordCard {sentence} {provider} /></span>{:else}<AddTile platz label={t('ui.game_add_karte')} word={t('ui.game_platzhalter')} onAdd={() => void fillTabelle(zeile.id, i)} />{/if}</div>{/each}{@render bin('zeile', r, zeile.id)}{/each}{#if frame}<span class="game-table__frame" aria-hidden="true" style:left="{frame.left}px" style:top="{frame.top}px" style:width="{frame.width}px" style:height="{frame.height}px"></span>{/if}</div><div class="board-size game-table__size"><SizePick cols={table.spalten.length} rows={table.zeilen.length} maxCols={TABELLE_PICK.cols} maxRows={TABELLE_PICK.rows} unit={t('ui.board_fields')} can={tabelleFitsSize} hint={sizeHint} onPick={(spalten, zeilen) => void pickSize(spalten, zeilen)} /></div>

{#snippet bin(what: 'zeile' | 'spalte', i: number, id = '')}{@const label = what === 'spalte' ? t('ui.game_delete_spalte', { n: i + 1 }) : t('ui.game_delete_row', { n: i + 1 })}<span class="game-table__bin game-table__bin--{what}" class:game-table__bin--on={shows(what, i)}><button class="btn destructive icon" type="button" title={label} aria-label={label} onpointerenter={() => { doom = { what, at: i }; }} onpointerleave={() => { doom = null; }} onfocus={() => { doom = { what, at: i }; }} onblur={() => { doom = null; }} onclick={() => { doom = null; void (what === 'spalte' ? takeSpalte(i) : takeZeile(id, i)); }}><Icon name="trash" /></button></span>{/snippet}
