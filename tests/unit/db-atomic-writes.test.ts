import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';

/**
 * Two edits to one record a moment apart both land.
 *
 * Each of these used to read the record, go away, and put its own copy back —
 * so a second edit that started before the first landed wrote the record from
 * before it, and the first was gone. The Wortschatz's picker is where it shows:
 * it hands over the caption and then the picture without waiting in between.
 * `patchOverride` reads and writes in one transaction, which is what every
 * case below depends on.
 *
 * Nothing here awaits between the two writes, on purpose: that is the race.
 */
describe('two writes to one Wortschatz entry', () => {
  beforeEach(async () => {
    await repo.clearEverything();
    await repo.putOverride('arasaac', 'Oma', { id: '111', label: 'old', score: 100 });
  });

  const oma = async () => (await repo.listOverrides('arasaac')).find((one) => one.token === 'oma')!;

  it('keeps a caption typed just before a picture was picked', async () => {
    await Promise.all([
      repo.setOverrideCaption('arasaac', 'Oma', 'Omi'),
      repo.putOverride('arasaac', 'Oma', { id: '222', label: 'new', score: 100 }),
    ]);
    const entry = await oma();
    expect({ symbolId: entry.symbolId, caption: entry.caption }).toEqual({ symbolId: '222', caption: 'Omi' });
  });

  it('keeps tags and a caption set a moment apart', async () => {
    await Promise.all([
      repo.setOverrideTags('arasaac', 'Oma', ['Familie']),
      repo.setOverrideCaption('arasaac', 'Oma', 'Omi'),
    ]);
    const entry = await oma();
    expect({ tags: entry.tags, caption: entry.caption }).toEqual({ tags: ['Familie'], caption: 'Omi' });
  });

  it('renames a tag without undoing a caption written alongside', async () => {
    await repo.setOverrideTags('arasaac', 'Oma', ['Familie']);
    await Promise.all([
      repo.renameTag('Familie', 'Verwandte'),
      repo.setOverrideCaption('arasaac', 'Oma', 'Omi'),
    ]);
    const entry = await oma();
    expect({ tags: entry.tags, caption: entry.caption }).toEqual({ tags: ['Verwandte'], caption: 'Omi' });
  });

  it('still takes a field off when it is emptied', async () => {
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    await repo.setOverrideTags('arasaac', 'Oma', ['Familie']);
    await repo.setOverrideCaption('arasaac', 'Oma', '');
    await repo.dropTag('Familie');
    const entry = await oma();
    expect('caption' in entry).toBe(false);
    expect('tags' in entry).toBe(false);
  });
});
