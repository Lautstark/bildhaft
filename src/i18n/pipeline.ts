/*
 * bildquelle's sentence pipeline, in the language a Sammlung is written in.
 *
 * The two entry points are separate modules, and both are imported statically:
 * a page can hold a Sammlung in the other language (one switched away from, or
 * one that arrived from somebody else), and adding a line to it has to read
 * that line in its own language.
 */
import * as german from '@lautstark/bildquelle/german';
import * as english from '@lautstark/bildquelle/english';
import { LANG, type LanguageCode } from './index.ts';

/** The function words a telegraphic board leaves out, for this language. */
export const STOPWORDS: readonly string[] =
  LANG === 'de' ? german.GERMAN_STOPWORDS : english.ENGLISH_STOPWORDS;

/**
 * A sentence, turned into the words worth looking up — in the language it is
 * written in, which is the Sammlung's and not necessarily the page's.
 *
 * Both halves were in the bundle already: `LANG` is read from localStorage at
 * run time, so the bundler could never drop either. What the page's language
 * used to decide alone was which one *ran*, and that was the bug — a line added
 * to an English Sammlung after the page was switched to German went through the
 * German lemmatiser and the German stopwords. See `Collection.language`.
 *
 * The two pipelines do not have the same rungs - German splits compounds and
 * reassembles separable verbs, English merges phrasal verbs - so the `origin`
 * on a resolved word is a wider union here than either one promises alone.
 * core/types.ts's SlotOrigin is what narrows it again for a slot.
 */
export const resolveText = (
  raw: string, options: Parameters<typeof german.resolveText>[1], lang: LanguageCode = LANG,
): ReturnType<typeof german.resolveText> =>
  (lang === 'de' ? german.resolveText : english.resolveText as typeof german.resolveText)(raw, options);
