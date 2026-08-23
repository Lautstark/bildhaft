import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportEverything } from '../../src/db/exportImport.ts';
import {
  clearEverything, createCollection, newId, putOverride, putOwnImage, putSentence,
} from '../../src/db/repo.ts';

/**
 * What may reach a folder that is very likely inside Dropbox.
 *
 * METACOM is licensed per person. Nothing derived from a user's licensed
 * folder may leave the browser — not the images, and **not even a filename
 * index**. The standing backup writes to a folder the user chose, and the
 * whole point of choosing one is that a sync client picks it up; so a write
 * there is a transmission, and this file is where that is checked.
 *
 * These are licensing checks. A failure here is not a bug to triage, it is a
 * licence being broken.
 */
describe('what the standing backup is handed', () => {
  // The database outlives a test in this file, and a picture left behind by
  // one would make the next one's "no bytes" assertion pass or fail on
  // ordering rather than on what it is checking.
  beforeEach(() => clearEverything());

  /*
   * The wiring, asserted against the source.
   *
   * A behavioural test cannot catch the failure that matters here. If somebody
   * changes app.ts to hand Sicherung a raw dump of the database — or anything
   * other than the audited export — every other test in this repo still
   * passes, and the backup keeps working. It would simply also be shipping
   * METACOM filenames to Dropbox. So the constructor call itself is the thing
   * under test.
   */
  it('is constructed with exportEverything and nothing else', () => {
    const source = readFileSync(new URL('../../src/app.ts', import.meta.url), 'utf8');
    const calls = [...source.matchAll(/new Sicherung\(([^)]*)\)/g)].map((m) => m[1]);

    expect(calls, 'expected exactly one standing backup in this app').toHaveLength(1);
    expect(calls[0]).toContain('produce: exportEverything');
    // Named, so that adding a second inlet has to change this line on purpose.
    expect(calls[0].replace(/\s+/g, ' ').trim())
      .toBe("{ app: 'bildhaft', produce: exportEverything }");
  });

  it('carries symbol references, never symbol bytes', async () => {
    const collection = await createCollection('Küche');
    await putSentence({
      id: newId(),
      collectionId: collection.id,
      rawInput: 'Ich möchte Wasser',
      normalizedInput: 'ich möchte wasser',
      slots: [{
        id: newId(),
        sourceToken: 'Wasser',
        concept: 'wasser',
        origin: 'word',
        // A METACOM choice is an id, and an id is all it is.
        choice: { metacom: 'METACOM_wasser_01', arasaac: '2483' },
        candidates: { metacom: [{ id: 'METACOM_wasser_01', label: 'Wasser', score: 1 }] },
        ownImage: null,
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const json = JSON.stringify(await exportEverything());

    // No bytes, by any of the routes bytes travel.
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('base64');
    // No path into anybody's licensed folder.
    expect(json).not.toMatch(/\.(png|jpe?g|svg|webp|emf|wmf)\b/i);
    expect(json).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//);
  });

  it('carries the user\'s own pictures, because those are theirs', async () => {
    const collection = await createCollection('Familie');
    const image = await putOwnImage(
      new File([new Uint8Array([137, 80, 78, 71])], 'oma.png', { type: 'image/png' }),
    );
    await putSentence({
      id: newId(),
      collectionId: collection.id,
      rawInput: 'Oma kommt',
      normalizedInput: 'oma kommt',
      slots: [{
        id: newId(), sourceToken: 'Oma', concept: 'oma', origin: 'word',
        choice: {}, candidates: {}, ownImage: image.id,
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const backup = await exportEverything();

    // The one exception, and it is the user's own file rather than a licensed
    // one — a backup that dropped it would quietly lose things.
    expect(backup.ownImages?.some((one) => one.data.startsWith('data:'))).toBe(true);
  });

  it('says in the file itself what it does and does not contain', async () => {
    await createCollection('Küche');
    await putOverride('metacom', 'Wasser', 'METACOM_wasser_01', 'Wasser');

    const backup = await exportEverything();

    // The notice travels with the file, so somebody who receives one can tell
    // whether they are allowed to open it without asking us.
    expect(backup.notice).toContain('keine Bilddateien');
  });
});
