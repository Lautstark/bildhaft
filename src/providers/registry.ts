import type { ProviderId } from '../core/types.ts';
import { ArasaacProvider } from './arasaac.ts';
import { MetacomProvider } from './metacom.ts';
import type { SymbolProvider } from './types.ts';

export const arasaac = new ArasaacProvider();
export const metacom = new MetacomProvider();

const REGISTRY: Record<ProviderId, SymbolProvider> = { arasaac, metacom };

export function getProvider(id: ProviderId): SymbolProvider {
  return REGISTRY[id];
}

export const PROVIDER_IDS: ProviderId[] = ['arasaac', 'metacom'];
