import type { Sicherung } from '@lautstark/sicherung';
import { standingBackup } from './backup.ts';

/**
 * The one standing backup, made when boot asks for it and reached by name
 * afterwards.
 *
 * It used to be a local in `mountApp` handed down to the settings dialog as an
 * argument, which is what a shell that owned everything could do. The dialog
 * reaches its own modules now, and this is the only thing in it that is a
 * single live object rather than a function: `backup.ts` beside this file
 * subscribes to every write to the library, and calling it twice would file
 * twice.
 *
 * Separate from backup.ts on purpose — tests/unit/backup-payload.test.ts reads
 * that file as text to audit what the Sicherung is handed, and a holder in it
 * would be one more thing between the test and the constructor call.
 */
let held: Sicherung | null = null;

export const standing = (): Sicherung => (held ??= standingBackup());
