import { Sicherung } from '@lautstark/sicherung';
import { exportEverything } from '../db/exportImport.ts';
import { onChanged } from '../db/repo.ts';

/**
 * The standing backup. `exportEverything` is what it is handed and the only
 * thing it is ever handed — that function is the audited artefact, carrying
 * symbol references and the user's own pictures, and never an ARASAAC or
 * METACOM pixel. A chosen folder may well sit inside Dropbox, so what goes
 * in it leaves the machine; tests/unit/backup-payload.test.ts holds this wiring in
 * place, and a failure there is a licensing problem rather than a bug.
 *
 * A file of its own so that the test can read the constructor call without
 * reading the rest of the controller around it.
 */
export function standingBackup(): Sicherung {
  const backup = new Sicherung({
    app: 'bildhaft',
    produce: exportEverything,
    // Nothing in this browser. @lautstark/sicherung v1.3.0 holds a write that
    // would put that over a folder holding the real thing, and this line is
    // what tells it — the package knows nothing about collections or
    // sentences, deliberately, and would have to be told their names to guess.
    //
    // This is the product it actually happened to: on 2026-08-28 the site
    // moved to bildhaft.lautstark.tech, per-origin storage meant the new
    // address opened empty, and bildhaft-aktuell.json went from three
    // collections to zero. The dated copy from five days earlier is what was
    // left. Overrides are not counted: they hang off collections and mean
    // nothing without them.
    looksEmpty: (produced) => {
      const it = produced as { collections?: unknown[]; sentences?: unknown[] };
      return it.collections?.length === 0 && it.sentences?.length === 0;
    },
  });

  // Every write to the library, from anywhere, through the one notifier in
  // repo.ts. Debounced inside Sicherung, so a burst of edits is one file.
  onChanged(() => backup.schedule());

  return backup;
}
