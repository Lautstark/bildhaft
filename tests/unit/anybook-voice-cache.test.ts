import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

/*
 * A code heard once is not spoken again after a reload (her question,
 * 2026-10-28: „wir machen nicht bei jedem Play eine Anfrage an Azure oder?").
 * The engine is a stand-in that counts how often it really speaks; the store
 * it is handed is stimmquelle's `cacheStore`, in IndexedDB, as bildhaft uses it.
 */
let spoken = 0;

vi.mock('@lautstark/stimmquelle/browser', async () => ({
  usePiperRuntime: () => undefined,
  /* The real cache, stimmquelle's own: what bildhaft hands remember() is what is tested. */
  cacheStore: (await vi.importActual<typeof import('@lautstark/stimmquelle')>('@lautstark/stimmquelle')).cacheStore,
  async remember(store: { get(key: string): Promise<Uint8Array | undefined>; put(key: string, wav: Uint8Array): Promise<void> }, text: string, voice: string) {
    const key = `${voice}|${text}`;
    const held = await store.get(key);
    if (held) return { wav: held, key, cached: true };
    spoken += 1;
    const wav = new Uint8Array([1, 2, 3]);
    await store.put(key, wav);
    return { wav, key, cached: false };
  },
  decodeWav: () => ({ samples: new Float32Array(4), rate: 24000 }),
  encodeMp3: async () => new Uint8Array([9]),
}));
vi.mock('@lautstark/stimmquelle/runtime', () => ({ piperRuntime: () => ({}) }));

describe('the pen’s recordings', () => {
  it('are kept across a reload, so a code is spoken once', async () => {
    const first = await import('../../src/ui/anybookVoice.ts');
    await first.recordForPen('Erdbeere', 'azure:de-DE-KatjaNeural');
    await first.recordForPen('Erdbeere', 'azure:de-DE-KatjaNeural');
    expect(spoken).toBe(1);

    // A reload: the module and its in-memory map start over, the database stays.
    vi.resetModules();
    const again = await import('../../src/ui/anybookVoice.ts');
    await again.recordForPen('Erdbeere', 'azure:de-DE-KatjaNeural');
    expect(spoken).toBe(1);

    // Other words, or another voice, are another recording.
    await again.recordForPen('Erdbeere', 'piper:de_DE-thorsten-medium');
    await again.recordForPen('zwei Erdbeeren', 'azure:de-DE-KatjaNeural');
    expect(spoken).toBe(3);

    // „Alles löschen" forgets them: the next press speaks again.
    await again.forgetPenRecordings();
    vi.resetModules();
    const after = await import('../../src/ui/anybookVoice.ts');
    await after.recordForPen('Erdbeere', 'azure:de-DE-KatjaNeural');
    expect(spoken).toBe(4);
  });
});
