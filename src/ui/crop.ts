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
export const FRAME = 0.84;
export const MARGIN = (1 - FRAME) / 2 * 100;

/** How far the slider goes in. Four times is a face out of a group photo. */
export const CLOSEST = 4;

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

/** A picture that is worth asking about, and what it measures. */
export interface Loaded {
  /** The object URL the crop draws from. Let go of by `close()`. */
  url: string;
  wide: number;
  high: number;
  /** The name the file arrived under, kept so the square can be named after it. */
  name: string;
  close(): void;
}

/**
 * Loads a file and says whether there is a square to ask about, or `null` when
 * there is nothing to ask.
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
export async function cropSquare(file: Blob, name: string): Promise<Loaded | null> {
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

  return { url, wide, high, name, close: () => URL.revokeObjectURL(url) };
}

/**
 * Cuts the chosen square out of a loaded picture, at the picture's own
 * resolution. See `typeFor` above for why the format follows the source rather
 * than always being PNG.
 */
export async function cutSquare(
  picture: HTMLImageElement, at: { x: number; y: number; side: number }, type: string,
): Promise<Blob> {
  const out = Math.max(1, Math.round(at.side));
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  /*
   * Display P3, not the default sRGB.
   *
   * A 2d canvas is sRGB unless it is asked otherwise, and drawImage() colour
   * manages into whatever the canvas is — so every colour the photograph had
   * outside sRGB was clamped on the way in, and the square came out of here
   * duller than the picture that went into it. On a phone that is most of
   * what makes a photograph look like anything: skies, skin, a red coat.
   * Measured before this line existed: a P3 red of (254, 0, 0) was stored as
   * (235, 50, 36).
   *
   * It only ever showed on some pictures, which is what made it hard to
   * believe — a photograph that is already square never reaches this
   * function and keeps its own bytes untouched.
   *
   * Safe the other way round too: an sRGB source converts into P3 exactly,
   * and comes back out tagged, so nothing that looked right starts looking
   * different. A browser that does not know the option ignores it and gives
   * the sRGB context it always gave.
   */
  const context = canvas.getContext('2d', { colorSpace: 'display-p3' });
  if (!context) throw new Error('this browser gave no 2d canvas to cut a picture on');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(picture, at.x, at.y, at.side, at.side, 0, 0, out, out);
  const wanted = typeFor(type);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, wanted, wanted === 'image/jpeg' ? JPEG_QUALITY : undefined));
  if (!blob) throw new Error('this browser would not encode the picture');
  return blob;
}

/**
 * What a cropped file is called.
 *
 * The bytes are ones bildhaft has just drawn, so the chosen name's extension is
 * no longer necessarily true of them. The name is shown to a person picking a
 * picture out of their library, so it stays recognisably theirs; only the
 * extension follows what was actually written.
 */
export function cropName(name: string, type: string): string {
  const stem = name.replace(/\.[^./\\]*$/, '');
  return `${stem}${type === 'image/jpeg' ? '.jpg' : '.png'}`;
}
