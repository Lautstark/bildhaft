import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';
import { resolveText } from '../../src/i18n/pipeline.ts';
import { tIn } from '../../src/i18n/index.ts';

/**
 * A Sammlung keeps the language it was written in when the page changes its own.
 *
 * The page's language is fixed per document and the setup pins it to German
 * here, so these hold the other half: what is asked for in English gets
 * English, on a German page — which is a German Sammlung on an English page
 * the other way round. e2e/sprachwechsel.spec.ts switches for real.
 */
describe('the language of a Sammlung', () => {
  beforeEach(async () => { await repo.clearEverything(); });

  it('is written when the Sammlung is made', async () => {
    expect(await repo.createCollection('Neu')).toMatchObject({ language: 'de' });
  });

  it('is written onto the ones that did not say, before a switch, and left on the ones that did', async () => {
    const old = await repo.createCollection('Alt');
    await repo.patchCollection(old.id, { language: undefined });
    const english = await repo.createCollection('English');
    await repo.patchCollection(english.id, { language: 'en' });

    await repo.rememberLanguage('de');

    expect(await repo.getCollection(old.id)).toMatchObject({ language: 'de' });
    expect(await repo.getCollection(english.id)).toMatchObject({ language: 'en' });
  });

  it('chooses the Wortschatz a line is read with', async () => {
    await repo.putOverride('arasaac', 'oma', { id: '1', label: 'Oma', score: 1 });
    await repo.putOverride('arasaac', 'granny', { id: '2', label: 'granny', score: 1 }, 'en');

    expect([...(await repo.overrideMap('arasaac')).keys()]).toEqual(['oma']);
    expect([...(await repo.overrideMap('arasaac', 'en')).keys()]).toEqual(['granny']);
    // The dictionary panel lists the page's language, as it did.
    expect((await repo.listOverrides()).map((o) => o.token)).toEqual(['oma']);
  });

  it('chooses the pipeline a line is read with', async () => {
    const provider = { id: 'arasaac', search: async () => [] } as never;
    const read = async (lang: 'de' | 'en') => (await resolveText('Please clean up your room', {
      provider, stopwords: new Set<string>(), prefer: () => null,
    }, lang)).map((word) => word.concept);

    // "clean up" is one concept in English — the phrasal verb merged, which is
    // the rung German does not have. The German pipeline keeps "up" as a word.
    expect(await read('en')).toEqual(['please', 'clean', 'your', 'room']);
    expect(await read('de')).toContain('up');
  });

  it('chooses the words printed around the material', () => {
    expect(tIn('en', 'ui.recipe_zutat')).not.toBe(tIn('de', 'ui.recipe_zutat'));
  });
});
