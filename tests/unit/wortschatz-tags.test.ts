import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';

/**
 * Tags are a field on a record that another function replaces wholesale, which
 * is the shape of a data loss that nobody would see happen: filing Oma under
 * Familie and then picking a better picture for her would quietly unfile her,
 * and the tag would be gone with no error, no notice, and no way back except
 * remembering it had been there.
 *
 * The folding rules are here for a smaller reason: the filter counts entries by
 * the folded tag, so a list where "Kita" and "kita" are two rows is a list that
 * cannot be looked through.
 */
describe('an entry’s tags', () => {
  beforeEach(async () => {
    await repo.clearEverything();
    await repo.putOverride('arasaac', 'Oma', { id: '111', label: 'Großmutter', score: 100 });
  });

  const tagsOf = async () =>
    (await repo.listOverrides('arasaac')).find((entry) => entry.token === 'oma')?.tags;

  it('survives a second correction of the same word', async () => {
    await repo.setOverrideTags('arasaac', 'Oma', ['Familie']);
    await repo.putOverride('arasaac', 'Oma', { id: '222', label: 'Oma', score: 100 });
    expect(await tagsOf()).toEqual(['Familie']);
  });

  it('keeps one spelling of a tag written twice, the first', async () => {
    await repo.setOverrideTags('arasaac', 'Oma', ['Familie', ' familie ', 'FAMILIE']);
    expect(await tagsOf()).toEqual(['Familie']);
  });

  it('drops blanks, and an entry emptied of tags carries no field at all', async () => {
    await repo.setOverrideTags('arasaac', 'Oma', ['Familie', '   ']);
    expect(await tagsOf()).toEqual(['Familie']);
    await repo.setOverrideTags('arasaac', 'Oma', []);
    // Not [] — a record written before tags existed and one cleared of them are
    // the same record, and the folder holds them as the same file.
    expect(await tagsOf()).toBeUndefined();
  });

  it('does nothing to a word that has no entry', async () => {
    await repo.setOverrideTags('arasaac', 'Opa', ['Familie']);
    expect(await repo.listOverrides('arasaac')).toHaveLength(1);
  });
});
