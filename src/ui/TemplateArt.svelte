<script lang="ts">
  /**
   * The templates, as something to look at rather than to read.
   *
   * A drawing rather than a word because the choice is about what comes out of
   * the printer: a strip with symbols in a row, or a sheet of cards with the cut
   * lines between them. The dashed lines are the whole argument — they say
   * without a sentence that this paper gets cut up and the other one does not.
   */
  import type { TemplateTile } from '../core/types.ts';

  let { kind }: { kind: TemplateTile } = $props();

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
  const recipeCards = [0, 1, 2, 3];
  const recipeSteps = [0, 1, 2];
  const songLines = [0, 1];
  const songBlocks = [0, 1, 2];
  /* A Tabelle's raster: heads filled along the top and down the left, the
     corner left out, a dashed field where every row meets every column. */
  const tableCells = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ row, col }))).filter((cell) => cell.row + cell.col > 0);
  const talkPages = [0, 1];
</script>

{#if kind === 'satzstreifen'}<svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="4" y="9" width="124" height="28" rx="4" />{#each strip as i}<rect class="tpl__fill" x={12 + i * 20} y="16" width="14" height="14" rx="2" />{/each}</svg>{:else if kind === 'tafel'}<svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="22" y="5" width="88" height="36" rx="3" />{#each tafelCells as cell (cell.i)}<rect class={cell.filled ? 'tpl__fill' : 'tpl__ink'} x={26 + cell.col * 21} y={9 + cell.row * 15} width="17" height="11" rx="2" stroke-dasharray={cell.filled ? null : '2 2'} />{/each}</svg>{:else if kind === 'rezept'}<!--
  One sheet standing up: the name, a row of cards to fetch, and numbered steps
  under them — the numbers are what tell it from a sheet of cards.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="44" y="2" width="44" height="42" rx="3" /><rect class="tpl__fill" x="49" y="6" width="20" height="3" rx="1" />{#each recipeCards as i}<rect class="tpl__ink" x={49 + i * 9} y="12" width="7" height="7" rx="1" />{/each}{#each recipeSteps as i}<circle class="tpl__fill" cx="51.5" cy={25.5 + i * 7} r="2.5" /><rect class="tpl__ink" x="56" y={23 + i * 7} width="5" height="5" rx="1" /><rect class="tpl__ink" x="63" y={23 + i * 7} width="5" height="5" rx="1" /><rect class="tpl__ink" x="70" y={23 + i * 7} width="5" height="5" rx="1" />{/each}</svg>{:else if kind === 'lied'}<!--
  One sheet standing up, written out as it is sung: a Strophe, the Refrain on
  its coloured ground, the next Strophe — the ground is what tells it from a
  sheet of strips.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="44" y="2" width="44" height="42" rx="3" />{#each songBlocks as b}{#if b === 1}<rect class="tpl__fill" x="47" y={4 + b * 13} width="38" height="12" rx="1.5" opacity="0.35" />{/if}{#each songLines as l}{#each [0, 1, 2, 3] as w}<rect class="tpl__ink" x={50 + w * 8} y={6 + b * 13 + l * 5} width="5" height="3.5" rx="0.8" />{/each}{/each}{/each}</svg>{:else if kind === 'plauderbuch'}<!--
  Two pages of the book lying on their side: the question on its band with
  the free field at its end, the fields for the Aussagen under it.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art">{#each talkPages as p}<rect class="tpl__ink" x={8 + p * 60} y="5" width="56" height="36" rx="3" /><rect class="tpl__fill" x={11 + p * 60} y="8" width="50" height="10" rx="2" opacity="0.35" /><rect class="tpl__ink" x={47 + p * 60} y="9.5" width="12" height="7" rx="1.5" />{#each cardCols as col}{#each cardRows as row}<rect class="tpl__fill" x={11 + p * 60 + col * 17} y={22 + row * 9} width="14" height="7" rx="1.5" opacity="0.6" />{/each}{/each}{/each}</svg>{:else if kind === 'spiel'}<!--
  One sheet lying on its side: left the Ablage's dashed fields, right two
  rows — a picture, then the dashed field its card is laid onto. The dashed
  fields are the whole argument: this paper is velcroed, not cut.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="22" y="5" width="88" height="36" rx="3" /><rect class="tpl__ink" x="27" y="10" width="15" height="11" rx="2" stroke-dasharray="2 2" /><rect class="tpl__ink" x="27" y="25" width="15" height="11" rx="2" stroke-dasharray="2 2" /><line class="tpl__ink" x1="47" y1="9" x2="47" y2="37" />{#each [0, 1] as r}<rect class="tpl__fill" x="53" y={10 + r * 15} width="17" height="11" rx="2" /><line class="tpl__ink" x1="73" y1={15.5 + r * 15} x2="79" y2={15.5 + r * 15} /><rect class="tpl__ink" x="83" y={10 + r * 15} width="17" height="11" rx="2" stroke-dasharray="2 2" />{/each}</svg>{:else if kind === 'spieltabelle'}<!--
  The Spiel's Ablage at the left, its fence, and the Tabelle beside it.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="22" y="5" width="88" height="36" rx="3" /><rect class="tpl__ink" x="27" y="10" width="15" height="11" rx="2" stroke-dasharray="2 2" /><rect class="tpl__ink" x="27" y="25" width="15" height="11" rx="2" stroke-dasharray="2 2" /><line class="tpl__ink" x1="47" y1="9" x2="47" y2="37" />{#each tableCells as cell (`${cell.row}:${cell.col}`)}<rect class={cell.row === 0 || cell.col === 0 ? 'tpl__fill' : 'tpl__ink'} x={53 + cell.col * 17} y={9 + cell.row * 10.5} width="15" height="9" rx="1.5" stroke-dasharray={cell.row === 0 || cell.col === 0 ? null : '2 2'} />{/each}</svg>{:else if kind === 'einkaufsliste'}<!--
  Three sheets that only mean anything together, so the tile draws all three:
  the board with its cart, the cards to cut, and the sheet they live on.
--><svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art"><rect class="tpl__ink" x="3" y="8" width="40" height="30" rx="3" /><path class="tpl__ink" d="M23 14 h16 v12 h-16 z" /><path class="tpl__ink" d="M23 14 l-4 -4" /><circle class="tpl__ink" cx="27" cy="29" r="2" /><circle class="tpl__ink" cx="36" cy="29" r="2" />{#each listSymbols as i}<rect class="tpl__fill" x="7" y={12 + i * 8} width="6" height="6" rx="1" />{/each}{#each cutCols as col}{#each rows3 as row}<rect class="tpl__ink" x={54 + col * 14} y={8 + row * 11} width="11" height="8" rx="2" />{/each}{/each}<line class="tpl__cut" x1="51" y1="6" x2="51" y2="42" /><line class="tpl__cut" x1="84" y1="6" x2="84" y2="42" />{#each storeCols as col}{#each rows3 as row}<rect class="tpl__ink" x={92 + col * 13} y={8 + row * 11} width="10" height="6" rx="1" /><rect class="tpl__fill" x={92 + col * 13} y={15 + row * 11} width="7" height="2" rx="1" />{/each}{/each}</svg>{:else}<svg viewBox="0 0 132 46" aria-hidden="true" class="tpl__art">{#each cardRows as row}{#each cardCols as col}<rect class="tpl__ink" x={10 + col * 33} y={5 + row * 21} width="26" height="16" rx="3" />{/each}{/each}<line class="tpl__cut" x1="39.5" y1="2" x2="39.5" y2="45" /><line class="tpl__cut" x1="72.5" y1="2" x2="72.5" y2="45" /><line class="tpl__cut" x1="6" y1="23.5" x2="112" y2="23.5" /></svg>{/if}
