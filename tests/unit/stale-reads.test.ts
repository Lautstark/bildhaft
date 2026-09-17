import { describe, expect, it } from 'vitest';
import {
  createCollection, isWriting, mark, newId, putCollection, putSentence, writtenSince,
} from '../../src/db/repo.ts';
import type { Sentence } from '../../src/core/types.ts';

/**
 * The window in which the screen is ahead of the store.
 *
 * bildhaft draws from memory and writes afterwards, so between the two there is
 * a moment where the store still holds the record from before the edit. Every
 * „it jumped back" came out of that moment: something refilled memory from the
 * store while a write was in the air — a moved card returning to the tray, a
 * renamed Sammlung going blank, a chosen symbol reverting a second later.
 *
 * Two questions close it, and both are needed. `isWriting` covers a read that
 * answers while the write is still out. `writtenSince` covers the other half:
 * a read that *started* first and answered afterwards, which finds nothing in
 * flight and is behind all the same.
 */
const aSentence = (collectionId: string): Sentence => ({
  id: newId(),
  normalizedInput: 'hallo',
  rawInput: 'Hallo',
  slots: [],
  collectionId,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('a read racing a write', () => {
  it('says a record is being written while its write is in the air', async () => {
    const collection = await createCollection('Test');
    const one = aSentence(collection.id);
    await putSentence(one);

    const inAir = putSentence({ ...one, rawInput: 'Hallo du' });
    expect(isWriting(one.id)).toBe(true);
    await inAir;
    expect(isWriting(one.id)).toBe(false);
  });

  it('says a read taken before the write is behind, after the write has landed', async () => {
    const collection = await createCollection('Test');
    const one = aSentence(collection.id);
    await putSentence(one);

    // What a reader does: take the mark, then read. The write lands in between.
    const since = mark();
    await putSentence({ ...one, rawInput: 'Hallo du' });

    expect(isWriting(one.id)).toBe(false);
    expect(writtenSince(one.id, since)).toBe(true);
  });

  it('leaves an untouched record alone, which is what makes the guard usable', async () => {
    const collection = await createCollection('Test');
    const one = aSentence(collection.id);
    const other = aSentence(collection.id);
    await putSentence(one);
    await putSentence(other);

    const since = mark();
    await putSentence({ ...one, rawInput: 'Hallo du' });

    expect(writtenSince(other.id, since)).toBe(false);
    expect(isWriting(other.id)).toBe(false);
  });

  it('counts overlapping writes to one record, so the first to land does not clear the second', async () => {
    const collection = await createCollection('Test');
    const first = putCollection({ ...collection, name: 'Eins' });
    const second = putCollection({ ...collection, name: 'Zwei' });
    await first;
    // The second is still out; a refill here would put „Eins" back on screen.
    expect(isWriting(collection.id)).toBe(true);
    await second;
    expect(isWriting(collection.id)).toBe(false);
  });
});
