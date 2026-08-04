# SH-DELETE-015 — the six orphaned storage objects: procedure and manifest

Status: **PROCEDURE READY, MANIFEST NOT YET TAKEN, DELETION NOT AUTHORIZED.**

Six objects under `user-files/<uuid>/…` have been recorded in five documents
since 2026-07-16. They were found by the BYOK fixture sweep and deliberately
left alone: database rows cascade from `auth.users`, storage objects do not.
They are the concrete evidence for the gap SH.2 closes going forward — and
they predate the executor, so nothing SH.2 built removes them.

**This document does not delete anything, and running its procedure does not
either.** The scanner (`npm run verify:storage:orphans`) reports and cannot
destroy — that is asserted by a test over its source. Removing an object is a
separate, owner-authorized, irreversible act, and the ordering below is the
whole point: **enumerate → classify → prove → record → stop → ask.**

---

## 1. Why this is not automated

The prompt governing this initiative is explicit, and it matches ADR-074's
reasoning: the six objects **must not be deleted merely because they are
believed to be stale.** Belief is not the standard. Each object must be shown,
individually, to satisfy both conditions below before it is even a candidate:

1. **the owner uuid is absent from `auth.users`** — the account is genuinely
   gone, not merely inactive; and
2. **no live `attachments` row of any user references the exact path** — the
   bytes are not in use by anyone, including a user who is not the prefix owner
   (the `cross-owner` class exists precisely so that case stops everything).

An object failing either check is not deleted, and its failure is itself the
finding.

## 2. The procedure

Run against the deployed project, with the service-role key in the
environment. It is read-only.

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify:storage:orphans
```

The scanner walks every object in `user-files`, resolves each first path
segment against `auth.users` (`auth.admin.getUserById`) and each full path
against `attachments`, and prints one line per non-`live` object with its
class, size and creation time. Classes:

| Class | Meaning | Candidate for deletion? |
| --- | --- | --- |
| `live` | owner exists and a live attachment row of that owner references the path | no — in use |
| `absent-owner` | prefix uuid not in `auth.users` | **yes, if also unreferenced** |
| `absent-row` | owner exists, no attachment row references the path | no — owner is live; belongs to SH-STORAGE-003's runbook remediation |
| `cross-owner` | a live attachment row of a *different* owner references it | **no — stops the procedure entirely** |
| `unparseable` | first segment is not a uuid | no — classify by hand before anything |

## 3. The manifest

**Not yet taken.** Taking it requires the deployed project and the
service-role key; it is a read-only step and carries no risk, but it has not
been executed at the time of writing, and this document does not pretend
otherwise.

When it is taken, the table below is filled from the scanner's output — one
row per object, verbatim — and this document is committed with it *before* any
deletion is proposed:

| # | Path | Class | Size | Created | Owner in `auth.users`? | Referenced by any live attachment? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | _pending_ | | | | | |
| 2 | _pending_ | | | | | |
| 3 | _pending_ | | | | | |
| 4 | _pending_ | | | | | |
| 5 | _pending_ | | | | | |
| 6 | _pending_ | | | | | |

Expected shape from the prior records: six objects, all `absent-owner`, all
dated 2026-07-16. **If the scan finds a different number, a different date, or
any object in the `cross-owner` or `unparseable` class, the discrepancy is the
finding** — it is recorded here and the procedure stops rather than proceeding
on the assumption that the older records were complete.

## 4. Where this stops

After the manifest is recorded, the loop **stops and asks.** Deleting the six
is:

- **irreversible** — object storage has no undo here, and the bytes are the
  last copy;
- **owner-authorized only** — no agent may perform it;
- **gated on SH-GD.2** — a verified restorable backup must exist first, per
  the initiative's backup boundary.

The exact owner-facing decision, when the manifest exists, is: *"here are the
six objects, each proven to have no live owner and no referencing row; may
they be deleted?"* — and the deletion itself is then a separate, recorded,
one-time act with the manifest as its authority.

## 5. What is already true regardless

Nothing about these six blocks the rest of Signup Hardening. The executor
built in SH.2 removes storage for every account deleted **from now on**, and
the scanner is wired into future deletion acceptance and the rollout gate
(SH-STORAGE-002), so this class of residue cannot silently reappear. The six
are a historical debt with a procedure attached, not an open leak.
