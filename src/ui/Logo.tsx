/** The bildhaft mark: a speech bubble with a face. Inherits colour from `fill`. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="bildhaft"
      focusable="false"
    >
      <path
        d="M 128 76 H 384 Q 436 76 436 128 V 272 Q 436 324 384 324 H 314 L 256 408 L 198 324 H 128 Q 76 324 76 272 V 128 Q 76 76 128 76 Z"
        fill="var(--accent)"
      />
      <circle cx="200" cy="178" r="22" fill="#fff" />
      <circle cx="312" cy="178" r="22" fill="#fff" />
      <path
        d="M 190 226 C 190 288 322 288 322 226"
        fill="none"
        stroke="#fff"
        strokeWidth="26"
        strokeLinecap="round"
      />
    </svg>
  );
}
