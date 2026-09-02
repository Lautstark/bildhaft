import { describe, expect, it } from 'vitest';
import { TOPICS, topicsOf } from '../../src/core/tags.ts';

/**
 * ARASAAC's categories are not tags a household would write, and this is the
 * mapping that makes them into ones. It is many-to-one and lossy on purpose, so
 * what these hold is the two ways that goes wrong: a theme claimed on a word
 * that has nothing to do with it, and a theme that never arrives.
 */
describe('the themes a source’s categories fall into', () => {
  it('folds a granular taxonomy into one theme', () => {
    // What ARASAAC actually answered for "hund", minus the ones we ignore.
    expect(topicsOf(['pet', 'carnivorous', 'mammal', 'viviparous', 'terrestrial animal',
      'domestic animal'])).toEqual(['animals']);
  });

  it('matches a word rather than a substring of one', () => {
    /*
     * `pet` inside `competition` and `appetite` is the failure this is for: a
     * Wortschatz that files sport under Tiere is worse than one that files it
     * nowhere, because nothing about the row says it is wrong.
     */
    expect(topicsOf(['competition', 'appetite suppressant'])).toEqual([]);
  });

  it('lets one word land in more than one theme, in display order', () => {
    expect(topicsOf(['core vocabulary-feeding', 'fruit'])).toEqual(['core', 'food']);
  });

  it('drops what it has no word for, and says so by returning nothing', () => {
    // Real categories from the sample. `verb` is a word class and arrives as
    // one; the rest are ARASAAC's own taxonomy and no household sorts by them.
    expect(topicsOf(['library science', 'signaling system', 'verb',
      'qualifying adjective'])).toEqual([]);
  });

  it('has nothing to say about an entry whose source said nothing', () => {
    expect(topicsOf(undefined)).toEqual([]);
    expect(topicsOf([])).toEqual([]);
  });

  it('never invents a theme that is not one of the declared ones', () => {
    const every = topicsOf(['fruit', 'family', 'clothes', 'feeling', 'land transport',
      'educational building', 'hospital room', 'traditional game', 'furniture',
      'core vocabulary-place', 'pet']);
    expect(every.every((topic) => TOPICS.includes(topic))).toBe(true);
    expect(every).toHaveLength(TOPICS.length);
  });
});
