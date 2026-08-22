import type { Candidate, ProviderId } from '../core/types.ts';

export type ProviderStatus =
  | { kind: 'ready' }
  | { kind: 'needs-setup'; message: string }
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string };

export interface SymbolProvider {
  readonly id: ProviderId;
  readonly name: string;
  /** Shown in the footer and printed on output. Null when none is required. */
  readonly attribution: string | null;

  status(): ProviderStatus;
  isReady(): boolean;

  /** Ranked candidates for a lemma. Must not throw; return [] on failure. */
  search(lemma: string): Promise<Candidate[]>;

  /** A URL usable in <img src>. Object URLs are cached and reused. */
  getImageUrl(id: string): Promise<string | null>;

  /** Human-readable label for a symbol id, for rows restored from storage. */
  labelFor(id: string): Promise<string | null>;
}

/** Notifies the UI when a provider's readiness changes (folder picked, index built). */
export type ProviderListener = () => void;

export function scoreLabel(query: string, label: string): number {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l === q) return 100;
  if (l.startsWith(q + ' ') || l.startsWith(q + '-')) return 70;
  if (l.startsWith(q)) return 55;
  const words = l.split(/[\s\-_/]+/);
  if (words.includes(q)) return 60;
  if (words.some((w) => w.startsWith(q))) return 40;
  if (l.includes(q)) return 25;
  return 5;
}

export type { Candidate };
