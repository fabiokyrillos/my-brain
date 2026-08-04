# SH-DELETE-015 — the six orphaned storage objects: procedure and manifest

Status: **MANIFEST TAKEN 2026-08-04 against the deployed project. DELETION STILL
NOT AUTHORIZED — the loop stops here and asks.**

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

**Taken 2026-08-04** against the deployed project (`ulvwzqlpsjyrnqzfxmck`) at
hosted migration head `202608040074`, read-only, via
`npm run verify:storage:orphans`. Scanner totals, verbatim:

```
bucket:  user-files
objects: 6
live           0
absent-owner   6
absent-row     0
cross-owner    0
unparseable    0
```

| # | Path | Class | Size | Created | Owner in `auth.users`? | Referenced by any live attachment? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `0a32a853-998b-43a6-b55e-46aa6f23b902/f5de5671-25cb-4a77-865a-7aae32f91a82-nota.txt` | `absent-owner` | 36 bytes | 2026-07-16T21:55:36.758Z | no | no |
| 2 | `0e18c6b6-0578-4e14-8915-ff7ee2e4c3a5/f9197af4-7f05-487d-b98f-5545f5eb56b0-nota.txt` | `absent-owner` | 36 bytes | 2026-07-16T21:08:27.437Z | no | no |
| 3 | `10b77789-a1e2-4d12-9e41-9c204011aa20/c6cb26bd-7451-41da-8478-ec40fed7d5f5-nota.txt` | `absent-owner` | 36 bytes | 2026-07-16T21:15:01.191Z | no | no |
| 4 | `510e038d-5897-47a0-8f27-02a3f270a4d8/f4ef12cd-ee81-4caa-ac4f-b0455c229962-nota.txt` | `absent-owner` | 36 bytes | 2026-07-16T21:15:02.021Z | no | no |
| 5 | `68c2c4bb-e1e3-41b3-8673-12e8b35dca4d/ccfced78-d407-489a-9668-baaeba561a3a-nota.txt` | `absent-owner` | 36 bytes | 2026-07-16T21:19:28.310Z | no | no |
| 6 | `78d41c0f-13cf-4d55-b6ab-797d2371970e/2082088f-a8bc-4965-bb98-4d40c40a3622-nota.txt` | `absent-owner` | 36 bytes | 2026-07-16T21:10:44.056Z | no | no |

### How the last two columns were measured, and why separately

The scanner's `absent-owner` class already encodes condition (1). Condition (2)
was **not** inferred from it. A second read-only pass resolved each prefix
against `auth.admin.getUserById` and searched the **entire** `attachments`
table — every row of every user, not only rows sharing the prefix — for a row
whose `storage_path` equals the exact object path. Result: `attachments` holds
**0 rows in total** across the deployed project, so no live row of any owner
references any of the six. Both conditions of §1 are therefore satisfied
independently, per object, by measurement rather than by class inference.

### Reconciliation against the inherited belief

The prior records said "six objects, all 2026-07-16". **The measurement agrees**
— six objects, all created 2026-07-16, all `absent-owner`. This is recorded as a
confirmed measurement and not as a vindication of the belief: the belief was
restated across five documents without ever being taken, and the reason the
expected shape was written into §3 in advance was precisely so that agreement
and disagreement would both be legible. Had the count, date or class differed,
the discrepancy would have been the finding.

**No `cross-owner` and no `unparseable` object exists**, so neither of the two
conditions that would halt this lane outright is present.

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

**That question is now live.** The manifest above exists, all six objects are
proven to satisfy both conditions, and no object fell into a halting class. The
loop has stopped this lane here and deleted nothing. What remains is one owner
decision and, before it, SH-GD.2: a verified restorable backup. The owner has
reported a restorable-backup posture confirmed per the approved plan; that
report is recorded but was not independently verifiable from this side, so it is
carried as an owner attestation rather than as a measurement, and it is the one
input this document cannot supply for itself.

216 bytes total. Nothing else in Signup Hardening waits on this.

## 5. What is already true regardless

Nothing about these six blocks the rest of Signup Hardening. The executor
built in SH.2 removes storage for every account deleted **from now on**, and
the scanner is wired into future deletion acceptance and the rollout gate
(SH-STORAGE-002), so this class of residue cannot silently reappear. The six
are a historical debt with a procedure attached, not an open leak.
