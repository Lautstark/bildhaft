/*
 * Which language this page speaks.
 *
 * bildhaft was German-only for a long time and that was a decision rather than
 * a gap: the matcher only understood German, so an English interface would have
 * fronted a program that could not keep the promise. That stopped being true
 * when bildquelle grew an English pipeline, and it was measured before this was
 * written - scripts/coverage.mjs over there puts English and German within a
 * couple of points of each other on the same sentences.
 *
 * Two things are deliberately unlike vorlaut, which is the sibling that had a
 * language switch first:
 *
 * - The choice reloads the page rather than re-rendering it. vorlaut moved away
 *   from reloading because its settings sheet holds a half-typed Azure key that
 *   a reload would throw away. bildhaft has no such field: every sentence is in
 *   IndexedDB before it is drawn, and the composer's draft is the only thing in
 *   flight. Building a re-render path for the shell would be a bigger change
 *   than the feature, and this is honest about being the smaller one.
 * - German is the fallback, not English. This is a German tool with a German
 *   README beside its English one, and somebody arriving without a preference
 *   is likelier to want German.
 */
import { TEXTS } from './texts.ts';

export type LanguageCode = 'de' | 'en';

export const LANGUAGES: readonly LanguageCode[] = ['de', 'en'];

/*
 * What each language calls itself, in itself, was a `LANGUAGE_NAMES` table
 * here. It is `NAMES` in @lautstark/design/language as of 1.27.0, beside the
 * picker that draws the buttons out of it: three products held the same two
 * words, and why a shared module may carry these and no other words — a
 * language's name is not a translation, and this is the one control somebody
 * reaches for when they cannot read the interface around it — is argued in that
 * module's header.
 *
 * Nothing in bildhaft names a language any more. ui/settingsDialog.ts asks the
 * package for the panel's heading as well as for the buttons, so the two cannot
 * come to disagree.
 */

const CHOICE = 'bildhaft.language';

const isLanguage = (code: string): code is LanguageCode =>
  (LANGUAGES as readonly string[]).includes(code);

function remembered(): LanguageCode | null {
  try {
    const held = localStorage.getItem(CHOICE) ?? '';
    return isLanguage(held) ? held : null;
  } catch {
    // Safari in private browsing throws on access rather than answering.
    return null;
  }
}

/** The browser's own preference, if it names one we have. Regions are stripped. */
function preferred(): LanguageCode {
  for (const tag of navigator.languages ?? [navigator.language ?? '']) {
    const base = String(tag).toLowerCase().split('-')[0]!;
    if (isLanguage(base)) return base;
  }
  return 'de';
}

/**
 * Fixed for the life of the document, which is what the reload buys.
 *
 * A `const` rather than vorlaut's live binding, and the difference is the
 * point: nothing here has to worry about a label built before the switch and
 * read after it, because there is no after.
 */
export const LANG: LanguageCode = remembered() ?? preferred();

/**
 * The BCP 47 tag to format numbers and dates with, for the language the page is
 * in.
 *
 * Here rather than at each `toLocaleString` call, and it is not a text key: it
 * is not a label anybody reads, and a table whose test asserts both languages
 * carry the same placeholders has no business holding one. What it is for is
 * the failure `de-DE` written in place produces — a decimal comma in an English
 * measurement, or a German date on the name of every new Sammlung — which is
 * the same failure as an untranslated string and is invisible to a check that
 * only reads `t()`.
 */
export const LOCALE: string = LANG === 'de' ? 'de-DE' : 'en-GB';

/** Remembers the choice and reloads into it. Does nothing if it is already on. */
export function chooseLanguage(code: LanguageCode): void {
  if (code === LANG) return;
  try {
    localStorage.setItem(CHOICE, code);
  } catch {
    // Private browsing: the switch still works for this document.
  }
  location.reload();
}

/**
 * One label out of the table.
 *
 * A missing key returns the key itself rather than an empty string, so a
 * mistake shows up as `ui.print_start` on a button instead of as a button with
 * nothing on it.
 *
 * That is the right behaviour and it is not a check. This line used to name
 * tests/unit/texts.test.ts as what stops it getting that far, and that test
 * holds the two languages to each other and never looks at a call site — so a
 * key nobody declared passed it in both languages equally. `ui.folder_permission`
 * reached a person that way. tests/unit/text-keys.test.ts is the one that
 * holds the table against the program, in both directions.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let out = TEXTS[LANG][key] ?? TEXTS.de[key] ?? key;
  if (params) {
    for (const name of Object.keys(params)) {
      out = out.split(`{${name}}`).join(String(params[name]));
    }
  }
  return out;
}
