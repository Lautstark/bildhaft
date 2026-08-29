import { describe, expect, it } from 'vitest';
import type { Status } from '@lautstark/sicherung';
import { headline } from '../../src/ui/backupFolder.ts';

/**
 * What the „Sicherung" heading says about the standing backup.
 *
 * The heading is read without opening the panel, which is the whole reason it
 * exists — and therefore the whole reason it must not flatten the states. A
 * backup that has quietly stopped is worse than no backup, because it
 * manufactures confidence; a heading showing nothing but a folder name for
 * `needs-permission` and `failed` would be exactly that, in the one place
 * somebody looks when they are not looking hard.
 */
describe('the backup folder heading', () => {
  const at = Date.now();

  it('says nothing when there is no folder to name', () => {
    expect(headline({ kind: 'unsupported' })).toBe('');
    expect(headline({ kind: 'off' })).toBe('');
  });

  it('names the folder while it is being written', () => {
    expect(headline({ kind: 'idle', folder: 'Sicherungen', lastWrite: at }))
      .toBe('Ordner „Sicherungen“');
    expect(headline({ kind: 'saving', folder: 'Sicherungen', lastWrite: at }))
      .toBe('Ordner „Sicherungen“');
  });

  it('never lets a stopped backup read like a working one', () => {
    const working = headline({ kind: 'idle', folder: 'Sicherungen', lastWrite: at });

    for (const status of [
      { kind: 'needs-permission', folder: 'Sicherungen', lastWrite: at },
      { kind: 'failed', folder: 'Sicherungen', lastWrite: at, reason: 'Kein Platz' },
    ] satisfies Status[]) {
      const said = headline(status);
      expect(said).toContain('Sicherungen');
      expect(said).not.toBe(working);
    }
  });
});
