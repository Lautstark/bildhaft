import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';
import { getDB } from '../../src/db/db.ts';

/**
 * The rows a formula cannot address.
 *
 * `overrideKey` builds `de:arasaac:oma`; the list scans the store and filters
 * by language, so it shows entries that key never matches — one written before
 * there was a language to key by, and any row whose key predates tokens being
 * lowered. Captioning and tagging read `undefined` and returned quietly, which
 * is a card that ignores what is typed into it. Deleting missed a spelling and
 * left the word on screen. Both reached a person as bugs.
 *
 * So the rule these hold is: **what the list shows, the writes can reach.**
 */
describe('an entry made before there was a language key', () => {
  beforeEach(async () => {
    await repo.clearEverything();
    const db = await getDB();
    // Exactly what a pre-language build wrote: no `lang`, key without one.
    await db.put('overrides', {
      key: 'arasaac:oma', provider: 'arasaac', token: 'oma',
      symbolId: '111', label: 'washerwoman', updatedAt: Date.now(),
    } as never);
  });

  it('is listed', async () => {
    expect(await repo.listOverrides('arasaac')).toHaveLength(1);
  });

  it('can be given a caption', async () => {
    await repo.setOverrideCaption('arasaac', 'oma', 'Omi');
    expect((await repo.listOverrides('arasaac'))[0]?.caption).toBe('Omi');
  });

  it('can be tagged', async () => {
    await repo.setOverrideTags('arasaac', 'oma', ['Familie']);
    expect((await repo.listOverrides('arasaac'))[0]?.tags).toEqual(['Familie']);
  });

  it('is gone when deleted', async () => {
    await repo.deleteOverride('arasaac', 'oma');
    expect(await repo.listOverrides('arasaac')).toHaveLength(0);
  });

  it('takes its later twin with it, because they are one word on screen', async () => {
    // A correction after the language key existed writes a second row for the
    // same word. The person sees one card; deleting it has to mean both.
    await repo.putOverride('arasaac', 'Oma', { id: '222', label: 'grandmother', score: 100 });
    expect(await repo.listOverrides('arasaac')).toHaveLength(2);

    await repo.deleteOverride('arasaac', 'oma');
    expect(await repo.listOverrides('arasaac')).toHaveLength(0);
  });
});
