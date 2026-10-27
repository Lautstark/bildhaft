import { describe, expect, it } from 'vitest';
import { FAELLE, standardLines, standardOf } from '../../src/pruefen/faelle.ts';
import { COLLECTION_KINDS, DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import { openPrint } from '../../src/app/templates.ts';

/**
 * The Prüfseite's cases are data: each template opens on its Standard, every
 * case is compared only with cases that exist, and nothing is listed twice.
 */
describe('Prüfseite cases', () => {
  it('opens every template on exactly one Standard, the template’s own opening', () => {
    for (const which of COLLECTION_KINDS) {
      const standards = FAELLE.filter((fall) => fall.vorlage === which && fall.standard);
      expect(standards).toHaveLength(1);
      const grid = which === 'tafel' ? { cols: 4, rows: 3 } : null;
      expect(standards[0]!.settings).toEqual(openPrint(which, DEFAULT_PRINT_SETTINGS, {}, grid));
      expect(standardOf(which, standards[0]!.material)).toEqual(standards[0]!.settings);
    }
  });

  it('names each case once and compares only with cases that exist', () => {
    const ids = new Set(FAELLE.map((fall) => fall.id));
    expect(ids.size).toBe(FAELLE.length);
    for (const fall of FAELLE) {
      for (const { mit } of fall.vergleiche) expect(ids, `${fall.id} → ${mit}`).toContain(mit);
    }
  });

  it('compares every Anybook case with the same sheet without the circle', () => {
    for (const fall of FAELLE.filter((one) => one.settings.anybookCircle)) {
      const twin = FAELLE.find((one) => one.id === fall.vergleiche.find((v) => v.regel === 'anybook')?.mit);
      expect(twin, fall.id).toBeDefined();
      expect({ ...twin!.settings, anybookCircle: true, anybookPlace: fall.settings.anybookPlace }).toEqual(fall.settings);
    }
  });

  it('says what each template sets itself', () => {
    expect(standardLines('spiel').find((line) => line.name === 'Papier')).toEqual({ name: 'Papier', value: 'A4 quer', own: true });
    expect(standardLines('wortkarten').find((line) => line.name === 'Papier')?.own).toBe(false);
  });
});
