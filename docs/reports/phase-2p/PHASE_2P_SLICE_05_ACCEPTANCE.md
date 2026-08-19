# Phase 2P — Slice 2P.5 acceptance: Settings becomes eight sections, Notificações becomes history, and the mobile bar gets its fifth slot

**Requirements:** `2P-SETTINGS-001` … `-008`, and the remainder
`2P-CHAT-004-MOBILE` opened by slice 2P.2.

**Baseline:** `main` `0296e2a3f07457a5580e0fa6f4b0c27c224fb49a`. **Zero
migrations** — 99 local = 99 hosted, parity `202608190099`, read live and
unchanged by this slice. Both Phase 2P migrations remain spent; a third remains
a stop condition. Signup closed; rollout 25 pass · 3 fail · 2 owner-signature.

**The contract this record answers is
[`PHASE_2P_SLICE_05_CONTRACT.md`](PHASE_2P_SLICE_05_CONTRACT.md)**, written
before any code was edited.

---

## 1. The owner's signature, recorded before the numbers were used

ADR-123 Decision 5 required the slice that proposed a calibration contract to
*"stop at the owner's checkpoint before the first category is enabled"*. Slice
2P.4 proposed one and stopped. The owner signed it, and three amendments to
ADR-123 record that **before** any code read the values as definitive.

**No number moved.** `CALIBRATION_THRESHOLDS` already carried 50/0.90 ·
80/0.97 · 60/0.95 · 60/0.95 · 80/0.97 · 100/0.98 and `CALIBRATION_FRESHNESS`
already carried 10 reviewed in 90 days, newest within 30, undo-block over 20.
What changed is that the module stopped calling them a **proposal** and the
surface stopped hedging — and says in the same sentence that signing a minimum
enabled nothing.

The four categories with **no producer** are recorded as four named remainders —
`2P-AUTONOMY-FLOW-PROJECT`, `-ORGANIZATION`, `-MEMORY`, `-RELATION` — rather
than as calibration that time will complete. The surface says *"esperar não muda
isso"* in as many words, because a zero beside the other five reads as *not
enough yet*, which is a promise nothing in the product can keep for them.

---

## 2. The re-audit moved four decisions, and one of them was the slice

| # | Carried in | Measured against `0296e2a` |
|---|---|---|
| 1 | thresholds to sign | already in the code, already correct — prose, not numbers |
| 2 | `2P-SETTINGS-007` is 2P.5's | confirmed; `automation-actions.ts` named this slice in a comment |
| 3 | the automation refresh is fine | `window.location.reload()`, which becomes wrong the moment a failure has a message to lose |
| 4 | "about twelve" `revalidatePath` sites | **75**, of which one used the correct form |
| 5 | sections are a layout change | **they are not** — see §3 |
| 6 | build a tab strip | the repository already signed a different shape, and `WorkModeTabs` records why |
| 7 | slot five is free | guarded in both directions, with two named blockers |

---

## 3. The section split needed a section-scoped writer, and that is the slice

`SettingsForm` was one `<form>` over a `.strict()` schema spanning seventeen
columns owned by four different sections. Splitting it and leaving the action
alone would have made **every section's save blank the other three** — the exact
defect `2P-SETTINGS-004` forbids.

### What was rejected

| Shape | Rejected because |
|---|---|
| `profileSchema.partial()` | weakens validation for the fields a section *does* own |
| hidden inputs carrying the other sections' values | a stale tab overwrites a newer save with what it rendered — a lost update introduced to avoid a read the action already performs |
| one form with the inactive fieldsets hidden | hidden fields still submit; unrendered ones do not exist. Either way one half of `-004` breaks |

### What was built

A section declares the columns it owns (`PROFILE_SECTION_FIELDS`), and
`updateProfile` assembles a **complete** payload from two sources — the form for
the owned fields, the **stored row** for every other — then parses the whole
object with the **unchanged** strict schema.

`resolveSettingsFormValues` is extracted so `loadSettingsFormValues` (what the
form renders) and `updateProfile` (what the writer passes through) answer *"what
is stored"* identically, including for an account with no `agent_preferences`
row at all.

**The groups are guarded, not trusted.** `settings-sections.test.ts` derives the
expected field set from `profileSchema.shape` and asserts the four groups
partition it — exhaustive and pairwise disjoint — with two non-vacuity controls
proving a missing field fails and a duplicated field fails.

**And the checkbox is the one field where absence is the value.** The action
`delete`s an owned key rather than assigning `undefined`, because an unticked
`importantReminderOverride` submits nothing; leaving the stored `"on"` in place
would have made the control impossible to turn off. Proved both directions:
Planejamento can set it to `false`, and Geral's save leaves it `true`.

---

## 4. What was built

| Piece | Where |
|---|---|
| the eight-section contract, hrefs, resolver, revalidation paths | `src/features/settings/sections.ts` |
| section names and summaries, both locales | `src/features/settings/copy.ts` |
| the nav — links, `aria-current`, no `tablist` | `settings-section-nav.tsx` |
| focus on change, never on arrival | `settings-section-focus.tsx` |
| the named, focusable panel | `settings-panel.tsx` |
| per-section content and per-section reads | `settings-section-content.tsx` |
| the shell: one `<h1>`, the nav, the focuser | `app/[locale]/app/settings/layout.tsx` |
| Geral at the parent route; seven behind one dynamic segment | `settings/page.tsx`, `settings/[section]/page.tsx` |
| section-scoped writing | `profile/settings-sections.ts`, `settings-resolve.ts`, `actions.ts` |
| automation outcomes as state rather than `throw` | `agent/automation-state.ts`, `automation-actions.ts`, and both client controls |
| freshness and undo-block, stated per category | `automation-section.tsx` |
| Notificações as history | `app/[locale]/app/notifications/page.tsx` |
| the account in the top bar; the fifth slot | `app-shell.tsx`, `account-menu.tsx`, `capabilities.ts`, `navigation-links.tsx` |
| Perguntas as a view of Registros | `app/[locale]/app/inbox/page.tsx` |

### Eight canonical URLs, zero redirects

`/app/settings` renders Geral; the other seven sit behind one `[section]`
segment. A redirect from the parent would **trap the back button** — leaving
`/settings/general` backwards lands on `/settings`, which sends you forward
again — and `2P-SETTINGS-002` asks for back and forward to be preserved.

One dynamic segment rather than seven folders is what lets **two** route
patterns invalidate every section in both locales, instead of sixteen literal
paths kept in step with a list living elsewhere.

`settings` became `nested: true` in the navigation registry. Without it
`classifyNavigationPath` returns `null` for `/app/settings/appearance` and the
rail stops marking Ajustes as current while the reader is standing in it.

### The heading demotion that was deliberately not done

The layout renders the page's one `<h1>`; every component keeps the `<h2>` it
had. Outline h1 → h2 → h3, which is the rule
`notifications/page-outline.test.ts` already enforces. A per-section `<h2>`
would have forced thirteen components down to `<h3>`, and every spec selecting a
heading by level with them, to express what `aria-current="page"` and the
panel's accessible name already express.

---

## 5. `2P-SETTINGS-007`: the failure is rendered, not thrown

Slice 2P.4 made both automation actions `throw`, and the comment beside the
first one was right about why: a **swallowed** error would put the stored value
back in an uncontrolled select with no explanation, and the owner would believe
they had changed who may write without asking them. That comment named its own
successor — *"`2P-SETTINGS-007` … belongs to slice 2P.5"*.

A thrown error replaces the whole page with the error boundary and destroys the
section, the history, the undo control and the message. Both actions now return
a typed state rendered on the category's own row, and `55P03` gets its own
sentence — *the category moved since* — because reporting it as "try again"
invites the retry that will keep being refused.

Neither action revalidates on a failure, so the input survives.

---

## 6. Notificações is the history surface

Consent, the five states, the three facts, the bounds, the type / frequency /
quiet-hours / cap controls and the whole of `PushControls` moved to Settings →
Notificações. **The same component takes the same props from the same reader**,
and `begin_push_delivery` still reads every one of them before sending.

What stayed: the route, the `?page` deep link, the pagination, the owner-scoped
read, `AccountDataStrip`. No redirect was added and no route ended.

What it gained: read and unread as a **word** rather than only a tint, an
announced unread count, per-row accessible names so twenty "Lida" buttons are
distinguishable, and exactly **one** discreet link back — resolved through
`settingsSectionHref`, so it cannot drift from where the section lives. Loading
and error are inherited from `app/[locale]/app/loading.tsx` and `error.tsx`
rather than duplicated.

---

## 7. `2P-CHAT-004-MOBILE`, closed — and the census named both blockers

`mobileBarSlots` is `home · inbox · capture · work · library`, capture still at
the exact midpoint. `Mais` is gone from the bar.

`capabilities.ts` carried a **census with a release condition**, and neither half
was waived:

1. **The account.** Mounted only in the desktop rail and the mobile overflow
   panel, so retiring `Mais` would have taken Ajustes, the whole of Dados e IA
   and **sign-out** with it. `AccountMenu` has a third `variant` in the top bar —
   still one component, still exactly two mounts, the overflow one having
   **moved** rather than multiplied.
2. **Perguntas.** Hoje's only link sits inside `{view.openQuestion ? … : null}`
   and `conversational-questions.tsx` returns `null` on an empty list. The census
   named the fix and refused to build it there: Perguntas is *a view of
   Registros*, and a permanent control on the cockpit to satisfy a census would
   be arranging the product around its own bookkeeping. Registros' header links
   to it unconditionally now, and **Hoje is untouched** — the guard still asserts
   that Hoje's link is gated.

Everything else `Mais` held is reached from Brain's eight lenses (now one tap
from a slot), Trabalho's mode tabs, the calendar, Ajustes → Dados e IA, the
account menu, and the command palette — which is an explicit control in the top
bar and, on mobile, always has been the only entry point to it. The desktop rail
keeps its `side-more` disclosure with all five groups.

---

## 8. Verification

### Local gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean in tracked source (the six errors are in a git-ignored `.worktrees/` checkout absent in CI) |
| `npm test` | **8497 passed**, 3 files failed to parse — the recorded Windows-only baseline, green in CI |
| `npm run build` | passes, with `/[locale]/app/settings` and `/[locale]/app/settings/[section]` both emitted |

### The authenticated browser, against `next start` on a fresh build

CI's journey lane is unauthenticated and cannot reach `/app/settings` at all,
and the RSC boundary is the defect class that has shipped three times here. The
server was **rebuilt and restarted** before each run, because a stale `next
start` keeps serving the previous artefact.

| Lane | Desktop | Mobile |
|---|---|---|
| `online-phase-2p-settings.spec.ts` (new) | **10/10** | **10/10** |
| `online-phase-2p-automation.spec.ts` (retargeted, assertions unchanged) | **6/6** | **6/6** |
| `online-notifications-and-recovery.spec.ts` | 8/8 | — |
| `online-mobile-navigation.spec.ts` | ✅ (was red on `main`) | — |
| `online-ai-configuration.spec.ts` | 4/4 | — |
| `online-privacy-and-consent.spec.ts` | 6/6 | — |
| `online-preferences-centre.spec.ts` | 4/5 — see §9 | — |
| `layout-contracts` · `foundation` · `accessibility` | 187 passed, 5 skipped | ✅ |

What the new lane proves, each of which only a browser can answer: every section
renders when **entered directly** by URL; the nav marks the active one to a
screen reader; two steps back reach Geral and stop there, and forward returns;
focus lands on the panel on a change and **not** on arrival; a save in Assistente
survives a round trip and a save in Planejamento leaves it alone; a failed save
keeps 80 typed characters and names **Assistente**; the AI section carries no
`sk-`, no reveal control, and a `type="password"` field with no value;
Notificações holds the history, none of the moved controls, and exactly one link
back that lands on the section; six categories still refuse and none is eligible.

**Slice 2P.4's lane is the strongest single piece of evidence in this record.**
Its URL moved and **not one assertion changed** — 12/12 across both projects.
ADR-123 Decision 7 required 2P.5 to reorganize that surface *"without changing
its semantics"*, and a retarget that had also needed its expectations rewritten
would have been the evidence it did not.

### Refresh, save, undo — measured

Slice 2P.4 ended with `window.location.reload()` on both automation controls,
because three gentler mechanisms had been measured doing nothing. Both now use
`useActionState` plus `router.refresh()` **on success only**, and the automation
lane's save-and-undo test passes on desktop and on mobile — so the reload is no
longer needed, and a failure message now survives because nothing navigates.

### Zero residue, with a control

Every disposable account was deleted by its `afterAll`, and absence was then
**measured**: probe users **0**. Because a zero is not a control, the same query
was aimed at what really exists — **2** users, **3** entries, **344** audit rows,
**16** undo operations, **0** policy rows, **0** calibration observations.

`audit_logs` is 344 where §95 left it at 342. The two extra rows are
`interpretation_confirmed` + `entry_lifecycle_rederived` at
`2026-08-19 12:49:37Z` on **an owner account that still exists** — the owner
using the product, not this slice's residue. Every one of the 344 rows resolves
to a live owner; there are no orphans.

**No automation was enabled. No policy row exists for anybody. No BYOK
credential was saved and no provider call was made.**

---

## 9. One red lane, and it is not this slice's

`online-preferences-centre.spec.ts` → `2O-PREF-013/-014/-015` fails on the
appearance radio after a reload: the element carries the `checked` **attribute**
on the right option while its DOM **property** reads `unchecked` — a hydration
mismatch in `AppearanceControl`.

**Reproduced on `main`.** A git worktree at `0296e2a`, its own `npm run build`,
its own `next start`, and the spec exactly as `main` has it: the identical
assertion fails with the identical symptom. This slice moved that control to its
own route and changed nothing about how it resolves its choice.

It is recorded rather than fixed. Changing when `AppearanceControl` reads
`localStorage` is a behaviour change to a control this slice only relocated, and
`2P-SETTINGS-008`'s *"no setting changes semantics through the reorganization
alone"* cuts both ways.

> **Remainder `2P-APPEARANCE-HYDRATION`.** After a reload the appearance radio
> shows the machine default while the applied theme is the owner's choice. The
> theme itself is correct — `data-theme` and the canvas both pass — so the defect
> is the control's own display, not the preference. Pre-existing at `0296e2a`;
> not absorbed by this slice.

Two further things were **already failing on `main`** and are repaired here
because the lanes are otherwise unrunnable, recorded as pre-existing rather than
claimed: `online-mobile-navigation.spec.ts` named "Início" and "Conversar" where
the product renders "Hoje" and "Brain", and matched a `/app/reviews` heading that
resolves to two elements.

---

## 10. Guards: six retargeted, two widened by real gaps

Every one failed because it noticed a real move. None was deleted or weakened.

| Guard | What it does now |
|---|---|
| `page-performance.test.ts` | **strengthened** — every multi-read section must batch, derived from the module rather than naming three loaders |
| `notifications/page-outline.test.ts` | inverted to an absence, each half paired with a positive control, comments stripped before scanning |
| `capability-registry-guard` | follows the centre into `settings-section-content.tsx` |
| `mobile-reachability-guard` | the release condition **fired**, so the assertion turned over — and still fails in both directions |
| `shell-mirror-guard` | mirrors the absence of an overflow panel, with a control that plants it back |
| `egc-reachability` | the new route in the inventory |
| `onboarding-guard`, `phase-2p-automation-guard` | retargeted to the section module |
| `app-shell.test.tsx` | kept pointer-outside, Escape and focus-restore by asserting them on the disclosures that still exist |

### Two gaps the move revealed

1. **The capability registry had never governed the notification controls.**
   `notificationType`, `notificationFrequency`, `quietStart`, `quietEnd` and
   `dailyCap` shipped in slice 2M.4b and were outside the guard's scope until the
   move brought them into the preferences centre. A `notification_delivery` row
   now governs them, `operational` because `begin_push_delivery` reads every one
   before sending — a behavioural consumer inside the database.
2. **The control taxonomy could not see a handler destructured from props**,
   which is this repository's dominant injection pattern. It accused
   `universal-state.tsx` of a defect in correct code — the **third** time that
   file records a too-narrow pattern accusing the product. The collector gained a
   fifth shape, with a two-sided control proving a name bound nowhere still
   fails.

### A guard fell into the trap it exists to catch

The first cut of `page-outline.test.ts` forbade the **word** `NotificationSettings`
and failed on the page's own docstring explaining that the component had moved.
Weakening the pattern or deleting the sentence would each have traded a real
property for a passing test. It strips comments and forbids the **act** — the
mount and the import — with a control proving the stripper removes prose and
keeps code.

### And a control caught my own fixture

`actions.test.ts`'s non-vacuity check — *"submits a different value from the
stored one for every single field"* — failed on `reviewModel`, where my fixture
had picked the same model on both sides. That field's isolation check could
never have discriminated. Corrected before it could pass for free.

---

## 11. `revalidatePath`: repaired where proved, recorded where not

The census is **generated**, not typed: **75 call sites**, of which **one** used
the route-pattern form before this slice. Handoff §95 inherited *"about twelve"*.

**Repaired — five, all on surfaces this slice opened and proved:**

| Module | Was | Is |
|---|---|---|
| `profile/actions.ts` | resolved `/{locale}/app/settings` | both settings patterns |
| `byok/actions.ts` ×3 | resolved | both settings patterns, via one helper |
| `onboarding/actions.ts` | resolved | both settings patterns |
| `agent/actions.ts` (`markNotification`) | resolved | `/[locale]/app/notifications`, `"page"` |
| `agent/automation-actions.ts` | one settings pattern | both, from the routing contract |

**Recorded as debt — 70 call sites across 17 modules**, none on a surface this
slice opened:

| Module | Sites | Module | Sites |
|---|---:|---|---:|
| `tasks/actions.ts` | 16 | `interpretations/actions.ts` | 5 |
| `entities/actions.ts` | 12 | `interpretations/person-candidate-actions.ts` | 3 |
| `agent/actions.ts` | 9 | `task-commands/detail-actions.ts` | 3 |
| `operations/actions.ts` | 7 | `byok`, `capture`, `entities/associations`, `entities/relationships`, `memories` | 2 each |
| | | `chat`, `notifications`, `onboarding`, `reminders`, `task-commands/actions` | 1 each |

They are **not** rewritten here. A silent sweep of seventy call sites across
surfaces this slice does not open and cannot prove is precisely the wide, quiet
change the owner forbade — and the `/app` and `/app/inbox` calls that sit
alongside the ones that were repaired are left alone for the same reason.

---

## 12. Requirement classification

| Requirement | Class | Evidence |
|---|---|---|
| `2P-SETTINGS-001` stable sections | **built** | eight sections, eight URLs; every one entered directly in a real browser |
| `2P-SETTINGS-002` deep link + back/forward | **built** | round-tripped in both locales; two steps back reach Geral and stop |
| `2P-SETTINGS-003` mobile list, not a tab row | **built** | one DOM, two layouts; measured stacking and zero sideways scroll at 375 px |
| `2P-SETTINGS-004` save isolation | **built** | structural — a section names only its own columns; proved at the action and in the browser |
| `2P-SETTINGS-005` every control keeps a consumer | **built** | the registry now governs the five notification controls it had never seen |
| `2P-SETTINGS-006` BYOK compact, posture kept | **built** | same component, same props; no `sk-`, no reveal control, empty password field |
| `2P-SETTINGS-007` failed save keeps input, names section | **built** | 80 typed characters survive; the alert says *Assistente* |
| `2P-SETTINGS-008` Notificações becomes history | **built** | controls absent with a positive control; one link back; read/unread announced |
| `2P-CHAT-004-MOBILE` | **closed** | five slots with Brain; account in the header; Perguntas from Registros |

**Cumulative: 51 of 87** — 42 at the close of 2P.4, plus eight `2P-SETTINGS`
requirements, plus the `2P-CHAT-004` remainder closing.

---

## 13. Deliberately not claimed

- **Nothing on real hardware.** The mobile lane is a Pixel 7 emulation.
  `2P-MOBILE-005`'s NOT EXECUTED rule is untouched, and so is ADR-122 Decision 6.
- **No screen-reader run.** Roles, names, `aria-current` and focus are asserted
  in a real browser; nobody listened to VoiceOver.
- **No live two-session race** on the section-scoped writer. A stale tab can only
  rewrite the columns it owns — the same exposure as before the split — but that
  is reasoning, not a measurement.
- **Unsaved typing does not survive a deliberate section change.** Sections are
  separate documents. What `2P-SETTINGS-004` forbids — a *save* resetting another
  section's values — is proved; persisting a half-typed credential across a
  navigation would be worse than losing it.
- **`2P-APPEARANCE-HYDRATION` is open**, pre-existing, and reproduced on `main`.
- **`RG-DEP-3` stays INCOMPLETE.** Not re-run: this slice deploys nothing.

## 14. Remainders preserved, not absorbed

`2P-ATTENTION-008`'s browser half · `2P-CHAT-007-JOURNEY` (2P.8) · `RG-DEP-3` ·
the four missing review flows (`2P-AUTONOMY-FLOW-PROJECT`, `-ORGANIZATION`,
`-MEMORY`, `-RELATION`) · `2P-APPEARANCE-HYDRATION` · the 70 `revalidatePath`
call sites outside this slice's surfaces.

Inherited residuals — push HTTP 403/Android, retention scheduling, SMTP, the
restore drill, the legal and monitoring signatures, the four touch-target
exceptions, the unstyled elements, `2N-FILES-WRITER`, `2N-IDENTITY-EXTRACTION`,
`2N-RELATION-TRIGGER` — remain untouched and unclaimed.

**No migration. No automation enabled. No grant, RLS policy, retention rule or
authority changed. Signup closed, rollout unchanged, push 403 not resumed, no
BYOK credit spent, no audio persisted. The roadmap successor is neither started
nor planned.**
