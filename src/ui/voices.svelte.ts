/**
 * Which voice the Anybook codes speak in.
 *
 * The household's choice in Einstellungen → Stimme, as mitreden's „Standardstimme"
 * is; a material can speak in another one, chosen in the „Für Anybook Studio"
 * sheet (`PrintSettings.anybookVoice`) — not in the Symbol menu, her call. The Azure key is the household's
 * too, kept in this browser's settings and sent to nobody but Microsoft.
 */
import type { AzureOptions, Offered } from '@lautstark/stimmquelle/browser';
import type { PrintSettings } from '../core/types.ts';
import { persistSettings } from '../app/settings.ts';
import { s } from '../app/state.svelte.ts';
import { hearForPen, loadVoiceEngine, offeredVoices } from './anybookVoice.ts';

let voices = $state.raw<readonly Offered[]>([]);
let labels = $state.raw<Record<string, string>>({});
let asked: Promise<void> | null = null;

/** The voices on offer, once they are loaded; `loadVoices()` loads them. */
export const knownVoices = (): readonly Offered[] => voices;

export const azureAccess = (): AzureOptions | undefined => s.settings?.azure;

/** Loads the voices once, and again when the Azure key changes. */
export function loadVoices(again = false): Promise<void> {
  if (asked && !again) return asked;
  asked = (async () => {
    const browser = await loadVoiceEngine();
    const list = await offeredVoices(azureAccess());
    voices = list;
    labels = Object.fromEntries(list.map((one) => [one.id, browser.labelOf(one, list)]));
  })();
  return asked;
}

/** The household's voice: the one chosen in Einstellungen, else the first German one. */
export const defaultVoice = (): string =>
  s.settings?.voice ?? voices.find((one) => one.lang === 'de')?.id ?? '';

/** The voice a material's codes speak in. */
export const voiceOf = (print: Pick<PrintSettings, 'anybookVoice'> | undefined): string =>
  print?.anybookVoice ?? defaultVoice();

export const voiceLabel = (id: string): string => labels[id] ?? id.replace(/^piper:/, '');

export function pickDefaultVoice(id: string): void {
  if (s.settings) persistSettings({ ...s.settings, voice: id });
}

export async function keepAzure(next: { key?: string; region: string }): Promise<void> {
  if (!s.settings) return;
  const key = next.key ?? s.settings.azure?.key;
  if (!key) return;
  persistSettings({ ...s.settings, azure: { key, region: next.region } });
  await loadVoices(true);
}

export async function forgetAzure(): Promise<void> {
  if (!s.settings) return;
  const { azure: _gone, ...rest } = s.settings;
  /* The household voice goes with the key when it was one of Azure's. */
  persistSettings({ ...rest, voice: rest.voice?.startsWith('azure:') ? undefined : rest.voice });
  await loadVoices(true);
}

/** Whether Azure answers this key, and with how many voices. */
export async function probeAzure(azure: AzureOptions):
Promise<{ ok: true; count: number } | { ok: false; code: 'unreachable' | 'refused' | 'failed'; words: string }> {
  try {
    const browser = await loadVoiceEngine();
    return { ok: true, count: (await browser.azureVoices(azure)).length };
  } catch (error) {
    const words = error instanceof Error ? error.message : String(error);
    const code = error instanceof TypeError ? 'unreachable' : /rejected the key|401|403/.test(words) ? 'refused' : 'failed';
    return { ok: false, code, words };
  }
}

/** Says it in this voice: what a code will say, or a sample in the picker. */
export const hear = (text: string, voice: string): Promise<void> => hearForPen(text, voice, azureAccess());
