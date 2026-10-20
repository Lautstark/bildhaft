import { s } from './state.svelte.ts';

/**
 * Lines sent from a part's own field, one after the other.
 *
 * The field stays open and takes the next line while the last is still being
 * looked up; Enter on it used to do nothing while the source was busy, and
 * the line typed next went over it. Each one now waits its turn — for the
 * one before it, and for anything else holding the source.
 */
export function inTurn(): (job: () => Promise<void>) => void {
  let chain: Promise<void> = Promise.resolve();
  return (job) => {
    chain = chain.then(async () => { await free(); await job(); }).catch(() => undefined);
  };
}

const free = (): Promise<void> => new Promise((resolve) => {
  const look = (): void => { if (s.busy) window.setTimeout(look, 40); else resolve(); };
  look();
});
