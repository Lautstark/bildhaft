/**
 * The small copy of a picture of the user's own, for the screen.
 *
 * Why there is one at all: a photo a phone took is around twelve megapixels,
 * and a browser decodes every one of them to draw it — the size of the box on
 * screen does not come into it. Measured on a Sammlung holding twelve such
 * photos: 175 ms of decoding and **558 MB** of bitmap, against 8 ms and 2.3 MB
 * for the same pictures at 256 px. The megabytes are the worse half: once the
 * browser starts discarding bitmaps that large it decodes them again on the
 * next scroll, and that is what „es wird immer langsamer" looked like.
 *
 * What this is not: a replacement. The picture itself stays exactly as it
 * arrived, and paper, PDFs and exports are drawn from it — see `ui/symbols.ts`,
 * which asks for the one or the other. This is a second rendition of it, kept
 * beside it, and it can be thrown away and made again at any time.
 */

/**
 * The longest edge a thumbnail is made at.
 *
 * It has to cover the largest box the screen ever draws an own picture in, and
 * on a device that has two physical pixels per CSS pixel. The largest is a
 * field's picture in a Sammlung — `.slot__img` is a 68 mm chip, which is 257
 * CSS px — so 512 covers it at 2×, with the picker's tile and a Wortschatz row
 * well inside that.
 *
 * A card on a very wide Tafel can be drawn larger than that, and there the
 * picture is softer than the original would be. That is the trade this file is:
 * a 512 px picture is a megabyte of bitmap and a 12 MP one is forty-eight, and
 * what goes on paper is the original either way.
 */
const EDGE = 512;

/** What a thumbnail is written as. JPEG for a photograph; PNG keeps a cut-out's
 *  transparency, which a picture cropped to a square may well have. */
const keepsAlpha = (type: string): boolean => type === 'image/png' || type === 'image/webp';

/**
 * A small copy of `picture`, or null where one cannot be made.
 *
 * Null is a real answer and the caller treats it as "draw the original": the
 * APIs this needs are a browser's (the unit tests run in node, where
 * `createImageBitmap` does not exist), a picture may be a format the decoder
 * will not take, and neither is a reason for a save to fail. A picture already
 * smaller than the edge is left alone — a copy of it would be no smaller and
 * would cost a second decode to make.
 */
export async function makeThumb(picture: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(picture);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= EDGE) return null;

    const scale = EDGE / longest;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const paint = canvas.getContext('2d');
    if (!paint) return null;
    paint.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob(keepsAlpha(picture.type)
      ? { type: 'image/png' }
      : { type: 'image/jpeg', quality: 0.86 });
  } catch {
    /* A picture the decoder would not take is still a picture the browser may
       well draw from an <img>. Nothing is lost by having no thumbnail of it. */
    return null;
  } finally {
    bitmap?.close();
  }
}
