/*
 * Rescue bildhaft data stranded at an old origin.
 *
 * IndexedDB is scoped to the origin, so moving the site — a repository transfer
 * that changes the GitHub Pages URL, a custom domain, anything — leaves every
 * collection, sentence and dictionary entry behind at the old address. The app
 * at the new address starts empty and cannot reach it.
 *
 * The old origin is still reachable even when it serves a 404, so:
 *
 *   1. Open the OLD address in the browser that has the data
 *      (a "Page not found" page is fine — it is the origin that matters).
 *   2. Open the developer console and paste this whole file in.
 *   3. It downloads bildhaft-rettung-<date>.json.
 *   4. Open the NEW address and use Importieren to load that file.
 *
 * It only reads. Nothing at the old origin is modified or deleted.
 */
(async () => {
  const open = (name) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const db = await open('bildhaft').catch(() => null);
  if (!db) {
    console.error('Keine bildhaft-Daten unter %s gefunden.', location.origin);
    return;
  }

  const readAll = (store) => db.objectStoreNames.contains(store)
    ? new Promise((resolve) => {
        const query = db.transaction(store).objectStore(store).getAll();
        query.onsuccess = () => resolve(query.result);
      })
    : Promise.resolve([]);

  // v1 called a collection a "session"; v2 renamed it. Accept either.
  const collections = [...await readAll('collections'), ...await readAll('sessions')]
    .map(({ id, name, sentenceIds, createdAt, updatedAt }) => ({
      id, name: name ?? 'Gerettete Sammlung', sentenceIds: sentenceIds ?? [],
      createdAt: createdAt ?? Date.now(), updatedAt: updatedAt ?? Date.now(),
    }));

  const sentences = (await readAll('sentences')).map((row) => {
    const next = { ...row, collectionId: row.collectionId ?? row.sessionId };
    delete next.sessionId;
    delete next.reviewed;
    for (const slot of next.slots ?? []) delete slot.manual;
    return next;
  });

  const backup = {
    format: 'bildhaft.backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections,
    sentences,
    overrides: await readAll('overrides'),
    notice: `Gerettet von ${location.origin}. Enthält nur Symbol-Verweise, keine Bilddateien.`,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bildhaft-rettung-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  console.log(
    'Gerettet: %d Sammlung(en), %d Zeile(n), %d Wörterbuch-Einträge.',
    collections.length, sentences.length, backup.overrides.length,
  );
})();
