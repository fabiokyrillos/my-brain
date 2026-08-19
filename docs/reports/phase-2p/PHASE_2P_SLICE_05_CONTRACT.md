# Phase 2P — Slice 2P.5 contract: settings sections, notifications, and the mobile bar's fifth slot

**Status:** the architecture, written before any code was edited, as
`2P-FOUNDATION-007` requires and as slices 2P.0 … 2P.4 each did.

**Baseline.** `main` `0296e2a3f07457a5580e0fa6f4b0c27c224fb49a`, worktree clean
and synchronized, zero open PRs, **99 local = 99 hosted, parity `202608190099`**
— read live from `supabase_migrations.schema_migrations`, not quoted. Both
Phase 2P migrations are **spent**; a third is a stop condition. Signup closed;
rollout 25 pass · 3 fail · 2 owner-signature. 42 of 87 requirements closed.

**Scope.** `2P-SETTINGS-001` … `-008`, and the remainder `2P-CHAT-004-MOBILE`.

**Zero migrations.** Nothing in this contract needs deployed SQL. If any part of
it turns out to, the slice stops and presents the need rather than improvising.

---

## 1. The re-audit, measured against `0296e2a` before anything was edited

Seven findings. Four of them changed the design.

| # | Claim carried into this slice | What the tree actually holds |
|---|---|---|
| 1 | The owner must sign proposed thresholds | **The numbers are already in the code and are already correct.** `CALIBRATION_THRESHOLDS` carries 50/0.90 · 80/0.97 · 60/0.95 · 60/0.95 · 80/0.97 · 100/0.98 and `CALIBRATION_FRESHNESS` carries 10 / 90 days / 30 days / 20 — exactly what the owner signed. What changes is the **prose**: the module calls them *"a PROPOSAL"*. No number moves. |
| 2 | `2P-SETTINGS-007` is this slice's work | Confirmed, and `automation-actions.ts` says so in a comment that names the slice. Both automation actions currently **`throw`**, so a failed save replaces the whole page with the error boundary. |
| 3 | The automation controls refresh correctly | They refresh by `window.location.reload()`. That is correct today and **becomes wrong the moment Settings has sections**: a full reload discards unsaved input elsewhere on the surface, which is the thing `2P-SETTINGS-004` forbids, and it would also discard a failure message that `2P-SETTINGS-007` requires to survive. |
| 4 | `revalidatePath` has "about twelve" latent call sites | **79 `revalidatePath(` lines across 19 modules.** Exactly one uses the route-pattern form. The count was under-stated by a factor of six, and the debt list below is re-derived rather than inherited. |
| 5 | Settings sections are a layout change | **They are not.** `SettingsForm` is one `<form>` over a `.strict()` Zod object spanning General, Assistant, Planning and AI. Splitting it without changing the action would make every section's save blank the other three — manufacturing the exact defect `2P-SETTINGS-004` forbids. Section-scoped saving is a *requirement of the requirement*, not scope creep. |
| 6 | A tab strip is the obvious shape | The repository already signed a different one. `WorkModeTabs` links to **separate routes** with `aria-current="page"` and records why: *"Announcing them as tabs would promise a panel that swaps in place, which is exactly what does not happen."* This slice follows that precedent rather than inventing a second one. |
| 7 | The fifth mobile slot is free to take | It is not. `mobile-reachability-guard` asserts **in both directions** that the slot frees only once `AccountMenu` reaches the mobile header, and that its destination is **Brain**. The guard fails if the account arrives without the slot moving, *and* if the slot moves without the account arriving. |

---

## 2. Settings: eight sections, eight canonical URLs, zero redirects

### 2.1 The sections and what each owns

| # | Section | URL | Owns |
|---|---|---|---|
| 1 | Geral | `/{locale}/app/settings` | `timezone`; restore the onboarding guide; the capability summary |
| 2 | Assistente | `…/settings/assistant` | `agent_name`, `personality`, `tone`, `response_detail`; the per-category automation policy |
| 3 | IA | `…/settings/ai` | the BYOK credential panel; `ai_profile` and the four routed models |
| 4 | Planejamento | `…/settings/planning` | `quiet_start`, `quiet_end`, `important_reminder_override`, `max_followups_per_day`, `daily_review_time`, `weekly_review_time`, `weekly_review_day` |
| 5 | Notificações | `…/settings/notifications` | consent, types, frequency, push quiet hours, daily cap, the push controls — **moved here from `/app/notifications`** |
| 6 | Privacidade e dados | `…/settings/privacy` | the privacy census, the consent record, the Dados e IA reach |
| 7 | Aparência | `…/settings/appearance` | the appearance choice; install to the home screen |
| 8 | Conta | `…/settings/account` | Conta e dados — notifications, the policy documents, account deletion |

### 2.2 Why Geral lives at `/app/settings` and not at `/app/settings/general`

A redirect from the parent would **trap the back button**: leaving
`/settings/general` backwards lands on `/settings`, which redirects forward
again. `2P-SETTINGS-002` asks for back/forward to be preserved, so the parent
route *renders* Geral rather than pointing at it.

`/app/settings/general` is nevertheless a legal section value and renders the
same panel, because a hand-typed or hand-edited URL should not 404 on the one
section whose name is guessable. `/app/settings` is the canonical link the nav
emits; the two mount **one** component, so they cannot drift.

Everything that already links to `/app/settings` — `AccountMenu`,
`AccountDataStrip`, the navigation registry — keeps working untouched.

### 2.3 One dynamic segment, so revalidation needs no per-section list

The seven non-default sections are `…/settings/[section]/page.tsx`, one dynamic
segment. `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`
is explicit: *"If `path` contains a dynamic segment, for example `/product/[slug]`,
this parameter is required"*, and a pattern plus `'page'` *"will invalidate any
path that matches the provided `page` file"*. So **two** calls cover all eight
sections in every locale:

```ts
revalidatePath("/[locale]/app/settings", "page");
revalidatePath("/[locale]/app/settings/[section]", "page");
```

Eight literal paths per locale would be sixteen strings to keep in sync with a
list that lives elsewhere. This is one pattern per file, which is what the API
is for.

`settings` becomes `nested: true` in `capabilities.ts`. Without it,
`classifyNavigationPath` returns `null` for `/app/settings/appearance` and the
rail stops marking Ajustes as the current destination while the reader is
standing in it — the same defect the mobile demotion comment already describes.

### 2.4 The nav, and what it is not

`SettingsSectionNav` lives in `settings/layout.tsx`, so it renders once and does
not remount when the section changes. Eight `<Link>`s, `aria-current="page"` on
the active one, `aria-label` on the `<nav>`. **No `role="tablist"`**, for the
reason `WorkModeTabs` records: these navigate to separate documents.

`2P-SETTINGS-003` — *"Mobile renders the sections as a list or compact selector
rather than an overflowing tab row"* — is satisfied by CSS over one DOM: a
vertical list on narrow viewports, a rail beside the panel from the medium
breakpoint up. No second markup tree, no JavaScript, no horizontal scroll.

### 2.5 Headings, and the demotion that is deliberately not done

The layout renders the page's **one** `<h1>Configurações</h1>`. Every component
mounted into a section keeps its existing `<h2>`. The outline is h1 → h2 → h3,
which is exactly the rule `notifications/page-outline.test.ts` already enforces
on the other surface this slice touches.

Adding a per-section `<h2>` would have forced thirteen components down to `<h3>`
and broken every spec that selects a heading by level, to express something the
navigation already expresses. The **active section's identity** is carried by
`aria-current="page"` in the nav and by the panel's accessible name.

### 2.6 Focus on section change, without stealing it on arrival

Each section page renders its panel as
`<section id="settings-panel" tabIndex={-1} aria-label={sectionName}>`. A screen
reader entering it announces the section by name.

`SettingsSectionFocus` is a client component **in the layout**, so it survives
the navigation between sections — a focuser inside a page would remount and lose
the fact that a change happened. It compares the current section against a ref
seeded on first mount, so:

- on **first load** it does nothing, and the skip link stays the first stop;
- on a **section change** it focuses `#settings-panel`.

It reads the section from `usePathname()` and holds no other state.

---

## 3. Section-scoped saving, and why it is a database read rather than a hidden field

### 3.1 The problem in one sentence

`profileSchema` is `.strict()` over seventeen owned fields; a form that submits
four of them fails to parse, and a form that submits four while the payload
builder fills the rest from defaults **silently blanks thirteen stored values**.

### 3.2 The three rejected shapes

| Shape | Rejected because |
|---|---|
| `profileSchema.partial()` | It weakens validation for the fields a section *does* own. A section must be strict about its own columns. |
| Hidden inputs carrying the other sections' current values | The values would round-trip through the client. A stale tab left open would overwrite a newer save with what it rendered — a lost-update defect introduced to avoid a database read the action **already performs**. |
| One `<form>` spanning the sections, with the inactive fieldsets hidden | Hidden fields still submit; visually-hidden fields on an unrendered section do not exist. Either way, one of the two halves of `2P-SETTINGS-004` breaks. |

### 3.3 What is built instead

A section **declares the columns it owns**, and the action assembles a complete,
strictly-validated payload from two sources:

- the **form**, for the fields that section owns;
- the **stored row**, for every other field.

`updateProfile` already reads that row — the snapshot exists for the
pass-through columns `planning_day`, `planning_time`, `ai_provider` and
`privacy_default`. This generalises the pattern the file already uses rather
than adding a mechanism.

`resolveSettingsFormValues(profileRow, preferencesRow)` is extracted as a pure
function and used by **both** `loadSettingsFormValues` (what the form renders)
and `updateProfile` (what the writer passes through). One definition of *"what
is stored"*, so a section's unowned fields are written back byte-identical to
what was rendered, and a missing `agent_preferences` row means the same thing on
both sides.

`SETTINGS_SECTION_FIELDS` carries the four groups. Its guard is **derived, not
transcribed**: the union of the groups is compared against `profileSchema.shape`
minus `locale`, and the groups are asserted pairwise disjoint. A field added to
the schema without an owning section fails the build; a field claimed by two
sections fails the build. The test also plants a **non-vacuity control** — a
deliberately missing field and a deliberately duplicated one, each proved to
fail — so the check cannot pass by comparing an empty set with itself.

### 3.4 What this makes true

`2P-SETTINGS-004` becomes **structural** rather than tested-for: a section's
submission physically cannot name another section's column, and the columns it
does not name are read from the database rather than from the page.

---

## 4. Failed saves, and where the error appears

`2P-SETTINGS-007`: *a failed save preserves input and names the affected
section.*

| Surface | Today | After |
|---|---|---|
| `updateProfile` | returns `{status, message}`; input preserved because it neither redirects nor revalidates on failure | unchanged, **plus** the failing `section` in the state, rendered inside that section |
| `setAutomationCategoryPolicy` | **throws** → error boundary replaces the page | returns a typed state; the message is rendered inside the automation block, in the Assistente section, and the select keeps what the owner chose |
| `undoAutomationCategoryPolicy` | **throws** | same, with `55P03` explained as *the category moved since* rather than as a generic failure |

Both automation actions move to `useActionState`, which is the shape
`updateProfile` and `CredentialPanel` already use. The `throw` was correct while
the alternative was a silent success; a rendered, actionable failure is strictly
better and is what the requirement asks for.

**Neither action revalidates on failure.** A revalidation would refresh the
page out from under the failure and discard it — the shape slice 2N.3 recorded
in the undo control and slice 2O.6 recorded again.

---

## 5. Refresh, undo, and the `revalidatePath` boundary

### 5.1 What this slice repairs

Only the call sites its own surfaces need. Every one of them targets a Settings
or Notifications route:

| Module | Line(s) | Today | After |
|---|---|---|---|
| `profile/actions.ts` | 81 | resolved `/{locale}/app/settings` | both settings patterns |
| `byok/actions.ts` | 185, 197, 234, 330 | resolved | both settings patterns |
| `onboarding/actions.ts` | 43 | resolved | both settings patterns |
| `agent/actions.ts` | 569 | resolved `/{locale}/app/notifications` | `/[locale]/app/notifications` pattern |
| `agent/automation-actions.ts` | 86 | already the pattern | extended to the `[section]` pattern |

`byok/actions.ts:331-332`, `agent/actions.ts:570` and `onboarding/actions.ts:42`
target `/app/inbox` and `/app` — not this slice's surfaces. They are listed in
the debt below and left alone, because a repair nobody in this slice proves is
a change nobody in this slice can defend.

### 5.2 What is recorded as debt, not fixed

The full census is **79 call sites across 19 modules**, generated rather than
typed. The remainder — every site outside Settings and Notifications — is
recorded in the acceptance record as a named, separate debt with its file and
line. It is not rewritten here: a silent sweep of seventy-odd call sites across
surfaces this slice does not open and cannot prove is precisely the "ampla e
silenciosa" change the owner forbade.

### 5.3 The refresh contract to prove, per changed surface

Save updates the interface immediately · undo updates immediately · refresh,
back and forward behave · a manual reload is never the normal requirement. All
four are proved in an authenticated browser against a rebuilt `next start`, on
desktop and on a mobile viewport, because the RSC boundary is the defect class
that has now shipped three times here and no local gate can see it.

---

## 6. Automation in Settings, and the four categories with no producer

Per category, the surface states: the current state; whether it is
`suggest_only`, armed, or eligible; the real calibration progress; the required
minimum; the current count; **the reason it is not eligible**; freshness;
whether a recent undo blocks it; and the enable/disable control **only where it
can honestly be offered**.

**No control promises to activate an ineligible category.** The select offers
the three policy states — one of which is *arming*, explicitly named
`automatic_when_eligible` because arming is not authorizing — and the row states
plainly that arming a category whose evidence is short changes nothing yet.

`project`, `organization`, `memory` and `relation` have **no producer at all**.
The surface says *there is no review flow for this category yet*, not a zero
that would read as *not enough yet*. Waiting accumulates nothing for them, and
the copy says so. Each carries a named remainder —
`2P-AUTONOMY-FLOW-PROJECT`, `-ORGANIZATION`, `-MEMORY`, `-RELATION` — routed to
the successor's re-audit at closeout and **not** started, planned or absorbed
here.

The signed thresholds stop being called a proposal. No number moves and
`automation-policy-parity.test.ts` keeps failing the build if the module and
`private.automation_category_decision` ever disagree.

---

## 7. Notifications becomes the history surface

`2P-SETTINGS-008`. What **moves** to `…/settings/notifications`: consent, types,
frequency, quiet hours, the daily cap, and the whole of `PushControls`. What
**stays**: the route, its `?page` deep link, its pagination, its owner-scoped
read, `AccountDataStrip`, and the `<h1>` above everything.

What the page gains: an explicit read/unread state that is announced rather than
only coloured, and one — exactly one — discreet contextual link to the
preferences. Loading and error states are inherited from
`src/app/[locale]/app/loading.tsx` and `error.tsx`, which already wrap every
authenticated route; the slice proves they reach this one rather than adding a
second pair.

**No preference changes semantics.** The components move; their props, their
readers and their writers do not. `readPushConsent` moves its *caller*, not its
contract.

`page-outline.test.ts` is **retargeted, not relaxed**: it stops asserting that
`NotificationSettings` sits above the feed — the component is no longer on the
page — and starts asserting that it is **absent**, that exactly one preferences
link remains, and that the pagination, `parsePage` and no-redirect properties
are intact. The absence assertion is paired with a positive control, because an
absence assertion passes on a page that never rendered.

---

## 8. The mobile bar's fifth slot

The order is the one already signed, and it is executed in one commit because
the guard fails on either half alone:

1. `AccountMenu` reaches the **mobile header**, so the account is reachable
   without opening a disclosure;
2. `Mais` retires from the bar and **Brain** takes slot five;
3. every destination that lived behind `Mais` on a phone keeps a path — the
   desktop rail's disclosure is unchanged, and the demoted primaries plus the
   five secondary groups move to Brain's own surface and the palette, both of
   which already reach them;
4. Conversation is promoted **as Brain's first lens**, which is what
   `2P-CHAT-004` says it is and what `phase-2i-library-guard` already pins.

`AccountMenu` keeps **one implementation**; the header mount is a third
`variant`, not a second component, for the reason that file records: two
implementations are two chances for one surface to end a session the other does
not.

Proved on a real mobile viewport in an authenticated browser: five slots, the
capture control at the exact midpoint, every touch target at or above the
signed minimum, safe-area insets honoured, no horizontal overflow, and focus
order matching DOM order.

`mobile-reachability-guard` is **updated in the same change and in both
directions** — it must fail if the account leaves the header, and it must fail
if the slot reverts while the account stays.

---

## 9. What this slice must not do

- No migration. A third Phase 2P migration is a stop condition.
- No category enabled. No threshold moved. No observation fabricated.
- No grant, RLS policy, retention rule or authority changed.
- No stored BYOK key re-displayed, and no key value in any state, log or URL.
- No setting lost, renamed, or changed in meaning by the reorganization.
- No sixth mobile bar slot, and no setting or account door hidden.
- Push HTTP 403 not resumed. Signup not opened. Rollout not altered. No BYOK
  credit spent. No audio persisted.
- `2P-ATTENTION-008`'s browser half, `2P-CHAT-007-JOURNEY`, `RG-DEP-3` and the
  four missing review flows are **not** absorbed.
- The roadmap successor is neither started nor planned.

---

## 10. Threat model

| # | Threat | Mitigation |
|---|---|---|
| T-1 | A section's save blanks another section's stored columns | Unowned fields are read from the database, never from the page. Groups are derived from the schema, proved exhaustive and disjoint, with a two-sided non-vacuity control. |
| T-2 | A stale tab overwrites a newer save | No section echoes another's values, so a stale tab can only rewrite the columns it owns — the same exposure as before the split. |
| T-3 | A failed save looks like a success | Both automation actions stop throwing and start returning a rendered state; the profile action already returns one. Neither revalidates on failure, so the input survives. |
| T-4 | A BYOK key is re-exposed by the move | The panel's read is metadata-only and is unchanged; the section renders the same component with the same props. Asserted by a guard over the rendered markup and by the authenticated journey. |
| T-5 | A control appears that promises to enable an ineligible category | The authority stays in `private.automation_category_decision`; the surface renders its reason and never recomputes eligibility. |
| T-6 | The reorganization loses a setting | Every control's new home is enumerated here and asserted by a guard that derives the list from the capability registry rather than from prose. |
| T-7 | Retiring `Mais` strands a destination | The census guard is re-derived in the same change, in both directions, and the authenticated mobile journey walks the paths. |
| T-8 | A deep link 404s or the back button traps | Eight canonical URLs, zero redirects, one dynamic segment; back/forward proved in a real browser. |
| T-9 | The section change is silent to a screen reader | The panel is a named region and receives focus on change but not on arrival. |
| T-10 | A `revalidatePath` repair is claimed for surfaces nobody proved | Only Settings and Notifications call sites move; the other 70-odd are recorded with file and line as separate debt. |
