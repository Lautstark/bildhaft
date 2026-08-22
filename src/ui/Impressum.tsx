import { Dialog } from './Dialog.tsx';

/**
 * Pflichtangaben nach § 5 DDG. bildhaft ist kein Gewerbe, also keine
 * Registereintragung und keine Umsatzsteuer-ID — Name, Anschrift und zwei
 * Wege, jemanden direkt zu erreichen, sind hier alles, was verlangt ist.
 */

/** Die eine Zeile, die man ändert, wenn eine andere Adresse öffentlich sein soll. */
const EMAIL = 'stefanie.grewenig@googlemail.com';
const ISSUES = 'https://github.com/Lautstark/bildhaft/issues';

export function Impressum({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Impressum" onClose={onClose}>
      <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Angaben gemäß § 5 DDG</h3>
      <p style={{ margin: 0 }}>
        Stefanie Grewenig
        <br />
        Talheide 5
        <br />
        21149 Hamburg
        <br />
        Deutschland
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Kontakt</h3>
      <p style={{ margin: 0 }}>
        E-Mail: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
        <br />
        Fehler und Fragen auch öffentlich:{' '}
        <a href={ISSUES} target="_blank" rel="noreferrer noopener">
          github.com/Lautstark/bildhaft/issues
        </a>
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Verantwortlich für den Inhalt</h3>
      <p style={{ margin: 0 }}>Stefanie Grewenig, Anschrift wie oben.</p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Piktogramme und Quellcode</h3>
      <p style={{ margin: 0 }}>
        bildhaft ist ein privates, nicht kommerzielles Projekt. Der Quellcode steht
        unter der MIT-Lizenz. Die Piktogramme stammen von{' '}
        <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">ARASAAC</a>{' '}
        (CC BY-NC-SA, Autor: Sergio Palao, Urheber: Regierung von Aragón) und sind
        nicht Teil dieser Software. METACOM-Symbole werden weder mitgeliefert noch
        übertragen.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Haftung für Links</h3>
      <p style={{ margin: 0 }}>
        Für die Inhalte verlinkter externer Seiten sind deren Betreiber
        verantwortlich. Zum Zeitpunkt der Verlinkung waren dort keine
        Rechtsverstöße erkennbar.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Streitbeilegung</h3>
      <p style={{ margin: 0 }}>
        Zur Teilnahme an einem Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle bin ich weder verpflichtet noch bereit.
      </p>
    </Dialog>
  );
}
