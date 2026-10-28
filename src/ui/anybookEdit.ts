import type { Sentence, Slot } from '../core/types.ts';
import { partOf, sentenceCaption, slotCaption, symbolIdFor, titleOf } from '../core/types.ts';
import { ANYBOOK_TITLE } from '../core/anybook.ts';
import { materialPrint } from '../app/print.ts';
import { activeCollection, kind, providerId } from '../app/state.svelte.ts';

/**
 * One code of the open material changed: its own words (empty for what stands
 * there, or the same words typed back), and whether it is off. Written to the
 * material's print, where the sheet reads it from.
 */
export function writeAnybook(key: string, said: string | null, off: boolean, standing?: string): void {
  const mp = materialPrint();
  if (!mp) return;
  const say = { ...(mp.settings.anybookSay ?? {}) };
  /* The words that stand there are no words of its own: cleared, or typed back, it says them again. */
  if (said === null || !said.trim() || said.trim() === standing?.trim()) delete say[key]; else say[key] = said.trim();
  const offs = (mp.settings.anybookOff ?? []).filter((one) => one !== key);
  if (off) offs.push(key);
  mp.patch({ anybookSay: Object.keys(say).length ? say : undefined, anybookOff: offs.length ? offs : undefined });
}

/** A code as Bearbeiten shows it: what it is filed under, and what it says unless told otherwise. */
export interface CodeHere { key: string; standing: string }

const on = (): boolean => materialPrint()?.settings.anybookCircle === true;

/*
 * Which field carries a code of its own, the same rule the sheet prints by
 * (PrintSheet.svelte): every card with a picture, but a Rezept's Schritt and
 * a Lied's line are read as one and carry one code for the line (lineCode), so
 * does a Plauderbuch's question (questionCode), a title's pictures go with the
 * title, and a card
 * that is one field — Wortkarten, Spiel, a Rezept's Zutat — is its first symbol.
 */
export function cardCode(sentence: Sentence, slot: Slot): CodeHere | null {
  if (!on() || !symbolIdFor(slot, providerId())) return null;
  if (sentence.part === 'titel') return null;
  const which = kind();
  if (which === 'lied' || (which === 'rezept' && partOf(sentence) === 'schritt')) return null;
  if (activeCollection()?.talk?.pages.some((page) => page.question === sentence.id)) return null;
  const first = which === 'satzstreifen' ? true : sentence.slots[0]?.id === slot.id;
  return first ? { key: slot.id, standing: slotCaption(slot) } : null;
}

/** A Rezept's Schritt or a Lied's line: one code for it all, under its number or at its start. */
export function lineCode(sentence: Sentence): CodeHere | null {
  if (!on() || !sentence.slots.some((slot) => symbolIdFor(slot, providerId()))) return null;
  const which = kind();
  if (which === 'lied' || (which === 'rezept' && partOf(sentence) === 'schritt')) {
    return { key: sentence.id, standing: sentenceCaption(sentence) };
  }
  return null;
}

/** The title's code, before it on paper as here. */
export function titleCode(): CodeHere | null {
  const open = activeCollection();
  return on() && open ? { key: ANYBOOK_TITLE, standing: titleOf(open) } : null;
}

/**
 * A Plauderbuch's question: one code for its band, read as one, as a
 * Schritt's (her call, 2026-10-28). Filed under the question's line.
 */
export function questionCode(question: Sentence | null, said: string): CodeHere | null {
  return on() && question && said.trim() ? { key: question.id, standing: said } : null;
}

/* A card's code pressed in Bearbeiten opens the card's Symbol dialog with the
   caret in „Stift sagt" (her call, 2026-10-28: under a card a field is too
   small to write in, so the card shows the words and the dialog takes them). */
let wanted: string | null = null;
export function wantPen(key: string): void { wanted = key; }
export function takePen(key: string): boolean { const yes = wanted === key; if (yes) wanted = null; return yes; }
