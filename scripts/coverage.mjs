/**
 * Lexicon coverage report.
 *
 * Measures the one thing expanding the seed lists actually changes: for each
 * content word in the corpus, does the shipped lexicon know the form outright,
 * or does the pipeline have to fall back on suffix guessing?
 *
 * Deliberately reads the generated JSON rather than re-implementing the
 * matcher, so the number cannot drift away from what the app really has.
 * Run: node scripts/coverage.mjs [--verbose]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (n) => JSON.parse(readFileSync(resolve(HERE, '../src/data/', n), 'utf8'));

const NOUNS = load('lemmas-noun.json');
const OTHERS = load('lemmas-other.json');
const STOPWORDS = new Set(load('stopwords.json'));
const SEPARABLE = new Set(load('separable.json'));
const BASEWORDS = load('basewords.json');

const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
const CONTRACTIONS = {
  am: ['an', 'dem'], im: ['in', 'dem'], zum: ['zu', 'dem'], zur: ['zu', 'der'],
  beim: ['bei', 'dem'], vom: ['von', 'dem'], ins: ['in', 'das'], ans: ['an', 'das'],
  aufs: ['auf', 'das'], durchs: ['durch', 'das'], fürs: ['für', 'das'], ums: ['um', 'das'],
};

const known = (form, capitalized) => {
  const [first, second] = capitalized ? [NOUNS, OTHERS] : [OTHERS, NOUNS];
  return first[form] ?? second[form] ?? null;
};

/** Mirrors compound.ts closely enough to tell whether a split would rescue a miss. */
function splittable(lower) {
  if (lower.length < 6) return null;
  for (let i = 3; i <= lower.length - 3; i++) {
    const head = lower.slice(0, i);
    if (!BASEWORDS[head]) continue;
    for (const link of ['', 's', 'es', 'n', 'en', 'er', 'e']) {
      const rest = lower.slice(i);
      if (link && !rest.startsWith(link)) continue;
      const tail = rest.slice(link.length);
      if (tail.length >= 3 && BASEWORDS[tail]) return [BASEWORDS[head], BASEWORDS[tail]];
    }
  }
  return null;
}

const corpus = readFileSync(resolve(HERE, 'corpus.de.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

let content = 0, hit = 0;
const misses = new Map();
const rescued = new Map();

for (const sentence of corpus) {
  const raw = sentence.match(WORD_RE) ?? [];
  const tokens = [];
  for (const w of raw) {
    const parts = CONTRACTIONS[w.toLowerCase()];
    if (parts) tokens.push(...parts.map((p) => ({ s: p, cap: false })));
    else tokens.push({ s: w, cap: /^\p{Lu}/u.test(w) });
  }

  for (const { s, cap } of tokens) {
    const lower = s.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    // A trailing separable particle is folded into its verb, not its own slot.
    if (SEPARABLE.has(lower) && tokens.at(-1)?.s.toLowerCase() === lower) continue;
    content++;
    if (known(lower, cap)) { hit++; continue; }
    const split = splittable(lower);
    if (split) { rescued.set(s, split.join(' + ')); hit++; continue; }
    misses.set(s, (misses.get(s) ?? 0) + 1);
  }
}

const pct = (n) => ((n / content) * 100).toFixed(1);
console.log(`corpus       ${corpus.length} sentences`);
console.log(`content words ${content}`);
console.log(`known        ${hit}  (${pct(hit)}%)`);
console.log(`unknown      ${content - hit}  (${pct(content - hit)}%)`);
console.log(`lexicon      ${Object.keys(NOUNS).length + Object.keys(OTHERS).length} forms / ${Object.keys(BASEWORDS).length} base words`);

if (process.argv.includes('--verbose')) {
  if (rescued.size) {
    console.log(`\nrescued by compound splitting (${rescued.size}):`);
    for (const [w, s] of rescued) console.log(`  ${w} -> ${s}`);
  }
  console.log(`\nunknown words (${misses.size} distinct), most frequent first:`);
  for (const [w, n] of [...misses].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(2)}  ${w}`);
}
