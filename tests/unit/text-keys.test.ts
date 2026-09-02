import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEXTS } from '../../src/i18n/texts.ts';
import { SLOT_ORIGINS } from '../../src/core/types.ts';
import { SOURCE_STATUS_CODES } from '../../src/ui/symbolSources.ts';
import { TOPICS } from '../../src/core/tags.ts';

/**
 * The table and the calls, held to each other.
 *
 * `t()` returns the key when it cannot find it. That is the right behaviour —
 * `ui.print_start` on a button says what is wrong, where an empty button says
 * nothing — but it means a missing key is not an error anywhere: it typechecks,
 * because the parameter is a `string`; it passes every existing test, because
 * nothing asserts on the label; and it reaches a person as a literal
 * `ui.something`. That happened, with `ui.folder_permission`.
 *
 * texts.test.ts beside this one holds the two languages to each other — same
 * keys, same placeholders. What neither it nor anything else held is the table
 * against the program, and it is the more expensive direction: two languages
 * disagreeing shows an English reader a German sentence, which is legible;
 * a key nobody declared shows everybody a dotted identifier.
 *
 * So this is bidirectional, and both halves earn their keep:
 *
 *  - **Nothing asks for a key that is not there.** The failure above.
 *  - **Nothing is there that nobody asks for.** Weaker on its own, and it is
 *    what makes the first half hold in the other direction: when a German
 *    sentence is written in place again, the key it should have used goes
 *    unreferenced and this goes red. A dead-key check is the only automatic
 *    notice this suite can give of a hard-coded string, because a string
 *    literal in a `.ts` file is not distinguishable from a class name by
 *    anything short of reading it.
 *
 * It reads the source rather than importing it, which is new to this suite. It
 * has to: what is under test is which keys appear in the text of the program,
 * and a module that has been imported no longer has any text.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Where a key is asked for, so a failure names the file rather than the key alone. */
interface Ask { key: string; where: string }

/*
 * Every quoted string in the source that is shaped like a text key.
 *
 * Not `t\(['"]…` — that was the first version and it was wrong in the direction
 * that matters. Three call sites choose between two keys before calling:
 *
 *     t(own ? 'ui.metacom_missing_own' : 'ui.metacom_missing_default')
 *     t(n === 1 ? 'ui.n_entry' : 'ui.n_entries', { n })
 *
 * A scanner anchored on `t(` sees the first key of each pair and not the
 * second, so it reports six live keys as dead — and, worse, would call a
 * genuinely undeclared second arm declared-and-unused rather than missing. The
 * three prefixes are specific enough that a string matching one is a key: no
 * class name, id or attribute in this app is spelled `ui.something`.
 *
 * Template literals are still not matched, and are handled explicitly below
 * instead. Trying to evaluate one here would be wrong in both directions.
 *
 * The whole `i18n/` directory is skipped, and both files in it for a reason of
 * its own. `texts.ts` is the table: every key appears there as a quoted string,
 * so scanning it would make every declared key its own call site and the second
 * half below could never fail — which is exactly what happened when the `t\(`
 * anchor came off, and it failed silently, in the direction of passing.
 * `index.ts` quotes `ui.print_start` in a docblock as the example of a key that
 * is missing, so a scanner reading the documentation as a call site would fail
 * on the file explaining the failure.
 */
function asked(): Ask[] {
  const out: Ask[] = [];
  for (const path of sources(SRC)) {
    if (path.startsWith(join(SRC, 'i18n'))) continue;
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(/(['"])((?:ui|info|export)\.[a-z0-9_]+)\1/g)) {
      out.push({ key: m[2]!, where: relative(SRC, path) });
    }
  }
  return out;
}

/*
 * Keys built at run time, and the values each one can be built from.
 *
 * One entry, and it must stay a list somebody has to edit rather than a pattern
 * the scanner infers: `ui.origin_*` matched as a prefix would let both halves
 * below pass while a rung had no sentence. `SLOT_ORIGINS` is a real array in
 * core/types.ts for this reason, so the set here is the program's own and not a
 * copy of it.
 */
const COMPOSED: { prefix: string; from: readonly string[]; where: string }[] = [
  { prefix: 'ui.origin_', from: SLOT_ORIGINS, where: 'ui/row.ts' },
  // The sentence for a source that cannot answer. Ours since bildquelle 2.0.0
  // stopped shipping German ones; the codes come from the package, so a new
  // state arrives here rather than as a blank line on the settings card.
  { prefix: 'ui.source_status_', from: SOURCE_STATUS_CODES, where: 'ui/symbolSources.ts' },
  // The themes a source's own categories are mapped onto. `TOPICS` is a real
  // array in core/tags.ts so a twelfth theme fails here rather than reaching
  // somebody as a dotted identifier in their Wortschatz.
  { prefix: 'ui.topic_', from: TOPICS, where: 'ui/wortschatz.ts' },
];

const declared = new Set(Object.keys(TEXTS.de!));

describe('every key the program asks for is in the table', () => {
  it('asks for nothing that is not declared', () => {
    const missing = asked()
      .filter((a) => !declared.has(a.key))
      .map((a) => `${a.key}  (${a.where})`);
    expect(missing).toEqual([]);
  });

  it('can build every key it composes at run time', () => {
    // The tooltip under a slot. `origin` is copied straight through from
    // bildquelle in core/match.ts, so a rung this app has never heard of can
    // arrive from a package upgrade - which is what makes the list in
    // core/types.ts the thing to keep current, and this the check that says so.
    const missing = COMPOSED.flatMap(({ prefix, from, where }) =>
      from.map((value) => `${prefix}${value}`)
        .filter((key) => !declared.has(key))
        .map((key) => `${key}  (${where})`));
    expect(missing).toEqual([]);
  });
});

describe('every key in the table is asked for', () => {
  it('declares nothing the program never reaches', () => {
    /*
     * A key that no longer has a call site is either a label that was deleted
     * and left behind, or - the case this is really for - a label that is still
     * on screen and is now written out in German beside the key that should
     * have drawn it.
     *
     * `export.*` are reached only from db/exportImport.ts and are live; they are
     * found by the scanner like any other, so nothing is exempted here. If this
     * ever needs an exemption list, that is the moment to ask whether the key is
     * really still doing something.
     */
    const reached = new Set(asked().map((a) => a.key));
    for (const { prefix, from } of COMPOSED) {
      for (const value of from) reached.add(`${prefix}${value}`);
    }
    expect([...declared].filter((key) => !reached.has(key)).sort()).toEqual([]);
  });
});
