<script module lang="ts">
  /* One sheet planned at a time: `replan` flushes the whole page, and a
     hundred of them at once would measure each other half-drawn. */
  let reihe: Promise<void> = Promise.resolve();
  /* The sheet being looked at goes ahead of the ones measured out of sight. */
  let vorn: Promise<void> = Promise.resolve();
  /* A task's turn without setTimeout, which a hidden tab holds to a second
     a time: a hundred sheets would take minutes there. */
  const yieldTask = (): Promise<void> => new Promise((go) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => go();
    channel.port2.postMessage(null);
  });
</script>

<script lang="ts">
  /**
   * One case of the Prüfseite: the app's own print preview (`Printing`,
   * `PrintSheet.svelte`, print.css), planned as the preview plans it and
   * measured. Shown, its pages stand side by side at the scale given; the
   * problem list's cases are measured out of sight.
   */
  import { onMount } from 'svelte';
  import { getProvider } from '@lautstark/bildquelle';
  import PrintSheet from '../ui/PrintSheet.svelte';
  import { Printing } from '../ui/printDialog.svelte.ts';
  import type { Fall } from './faelle.ts';
  import { messen, type Messung } from './messen.ts';

  let { fall, scale = 0.25, gezeigt = false, onGemessen }: {
    fall: Fall; scale?: number; gezeigt?: boolean;
    onGemessen: (id: string, messung: Messung) => void;
  } = $props();

  const noop = () => undefined;
  /* Made once: the parent keys a tile by its case. */
  // svelte-ignore state_referenced_locally
  const { material: m, vorlage, settings } = fall;
  const preview = new Printing({
    sentences: m.board ? m.board.cells.filter((cell) => cell !== null) : m.sentences,
    kind: vorlage,
    board: m.board ?? null, song: m.song ?? null, talk: m.talk ?? null, game: m.game ?? null,
    collectionName: m.name, pictures: [], settings,
    onChange: noop, onClose: noop,
    provider: 'arasaac', attribution: getProvider('arasaac').attribution,
  });

  let size = $state({ w: 0, h: 0 });

  const settle = async (): Promise<void> => {
    const imgs = [...(preview.holder?.querySelectorAll('img') ?? [])];
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
  };

  onMount(() => {
    let gone = false;
    const run = async () => {
      await yieldTask();
      if (gone) return;
      preview.replan();
      await settle();
      /* Again, now every picture has its size: what is measured is the plan the printer would get. */
      preview.replan();
      await settle();
      const sheet = preview.sheet;
      if (gone || !sheet || !preview.holder) return;
      size = { w: sheet.offsetWidth, h: sheet.offsetHeight };
      onGemessen(fall.id, messen(preview.holder, fall, preview.cardSize));
    };
    if (gezeigt) vorn = vorn.then(run); else reihe = reihe.then(run);
    return () => { gone = true; };
  });
</script>

<div class="bogen" data-fall={fall.id} style:width={size.w ? `${size.w * scale}px` : undefined} style:height={size.h ? `${size.h * scale}px` : '120px'}>
  <div class="preview-scaler bogen__scaler" style:transform="scale({scale})"><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider="arasaac" /></div></div>
</div>

<style>
  .bogen { position: relative; }
  .bogen__scaler { position: absolute; top: 0; left: 0; }
  /* The pages side by side, all at one scale: a sheet is as big beside another as it is in print. */
  .bogen :global(.ps-sheet--paged) { display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 12mm; width: max-content; }
  .bogen :global(.ps-paper + .ps-paper) { margin-top: 0; }
</style>
