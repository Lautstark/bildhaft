/**
 * A wait with an end.
 *
 * A store write or a symbol lookup that never answers used to leave the
 * page waiting with it: the button spun, nothing could be added, and there
 * was no word about what was being waited for. Nothing here cancels the
 * work — a file write cannot be taken back — but the page stops waiting and
 * says what it was waiting for, so the person can look in the right place.
 */
export class TimedOut extends Error {
  constructor(public readonly what: string, public readonly ms: number) {
    super(`${what} did not answer within ${ms} ms`);
    this.name = 'TimedOut';
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimedOut(what, ms)), ms);
  });
  return Promise.race([work, clock]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}
