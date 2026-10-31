<script lang="ts">
  /**
   * Die Größe eines Rasters, aufgezogen wie eine Tabelle in Word: a small
   * button saying the size — „7 × 4 Felder ▾" — opens a raster up to the
   * largest size offered, the pointer pulls the size out of its corner, a
   * press takes it (her pick „S3", 2026-10-31). Under the raster, what the
   * size comes to (`hint`, the fields' size on the paper), so a size is not
   * chosen blind. `can` greys out what the sheet has no room for. The arrow
   * keys walk the size, Enter takes it, Escape closes.
   */
  import { t } from '../i18n/index.ts';

  let { cols, rows, maxCols, maxRows, unit, hint = () => '', can = () => true, onPick }: {
    cols: number;
    rows: number;
    maxCols: number;
    maxRows: number;
    /** What the cells are called on the button: „Felder". */
    unit: string;
    hint?: (cols: number, rows: number) => string;
    can?: (cols: number, rows: number) => boolean;
    onPick: (cols: number, rows: number) => void;
  } = $props();

  let open = $state(false);
  let at = $state({ cols: 1, rows: 1 });
  let host: HTMLElement | undefined = $state();
  let pop: HTMLElement | undefined = $state();
  $effect(() => { if (open) pop?.focus(); });

  function show(): void {
    at = { cols: Math.max(1, cols), rows: Math.max(1, rows) };
    open = !open;
  }
  function take(c: number, r: number): void {
    if (!can(c, r)) return;
    open = false;
    if (c !== cols || r !== rows) onPick(c, r);
  }
  function key(event: KeyboardEvent): void {
    const step: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (event.key === 'Escape') { open = false; return; }
    if (event.key === 'Enter') { event.preventDefault(); take(at.cols, at.rows); return; }
    const move = step[event.key];
    if (!move) return;
    event.preventDefault();
    at = {
      cols: Math.min(maxCols, Math.max(1, at.cols + move[0])),
      rows: Math.min(maxRows, Math.max(1, at.rows + move[1])),
    };
  }
  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (host && !host.contains(event.target as Node)) open = false; };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  });
</script>

<div class="size-pick" bind:this={host}><button class="song__plus size-pick__button" type="button" aria-haspopup="true" aria-expanded={open} onclick={show}>{#if cols > 0 && rows > 0}{cols} × {rows} {unit}{:else}{t('ui.size_pick')}{/if} ▾</button>{#if open}<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions --><div bind:this={pop} class="size-pick__pop" role="group" aria-label={t('ui.size_pick')} tabindex="0" onkeydown={key}><p class="size-pick__say"><b>{t('ui.size_pick_n', { cols: at.cols, rows: at.rows })}</b>{#if hint(at.cols, at.rows)}<span>{hint(at.cols, at.rows)}</span>{/if}</p><!-- svelte-ignore a11y_no_static_element_interactions --><div class="size-pick__grid" style:--cols={maxCols} onpointerleave={() => { at = { cols, rows }; }}>{#each Array.from({ length: maxRows }) as _, r (r)}{#each Array.from({ length: maxCols }) as _, c (c)}<button class="size-pick__cell" class:size-pick__cell--in={c < at.cols && r < at.rows} type="button" tabindex="-1" disabled={!can(c + 1, r + 1)} aria-label={t('ui.size_pick_n', { cols: c + 1, rows: r + 1 })} onpointerenter={() => { at = { cols: c + 1, rows: r + 1 }; }} onclick={() => take(c + 1, r + 1)}></button>{/each}{/each}</div></div>{/if}</div>
