interface Props {
  attribution: string | null;
  onAbout: () => void;
  onImpressum: () => void;
  onDatenschutz: () => void;
}

export function Footer({ attribution, onAbout, onImpressum, onDatenschutz }: Props) {
  return (
    <footer className="footer">
      {/* Attribution is required by the ARASAAC licence — compact, but never hidden. */}
      {attribution && <p style={{ margin: '0 0 4px' }}>{attribution}</p>}
      <p className="footer__links">
        <button type="button" className="linklike" onClick={onAbout}>Was ist bildhaft?</button>
        {/* Both are legally required to be reachable and to be called exactly this.
            "Kontakt" or a line inside the About dialog would not count. */}
        <button type="button" className="linklike" onClick={onImpressum}>Impressum</button>
        <button type="button" className="linklike" onClick={onDatenschutz}>Datenschutz</button>
        <a href="https://github.com/Lautstark/bildhaft" target="_blank" rel="noreferrer noopener">
          Quellcode
        </a>
        <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a>
      </p>
    </footer>
  );
}
