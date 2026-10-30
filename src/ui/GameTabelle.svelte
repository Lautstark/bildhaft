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
   * spreadsheet's do — over each column, left of each row, never on a card
   * (her pick „A", 2026-10-30): one shows while the pointer is in its column
   * or row, and pointed at, it outlines everything it would take out. Asked
   * first, as every bin is.
   */
  import type { ProviderId, Sentence } from '../core/types.ts';
  import { tabelleOf } from '../core/game.ts';
  import WordCard from './WordCard.svelte';
  import AddTile from './AddTile.svelte';
  import Icon from '../pieces/Icon.svelte';
  import { confirmDialog } from './dialog.ts';
  import { addTabelleSpalte, addTabelleZeile, fillTabelle, moveTabelleSpalte, moveTabelleZeile, removeGameRow, removeTabelleSpalte } from '../app/game.ts';
  import { tabelleRoom } from '../app/print.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let table = $derived(tabelleOf(activeCollection()?.game));
  let byId = $derived(new Map(s.sentences.map((sentence) => [sentence.id, sentence])));
  /* What the sheet still holds: a full sheet loses its „+ Spalte" or „+ Zeile". */
  let room = $derived(tabelleRoom());
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
  const doomed = (spalte: number | null, zeile: number | null): string =>
    (doom?.what === 'spalte' && doom.at === spalte) || (doom?.what === 'zeile' && doom.at === zeile) ? ' game-table--doomed' : '';

  const done = () => { carry = null; over = null; };
  const mark = (what: 'zeile' | 'spalte', at: number): string => carry?.what !== what || over !== at || carry.from === at
    ? '' : ` game-table--${what}-${carry.from > at ? 'before' : 'after'}`;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="game-table" style:--spalten={table.spalten.length} ondragend={done} onpointerleave={() => { near = { spalte: null, zeile: null }; }}><span></span><span></span>{#each table.spalten as _, i (i)}{@render bin('spalte', i)}{/each}<span></span><span></span><span class="game-table__ecke" aria-hidden="true" onpointerenter={at(null, null)}>{t('ui.game_ecke')}</span>{#each table.spalten as karte, i (`${i}:${karte}`)}{@const sentence = cardOf(karte)}<div class="game-table__kopf{mark('spalte', i)}{doomed(i, null)}" role="group" aria-label="{t('ui.game_spalte')} {i + 1}" draggable={Boolean(sentence)} title={sentence ? t('ui.drag_to_reorder') : undefined} onpointerenter={at(i, null)} ondragstart={(event) => grab(event, 'spalte', i)} ondragover={(event) => hover(event, 'spalte', i)} ondrop={(event) => drop(event, 'spalte', i)}>{#if sentence}<WordCard {sentence} {provider} />{:else}<AddTile label={t('ui.game_add_kopf')} word={t('ui.game_spalte')} onAdd={() => void fillTabelle(null, i)} />{/if}</div>{/each}<span class="game-table__plus" onpointerenter={at(null, null)}>{#if room.spalte}<AddTile label={t('ui.game_add_spalte')} word={t('ui.game_spalte')} onAdd={() => void addTabelleSpalte()} />{/if}</span>{#each table.zeilen as zeile, r (zeile.id)}{@const kopf = cardOf(zeile.kopf)}{@render bin('zeile', r, zeile.id)}<div class="game-table__zeilenkopf{mark('zeile', r)}{doomed(null, r)}" role="group" aria-label={t('ui.game_row_n', { n: r + 1 })} draggable={Boolean(kopf)} title={kopf ? t('ui.drag_to_reorder') : undefined} onpointerenter={at(null, r)} ondragstart={(event) => grab(event, 'zeile', r)} ondragover={(event) => hover(event, 'zeile', r)} ondrop={(event) => drop(event, 'zeile', r)}>{#if kopf}<WordCard sentence={kopf} {provider} />{:else}<AddTile label={t('ui.game_add_kopf')} word={t('ui.game_zeile')} onAdd={() => void fillTabelle(zeile.id, null)} />{/if}</div>{#each zeile.felder as karte, i (`${i}:${karte}`)}{@const sentence = cardOf(karte)}<div class="game-table__feld{doomed(i, r)}" onpointerenter={at(i, r)}>{#if sentence}<span class="luecke"><WordCard {sentence} {provider} /></span>{:else}<AddTile platz label={t('ui.game_add_karte')} word={t('ui.game_platzhalter')} onAdd={() => void fillTabelle(zeile.id, i)} />{/if}</div>{/each}<span onpointerenter={at(null, r)}></span>{/each}</div>{#if room.zeile}<div class="game__more"><button class="song__plus song__plus--part" type="button" onclick={() => void addTabelleZeile()}>{t('ui.game_add_row')}</button></div>{/if}

{#snippet bin(what: 'zeile' | 'spalte', i: number, id = '')}{@const label = what === 'spalte' ? t('ui.game_delete_spalte', { n: i + 1 }) : t('ui.game_delete_row', { n: i + 1 })}<span class="game-table__bin" class:game-table__bin--on={shows(what, i)}><button class="btn destructive icon" type="button" title={label} aria-label={label} onpointerenter={() => { doom = { what, at: i }; }} onpointerleave={() => { doom = null; }} onfocus={() => { doom = { what, at: i }; }} onblur={() => { doom = null; }} onclick={() => { doom = null; void (what === 'spalte' ? takeSpalte(i) : takeZeile(id, i)); }}><Icon name="trash" /></button></span>{/snippet}
