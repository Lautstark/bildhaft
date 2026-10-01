import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';

/**
 * Two edits to one record a moment apart both land.
 *
 * Each of these used to read the record, go away, and put its own copy back —
 * so a second edit that started before the first landed wrote the record from
 * before it, and the first was gone. The Wortschatz's picker is where it shows:
 * it hands over the caption and then the picture without waiting in between.
 * A Sammlung had the same shape, with five writers each putting back the whole
 * record as they held it. `patchOverride` and `patchCollection` read and write
 * in one transaction, which is what every case below depends on.
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

describe('two writes to one Sammlung', () => {
  beforeEach(() => repo.clearEverything());

  it('keeps a name typed while its source was picked', async () => {
    const made = await repo.createCollection('Vorher');
    await Promise.all([
      repo.renameCollection(made.id, 'Nachher'),
      repo.saveCollectionProvider(made.id, 'metacom'),
    ]);
    const held = (await repo.getCollection(made.id))!;
    expect({ name: held.name, provider: held.provider }).toEqual({ name: 'Nachher', provider: 'metacom' });
  });

  it('keeps a name typed while the grid moved, and following the default again removes the field', async () => {
    const made = await repo.createCollection('Vorher', 'tafel');
    await Promise.all([
      repo.renameCollection(made.id, 'Nachher'),
      repo.patchCollection(made.id, { board: { cols: 2, rows: 1, cells: ['a', null] } }),
    ]);
    await repo.saveCollectionProvider(made.id, 'metacom');
    await repo.saveCollectionProvider(made.id, null);
    const held = (await repo.getCollection(made.id))!;
    expect(held.name).toBe('Nachher');
    expect(held.board?.cells).toEqual(['a', null]);
    expect('provider' in held).toBe(false);
  });
});
