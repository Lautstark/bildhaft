// An in-memory IndexedDB, so repo.ts runs against a real store rather than a mock.
import 'fake-indexeddb/auto';

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
