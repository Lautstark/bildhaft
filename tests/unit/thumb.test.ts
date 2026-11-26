import { beforeEach, describe, expect, it } from 'vitest';
import { exportEverything } from '../../src/db/exportImport.ts';
import {
  clearEverything, getOwnImage, onChanged, putOwnImage, rememberThumb,
} from '../../src/db/repo.ts';
import { makeThumb } from '../../src/db/thumb.ts';

/**
 * The small copy of a picture of the user's own.
 *
 * It exists because a phone's photo is twelve megapixels and a browser decodes
 * all of them however small the box is — 558 MB of bitmap for twelve pictures
 * in one Sammlung, against 2.3 MB at 256 px. What the cases here hold is the
 * other half of that: **it is derived, so it must not behave like a record.**
 * It does not travel, it announces nothing, and losing it costs nothing because
 * it can be made again from the picture beside it.
 *
 * Making one needs a browser (`createImageBitmap`, `OffscreenCanvas`), which
 * node has not got, so that half is asserted in `e2e/ownimage.spec.ts` — "is
 * drawn small on screen and whole on paper", which measures both pictures.
 * Here the point is what happens to a thumbnail once there is one.
 */

const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
const thumbBytes = () => new Blob([new Uint8Array([255, 216, 255, 224, 1, 2, 3])], { type: 'image/jpeg' });

beforeEach(async () => {
  await clearEverything();
});

describe('a picture and its small copy', () => {
  it('answers null where it cannot be made, so the picture itself is drawn', async () => {
    /* Node has no `createImageBitmap`, which is this case in the plainest
       form: no thumbnail is not a failure, it is "draw the original". The
       browser cases that do make one are in e2e/ownimage.spec.ts. */
    expect(await makeThumb(png())).toBeNull();
  });

  it('is kept beside the picture without announcing a change', async () => {
    const image = await putOwnImage(png(), 'oma.png');
    let heard = 0;
    const stop = onChanged(() => { heard += 1; });
    await rememberThumb(image.id, thumbBytes());
    stop();

    const held = await getOwnImage(image.id);
    expect(held?.thumb).toBeInstanceOf(Blob);
    expect(held?.blob).toBeInstanceOf(Blob);
    /* Nothing was told: a thumbnail made the first time an old picture is
       drawn must not file a backup, and the folder's copy of the record does
       not change. See `rememberThumb`. */
    expect(heard).toBe(0);
  });

  it('is not written for a picture that has gone in the meantime', async () => {
    await rememberThumb('weg', thumbBytes());
    expect(await getOwnImage('weg')).toBeUndefined();
  });

  it('stays out of an export, which carries the picture itself', async () => {
    const image = await putOwnImage(png(), 'oma.png');
    await rememberThumb(image.id, thumbBytes());

    const whole = await exportEverything(true);
    expect(whole.ownImages).toHaveLength(1);
    const [packed] = whole.ownImages!;
    /* The picture travels as bytes — the one thing that may — and the copy
       made for the screen does not travel at all: it is derived from those
       same bytes, and a second rendition in the file would be a second thing
       to keep in step. */
    expect(JSON.stringify(packed)).not.toContain('thumb');
  });
});
