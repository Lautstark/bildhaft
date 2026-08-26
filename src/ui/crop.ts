import { el } from './dom.ts';
import { t } from '../i18n/index.ts';

/**
 * Cutting a picture of the user's own down to a square, before it is stored.
 *
 * ## Why
 *
 * Every box bildhaft shows a symbol in is square — the 68px chip in a row, the
 * 82px tile in the picker, and `--sym` on paper, which is 40mm by 40mm. All of
 * them fit with `object-fit: contain`, so a photograph off a phone has always
 * worked and has never filled its card: a 4:3 picture leaves a quarter of a
 * laminated card blank and the child in it smaller than the pictogram beside
 * him. The crop is about filling the card, not about fixing a fault.
 *
 * ## Only ever the user's own file
 *
 * A symbol from a source is not cropped and must not be. METACOM is read out of
 * a licensed folder and never copied, ARASAAC pictograms are already square line
 * art, and a crop of either would be a derivative bildhaft has no business
 * writing. This hangs off the one path that already keeps bytes.
 *
 * ## The model
 *
 * A square of `side` source pixels at `(x, y)`. Zooming shrinks `side` about its
 * own centre, dragging moves `(x, y)`, and both are clamped so the square can
 * never leave the picture — which is what makes an empty corner impossible
 * without a guard at the drawing end.
 *
 * The picture is placed in percentages of the box rather than in pixels, so
 * nothing is measured except while a drag is actually happening. A dialog that
 * is resized, or opened at a width nobody predicted, stays right by itself.
 */

/*
 * How much of the box the kept square takes. The rest shows what is about to be
 * cut off: somebody moving a face into the middle needs to see the shoulder that
 * is leaving, not only the part that stays.
 */
const FRAME = 0.84;
const MARGIN = (1 - FRAME) / 2 * 100;

/** How far the slider goes in. Four times is a face out of a group photo. */
const CLOSEST = 4;

/**
 * What the square is written as.
 *
 * Not always PNG, which is the one place this differs from the same step in
 * vorlaut. print.css says it outright — never upscale past the source, never
 * downscale before printing — so the square is cut at the picture's own
 * resolution rather than at some tile size, and a 12-megapixel photograph
 * re-encoded as PNG would multiply what the database holds and what every
 * exported backup carries as a data: URL. A JPEG stays a JPEG; anything else
 * becomes PNG, because it may have transparency and a ground colour chosen here
 * would be wrong against a printed card.
 */
const JPEG_QUALITY = 0.92;
const typeFor = (source: string): string =>
  source === 'image/jpeg' || source === 'image/jpg' ? 'image/jpeg' : 'image/png';

/** A picture waiting to be cut, and the elements that show it. */
export interface Cropper {
  /** The square box. Goes wherever the crop is shown. */
  box: HTMLElement;
  /** The zoom slider, to go under it. */
  zoom: HTMLElement;
  /** The chosen square, as an image file. */
  cut: () => Promise<Blob>;
  /** Lets go of what the picture was loaded from. Every way out calls it. */
  close: () => void;
}

/**
 * Loads a file and hands back the crop, or `null` when there is nothing to ask.
 *
 * Two silences, both meaning "keep the file exactly as it is", because that is
 * what happened before this step existed and neither is worth a sentence:
 *
 * - the picture is already square, so the crop would only ask for a decision the
 *   picture has already made. It also keeps the original bytes rather than
 *   re-encoding them for no gain.
 * - the browser could not read a size off it — an SVG with no intrinsic size, or
 *   a file that is not a picture at all.
 */
export async function cropSquare(file: Blob): Promise<Cropper | null> {
  const url = URL.createObjectURL(file);
  const picture = new Image();
  picture.src = url;
  try {
    await picture.decode();
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }

  const wide = picture.naturalWidth;
  const high = picture.naturalHeight;
  // Two per cent rather than exactly equal: a 500x510 scan is square as far as
  // anybody looking at a card is concerned.
  if (!wide || !high || Math.abs(wide - high) <= Math.max(wide, high) * 0.02) {
    URL.revokeObjectURL(url);
    return null;
  }

  const full = Math.min(wide, high);
  let side = full;
  let x = (wide - full) / 2;
  let y = (high - full) / 2;

  const clamp = (): void => {
    side = Math.min(side, full);
    x = Math.min(Math.max(x, 0), wide - side);
    y = Math.min(Math.max(y, 0), high - side);
  };

  /*
   * Where the picture sits, in percentages of the box. `scale` is how much of the
   * box's width one source pixel takes: the square is FRAME of the box, so a
   * picture `wide` pixels across is `wide * scale` of it. The offsets put source
   * pixel (x, y) on the frame's top left corner, MARGIN in from both edges.
   * Height follows the width, and the box being square is what makes a
   * percentage of it mean the same vertically.
   */
  const place = (): void => {
    const scale = FRAME * 100 / side;
    picture.style.width = `${wide * scale}%`;
    picture.style.left = `${MARGIN - x * scale}%`;
    picture.style.top = `${MARGIN - y * scale}%`;
  };

  picture.alt = '';
  picture.className = 'crop__img';
  picture.draggable = false;

  const box = el('div', {
    class: 'crop',
    // Focusable, because the arrow keys below are the only way to move the
    // square without a pointer, and named, because it is a control rather than
    // a picture being shown.
    attrs: { tabindex: 0, role: 'group', 'aria-label': t('ui.crop_title') },
  }, picture, el('div', { class: 'crop__frame' }));

  const slider = el('input', {
    class: 'crop__zoom',
    attrs: {
      type: 'range', min: 100, max: CLOSEST * 100, step: 1, value: 100,
      'aria-label': t('ui.zoom_in'),
    },
    on: {
      input: () => {
        /*
         * About the square's own centre, not its corner. A corner is one line
         * shorter and sends whatever has just been centred sliding off towards
         * the bottom right, so the slider would undo every drag before it.
         */
        const factor = Number(slider.value) / 100;
        const midX = x + side / 2;
        const midY = y + side / 2;
        side = full / factor;
        x = midX - side / 2;
        y = midY - side / 2;
        clamp();
        place();
      },
    },
  });

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
  box.addEventListener('pointerdown', (event) => {
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
      place();
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
  });

  /*
   * The keyboard. The step is a share of the square rather than a count of source
   * pixels, so an arrow moves the same visible amount on a 400px scan and on a
   * 4000px photograph.
   *
   * Zoom is not here: the slider is a native range and already answers the arrow
   * keys when it has focus. Two sets of zoom keys would be two answers to one
   * question — and Enter is the dialog's, which is why only the four are taken.
   */
  box.addEventListener('keydown', (event) => {
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
    place();
  });

  place();

  return {
    box,
    zoom: el('div', { class: 'crop__row' }, slider),
    cut: async (): Promise<Blob> => {
      // At the picture's own resolution. See typeFor() above for why the format
      // follows the source rather than always being PNG.
      const out = Math.max(1, Math.round(side));
      const canvas = el('canvas');
      canvas.width = out;
      canvas.height = out;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('this browser gave no 2d canvas to cut a picture on');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(picture, x, y, side, side, 0, 0, out, out);
      const type = typeFor(file.type);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined));
      if (!blob) throw new Error('this browser would not encode the picture');
      return blob;
    },
    close: () => URL.revokeObjectURL(url),
  };
}

/**
 * What a cropped file is called.
 *
 * The bytes are one bildhaft has just drawn, so the chosen name's extension is
 * no longer necessarily true of them. The name is shown to a person picking a
 * picture out of their library, so it stays recognisably theirs; only the
 * extension follows what was actually written.
 */
export function cropName(name: string, type: string): string {
  const stem = name.replace(/\.[^./\\]*$/, '');
  return `${stem}${type === 'image/jpeg' ? '.jpg' : '.png'}`;
}
