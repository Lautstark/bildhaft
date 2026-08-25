import { beforeEach, describe, expect, it } from 'vitest';
import {
  exportCollection, exportEverything, importCollectionFile,
} from '../../src/db/exportImport.ts';
import {
  clearEverything, createCollection, getCollection, newId, putSentence,
  saveCollectionProvider,
} from '../../src/db/repo.ts';

/**
 * The promise on the front of every exported file, asserted rather than
 * assumed: it „kann unabhängig davon geteilt werden, welche Symbolsammlung die
 * Empfängerin oder der Empfänger besitzt".
 *
 * That promise is what let conventions.md §3.10 exempt bildhaft's symbol source
 * from being a property of the Sammlung — and it is the one thing making the
 * source a property of the Sammlung could have broken. A collection now holds
 * which source it is drawn in; write that into a file and the file names one
 * library as the answer, which is exactly what the notice says it does not do.
 *
 * So this is a licensing-adjacent check like backup-payload.test.ts beside it,
 * not a feature test. A failure here means a file has started telling somebody
 * without a METACOM licence to open a collection in METACOM.
 */
describe('what a shared collection file says about symbol sources', () => {
  beforeEach(() => clearEverything());

  async function collectionUsingMetacom(name: string) {
    const collection = await createCollection(name);
    await saveCollectionProvider(collection.id, 'metacom');
    await putSentence({
      id: newId(),
      collectionId: collection.id,
      rawInput: 'Ich möchte Wasser',
      normalizedInput: 'ich möchte wasser',
      slots: [{
        id: newId(),
        sourceToken: 'Wasser',
        concept: 'wasser',
        origin: 'lemma',
        // Both sources answered, which is what makes the row portable at all.
        choice: { metacom: 'METACOM_wasser_01', arasaac: '2483' },
        candidates: {},
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return (await getCollection(collection.id))!;
  }

  it('does not name the source this browser draws it in', async () => {
    const collection = await collectionUsingMetacom('Küche');
    expect(collection.provider, 'the fixture itself has to hold one').toBe('metacom');

    const file = await exportCollection(collection);

    expect(file.collection.provider).toBeUndefined();
    // Not merely absent from the object: absent from the bytes that travel.
    expect(JSON.stringify(file.collection)).not.toContain('metacom');
  });

  it('so a recipient opens it in whatever source they have', async () => {
    const collection = await collectionUsingMetacom('Grüffelo');
    const file = await exportCollection(collection);

    const imported = await importCollectionFile(
      new File([JSON.stringify(file)], 'sammlung.json', { type: 'application/json' }),
    );

    // No answer of its own means it follows the reader's default, which for
    // somebody without a licence is ARASAAC — and the slots resolve there
    // because the choice was stored per provider.
    expect((await getCollection(imported.collection.id))?.provider).toBeUndefined();
  });

  it('but a backup keeps it, because that file comes home', async () => {
    await collectionUsingMetacom('Küche');

    const backup = await exportEverything();

    // The opposite case on purpose: a Sicherung exists to put this library back
    // as it was, on the machine whose METACOM folder is real.
    expect(backup.collections[0]?.provider).toBe('metacom');
  });
});
