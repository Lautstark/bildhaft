interface Props {
  attribution: string | null;
  onAbout: () => void;
}

export function Footer({ attribution, onAbout }: Props) {
  return (
    <footer className="footer">
      {/* Attribution is required by the ARASAAC licence — compact, but never hidden. */}
      {attribution && <p style={{ margin: '0 0 4px' }}>{attribution}</p>}
      <p className="footer__links">
        <button type="button" className="linklike" onClick={onAbout}>Was ist bildhaft?</button>
        <a href="https://github.com/Lautstark/bildhaft" target="_blank" rel="noreferrer noopener">
          Quellcode
        </a>
        <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a>
      </p>
    </footer>
  );
}
