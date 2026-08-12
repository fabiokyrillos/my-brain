# Local Day Correction — PRD

**Status:** authorized for planning, implementation and closeout by **ADR-111** (2026-08-12).
**Scope:** a mechanical correction, derived from the merged Phase 2M successor re-audit. It is
**not a phase**, it opens no roadmap position, and it implements nothing from Phase 2N.

**Migration budget: ZERO — allocated, obligated and spent.** Any need for a migration, a column,
an RLS/grant/policy/RPC change or a new preference is a **stop condition**, not a decision.

---

## 1. The problem, in one sentence

Seventeen call sites across sixteen files render a stored instant with **no timezone**, so they
show the *host's* day — UTC on the server, the device's zone in a browser — while the surfaces
beside them show the owner's.

## 2. Why it matters, concretely

The product already knows the answer. `profiles.timezone` is the owner's declared zone,
`src/lib/time/local-day.ts` has been the single definition of a local day since Phase 2M slice 2M.0,
and `src/lib/time/instant-format.ts` has rendered instants in that zone since 2M.3. Four surfaces
carried the defect past Phase 2M's close **with the exemption written down**; thirteen more carried
it with nobody watching, because the guard that would have caught them named eight directories and
none of the thirteen was in one.

The user-visible consequence is not subtle. On the Home dashboard the header says one day and the
task list under it is computed in another — the header used no zone, the list used
`workProjection.timezone`. Between 21:00 and midnight in `America/Sao_Paulo` those are *different
days*, every day.

## 3. The contract

Fixed before any call site is touched, and reused rather than restated per surface.

1. **The zone is the owner's declared preference** (`profiles.timezone`), resolved through one
   function, `resolveOwnerTimeZone` in `src/lib/time/owner-timezone.ts`.
2. **An absolute instant is formatted in that zone** — `formatInstant` / `instantFormatter`, which
   take `timeZone` positionally and never default it.
3. **"Today" is computed in that zone** — `localDayBounds` / `localDateOf`, never from the host.
4. **A wall date stays a wall date.** `planned_at` semantics are untouched; a `YYYY-MM-DD` the user
   named is not re-resolved as an instant.
5. **`YYYY-MM-DD` is never produced by slicing a UTC ISO string** when it represents the user's day.
6. **Forbidden:** the server's implicit zone; the browser's zone as authority; a fixed offset;
   manual ±24h; `new Date().toISOString().slice(0, 10)` as the user's day; `Intl.DateTimeFormat`
   without `timeZone` when formatting an instant server-side.
7. **23-, 24- and 25-hour days stay correct.**
8. **A nonexistent or repeated midnight never moves an item to another day.**
9. **pt-BR and en agree on the day** and differ only in presentation.
10. **The contract is reused, never copied.** **Four** private answers to "is this zone usable"
    existed outside the contract — three byte-identical `isValidTimeZone` predicates and
    `resolveProfileTimezone`, a resolver carrying its own hardcoded default string. They become one.

## 4. Requirements

| id | requirement | unit |
|---|---|---|
| `LDC-CONTRACT-001` | One resolver for the owner's zone; the **four** duplicate copies are removed, and a tree-wide census refuses a fifth | 1, 4 |
| `LDC-CONTRACT-002` | The locale changes the words, never the day; proved at a day boundary in both directions | 1 |
| `LDC-GUARD-001` | A tree-wide guard over `src/`, four families, exact-count self-cleaning occurrences, mutation controls | 1 |
| `LDC-GUARD-002` | The Phase 2M carry-past-close list reaches **empty** and its liveness assertion is retired with it | 2 |
| `LDC-DAILY-001` | `entry-review`, `inbox-item`, `needs-attention-item`, `technical-details` render in the owner's zone | 2 |
| `LDC-CONTEXT-001` | people (×2), projects, memories, inbox, files, chat render in the owner's zone | 3 |
| `LDC-CONTEXT-002` | Sensitivity, masking, provenance, ordering, pagination and return-position are unchanged by the fix | 3 |
| `LDC-AGENT-001` | Question panels and the job-retry notice render in the owner's zone | 4 |
| `LDC-AGENT-002` | The review period (`daily`/`weekly`/`monthly`) is computed in the owner's zone, and its stored `startDate`/`endDate` are the owner's calendar days | 4 |
| `LDC-SEARCH-001` | Search results and conversation sources agree with the contextual page about the day | 4 |
| `LDC-HOME-001` | Home's "today" is **computed**, not merely formatted, in the owner's zone, and agrees with the list beneath it | 4 |
| `LDC-MISC-001` | The BYOK validated-at date, the ±730-day picker bounds and the calendar's `shiftDay` use the contract | 4 |
| `LDC-PROOF-001` | Playwright desktop + mobile, both locales; authenticated production verification in two zones that are on different days at the same instant | 5 |
| `LDC-CLOSE-001` | Final census finds zero; occurrence list empty; 92 migrations; parity `202608120092` | 5 |

## 5. Explicitly out of scope

Phase 2N implementation; any new 2N requirement; Phase 2O; migrations, schema, RLS, grants,
policies, RPCs; a new timezone preference; `planned_at` semantics; push, notifications or any
delivery retry; opening signup; the rollout gate; a date library.

## 6. Non-goals that look like goals

- **Not** making every `24 * 60 * 60 * 1000` disappear. A cooldown, a retention bound, an undo
  window and a duration clamp are 24 hours and are *not* day boundaries. The census classified
  fifteen such occurrences as correct and they stay. The existing correlation guard
  (`phase-2m-local-day-guard.test.ts`) already catches the one shape that matters — a fixed 24 hours
  used to derive a *day boundary*.
- **Not** re-deriving stored data. Nothing is reprocessed, rewritten or backfilled. Every fix is at
  the read/render/compute boundary.
