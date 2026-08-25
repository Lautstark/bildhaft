/**
 * What a symbol source *is*, said once for everywhere that asks.
 *
 * Two surfaces ask now — the settings card, which sets the default, and a
 * Sammlung's own sheet, which sets that Sammlung's — and they are different
 * questions about the same two sources. mitreden met this and answered it with
 * one shared list component (`src/ui/voicepicker.ts`), because its two surfaces
 * are both a list of the same catalogue and a second copy would have drifted.
 *
 * bildhaft's two are not the same shape and sharing the whole list would be a
 * fiction: the settings card is a *setup* surface — the licence notice, the
 * folder picker, the ZIP reader, the parallel-rendering chooser, „Ordner
 * vergessen" — and the choosing part of it is one button per panel. A Sammlung's
 * sheet has nothing to set up; it picks between what is already there.
 *
 * So what is shared is the part that would actually drift, which is the facts:
 * how many symbols METACOM has, which folder they came from, and the sentence
 * for a source that cannot answer. Those were written out in settingsDialog.ts
 * and would have been written out again in the sheet, and a folder count that
 * two screens disagree about is worse than one nobody states. Each surface
 * keeps its own frame and its own word for the role a source plays there.
 */

import type { ProviderId } from '../core/types.ts';
import { getProvider, metacom, needsAttention } from '@lautstark/bildquelle';

export interface SourceFacts {
  id: ProviderId;
  /** The source's own name, from the package rather than from a table here. */
  label: string;
  /**
   * What decides between this source and the other one, in one line: its size,
   * and where it came from. For a source that cannot answer, why not.
   */
  facts: string;
  /** Whether it can draw a symbol right now. */
  ready: boolean;
  /**
   * Set when the state is somebody's to act on — a folder whose permission the
   * browser withdrew, or one that could not be read. `needsAttention` is
   * bildquelle's answer to which states those are, because it is the package
   * that knows what they mean; the words are this app's.
   */
  attention: boolean;
}

/**
 * ARASAAC's size is the same on every install and there is no folder to name,
 * so its line is the one fact that decides between it and METACOM. Kept short
 * because both surfaces put it on one line beside a role word.
 */
const ARASAAC_FACTS = 'rund 13.000 Piktogramme';

export function sourceFacts(id: ProviderId): SourceFacts {
  const label = getProvider(id).name;
  if (id === 'arasaac') {
    return { id, label, facts: ARASAAC_FACTS, ready: getProvider(id).isReady(), attention: false };
  }

  const status = metacom.status();
  const attention = needsAttention(status);
  return {
    id,
    label,
    // Narrowed on kind, not on isReady(): only the ready variant has no message.
    facts: status.kind === 'ready'
      ? `${metacom.symbolCount} Symbole · ${metacom.rootName}`
      : attention ? 'Zugriff bestätigen'
        : status.message,
    ready: metacom.isReady(),
    attention,
  };
}
