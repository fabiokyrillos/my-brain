# BYOK — master-key rotation, loss and compromise: the runbook

**Status, updated 2026-08-02: partly drilled, and each section now says which.**
The original status line — *written, not yet drilled* — is retained below as the
record of what this file was when BYOK.6 shipped it, because a document that
quietly upgrades its own credibility is exactly what `ADR-069` exists to
prevent.

- **§2a two-key rotation window — BUILT and DRILLED** on disposable material,
  and read-only `--status` was run against the deployment. **Not yet executed
  against the live master key**; that is an owner-authorised change and the
  smallest outstanding action in the whole initiative.
- **§3 master-key loss — EXECUTED, for real.** It did not need a disposable
  project: it happened against the deployment on 2026-08-02 when the first
  cutover left the two runtimes holding different keys, and every property the
  drill exists to establish was observed. `BYOK-MASTER-007` and gate F3 are
  satisfied by that, not by a simulation.
- **§4 compromise, §5 pepper rotation, §6 the validation key — still written,
  not drilled.**

> *Original status, 2026-08-01:* written, **not yet drilled**. `BYOK-MASTER-007`
> and BYOK.6's gate F3 require the loss procedure to have been **executed
> against a disposable project** before it is trusted, and no disposable project
> exists. Every procedure below is therefore a plan, and says so at the top of
> its own section. A runbook nobody has run is a hypothesis with formatting.

**Scope.** The three BYOK secrets, per environment:

| Secret | What it protects | What its loss costs |
| --- | --- | --- |
| `BYOK_MASTER_KEY` | Every stored credential's ciphertext | **Every user must re-enter their key.** Nothing else recovers it. |
| `BYOK_FINGERPRINT_PEPPER` | The keyed digest shown in Settings | Fingerprints stop matching; no credential is lost |
| `BYOK_RATE_LIMIT_PEPPER` | `credential_validation_attempts.ip_hash` | Throttle buckets reset; no credential is lost |

They are independent by design (`BYOK-FINGERPRINT-001`, `ADR-070`): one
compromise must not yield two capabilities. That independence is what makes the
three procedures below genuinely different from one another.

---

## 1. The fact everything else follows from

**The database cannot decrypt anything.** `BYOK-MASTER-004`: the master key is
not in Postgres, no SQL in the chain decrypts, and both resolvers return the
sealed envelope for a runtime that holds the key to open. A database copy — a
backup, a dump, a replica — is inert on its own.

**The operator can.** `BYOK_SECURITY_DEFINITION.md` is explicit, and the product
copy is written to never claim otherwise: whoever holds the master key **and** a
database copy can decrypt every stored credential. That is the trust boundary
this architecture actually has, and every procedure below is shaped by it.

So: master key plus database is total exposure; either one alone is not.

---

## 2. Master-key rotation, planned

**Not drilled.** No environment has ever carried a BYOK master key.

Rotation is not a key swap. Every ciphertext is bound by AAD to
`(user_id, key_version, provider)` and sealed under the key that was current when
it was written, so a new master key opens **nothing** that already exists. There
are only two honest shapes:

### 2a. Two-key bounded window — **BUILT and DRILLED on disposable material, 2026-08-02. Not yet run against the live key.**

Accept the previous master key for decryption while writing only under the new
one, re-encrypt each credential, and close the window when the last row has
moved.

**What exists now.** `src/lib/byok/rotation.ts` and its Deno twin
`supabase/functions/_shared/byok-rotation.ts`, held function-body for
function-body by `src/lib/byok/rotation-parity.test.ts`; the re-encryption tool
`npm run byok:rotate-master-key`; and three environment names that are absent in
normal operation — `BYOK_MASTER_KEY_VERSION`, `BYOK_PREVIOUS_MASTER_KEY`,
`BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT`.

**It is not a fallback, and that is the whole design.** The row's own
`key_version` selects **one** key. A reader that tried the current key and fell
back to the previous one would be a decryption oracle — the number of attempts
is observable, and "it opened under the old key" is a fact an attacker would
like. `BYOK-CRYPTO-005` forbids a decryption failure from naming its cause, and
this preserves that: a row at a version neither key covers is offered no key at
all and fails **identically** to a corrupt row.

**Drilled, on disposable material only.** Executed 2026-08-02, no live
credential touched: a row sealed under a synthetic previous key opens inside the
window; re-sealing produces a different ciphertext that opens under the current
key; the previous key can no longer open the re-sealed row; once the window
closes the old row is offered no key while the new one still reads; and the
progress counter refuses to report completion while any row is at the previous
version **or unreadable**. `--status` was also run read-only against the
deployment and reported `remaining: 0` at version 1, which is the state a
pre-rotation environment should show.

**Startup refuses more than it accepts.** A malformed current *or previous* key
fails to start; an expiry without a key is refused; a key without an expiry is
refused; a previous key at version 1 is refused; and a window declared longer
than 30 days is **refused rather than truncated**, so the runtime and this
document can never disagree about when the old key stops working. No third key
is read — the guard `src/lib/byok/guards.test.ts` pins the exact four names both
runtimes may see.

**Rollback limitations, stated plainly.** There is no undo. Once a row is
re-sealed at the new version, the previous key cannot open it, so a rotation
started with a *wrong* current key strands every row it touches — which is why
`npm run byok:verify-runtime` must print `IN PARITY` **before** a rotation
begins, not after. `--limit N` exists so a first production run can move a
handful of rows and be checked before the rest. Restoring a pre-rotation state
means restoring a database backup; there is no key-side recovery and none is
claimed.

The window is bounded because an unbounded one is not a rotation — it is two
live keys forever, which doubles the surface the rotation was performed to
reduce. **Expiry rule: the window closes when the re-encrypted count equals the
credential count, or at 30 days, whichever comes first.** At 30 days, whatever
has not moved is invalidated and its owner is asked to re-enter — which is worse
for those users and better for everyone, and is a decision that must be made
before the window opens rather than during it.

### 2b. Invalidate and ask — available today, and the only procedure that is

Set the new key, mark every credential `invalid`, and let each user re-enter.
Blunt, correct, and it needs nothing that does not already exist. It is the
right choice for a **compromise**, where the old ciphertext must stop being
openable regardless of convenience, and the wrong choice for hygiene rotation,
where it charges every user for an operator's schedule.

```sql
-- Under the NEW master key, after it is set in both runtimes.
-- Every user is gated at their next AI action and sees the Settings copy.
update public.user_ai_credentials
set status = 'invalid',
    ciphertext = null,
    iv = null,
    key_version = null,
    validated_at = null,
    last_failure_code = 'unknown'
where status = 'active';
```

The material is nulled in the **same statement** as the status, for the reason
`BYOK-LIFECYCLE-006` gives: a crash between two statements leaves a row claiming
to be unusable while still holding openable ciphertext, which is exactly the
state the status CHECK forbids.

---

## 3. Master-key loss

**Not drilled.** Gate F3 requires this executed against a disposable project.

Loss means: no copy of `BYOK_MASTER_KEY` exists for an environment that has
credentials sealed under it.

**Nothing recovers the credentials.** Not a backup — the database never had the
key. Not the fingerprints — they are keyed digests under a different secret and
are not reversible. Not the users' own OpenAI dashboards — those show which keys
exist, not their values. This is the intended property, and the procedure is
therefore about **restoring service**, not about recovery.

1. Generate a new `BYOK_MASTER_KEY` and set it in **both** runtimes for that
   environment. The worker refuses to serve without one, by design, so until this
   step every job fails with `worker_not_configured` rather than degrading.
2. Run the invalidate-and-ask statement from §2b. Every affected user is now
   gated with copy that names the fix.
3. Do **not** delete the credential rows. `status = 'invalid'` keeps the row, its
   `created_at`, and the audit trail; deleting loses the evidence that anything
   happened.
4. Tell affected users what happened, in the product's own terms: their key could
   not be read, they need to enter it again, and nothing of theirs was exposed.

The last point is the one worth being careful about: master-key **loss** is not
a breach. Saying "we lost the ability to read your key" is true; saying "your key
may have been exposed" is not, and the two require different things of the user.

---

## 4. Master-key compromise

**Not drilled.**

Compromise means: the master key is, or may be, held by someone who should not
hold it — a leaked environment listing, a compromised deploy log, a departed
operator with a copy.

**Assume the database is also reachable.** Master key plus database is total
exposure, and a compromise investigation that assumes only one half was taken is
an investigation that concludes too early.

Order matters. Each step is chosen so the previous one cannot be undone by the
next:

1. **Rotate the master key first**, using §2b — invalidate and ask. Not §2a: a
   re-encryption window keeps the compromised key able to open ciphertext for as
   long as the window is open, which is the one thing that must stop.
2. **Require every affected user to rotate their provider key**, not merely
   re-enter it. Re-entering restores service under a key that may already be in
   somebody else's hands. The message has to say *revoke it at OpenAI and create
   a new one*, and it has to say why — a user who re-enters the same key has done
   nothing.
3. **Rotate `BYOK_FINGERPRINT_PEPPER` and `BYOK_RATE_LIMIT_PEPPER` as well**, but
   only after step 1. They are independent secrets and a master-key compromise
   does not imply theirs — but the same exposure that produced one usually
   produced all three, and the cost of rotating them is small: fingerprints stop
   matching and throttle buckets reset. Neither loses a credential.
4. **Preserve the evidence.** `user_ai_credentials.created_at` and `updated_at`,
   `credential_validation_attempts`, and `audit_logs` are what an investigation
   has. Do not delete rows to tidy up.
5. **Record the window**: when the key was created, when it was compromised as
   best known, and when it stopped being accepted. Every credential sealed inside
   that window is in scope; credentials created after step 1 are not.

### What must not be done

- **Do not keep the old key "just in case".** After step 1 it opens nothing that
  should still be openable, and it remains a key that opens backups.
- **Do not tell users their data is safe.** Their stored provider credential may
  have been decrypted. That is the honest statement, and it is the one that leads
  them to revoke.
- **Do not rotate the pepper first.** It changes fingerprints without changing
  what an attacker can decrypt, and it makes the audit trail harder to read
  during the investigation that follows.

---

## 5. Pepper rotation, on its own

Both peppers can be rotated independently of the master key and of each other.
Neither can lose a credential, because neither participates in encryption.

**`BYOK_FINGERPRINT_PEPPER`.** New value → every stored `fingerprint` is a digest
under a key nobody computes with any more. The value shown in Settings becomes
stale rather than wrong-in-a-dangerous-way; it is recomputed the next time a
credential is saved or rotated. There is no migration and no backfill: a
fingerprint is a display and comparison aid, never an authorization input.

**`BYOK_RATE_LIMIT_PEPPER`.** New value → every `ip_hash` lands in a fresh
bucket, so existing throttle state is effectively reset. This is a real, if
small, availability decision: an attacker mid-campaign gets their ceiling back.
Prefer rotating it during a quiet window, and never as a way to clear a
legitimate user's ceiling — the ceiling exists to be reached.

Retention already bounds the exposure: `credential_validation_attempts` is pruned
at 30 days by a scheduler-only function, so stale hashes age out without
intervention.

---

## 6. The validation key, which is none of the above

`BYOK_VALIDATION_OPENAI_API_KEY` is not a BYOK secret. It is a dedicated OpenAI
key belonging to a dedicated low-limit project, used only by the opt-in
acceptance lane, and deliberately **not** named `OPENAI_API_KEY` so the lane
cannot be satisfied by a project key.

- It is revoked at the OpenAI dashboard, not by anything in this repository.
- Revoking it breaks exactly one thing: `npm run test:byok:validation`. No
  product path, no user, no deployment.
- It carries a USD 2 monthly **budget alert** — a soft alert, not a hard cap.
  That distinction has been stated in every record that mentions it and is
  restated here because it is the sort of thing that gets rounded to "capped".

**Revocation evidence is outstanding.** BYOK.6's closeout wants it recorded that
the key was revoked once the lanes that need it are done. It is an owner action
at the OpenAI dashboard, and it is listed in the handoff.

---

## 7. What would make this document trustworthy

Each of these turns a section from a plan into a procedure:

| Section | What is missing | Who can do it |
| --- | --- | --- |
| §2a two-key window | **Built and drilled 2026-08-02** on disposable material — version-selected reads in both runtimes, `npm run byok:rotate-master-key`, a completion counter that refuses to say "done" while any row is unreadable. What remains is one **production** run, which needs an owner-authorised master-key change and is the smallest outstanding action | Owner — the key change; the tool is ready |
| §3 loss | **Executed, for real, 2026-08-02** — not against a disposable project but against the deployment, when the first cutover left the two runtimes holding different keys. Every property this drill exists to establish was observed: ciphertext unreadable, application failed closed, no plaintext recovery claimed, owner re-entered. `BYOK_DEPLOYED_ACCEPTANCE.md` §5 | Done |
| §4 compromise | A dry run of steps 1–3 in the same disposable project | Same |
| §6 revocation | The revocation itself, and its evidence line | Owner, at the OpenAI dashboard |

Until then this file is what it says at the top: written, not drilled. The
distinction is the whole reason `ADR-069` exists — a lane that ships marked
"passed" while unexercised is worse than one that ships marked "unexercised",
because the first is believed.
