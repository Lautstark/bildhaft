import { useEffect, useState } from 'react';
import type { ProviderId } from '../core/types.ts';
import { useSymbolUrl } from './useSymbolUrl.ts';

interface Props {
  provider: ProviderId;
  id: string | null | undefined;
  /** Only used as a tooltip. See the note on alt below. */
  alt: string;
  placeholder?: string;
}

export function SymbolImage({ provider, id, alt, placeholder = '+' }: Props) {
  const url = useSymbolUrl(provider, id);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  if (!id) return <span className="slot__blank" aria-hidden="true">{placeholder}</span>;
  if (!url) return <span className="slot__blank" aria-hidden="true"><span className="spinner" /></span>;
  if (failed) return <span className="slot__blank" aria-hidden="true">!</span>;

  return (
    <img
      src={url}
      /*
       * Deliberately empty. Every symbol already sits next to a visible text label,
       * so alt text would be announced twice by a screen reader — and, worse, a
       * failed image paints its alt text inside the picture box, making the word
       * appear both "in" the symbol and underneath it.
       */
      alt=""
      title={alt}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
