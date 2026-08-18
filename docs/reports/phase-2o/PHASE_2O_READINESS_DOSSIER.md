# Phase 2O — readiness dossier

**`2O-READY-001` … `2O-READY-005`.** What is satisfied, what is not, and who
must act — per rollout gate, from the gate's **own output** rather than from
memory.

**This phase does not open signup.** It did not alter the rollout gate, did not
touch `config.toml`, did not modify a secret, and closed no gate by writing a
file. A phase being complete is not a product being authorized to open, and this
document exists so the two can never be read as the same sentence.

---

## 1. The gate, as it actually answered

Run on 2026-08-18 against `main` at `8859e40`, by `npm run rollout:verify`.
**The output below is the script's, transcribed whole rather than summarised** —
`2O-READY-002` requires the dossier to read the real output, and a summary is
where a failing gate becomes a passing one.

```
signup rollout gate — full

  PASS  RG-BYOK-1  BYOK closeout traceability matrix present
  PASS  RG-BYOK-2  the ADR-072 project-key guard is present and runs in CI
  PASS  RG-DEL-1   deployed deletion acceptance transcript present
  PASS  RG-DEL-2   cascade drill in the CI database job
  PASS  RG-DEL-3   storage-orphan scanner present
  PASS  RG-DEL-4   the 2026-07-16 orphan manifest is recorded
  PASS  RG-SUS-1   administrative suspension boundary proven in pgTAP
  PASS  RG-SUS-2   worker lifecycle gate present
  PASS  RG-LEG-1   both policies render from repository truth in both locales
  PASS  RG-LEG-2   server-side versioned consent record exists
  PASS  RG-LEG-3   retention copy is generated and honesty-gated
  OWNER RG-LEG-4   professional legal review is an owner signature
  PASS  RG-SIG-1   hosted mailer_autoconfirm is false (email confirmation required)
  PASS  RG-SIG-2   hosted CAPTCHA enabled and provider-enforced
  PASS  RG-SIG-3   database-locked signup/recovery throttle present
  PASS  RG-SIG-4   hosted redirect allow list is non-empty and readable
  PASS  RG-SIG-5   origin comes from configuration, not a request header
  PASS  RG-SIG-6   hosted password policy at or above the approved minimum
  PASS  RG-SIG-7   uniform-outcome auth refusals implemented
  PASS  RG-QUO-1   per-user quota mechanism present in the chain
  PASS  RG-QUO-2   Edge request body bound present
  FAIL  RG-QUO-3   sweeps built and dry-run recorded, but NOT SCHEDULED — no window is enforced (ADR-082)
  PASS  RG-EXP-1   full grant matrix censused in CI
  PASS  RG-EXP-2   Edge Function surface reviewed and dispositioned
  PASS  RG-EXP-3   service_role holds no DML on the credential tables (readback)
  PASS  RG-EXP-4   proxy refuses app routes in production when unconfigured
  FAIL  RG-DEP-1   production SMTP configured (readback)
  PASS  RG-DEP-2   production domain and CSP verification recorded
  FAIL  RG-DEP-3   backup restored to a disposable project and recorded
  OWNER RG-DEP-4   monitoring adequacy is an owner signature

25 pass, 3 fail, 2 owner-signature

SIGNUP MUST NOT OPEN. A failed or unsigned gate is a closed door, and
this script has no path that reports otherwise.
```

**25 pass · 3 fail · 2 owner-signature — unchanged by this phase**, and
unchanged since the Signup Hardening closeout that set it.

---

## 2. The five that are not satisfied, and who must act

`2O-READY-004` names these five specifically. Each is restated with its current
state and its actor. **None of them is closed by this phase, and three of them
cannot be closed by writing a file at all.**

| Gate | State | Who acts | Why a file cannot close it |
|---|---|---|---|
| `RG-QUO-3` | **FAIL** | **operator** | The sweeps exist and a dry run is recorded. What is missing is a **schedule**, and ADR-082 with the `migration-must-not-schedule-destructive-sweeps` rule puts that schedule in an operator script run deliberately, never in a migration. **Scheduling is authorization**, and a migration that schedules a purge authorizes it on every future `db reset`. |
| `RG-DEP-1` | **FAIL** | **operator** | Production SMTP is read back from the hosted project. The gate asks the deployed configuration, so the only thing that changes its answer is configuring the deployed mailer. |
| `RG-DEP-3` | **FAIL** | **operator** | A backup must be **restored into a disposable project** and the restore recorded. The evidence is the drill, not the description of one. **Writing a document claiming a restore happened is the precise failure this gate exists to prevent.** |
| `RG-LEG-4` | **OWNER** | **owner** | Professional legal review is a human judgement about liability. No artifact in this repository can stand in for it. |
| `RG-DEP-4` | **OWNER** | **owner** | Monitoring adequacy is a judgement about whether the operator would find out in time. The tooling exists; whether it is *enough* is a signature. |

**Two of these are the ones this phase was warned about by name.** `RG-DEP-3`
and `RG-DEP-4` **may never be closed by writing a file** — ADR-118 Decision 7 and
the slice 2O.8 prompt both say so, and this dossier is the file that would have
been the temptation.

---

## 3. Retention, and why nothing here schedules anything

`2O-READY-005`: **a retention sweep schedule, if ever armed, is armed by an
operator script and never by a migration.**

Phase 2O created **zero migrations**, so the rule is not merely respected — it
had no opportunity to be broken. Stated as a positive fact rather than as an
absence: `supabase/migrations/` contains no file attributable to this phase, and
the generator refuses on any it finds.

**No retention sweep is scheduled by this phase**, and `RG-QUO-3` therefore stays
`FAIL` exactly as it was found. Leaving a gate failing is the correct outcome
when the thing it measures has not happened.

---

## 4. Signup, stated as a fact and not as an intention

- **Signup is closed** and this phase did not open it.
- `config.toml` is unchanged by this phase.
- No secret was created, rotated or modified.
- The rollout gate script is unchanged; its output above is what the same script
  has said since the Signup Hardening closeout.
- The CSP is unchanged.

`2O-READY-003` is satisfied by all five together, and every one of them is an
absence that can be checked rather than a promise.

---

## 5. What this dossier deliberately does not say

It does not say the product is ready to open. **It says which doors are closed
and who holds each key.** The phase that produced it delivered activation,
onboarding, preferences, AI configuration, privacy, notifications, recovery,
mobile and accessibility work — and none of that changes the answer to *may
signup open*, which remains **no**, on three failing gates and two unsigned ones.

**A completed phase is not an authorized opening.** The gate's own last line
says it better than this document can: *a failed or unsigned gate is a closed
door, and this script has no path that reports otherwise.*
