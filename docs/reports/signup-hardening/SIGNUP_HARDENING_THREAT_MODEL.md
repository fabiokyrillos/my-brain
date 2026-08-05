# Signup Hardening — threat model

Date: **2026-08-02**. Scope: the attack surface that opening self-service signup exposes, plus the
new surfaces this initiative itself adds (deletion executor, admin boundary, consent, throttle
ledger). Baseline: `main` = `b007ffa`, on `docs/reports/signup-hardening/SIGNUP_HARDENING_FINDINGS.md`.

Each threat carries likelihood, impact, the prevention requirement(s) from
`docs/initiatives/signup-hardening/SIGNUP_HARDENING_PRD.md`, how it is detected, the test that proves the mitigation, and the
residual risk that remains after mitigation. Likelihood/impact are **Low/Med/High**, assessed for
the *post-open-signup* world (the world these controls exist for), not today's owner-only reality.

The trust model, stated once: the database and the workers are the trust boundary; React and the
UI are not. Every mitigation below that says "enforced server-side" means the property survives a
hostile client that never loads the UI. A control that lives only in the browser is treated as
absent.

---

## A. Account deletion

### T-01 Unauthorized deletion of another user's account
- **Likelihood/Impact:** Low / High. **Prevention:** SH-DELETE-002 (recent re-auth + typed
  confirmation, server-side), SH-DELETE-004 (executor authorized only for the requesting user's
  own account, accepts no target parameter). **Detection:** deletion log records the requesting
  session hash; an id mismatch is structurally impossible, not merely logged. **Test:** deno test
  proving a Bearer for user A cannot delete user B; pgtap proving the lifecycle transition is
  self-only. **Residual:** a fully compromised session can delete its own account — deletion is a
  legitimate capability of the account holder; re-auth bounds the window.

### T-02 CSRF / replay on the destructive action
- **Likelihood/Impact:** Med / High. **Prevention:** SH-DELETE-002 (typed confirmation phrase +
  fresh re-auth are not replayable across a stale request); Server Actions are POST with the
  framework's action encoding, not a GET. **Detection:** the re-auth check fails a replayed body
  whose auth is stale. **Test:** unit proving a request without a fresh re-auth is refused; unit
  proving the confirmation phrase is required server-side. **Residual:** none beyond T-01's
  compromised-session case.

### T-03 Stale-session deletion (deleting on a revoked-but-unexpired token)
- **Likelihood/Impact:** Low / Med. **Prevention:** SH-DELETE-002's re-auth calls the provider
  (`getUser`/password verify), which rejects a revoked identity; the proxy's existing revoked-token
  branch also fires. **Test:** unit over the re-auth path. **Residual:** the ≤1 h JWT window
  applies to *reading* the deletion form, not to executing deletion (which re-auths); acceptable.

### T-04 Deletion leaves jobs active / claimable
- **Likelihood/Impact:** Med / High (a job running as a deleted user's work, or an orphaned
  claim). **Prevention:** SH-DELETE-003 + SH-LIFECYCLE-006 (the moment status is `deleting`, no
  claim path picks the user's jobs up); SH-WORKER-002 (a job whose owner is `deleting`/absent
  fails terminally). **Detection:** the cascade drill (SH-DELETE-001) proves `jobs` rows are gone
  post-delete. **Test:** pgtap that a `deleting` owner's pending job is skipped by both claim
  paths; deno that an in-flight handler on a now-`deleting` owner terminates. **Residual:** a job
  claimed microseconds before the transition runs to its terminal reload, which then misses —
  clean terminal failure, no partial external effect because the interpretation persist is
  owner-keyed.

### T-05 Orphaned credentials after deletion
- **Likelihood/Impact:** Low / High. **Prevention:** SH-DELETE-008 (credential verified
  removed/absent/cascading before the `auth.users` delete); the `user_ai_credentials` cascade is
  the primary path, SH-DELETE-008 is the belt. **Test:** deno + pgtap. **Residual:** none — the
  master key is not in the database, so even a surviving ciphertext (impossible post-cascade)
  opens nothing.

### T-06 Orphaned storage objects after deletion
- **Likelihood/Impact:** High / Med (this has already happened — six live orphans).
  **Prevention:** SH-DELETE-005 (executor enumerates and deletes the `user-files/<uid>/` prefix
  and verifies zero remain before completing); SH-STORAGE-001 (scanner detects any that survive).
  **Detection:** SH-DELETE-011 zero-residue verifier includes the storage prefix; the scanner runs
  in CI (SH-OPERATIONS-006). **Test:** deno proving step (3) blocks completion on a remaining
  object; pgtap+script residue verifier. **Residual:** an object written *between* enumeration and
  the `auth.users` delete — bounded because writes are already blocked in `deleting` (T-04), so no
  new object can appear.

### T-07 Deletion destroys another user's storage object
- **Likelihood/Impact:** Low / High. **Prevention:** SH-DELETE-006 (delete only objects whose
  first path segment equals the deleting id; refuse if a live *other-user* `attachments` row
  references an object under the prefix); SH-DELETE-016 (negative control with colliding names).
  **Test:** deno + pgtap two-user collision test. **Residual:** none — the prefix is the owner id
  and the guard is exact-match plus a cross-owner reference check.

### T-08 Partial deletion produces an unusable zombie account
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-DELETE-005 (resumable state machine —
  every crash is re-runnable); SH-DELETE-007 (stop rather than force, account stays `deleting`
  with writes blocked, nothing half-applied). **Detection:** the deletion log's per-step
  timestamps show where a run stopped. **Test:** deno crash-between-steps re-run test.
  **Residual:** an account stuck in `deleting` awaiting operator attention — a safe stop (no
  product access, no data corruption), surfaced by SH-ADMIN's readback, not a silent zombie.

### T-09 Deletion of legitimate data by name/heuristic
- **Likelihood/Impact:** Low / High. **Prevention:** SH-DELETE-006/007 delete by structural
  ownership (prefix = uid, catalog-enumerated tables), never by name matching; SH-DELETE-015
  classifies the six orphans by verified absence of owner and attachment reference, not by prefix
  heuristic — the exact failure that misclassified the `codex.cost` account (STATE.md:232).
  **Test:** the scanner's classification test; the manifest procedure. **Residual:** an orphan
  whose owner uuid was *reused* (impossible under Supabase uuid issuance) — not a real case,
  recorded.

## B. Administrative boundary

### T-10 Over-broad service-role endpoint reachable by normal users
- **Likelihood/Impact:** Med / High. **Prevention:** SH-ADMIN-001/003 (admin transitions are
  `service_role` SQL, no client role holds EXECUTE; no service-role client in `src/`; admin
  scripts are the only callers, pinned both-directions). **Detection:** SH-EXPOSURE-002 full grant
  matrix census fails on drift. **Test:** pgtap grant probes; unit allowlist test. **Residual:**
  the operator's own workstation credentials — outside the software boundary, owned by SH-ADMIN-006
  runbook hygiene.

### T-11 Suspended user bypasses suspension via direct Edge Function / PostgREST call
- **Likelihood/Impact:** Med / High. **Prevention:** SH-LIFECYCLE-005/006 (the refusal is in the
  database RPCs and claim functions, not the UI), SH-SUSPEND-002 (proven with a real suspended
  account calling actions directly), SH-WORKER-001 (a job re-verifies lifecycle at its reload).
  **Detection:** the direct-call tests are the detection. **Test:** unit calling Server Actions
  directly under suspension; pgtap on the RPCs; deno on the handler. **Residual:** read access to
  already-issued data within the ≤1 h JWT window if the app-shell read were bypassed — bounded by
  the per-request proxy read (SH-SUSPEND-003) and the provider sign-in block (SH-ADMIN-005).

### T-12 Admin action without an audit trail
- **Likelihood/Impact:** Low / High. **Prevention:** SH-ADMIN-004 (every admin mutation writes
  audit through the SQL boundary; a direct table write is not the admin path), SH-LIFECYCLE-004
  (the transition itself writes audit). **Test:** pgtap that the transition function always writes
  audit; the function has no branch that mutates without it. **Residual:** none within the software
  boundary.

### T-13 Suspension leaves the user's automated work running
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-SUSPEND-004 (jobs stay queued, unclaimed),
  SH-LIFECYCLE-007 (heartbeat skips), SH-WORKER-004/005 (both executed against the deployment).
  **Test:** pgtap + deployed script. **Residual:** a job in flight at the instant of suspension
  completes once (T-04 shape) — one unit of already-authorized work, acceptable and recorded.

## C. Signup, recovery, sessions

### T-14 Signup flood / mass account creation
- **Likelihood/Impact:** High / High. **Prevention:** SH-THROTTLE-001/002 (per-IP, per-identifier
  daily ceilings, DB-enforced under locks), SH-CAPTCHA-002 (provider-enforced), SH-QUOTA (a created
  account can do little), SH-THROTTLE-005 (app ceilings ≤ provider ceilings). **Detection:**
  `auth_event_attempts` volume. **Test:** pgtap concurrency on the ceiling; deployed CAPTCHA
  probe. **Residual:** a distributed botnet under per-IP ceilings with solved CAPTCHAs — bounded
  per-IP and per-identifier, and each account is quota-boxed; the residual is recorded as the
  reason monitoring (SH-ROLLOUT) is a gate.

### T-15 Email bombing (a victim's address flooded with confirmation/recovery mail)
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-THROTTLE-002 (per-identifier recovery and
  resend ceilings), SH-SIGNUP-008 (resend is its own throttled surface), SH-THROTTLE-005 (below
  the provider's 2/h mail budget anyway). **Test:** pgtap ceiling per identifier. **Residual:**
  up to the ceiling of mails per day to a targeted address — bounded and below provider limits.

### T-16 Password-reset abuse / account takeover via recovery
- **Likelihood/Impact:** Med / High. **Prevention:** SH-SIGNUP-003 (link base is the configured
  origin, not the `Origin` header — a forged link cannot point at an attacker host),
  SH-SIGNUP-004 (redirect allowlist readback contains only the app origin), SH-THROTTLE (recovery
  ceilings), SH-SIGNUP-012 (fresh session on exchange, forced sign-out after reset). **Test:**
  unit on the origin source; readback on the allowlist. **Residual:** provider-side mail delivery
  integrity depends on SMTP (SH-ROLLOUT deployment gate).

### T-17 Account enumeration (signup / recovery / resend)
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-SIGNUP-011 (uniform outcome copy and
  response class across existing/unknown; shared rate-limit refusal), SH-THROTTLE-003 (throttle
  consulted before the provider so the timing difference is the throttle's uniform path, not the
  provider's send). **Detection:** the uniform-response tests. **Test:** unit asserting identical
  response shape for existing vs unknown; the timing residual measured once and recorded
  (SH-SIGNUP-011). **Residual:** a measured sub-threshold timing channel — recorded, not claimed
  away; email confirmation means an enumerated address still cannot be logged into.

### T-18 CAPTCHA bypass (UI-only enforcement)
- **Likelihood/Impact:** Med / High. **Prevention:** SH-CAPTCHA-002 (provider-enforced: a raw API
  call with no/invalid token fails at GoTrue, so bypassing the widget bypasses nothing).
  **Detection:** the deployed missing-token / invalid-token probe. **Test:** SH-CAPTCHA-002 script
  against the deployed project. **Residual:** CAPTCHA-solving services — the reason CAPTCHA is
  *one* control layered with throttles and quotas, not the sole gate.

### T-19 Session fixation / replay
- **Likelihood/Impact:** Low / Med. **Prevention:** SH-SIGNUP-012 (fresh session on exchange, no
  reuse of a pre-auth identifier), the existing refresh-token rotation (`config.toml:171`).
  **Test:** unit pinning the fresh-session behavior. **Residual:** standard bearer-token theft,
  outside signup scope.

### T-20 Open redirect / callback abuse
- **Likelihood/Impact:** Low / High. **Prevention:** SH-SIGNUP-010 (`safeAuthNext` allowlist,
  guarded by a regression test on the guard), SH-SIGNUP-003 (origin not from header),
  SH-SIGNUP-004 (provider allowlist readback). **Test:** unit on `safeAuthNext`; readback.
  **Residual:** none in-repo; provider allowlist is the belt.

## D. Quotas, abuse, exposure

### T-21 Quota race (two concurrent requests both admitted past a ceiling)
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-QUOTA-001/002/003 and SH-THROTTLE-002
  enforce ceilings inside the transaction under advisory locks or count-in-same-statement — never
  an in-process counter (the census confirms no app-process counters exist to race). **Test:**
  pgtap / deployed concurrency proving exactly one of two simultaneous boundary attempts admits —
  the BYOK C10 pattern. **Residual:** none at the database boundary; this is why the controls are
  in SQL, not the Node process.

### T-22 Multi-account abuse (one actor, many accounts, to multiply quotas)
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-THROTTLE (per-IP signup ceiling limits
  account minting), SH-CAPTCHA, per-account quotas cap each account's cost. **Detection:**
  `auth_event_attempts` per-IP aggregates. **Residual:** a determined actor across many IPs —
  recorded; the compensating control is that under BYOK each account pays its own provider bill,
  so infrastructure quotas (not spend) are what multi-account abuse can consume, and those are
  per-account bounded.

### T-23 Storage exhaustion
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-QUOTA-004 (per-user bytes and object
  ceilings enforced before the storage write), SH-QUOTA-005 (attachment counts). **Test:** unit on
  the aggregate check. **Residual:** aggregate across many accounts — bounded by T-22's per-IP
  signup ceiling.

### T-24 Oversized / malicious uploads
- **Likelihood/Impact:** Med / Med. **Prevention:** existing 25 MiB + MIME allowlist + private
  bucket; SH-QUOTA-006 (single source of truth so the three copies cannot drift open);
  SH-STORAGE-006 (no-scan posture recorded, compensating controls named, scanning left an open
  rollout item). **Test:** unit on the unified limit. **Residual:** a malicious file within an
  allowed MIME type — the recorded open item (file-signature detection / AV), owned by the rollout
  gate, not silently closed.

### T-25 PostgREST RPC over-exposure (an accidental grant rides along)
- **Likelihood/Impact:** Med / High. **Prevention:** SH-EXPOSURE-002 (full four-role grant matrix
  census, pinned), SH-EXPOSURE-007 (post-initiative re-census matches the declared delta),
  SH-EXPOSURE-008 (every new DEFINER function asserts its own grants). **Detection:** the census
  test fails by name on drift. **Test:** pgtap. **Residual:** none within the migration chain;
  the hosted catalog is verified by SH-EXPOSURE-001's executed probe and the rollout readback.

### T-26 service_role reads credential ciphertext directly
- **Likelihood/Impact:** Low / Med (service_role is not client-reachable, but the grant is a
  latent widening). **Prevention:** SH-EXPOSURE-001 (revoke table DML from service_role on both
  BYOK tables; resolvers keep working as DEFINER). **Test:** pgtap non-vacuous (grant seen before,
  refused after). **Residual:** the master key is still not in the database, so even the pre-revoke
  state opened nothing — this closes a defense-in-depth gap, not an active breach.

### T-27 Edge Function flood (no request-size cap, no rate limit)
- **Likelihood/Impact:** Med / Med. **Prevention:** SH-QUOTA-008 (`process-jobs` bounds body size
  before parse), SH-EXPOSURE-005 (`heartbeat` dispositioned). **Test:** deno on the size bound.
  **Residual:** invocation-count flooding of a `verify_jwt=false` function returning 401s — an
  infrastructure concern (platform rate limiting) owned by the rollout gate's monitoring item, and
  recorded rather than claimed solved by application code.

## E. Legal / consent

### T-28 Legal-consent version drift (accepted one version, enforced another)
- **Likelihood/Impact:** Low / Med. **Prevention:** SH-LEGAL-004 (one version constant per
  document, read by rendering + acceptance + enforcement), SH-LEGAL-006 (acceptance of a
  non-current version refused). **Test:** unit that a stale version cannot be recorded.
  **Residual:** none — the constant is the single source.

### T-29 Consent stored only in browser state
- **Likelihood/Impact:** Med / High (a consent that a client can fabricate is not consent).
  **Prevention:** SH-LEGAL-008/011 (acceptance is a `policy_acceptances` row written server-side
  at first authenticated session; clearing browser state changes nothing; the pre-session checkbox
  is necessary but not the record). **Test:** unit proving enforcement reads the table, not a
  cookie/localStorage. **Residual:** none.

### T-30 Consent version changed without re-acceptance logic
- **Likelihood/Impact:** Low / Med. **Prevention:** SH-LEGAL-009 (bumping the constant
  re-interposes the consent surface for every account; access resumes only after the new row
  exists). **Test:** unit bumping a fixture constant and proving re-interposition. **Residual:**
  none.

### T-31 Retention copy contradicts retained data (promising deletion while identifiable data
remains)
- **Likelihood/Impact:** Med / High (a privacy-policy falsehood). **Prevention:** SH-LEGAL-014
  (the enumerated retention list is pinned to the policy text by test), SH-RETENTION-006 (retained
  classes named with reasons), SH-DELETE-009 (the deletion log is de-identified — opaque event id,
  hashed session, counts, no email/name/user_id). **Test:** unit pinning policy text to the
  residue verifier's enumerated set. **Residual:** the deletion log retains a *hashed* session
  identifier — disclosed as such in the policy; not personally identifying.

## F. Cross-cutting

### T-32 A new user-owned table added after the census escapes deletion/residue
- **Likelihood/Impact:** Med / High. **Prevention:** SH-DELETE-001 and SH-DELETE-011 enumerate
  user-owned tables from the catalog at run time (the `byok_residue.sql` pattern), so a future
  table joins the drill and the verifier unasked and fails by name if it lacks a cascade.
  **Test:** the drill's by-name failure on an uncovered table. **Residual:** a user-owned table
  that stores ownership in a non-`user_id` column would evade a `user_id`-keyed enumeration —
  recorded as a convention the census enforces (every user table uses `user_id`), and the
  SH-EXPOSURE-002 matrix would still surface it.

### T-33 Rollout gate passes on documentation rather than executed configuration
- **Likelihood/Impact:** Med / High (the exact failure `ADR-069` exists to prevent).
  **Prevention:** SH-ROLLOUT-001 (absence of an artifact or unreadable config is *failure*),
  SH-ROLLOUT-002 (the script executes readbacks and probes, not doc reads), SH-ROLLOUT-005 (no
  manual-confidence path). **Test:** the gate script's own tests prove each gate fails closed on a
  missing artifact. **Residual:** a gate whose property is genuinely un-mechanizable (professional
  legal review, backup-restore judgment) — those are explicit owner-signature gates, labeled as
  human, not disguised as automated.

### T-34 Public signup opened before monitoring / incident handling exists
- **Likelihood/Impact:** Med / High. **Prevention:** SH-ROLLOUT-004 (monitoring adequacy and
  incident handling are enumerated gates), SH-ROLLOUT-006 (backup/restore verified).
  **Residual:** monitoring sufficiency is a judgment gate with an owner signature and a stated
  minimum (error visibility, signup-rate alerting) — recorded, because a mechanical "monitoring
  exists" check cannot prove "monitoring is adequate".

### T-35 The lifecycle read itself becomes a per-request performance or availability liability
- **Likelihood/Impact:** Low / Med. **Prevention:** SH-LIFECYCLE-008 resolves status from a
  single-row own-PK table already adjacent to the session; the read is indexed by PK and joins
  nothing. **Test:** the read is a point lookup. **Residual:** one extra point-read per authed
  request — bounded, and the proxy already performs a local claims check on every request.

---

## Summary — the five that most shape the plan

1. **T-06/T-32 (storage + future-table residue)** force the catalog-enumerated drill and scanner
   into SH.0/SH.2, not a fixed list — a deletion that "reached everything" is the easiest false
   claim to make.
2. **T-11 (suspension bypass via direct call)** forces every lifecycle refusal into the database
   and workers, tested by direct calls, not renders — the whole SH-LIFECYCLE family.
3. **T-14/T-18/T-21 (flood, CAPTCHA bypass, quota race)** force provider-enforced CAPTCHA and
   DB-enforced-under-lock throttles/quotas — never UI or process counters.
4. **T-29/T-31 (browser-only consent, retention-copy falsehood)** force server-side consent rows
   and a test pinning policy text to the residue verifier's enumerated set.
5. **T-33 (gate on docs not config)** forces the rollout gate to be an executed script whose
   absent-artifact rule is failure — the discipline `ADR-069` established, now applied to signup.
