import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';

/**
 * Every write to the library must reach `onChanged`, because that notifier is
 * the only thing standing between an edit and the standing backup.
 *
 * This is a guard against a specific, quiet failure: somebody adds a
 * thirteenth mutator next year, never having heard of the backup, and the
 * library simply stops being saved. Nothing else in the suite would notice —
 * the feature keeps working for the twelve that were wired, which is exactly
 * how it would go unreported.
 *
 * The list is written out rather than derived from the module's exports. A
 * derived list would let a new mutator name itself outside the pattern and
 * pass, and would also have to guess which exports are reads.
 */
const MUTATORS = [
  'saveSettings',
  'createCollection',
  'putCollection',
  'renameCollection',
  'saveCollectionProvider',
  'deleteCollectionDeep',
  'putSentence',
  'deleteSentence',
  'clearEverything',
  'putOverride',
  'setOverrideTags',
  'deleteOverride',
  'putOwnImage',
  'saveOwnImage',
  'pruneOwnImages',
] as const;

/**
 * The folder direction: exports that move records between the library and the
 * folder that holds it. They are not reads, and they are not mutators in the
 * sense this file means — they change nothing at all unless a folder is the
 * store, which is a state this suite has no way to enter and no business
 * faking. `pullFromFolder` notifies when it replaces the library; that it does
 * so is tested where a folder can be stood up, in sicherung's own suite and in
 * the ones that mock the folder module.
 *
 * They are named here rather than left out so the completeness check keeps its
 * promise: a new export nobody classified still fails.
 */
const FOLDER = ['pullFromFolder', 'adoptFolder'];

/** Reads, listed so the completeness check below can tell the two apart. */
const READS = [
  'defaultSettings', 'loadSettings', 'listCollections', 'getCollection',
  'defaultCollectionName', 'listSentences', 'findByNormalized', 'searchSentences',
  'countSentences', 'libraryTotals', 'listOverrides', 'listAllOverrides', 'overrideMap',
  'getOwnImage', 'listOwnImages', 'newId', 'onChanged',
];

describe('the change notifier', () => {
  let heard = 0;
  let stop = () => {};

  beforeEach(() => {
    heard = 0;
    stop();
    stop = repo.onChanged(() => { heard++; });
  });

  /**
   * One call per mutator, with arguments good enough to reach the write. The
   * point is not what each one does — that is tested by its own behaviour
   * elsewhere — only that it announces itself.
   */
  const call: Record<(typeof MUTATORS)[number], () => Promise<unknown>> = {
    saveSettings: () => repo.saveSettings(repo.defaultSettings()),
    createCollection: () => repo.createCollection('Test'),
    putCollection: async () => {
      const made = await repo.createCollection('Test');
      heard = 0;
      return repo.putCollection({ ...made, name: 'Anders' });
    },
    renameCollection: async () => {
      const made = await repo.createCollection('Test');
      heard = 0;
      return repo.renameCollection(made.id, 'Neu');
    },
    saveCollectionProvider: async () => {
      const made = await repo.createCollection('Test');
      heard = 0;
      return repo.saveCollectionProvider(made.id, 'metacom');
    },
    deleteCollectionDeep: async () => {
      const made = await repo.createCollection('Test');
      heard = 0;
      return repo.deleteCollectionDeep(made.id);
    },
    putSentence: async () => {
      const made = await repo.createCollection('Test');
      heard = 0;
      return repo.putSentence(sentence(made.id));
    },
    deleteSentence: async () => {
      const made = await repo.createCollection('Test');
      const one = sentence(made.id);
      await repo.putSentence(one);
      heard = 0;
      return repo.deleteSentence(one.id);
    },
    clearEverything: () => repo.clearEverything(),
    putOverride: () => repo.putOverride('arasaac', 'Hund', { id: '123', label: 'Hund', score: 100 }),
    setOverrideTags: async () => {
      await repo.putOverride('arasaac', 'Hund', { id: '123', label: 'Hund', score: 100 });
      heard = 0;
      return repo.setOverrideTags('arasaac', 'Hund', ['Tiere']);
    },
    deleteOverride: async () => {
      await repo.putOverride('arasaac', 'Hund', { id: '123', label: 'Hund', score: 100 });
      heard = 0;
      return repo.deleteOverride('arasaac', 'Hund');
    },
    putOwnImage: () => repo.putOwnImage(
      new File([new Uint8Array([1, 2, 3])], 'bild.png', { type: 'image/png' }),
      'bild.png',
    ),
    saveOwnImage: async () => {
      const image = await repo.putOwnImage(
        new File([new Uint8Array([1])], 'b.png', { type: 'image/png' }),
        'b.png',
      );
      heard = 0;
      return repo.saveOwnImage({ ...image, name: 'anders.png' });
    },
    pruneOwnImages: async () => {
      await repo.putOwnImage(
        new File([new Uint8Array([1])], 'weg.png', { type: 'image/png' }), 'weg.png');
      heard = 0;
      return repo.pruneOwnImages();
    },
  };

  for (const name of MUTATORS) {
    it(`${name}() announces the write`, async () => {
      await call[name]();
      expect(heard, `${name}() wrote without calling touched()`).toBeGreaterThan(0);
    });
  }

  it('accounts for every export, so a new one cannot slip in unclassified', () => {
    const exported = Object.keys(repo).sort();
    const known = [...MUTATORS, ...READS, ...FOLDER].sort();
    expect(exported).toEqual(known);
  });

  it('stops telling a listener that unsubscribed', async () => {
    stop();
    await repo.createCollection('Test');
    expect(heard).toBe(0);
  });
});

function sentence(collectionId: string) {
  return {
    id: repo.newId(),
    collectionId,
    rawInput: 'Ich möchte Wasser',
    normalizedInput: 'ich möchte wasser',
    slots: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
