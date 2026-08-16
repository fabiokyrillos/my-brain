# Phase 2O — Slice 2O.5 acceptance record

**Privacy, consent, and control of the data** — `2O-PRIVACY-001` … `-010`,
`2O-CONSENT-001` … `-005` (15 requirements).

**Authorization:** ADR-118 Decision 1, plus **one owner decision taken for this
slice specifically**, recorded in §1 below. **Migrations created: zero.** 94
local = 94 hosted, parity `202608140094`. Signup closed. Rollout gate
**25 pass · 3 fail · 2 owner-signature**, re-read by running
`npm run rollout:verify` at this baseline. M2 unspent and unallocated. A13 not
retargeted. `embedding_model` untouched. CSP unchanged.

**Baseline proved, not presumed:** `main` = `origin/main` = **`0f6a9b4`**,
worktree clean, **no open PR**, CI green on all three job families at both
`f69d4fc` and `0f6a9b4`, **94 local = 94 hosted** read live by
`supabase migration list --linked` with **zero rows mismatched**.

**Outcome: 14 `built` · 1 `partial` · 0 `undelivered`. 72 of 116 delivered.**
`2O-PREF-002`'s recorded remainder **closes** with this slice.

---

## 1. The stop condition that did not fire, and why it did not

`2O-PRIVACY-002` requires the *"what is stored about me"* surface to derive its
categories **from the same enumeration the deletion path uses**. §82's re-audit
called this a **probable stop condition**, and re-running it against this `main`
confirmed the finding and made it stronger.

### The enumeration is unreachable from an authenticated path three times over

`public.account_owned_row_counts` is:

1. **`service_role`-only by its own body** — it raises `42501` unless
   `coalesce(auth.role(), '') = 'service_role'`;
2. **revoked from every client role**, and — this is the half §82 did not
   record — `202608040072` carries a **postcondition** that raises
   *"a deletion-executor function is reachable by a client role"* if the grant
   is ever restored. Granting it would fail the **database CI job**, not merely
   a policy review. The prohibition is enforced by the migration chain itself;
3. **named verbatim by ADR-118 Decision 9** — *"a service-role read on an
   authenticated path"* — as a stop condition.

It also enumerates **dynamically**, from `information_schema`, so there is no
static list to import even if the authority question were resolved.

### The owner's decision, and the verification that it holds

The owner authorized exactly one interpretation: **count under the requesting
user's own identity and the existing RLS**; present an **explicit, safe
projection** of the same conceptual coverage; and prove the projection against
the real enumeration with an **executable guard** that fails when a new
user-owned table appears unmapped.

That was verified **before any code was written**, by resolving the migration
chain — including the four `do`-block loops that a text scan cannot see, the
trap `census-must-resolve-do-block-policies` records:

| | Count | |
|---|---|---|
| Tables in the deletion enumeration (`public` base tables with `user_id`) | **50** | |
| Readable by their owner under an owner-scoped `select` policy | **47** | 16 by explicit grant, 31 by the `do`-block loops in `202607160003`/`006`/`007`/`009` |
| Not readable by `authenticated` | **3** | `account_deletion_attempts`, `error_events`, `rate_limit_events` |

The three unreadable tables were each **revoked deliberately** by an earlier
hardening phase (2H). They are **abuse-prevention counters and the operator
error sink** — none is content the account authored, and an account that can
read its own throttle counters can measure the ceiling it is held to. They are
recorded in `WITHHELD_TABLES` with the migration that revoked each, **shown on
the surface with the reason**, and the guard verifies the cited migration really
contains the revocation. An exclusion nobody can see is indistinguishable from
an omission.

**So the resolution needs no migration, no RPC, no grant, no service-role client
and no `SECURITY DEFINER` function — and it does not weaken the requirement**,
because the property `2O-PRIVACY-002` asks for (*"the two cannot disagree about
what a user owns"*) is now enforced by a build-failing guard rather than by a
shared function call that the authority boundary forbids.

### It is proved by execution, not by argument

`e2e/online-privacy-and-consent.spec.ts` asserts, against the **hosted project**
with a **real account** on the **production build**, that **zero categories
render *"não foi possível ler"***. If any one of the forty-seven tables were
unreadable by its owner, that assertion fails. It passed on **desktop and
mobile**.

---

## 2. Requirements

| Requirement | Outcome | Evidence |
|---|---|---|
| `2O-PRIVACY-001` — one surface, by category, with a count and a link | **partial** | `privacy-section.tsx`; 11 of 12 categories link to the surface that shows them. See §4. |
| `2O-PRIVACY-002` — categories derived from the deletion enumeration | **built** | `enumeration.ts`; `privacy-enumeration-guard.test.ts` (21 assertions, both directions, two planted controls); `phase_2o_privacy_enumeration.sql` |
| `2O-PRIVACY-003` — counts respect the sensitivity contract | **built** | `census.ts` reads `head: true`, so no row body crosses the wire; the guard asserts the query shape rather than the markup |
| `2O-PRIVACY-004` — complete over the enumeration or it refuses | **built** | `export.ts`; `export.test.ts` proves one refused table refuses the whole export, that pagination is real, and that the ceiling refuses rather than truncates |
| `2O-PRIVACY-005` — no other user's data, under the requester's authority | **built** | every read is `.eq("user_id", …)` on the request-scoped `authenticated` client; `export.test.ts` asserts the scoping of every call; `phase_2o_privacy_enumeration.sql` §4 proves it against **foreign rows that exist** |
| `2O-PRIVACY-006` — states its own scope and generation time; auditable | **built** | the archive header names coverage, per-table withheld columns and withheld tables; `audit_logs` row on both success **and refusal** |
| `2O-PRIVACY-007` — retention posture reachable, generated, honesty-gated | **built** | `retention.ts` gains its **first consumer**; every line via `retentionLine`; `hasUnenforcedWindow()` rendered. **No sweep scheduled.** |
| `2O-PRIVACY-008` — deletion reachable with every property intact | **built** | a link to `/{locale}/account/delete`; the deletion path is **not touched** |
| `2O-PRIVACY-009` — signed-in indicator and a global sign-out | **built** | `session-identity.ts`, `global-sign-out.tsx`, `signOut({ scope: "global" })`. **No device list** (`OD-2O-5` **A**) |
| `2O-PRIVACY-010` — no inferred preference; no absent classification → `normal` | **built** | `census.test.ts` asserts a refused read is `unreadable` and never `0`, in both directions, plus a zero-is-a-real-answer control |
| `2O-CONSENT-001` — which documents, at which version, and when | **built** | `consent-record.ts`, `consent-section.tsx`; read off the wire in both locales |
| `2O-CONSENT-002` — reads `policy_acceptances` and the version contract | **built** | the current version comes from `POLICY_VERSIONS`, already pinned to `private.current_policy_version` by `version-parity.test.ts`; **no third copy** |
| `2O-CONSENT-003` — the text reachable in one step, both locales | **built** | `legalDocumentPath`; asserted in `pt-BR` and `en` |
| `2O-CONSENT-004` — optional consent presented as revocable | **built** | `consent-revocation.tsx` gives `revokePushConsent` its **first consumer**; renders a sentence, not a dead control, when there is nothing to revoke |
| `2O-CONSENT-005` — nothing implied, pre-ticked or bundled | **built** | the surface records and never collects; there is no checkbox on it |

### `2O-SEC`, discharged for this slice's surfaces

- **`2O-SEC-001`** — every new read is RLS-scoped and proved against a foreign
  row that exists (`phase_2o_privacy_enumeration.sql` §4, with a `postgres`
  control proving owner B's rows are really there).
- **`2O-SEC-002`** — **no new authority**. The guard asserts that no module in
  `src/features/privacy/` reaches `service_role`, a service client,
  `rpc("account_owned_row_counts"`, a job insert, or storage. The pgTAP suite
  asserts no `SECURITY DEFINER` function was created.
- **`2O-SEC-003`** — the export's tenant safety, including the four polymorphic
  relation tables whose ownership is trigger-validated on write: for a **read**,
  the `select` policy filters on the row's own `user_id`, so a foreign row
  cannot enter the result set. Asserted in SQL against a populated foreign
  tenant.
- **`2O-SEC-004`** — the export request is audited on success **and on
  refusal**, with actor, reason, target and resulting state.

### Threats

**T-1** closed — isolation proved against foreign rows that exist, not an empty
table. **T-2** closed — completeness derived from the shared enumeration, with a
build-failing guard for a table added later. **T-3** closed — **no definer
function created**, asserted in pgTAP. **T-4** closed — counts only, enforced in
the query rather than the markup.

---

## 3. Five guards fired. None was weakened

**1. A `"use server"` module may export only async functions.** `ExportState`,
`idleExportState` and their sign-out counterparts were exported from
`actions.ts`. Every export of such a module becomes a server-action reference,
so a plain `const` there is **a build error** — and `tsc` cannot see it, because
TypeScript has no opinion about what a directive means. `reminders/actions.test.ts`
holds the rule repository-wide and caught it. The states moved to `contracts.ts`.

**2. The acceptance date was formatted with no `timeZone`.**
`local-day-correction-guard.test.ts` caught `consent-section.tsx` using
`Intl.DateTimeFormat` without one, which resolves to the **rendering server's**
zone. A consent recorded at 22:00 in São Paulo would have displayed as the
**next day** — a wrong date on a legal record, produced by an omission nobody
would notice. The owner's zone is passed in, from the accessor the Local Day
Correction established.

**3. `entity_aliases`' single-reader guard matched a table *name*.**
`phase-2n-foundations-guard.test.ts` asserts exactly one module in `src` may
touch `entity_aliases`, expressed as *any mention of the name* — exact while
nothing else in the tree could mention it. `enumeration.ts` names it in a **list
of table names**, because `2O-PRIVACY-002` requires the projection to cover every
table the deletion enumeration reaches, and that file performs no data access at
all. **The allowlist was refused**: adding a file to an exemption list grants
that file a permission in order to make a test pass, and exempts it from the
real rule forever — the move §82 records refusing for `BYOK-GUARD-005`. The
predicate was **narrowed** to the access shape `from("entity_aliases")`, with a
control asserting the reader still matches, a planted second reader still
matches, and a table-name list does not.

**4. The audit-writer inventory grew by one module.** `audit-log-writers.test.ts`
bounds *which modules* may insert into `audit_logs` — *"adding a sixth module is
the exposure surface growing"*. `2O-PRIVACY-006` and `2O-SEC-004` require the
export request to be auditable, and the three alternatives were each worse: not
auditing fails both requirements; routing through an already-listed module
couples privacy to entities to keep a list short; an RPC would be a new
`SECURITY DEFINER` function, forbidden for the whole phase. **This is not new
authority** — `authenticated` has held INSERT on `audit_logs` since ADR-081 chose
to retain it, and this test inventories *usage*.

**5. The new guard failed against its own documentation, then against a scope
declaration — and the second failure was the useful one.** The authority scan
forbade the string `account_owned_row_counts` anywhere in the privacy modules,
and those modules **document at length why they cannot call it** — the most
useful thing in the file for the next reader. Comments are now stripped, with a
control proving a real call survives stripping. It then failed a second time on
`export.ts`, which **names the function in the archive's own scope
declaration**, because `2O-PRIVACY-006` requires the archive to state what it
covers and *"the predicate `public.account_owned_row_counts` uses"* is the truest
way to say it. **Failing on the name would have been answered by making the
archive vaguer about its own scope** — trading a real property for a passing
test. The predicate was narrowed to the **call**, `rpc("account_owned_row_counts"`,
which is the only shape that performs the forbidden read, with a control that
plants exactly that call.

**The pattern across all five: a guard that fails on correct code gets weakened.
Each was narrowed to what it actually protects, in the same change, with a
two-sided control — never allowlisted and never deleted.**

---

## 4. What is carried, with destinations

- **`2O-PRIVACY-001` closes `partial`.** Eleven of twelve categories link to the
  surface that shows them. **`product_events` has no rendering surface in the
  product**, and the category says so — *"sem página própria; aparece na
  exportação"* — rather than linking to a page that does not show it. Inventing
  a page would be this slice widening itself on a finding; a false link would be
  the claim the requirement exists to prevent. **Remainder:** one category has no
  rendering surface. **Destination: owner** — it is one page, or a decision that
  the export is a sufficient view.

- **`2O-ACTIVATION-005` direction B has a blind spot, found by this slice.**
  `renderedControlNames` extracts controls by `name="…"` attributes, so the
  three controls added here — export, global sign-out, revoke notifications —
  are **action buttons with no `name` and are invisible to it**. Adding a `name`
  purely so the guard could see it was **refused**: that is shaping product code
  to a test. The three controls are not preferences and govern no column, so no
  registry row was invented for them either. **Destination: slice 2O.7 or the
  closeout** — the guard's predicate, not this slice's components.

- **`2O-PREF-002`'s remainder closes.** Ajustes now reaches the account's own
  acceptance history and not only the legal documents, which is the condition the
  owner set for closing it honestly.

- **`2O-ONBOARD-003`** stays `partial` and outside this slice, unchanged.
- **`embedding_model`** untouched (ADR-117 Decision 4).
- **`viewport.themeColor`** still declared under `prefers-color-scheme` media
  only → slice 2O.7.
- **`defaultAgentPreferences.tone`** still says `direct` while the column
  defaults to `informal`, and nothing reads the field.
- Every Phase 2N residual `OD-2O-11` declined stays unclaimed; push still
  failing with HTTP 403 on a real iPhone and **never executed on Android**;
  ADR-055 neither satisfied nor superseded, expiring **2026-10-27**.
- **No retention sweep is scheduled** (`R-2O-22`).

---

## 5. Evidence

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run build` | passes |
| `npx vitest run` | **8058 passed**; 3 failed *files* are the known Windows shebang-parse baseline, green in CI |
| `e2e/online-privacy-and-consent.spec.ts` | **6/6 desktop, 6/6 mobile** — production build, hosted project, disposable account removed in `afterAll` |
| CI Playwright command (5 specs × 2 projects) | **287 passed** |
| `npm run rollout:verify` | **25 pass · 3 fail · 2 owner-signature** — unchanged |
| `supabase migration list --linked` | 94 = 94, zero mismatched, parity `202608140094` |
