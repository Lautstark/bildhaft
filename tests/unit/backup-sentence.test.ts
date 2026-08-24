import { describe, expect, it } from 'vitest';
import type { Status } from '@lautstark/sicherung';
import { ago } from '@lautstark/sicherung/ui';
import { sentence } from '../../src/ui/backupFolder.ts';

/**
 * A backup that has stopped says how long it has been stopped.
 *
 * The last thing about this panel written out in all three products with
 * nothing checking they agree. @lautstark/sicherung/ui owns which buttons a
 * state offers, which states are somebody's to act on, and the arithmetic
 * behind „vor 3 Minuten" — and deliberately owns no words, because this product
 * has no `t()` to route them through and that is an argued position rather than
 * a gap. So the sentences stayed here, and this rule with them.
 *
 * `needs-permission` and `failed` both mean no backup is being written and it
 * will not resume by itself, and both are easy to put off: „es funktioniert
 * nicht" is a complaint, „seit elf Tagen nichts gesichert" is a deadline. The
 * age is what turns one into the other, and it is exactly what a later edit
 * tightening a sentence would drop with nothing else noticing — a sentence
 * without an age is still a sentence.
 *
 * Asserted against what `ago` returns rather than against a literal, so it goes
 * on holding when somebody rewrites the wording. `headline` has its own test
 * next door: the heading deliberately carries no age, and these two rules are
 * opposite sides of the same decision about where the age belongs.
 */

const at = Date.now() - 11 * 60_000;
const age = ago(at, 'de');

describe('what the backup panel says', () => {
  it('carries the age in both states that mean nothing is being written', () => {
    expect(sentence({ kind: 'needs-permission', folder: 'Sicherungen', lastWrite: at }))
      .toContain(age);
    expect(sentence({ kind: 'failed', folder: 'Sicherungen', lastWrite: at, reason: 'Platte voll' }))
      .toContain(age);
  });

  it('says so where a folder was chosen and never written to', () => {
    // No age to give is not a reason to say nothing: „noch nie gesichert" is
    // the most alarming of the three answers, not the least.
    for (const status of [
      { kind: 'needs-permission', folder: 'Sicherungen', lastWrite: null },
      { kind: 'failed', folder: 'Sicherungen', lastWrite: null, reason: 'Platte voll' },
      { kind: 'idle', folder: 'Sicherungen', lastWrite: null },
    ] as Status[]) {
      expect(sentence(status)).toContain('nie gesichert');
      // Not the age of the epoch, which is what a missing branch produces.
      expect(sentence(status)).not.toContain(ago(0, 'de'));
    }
  });

  it('names the folder wherever there is one, and the reason when it failed', () => {
    expect(sentence({ kind: 'idle', folder: 'Sicherungen', lastWrite: at })).toContain('Sicherungen');
    expect(sentence({ kind: 'needs-permission', folder: 'Sicherungen', lastWrite: at }))
      .toContain('Sicherungen');
    expect(sentence({ kind: 'failed', folder: 'Sicherungen', lastWrite: at, reason: 'Platte voll' }))
      .toContain('Platte voll');
  });

  it('says nothing at all where the browser has no picker', () => {
    expect(sentence({ kind: 'unsupported' })).toBe('');
  });
});
