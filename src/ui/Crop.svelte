<script lang="ts">
  /**
   * Cutting a picture of the user's own down to a square, before it is stored.
   * crop.ts beside this file has the why; what is here is the square, the
   * slider and the two ways of moving them.
   *
   * ## The model
   *
   * A square of `side` source pixels at `(x, y)`. Zooming shrinks `side` about
   * its own centre, dragging moves `(x, y)`, and both are clamped so the square
   * can never leave the picture — which is what makes an empty corner
   * impossible without a guard at the drawing end.
   *
   * The picture is placed in percentages of the box rather than in pixels, so
   * nothing is measured except while a drag is actually happening. A dialog that
   * is resized, or opened at a width nobody predicted, stays right by itself.
   */
  import { CLOSEST, FRAME, MARGIN, cutSquare, type Loaded } from './crop.ts';
  import { t } from '../i18n/index.ts';

  let { loaded, type }: { loaded: Loaded; type: string } = $props();

  /* Read once, on purpose: the block that draws this component is keyed on the
     picture, so a different file is a different component rather than a new
     value in this one. */
  // svelte-ignore state_referenced_locally
  const full = Math.min(loaded.wide, loaded.high);
  let side = $state(full);
  // svelte-ignore state_referenced_locally
  let x = $state((loaded.wide - full) / 2);
  // svelte-ignore state_referenced_locally
  let y = $state((loaded.high - full) / 2);
  let zoom = $state(100);

  let box: HTMLElement;
  let picture: HTMLImageElement;

  function clamp(): void {
    side = Math.min(side, full);
    x = Math.min(Math.max(x, 0), loaded.wide - side);
    y = Math.min(Math.max(y, 0), loaded.high - side);
  }

  /*
   * Where the picture sits, in percentages of the box. `scale` is how much of the
   * box's width one source pixel takes: the square is FRAME of the box, so a
   * picture `wide` pixels across is `wide * scale` of it. The offsets put source
   * pixel (x, y) on the frame's top left corner, MARGIN in from both edges.
   * Height follows the width, and the box being square is what makes a
   * percentage of it mean the same vertically.
   */
  let scale = $derived(FRAME * 100 / side);

  function zoomed(next: number): void {
    /*
     * About the square's own centre, not its corner. A corner is one line
     * shorter and sends whatever has just been centred sliding off towards
     * the bottom right, so the slider would undo every drag before it.
     */
    zoom = next;
    const factor = next / 100;
    const midX = x + side / 2;
    const midY = y + side / 2;
    side = full / factor;
    x = midX - side / 2;
    y = midY - side / 2;
    clamp();
  }

  /*
   * Dragging. Pointer events with capture, so a finger or a pen works and a drag
   * that leaves the box follows the pointer instead of stopping at the edge.
   *
   * The box is measured here rather than earlier: it is inside a dialog laid out
   * as it opens, and a width read while building is the width of nothing yet.
   * FRAME is in the conversion because a source pixel is measured against the
   * square, not against the box around it.
   */
  let dragging = 0;
  function down(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const perPixel = side / (box.clientWidth * FRAME);
    const fromX = event.clientX;
    const fromY = event.clientY;
    const wasX = x;
    const wasY = y;
    dragging = event.pointerId;
    box.setPointerCapture(dragging);

    const move = (moved: PointerEvent): void => {
      if (moved.pointerId !== dragging) return;
      // Backwards on purpose: dragging the picture right shows more of its left
      // side, so the square being kept moves left.
      x = wasX - (moved.clientX - fromX) * perPixel;
      y = wasY - (moved.clientY - fromY) * perPixel;
      clamp();
    };
    const stop = (ended: PointerEvent): void => {
      if (ended.pointerId !== dragging) return;
      dragging = 0;
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', stop);
      box.removeEventListener('pointercancel', stop);
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
  }

  /*
   * The keyboard. The step is a share of the square rather than a count of source
   * pixels, so an arrow moves the same visible amount on a 400px scan and on a
   * 4000px photograph.
   *
   * Zoom is not here: the slider is a native range and already answers the arrow
   * keys when it has focus. Two sets of zoom keys would be two answers to one
   * question — and Enter is the dialog's, which is why only the four are taken.
   */
  function keys(event: KeyboardEvent): void {
    const step = side * 0.04;
    if (event.key === 'ArrowLeft') x -= step;
    else if (event.key === 'ArrowRight') x += step;
    else if (event.key === 'ArrowUp') y -= step;
    else if (event.key === 'ArrowDown') y += step;
    else return;
    event.preventDefault();
    // And stopped, or the picker's own Enter/key handling sees a keystroke that
    // was meant for the picture.
    event.stopPropagation();
    clamp();
  }

  export function focus(): void { box.focus(); }
  export const cut = (): Promise<Blob> => cutSquare(picture, { x, y, side }, type);
</script>

<!-- Focusable, because the arrow keys above are the only way to move the
     square without a pointer, and named, because it is a control rather than a
     picture being shown. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div bind:this={box} class="crop" tabindex="0" role="group" aria-label={t('ui.crop_title')} onpointerdown={down} onkeydown={keys}><img bind:this={picture} class="crop__img" src={loaded.url} alt="" draggable="false" style:width="{loaded.wide * scale}%" style:left="{MARGIN - x * scale}%" style:top="{MARGIN - y * scale}%" /><div class="crop__frame"></div></div><div class="crop__row"><input class="crop__zoom" type="range" min="100" max={CLOSEST * 100} step="1" value={zoom} aria-label={t('ui.zoom_in')} oninput={(event) => zoomed(Number(event.currentTarget.value))} /></div>
