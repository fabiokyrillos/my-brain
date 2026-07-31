# Product UX Closeout Report

**Initiative** — My Brain product UX/UI remediation, audit 1 through Slice H.
**Period** — 2026-07-30 to 2026-07-31.
**Durable source of truth** — [`PRODUCT_UX_FINDINGS.md`](./PRODUCT_UX_FINDINGS.md).
**Status** — closed. Every finding has exactly one final disposition. No finding
is OPEN, PARTIAL, ambiguous, duplicated, or contradictory between the summary
table and its detail record.

This report separates four things that are easy to blur together and expensive
to confuse: **product work completed**, **retained limitations**, **deferred
technical debt**, and **proposed Phase 2G product scope**. Repository
maintenance is listed separately from all four, because calling maintenance
"product scope" is how a backlog stops being readable.

---

## 1. Final finding counts

**34 findings.** Each ID appears exactly once in the summary table; there are no
gaps across `UX-01`…`UX-34`.

### By disposition

| Disposition | Count |
| --- | --- |
| **RESOLVED** | **29** |
| **RETAINED** with evidence | **4** |
| **DEFERRED** to a named destination | **1** |
| BLOCKED | **0** |
| OPEN / PARTIAL | **0** |

### By priority

| Priority | Count | Resolved | Not resolved |
| --- | --- | --- | --- |
| **P0** | 8 | **8** | **0** |
| P1 | 23 | 21 | 2 (UX-25 RETAINED, UX-22 DEFERRED) |
| P2 | 2 | 0 | 2 (UX-27 RETAINED, UX-33 RETAINED) |
| — (UX-24, verified-good) | 1 | — | RETAINED |

**Every P0 is RESOLVED.** No P0 is open, partial, blocked or deferred.

### By category

| Category | Count |
| --- | --- |
| missing-lifecycle | 8 |
| usability | 6 |
| localization | 5 |
| interaction-model | 4 |
| IA | 3 |
| visual | 3 |
| responsive | 2 |
| accessibility | 2 |
| — (UX-24) | 1 |

### The three findings Slice H's own re-audit raised

| ID | How it was found | Disposition |
| --- | --- | --- |
| **UX-32** | By *disproving* the accessibility finding H inherited. The blamed shape computes correctly in three accname implementations; probing the neighbours found the one that does not, live in three Settings fields. | RESOLVED |
| **UX-33** | By reproducing G4's "cosmetic limitation" and finding the mechanism narrower than described — the **browser's UI language**, which the page cannot influence at all. | RETAINED |
| **UX-34** | By the route sweep, on its first pass. The notifications bell is a navigation link on every page and never marked itself current; fifteen slices of review had not noticed. | RESOLVED |

### The five findings that are not RESOLVED

| ID | Pri | Disposition | Why |
| --- | --- | --- | --- |
| UX-24 | — | RETAINED | Does not reproduce. Measured clean at audit 1 and again in H; kept so it is never "fixed" without cause. |
| UX-25 | P1 | RETAINED | Home is ~24 % taller as a direct consequence of the UX-15 fix. The height buys legible rows; re-measured in Slice C and accepted there. |
| UX-27 | P2 | RETAINED | Two audit rows are two genuinely distinct events (row-level change, user-level operation), and History reads them at two altitudes with a test forbidding identical sentences. |
| UX-33 | P2 | RETAINED | `<input type="date">` renders its placeholder in the **browser's UI language**; the page cannot influence it, and the submitted value is ISO in every case. |
| UX-22 | P1 | **DEFERRED** → *localization maintenance* | 266 inline locale ternaries remain across 34 files. Converting them is a sweep with no behavioural test to protect it. |

---

## 2. Slice, PR and merge table

| Slice | Covers | PR | Merge SHA |
| --- | --- | --- | --- |
| Audit 1 | 24 findings recorded (14 owner + 10 discovered) | — | base `0c13285` |
| **A** — responsive foundations | UX-15, UX-16, UX-20 (affordance), UX-14 (partial) | #35 | `4d8e3d2` |
| **B** — navigation & IA | UX-17, UX-23 | #36 | `2c935f9` |
| **C** — Home as an attention surface | UX-02, UX-18, UX-25 (re-measured) | #37 | `35ae645` |
| **D1** — task detail | UX-05 (inspect), **UX-19**, UX-20 (task rows) | #38 | `9302bc5` |
| **D2** — structured field edits | UX-05 (edit), UX-29 | #39 | `4e97519` |
| **D3** — account and session | UX-26, UX-30, UX-31 | #40 | `cf2bcb5` |
| **B2** — Registros, FAB centring | UX-01, UX-03, UX-14 (remainder), DEC-1 | #41 | `9d7f98f` |
| **E** — unified composer | UX-07, DEC-3 | #42 | `967e6cc` |
| **F1** — the assistant's name | UX-06, DEC-2 | #43 | `66d2ae0` |
| **F2** — Projects and People | UX-08, UX-09 | #44 | `558ecdd` |
| **G1** — question after-state | UX-11 | #45 | `974c072` |
| **G2** — reminder precondition (gate) | DEC-6 raised; UX-12 blocked | #46 | `0548e2c` |
| **G3** — memories | UX-10, DEC-5 | #47 | `e6df3a4` |
| **G4** — history | UX-13, UX-28, UX-27 (investigated), UX-21/22 (History) | #48 | `cea24c8` |
| **G5** — reminder lifecycle | UX-12, DEC-6, DEC-7 (ADR-060, ADR-061) | #49 | `3fd0bb9` |
| **H** — closeout | ledger reconciliation, UX-04, UX-21, UX-22, UX-27, UX-32, UX-33, UX-34 | #50 | *this PR* |

Sixteen slices, sixteen PRs, every branch preserved.

---

## 3. Before / after — information architecture

| | Audit 1 | After H |
| --- | --- | --- |
| **Navigation** | 14 concepts exposed before the workflow is understood; last rail item clipped at 1440×900 | Desktop rail plus a five-slot mobile bar (Início · Trabalho · [Capturar] · Brain · Mais); Registros in `Mais`; capture control on the centre line |
| **The record surface** | "Caixa" — named a mailbox, was a full record list | **Registros / Records**, named for what it is |
| **Home** | editorial; large voids beside compressed content | an attention surface answering the owner's five questions in order |
| **Entry detail** | organised around the interpretation object; the owner's words collapsed; created objects nowhere | organised around the owner's questions; the original open; a standing, linked list of everything the entry produced |
| **Tasks** | not inspectable, not editable; 11 of 15 domain verbs unreachable | detail route, structured edits, two-step destructive confirmation, cancelled-task recovery |
| **Projects / People** | create-by-name only; no edit path; modelled relations unsurfaced | detail pages, edit forms, organizations, relations surfaced |
| **Memories** | no mental model, no provenance, no lifecycle | kind, provenance, validity and archive, with a conversational proposal path |
| **Reminders** | create only | snooze, reschedule, cancel, restore and edit, through one narrow RPC boundary |
| **Questions** | resolution had no visible after-state | a partitioned open/resolved surface that says what happened |
| **History** | no search, no filters, raw DB vocabulary, no link to the subject | filters that run in Postgres, a typed vocabulary, and typed subject links proven to exist |
| **Account / session** | **no logout anywhere in the product**; a revoked session became an infinite redirect loop | one account disclosure mounted twice; revocation and Back both handled |
| **Vocabulary** | database enums rendered as labels on nine surfaces | one shared typed vocabulary; one documented exception on a private technical queue |
| **Composer** | three competing AI input surfaces on one page | one composer that routes commands and falls through to knowledge answers |

---

## 4. Evidence

| Kind | Where |
| --- | --- |
| **Desktop** — 1440×900 and 1920×1080 | `ux-evidence/slice-h/*__desktop-1440.png`, `*__desktop-1920.png` |
| **Mobile** — 375×667 and 412×915 | `ux-evidence/slice-h/*__iphone-se-375.png`, `*__pixel7-412.png` |
| **Both locales** | every frame captured twice: `__pt-BR__` and `__en__` |
| **Authenticated journeys** | `e2e/online-*.spec.ts`, run against the deployed Supabase project on `desktop` and `mobile` |
| **Route re-audit** | `e2e/online-route-audit.spec.ts` — 168 measured page loads |
| **UX-04 journey** | `e2e/online-entry-outcomes.spec.ts` — 10/10 (5 desktop, 5 mobile) |
| **Accessibility** | Chromium AX tree over CDP, Playwright accname, and `dom-accessibility-api`, all three recorded in the Slice H ledger section |
| **UX-33** | `ux-evidence/slice-h/date-placeholder__browser-{en-US,pt-BR,de-DE}.png` |
| **Prior slices** | `ux-evidence/{baseline,slice-a,slice-b,slice-c,slice-d1,slice-g3,slice-g4}/` |

All captured content is synthetic. No real account identity, credential, or
owner data appears in any evidence file, report or PR.

---

## 5. Migration, parity, grants and residue

- **Migration parity — `202607310064`, local and remote, unchanged by H.**
  Verified with `npx supabase migration list --linked`: local head, remote head
  and applied-at all read `202607310064`, with no drift anywhere in the chain.
  Slice H contains **no migration, no SQL, no RPC change and no grant change**.
- **Grants and RLS preserved — verified behaviourally, not asserted.** A fixture
  account was minted, signed in, and its own token used against the deployed
  project:

  | Attempt, as `authenticated` | Result |
  | --- | --- |
  | `SELECT` on `public.reminders` | **200** — allowed, as designed |
  | `INSERT` on `public.reminders` | **201** — allowed (the Option C authoring exception) |
  | `UPDATE` on `public.reminders` | **403** — refused |
  | `DELETE` on `public.reminders` | **403** — refused |
  | `UPDATE` on `public.tasks` | **403** — refused |
  | `public.apply_reminder_command_v1` | published, reachable, and validating (`400 Invalid reminder command` on a malformed command) |

  Phase 2F's revocation and Slice G5's boundary both stand. Every user-owned
  table keeps forced RLS. No `SECURITY DEFINER` function was added, altered or
  re-granted. The probe account was deleted in a `finally`.
- **Zero residue.** Every authenticated journey mints its own account and
  deletes it fail-closed in `afterAll`; the ownership-isolation case deletes its
  second account in a `finally`. Account deletion cascades to every seeded row.
  Confirmed after G5: **zero rows with `status = 'snoozed'`, zero non-null
  `snoozed_until`, zero fixture-shaped rows, zero fixture accounts.**

---

## 6. Known limitations (retained, with evidence)

1. **Home is ~24 % taller than before the UX-15 fix** (UX-25). The height is what
   legible rows cost; measured and accepted in Slice C.
2. **One task creation writes two audit rows** (UX-27). They are two distinct
   events and read as two distinct sentences. Grouping them needs a migration —
   see Phase 2G candidates.
3. **`<input type="date">` renders its placeholder in the browser's UI language**
   (UX-33). The page cannot influence it; the submitted value is ISO regardless.
4. **`/app/jobs` shows the raw identifier for an unknown worker type** (UX-21's
   documented exception). `jobs.type` has no `check` constraint by design.
   `technical-details.tsx` likewise falls back for the model-produced evidence
   vocabulary, behind the disclosure named "technical details".
5. **Touch targets were never a defect** (UX-24) and are re-measured every sweep
   so they do not become one.

---

## 7. Deferred technical debt

### D-1 — Localization maintenance (UX-22)

**266 inline locale ternaries across 34 non-test files.** Method:
`git grep -oE '\bpt \?' -- src/`, excluding `*.test.ts(x)`. Trajectory: 288 at
the pre-remediation base → 266 now.

| File | Count |
| --- | --- |
| `features/profile/settings-form.tsx` | 53 |
| `app/[locale]/app/costs/page.tsx` | 37 |
| `app/[locale]/app/inbox/page.tsx` | 13 |
| `features/daily-cycle/technical-details.tsx` | 13 |
| `app/[locale]/app/people/[personId]/page.tsx` | 11 |
| `features/operations/task-list.tsx` | 10 |
| `app/[locale]/app/projects/[projectId]/page.tsx` | 9 |
| `features/daily-cycle/entry-review.tsx` | 8 |
| `app/[locale]/app/inbox/[entryId]/page.tsx` | 8 |
| `app/[locale]/app/notifications/page.tsx` | 7 |
| `app/[locale]/app/questions/page.tsx` | 7 |
| `app/[locale]/auth/login/page.tsx` | 7 |
| `app/[locale]/auth/register/page.tsx` | 7 |
| `app/[locale]/auth/reset/page.tsx` | 7 |
| `app/[locale]/app/people/page.tsx` | 6 |
| `app/[locale]/app/projects/page.tsx` | 6 |
| `app/[locale]/app/jobs/page.tsx` | 5 |
| `app/[locale]/app/reviews/page.tsx` | 5 |
| `app/[locale]/auth/recover/page.tsx` | 5 |
| `features/capture/quick-capture-form.tsx` | 5 |
| `features/tasks/task-candidate-form.tsx` | 5 |
| `app/[locale]/app/chat/[conversationId]/page.tsx` | 4 |
| `app/[locale]/app/error.tsx` | 4 |
| `features/shell/pagination-links.tsx` | 4 |
| `features/tasks/actions.ts` | 4 |
| `app/[locale]/app/chat/page.tsx` | 3 |
| `features/operations/inline-create-form.tsx` | 3 |
| `app/[locale]/app/capture/page.tsx` | 2 |
| `app/[locale]/app/settings/page.tsx` | 2 |
| `features/daily-cycle/task-detail-view.tsx` | 2 |
| `features/assistant/copy.ts` | 1 |
| `features/daily-cycle/needs-attention-list.tsx` | 1 |
| `features/entities/copy.ts` | 1 |
| `features/reminders/copy.ts` | 1 |

**Suggested order:** `settings-form.tsx` and `costs/page.tsx` first — together
they are 34 % of the total, both are single-purpose pages, and neither is on a
critical path. The four `auth/*` pages next, as one small self-contained set.

**Suggested guard:** a test asserting the count cannot rise. The audit proposed
one; none was ever written, which is why four slices raised it without anyone
noticing.

### D-2 — `.gitattributes` for SQL line endings

Two assertions in `sql-reachability.test.ts` fail on Windows and pass on Linux
CI. Cause: `core.autocrlf = true` with no `.gitattributes`, against multi-line
test patterns anchored on bare `\n`. **Fix:** `*.sql text eol=lf`. **This is
repository maintenance, not product scope**, and is deliberately outside Slice
H's diff.

---

## 8. Evidence-based recommendation for Phase 2G

Ranked by what the remediation actually learned, not by what is easiest.

### Strong — the product has an unanswered question

**2G-1 · Conversational capture routing.** Slice E's investigation (`E-M5`)
found that routing capture through the command taxonomy needs a migration and
deferred it explicitly. It remains the largest gap between what the owner can
say and what the product can do: there is still **no create verb**, so "add a
task" is refused rather than offered. Evidence: `E-M4`, `E-M5` in the ledger.
*Needs a schema decision and owner approval.*

**2G-2 · DEC-4 — new fields for projects and people.** Deliberately deferred
until the existing columns shipped, which they now have (Slice F2). The
candidates named at the time — project purpose/dates/notes, a person-level role
— can now be decided against real use rather than in the abstract. *Additive
migrations; owner decision required.*

### Moderate — real, bounded, and evidence-backed

**2G-3 · `audit_logs.operation_id` (closes UX-27's root).** A nullable `uuid`,
stamped by each RPC on its own row and — via a transaction-local setting the
trigger reads, the mechanism `app.audit_actor` already establishes — on the
trigger's row too. Additive, nullable, no backfill; every existing row renders
exactly as it does now. This is the only deferred item with a fully specified
design already in the ledger.

**2G-4 · Detail routes for organizations and contexts.** UX-04's outcome section
degrades two entity types to plain text because no route can receive them. Both
already have tables, ownership and relations; only the surface is missing.
*Read-only; no migration.*

### Weak — do not put these in a product phase

- **Localization maintenance (D-1)** — real debt, zero product behaviour change.
  Its own slice, not Phase 2G.
- **`.gitattributes` (D-2)** — repository maintenance. A ten-line PR.

### What Phase 2G should not inherit

Nothing from this initiative is blocked, ambiguous or half-finished. The four
RETAINED limitations are decisions with evidence, not deferrals; the one
DEFERRED item has a named destination, an exact count and a file list. Phase 2G
starts from a clean ledger.

---

## 9. Statement of completion

- Every one of the **34** findings has exactly one final disposition.
- **All 8 P0 findings are RESOLVED.**
- **0** findings are OPEN, PARTIAL, ambiguous, duplicated, or contradictory
  between summary and detail.
- Migration parity is **202607310064** on both sides and **unchanged by Slice H**.
- Grants and RLS are unchanged; `authenticated` still holds only `SELECT` and
  `INSERT` on `public.reminders`.
- **Zero fixture accounts and zero fixture-shaped rows** remain.
- **Phase 2G has not started and is not authorized by this report.** The scope
  above is a recommendation awaiting the owner's decision.
