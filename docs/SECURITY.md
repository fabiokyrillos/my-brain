# Security

## Identity and tenancy

Supabase Auth issues sessions; Next.js middleware refreshes them. Every user-owned row and private storage object is scoped by the authenticated UUID. RLS is defense in depth and is never replaced by UI filtering. OAuth redirects use an allowlist and PKCE.

## Secrets

Only public Supabase URL and anon key reach the browser. OpenAI, service-role, encryption, webhook, and provider secrets stay in server or platform secret stores. BYOK values will use envelope encryption with a rotated server key and masked metadata; plaintext keys are never returned.

## Application controls

- Strict input schemas, output encoding, upload MIME/signature/size checks, and safe filenames.
- Rate limits by user, IP, route, and expensive operation.
- CSRF-safe same-site cookies and origin validation for state-changing HTTP endpoints.
- CSP, HSTS in production, frame denial, nosniff, restrictive referrer and permissions policies.
- Structured logs redact secrets and truncate or hash sensitive content.
- Prompt-injection boundary treats files, webpages, and messages as data.
- Audit records for authentication-sensitive and agent mutations.

## Data lifecycle

Exports are scoped and asynchronous. Account deletion requires reauthentication, confirmation, a cooling window where appropriate, and a traceable deletion job. Backups, retention, and deletion behavior must be documented before production.

## Verification

CI applies migrations to a clean database, checks all owned tables for forced RLS and four explicit policies, runs cross-user denial tests, scans browser bundles for server secrets, and tests signed private-file access.

