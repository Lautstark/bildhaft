<script module lang="ts">
  /* One sheet planned at a time: `replan` flushes the whole page, and a
     hundred of them at once would measure each other half-drawn. */
  let reihe: Promise<void> = Promise.resolve();
  /* A task's turn without setTimeout, which a hidden tab holds to a second
     a time: a hundred and forty sheets would take minutes there. */
  const yieldTask = (): Promise<void> => new Promise((go) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => go();
    channel.port2.postMessage(null);
  });
</script>

<script lang="ts">
  /**
   * One case of the Prüfseite: the app's own print preview (`Printing`,
   * `PrintSheet.svelte`, print.css), planned as the preview plans it, with
   * what was measured on it laid over each card.
   */
  import { onMount } from 'svelte';
  import { getProvider } from '@lautstark/bildquelle';
  import PrintSheet from '../ui/PrintSheet.svelte';
  import { Printing } from '../ui/printDialog.svelte.ts';
  import { PX_PER_MM } from '../ui/printSheet.ts';
  import type { Fall } from './faelle.ts';
  import { VORLAGE } from './faelle.ts';
  import { arten, messen, mmText, type Befund, type Messung } from './messen.ts';

  let { fall, scale, masse, befunde, onGemessen }: {
    fall: Fall; scale: number; masse: boolean;
    /** Everything found on this sheet, its own and against its twins. */
    befunde: Befund[];
    onGemessen: (id: string, messung: Messung) => void;
  } = $props();

  const noop = () => undefined;
  /* Made once: a case does not change under its tile. */
  // svelte-ignore state_referenced_locally
  const m = fall.material;
  // svelte-ignore state_referenced_locally
  const preview = new Printing({
    sentences: m.board ? m.board.cells.filter((cell) => cell !== null) : m.sentences,
    // svelte-ignore state_referenced_locally
    kind: fall.vorlage,
    board: m.board ?? null, song: m.song ?? null, talk: m.talk ?? null, game: m.game ?? null,
    collectionName: m.name, pictures: [],
    // svelte-ignore state_referenced_locally
    settings: fall.settings,
    onChange: noop, onClose: noop,
    provider: 'arasaac', attribution: getProvider('arasaac').attribution,
  });

  let messung = $state.raw<Messung | null>(null);
  let size = $state({ w: 0, h: 0 });

  const settle = async (): Promise<void> => {
    const imgs = [...(preview.holder?.querySelectorAll('img') ?? [])];
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
  };

  onMount(() => {
    reihe = reihe.then(async () => {
      await yieldTask();
      preview.replan();
      await settle();
      /* Again, now every picture has its size: what is measured is the plan the printer would get. */
      preview.replan();
      await settle();
      const sheet = preview.sheet;
      if (!sheet || !preview.holder) return;
      size = { w: sheet.offsetWidth, h: sheet.offsetHeight };
      messung = messen(preview.holder, fall, preview.cardSize);
      onGemessen(fall.id, messung);
    });
  });

  let fehler = $derived(befunde.filter((b) => b.schwere === 'fehler'));
  let hinweise = $derived(befunde.filter((b) => b.schwere === 'hinweis'));
  let oks = $derived(befunde.filter((b) => b.schwere === 'ok'));
  const px = (mm: number): string => `${(mm * PX_PER_MM * scale).toFixed(1)}px`;
</script>

<article class="kachel" class:kachel--standard={fall.standard} class:kachel--fehler={fehler.length > 0} id={fall.id} data-fall={fall.id} data-fehler={fehler.length} data-gemessen={messung ? '' : undefined}>
  <header class="kachel__kopf">
    {#if fall.standard}<span class="kachel__std">Standard</span>{/if}
    <h3>{VORLAGE[fall.vorlage]}{#if fall.name} · {fall.name}{/if}</h3>
    <a class="kachel__anker" href="#{fall.id}" aria-label="Link zu diesem Fall">#</a>
  </header>
  {#if messung}<ul class="kachel__arten">{#each arten(messung) as a (a.art)}<li><b>{a.art}</b> {mmText(a.w)}×{mmText(a.h)} mm{#if a.sym} · Symbol {mmText(a.sym)}{/if}{#if a.n > 1} <span class="faint">×{a.n}</span>{/if}</li>{/each}<li class="faint">{messung.seiten} {messung.seiten === 1 ? 'Blatt' : 'Blätter'}{#if messung.anzeige} · App: „{messung.anzeige}“{/if}</li></ul>{:else}<p class="kachel__wait faint">wird gemessen …</p>{/if}
  {#if befunde.length > 0}<ul class="kachel__befunde">{#each fehler as b (b.text)}<li class="kachel__f">{b.text}</li>{/each}{#each hinweise as b (b.text)}<li class="kachel__h">{b.text}</li>{/each}{#each oks as b (b.text)}<li class="kachel__ok">{b.text}</li>{/each}</ul>{/if}
  <div class="kachel__buehne" style:width={size.w ? `${size.w * scale}px` : undefined} style:height={size.h ? `${size.h * scale}px` : '200px'}>
    <div class="preview-scaler kachel__scaler" style:transform="scale({scale})"><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider="arasaac" /></div></div>
    {#if masse && messung}<div class="kachel__marken" aria-hidden="true">{#each messung.stuecke as s, at (at)}{#if s.sym}<span class="kachel__sym" style:left={px(s.sym.x)} style:top={px(s.sym.y)} style:width={px(s.sym.w)} style:height={px(s.sym.h)}></span>{/if}{#if s.wort}<span class="kachel__wort" style:left={px(s.wort.x)} style:top={px(s.wort.y)} style:width={px(s.wort.w)} style:height={px(s.wort.h)}></span>{/if}<span class="kachel__mass" class:kachel__mass--fehler={s.befunde.some((b) => b.schwere === 'fehler')} style:left={px(s.box.x)} style:top={px(s.box.y)} title={[`${s.art} ${mmText(s.box.w)} × ${mmText(s.box.h)} mm`, s.sym ? `Symbol ${mmText(s.sym.w)} mm` : '', ...s.befunde.map((b) => b.text)].filter(Boolean).join('\n')}>{mmText(s.box.w)}×{mmText(s.box.h)}{#if s.sym}<br />S {mmText(s.sym.w)}{/if}</span>{/each}</div>{/if}
  </div>
</article>

<style>
  .kachel {
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px; border-radius: 10px;
    background: var(--surface, #fff); border: 1px solid var(--border, #e2ddd9);
    min-width: 0;
  }
  .kachel--standard { border: 2px solid var(--accent, #ff6b35); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent, #ff6b35) 18%, transparent); }
  .kachel--fehler { background: color-mix(in srgb, #d32f2f 6%, var(--surface, #fff)); }
  .kachel__kopf { display: flex; align-items: baseline; gap: 6px; }
  .kachel__kopf h3 { margin: 0; font-size: 14px; flex: 1; }
  .kachel__std { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #fff; background: var(--accent, #ff6b35); border-radius: 4px; padding: 1px 6px; }
  .kachel__anker { color: var(--muted, #888); text-decoration: none; font-size: 12px; }
  .kachel__arten, .kachel__befunde { margin: 0; padding: 0; list-style: none; font-size: 12px; line-height: 1.4; font-variant-numeric: tabular-nums; }
  .kachel__f { color: #c62828; font-weight: 600; }
  .kachel__f::before { content: '✕ '; }
  .kachel__h { color: var(--muted, #776e69); }
  .kachel__h::before { content: '· '; }
  .kachel__ok { color: #2e7d32; }
  .kachel__ok::before { content: '✓ '; }
  .kachel__wait { margin: 0; font-size: 12px; }
  .kachel__buehne { position: relative; overflow: hidden; background: var(--surface-2, #eeeae7); border-radius: 6px; align-self: flex-start; }
  .kachel__scaler { position: absolute; top: 0; left: 0; }
  .kachel__marken { position: absolute; inset: 0; pointer-events: none; }
  .kachel__sym { position: absolute; box-sizing: border-box; outline: 1px solid rgba(25, 118, 210, .75); }
  .kachel__wort { position: absolute; box-sizing: border-box; outline: 1px dotted rgba(0, 150, 80, .9); }
  .kachel__mass {
    position: absolute; pointer-events: auto; transform: translate(1px, 1px);
    font: 600 8px/1.05 ui-monospace, Menlo, monospace; color: #fff;
    background: rgba(40, 35, 32, .62); padding: 1px 3px; border-radius: 3px; white-space: nowrap;
  }
  .kachel__mass--fehler { background: #c62828; }
</style>
