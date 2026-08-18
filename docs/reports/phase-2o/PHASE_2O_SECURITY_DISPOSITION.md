# Phase 2O — security disposition

**`2O-SEC-001` … `2O-SEC-005`.** The threat model in
`PHASE_2O_THREAT_MODEL.md` executed against the tree the phase leaves — `main`
at `8859e40` — with every threat **closed, mitigated with evidence, or carried
with a named destination**. There is no fourth outcome and nothing is left
unstated.

**The single fact that decides most of this document: Phase 2O created zero
migrations.** No new table, no new column, no new grant, no new
`SECURITY DEFINER` function, no new RLS policy, no vocabulary widening, no
schedule. Several threats below are therefore not *mitigated* so much as
**never given an opportunity**, and each says which it is — because "we were
careful" and "there was nothing to be careless with" are different claims and
only one of them survives a later reader.

---

## 1. `2O-SEC-001` — every new read is RLS-scoped

Phase 2O added reading surfaces across nine slices — the activation summary, the
onboarding path, the preferences centre, the AI configuration and cost panels,
the privacy census and export, the consent record, the notification centre and
the relations surfaces it inherited.

**Every one of them reads through the request-scoped Supabase client obtained
from `requireUser`**, which carries the caller's JWT and is therefore subject to
RLS on every statement. No surface this phase added constructs a service-role
client, and none reaches a table through a definer function created for it.

The proof that matters is the negative one, and it is checkable: **`grep` for
`service_role` across `src/features/privacy/` and `src/features/deletion/`
returns exactly one hit, and it is a comment** in `enumeration.ts` describing
what a database function raises — *"It raises `42501` unless
`auth.role() = 'service_role'`"*. **A comment naming the role is not a call
using it**, and this distinction is the one slice 2O.5 recorded as a rule: an
authority guard must forbid the act, not the word.

**Foreign-row proof** is inherited rather than re-run: the RLS boundary is proved
in pgTAP against rows belonging to a second user, in the CI database job, on
every push. Phase 2O added no table for that suite to be missing.

---

## 2. `2O-SEC-002` — no new authority for `authenticated`, no unsigned definer

**Zero migrations means zero grants.** `authenticated` holds exactly what it held
at `202608160097`, and the full grant matrix is censused in CI (`RG-EXP-1`,
passing).

**No `SECURITY DEFINER` function was created.** The tree carries 39 across its
whole history; **none is attributable to this phase**. ADR-118 Decision 7 makes an
unsigned definer a stop condition, and the condition never came near firing
because the export was built on the caller's own client.

---

## 3. `2O-SEC-003` — the export does not cross a tenant boundary

The export is the phase's highest-risk surface: it reads broadly by design, and
the tables it touches include the **polymorphic** relations whose ownership is
validated by trigger rather than by a composite foreign key — `entry_entities`,
`entity_attachments`, `entity_tags`.

**It runs entirely on the caller's request-scoped client.** Every read is
RLS-filtered by the same rules that govern the pages, and the polymorphic tables
are reached through the same path. A row belonging to another user is not
excluded by the export's own logic — it is **unreachable to the statement**,
which is the stronger property and the one that does not break when the export's
logic is next edited.

**Carried, and named:** `entity_attachments` **has a reader and still has no
writer**. The table is empty because nothing in the product can fill it. That is
a completeness observation about the export, not a boundary failure — the export
is complete over a table with no rows — and it is carried to the backlog rather
than resolved here.

---

## 4. `2O-SEC-004` — auditable automatic actions, and tested undo

**Phase 2O added no automatic action.** Every state change it introduced is a
user act on a surface: confirming a step, changing a preference, dismissing the
path, restoring it, exporting, revoking consent, signing out everywhere.

Two are worth naming because they are the closest thing to automatic:

- **The onboarding dismissal** is a cookie set and deleted through two gated
  Server Actions. It is **reversible**, the reversal renders only when there is
  something to reverse, and it was proved across a reload. It writes no domain
  row — 97 migrations unchanged, no onboarding column in the generated types.
- **`signOutEverywhere`** is irreversible in the sense that matters and is
  therefore a deliberate act behind a confirmation. It goes through
  `requireUser`, calls `supabase.auth.signOut({ scope: "global" })` on the
  caller's **own** session, and cannot be aimed at another account. An
  already-missing session is treated as the desired end state; **every other
  provider error is surfaced**, because a sign-out that silently did nothing
  while reporting success is the worse failure.

---

## 5. `2O-SEC-005` — the threat model, executed

Sixteen threats. Each disposed with what was checked, not with an assurance.

| # | Threat | Disposition | Evidence |
|---|---|---|---|
| **T-1** | The export crosses a tenant boundary | **mitigated** | Caller's request-scoped client throughout; foreign rows are unreachable to the statement rather than filtered by the export. See §3. |
| **T-2** | The export is incomplete and is presented as complete | **mitigated, with one carried observation** | The census enumerates every owned table and the export covers it. Carried: `entity_attachments` has no writer, so it is complete over an empty table. → **backlog** |
| **T-3** | A definer function created for the export becomes general-purpose authority | **never given an opportunity** | Zero migrations; no definer created. The export needed none because it runs as the caller. |
| **T-4** | The "what is stored about me" surface leaks what it counts | **mitigated** | Counts come from RLS-scoped reads on the caller's client; the one `service_role` string in `privacy/` is a comment, not a call. |
| **T-5** | The public entry page becomes an oracle about accounts | **mitigated** | Slice 2O.1: no register form, no `<form>`, no `<input>`; the denial is structural rather than textual, and uniform-outcome refusals are gated (`RG-SIG-7`). |
| **T-6** | The onboarding path reveals state before authentication completes | **mitigated** | The path renders only inside `/app`, behind `requireUser`; it stores no progress and derives every step from the account's own rows. |
| **T-7** | A global sign-out is triggered by something other than the user | **mitigated** | `signOutEverywhere` runs behind `requireUser` on the caller's own session, from a confirmed control. It cannot be aimed. See §4. |
| **T-8** | Telemetry carries content | **not realized** | **No event was declared.** No key was added that could hold an entry, title, name, note, filename or user-chosen date. See the M1 verdict. |
| **T-9** | The vocabulary is widened in one place and refused in another | **not realized, and verified anyway** | No widening. Read live: the hosted check constraint carries **39** literals, the TypeScript contract declares **39**, and the sorted lists are **identical**. |
| **T-10** | A preference control is shipped for something that does nothing | **mitigated** | `R-2O-12`: `consumerEvidence` is derived from the tree, so a control with no consumer fails the build and a consumer with no row fails it too. |
| **T-11** | The consolidation orphans sign-out | **mitigated** | `AccountMenu` mounts in two places and the account controls are reachable from both; slice 2O.7's predicate walks the mount tree transitively and classifies every operable element into a closed taxonomy. |
| **T-12** | A retention sweep is armed by a migration | **never given an opportunity** | Zero migrations. **No retention sweep is scheduled by this phase**, and `RG-QUO-3` stays `FAIL` in consequence. Scheduling is authorization. |
| **T-13** | A moved permission prompt harvests consent for a broken channel | **mitigated, with a live residual beneath it** | Consent, permission and delivery are three separate facts and are never collapsed (`2O-NOTIFY-007`); no surface claims delivery, and the HTTP 403 is stated in both locales. The **channel is still broken** — see §6. |
| **T-14** | A guard passes over a page that never rendered | **mitigated, and this is the phase's strongest new control** | Slice 2O.7 added two Playwright lanes driving the **production build over real routes** — nine public surfaces in CI on every push, ten authenticated against the hosted project — with **no `STYLESHEETS` array to go stale**. Both wait on `document.getAnimations()` rather than on a clock. |
| **T-15** | The phase starts the successor | **closed** | No `2P-*` requirement, no `PHASE_2P_*` artifact, no accepted ADR naming the successor in its heading, no source or migration marked as successor implementation. A13 returns an empty signal list and **was not retargeted by this closeout**. |
| **T-16** | The stored appearance value is attacker-controlled input | **mitigated** | The stored value is parsed through `parseAppearanceChoice` before it reaches an attribute; an unrecognised value resolves to the default rather than being echoed. |

---

## 6. Live risks, accepted risks, and inherited residuals

**Stated plainly. None of these is closed by this phase and none is softened.**

### Live

- **Push fails with HTTP 403 on a real iPhone.** Implemented, hosted, and
  **failing**. The surfaces say so in both locales and no surface claims
  delivery. → **owner**; the investigation is a declined residual and ADR-118
  Decision 7 forbids resuming it here.
- **Push has never been executed on Android.** Not "failed" — **never run**. The
  absence of a result is not a result. → **owner**.
- **`RG-QUO-3` fails: retention sweeps are built and dry-run, and not
  scheduled.** No window is enforced. → **operator**, via an operator script,
  never a migration.
- **Production SMTP is not configured** (`RG-DEP-1`). → **operator**.
- **No restore drill has been performed** (`RG-DEP-3`). → **operator**, and it
  **cannot be closed by writing a file**.

### Accepted, with a signature outstanding

- **`RG-LEG-4`** — professional legal review. → **owner signature**.
- **`RG-DEP-4`** — monitoring adequacy. → **owner signature**.

### Not executed, and not inferable

- **The screen-reader session is `NOT EXECUTED`.** A twenty-minute VoiceOver
  script ships at `PHASE_2O_SCREEN_READER_SCRIPT.md` with the device table to
  fill in. **ADR-118 Decision 8 forbids promoting it to a pass by documentation,
  by an emulator, by an automated scan, or by inference from one** — and slice
  2O.7's nineteen-surface axe coverage is exactly such an inference. → **owner**.

### Inherited and unabsorbed

- **ADR-055** is neither satisfied nor superseded and **expires 2026-10-27**.
- Every Phase 2N residual `OD-2O-11` declined stays unclaimed:
  `2N-RELATION-TRIGGER`, `2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER`,
  `2N-MOBILE`, `2N-PRIVACY-FREETEXT`, `2N-RELATION-END-ANNOUNCEMENT`.
- **Forty-nine elements no stylesheet reaches**, eight of them slice 2O.5's
  privacy block. Recorded as a ratchet with a planted control, **not restyled**.
  On the rendered page they pass contrast, reflow and target size. → **a future
  design-system unit**.
- **Four touch-target exceptions on surfaces this phase did not create** —
  `legal/*`'s two links at 18px, the shell's `skip-link` at 39px and
  `palette-trigger` at 38px — each with a liveness check that fails when the
  finding stops reproducing. → **owner**.
- **`defaultAgentPreferences.tone`** still says `direct` against a column
  defaulting to `informal`.
- **`2O-ONBOARD-003`** stays `partial`; its remainder is that the path never
  asks for locale and timezone, because both columns are `not null` with
  defaults and `handle_new_user` creates the row.

### Outside the phase entirely

- **Branch `codex/fix-needs-attention-confirmation` and migration
  `202608170098_confirm_entry_interpretation.sql` belong to other work.** They
  are **not** incorporated, applied, merged, rebased or counted toward Phase 2O.
  At the time of this disposition the branch is unmerged, the migration is
  absent from both the local chain and the hosted project, and hosted parity
  stands at `202608160097`. **If that work lands later, its delta and its parity
  are re-audited by whoever lands it — and none of it is Phase 2O's delivery.**
