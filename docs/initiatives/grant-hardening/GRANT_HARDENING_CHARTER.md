# Grant hardening — charter

**Status: REGISTERED, NOT PLANNED.** This document records an owner decision and
the boundary of the work. It is **not** a PRD and **not** an implementation plan;
neither exists yet, and writing either needs its own authorization.

---

## The decision

**Owner, 2026-08-25.** Raised by slice 2S.1's hosted deployment, which found that
`authenticated` holds `TRUNCATE` on 38 of 59 `public` base tables and that
`TRUNCATE` does not respect RLS.

> Do **not** fix inside Phase 2S, and do **not** create a second migration.
> Register it as a separate, priority grant-hardening initiative with a migration
> of its own.

**Phase 2S is unaffected.** Its migration budget stays `1 allocated · 1 spent ·
1 created · 1 applied`, and a second migration of any kind remains a stop
condition for it. This initiative does not block slice 2S.2.

## The objective

Remove `TRUNCATE` from `authenticated` across the affected tables, and review the
other privileges the schema's default rules hand out unasked.

## What the evidence already changed about the objective

`docs/reports/grant-hardening/GRANT_HARDENING_EVIDENCE.md` was measured before
this charter was written, and it moved two of the objective's own premises:

1. **The default grants eight privileges, not four.** `arwdDxtm` — every table
   privilege, including `MAINTAIN`. The "four" figure in slice 2S.1's records was
   read from `information_schema`, which **cannot see `MAINTAIN`** on PG17.
   Any census this initiative writes must use `has_table_privilege`.
2. **`service_role` is the larger exposure, not `authenticated`.** 45 tables with
   **all eight** privileges, against `authenticated`'s 38. `anon` is completely
   closed and is not part of this work.

The scope therefore covers **both** roles, and "38 tables" names where the
finding started rather than where the work ends.

## Preserved before planning, as directed

All six items the owner required are in the evidence document, measured read-only
against the deployed project:

| required | where |
|---|---|
| nominal census of the affected tables | §1 — full matrix by role, all 38 named, and the 21 already-clean named too |
| exact origin in the default privileges | §2 — both `pg_default_acl` rules, verbatim |
| read-only reachability via PostgREST, RPCs and other surfaces | §3 — including the residual risk stated honestly |
| controls preventing new tables from inheriting it | §4 — three candidates; the mechanism already exists as `ensure_rls` |
| rollback plan | §5 — grant-only, exact inverse, snapshot-based |
| proof legitimate operations do not depend on it | §6 — app, workers, scripts, migrations and tests all searched |

## Deliberately left open for planning

- Which control of §4 to adopt, or which combination. Prevention and detection are
  not alternatives.
- Whether `REFERENCES`, `TRIGGER` and `MAINTAIN` come out with `TRUNCATE`. The
  evidence proves the application needs none of them, and deliberately stops
  short of recommending.
- Whether `signup_hardening_grant_census.sql` moves off `information_schema`. It
  passes today and proves slightly less than its sentence claims (evidence §2).
  Recorded; not changed.
- Realtime and Storage surfaces, not assessed.
- Sequencing, effort and the migration's contents.

## The standing rule this initiative must not break

The census in `signup_hardening_grant_census.sql` derives membership from actual
grants. **A table's privilege posture is a consequence of what a migration
revoked, never a declaration** — and the closed list is exact in both directions.
Any change here moves tables between those sets, so the census must be updated
**by name, in the same change**, exactly as slice 2S.1 learned to do the hard way.
