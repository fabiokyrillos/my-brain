# Phase 2P — slice 2P.8 acceptance record

**Baseline `main` `f52755c`** — the 2P.7 handoff merge (§102). Clean, zero open
PRs, **99 local = 99 hosted, parity `202608190099`**, read live before anything
was edited. **72 of 87.** Both migration allocations spent; a third is a stop
condition. Signup closed; rollout 25 pass · 3 fail · 2 owner-signature. No
automation enabled.

This slice closes the phase's constructible scope: the fifteen `2P-MOBILE`,
`2P-ACCESS` and `2P-CLOSE` requirements, the traceability generator
`2P-CLOSE-001` requires, and two remainders the owner signed. It ends at an
owner checkpoint rather than at a closed phase, because two of its requirements
cannot be discharged by any agent.

**Zero migrations.**

---

## 1. The four decisions the owner signed, recorded before anything was built

All four are appended as amendments to ADR-122 dated 2026-08-20, and the prior
text of every artifact they touch is preserved.

| Decision | What it settles |
|---|---|
| `2P-ACCESS-003` | The requirement represents the navigation the product actually uses: semantic links, `aria-current="page"`, visible focus, keyboard/Enter/back/forward, and the new document announced. **Not** ARIA tabs, **not** a roving `tabindex`, and **the five prior decisions are not reversed.** `baseline` only after every relevant surface is proved. |
| `2P-CALENDAR-MONTH-TELEMETRY` | **Refused**: no third migration and no vocabulary widening. The month stays without an event; `calendar_viewed` stays valid for its three deployed orientations; **the absence of an event is not a broken event**, and the contract's refusal 9 must not fire on it. Recorded as an explicitly unfunded remainder. |
| `2P-REMINDER-REVALIDATE-HANG` | **Authorized to repair inside this slice, without a migration** — after reproducing against the current `main` and telling five candidate causes apart. |
| The count | **72 of 87** before this slice. Slice 2P.5 counted `2P-CHAT-004`'s remainder as a requirement it already was. Historical records preserved; the arithmetic corrected forward. **No eighty-eighth requirement**, and the generator must find exactly 87. |

---

## 2. `2P-REMINDER-REVALIDATE-HANG` — reproduced, and the recorded finding was wrong

The owner's authorization required reproducing before editing. Doing so is what
stopped a repair being written for a defect that is not there, and it corrected
a statement this repository had been carrying since §101.

### What was recorded, and what is actually true

| Claim, as recorded in §101 and the PRD | Re-measured on `f52755c` |
|---|---|
| *"`applyReminderCommand` still revalidates a resolved path, so **no action on this page has ever actually re-rendered it**"* | **False.** Every lifecycle action re-renders the list in place. |
| The creation dialog freezes intermittently | **Did not reproduce.** 12 of 12 consecutive creations, ~14.5 s each, desktop. |
| The same on a phone | Did not reproduce — the Pixel 7 lifecycle journey is green. |

### How the first line was settled, since a passing test is not proof

The new assertion passed on the first run, which is exactly when a probe is
least trustworthy. So the revalidation was **deleted**, the app **rebuilt**, the
server **stopped and restarted**, and the journey re-run: it failed at the
in-place assertion and nowhere else. Restoring the line made it pass again.

*The server survived the task stop and had to be killed by PID — the old build
would otherwise have served the "mutated" run, and both runs would have agreed
for the wrong reason.*

### Why the earlier reading was reasonable and still wrong

`revalidatePath` accepts a **literal resolved segment** as well as a route
pattern. Slice 2P.4 measured a resolved path doing nothing on `/app/settings`
and generalised it to "resolved paths do not work under `[locale]`". The
narrower and true statement is that a resolved path revalidates **the URL it
names**: `/pt-BR/app/reminders` *is* the rendered URL, so it works;
`/pt-BR/app/settings` was **not** the rendered route at the time, because that
surface lives under a second dynamic `[section]` segment. What a resolved path
genuinely cannot reach is the *other* locale's copy.

### The five causes, told apart

`e2e/online-reminders.spec.ts` now separates them on every run, because "the
interface did not update" had five candidate explanations and picking the likely
one is what produced the wrong record:

| # | Claim | How it is settled |
|---|---|---|
| 1 | the Server Action answered | the page outcome region carries its sentence |
| 2 | `pending` ended | the control that was disabled is enabled again |
| 3 | the write happened | a later reload shows the value read in place |
| 4 | the transition is not stuck | 1 and 2 hold, and no dialog is involved |
| 5 | the list re-rendered | the row changes with **no reload between** |

Both row fates are covered — snooze keeps the row (in-place update), cancel
removes it (in-place removal), restore is cancel's undo — because a fix that
handled only one would pass a test that only covered one.

### What was **not** changed, and why that is the finding

The mechanism is left exactly as slice 2P.7 shipped it. Making `createReminder`
use the resolved-path call would be the tempting consistency edit, and it would
put the re-render back inside the transition that governs the dialog — the one
thing §101's ten-run measurement says not to do. **A defect that does not
reproduce is not repaired by rewriting the code that avoids it.**

The false sentence in `actions.ts` **was** corrected, forward, with the
measurement beside it. A wrong statement in a docstring that other slices read
as a standing caution is worth fixing even when the behaviour is right.

### Two properties that had no proof at the surface, now proved

- **A replay writes once.** Two views of the same list derive the *same*
  content-derived operation key, so the second submit is an idempotent replay:
  the RPC returns the first operation's result and the row carries one snooze.
  Decided at microsecond precision from the pre-state input, because two calls
  seconds apart render the same minute.
- **A diverging stale write is refused in words.** A second view attempting a
  *different* action on a stale pre-state gets
  *"O lembrete mudou enquanto esta página estava aberta"* with the error class,
  `pending` still ends, and the reminder is still scheduled afterwards.

*The first version of that test expected a refusal for the replay case and got a
success. The RPC was right and the test's premise was wrong — same key means
same logical operation, and refusing it would have been the duplicate-write bug.*

---

## 3. `2P-CLOSE-001` — the generator, and the shape Phase 2P actually wrote

`scripts/generate-phase-2p-traceability.mjs` reads the PRD and the acceptance
records, applies the traceability contract's twelve refusals, and writes the
matrix or refuses entirely. It never writes a partial matrix.

### The structural difference from every earlier phase, measured

Phases 2C … 2O wrote records that each carried a classification section, so
their generators could refuse one that stated none. **Phase 2P's records were
not written that way.** Of the **eight that preceded this one**, exactly three
carry a section this generator recognises:

| Record | Section | Classifies |
|---|---|---:|
| `SLICE_04` | `### Requirement classification` | 10 |
| `SLICE_05` | `## 12. Requirement classification` | 8 (+1 remainder) |
| `SLICE_07` | `## 5. What each requirement is` | 10 |

That is **28**. The remaining **59** are classified here, and 28 + 59 = 87.

Refusing the six prose records was rejected: it would make the generator
unusable, and retrofitting sections into them would edit records the owner has
instructed be preserved as written. The rule is inverted instead — a record
without a section contributes nothing, and `2P-CLOSE-001` is enforced where it
bites: **every declared requirement classified exactly once**. It still fails
closed. A misspelled heading in *this* record drops 59 classifications and the
run refuses.

### Two misreads it is built to avoid, both already paid for here

- **A re-audit table is not a classification.** `SLICE_03` §1 tabulates what was
  true *before* the slice — `partial`, `baseline` — and a naive scan reads those
  as outcomes, producing a matrix that describes the tree that was replaced.
  Only rows under a recognised heading are read.
- **An evidence cell cites other requirements.** The subject of a row is its
  **first cell** and the class is its **second**, both positional.

### It found three real defects on its first run

`2P-AUTONOMY-005`, `-006` and `-007` are `not-built-by-rule` and their evidence
cells name no signed authority — *"the rule is recorded in the contract"* names
nothing checkable. **The guard was not weakened to let them pass**, and slice
2P.4's record was not edited. This record re-states those three with ADR-123
cited, which is agreement rather than conflict, so the matrix still classifies
each exactly once.

### Refusal 9 and the month

Implemented in the direction that can actually be wrong: a literal the **client**
emits and the **deployed** validator refuses is accepted by the caller, rejected
by the database, and lost in silence. The generator reads both lists — the enum
out of `202608110090` and `calendarOrientations` out of `contracts.ts` — and
refuses on divergence. The month is absent from **both**, which is what makes it
the signed remainder rather than a broken event. It also refuses if the deployed
enum ever gains `month`, because that is the third migration.

---

## 4. `2P-MOBILE-001` — an iPhone lane, and it is a real engine

`playwright.config.ts` gains a third project, `iphone-emulated`. It is **not**
Chromium wearing an iPhone user agent: `devices["iPhone 15"]` carries
`defaultBrowserType: "webkit"`, so the lane runs Playwright's WebKit at an
iPhone 15's viewport and device-pixel-ratio — the same engine family Safari
renders with, and the one thing the `Pixel 7` project structurally cannot cover
because it is Chromium too.

**It earned the choice immediately: two of the three probe defects below appeared
only on WebKit.**

**What it still cannot prove**, and `2P-MOBILE-005` and `2P-ACCESS-005` keep
reserved for the owner: an actual device, iOS Safari itself (Playwright's WebKit
is a patched build), the software keyboard, the installed PWA shell, and
VoiceOver. **Engine coverage is not hardware coverage**, the project is named
`iphone-emulated` so a report skimmed later inherits the word, and nothing in
this record may be read as a device claim.

**CI does not select it.** `.github/workflows/ci.yml` installs `chromium` only,
and adding a WebKit install plus a third journey lane to the gate is a change to
the CI contract this slice was not authorized to make. The lane has the same
standing as every `online-*.spec.ts` lane: run locally, recorded per slice.

---

## 5. `2P-ACCESS` — one real product defect, and three probes that were wrong

### The defect: the composer had no live region at all

`2P-ACCESS-001` asks the composer to **announce** recording, transcription,
upload and send states. Every announcing element on that surface was rendered
conditionally: the attachment result arrived *with* its `role="status"` already
populated. **A live region created in the same commit as its content is
frequently not announced**, because there was no region for a screen reader to
have been observing. Measured: the idle composer carried no live region of any
kind, so the requirement was true of the visible text and false of the audible
one.

The reminders page already had this right — *"a live region has to exist before
its text arrives"* — and the fix is that same shape: one persistent `sr-only`
polite region, empty when idle, carrying send and upload state. `role="alert"`
is deliberately left where it is (an alert **is** announced on insertion, which
is why errors use it), and the visible success echo lost its `role="status"` so
nothing is read out twice.

`composer-copy.ts` gains `attachmentSending` in both locales, through the typed
copy module rather than a locale ternary.

### The three probe defects, each verified in the sources before anything moved

| Probe said | What it actually was |
|---|---|
| the reminders page interrupts with `aria-live="assertive"` | **Next's own route announcer** — `ariaLive = 'assertive'` in `app-router-announcer.js`; `grep -rn 'aria-live="assertive"' src` returns nothing. Announcing a navigation the reader just initiated is the correct use of assertive. |
| the attachment input has no accessible name | It is named by a wrapping `<label … aria-label>` whose visible content is an `aria-hidden` icon. **A partial name computation does not under-report — it accuses working code.** |
| back returned a document with the same title | `/app/settings` **renders** Geral rather than redirecting, deliberately, so a redirect cannot trap the back button (`2P-SETTINGS-002`). The two URLs legitimately share a title, and `page.title()` was racing WebKit's update besides. |

Each fix narrowed the probe rather than the product: the announcer is excluded
by ancestry with a control proving the exclusion removed something; the name
computation now reads any label that references the control, including its
`aria-label`; and the navigation is asserted by **where `aria-current` moved**,
which is what the requirement is actually about.

### `2P-ACCESS-003`, proved on all five surfaces

The owner's signed interpretation, executed. Every one of `work-modes`,
`brain-lenses`, `relation-view-controls`, `settings-section-nav` and
`data-ai-tabs` is asserted to be a named `<nav>` landmark, to expose exactly one
`aria-current="page"`, to navigate by real `a[href]` links, and to carry **no**
`tablist`/`tab`/`tabpanel` role and **no** roving `tabindex`. Keyboard focus,
Enter, back and forward are proved separately, with a computed-style check that
the focus indicator is actually painted.

*The selectors come from what each component **emits**, not from its filename —
`relation-view-controls.tsx` emits `.relations-tabs` and
`settings-section-nav.tsx` emits `.settings-nav`. A locator that matches nothing
passes every absence assertion in the file.*

---

## 6. `2P-CHAT-007-JOURNEY` — advanced, and the authorization is unspendable

The owner authorized exactly one real answered turn. **The credential to spend it
with does not exist in this environment.** `BYOK_TEST_USER_A_OPENAI_API_KEY` is
absent from `.env.local` and there is no platform `OPENAI_API_KEY` either —
established by listing variable **names** only; no value was read, printed or
persisted. The authorization is therefore **unspent because it is unspendable**,
not because it was declined.

This is corroborated rather than asserted: the repository's existing
answered-turn journey — `online-assistant-composer.spec.ts`, *"a question still
reaches its grounded answer through the fallthrough"* — **skips itself** for the
same missing credential, and has been doing so.

What `e2e/online-phase-2p-conversation.spec.ts` does prove, on desktop and
Pixel 7, through the product with nothing stubbed:

- a new conversation is reachable and its composer is ready to type into;
- a refused turn is **specific** — the gate's own sentence, not a generic
  boundary — and leaks no key material, model id, SQLSTATE or stack frame;
- recovery reaches the credential section, which renders no key material;
- the round-trip fabricates no subject, including for an id that is not the
  owner's.

**No correlation reference is asserted, and that is correct.** The composer parses
a command first and falls through to the knowledge answer; a credential-less
account is stopped at the BYOK gate *before* that fallthrough, so there is no
chat failure to correlate. Demanding one would have been demanding a reference
for an error that never occurred. The reference half of `2P-CHAT-003` stays
proved below the browser, where slice 2P.2 proved it.

---

## 7. Requirement classification

| Requirement | Class | Evidence |
|---|---|---|
| `2P-FOUNDATION-001` | **built** | slice 2P.0 §2 reproduced the Conversation failure against the production path and classified its failing boundary; `error_events` has no free-text column, so the classification cannot leak content |
| `2P-FOUNDATION-002` | **built** | slice 2P.0 §3 measured capture → interpretation → confirmation → removal against `main` and recorded every persisted transition |
| `2P-FOUNDATION-003` | **built** | slice 2P.0 §4 re-audited `codex/fix-needs-attention-confirmation` and it was rejected by ADR-122 Decision 4; not applied, not copied forward |
| `2P-FOUNDATION-004` | **built** | slice 2P.0 §5 censused every capture surface; one write path, one draft store, held by `capture-write-path-guard.test.ts` |
| `2P-FOUNDATION-005` | **built** | slice 2P.0 §6 established content-free telemetry for failure class, queue reason, automation decision and undo outcome, with no migration |
| `2P-FOUNDATION-006` | **built** | slice 2P.0 §7 recorded the mobile, touch-target, screen-reader and stylesheet residuals as residuals; ADR-122 Decision 7 keeps them unabsorbed |
| `2P-FOUNDATION-007` | **built** | every slice re-audited its subject against the previous `main` before editing — §97, §99, §102 and §1 of this record |
| `2P-ATTENTION-001` | **built** | slice 2P.1's central re-derivation contract; a confirmed interpretation with nothing open leaves the queue atomically |
| `2P-ATTENTION-002` | **built** | the lifecycle is re-derived rather than overridden, across all twelve resolution functions including the superseded ones |
| `2P-ATTENTION-003` | **built** | the projection returns the same answer on repeated reads; no stale projection or cached navigation can resurrect a completed entry |
| `2P-ATTENTION-004` | **built** | the entry page states what remains unresolved; proved authenticated by `online-entry-outcomes.spec.ts` over all four families |
| `2P-ATTENTION-005` | **built** | the terminal state says everything is resolved and offers the route back; same journey |
| `2P-ATTENTION-006` | **built** | idempotency enforced in the RPC under `for update`, replay proved hosted, and CI's three concurrency proofs run the chain |
| `2P-ATTENTION-007` | **built** | undo restores the truthful prior state through the `undo_operation` registry; it re-derives rather than fabricating an unresolved decision |
| `2P-ATTENTION-008` | partial | removal, replay and another-owner isolation proved hosted; **remainder: refresh and back navigation are proved only at the data layer, and the confirmation panel has never been rendered in an authenticated browser** (slice 2P.1 §8). Destination: the owner, at the roadmap successor's re-audit |
| `2P-CHAT-001` | **built** | slice 2P.2 §2 fixed the production failure at its root cause — which was not the provider path — and proved it through the real conversation action |
| `2P-CHAT-002` | **built** | `diagnostics.ts` closes five classes over the sink's reasons, 13 tests including a leak test; the credential class is now also proved in a browser |
| `2P-CHAT-003` | **built** | no known failure surfaces only as a generic boundary; the gate's own sentence is proved rendered on desktop and Pixel 7 in this slice |
| `2P-CHAT-004` | **built** | Conversas leads the Brain lenses and is a mobile destination; `2P-CHAT-004-MOBILE` closed in slice 2P.5 with five slots and the account in the header |
| `2P-CHAT-005` | **built** | `ask-about` mounts on four entity workspaces, seeds the question and carries the way back; owner scope proved — an id that is not the owner's fabricates no banner |
| `2P-CHAT-006` | **built** | suggestions are deterministic and resolved at render time by an RLS-scoped read; no model call renders a page |
| `2P-CHAT-007` | partial | new conversation, failure, recovery and the unpopulated round-trip proved in an authenticated browser on desktop and Pixel 7. **Remainder `2P-CHAT-007-JOURNEY`, narrowed to one real answered turn: no AI credential exists in this environment, so the owner's authorization is unspendable rather than declined.** Destination: the owner, when a credential is provisioned |
| `2P-CAPTURE-001` | **built** | Today and Capture mount the one `composer.tsx`, which replaced three surfaces |
| `2P-CAPTURE-002` | **built** | text is ready on arrival; the three-tab `role="tablist"` with its `Escrever` tab is gone |
| `2P-CAPTURE-003` | **built** | the attachment action sits at the left and keeps the existing attachment write path |
| `2P-CAPTURE-004` | **built** | the microphone sits beside send and never replaces or clears typed text |
| `2P-CAPTURE-005` | **built** | drag, drop and paste share the validation file selection uses, with a stated fallback where the browser exposes neither |
| `2P-CAPTURE-006` | baseline | `VoiceComposer` already inserted the transcript into an editable draft; slice 2P.3 removed the second textarea so the boundary is the composer's own |
| `2P-CAPTURE-007` | baseline | edit, type more, record again and discard were already available on the same component |
| `2P-CAPTURE-008` | baseline | only explicit send creates an entry, held by `capture-write-path-guard.test.ts` |
| `2P-CAPTURE-009` | baseline | audio is memory-only and discarded four ways, held by `no-durable-audio-guard.test.ts` |
| `2P-CAPTURE-010` | baseline | `composer-draft.ts` stores text only — no idempotency key, no audio, no bytes, no replay authority — with one consumer |
| `2P-PERSON-001` | **built** | slice 2P.6 §3: the associated company is edited directly in the person's main section with one explicit action, and each role is edited in the context of the relationship carrying it — the owner's correction of 2026-08-19, executable rather than only recorded |
| `2P-PERSON-002` | **built** | selecting an existing company and creating a new one are one flow, not two dialogs |
| `2P-PERSON-003` | **built** | a created-but-not-linked company is reported distinctly and the surface does not invite a duplicate retry |
| `2P-PERSON-004` | **built** | no nested dialog; the keyboard journey and the mobile lane both complete the flow with focus preserved |
| `2P-MEMORY-001` | **built** | slice 2P.6 §4: "Nova memória" opens a dialog with a real multiline field; the inline one-line form is gone |
| `2P-MEMORY-002` | **built** | the flow explains what makes a memory durable and asks for validity or source only when relevant |
| `2P-MEMORY-003` | **built** | the content is reviewed before saving and undo is offered after creation |
| `2P-MEMORY-004` | **built** | owner scope, lifecycle and retrieval semantics unchanged — the composer writes through the existing action, adding no second path |
| `2P-RELATION-001` | **built** | slice 2P.6 §5: Relações opens on Desenho with Todos os vínculos as the second destination |
| `2P-RELATION-002` | **built** | the text view carries every fact the drawing carries and is independently usable; the surface says so in its own words |
| `2P-RELATION-003` | **built** | focus on a person and open an explainable link, with no inferred fact persisted — `2N-RELATION-TRIGGER` stands untouched |
| `2P-RELATION-004` | **built** | the phone receives the bounded readable representation; re-proved on the WebKit iPhone lane in this slice |
| `2P-AUTONOMY-005` | not-built-by-rule | no automatic writer exists and none may be authorized: ADR-123 Decision 3 begins fail-closed and enumerates the set. Slice 2P.4's row named no checkable authority, and this row supplies it rather than weakening the guard |
| `2P-AUTONOMY-006` | not-built-by-rule | same rule, ADR-123 Decision 3, and additionally blocked by slice 2P.1's decision (ii) on identity resolution |
| `2P-AUTONOMY-007` | not-built-by-rule | same rule, ADR-123 Decision 3: absence of an automatic writer means a memory cannot be created from an event |
| `2P-MOBILE-001` | **built** | `playwright.config.ts` gains `iphone-emulated`, a **WebKit** engine at an iPhone 15's viewport and DPR; composer, dialogs, settings navigation, graph alternative and calendar all render with no sideways overflow, and the dialog traps and releases focus |
| `2P-MOBILE-002` | partial | the primary action and the field being typed into survive a viewport shrink to 55% with the typed value intact, on three lanes. **Remainder: a real software keyboard and a real IME are not scriptable and were not exercised.** Destination: the owner's device checkpoint below |
| `2P-MOBILE-003` | **built** | every target this phase added measures at least 44×44 on desktop, Pixel 7 and the WebKit iPhone, scoped to this phase's surfaces so the four inherited exceptions are neither re-reported nor absorbed |
| `2P-MOBILE-004` | **built** | 320 CSS px and an emulated 200% zoom over the five surfaces: no sideways scroll, one `h1`, and the primary action still reachable |
| `2P-MOBILE-005` | **built** | the discipline held and is now executable: every record from 2P.0 marks hardware NOT EXECUTED, and the generator **refuses** any record claiming hardware or VoiceOver evidence without disclaiming it in place |
| `2P-ACCESS-001` | **built** | every composer control resolves an accessible name, including through a wrapping `aria-label` label; and the missing persistent live region was found and shipped — the composer announces send and upload state without announcing anything twice |
| `2P-ACCESS-002` | baseline | `ConfirmDialog`'s contract with four consumers, unit proofs, and slice 2P.7's authenticated journey over initial focus, a twelve-press Tab cycle, Escape and focus restored to the launcher; re-proved on the iPhone lane here |
| `2P-ACCESS-003` | baseline | the owner's signed interpretation, proved on **all five** surfaces and on three lanes: named `<nav>`, exactly one `aria-current="page"`, real links, no ARIA tab role, no roving `tabindex`, painted focus, and Enter / back / forward moving `aria-current` |
| `2P-ACCESS-004` | **built** | no region this product renders is `aria-live="assertive"`; measured with the framework's own route announcer excluded by ancestry and a control proving the exclusion removed something rather than matching nothing |
| `2P-ACCESS-005` | undelivered | a real VoiceOver session over capture, review, settings and reminders. **Remainder: it cannot be discharged by any agent** — ADR-122 Decision 6 makes it the closeout gate. Destination: the owner's checkpoint below, and Phase 2P does not close until it is run |
| `2P-CLOSE-001` | **built** | `scripts/generate-phase-2p-traceability.mjs` classifies all 87 exactly once, applies the twelve refusals, offers `--check`, and refuses a stale matrix byte for byte |
| `2P-CLOSE-002` | **built** | every `partial` and `undelivered` above names a concrete remainder and a destination, and the generator refuses one that does not — including a row that tries to satisfy the check by containing its own identifier |
| `2P-CLOSE-003` | **built** | §8 dispositions automatic writes, undo, audio lifetime, file handling and conversation diagnostics against the threat model |
| `2P-CLOSE-004` | **built** | §9 reads parity, residue, rollout and signup **live at closeout**, with a two-sided residue control and an orphan sweep |
| `2P-CLOSE-005` | **built** | §10 re-audits the roadmap successor without starting or planning it; the A13 guard still pins it and no successor artifact or requirement exists |

**87 declared · 87 classified · 0 unclassified.**

---

## 8. `2P-CLOSE-003` — security disposition

| Concern | Disposition |
|---|---|
| **Automatic writes** | None exist and none may be authorized. All six categories are `suggest_only`; the hosted policy table holds **zero** rows in any other state, read live. `agent_preferences.autonomy_level` authorizes no write. Fail-closed on absent policy, absent calibration, and unknown policy alike. |
| **Undo** | Every reversible automatic action has a registered handler in `private.undo_operation_handlers`; slice 2P.1's re-derivation registers a true undo rather than forcing a terminal status. The reminder lifecycle's undo — restore after cancel — is proved through the surface in this slice, in place and without a reload. |
| **Audio lifetime** | Memory-only, discarded on success, cancel, failure and unmount; held by `no-durable-audio-guard.test.ts`. `composer-draft.ts` stores text only — no bytes, no idempotency key, no replay authority. **No audio is persisted, and this slice adds none.** |
| **File handling** | The attachment write path is unchanged by this slice. Validation is shared between selection, drag, drop and paste, so no route into the pipeline is less checked than another. The file input is reachable and named; nothing about its authority moved. |
| **Conversation diagnostics** | `T-11` re-proved at the browser boundary: a refused turn renders no key material, no model identifier, no SQLSTATE and no stack frame. `error_events` has no free-text column, so the sink cannot carry content even if a caller tried. The refusal names the provider the owner must configure, which is the product instructing rather than an exception escaping. |
| **Owner scope / RLS** | Untouched. No grant, policy, retention rule or authority changed in this slice — zero migrations, and the only product-code changes are one live region, its copy, and a corrected docstring. Owner isolation re-proved: a subject id that is not the owner's fabricates no banner, and a foreign reminder is still refused. |
| **Provenance and masking** | Unchanged. No new surface renders a task title, a memory body or a person's name, so nothing inherits a sensitivity contract it does not honour. |

**Threats carried forward untouched**, per ADR-122 Decision 7: push HTTP 403 and
Android, retention scheduling, SMTP, the restore drill, the legal and monitoring
signatures, the four touch-target exceptions, `2N-FILES-WRITER`,
`2N-IDENTITY-EXTRACTION` and `2N-RELATION-TRIGGER`.

### All twenty threats, dispositioned at closeout

`2P-CLOSE-003` names five concerns; the threat model names twenty. Every one is
answered, and **"not reached" is used only where this slice genuinely touched
nothing** — it is a statement about scope, not a way of avoiding the question.

| Threat | Disposition |
|---|---|
| `T-1` second entry writer | **held.** `capture-write-path-guard.test.ts` passes; the direct-write allowlist still holds exactly one entry. This slice added no write path |
| `T-2` transcript submitted before review | **held.** Explicit send remains the only entry mutation; the composer change is a live region, not a control |
| `T-3` audio survives success, error or navigation | **held.** `no-durable-audio-guard.test.ts` passes; memory-only, four discard paths, no storage or schema route |
| `T-4` restored draft replays an old authority | **held.** `composer-draft.ts` stores text only — no key, no bytes, no authority |
| `T-5` raw confidence authorizes a wrong mutation | **held by construction.** No automatic writer exists; all six categories `suggest_only`, read live |
| `T-6` automation creates duplicate people | **held by the same fact.** No automatic writer; `2P-AUTONOMY-006` is `not-built-by-rule` under ADR-123 Decision 3 |
| `T-7` co-mention becomes a relationship fact | **held.** `2N-RELATION-TRIGGER` stands and was not touched; `2P-AUTONOMY-008` remains `not-built-by-rule` |
| `T-8` automatic write cannot be explained or undone | **held.** The registry requires a handler before an operation may be recorded; the reminder undo is proved through the surface here |
| `T-9` confirmation replay duplicates materialization | **held, and re-proved this slice at the surface.** A content-derived operation key makes a second submit an idempotent replay: one write, verified at microsecond precision |
| `T-10` queue removal hides an unresolved question | **held.** Slice 2P.1's terminal predicate derives from every unresolved class; not re-opened here |
| `T-11` conversation error exposes provider or user content | **re-proved at the browser boundary.** A refused turn renders no key material, model id, SQLSTATE or stack frame; `error_events` has no free-text column |
| `T-12` chat navigation promotes a broken route | **held.** The route was repaired before promotion in slice 2P.2; this slice renders it authenticated and it works |
| `T-13` attachment affordance bypasses validation | **held.** The upload action and schema are unchanged; selection, drag, drop and paste share one validation |
| `T-14` settings tabs duplicate or reset writes | **held.** No settings writer changed; section ownership and preservation tests pass |
| `T-15` moving notification controls disconnects consumers | **held.** No route or consumer moved in this slice |
| `T-16` nested modals lose focus or submit twice | **re-proved.** The reminder dialog traps and releases focus on all three lanes including WebKit; the pending lock holds and the replay case proves no double write |
| `T-17` graph reveals inferred or masked data | **held.** The Relations text alternative is re-proved rendering on the iPhone lane; no inferred fact is persisted or drawn |
| `T-18` calendar/modal loses timezone context | **held.** Slice 2P.7 moved the writer precisely to fix this; nothing here changed a date boundary |
| `T-19` tests claim real-device accessibility | **held, and now executable.** Every record marks hardware NOT EXECUTED, and the generator **refuses** a record claiming hardware or VoiceOver evidence without disclaiming it. The new lane is named `iphone-emulated` for the same reason |
| `T-20` implementation absorbs rollout/push residuals | **held.** §11 carries every inherited residual forward by name; rollout and signup read live and unchanged; push HTTP 403 not resumed |

---

## 9. `2P-CLOSE-004` — read live at closeout

| Fact | Reading | How |
|---|---|---|
| migrations | **99 local = 99 hosted** | `supabase_migrations.schema_migrations`, queried at closeout |
| parity | **`202608190099`** | same query, unchanged from the baseline |
| migration budget | 2 allocated, **2 spent**, a third is a stop condition | pinned **by name** in the generator, which refuses any other set |
| fixture residue | **zero**, with a two-sided control | `email like 'codex-%'` → 0, while the same query shape under `email like '%@%'` → 2, so the zero is an absence rather than a broken probe |
| orphans | **zero** across reminders, conversations, `error_events` and entries | every remaining row belongs to a live account, so nothing outlived a deleted fixture |
| rollout | **25 pass · 3 fail · 2 owner-signature** | `scripts/verify-signup-rollout.mjs`, executed at closeout; the three failures are `RG-QUO-3`, `RG-DEP-1` and `RG-DEP-3`, all inherited |
| signup | **closed** | the same run's hosted readbacks: `mailer_autoconfirm` false, CAPTCHA enabled and provider-enforced, throttle present, allow list non-empty, password policy at or above the minimum |
| automation | **nothing enabled** | all six categories `suggest_only`, hosted |

---

## 10. `2P-CLOSE-005` — the roadmap successor, re-audited and not started

Re-audited and **not started, not planned, and not named**:

- no governing artifact for it exists under `docs/initiatives/` or
  `docs/reports/`;
- no requirement is declared for it in any PRD;
- no migration, feature file or library file carries its marker;
- the A13 guard still targets it and was not retargeted by this slice;
- this record deliberately does not name it, and the generator's refusal 12
  fails if any of the above changes.

What it inherits is the remainder list in §11 — routed, not absorbed, and not
planned here.

---

## 11. Open, and not closed by this record

**Two requirements cannot be discharged by any agent** and are the phase's
closing gate: `2P-ACCESS-005` (a real VoiceOver session) and the hardware half of
`2P-MOBILE-001`/`-005`. `2P-MOBILE-002`'s software-keyboard and IME half joins
them.

**Remainders open and unabsorbed**, every one carried forward rather than
quietly closed:

| Remainder | State |
|---|---|
| real iPhone hardware | owner-run; the emulated lane is WebKit at an iPhone viewport and is **not** a device |
| a real VoiceOver session | owner-run; ADR-122 Decision 6's closeout gate |
| `RG-DEP-3` | INCOMPLETE; re-run at closeout and reports the same blockers |
| the four missing review flows | `2P-AUTONOMY-FLOW-PROJECT`, `-ORGANIZATION`, `-MEMORY`, `-RELATION` — no producer exists because the product has no review flow |
| `2P-APPEARANCE-HYDRATION` | inherited, untouched |
| the remaining `revalidatePath` call sites | **the caution is now narrower and more accurate**: a resolved path works when it names the rendered URL, and the freeze §101 measured belongs to the route-pattern form on a route with a dialog. Repairing one can still turn a dead call into a live freeze |
| the first-action warm-up | observed again in this slice's runs; not diagnosed to root cause and not claimed as fixed |
| `2P-REMINDER-RECURRENCE` | no column exists; the owner corrected the requirement rather than inventing one |
| `2P-CALENDAR-MONTH-TELEMETRY` | **signed by the owner as an explicitly unfunded remainder**; refusal 9 must not fire on it |
| `2P-REMINDER-REVALIDATE-HANG` | **signed, reproduced, and did not reproduce.** The properties are now pinned by tests; the recorded claim it rested on was false and is corrected forward |
| `2P-ATTENTION-008`'s browser half | refresh and back navigation still proved only at the data layer |
| `2P-CHAT-007-JOURNEY` | narrowed to one real answered turn; **unspendable, not declined** |

**Not claimed by this slice:** anything on real hardware; any screen-reader run;
any automation — all six categories remain `suggest_only`; any migration; any
change to signup, rollout, grants, RLS, retention or authority. Push HTTP 403 was
not resumed.

---

## 12. Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | see the PR record — zero errors in this slice's files |
| `npm test` | see the PR record |
| `npm run build` | passes |
| `scripts/generate-phase-2p-traceability.mjs --check` | matches its sources, 87 classified |
| `e2e/online-phase-2p-closeout.spec.ts` | **12 × 3 lanes = 36 passing** (desktop, Pixel 7, WebKit iPhone) |
| `e2e/online-phase-2p-conversation.spec.ts` | **4 × 2 lanes = 8 passing** |
| `e2e/online-reminders.spec.ts` | the two new lifecycle proofs pass on desktop and Pixel 7 |
| creation stress | 12 of 12 consecutive creations, ~14.5 s each, against a rebuilt `next start` |
| mutation control | removing the revalidation makes the in-place assertion fail and nothing else |
| migrations | **zero**; 99 local = 99 hosted, parity `202608190099` |
| hosted residue | zero, two-sided control, zero orphans |
| rollout / signup | 25 · 3 · 2, closed — unchanged |

Every browser proof ran against `next start` on a **rebuilt** artifact, with the
server stopped and restarted after each rebuild — and the stop was **verified by
port**, because the first attempt left the old build serving.

---

## 13. Where this stops

`CHECKPOINT DO DONO — IPHONE REAL E VOICEOVER NECESSÁRIOS`

Everything that does not require a device is delivered. **Phase 2P does not
close here**, and the roadmap successor is neither started nor planned. The
owner's procedure is `PHASE_2P_OWNER_DEVICE_CHECKLIST.md`, in this directory.
