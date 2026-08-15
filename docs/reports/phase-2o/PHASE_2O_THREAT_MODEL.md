# Phase 2O — Threat Model

**Status:** planning evidence. Authorizes nothing. Every threat below is stated
against the surfaces `PHASE_2O_PRD.md` proposes, at baseline `main` `9cc1175`.

**Amended 2026-08-15 by ADR-116**, which signed all twelve decisions. Three
threats changed shape and **one is new**: `OD-2O-2` **A** puts a value the user
does not control into a DOM attribute, which is **T-16**. Amendments are marked
in place; nothing is deleted, because a threat that was considered and narrowed
is evidence and a threat that vanishes is not.

**Scope.** This phase adds an unauthenticated page, a guided first-run path, a
consolidated preferences centre, a statement of what is stored, an export, a
session control, and a telemetry vocabulary. Each is a new way for data to be
read, and one of them is the **first bulk read of everything a user owns**.

**Method.** Each threat names the asset, the actor, the path, the existing
control, what this phase must add, and the requirement that closes it. A threat
with no closing requirement is carried with a destination, not dropped.

---

## T-1 — The export crosses a tenant boundary

**Asset:** every user-owned row.
**Actor:** any authenticated user.
**Path:** the export enumerates across every user-owned table. Four of them —
`entry_entities`, `entity_attachments`, `entity_tags`, and the relation tables —
are **polymorphic and prove ownership by trigger, not by a foreign key**. A
relationship row's own `user_id` has never been sufficient proof in this schema.
An enumeration written from the table list rather than from the ownership rules
can read another tenant's row and place it in an archive.

**Existing control:** forced RLS on every user-owned table; composite FKs
`(user_id, id)` where the relation is not polymorphic; ownership triggers where
it is; the deletion path's enumeration, already proved in pgTAP.

**This phase must add:** an export that reuses the deletion enumeration rather
than writing a second one, and a proof against a **foreign row that exists** —
not an empty table, which satisfies every isolation assertion vacuously.

**Closes:** `2O-PRIVACY-002`, `2O-PRIVACY-005`, `2O-SEC-001`, `2O-SEC-003`.
**Severity:** highest in the phase.

---

## T-2 — The export is incomplete and is presented as complete

**Asset:** the user's trust in the archive, and their ability to leave.
**Path:** a table added after the export was written is silently absent. The
archive still says "your data".

**Existing control:** none. This is a new surface.

**This phase must add:** completeness derived from the shared enumeration, and a
refusal rather than a partial. A guard that fails when a user-owned table exists
that the enumeration does not name.

**Closes:** `2O-PRIVACY-004`, `2O-PRIVACY-006`.
**Note:** the failure mode is documentary as much as technical. `2N-FILES-008`'s
lesson applies — a reader with no writer is a capability the product claims and
does not have.

---

## T-3 — A definer function created for the export becomes general-purpose authority

**Asset:** the RLS trust boundary.
**Path:** the cheapest way to read across polymorphic relations is a
`SECURITY DEFINER` function. `postgres` bypasses RLS, so a definer function
**is** the isolation — and a definer function whose caller check is weak, or
whose `search_path` is unset, is a hole in every tenant at once.

**Existing control:** the standing rule — definer functions set an explicit safe
`search_path`, validate caller and owner, and take least-privilege grants.

**This phase must add:** either no definer function at all (preferred), or one
with an owner decision behind it, a validated caller, and a pgTAP proof against
a foreign row.

**Amended by ADR-116.** `OD-2O-4` is signed **A** — synchronous, server-side,
over the deletion **enumeration**. Reusing the enumeration is **not** authority
to reuse or create a definer function, and ADR-116 Decision 7 says so
explicitly. So the preferred branch is now the only authorized branch: **no new
definer function**, and if the export cannot be made complete and tenant-safe
without one, **the slice stops and returns to the owner** rather than granting
authority quietly.

**Closes:** `2O-SEC-002`, `2O-SEC-003`. **Signed:** `OD-2O-4` **A**.

---

## T-4 — The "what is stored about me" surface leaks what it counts

**Asset:** classified content.
**Path:** a category count is safe; a category **preview** is not. `people.notes`
is masked by default, memory bodies and file names are governed, and a surface
that renders "3 memories: *…*" to make the count legible has leaked three
governed strings.

**Existing control:** `ProtectedContent` / `ProtectedSurface`, derived
sensitivity, ADR-110's fail-closed rule.

**This phase must add:** counts without previews, and any label that is rendered
routed through the classification its own page uses. The lesson from Phase 2N's
library overview applies directly: a governed column can leak through its
derivatives, so the census is of the **row**, not the column.

**Closes:** `2O-PRIVACY-003`, `2O-PRIVACY-010`.

---

## T-5 — The public entry page becomes an oracle about accounts

**Asset:** the existence of an account.
**Path:** any unauthenticated surface that varies with input — an e-mail check,
a "this address is registered" hint, a differently-timed response — tells an
attacker who has an account here.

**Existing control:** `SH-SIGNUP-001`'s uniform refusal, checked before parsing;
uniform-outcome auth refusals (`RG-SIG-7`).

**This phase must add:** an entry page that reads no user data at all, and a
closed-signup statement that is a standing fact rather than a response.

**Closes:** `2O-ENTRY-003`, `2O-ENTRY-006`.

---

## T-6 — The onboarding path reveals state before authentication completes

**Asset:** account state.
**Path:** a guided path rendered from derived facts reads the account. If any
part of it renders on an unauthenticated or partially-authenticated request — a
consent interposition, a suspended account, an expired session — it says
something about an account to someone who has not proved they own it.

**Existing control:** `requireUser`, the consent interposition, the
account-state page, the lifecycle gates.

**This phase must add:** the path mounted strictly inside the authenticated
layout, after consent interposition, with the account-state gate in front of it.
`2O-ENTRY-007`'s return-to-destination must not carry state across the gate.

**Closes:** `2O-ENTRY-007`, `2O-ONBOARD-002`, `2O-SEC-001`.

---

## T-7 — A global sign-out is triggered by something other than the user

**Asset:** the user's sessions.
**Path:** a global sign-out is a destructive act on every device. A control that
can be triggered by a link, a prefetch, or a cross-site request ends sessions
the user did not choose to end.

**Existing control:** Server Actions are POST-only with origin checks;
`authOrigin()` comes from configuration and never from a request header.

**This phase must add:** explicit confirmation, because the act is irreversible
in effect, and an audit record of the request.

**Amended by ADR-116.** `OD-2O-5` is signed **A**, so the global sign-out **is**
built and the administrative device list is **not**. The cheap half carries the
whole of this threat and none of the authority the expensive half would have
needed: no GoTrue admin, no service-role on an authenticated path, no
threat-model change beyond this row.

**Closes:** `2O-PRIVACY-009`, `2O-SEC-004`. **Signed:** `OD-2O-5` **A**.

---

## T-8 — Telemetry carries content

**Asset:** user content.
**Path:** an activation funnel is tempting to make legible — "captured: *finish
the deck by Friday*". Every such property is user content in an append-only
ledger that nothing can edit.

**Existing control:** `record_product_event` and
`private.validate_product_event_properties`; the content-free posture on every
prior phase's events.

**This phase must add:** nothing new mechanically, and one discipline: the
event's properties are enumerated in the migration and the validator refuses
anything else.

**Closes:** `2O-METRICS-003`, `2O-METRICS-004`.

---

## T-9 — The vocabulary is widened in one place and refused in another

**Asset:** the measurement itself.
**Path:** `product_events` has carried **three** copies of its event vocabulary
— the check constraint, `private.validate_product_event_properties`, and the
writer's own list. The writer's list once froze at `202607280061` and silently
refused newer events; nothing found it for weeks.

**Existing control:** `202608080087` and `202608090089` removed two
duplications; a guard derives the ledger's real columns from the create-table
migration.

**This phase must add:** one migration touching all three, and a hosted
execution of the consumer before measurement is claimed.

**Closes:** `2O-METRICS-004`, `2O-METRICS-005`.

---

## T-10 — A preference control is shipped for something that does nothing

**Asset:** the user's belief that the product does what it says.
**Path:** nine columns exist with no behavioural consumer. A well-meaning
consolidation renders them because they are there.

**Existing control:** `R-24` and `phase-2m-inert-preferences-guard.test.ts`.

**This phase must add:** `consumerEvidence` derived from the tree rather than
declared, so the rule is enforced by the build.

**Closes:** `2O-ACTIVATION-005`, `2O-ACTIVATION-007`, `2O-PREF-008`.

---

## T-11 — The consolidation orphans sign-out

**Asset:** the ability to leave the product on a phone.
**Path:** `AccountMenu` mounts in exactly two places — the desktop rail's foot
and the mobile overflow. Retiring or restructuring `Mais` takes Ajustes, all of
Dados e IA and **sign-out** with it. The mobile top bar carries only the
palette, the locale switch and notifications.

**Existing control:** `mobile-reachability-guard.test.ts`, which fails in both
directions and says when slot five frees up.

**This phase must add:** re-derivation of that census in the same change, never a
relaxation of it.

**Closes:** `2O-PREF-003`, `2O-MOBILE-005`.

---

## T-12 — A retention sweep is armed by a migration

**Asset:** user data that has not yet been deleted.
**Path:** `RG-QUO-3` fails because sweeps are built and unscheduled. Scheduling
them inside a migration would make the migration itself the authorization, and
it would run on every fresh database including CI.

**Existing control:** the standing rule — a migration must not schedule a
destructive sweep; the schedule belongs in an operator script.

**This phase must add:** nothing. `2O-READY-005` restates the prohibition and
`2O-PRIVACY-007` explicitly does not schedule.

**Closes:** `2O-READY-005`. **Carried:** `T-19` from the rollout gate, unchanged.

---

## T-13 — A moved permission prompt harvests consent for a broken channel

**Asset:** the user's willingness to be notified.
**Path:** moving the notification ask to a moment of value will raise consent
rates. Push **fails with HTTP 403 on a real iPhone** and has never run on
Android. More consent for an undelivered channel is a worse product, not a
better one, and it spends a permission a browser only grants once.

**Existing control:** consent, permission and delivery are already separate
facts in the notification feature.

**This phase must add:** a refusal to collapse them, and a statement that
delivery is unproven where it matters.

**Closes:** `2O-NOTIFY-004`, `2O-NOTIFY-006`, `2O-NOTIFY-007`.
**Carried:** the 403 itself, to `docs/initiatives/push-hardware-validation/`.

---

## T-14 — A guard passes over a page that never rendered

**Asset:** every absence claim in the phase.
**Path:** `2O-RECOVER` is mostly assertions that a surface no longer says
something. An absence assertion passes on a blank page, and this repository has
shipped exactly that failure before.

**Existing control:** the standing rule — pair an absence assertion with a
fixture marker.

**This phase must add:** `2O-RECOVER-007`, and a planted divergence on every
guard that asserts an absence.

**Closes:** `2O-RECOVER-007`, and it is a precondition for `2O-PREF-007`,
`2O-ACTIVATION-007` and `2O-MOBILE-003`.

---

## T-15 — The phase starts the successor

**Asset:** the governance invariant.
**Path:** an activation phase naturally produces "what comes after opening
signup" notes. A declared `2P-…` requirement, a `PHASE_2P_…` artifact, or an
accepted ADR naming the successor in its heading each starts a phase nobody
authorized.

**Existing control:** A13, retargeted by this authorization's own commit.

**This phase must add:** nothing beyond obeying it. `2O-CLOSE-004` forbids the
closeout from retargeting.

**Closes:** `2O-CLOSE-004`.

---

## T-16 — the stored appearance value is attacker-controlled input

**New, and created by a signature.** `OD-2O-2` **A** was signed on 2026-08-15.

**Asset:** the rendered document, and through it every surface in the product.
**Actor:** any script running on the origin — an extension, a pasted console
snippet, or anything that reaches `localStorage`.
**Path:** the appearance choice is **held in `localStorage` and applied to a DOM
attribute before first paint**. `localStorage` is not a trusted store: it is
writable by anything on the origin, it survives sign-out, and its contents are
attacker-controlled by definition. A value read from it and written into
`data-theme` — or worse, interpolated into the inline script that applies it —
is untrusted input reaching the document at the earliest possible moment, before
any React boundary exists to sanitise it.

**Existing control:** the product's standing rule that **every untrusted
boundary is validated with an explicit parser**. `localStorage` has not
previously been one of this product's boundaries, because nothing was read from
it.

**This phase must add:** validation against the **closed set of three** —
follow-the-machine, light, dark — before the value reaches any attribute, with
anything else falling back to follow-the-machine rather than being applied. The
inline script must **not** interpolate the stored value into its own source.

**A second half, verified rather than assumed.** The inline application script
is possible without touching the CSP: `next.config.ts` already carries
`'unsafe-inline'` in `script-src`. That was checked in the tree before this
threat was written — the alternative conclusion, that `OD-2O-2` **A** needed a
CSP change and was therefore a deployment-boundary stop condition, would have
been wrong. `csp.test.ts` holds the header shape and must come out of slice 2O.3
unchanged; **a CSP change is a stop condition**.

**Closes:** `2O-PREF-014`, `2O-SEC-001`.
**Severity:** the highest of the new surfaces, because it renders before
everything else does.

---

## Carried, with destinations

| Carried | Destination |
|---|---|
| Push HTTP 403 on iPhone; Android never executed | `docs/initiatives/push-hardware-validation/` |
| `T-19` — retention sweeps unscheduled (`RG-QUO-3`) | operator script, owner decision |
| `RG-DEP-1` production SMTP; `RG-DEP-3` restore drill | owner and operator |
| `RG-LEG-4`, `RG-DEP-4` | owner signature |
| `2N-RELATION-TRIGGER` — co-mention still persisted | its own migration and owner decision |
| `2N-IDENTITY-EXTRACTION` — entities created with no user act | its own migration and owner decision |
| `2N-FILES-WRITER` — `entity_attachments` has no writer | new authority, owner decision |
| `2N-PRIVACY-FREETEXT` — masking posture for `person_projects.role` | owner posture question |
| ADR-055 — expires 2026-10-27, neither satisfied nor superseded | restated, not renewed |

**Amended by ADR-116.** `OD-2O-11` is signed, and it **admits exactly two**: the
**21px touch target** (`2N-MOBILE`) and a **real screen-reader validation**.
Both leave this table and enter the phase, at `2O-MOBILE-003` and
`2O-ACCESS-006`.

**Everything else in the table above stays carried and unabsorbed** — declined
by name: `2N-RELATION-TRIGGER`, `2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER`, the
retention sweeps and their scheduling, and any resolution of ADR-055, which
stays recorded and unresolved. Declined by the word *"only"*, and named here so
the exclusion is recorded rather than inferred: `2N-PRIVACY-FREETEXT`,
`2N-RELATION-END-ANNOUNCEMENT`, and the push HTTP 403 / Android track.

**The screen-reader admission carries a condition, not a promise.** `OD-2O-12`
**B** means it does not on its own block closeout — and may **never** be
promoted to a pass by documentation, an emulator, an automated scan, or
inference from one. Executed and recorded, or recorded as not executed. There is
no third outcome.
