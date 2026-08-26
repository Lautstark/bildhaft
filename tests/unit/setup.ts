// An in-memory IndexedDB, so repo.ts runs against a real store rather than a mock.
import 'fake-indexeddb/auto';

/*
 * The language, pinned, before anything imports i18n/index.ts.
 *
 * That module reads the choice once at import and falls back to the browser's
 * own preference, and node has a `navigator.language` that follows whatever
 * locale the machine is set to. So without this the suite speaks German on a
 * German laptop and English on CI, and every assertion quoting a sentence
 * passes or fails by geography.
 *
 * German because that is what the existing assertions are written in, and
 * because a test suite should be pinned to one language rather than to
 * whichever the runner happens to have. The English side is checked by the
 * key-parity test and by e2e, which sets the same key to 'en'.
 */
const held = new Map<string, string>([['bildhaft.language', 'de']]);
globalThis.localStorage ??= {
  getItem: (key: string) => held.get(key) ?? null,
  setItem: (key: string, value: string) => void held.set(key, value),
  removeItem: (key: string) => void held.delete(key),
  clear: () => held.clear(),
  key: (i: number) => [...held.keys()][i] ?? null,
  get length() { return held.size; },
} as Storage;

/*
 * FileReader, which node has no version of.
 *
 * exportImport.ts uses it to turn a user's own picture into a data URL, and
 * that path is exactly what the licensing test needs to exercise — the whole
 * question is which bytes end up in the file. Stubbing the export instead
 * would test a different function than the one that ships.
 *
 * Only the readAsDataURL half is here, because only that half is called.
 */
class NodeFileReader {
  result: string | null = null;
  error: unknown = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then(
      (bytes) => {
        const base64 = Buffer.from(bytes).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        this.onload?.();
      },
      (reason: unknown) => { this.error = reason; this.onerror?.(); },
    );
  }
}

globalThis.FileReader ??= NodeFileReader as unknown as typeof FileReader;
