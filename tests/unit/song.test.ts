import { describe, expect, it } from 'vitest';
import { foldRepeats, readSong, sungParts, timesSung, withoutLine } from '../../src/core/song.ts';
import type { Song } from '../../src/core/types.ts';

/**
 * How a pasted song is taken apart, and how it is put back together.
 *
 * The Laternenlied this template was made from, pasted as it came: forty
 * lines, no blank line anywhere, and one „;" where every other verse has „,".
 */
const REFRAIN = [
  'Ich geh mit meiner Laterne',
  'Und meine Laterne mit mir',
  'Dort oben leuchten die Sterne',
  'Hier unten leuchten wir',
];
const VERSES = [
  ["Mein Licht geht aus; wir geh'n nach Haus", "Mein Licht geht aus, wir geh'n nach Haus"],
  ['Mein Licht ist klein, ich geh allein'],
  ['Ich trag mein Licht, ich fürcht mich nicht'],
  ["Mein Licht ist schön, könnt ihr es seh'n?"],
  ['Wie schön das klingt, wenn jeder singt'],
];
const RAB = 'Rabimmel, rabammel, rabum';
const laterne = VERSES.flatMap((verse) => [
  ...REFRAIN, verse[0]!, RAB, verse[1] ?? verse[0]!, RAB,
]).join('\n');

describe('a song pasted without blank lines', () => {
  const song = readSong(laterne);

  it('finds the refrain, and every Strophe after it', () => {
    expect(song.parts.map((part) => part.kind)).toEqual(['refrain', ...VERSES.map(() => 'strophe')]);
    expect(song.parts[0]!.lines).toEqual(REFRAIN);
    expect(song.order).toEqual([0, 1, 0, 2, 0, 3, 0, 4, 0, 5]);
  });

  it('keeps a Strophe whole, its own repeated pair included', () => {
    expect(song.parts[2]!.lines).toEqual([VERSES[1]![0], RAB, VERSES[1]![0], RAB]);
  });

  it('is one Strophe when nothing comes back', () => {
    expect(readSong('Eins\nZwei\nDrei')).toEqual({
      parts: [{ kind: 'strophe', lines: ['Eins', 'Zwei', 'Drei'] }], order: [0],
    });
  });
});

describe('a song pasted with blank lines', () => {
  it('takes each paragraph as a part, and the one that comes back as the Refrain', () => {
    const song = readSong('A\nB\n\nR1\nR2\n\nC\nD\n\nR1\nR2\n');
    expect(song.parts).toEqual([
      { kind: 'strophe', lines: ['A', 'B'] },
      { kind: 'refrain', lines: ['R1', 'R2'] },
      { kind: 'strophe', lines: ['C', 'D'] },
    ]);
    expect(song.order).toEqual([0, 1, 2, 1]);
  });
});

describe('a song as it is stored', () => {
  const song: Song = {
    parts: [
      { id: 'r', kind: 'refrain', lines: ['a', 'b'] },
      { id: 's1', kind: 'strophe', lines: ['c', 'x', 'c', 'x'] },
      { id: 's2', kind: 'strophe', lines: ['d', 'x'] },
    ],
    order: ['r', 's1', 'r', 's2', 'r'],
  };

  it('names its parts where they are sung', () => {
    expect(sungParts(song).map(({ kind, n, first }) => [kind, n, first])).toEqual([
      ['refrain', 0, true], ['strophe', 1, true], ['refrain', 0, false],
      ['strophe', 2, true], ['refrain', 0, false],
    ]);
  });

  it('counts a row every time it is sung', () => {
    expect(timesSung(song).get('x')).toBe(3);
    expect(timesSung(song).get('a')).toBe(3);
    expect(timesSung(song).get('d')).toBe(1);
  });

  it('lets go of a row, and of a part left empty by it', () => {
    const left = withoutLine(withoutLine(song, 'd'), 'x');
    expect(left.parts.map((part) => part.id)).toEqual(['r', 's1']);
    expect(left.parts[1]!.lines).toEqual(['c', 'c']);
    expect(left.order).toEqual(['r', 's1', 'r', 'r']);
  });
});

describe('lines sung again straight after themselves', () => {
  it.each([
    [['v', 'r', 'v', 'r'], [{ lines: ['v', 'r'], times: 2 }]],
    [['a', 'b', 'b', 'c'], [{ lines: ['a'], times: 1 }, { lines: ['b'], times: 2 }, { lines: ['c'], times: 1 }]],
    [['a', 'a', 'a', 'a'], [{ lines: ['a'], times: 4 }]],
    [['a', 'b', 'c'], [{ lines: ['a'], times: 1 }, { lines: ['b'], times: 1 }, { lines: ['c'], times: 1 }]],
  ])('%j folds to %j', (lines, folded) => {
    expect(foldRepeats(lines)).toEqual(folded);
  });
});
