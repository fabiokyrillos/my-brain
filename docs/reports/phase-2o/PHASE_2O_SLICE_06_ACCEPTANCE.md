# Phase 2O — Slice 2O.6 acceptance record

**Notifications at the moment of value, and recovery everywhere** —
`2O-NOTIFY-001` … `-007`, `2O-RECOVER-001` … `-007`. Fourteen requirements,
**zero migrations**, on top of slice 2O.5's merge SHA `26922bc` with CI green on
all three job families.

**14 built · 0 partial · 0 undelivered.** Plus one requirement from an earlier
slice re-evaluated under an owner decision: **`2O-PRIVACY-001` closes `built`**
(ADR-119).

**87 of 116 delivered.** Slices 2O.0 – 2O.6; two remain.

---

## 1. The re-audit, re-run — and §83 was wrong twice

ADR-118 Decision 1 makes the per-slice re-audit **the** control this phase
relies on. §82 records that re-running it caught two false findings in §81.
This time it caught two more, both in §83's own account of slice 2O.6.

### 1.1 §83 counted a comment as a consumer

§83 records that *"only two files in `src` render `UniversalState`" —
`work-view.tsx` and `search-surface.tsx`* — and calls that number *"precise and
the load-bearing fact for the slice's size"*.

**One file rendered it.** `search-surface.tsx`.
`daily-cycle/work-view.tsx:91` contains the phrase *"the universal-state
contract"* **inside a block comment** and imports nothing from the module.

The near-miss underneath it is worth more than the correction. The component is
`UniversalStateView`; **`UniversalState` is the type**. A census keyed on
`UniversalState` matches every file that imports the type, the vocabulary
module, the copy module, two test files and a closeout guard — none of which
renders anything. The distinction the re-audit brief demanded — *importer vs.
renderer vs. re-export vs. test vs. comment* — is exactly the distinction that
had already been lost.

### 1.2 The plan's census: the total nearly reproduces, the split is inverted

`2O-RECOVER-002` names *"the ten app pages and thirteen feature components that
carry their own state copy"*. §83 reports the crude scan found *"zero pages and
ten feature components"* and correctly warns it is a heuristic.

Re-derived structurally, by class token rather than by copy string:

| | Plan | Actual |
|---|---|---|
| Surface-level state blocks | 23 files (10 + 13) | **22 files, 26 render sites** |
| …app route files | 10 | **16** |
| …feature components | 13 | **6** |
| Error / loading sites | not named | **10** |
| Section-level absences | not named | **40** |

So the plan's *total* for the category it was describing is nearly right and its
*split* is inverted. Two whole categories its sentence never mentions are real
and are the larger part of the work.

### 1.3 `quiet-state` is a typography helper, and this is the distinction the census turns on

`.quiet-state` is a muted-paragraph class with **58 uses**, and they are two
different things: section absences (*"nothing linked yet"*) and ordinary
explanatory prose (the content promise on notifications, the provenance line on
a task, the note that planning writes nothing).

Counting all 58 as states would have converted prose into states. Counting none
would have missed 40 real ones. They are separated by **what the paragraph
says**, and the guard re-derives that from the tree rather than trusting this
record's arithmetic.

### 1.4 §83's third finding held

`2O-NOTIFY-006` is easier to satisfy honestly after slice 2O.5's consent record,
and the push HTTP 403 track is not resumed. Both true, both respected.

---

## 2. What was built

### 2.1 Three gaps had to close before adoption was possible at all

| Gap | Why it blocked adoption | What shipped |
|---|---|---|
| A Server Component could not use the module | `onAction` is a function and cannot cross the RSC boundary; most of the product's empty states are server-rendered | `actionHref` — the same action as a destination |
| `error_terminal` could offer nothing | `recoverable: false` plus a null action label meant the state that most needs a way out was the only one that could not have one | `offersExit` in the vocabulary, so `2O-RECOVER-003` is a property of the state |
| A section absence is not a surface state | Five bordered cards on a project page make a populated page look like five failures | `UniversalStateLine` — same vocabulary, same `data-ux-state`, section density |

The third is the one that decided the slice's shape. Answering 40 section
absences with an exception list would have left 40 states outside a vocabulary
whose requirement says **wherever it is rendered at all**.

### 2.2 `2O-RECOVER-004` is a module, not a discipline

`universal-state-projection.ts` maps `ProductState` → `UniversalState`.
`organizing` and `saved` both resolve to **`interpreting`**, never to `loading`,
and the test is **exhaustive over the domain** rather than over remembered
cases.

The surface this was written for is the entry detail page. One sentence —
*"there is no interpretation yet"* — covered two genuinely different
situations: the AI is still reading the entry, and the AI tried and failed. The
first is not a failure and has nothing to retry, and it was being told *"you can
try again"*.

### 2.3 Three facts that cannot be collapsed

`2O-NOTIFY-007` forbids collapsing consent, permission and delivery into one
indicator. Written as guidance that lasts until the next green dot; written as
**three disjoint enums with no shared member** it is not available. A test
asserts the three vocabularies do not intersect.

**`DeliveryFact` has exactly one member — `unproven`.** `2O-NOTIFY-006` says no
surface claims a notification was delivered, and the honest encoding is a type
with no value meaning *delivered*: widening it is a diff a reviewer sees. Push
**fails with HTTP 403 on a real iPhone** and has **never run on Android**; this
slice states that where the reader will otherwise conclude the opposite, and
does not touch the track (`OD-2O-11`).

**`permission` has an `unknown`, and that is why the three are separate.** The
server holds a consent record; it does not hold a browser permission, which
lives on a device and changes in settings with no notification to anything.
`revoked` and `expired` resolve to `unknown` rather than guessing.

### 2.4 `2O-NOTIFY-005` names a bound whose object does not exist

The requirement asks for quiet hours, the daily cap **and an important-reminder
override** to be stated where consent is given.

**There is no override.** `decideDelivery` refuses inside quiet hours with no
exemption for type, priority or urgency, and the words *important*, *priority*
and *urgent* appear nowhere in the governance module. Checked against the
mechanism, not against the copy, and asserted by a guard.

So the surface **states the absence**: *"Não existe exceção. Nenhum aviso — de
nenhum tipo, com nenhuma urgência — passa por cima do período silencioso ou do
máximo diário."* That is stricter than the requirement assumes and serves its
stated reason — the reader understanding what bounds the consent — completely.
Writing the requirement's sentence as though the override existed would claim a
capability the product does not have.

**Classified `built`, with the divergence recorded here and routed to the
owner** as a requirement whose premise is false rather than as a shortfall.

### 2.5 `2O-NOTIFY-002`: the value is the predicate

The weak reading of *"a moment when the user has just seen why it is useful"* is
a timer or a visit counter. Both are proxies and both can fire on an account
that has never done the thing notifications are for.

The invitation appears when the account **has a reminder still waiting to
fire** — the value itself, stated as a predicate. *"Never on first arrival"*
then holds **by construction**: a new account has none. It also refuses to
appear where it could only lead to a dead end — a browser that already refused,
or one with no support.

It **links**; it raises no prompt. The permission call stays in the one file
allowed to make it.

### 2.6 `2O-RECOVER-006`: a draft that is text and never authority

`sessionStorage`, keyed per surface and per conversation. Not the database — the
composer holds the most sensitive unclassified text in the product. Not
`localStorage` — the requirement's word is *session*, and a draft on a shared
browser would still be there tomorrow.

**The idempotency key is deliberately not stored.** A restored draft arrives
with a fresh key and cannot replay a submission that already happened; a draft
carrying its key would be a stored authorization to repeat an action.

Cleared **in the action** on success rather than in an effect, because an effect
cannot distinguish *"this success just happened"* from *"this success is still
the state while the reader types the next entry"* — which would leave the note
hidden for the next draft.

---

## 3. Requirement classification

| Requirement | Verdict | Evidence |
|---|---|---|
| `2O-NOTIFY-001` — reached from the centre, route intact | **built** | `ACCOUNT_CENTRE_DESTINATIONS`; `phase-2o-notification-reach-guard`; browser journey, desktop + mobile |
| `2O-NOTIFY-002` — asked at a moment of value, never first arrival | **built** | `invitation.ts`, `shouldOfferInvitation`; a fresh account sees no invitation, observed in the browser |
| `2O-NOTIFY-003` — states what is sent, that payloads carry no content, and how to stop | **built** | `contentPromise` (2M) + `howToStop`; guard asserts both render |
| `2O-NOTIFY-004` — denied is a first-class state with its own recovery | **built** | `three-facts.test.ts` separates it from `unsupported` and from `granted`; `deniedRecovery` renders only for it |
| `2O-NOTIFY-005` — quiet hours, cap and override stated where consent is given | **built** | `NotificationBounds`, above the control; **the third bound's object does not exist and the absence is declared** — see §2.4 |
| `2O-NOTIFY-006` — no surface claims delivery | **built** | one-member union; HTTP 403 and Android stated in both locales; read off the wire |
| `2O-NOTIFY-007` — three separate facts | **built** | disjoint enums, asserted; three rows rendered, asserted in the browser |
| `2O-RECOVER-001` — every state rendered through the module | **built** | 40+ files through the module, up from **one**; guard both directions |
| `2O-RECOVER-002` — the census converted, or each exception recorded | **built** | `state-adoption.ts` + guard; **three** exceptions, each with a reason and a liveness check |
| `2O-RECOVER-003` — every error state offers an action; terminal offers a way out | **built** | `offersExit`; mutual-exclusion invariant over the whole vocabulary |
| `2O-RECOVER-004` — `interpreting` never rendered as `loading` | **built** | `universal-state-projection.ts`, exhaustive over `ProductState`, with a planted control |
| `2O-RECOVER-005` — incomplete configuration recoverable where it blocks | **built** (re-asserted) | the four-part shape already shipped and had nothing holding it; now guarded |
| `2O-RECOVER-006` — a draft survives navigation and says so | **built** | `composer-draft.ts` + browser journey across a real navigation, desktop + mobile |
| `2O-RECOVER-007` — the guard plants a fixture marker | **built** | planted violations in the structural guard; every browser absence assertion preceded by a marker |
| `2O-PRIVACY-001` — re-evaluated under ADR-119 | **built** | §5 |

---

## 4. Guards that fired, and what each cost

Five, and **none was weakened**.

1. **The 2I experience guard held `error_terminal.action === null`.** An armed
   assertion, and `2O-RECOVER-003` supersedes it. **Only that clause inverted**;
   the property it protected — never a retry on a terminal error — is now stated
   **directly** and proved across the whole vocabulary, plus a mutual-exclusion
   invariant the old form could not express. The superseded text is quoted in
   place.
2. **The notification boundary guard's discovery sweep** found four new files
   belonging to neither of its two module lists — *"which is precisely how a
   boundary guard is defeated without anybody editing it"*. Classified.
3. **Its state-sentence scan read 14 where it expected 10**, because the new
   `permissionFactValues` record legitimately reuses `granted` and `denied` for
   the **browser's** vocabulary. Renaming those keys was refused — they are the
   browser's own words, and picking worse names so a regex stops matching is
   shaping the product to a test. The predicate was **narrowed to the `states:`
   blocks**, with a planted control proving the narrowing can still fire.
4. **The no-gesture guard's discovery sweep** caught both new surfaces — the
   fourth time it has caught something that would otherwise have shipped
   unscanned.
5. **The push boundary guard reported this slice's own new guard as carrying
   four push artifacts.** It was right: the guard restated the forbidden API
   names in order to assert their absence. Its exemption list is **exactly two
   files** and says, in its own comment, that broadening it is how a guard stops
   guarding.

**The lesson from the fifth, which is §83's own lesson arriving from the other
side.** §83 recorded *an authority guard must forbid the act, not the word*, and
this slice then wrote a guard that forbade words. The duplication was deleted
rather than exempted: the repository-wide claim was already held by the push
boundary guard over an allowlist of three application files, and what is
asserted now is the **capability** — neither module touches `navigator` or
`window` — which no rename defeats and which names no forbidden token.

---

## 5. `2O-PRIVACY-001`, re-evaluated under ADR-119

**The owner decided**: no dedicated page for `product_events`; the privacy
centre states plainly that the data exists; the full export is the sufficient
view of it; and `product_events` is removed from neither the export nor the
census. Nothing about retention, telemetry or the schema changes.

**Slice 2O.5's record is untouched.** Its `partial` stands as the honest record
of what was true when it was written, and the promotion is recorded here.

The promotion is earned by a change in the tree, not by a change of mind. Slice
2O.5 shipped `surface: null` with the reasoning **in a comment**, and classified
the requirement `partial` for exactly that reason: nothing distinguished *"the
owner decided the export is the sufficient view"* from *"nobody has built the
page yet"*, and the second becomes the first by sitting there long enough.

ADR-119 makes it a decision, and `PrivacyCategory.noSurface` makes the decision
**machine-checked**: required when `surface` is null, forbidden otherwise,
guarded in both directions, with the reason and the governing ADR named. The
category keeps its name and its count, and `product_events` stays in the
enumeration and the export — asserted, because the export is what makes "no
page" acceptable and an export that dropped it would turn a considered decision
into a disappearance.

**`2O-PREF-002` was re-examined through this decision only, and is
unaffected.** Its remainder closed in slice 2O.5 when Ajustes reached the
account's own acceptance history; that is a different surface from this one, and
nothing here reopens it.

---

## 6. Evidence

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **8133 passed**, 0 failed; 3 failed FILES are the Windows shebang-parse baseline |
| `npm run build` | passes |
| CI Playwright command, desktop + mobile | **287 passed, 5 skipped** — unchanged from slice 2O.4 |
| `e2e/online-notifications-and-recovery.spec.ts`, desktop | **7 passed** |
| …mobile | **7 passed** |
| `npm run verify:online-residue` | **zero fixture residue** |
| Migrations | **94 local = 94 hosted, parity `202608140094`, zero created** |
| `npm run rollout:verify` | **25 pass · 3 fail · 2 owner-signature**, unchanged |

**One transient, recorded because it looked like a defect.**
`project-key-guard.test.ts` failed twice in the full suite and passed in every
subset. It was a mid-write read — the suite was scanning the tree while
`DECISIONS.md` and `enumeration.ts` were being written. Re-run against an
untouched tree it passes, which is the memory `local-guard-transient-after-edit`
arriving on schedule.

---

## 7. Mistakes, all mine, and what found each

1. **The error boundary lost its `<h1>`.** `UniversalStateView` renders its
   title as a `<p>`, and a full-page state with no heading leaves a
   screen-reader user nothing to navigate to. Found by an existing test.
   `titleAs` exists because of it.
2. **`AccountMenu` got a second live region** for a sentence it already
   announced — the same double-announcement defect slice 2O.2 shipped once.
   Found by an existing test. `announce` exists because of it.
3. **I converted `needs-attention-error`, and it is not a universal state.** It
   answers a **click**, which is action feedback and assertive for that reason,
   and it is the sibling of `retryError` on the line above. A component test
   caught the politeness change; the conversion was reverted and recorded as an
   exception rather than the test weakened.
4. **`relation-diagram.test.ts` asserted `querySelector("svg")` was null** and
   began failing against correct code, because the tone icon is an SVG. The
   property was never *"no SVG exists"* but *"no diagram is drawn"* — restated
   that way it is also **stronger**, since the old form would have passed on a
   `<canvas>` diagram.
5. **Two browser assertions were wrong about the environment, not the
   product.** A strict-mode violation on two headings that both begin
   *"Notificações"*, and a `boundingBox()` comparison against `.push-controls`
   — which **does not exist** where no sender key is configured, because `R-24`
   makes the component render an honest sentence instead of a control that
   cannot work. The ordering assertion is DOM order now, and works in both
   environments.
6. **A JSX comment as a ternary branch's first child**, twice. `{/* … */}`
   beside an element makes two children where one is allowed.

---

## 8. Carried, unabsorbed, with destinations

- **`2O-ACTIVATION-005` direction B's blind spot.** `renderedControlNames`
  extracts controls by `name="…"`, so a `<button>` without one is invisible to
  it. **The three affected controls, verified against the tree rather than
  quoted from §83:**

  | Control | File | Why it is invisible |
  |---|---|---|
  | Export the archive | `src/features/privacy/export-control.tsx:56` | `<button type="submit">`, no `name` |
  | Save the produced archive | `src/features/privacy/export-control.tsx:64` | `<button type="button">`, no `name` |
  | Sign out everywhere | `src/features/privacy/global-sign-out.tsx:28` | `<button type="submit">`, no `name` |

  **`OnboardingRestore` is NOT one of them**, contrary to a first reading of
  this record: its button carries `name="restoreOnboarding"` and the guard sees
  it. Three controls across **two** files, both added by slice 2O.5.

  → **slice 2O.7**, and the fix belongs in **the guard's predicate**. **Adding
  a `name` attribute purely so the guard can see a control is forbidden** —
  that is shaping product code to a test, and slice 2O.5 refused it for the
  same reason. A predicate that can only see named form fields is the thing
  that is wrong, not three buttons that legitimately have nothing to name.
- **`2O-NOTIFY-005`'s third bound has no object.** The product has no
  important-reminder override and the surface declares the absence. → **owner**,
  who may either accept the declaration as the delivery or scope an override as
  new work.
- **`2O-ONBOARD-003`** stays `partial`, untouched, outside this slice.
- **`viewport.themeColor`** still media-only → slice 2O.7.
- **`defaultAgentPreferences.tone`** still says `direct` against a column
  defaulting to `informal`.
- **`embedding_model`** untouched (ADR-117 Decision 4).
- Every Phase 2N residual `OD-2O-11` declined stays unclaimed; **push still
  fails with HTTP 403 on a real iPhone and has never been executed on
  Android**; ADR-055 neither satisfied nor superseded, expiring **2026-10-27**.
  **No retention sweep scheduled.**

**M1 stays live and conditional. M2 stays without a destination and
unspendable. A13 is not retargeted. Signup stays closed. The CSP is
unchanged.**
