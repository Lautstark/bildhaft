import { describe, expect, it } from 'vitest';
import { TEXTS } from '../../src/i18n/texts.ts';
import { LANGUAGES } from '../../src/i18n/index.ts';

/**
 * The two tables have to hold the same keys.
 *
 * This is the whole guarantee behind having a second language at all. `t()`
 * falls back to German for a key English is missing, which is the right
 * behaviour at runtime — a German sentence is worse than an English one and far
 * better than a blank button — but it is silent, and a silent fallback is how a
 * page ends up half-translated without anybody hearing about it.
 *
 * So the fallback stays, and this is what stops it from ever being needed.
 */
describe('the text tables', () => {
  it('holds the same keys in every language', () => {
    const [first, ...rest] = LANGUAGES;
    const expected = Object.keys(TEXTS[first]!).sort();
    for (const lang of rest) {
      expect(Object.keys(TEXTS[lang]!).sort(), `${lang} differs from ${first}`).toEqual(expected);
    }
  });

  it('has no entry that is only whitespace', () => {
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(TEXTS[lang]!)) {
        expect(value.trim(), `${lang}.${key} is empty`).not.toBe('');
      }
    }
  });

  it('keeps every placeholder a German sentence uses in its English one', () => {
    // A dropped {name} does not fail to compile; it renders as a sentence with
    // a hole where somebody's collection should have been.
    const holes = (text: string) => (text.match(/\{[a-z]+\}/g) ?? []).sort();
    for (const [key, german] of Object.entries(TEXTS.de!)) {
      const english = TEXTS.en![key];
      if (english === undefined) continue;
      expect(holes(english), `${key} does not carry the same placeholders`)
        .toEqual(holes(german));
    }
  });
});
