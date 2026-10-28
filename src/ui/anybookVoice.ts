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
 * A recording is kept, across reloads, under the name stimmquelle gives it
 * (`remember`, the same name mitreden and vorlaut-editor use): a code heard
 * once is not asked of Azure again, and a sheet whose codes were heard one by
 * one goes out to Studio without speaking them again. Kept in stimmquelle's
 * own cache (`cacheStore`, since 2.13.0), not in the Sicherung: what can be
 * spoken again is not the user's to back up, and the browser may clear it.
 */
import type { AzureOptions, CacheStore, Offered, OnnxModule } from '@lautstark/stimmquelle/browser';

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

/* The finished WAVs, by their stimmquelle name, in a database of their own —
   apart from the material's (db.ts), so a wiped cache cannot touch a
   Sammlung. Made with the engine, which is loaded on first use. */
const CACHE_DB = 'bildhaft-stimme';
let store: CacheStore | null = null;

/* The same recording asked for twice at once — ▶ and the export — is made once. */
const making = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/** One code's recording, as the pen wants it. Made once per voice and words, and kept. */
export function recordForPen(text: string, voice: string, azure?: AzureOptions): Promise<Uint8Array<ArrayBuffer>> {
  const key = `${voice}\u0000${text}`;
  let made = making.get(key);
  if (!made) {
    made = (async () => {
      const browser = await loadVoiceEngine();
      store ??= browser.cacheStore(CACHE_DB);
      const { wav } = await browser.remember(store, text, voice, { ...OFFERING, rate: PEN.sampleRate, azure });
      const { samples, rate } = browser.decodeWav(wav);
      return new Uint8Array(await browser.encodeMp3(samples, rate, PEN.bitrate));
    })();
    made.catch(() => making.delete(key));
    making.set(key, made);
  }
  return made;
}

/** Every kept recording forgotten, for „Alles löschen": nothing of the library stays behind. */
export async function forgetPenRecordings(): Promise<void> {
  making.clear();
  const browser = await loadVoiceEngine();
  store ??= browser.cacheStore(CACHE_DB);
  await store.clear();
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
