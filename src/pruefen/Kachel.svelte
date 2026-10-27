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

  let { fall, scale = 0.25, breite, gezeigt = false, onGemessen }: {
    fall: Fall; scale?: number;
    /** The room the pages have, in pixels on screen: they wrap into it rather than run off to the side. */
    breite?: number;
    gezeigt?: boolean;
    onGemessen: (id: string, messung: Messung) => void;
  } = $props();

  const noop = () => undefined;
  /* Made once: the parent keys a tile by its case. */
  // svelte-ignore state_referenced_locally
  const { material: m, vorlage, settings, titel } = fall;
  const preview = new Printing({
    sentences: m.sentences,
    kind: vorlage,
    board: m.board ?? null, song: m.song ?? null, talk: m.talk ?? null, game: m.game ?? null,
    collectionName: titel, pictures: m.pictures ?? [], settings,
    onChange: noop, onClose: noop,
    provider: m.provider, attribution: getProvider(m.provider).attribution,
  });

  let size = $state({ w: 0, h: 0 });

  const settle = async (): Promise<void> => {
    const imgs = [...(preview.holder?.querySelectorAll('img') ?? [])];
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
  };

  onMount(() => {
    let gone = false;
    let stop = () => undefined as void;
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
      onGemessen(fall.id, messen(preview.holder, fall));
      /* Wrapped to another width, the sheet is another size. */
      if (gezeigt) {
        const watching = new ResizeObserver(() => { size = { w: sheet.offsetWidth, h: sheet.offsetHeight }; });
        watching.observe(sheet);
        stop = () => watching.disconnect();
      }
    };
    if (gezeigt) vorn = vorn.then(run); else reihe = reihe.then(run);
    return () => { gone = true; stop(); };
  });
</script>

<div class="bogen" class:bogen--reihe={breite !== undefined} data-fall={fall.id} style:--reihe={breite ? `${breite / scale}px` : undefined} style:width={size.w ? `${size.w * scale}px` : undefined} style:height={size.h ? `${size.h * scale}px` : '120px'}>
  <div class="preview-scaler bogen__scaler" style:transform="scale({scale})"><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider={m.provider} /></div></div>
</div>

<style>
  .bogen { position: relative; }
  .bogen__scaler { position: absolute; top: 0; left: 0; }
  /* The pages side by side, all at one scale: a sheet is as big beside another as it is in print. */
  .bogen :global(.ps-sheet--paged) { display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 12mm; width: max-content; }
  /* Shown, they wrap into the room there is: never a page off to the side. */
  .bogen--reihe :global(.ps-sheet--paged) { flex-wrap: wrap; width: var(--reihe); max-width: var(--reihe); }
  .bogen :global(.ps-paper + .ps-paper) { margin-top: 0; }
  /* Stacked, a page takes the sheet's width; side by side it has to be told its
     own, or it shrinks to what is on it and a landscape page stands upright. */
  .bogen :global(.ps-sheet--paged > *) { flex: none; }
  .bogen :global(.ps-sheet--paged > .ps-page) { width: var(--page-w); }
</style>
