import { describe, expect, it } from 'vitest';
import { achsen, faelleFor, fallFor, standardLines, standardOf, standardWahl, testdaten } from '../../src/pruefen/faelle.ts';
import { COLLECTION_KINDS, DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import { openPrint } from '../../src/app/templates.ts';

/**
 * The Prüfseite's cases are data: each template opens on its Standard, a
 * switch moved changes exactly what it says, and every comparison has both
 * sides among the cases measured.
 */
describe('Prüfseite cases', () => {
  it('opens every template on the template’s own opening', () => {
    for (const which of COLLECTION_KINDS) {
      const m = testdaten(which);
      const fall = fallFor(which, m, standardWahl(which, m));
      expect(fall.standard).toBe(true);
      const grid = which === 'tafel' ? { cols: 4, rows: 3 } : null;
      expect(fall.settings).toEqual(openPrint(which, DEFAULT_PRINT_SETTINGS, {}, grid));
      expect(standardOf(which, m)).toEqual(fall.settings);
    }
  });

  it('takes a number as typed, as the menu’s field does', () => {
    const m = testdaten('satzstreifen');
    const fall = fallFor('satzstreifen', m, { ...standardWahl('satzstreifen', m), rand: 7.5, symbolgroesse: 33 });
    expect(fall.settings.cutMarginMm).toBe(7.5);
    expect(fall.settings.symbolSizeMm).toBe(33);
    expect(fall.name).toBe('Symbolgröße: 33 mm · Rand: 7,5 mm');
  });

  it('prints the title as typed', () => {
    const m = testdaten('rezept');
    expect(fallFor('rezept', m, { ...standardWahl('rezept', m), titeltext: 'Omas Waffeln' }).titel).toBe('Omas Waffeln');
  });

  it('measures both sides of every comparison', () => {
    for (const which of COLLECTION_KINDS) {
      const ids = new Set(faelleFor(which).map((fall) => fall.id));
      for (const fall of faelleFor(which)) {
        for (const { mit } of fall.vergleiche) expect(ids, `${fall.id} → ${mit}`).toContain(mit);
      }
    }
  });

  it('compares every Anybook case with the same sheet without the circle', () => {
    for (const which of COLLECTION_KINDS) {
      const all = faelleFor(which);
      for (const fall of all.filter((one) => one.settings.anybookCircle)) {
        const twin = all.find((one) => one.id === fall.vergleiche.find((v) => v.regel === 'anybook')?.mit);
        expect(twin, fall.id).toBeDefined();
        expect({ ...twin!.settings, anybookCircle: true, anybookPlace: fall.settings.anybookPlace }).toEqual(fall.settings);
      }
    }
  });

  it('offers the switches a template’s menus have, and no others', () => {
    const keys = (which: Parameters<typeof achsen>[0]) => achsen(which).map((achse) => achse.key);
    expect(keys('wortkarten')).not.toContain('papier');
    expect(keys('wortkarten')).toContain('groesse');
    expect(keys('einkaufsliste')).not.toContain('beschriftung');
    expect(keys('satzstreifen')).toContain('satz');
    expect(keys('spiel')).toEqual(expect.arrayContaining(['titel', 'titeltext', 'beschriftung', 'schrift', 'anybook', 'lochen']));
  });

  it('says what each template sets itself', () => {
    expect(standardLines('spiel').find((line) => line.name === 'Papier')).toEqual({ name: 'Papier', value: 'A4 quer', own: true });
    expect(standardLines('wortkarten').find((line) => line.name === 'Papier')?.own).toBe(false);
  });
});
