/*
 * bildquelle's sentence pipeline, in the language this page is set to.
 *
 * The two entry points are separate modules on purpose - German's tables are
 * about 160 KB and English's are a fraction of that, and a page reading one
 * should not carry the other. So this picks, and everything above it calls
 * `resolveText` without knowing there was a choice.
 *
 * Imported statically rather than with a dynamic import, unlike vorlaut's. That
 * is the reload paying for itself a second time: the language cannot change
 * under this module, so there is nothing to defer and no promise to keep. The
 * bundler drops whichever half is not named here.
 */
import * as german from '@lautstark/bildquelle/german';
import * as english from '@lautstark/bildquelle/english';
import { LANG } from './index.ts';

const pipeline = LANG === 'de' ? german : english;

/** The function words a telegraphic board leaves out, for this language. */
export const STOPWORDS: readonly string[] =
  LANG === 'de' ? german.GERMAN_STOPWORDS : english.ENGLISH_STOPWORDS;

/**
 * A sentence, turned into the words worth looking up.
 *
 * The two pipelines do not have the same rungs - German splits compounds and
 * reassembles separable verbs, English merges phrasal verbs - so the `origin`
 * on a resolved word is a wider union here than either one promises alone.
 * core/types.ts's SlotOrigin is what narrows it again for a slot.
 */
export const resolveText = pipeline.resolveText as typeof german.resolveText;
