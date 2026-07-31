# Product UX Closeout Report

**Initiative** — My Brain product UX/UI remediation, audit 1 through Slice H.
**Period** — 2026-07-30 to 2026-07-31.
**Durable source of truth** — [`PRODUCT_UX_FINDINGS.md`](./PRODUCT_UX_FINDINGS.md).

**Status — COMPLETE.** Slice H merged as `864d39c` (PR #50) with CI green on all
three jobs at the exact merge SHA. Every finding has exactly one final
disposition; no finding is OPEN, PARTIAL, ambiguous, duplicated, or
contradictory between the summary table and its detail record. §10 carries the
integration record.

This report separates four things that are easy to blur together and expensive
to confuse: **product work completed**, **retained limitations**, **deferred
technical debt**, and **proposed Phase 2G product scope**. Repository
maintenance is listed separately from all four, because calling maintenance
"product scope" is how a backlog stops being readable.

---

## 1. Final finding counts

**35 findings.** Each ID appears exactly once in the summary table; there are no
gaps across `UX-01`…`UX-35`.

### By disposition

| Disposition | Count |
| --- | --- |
| **RESOLVED** | **30** |
| **RETAINED** with evidence | **4** |
| **DEFERRED** to a named destination | **1** |
| BLOCKED | **0** |
| OPEN / PARTIAL | **0** |

### By priority

| Priority | Count | Resolved | Not resolved |
| --- | --- | --- | --- |
| **P0** | 8 | **8** | **0** |
| P1 | 24 | 22 | 2 (UX-25 RETAINED, UX-22 DEFERRED) |
| P2 | 2 | 0 | 2 (UX-27 RETAINED, UX-33 RETAINED) |
| — (UX-24, verified-good) | 1 | — | RETAINED |

**Every P0 is RESOLVED.** No P0 is open, partial, blocked or deferred.

### By category

| Category | Count |
| --- | --- |
| missing-lifecycle | 8 |
| usability | 7 |
| localization | 5 |
| interaction-model | 4 |
| IA | 3 |
| visual | 3 |
| responsive | 2 |
| accessibility | 2 |
| — (UX-24) | 1 |

### The four findings Slice H's own re-audit raised

None of them came from looking harder at the same surfaces. Each came from an
instrument the initiative did not have until its last slice.

| ID | How it was found | Disposition |
| --- | --- | --- |
| **UX-32** | By *disproving* the accessibility finding H inherited. The blamed shape computes correctly in three accname implementations; probing the neighbours found the one that does not, live in three Settings fields. | RESOLVED |
| **UX-33** | By reproducing G4's "cosmetic limitation" and finding the mechanism narrower than described — the **browser's UI language**, which the page cannot influence at all. | RETAINED |
| **UX-34** | By the route sweep, on its first pass. The notifications bell is a navigation link on every page and never marked itself current; fifteen slices of review had not noticed. | RESOLVED |
| **UX-35** | By running **every** authenticated suite together, which no slice had done. The composer's memory journey had been red since G3 and survived two more slices' closeouts. | RESOLVED |

**UX-35 is the one worth reading twice.** Slice G3 correctly moved the memory
heading to the feature that owns it and correctly replaced a link with the
confirm control DEC-5 required — and left Slice E's journey asserting both of the
old ones. `assistant/copy.ts` kept two declared, localized strings with no
consumer, which is UX-19's defect reintroduced three slices after UX-19 was
raised. G4 and G5 each ran only their own online specs, so two closeouts were
signed with that red in the tree. The finding is not about a string; it is about
a per-slice gate that can prove a slice and cannot prove a product.

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
| **Final aggregate** | all 11 authenticated suites, serialized — **114 passed, 0 failed, 2 skipped** (see §4.1) |
| **Accessibility** | Chromium AX tree over CDP, Playwright accname, and `dom-accessibility-api`, all three recorded in the Slice H ledger section |
| **UX-33** | `ux-evidence/slice-h/date-placeholder__browser-{en-US,pt-BR,de-DE}.png` |
| **Prior slices** | `ux-evidence/{baseline,slice-a,slice-b,slice-c,slice-d1,slice-g3,slice-g4}/` |

All captured content is synthetic. No real account identity, credential, or
owner data appears in any evidence file, report or PR — asserted mechanically
rather than by inspection: the route sweep scans the rendered text of every
captured page for email patterns, UUIDs and the harness's own fixture markers,
and fails if any appears. `account-identity.ts` is explicit that the account
surface renders a display name and **never** an email or a user id; that
assertion is what holds it to it, on all 168 loads.

### 4.1 The final aggregate — 114 passed, 0 failed, 2 skipped

The first aggregate of every authenticated suite reported **92 passed, 7
failed**, and that number is not the closeout's result. Four of those failures
were a real defect (UX-35), now fixed. The other three were the hosted Supabase
project answering `?error=invalid-credentials` for accounts the same run had
minted seconds earlier — auth rate-limiting under ~50 sign-ins in three minutes.

**The rate limit was removed rather than excused.** Running the aggregate
serialized (`--workers=1`) spreads the sign-ins far enough apart to stay under
the provider's limit, and the whole set then passes:

| | |
| --- | --- |
| Suites | 11 (all authenticated journeys, including both Slice H additions) |
| Tests | 116 |
| **Passed** | **114** |
| **Failed** | **0** |
| Skipped | 2 — one declared external limitation, one by design |
| Wall clock | 17.1 min, serialized |

**Zero failures are causally related to anything, because there are zero
failures.** No case was excluded, no assertion was weakened, and no
authentication behaviour was relaxed to obtain green — the excluded-case
machinery drafted for this closeout was **deleted unused**, because its
precondition ("the hosted provider prevents one combined all-green run") turned
out to be false, and shipping a declared mechanism with no consumer is the exact
defect UX-19 and UX-35 record.

**The two skips, classified.** Both are the same test — *"creates an account
through the validated signup journey"* — once per project:

| Project | Condition | Why it is deterministic |
| --- | --- | --- |
| `desktop` | `ONLINE_AUTH_TEST_EMAIL_DOMAIN` is unset | A **configuration** predicate evaluated before the test runs, declared at `online-auth.spec.ts:118` with its reason. It cannot be reached by a failing product path: provider signup email delivery needs a routable domain the repository deliberately does not carry. |
| `mobile` | `testInfo.project.name === "mobile"` | A **design** predicate declared at `online-auth.spec.ts:112`: provider email delivery is exercised once, and mobile form access is covered by the navigation suite. |

Both predates Slice H, both are visible in the spec rather than inferred from a
result, and neither can mask a regression: a skip that depends on configuration
or project name can never be produced by broken product code. That is what makes
the classification trustworthy — it is read from the harness, not interpreted
from a failure.

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
- **Zero residue — measured after every journey had finished, not during.** The
  first census ran while the route sweep was still in flight and reported one
  surviving fixture account; that was the sweep's own live account, and re-running
  the census once nothing was in flight returned zero. Recorded because a census
  that races the thing it measures is worth less than one that admits it did:

  | Measure | Result |
  | --- | --- |
  | Surviving fixture accounts (14 harness prefixes, all auth pages) | **0** |
  | `reminders` at `status = 'snoozed'` | **0** |
  | `reminders` with non-null `snoozed_until` | **0** |
  | Fixture-shaped `entries` | **0** |
  | Fixture-shaped `tasks` | **0** |
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
- **Run every authenticated suite together, on a schedule (D-3)** — process, not
  product. UX-35's cost was two closeouts signed over a red journey nobody had
  run. See below.

### D-3 — the gate that would have caught UX-35

Every slice from B onward ran **its own** online spec and reported it green. None
ran the others. A per-slice gate proves a slice; it cannot notice when a slice
correctly improves a surface that a *different* slice's journey still asserts —
which is exactly what G3 did to Slice E's composer journey, and what stayed
unnoticed through G4's and G5's closeouts.

The whole authenticated set is 106 tests and runs in about 3½ minutes. It cannot
be a per-PR gate on the shared project — this run produced three sign-in failures
from Supabase auth rate-limiting under its own load, which is a property of the
project rather than of the code. It should be a **scheduled or pre-merge-queue
run**, with its results read rather than re-run until green.

**Cost of not having it:** UX-35 was live for three slices. **Cost of having it:**
one serialized ~17-minute run. Serialization is the whole mitigation — the
parallel run trips the provider's auth rate limit and the serialized one does
not, which is why this is a scheduled instrument rather than a per-PR gate, and
why it needs no exclusion rule to be read as green.

### What Phase 2G should not inherit

Nothing from this initiative is blocked, ambiguous or half-finished. The four
RETAINED limitations are decisions with evidence, not deferrals; the one
DEFERRED item has a named destination, an exact count and a file list. Phase 2G
starts from a clean ledger.

---

## 9. Statement of adjudication (pre-merge)

Everything here is settled and does not depend on integration.

- Every one of the **35** findings has exactly one final disposition:
  **30 RESOLVED · 4 RETAINED with evidence · 1 DEFERRED · 0 BLOCKED.**
- **All 8 P0 findings are RESOLVED.**
- **0** findings are OPEN, PARTIAL, ambiguous, duplicated, or contradictory
  between summary and detail.
- Migration parity is **202607310064** on both sides and **unchanged by Slice H**.
- Grants and RLS are unchanged; `authenticated` still holds only `SELECT` and
  `INSERT` on `public.reminders` — verified behaviourally, §5.
- **Zero fixture accounts and zero fixture-shaped rows** remain.
- **Phase 2G has not started and is not authorized by this report.** The scope
  in §8 is a recommendation awaiting the owner's decision.

---

## 10. Statement of completion

**The Product UX/UI Remediation Loop is COMPLETE**, integrated on 2026-07-31.

| | |
| --- | --- |
| Slice H PR | **#50** |
| PR-head CI run | **30648536108** at `07ba74e` — all three jobs green |
| Merge strategy | merge commit; nine thematic commits and the branch preserved |
| **Merge SHA** | **`864d39ce347059ae1c7ba6909e0db437a14998b2`** |
| **Merge-SHA CI run** | **30648854282 — all three jobs green** |
| `application` (lint, types, unit, build) | ✅ 3m05s |
| `database and journey` (migrations, pgTAP, db lint, foundation e2e) | ✅ 3m53s |
| `edge worker` (deno types, deno tests) | ✅ 14s |
| **Final `main` HEAD** | **`864d39c`** |
| Branch preserved at | `origin/codex/ux-slice-h-closeout` → `07ba74e` |
| Working tree | clean |
| Parity after merge | **`202607310064`** — local, remote and applied-at identical, no drift |
| Fixture residue after merge | **zero** — 0 accounts, 0 `snoozed`, 0 non-null `snoozed_until`, 0 fixture rows |
| Changed files | 37 non-evidence + 67 evidence = **104** |
| Migration / SQL / RPC / grant changes | **none** |

**Final dispositions — 35 findings:**

| Disposition | Count |
| --- | --- |
| RESOLVED | **30** |
| RETAINED with evidence | **4** |
| DEFERRED to a named destination | **1** |
| BLOCKED | **0** |
| OPEN / PARTIAL | **0** |

**All 8 P0 findings are RESOLVED.**

**Phase 2G remains recommended and is not authorized or started.** §8 ranks it
with the evidence for each item; nothing there has begun. Three items are named
as repository maintenance rather than product scope: the UX-22 localization
sweep, the `.gitattributes` CRLF fix, and a scheduled whole-authenticated-set
journey run.
