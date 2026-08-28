import { beforeEach, describe, expect, it } from 'vitest';
import { sentenceCaption, type Sentence } from '../../src/core/types.ts';
import { exportCollection, importCollectionFile } from '../../src/db/exportImport.ts';
import {
  clearEverything, createCollection, getCollection, listSentences, newId, putSentence,
  searchSentences,
} from '../../src/db/repo.ts';

/**
 * A row's name and the words it was made with.
 *
 * A row is not always a sentence. „waschen, einseifen, abtrocknen" is a way of
 * *searching* for three symbols to stand in a row, and that row wants to be
 * called „Hände waschen". These tests hold the two apart: the name is free, the
 * typed line stays the key the app matched and remembers on, and neither
 * disappears when the other is used.
 */

const line = (over: Partial<Sentence> = {}): Sentence => ({
  id: newId(),
  collectionId: 'c1',
  rawInput: 'waschen einseifen abtrocknen',
  normalizedInput: 'waschen einseifen abtrocknen',
  slots: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('what a row is called', () => {
  it('is the typed line until it is given a name', () => {
    expect(sentenceCaption(line())).toBe('waschen einseifen abtrocknen');
    expect(sentenceCaption(line({ title: 'Hände waschen' }))).toBe('Hände waschen');
  });

  /* Absent, null and blank are one state — "never named" and "name cleared"
     have to read alike, or clearing a name would leave a row called nothing. */
  it('is the typed line again when the name is taken off', () => {
    for (const title of [null, '', '   ']) {
      expect(sentenceCaption(line({ title }))).toBe('waschen einseifen abtrocknen');
    }
  });
});

describe('searching a library that has named rows in it', () => {
  beforeEach(async () => {
    await clearEverything();
    const collection = await createCollection('Alltagsroutinen');
    await putSentence(line({
      collectionId: collection.id,
      title: 'Hände waschen',
    }));
    await putSentence(line({
      collectionId: collection.id,
      rawInput: 'Der Hund schläft',
      normalizedInput: 'der hund schläft',
    }));
  });

  it('finds a named row by its name', async () => {
    expect((await searchSentences('hände')).map(sentenceCaption)).toEqual(['Hände waschen']);
  });

  /* The point of keeping `rawInput`: the words that fetched the symbols would
     otherwise become unfindable the moment somebody named the row. */
  it('finds it by what was typed as well', async () => {
    expect((await searchSentences('einseifen')).map(sentenceCaption)).toEqual(['Hände waschen']);
  });

  it('reports a row that matches both ways once, not twice', async () => {
    // "waschen" is in the name and in the typed line.
    expect(await searchSentences('waschen')).toHaveLength(1);
  });

  it('leaves an unnamed row answering to its own words', async () => {
    expect((await searchSentences('hund')).map(sentenceCaption)).toEqual(['Der Hund schläft']);
  });
});

describe('a collection handed to somebody else', () => {
  beforeEach(() => clearEverything());

  it('arrives with its rows named as they were, and still says what was typed', async () => {
    const made = await createCollection('Alltagsroutinen');
    await putSentence(line({ collectionId: made.id, title: 'Hände waschen' }));

    const file = await exportCollection((await getCollection(made.id))!);
    const imported = await importCollectionFile(
      new File([JSON.stringify(file)], 'sammlung.json', { type: 'application/json' }),
    );

    const [arrived] = await listSentences(imported.collection.id);
    expect(arrived?.title).toBe('Hände waschen');
    expect(arrived?.rawInput).toBe('waschen einseifen abtrocknen');
  });
});
