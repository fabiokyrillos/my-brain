# Navigation Performance Design

## Goal

Make authenticated navigation respond immediately on web and installed PWA while preserving Supabase RLS, lifecycle, consent, and server-side mutation authority.

## Architecture

The authenticated shell remains a Next.js App Router server layout. Dynamic pages gain a prefetched `loading.tsx` shell so a click changes UI immediately and the page streams behind it. Internal navigation remains on `next/link`; no product link may force a document reload.

Authentication keeps the existing fail-closed gates, but page identity uses verified JWT claims rather than a network `getUser()` lookup. The lifecycle and current-policy reads remain authoritative database checks. Independent page reads are issued concurrently. Reversible Work commands show an immediate optimistic pending state, retain their idempotency key, and defer truth/rollback messaging to the existing server result and undo contract.

## Data Flow

1. A visible `<Link>` is partially prefetched with the authenticated loading shell.
2. On activation, the shell remains interactive and renders a route skeleton immediately.
3. `requireUser` verifies claims, then enforces lifecycle and consent.
4. The page issues essential independent reads concurrently and streams the resolved content.
5. A reversible Work action immediately marks its row/action as updating; the existing Server Action remains authoritative and announces success, refusal, failure, or undo.

## Constraints

- No RLS, lifecycle, consent, confirmation, or idempotency boundary may be weakened.
- No broad offline-first store, IndexedDB schema, or new client cache dependency in this slice.
- Authenticated responses remain `no-store`.
- Loading UI must be responsive, accessible, and motion-safe.
- Exact performance claims require hosted authenticated measurement; source-level gates prove structure, not production latency.

## Acceptance Criteria

- Authenticated dynamic navigation has a route-level loading boundary.
- Primary navigation and the two known internal product anchors use client transitions.
- Pending navigation has an accessible, visible state.
- `requireUser` no longer performs a routine network `getUser()` lookup and preserves all redirects.
- Settings loads its three independent projections concurrently.
- Reversible Work actions expose immediate pending/optimistic feedback without claiming server success early.
- Focused tests, lint/typecheck, build, and diff checks pass, except explicitly documented pre-existing baseline failures.

