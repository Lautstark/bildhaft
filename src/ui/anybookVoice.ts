/**
 * The Anybook codes' recordings: one sentence in, the mp3 the pen plays out.
 *
 * Spoken by stimmquelle, in the browser, exactly as mitreden speaks — the same
 * voices (piper's, and Azure's where a key is set), the same levelling, the
 * same 24 kHz mono at 48 kbps Studio's own transcode makes, so Studio takes
 * the file as it is and a code from bildhaft sounds like a sticker from
 * mitreden. Loaded the first time a voice is needed and not before: a piper
 * voice is many megabytes, and most sheets never go to Studio.
 *
 * A recording made to be listened to is kept for the export, so a sheet whose
 * codes were heard one by one goes out without speaking them again.
 */
import type { AzureOptions, Offered, OnnxModule } from '@lautstark/stimmquelle/browser';

const PEN = { sampleRate: 24000, bitrate: 48 } as const;
const OFFERING = { ownsInference: true } as const;

type Engine = typeof import('@lautstark/stimmquelle/browser');
let engine: Promise<Engine> | null = null;

export function loadVoiceEngine(): Promise<Engine> {
  engine ??= (async () => {
    const [browser, runtime] = await Promise.all([
      import('@lautstark/stimmquelle/browser'),
      import('@lautstark/stimmquelle/runtime'),
    ]);
    /* vite.config.ts serves the four files under wasm/ — the other end of this name. */
    browser.usePiperRuntime(runtime.piperRuntime({
      onnx: () => import('onnxruntime-web/wasm') as unknown as Promise<OnnxModule>,
      dir: 'wasm',
      base: import.meta.env.BASE_URL,
    }));
    return browser;
  })();
  return engine;
}

/** Every voice on offer: piper's, and Azure's with a key that works. */
export async function offeredVoices(azure?: AzureOptions): Promise<readonly Offered[]> {
  const browser = await loadVoiceEngine();
  const list: Offered[] = [...browser.piperVoices(OFFERING)];
  /* A broken Azure costs its own rows and nothing else: the settings panel's
     probe says what is wrong with the key. */
  if (azure) list.push(...await browser.azureVoices(azure).catch(() => []));
  return list;
}

const kept = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/** One code's recording, as the pen wants it. Made once per voice and words. */
export function recordForPen(text: string, voice: string, azure?: AzureOptions): Promise<Uint8Array<ArrayBuffer>> {
  const key = `${voice}\u0000${text}`;
  let made = kept.get(key);
  if (!made) {
    made = (async () => {
      const browser = await loadVoiceEngine();
      const spoken = await browser.speak(text, voice, { ...OFFERING, rate: PEN.sampleRate, azure });
      return new Uint8Array(await browser.encodeMp3(spoken.samples, spoken.rate, PEN.bitrate));
    })();
    made.catch(() => kept.delete(key));
    kept.set(key, made);
  }
  return made;
}

/** What the pen will say, out loud now. Resolves when it has been said. */
export async function hearForPen(text: string, voice: string, azure?: AzureOptions): Promise<void> {
  const bytes = await recordForPen(text, voice, azure);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  try {
    const audio = new Audio(url);
    await new Promise<void>((done, fail) => {
      audio.onended = () => done();
      audio.onerror = () => fail(new Error('Die Aufnahme ließ sich nicht abspielen.'));
      void audio.play().catch(fail);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
