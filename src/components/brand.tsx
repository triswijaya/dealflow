import Link from "next/link";

/** The "D." monogram: a solid D with a signal dot, drawn filled so it reads at 16px. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path fill="currentColor" stroke="none" fillRule="evenodd" d="M5 5h5.5a7 7 0 0 1 0 14H5zm3.25 3.25v7.5h2.25a3.75 3.75 0 0 0 0-7.5z" />
        <circle cx="20" cy="17.25" r="1.75" stroke="none" style={{ fill: "var(--signal)" }} />
      </svg>
    </span>
  );
}

/** App mark and name; the optional subtitle names the workspace under it. */
export function Brand({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link className="brand" href={href} aria-label="DealFlow">
      <BrandMark />
      <span className="brand-text">
        <span>DealFlow</span>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </Link>
  );
}
