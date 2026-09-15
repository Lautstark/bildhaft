import { TimedOut } from '../core/timeout.ts';
import { t } from '../i18n/index.ts';

/** How long a lookup or a store write may take before the page stops waiting for it. */
export const LOOKUP_MS = 20_000;
export const STORE_MS = 10_000;

/** What went wrong, in words the person can act on. */
export function sayWhy(err: unknown): string {
  if (err instanceof TimedOut) return t('ui.gave_up_waiting', { what: err.what });
  return err instanceof Error ? err.message : t('ui.translate_failed');
}
