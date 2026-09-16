<script lang="ts">
  /**
   * The templates, as something to look at rather than to read.
   *
   * A drawing rather than a word because the choice is about what comes out of
   * the printer: a strip with symbols in a row, or a sheet of cards with the cut
   * lines between them. The dashed lines are the whole argument — they say
   * without a sentence that this paper gets cut up and the other one does not.
   */
  import type { CollectionKind } from '../core/types.ts';

  let { kind }: { kind: CollectionKind } = $props();

  /* A grid with a card in some fields and not in others: the free field is
     what the Tafel tile has to show, because it is what that template is for. */
  const TAFEL_FILLED = new Set([0, 1, 3, 5, 6]);
  const tafelCells = Array.from({ length: 8 }, (_, i) => ({
    i, col: i % 4, row: Math.floor(i / 4), filled: TAFEL_FILLED.has(i),
  }));
  const strip = [0, 1, 2, 3];
  const listSymbols = [0, 1, 2];
  const cutCols = [0, 1];
  const rows3 = [0, 1, 2];
  const storeCols = [0, 1, 2];
  const cardCols = [0, 1, 2];
  const cardRows = [0, 1];
</script>

{#if kind === 'satzstreifen'}<svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="4" y="9" width="124" height="28" rx="4" />{#each strip as i}<rect class="tpl__fill" x={12 + i * 20} y="16" width="14" height="14" rx="2" />{/each}</svg>{:else if kind === 'tafel'}<svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="22" y="5" width="88" height="36" rx="3" />{#each tafelCells as cell (cell.i)}<rect class={cell.filled ? 'tpl__fill' : 'tpl__ink'} x={26 + cell.col * 21} y={9 + cell.row * 15} width="17" height="11" rx="2" stroke-dasharray={cell.filled ? null : '2 2'} />{/each}</svg>{:else if kind === 'einkaufsliste'}<!--
  Three sheets that only mean anything together, so the tile draws all three:
  the board with its cart, the cards to cut, and the sheet they live on.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="3" y="8" width="40" height="30" rx="3" /><path class="tpl__ink" d="M23 14 h16 v12 h-16 z" /><path class="tpl__ink" d="M23 14 l-4 -4" /><circle class="tpl__ink" cx="27" cy="29" r="2" /><circle class="tpl__ink" cx="36" cy="29" r="2" />{#each listSymbols as i}<rect class="tpl__fill" x="7" y={12 + i * 8} width="6" height="6" rx="1" />{/each}{#each cutCols as col}{#each rows3 as row}<rect class="tpl__ink" x={54 + col * 14} y={8 + row * 11} width="11" height="8" rx="2" />{/each}{/each}<line class="tpl__cut" x1="51" y1="6" x2="51" y2="42" /><line class="tpl__cut" x1="84" y1="6" x2="84" y2="42" />{#each storeCols as col}{#each rows3 as row}<rect class="tpl__ink" x={92 + col * 13} y={8 + row * 11} width="10" height="6" rx="1" /><rect class="tpl__fill" x={92 + col * 13} y={15 + row * 11} width="7" height="2" rx="1" />{/each}{/each}</svg>{:else}<svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art">{#each cardRows as row}{#each cardCols as col}<rect class="tpl__ink" x={10 + col * 33} y={5 + row * 21} width="26" height="16" rx="3" />{/each}{/each}<line class="tpl__cut" x1="39.5" y1="2" x2="39.5" y2="45" /><line class="tpl__cut" x1="72.5" y1="2" x2="72.5" y2="45" /><line class="tpl__cut" x1="6" y1="23.5" x2="112" y2="23.5" /></svg>{/if}
