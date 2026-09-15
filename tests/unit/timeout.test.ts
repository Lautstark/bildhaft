import { describe, expect, it } from 'vitest';
import { TimedOut, withTimeout } from '../../src/core/timeout.ts';

describe('a wait with an end', () => {
  it('hands the answer through when it comes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 50, 'x')).resolves.toBe(7);
  });
  it('gives up, saying what it waited for', async () => {
    const never = new Promise<number>(() => undefined);
    await expect(withTimeout(never, 10, 'the store')).rejects.toBeInstanceOf(TimedOut);
    await expect(withTimeout(never, 10, 'the store')).rejects.toMatchObject({ what: 'the store', ms: 10 });
  });
  it('still fails with the work\'s own error when that comes first', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 50, 'x')).rejects.toThrow('nope');
  });
});
