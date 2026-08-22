import { Dialog } from './Dialog.tsx';

const REPO = 'https://github.com/Lautstark/bildhaft';
const ORG = 'https://github.com/Lautstark';
const MITREDEN = 'https://lautstark.github.io/mitreden/';

/**
 * What the footer used to try to say in five words. It has room here to be
 * accurate about the one thing that does leave the browser, which the old
 * footer line quietly rounded off.
 */
export function About({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Was ist bildhaft?" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        bildhaft macht aus getippten Sätzen Reihen von Symbolen, die man
        korrigieren und ausdrucken kann — für Satzstreifen und Karten zum
        Laminieren. Gedacht für Eltern, Lehrkräfte und Therapeut:innen, die mit
        einem nicht sprechenden Kind arbeiten.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Was den Rechner verlässt</h3>
      <p style={{ margin: 0 }}>
        Deine Sätze, deine Sammlungen und deine METACOM-Dateien bleiben hier.
        Das Einzige, was hinausgeht, ist ein einzelnes Wort an ARASAAC, wenn dort
        ein Piktogramm gesucht wird. Antworten werden gespeichert, ein Wort geht
        also einmal statt bei jedem Öffnen. Es gibt keinen Server, keine Konten
        und keine Auswertung.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Symbole</h3>
      <p style={{ margin: 0 }}>
        Die Piktogramme stammen von{' '}
        <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">ARASAAC</a>{' '}
        und stehen unter CC BY-NC-SA — Material daraus darf nicht kommerziell
        verwertet werden. METACOM ist lizenzpflichtig: bildhaft liefert keine
        METACOM-Symbole mit, sondern liest deinen eigenen, lizenzierten Ordner.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Quellcode und Schwesterprojekt</h3>
      <p style={{ margin: 0 }}>
        bildhaft ist quelloffen (MIT):{' '}
        <a href={REPO} target="_blank" rel="noreferrer noopener">github.com/Lautstark/bildhaft</a>.
        Die übrigen Werkzeuge liegen unter{' '}
        <a href={ORG} target="_blank" rel="noreferrer noopener">Lautstark</a>.
        {' '}
        <a href={MITREDEN} target="_blank" rel="noreferrer noopener">mitreden</a>{' '}
        ist das Schwesterprojekt: Satz eintippen, Audiodatei zurückbekommen,
        damit alle Geräte mit derselben Stimme sprechen.
      </p>
    </Dialog>
  );
}
