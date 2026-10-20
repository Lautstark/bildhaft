import { describe, expect, it } from 'vitest';
import { editedLabel, type EditedWords } from '../../src/core/edited.ts';

/** What the sidebar says under a Sammlung's name about when it was last worked on. */
const words: EditedWords = {
  today: 'heute',
  yesterday: 'gestern',
  daysAgo: (n) => `vor ${n} Tagen`,
  date: (at) => `${at.getDate()}.${at.getMonth() + 1}.${at.getFullYear()}`,
};
const now = new Date(2026, 9, 19, 0, 10).getTime();
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('when a Sammlung was last worked on', () => {
  it.each([
    [at(2026, 10, 19, 0), 'heute'],
    [at(2026, 10, 18, 23), 'gestern'],
    [at(2026, 10, 16), 'vor 3 Tagen'],
    [at(2026, 10, 13), 'vor 6 Tagen'],
    [at(2026, 10, 12), '12.10.2026'],
    [at(2025, 12, 24), '24.12.2025'],
  ])('%s reads „%s"', (when, said) => {
    expect(editedLabel(when, now, words)).toBe(said);
  });
});
