# Post-2H — Legal review packet (`RG-LEG-4`)

**Date:** 2026-08-07 · **Track:** A6 · **Not part of Phase 2H.**

> **No professional legal review is manufactured here, and none is implied.**
> This is the packet a reviewer needs and an internal-consistency audit of the
> machinery around the documents. `RG-LEG-4` remains owner- and
> professional-review controlled, and it reads `OWNER` until an attestation is
> recorded.

---

## 1. What `RG-LEG-4` actually requires

From `docs/reports/signup-hardening/SIGNUP_ROLLOUT_GATE_DEFINITION.md` §52:

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-LEG-4** | `[owner-signature]` professional legal review | recorded owner attestation; **SH-LEGAL-013 banner removed** | banner still present, **or** no attestation |

Two conditions, and the second is mechanical. The banner is real text on both
documents in both locales:

> *"This document is a draft and requires professional legal review before any
> commercial launch. It honestly describes what the system does today, but it is
> not legal advice."*

`src/features/legal/documents.ts` §47–53, asserted present by
`documents.test.ts` §56 (`SH-LEGAL-013: the professional-review banner is on
both, in both locales`).

**That test is doing exactly its job and will fail when the banner is removed.**
That is the design: removal is a named owner action, and a banner that could be
deleted quietly would not be a control. Removing it is a two-line change to
`documents.ts` plus updating that assertion, in the same commit as the recorded
attestation — **never before it.**

---

## 2. Internal consistency — audited, and it holds

The instruction was to ensure the Terms, the Privacy Policy and the
acceptance-version machinery are internally consistent. They are. Every check
below is mechanised and green (`npx vitest run src/features/legal/` — **4 files,
56 tests, all passing**).

| Property | Mechanism | State |
| --- | --- | --- |
| One version constant, read by rendering, acceptance and enforcement | `src/features/legal/versions.ts` | `terms: 2026-08-04`, `privacy: 2026-08-04` |
| TypeScript and SQL cannot disagree | `version-parity.test.ts` pins `POLICY_VERSIONS` ↔ `private.current_policy_version` (migration `202608040074`) **in both directions** | green |
| The client cannot name a version | `record_policy_acceptance` **takes no version argument** — who cannot name a version cannot name the wrong one | green |
| A stale version cannot be inserted through the open door | trigger `enforce_current_policy_version` on the direct PostgREST INSERT path | green |
| Acceptances are append-only | `policy_acceptances` has `select` and `insert` policies and **no** `update` or `delete` policy — the posture is the *absence* of a policy, not a revocation someone can undo | green |
| Both documents render from repository truth, both locales | `documents.test.ts`, gate `RG-LEG-1` | **PASS** |
| Retention copy is generated, not hand-written, and honesty-gated | `src/features/legal/retention.ts`, gate `RG-LEG-3` | **PASS** |
| Server-side versioned consent record exists | gate `RG-LEG-2` | **PASS** |
| A version bump is a migration **plus** the constant, same commit | ADR-079 | recorded |

**No inconsistency was found.** The one thing worth flagging to a reviewer is
not an inconsistency but a consequence: **bumping a version re-interposes
consent for every existing account on their next session.** That is deliberate
weight (ADR-079), and it means any change a reviewer requests to either document
is a legal event with a product cost, not a copy edit.

---

## 3. The one open substantive question, already routed

**Should the Privacy Policy's retention table enumerate `error_events` and
`rate_limit_events`?** (F-2H.5-5, low — carried in `docs/TODO.md`.)

The current position, for the reviewer to accept or reject:

- Both are **operational** per-user records at a 90-day window.
- Neither carries user content. `error_events` has literally nowhere to put a
  message — three text columns, each bound to a closed vocabulary by CHECK, and
  no `json`/`jsonb`/`bytea`/free-text column at all, asserted by a postcondition
  in the migration itself. `rate_limit_events` is owner, bucket, outcome, time.
- Both are handled by account deletion: `error_events` de-identified (append-only
  rows cannot cascade), `rate_limit_events` cascaded from `auth.users`.
- **So the Policy makes no false claim today.** Adding a class changes a
  published legal document and its version, forcing re-acceptance by every user
  — which is why Phase 2H routed it rather than deciding it.

**Recommendation: take it with the next version bump**, so one re-acceptance
event carries both this and whatever the review produces, rather than two.

---

## 4. What a reviewer needs, and where it is

| # | Item | Location |
| --- | --- | --- |
| 1 | Terms of Service, both locales | `/{pt-BR,en}/legal/terms` · source `src/features/legal/documents.ts` |
| 2 | Privacy Policy, both locales | `/{pt-BR,en}/legal/privacy` · same source |
| 3 | The retention schedule as **enforced**, not as claimed | `src/features/legal/retention.ts`; `sweepActive` distinguishes *declared* from *enforced* |
| 4 | **The enforcement gap, stated plainly** | **See §5. This is the item a reviewer must not miss.** |
| 5 | What data is collected and where it goes | `docs/SECURITY.md`, `docs/DATABASE.md` |
| 6 | Sub-processors | Supabase (database, auth, storage), Vercel (hosting), OpenAI **under BYOK — the user's own key, the user is the payer**, Cloudflare Turnstile (CAPTCHA), Resend (email, **not yet configured**) |
| 7 | Account deletion, end to end | `docs/reports/signup-hardening/SIGNUP_HARDENING_DELETION_EXECUTOR_STALL.md` §8b — terminal deletion proven on the hosted project |
| 8 | Consent mechanism and its version history | §2 above |
| 9 | Data export | `src/features/account/` — the PRD's §6.3 "exportação de dados" is **planned, not shipped**; a reviewer asking about portability must be told that |
| 10 | Backup posture (a retention claim depends on it) | `docs/reports/post-2h-rollout/POST_2H_BACKUP_READINESS.md` |
| 11 | Current rollout posture | signup **closed**; 3 accounts; **no public users have ever existed** |
| 12 | **Operational data classes Phase 2H introduced** | **§4.1 below** — new to this product, and a reviewer will not find them in an older data map |
| 13 | **BYOK — how AI credentials work** | **§4.2 below** — unusual enough that it changes the controller/processor analysis |

---

## 4.1 Operational data classes introduced by Phase 2H

New since any previous review. All four are **operational**, none holds user
content, and each is disclosed with its deletion behaviour because that is the
question a reviewer will ask.

| Class | What it holds | Contains user content? | On account deletion | Retention |
| --- | --- | --- | --- | --- |
| `error_events` | `surface`, `operation`, `reason` — **each bound to a closed vocabulary by CHECK** — plus a minted `correlation_id` | **No, and it has nowhere to put any.** No `json`, `jsonb`, `bytea` or free-text column exists; a postcondition in the migration asserts that against the catalog | **De-identified**, not deleted — the table is append-only by revoke *and* by a trigger that refuses even the table owner, so a row cannot cascade | 90 days declared · **sweep built, NOT scheduled** |
| `scheduled_job_health` | Job names, timestamps, counters | No. No person appears in it | n/a — not user-owned | 90 days declared · **built, NOT scheduled** |
| `rate_limit_events` | Owner, bucket, outcome, time. **No cost, price or token column** — asserted by a postcondition | No | **Cascades** from `auth.users` | 90 days declared · **built, NOT scheduled** |
| `account_deletion_attempts` | Attempt count, backoff, terminal `stalled` classification | No | Cascades when deletion completes | **No sweep, deliberately** — a *stalled* row must survive while the account does, because it is the only evidence the deletion stalled |

**The `correlation_id` is minted for the sink and does not derive from a session,
cookie or token** — so it cannot be joined back to a login.

**Open question already routed** (§3): whether the Privacy Policy's retention
table should enumerate `error_events` and `rate_limit_events`. The Policy makes
no false claim today; adding a class forces re-acceptance by every user.

## 4.2 BYOK — the reviewer needs this, because it changes the analysis

**The user supplies their own OpenAI API key. The user is the payer. This
product never holds a shared provider key for user work.**

| Property | Detail |
| --- | --- |
| Storage | The key is stored **encrypted at rest** as a credential envelope, wrapped under `BYOK_MASTER_KEY`, which lives in the runtime environment and **never in the database or this repository** |
| Reachability | `service_role` holds **no table DML** on `user_ai_credentials`; three narrow named functions are the only access, and `RG-EXP-3` verifies the closure by readback |
| Project key | **None exists on any deployed path.** ADR-072 removed it and `project-key-guard.test.ts` asserts no Node or Deno path can reach one |
| Who the provider sees | The **user's own account** with the provider. Billing, quota and the provider's own retention are between the user and the provider |
| Consequence for restore | A restored backup **without the original `BYOK_MASTER_KEY` recovers every envelope as unreadable ciphertext** — correct design, and a recovery dependency worth disclosing |
| Consequence for deletion | Deleting the account destroys the envelope. **It does not delete anything held by the provider**, which is outside this product's control and should be said plainly in the Policy |

**Why a reviewer must be told:** under BYOK the product is not the party
purchasing model inference on the user's behalf, and the provider relationship
is the user's own. That is a different controller/processor story from the usual
"we call OpenAI for you", and a Policy written for the usual story would
misdescribe it.

---

## 5. The material fact a reviewer must be told first

> **Eight destructive retention sweeps are built. Zero are scheduled. No purge
> has ever executed.**

Every retention window either document describes is **implemented and not
enforced.** The rows are still there.

This is not an oversight — ADR-082 holds that *scheduling IS authorization of
the first live purge*, so enabling a sweep is an owner act with an irreversible
consequence, and it has not been taken. But it means a Privacy Policy that says
"we delete X after 90 days" is, today, describing an intention rather than a
practice.

**The repository is honest about this internally** — `sweepActive` in
`retention.ts` carries the distinction, and `RG-LEG-3` gates on the copy being
generated from it rather than written by hand. **A reviewer still needs to be
told explicitly**, because it is the single most likely place for a published
document to overstate the system, and because the fix is an owner action
(`npm run ops:retention-schedule -- --enable`) that is itself the authorization
of a first irreversible deletion of user content.

The same section of `docs/TODO.md` records that enabling it requires reviewing
`npm run sh6:retention-dry-run` first. That ordering should not be broken to
satisfy a legal review.

---

## 6. Status

| Item | State |
| --- | --- |
| `RG-LEG-4` requirement inventoried | **done** |
| Terms / Privacy / acceptance machinery internally consistent | **audited — consistent**, 56 tests green |
| Legal review packet | **this document** |
| SH-LEGAL-013 banner | **present on both documents, both locales** — correctly |
| Recorded owner attestation | **absent** |
| Open substantive question | one, §3, routed to the next version bump |
| **`RG-LEG-4`** | **OWNER — unsigned. Nothing here signs it.** |

### Exact owner action

1. Engage a professional reviewer and give them §4, leading with §5.
2. Apply whatever changes come back — **as a version bump** (migration +
   `versions.ts`, same commit, ADR-079), folding in §3 while the re-acceptance
   event is already being spent.
3. Record the attestation — reviewer, date, scope, and what was reviewed.
4. **Only then** remove the SH-LEGAL-013 banner from `documents.ts` and update
   `documents.test.ts` §56, in the same commit as the attestation.
5. `npm run rollout:verify` → `RG-LEG-4` moves off `OWNER`.
