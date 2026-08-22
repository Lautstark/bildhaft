/**
 * Expands the compact seed lists in lexicon-seeds.mjs into the JSON tables the
 * app ships. Run with `node scripts/build-lexicon.mjs`; output goes to src/data/.
 *
 * Regenerate after editing seeds. The JSON is committed so the app has no
 * build-time codegen step.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WEAK_VERBS, STRONG_VERBS, SEPARABLE_PREFIXES, NOUNS, ADJECTIVES,
  KEPT_FUNCTION_WORDS, STOPWORDS, SYNONYM_GROUPS,
} from './lexicon-seeds.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
mkdirSync(OUT, { recursive: true });

/*
 * Two tables, split by part of speech, because German capitalisation is a reliable
 * disambiguator and collapsing them loses it. "Bad" is a room, "bad" is the stem of
 * "baden"; "Morgen" is a time of day, "morgen" is tomorrow. One merged table would
 * have to pick a winner for each and would be wrong half the time.
 */
const nouns = new Map();
const others = new Map();

const addTo = (table) => (form, lemma) => {
  const f = String(form).toLowerCase().trim();
  if (!f) return;
  // First writer wins: seeds are ordered most-specific first.
  if (!table.has(f)) table.set(f, lemma);
};
const addNoun = addTo(nouns);
const add = addTo(others);

/* ------------------------------------------------------------------ verbs */

const stemOf = (inf) =>
  /(?:eln|ern)$/.test(inf) ? inf.slice(0, -1) : inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1);

/**
 * German inserts a linking -e- after a stem ending in d/t (arbeitest, badest),
 * and after a nasal only when an obstruent precedes it (atmest, rechnest,
 * öffnest, ordnest).
 *
 * It does NOT after a liquid or another nasal — lernst, turnst, rennst, kämmst,
 * filmst, umarmst — nor after a lengthening h, which is silent: wohnst, föhnst.
 * Digraphs are collapsed first so "ch" counts as the single obstruent it is,
 * which is what separates rechnest (correct) from wohnest (not a word).
 */
const needsE = (stem) => {
  if (/[dt]$/.test(stem)) return true;
  const collapsed = stem
    .replace(/sch/g, 'S')
    .replace(/ch/g, 'C')
    .replace(/ph/g, 'F')
    .replace(/th/g, 'T')
    .replace(/([aeiouäöü])h/g, '$1'); // lengthening h is not a consonant here
  return /[^aeiouäöülrmn][mn]$/.test(collapsed);
};

function conjugateWeak(inf) {
  const stem = stemOf(inf);
  const e = needsE(stem) ? 'e' : '';
  return [
    stem, stem + 'e',
    stem + e + 'st', stem + e + 't', stem + 'en',
    stem + e + 'te', stem + e + 'test', stem + e + 'ten', stem + e + 'tet',
  ];
}

const prefixOf = (verb) => {
  const hit = SEPARABLE_PREFIXES
    .filter((p) => verb.startsWith(p) && verb.length - p.length >= 4)
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
};

for (const inf of WEAK_VERBS) {
  add(inf, inf);
  const pre = prefixOf(inf);
  if (pre) {
    // Separable: "aufräumen" -> aufräume/aufräumst… plus participle "aufgeräumt".
    const base = inf.slice(pre.length);
    const stem = stemOf(base);
    const e = needsE(stem) ? 'e' : '';
    for (const f of conjugateWeak(base)) add(pre + f, inf);
    add(pre + 'ge' + stem + e + 't', inf);
  } else {
    const stem = stemOf(inf);
    const e = needsE(stem) ? 'e' : '';
    for (const f of conjugateWeak(inf)) add(f, inf);
    add('ge' + stem + e + 't', inf);
  }
}

for (const [inf, forms] of Object.entries(STRONG_VERBS)) {
  const clean = inf.trim();
  if (!clean) continue;
  add(clean, clean);
  for (const f of forms) add(f, clean);
}

/* ------------------------------------------------------------------ nouns */

const basewords = new Map(); // lowercase -> display form, used for compound splitting

for (const [singular, ...forms] of NOUNS) {
  addNoun(singular, singular);
  for (const form of forms) {
    addNoun(form, singular);
    /*
     * Dative plural. German appends -n to a plural that does not already end in
     * -n or -s: Kinder -> Kindern, Bäume -> Bäumen, Buntstifte -> Buntstiften.
     * Regular enough to generate; listing it by hand would double the seed file.
     */
    if (!/[ns]$/i.test(form)) addNoun(form + 'n', singular);
  }
  basewords.set(singular.toLowerCase(), singular);
  // Plurals are base words too, so compounds like Bauchschmerzen can be split.
  for (const form of forms) basewords.set(form.toLowerCase(), form);
}

/* ------------------------------------------------------------- adjectives */

const IRREGULAR_COMPARATIVE = {
  'gut': ['besser', 'beste', 'besten', 'am besten'],
  'viel': ['mehr', 'meiste', 'meisten'],
  'hoch': ['höher', 'höchste', 'höchsten', 'hohe', 'hohen', 'hoher', 'hohes'],
  'groß': ['größer', 'größte', 'größten'],
  'alt': ['älter', 'älteste'],
  'jung': ['jünger', 'jüngste'],
  'lang': ['länger', 'längste'],
  'kurz': ['kürzer', 'kürzeste'],
  'warm': ['wärmer', 'wärmste'],
  'kalt': ['kälter', 'kälteste'],
  'stark': ['stärker', 'stärkste'],
  'schwach': ['schwächer', 'schwächste'],
  'nah': ['näher', 'nächste'],
};

for (const adj of ADJECTIVES) {
  add(adj, adj);
  for (const suf of ['e', 'er', 'es', 'en', 'em', 'ste', 'sten', 'ster', 'stes']) add(adj + suf, adj);
  for (const f of IRREGULAR_COMPARATIVE[adj] ?? []) add(f, adj);
  basewords.set(adj.toLowerCase(), adj);
}

/* -------------------------------------------------- kept function words */

for (const [lemma, forms] of Object.entries(KEPT_FUNCTION_WORDS)) {
  add(lemma, lemma);
  for (const f of forms) add(f, lemma);
}

/* ---------------------------------------------------- verbs as basewords */

for (const inf of [...WEAK_VERBS, ...Object.keys(STRONG_VERBS)]) {
  const clean = inf.trim();
  if (clean) basewords.set(clean.toLowerCase(), clean);
}
// Bare verb stems make compound splitting work for e.g. "Spielplatz" -> Spiel + Platz.
for (const [singular] of NOUNS) basewords.set(singular.toLowerCase(), singular);

/* --------------------------------------------------------------- synonyms */

const synonyms = {};
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const key = word.toLowerCase();
    const rest = group.filter((w) => w !== word);
    synonyms[key] = [...new Set([...(synonyms[key] ?? []), ...rest])];
  }
}

/* ----------------------------------------------------------------- output */

const write = (name, data) => {
  writeFileSync(resolve(OUT, name), JSON.stringify(data, null, 0) + '\n', 'utf8');
  const n = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`${name.padEnd(20)} ${String(n).padStart(6)} entries`);
};

const sorted = (map) => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b, 'de')));
write('lemmas-noun.json', sorted(nouns));
write('lemmas-other.json', sorted(others));
write('basewords.json', Object.fromEntries([...basewords].sort(([a], [b]) => a.localeCompare(b, 'de'))));
write('synonyms.json', synonyms);
write('stopwords.json', [...new Set(STOPWORDS)].sort((a, b) => a.localeCompare(b, 'de')));
write('separable.json', [...new Set(SEPARABLE_PREFIXES)].sort((a, b) => b.length - a.length));
