import { Logo } from './Logo.tsx';

/**
 * Mobile-only header. Hidden on desktop, where the sidebar is always reachable
 * as a grid column. It is sticky and opaque so content scrolls underneath it
 * rather than showing through.
 */
export function TopBar({ onToggleNav, title }: { onToggleNav: () => void; title: string }) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn--quiet btn--icon"
        onClick={onToggleNav}
        aria-label="Menü öffnen"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
      <Logo size={20} />
      <span className="topbar__title">{title}</span>
    </header>
  );
}
