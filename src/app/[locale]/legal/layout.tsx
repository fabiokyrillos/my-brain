/**
 * The legal routes are PUBLIC (SH-LEGAL-001) — deliberately outside `app/` and
 * outside `auth/`, so `src/proxy.ts` neither requires a session for them nor
 * redirects an authenticated visitor away. A policy nobody can read before
 * signing up is not a policy anybody agreed to.
 *
 * `settings-page` rather than `auth-stage`: these are long documents, and that
 * class is the repository's existing readable-width column.
 */

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <main className="settings-page">{children}</main>;
}
