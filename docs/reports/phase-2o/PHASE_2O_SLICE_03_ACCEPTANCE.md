# Phase 2O — Slice 2O.3 acceptance record

**Requirements:** `2O-PREF-001` … `2O-PREF-015` (15).
**Migrations created:** **zero.** 94 local = 94 hosted, parity `202608140094`.
**Authorized by:** ADR-118 Decision 1, which names 2O.3 as the fourth slice.
**Baseline:** `main` = `origin/main` = `9de8b26`, worktree clean, no open PR, CI
green on all three job families at that SHA — each verified live rather than
read from a document.

**Signup stays closed. The rollout gate stays 25 pass · 3 fail · 2
owner-signature. The CSP is unchanged. `embedding_model` is untouched. A13 is
not retargeted. No declined residual was absorbed and M2 was not reallocated.**

---

## 1. The re-audit, against the `main` slice 2O.2 produced

§79 carries a re-audit of this slice against `37d1661`. ADR-118 Decision 1
requires one per slice against the `main` the previous one produced, so it was
re-run against `9de8b26` rather than inherited.

**Every premise held.** `'unsafe-inline'` is in `script-src`
(`next.config.ts:37`), so the inline script needs no CSP change — read from the
tree. `csp.test.ts`, `mobile-reachability-guard.test.ts` and the `/app/reviews`
schedule copy all exist and are guarded. `features/transparency/` carries the
Dados e IA pattern. `/app/notifications` and `/[locale]/account/delete` exist.
**`localStorage` was used nowhere in product code**, so `2O-PREF-014` really is
its first use.

### One divergence in the re-audit itself, and five findings it did not carry

**§79 says `AccountMenu` "mounts in exactly two files".** It mounts in exactly
two **places**, both inside one file — `app-shell.tsx:79` (the rail foot) and
`app-shell.tsx:110` (the mobile overflow). The PRD's own wording
(`2O-PREF-003`: *"`AccountMenu`'s two mount points"*) is correct, and so is
`mobile-reachability-guard.test.ts`, which asserts *"mounts AccountMenu exactly
twice"*. The imprecision is §79's prose, not the tree or the requirement.

Five findings the previous re-audit did not record, each of which changed how
this slice was built:

1. **`profileSchema` is `.strict()`.** A control rendered in the form without a
   matching schema key does not fail *that field* — it fails the whole parse,
   and every save returns *"review the fields"* with no indication which one.
   The form and the schema are one unit that has to move together.
2. **`buildSettingsPayload` sent the three review times from the stored row**,
   not from the input. That is why `2M-AUDIT-005` found them unchangeable: the
   payload was a round trip.
3. **`loadSettingsFormValues` did not select the three review columns**, so the
   form had nothing to render even if it had a control.
4. **`defaultAgentPreferences.tone` is `direct` and the column defaults to
   `informal`** — and a census confirms **nothing reads that field**. The
   constant's live consumers are `.timezone` and `.agentName` only.
5. **The consent record has no reader anywhere in the tree.**
   `policy_acceptances` is read by the acceptance gate and by `/consent` to
   decide one sentence; nothing displays it.

---

## 2. What shipped

**Ajustes is one destination.** It already held the credential panel, the
preferences form, the onboarding restore, the capability summary and Dados e IA.
It now also holds the **appearance choice** and **Conta e dados**, which reaches
notifications, the two policy documents and account deletion.

**The three review preferences have controls.** `daily_review_time`,
`weekly_review_time` and `weekly_review_day` — the only three `OD-2O-6` **A**
signed — with copy that says when the reviews page *offers to close the day*,
never when something runs.

**The appearance choice exists at last.** Three states, held in `localStorage`,
applied before first paint, validated against the closed set before the value
reaches any attribute. ADR-114 Decision 3 shipped the CSS for all three and
ADR-115 Decision 8 recorded that nothing wrote the attribute; this is the
missing half, and the stylesheet was not touched.

**A save now says what changed.** Not *"Preferências salvas."* alone, but which
capabilities moved and what will behave differently — in the registry's own
sentences, the same ones the summary above it renders.

---

## 3. The decisions this slice had to take, and what each declined

### 3.1 `2O-PREF-008` versus `OnboardingRestore` — a row, not an exemption

§79 required this to be a decision rather than an oversight: give the control a
`columns: []` row, or record why it is outside `-008`'s scope.

**It has a row.** The component's own comment said it needed none, *"because the
registry would have nothing true to say about it"*. Half of that was right —
there is no column — and half was wrong: the dismissal cookie has a genuine
reader, `readDismissal`, which decides whether the guide renders. So the
registry does have something true to say, and `-008`'s word is *every control in
the centre*.

Declined: **exempting it**. An exemption is the too-weak half ADR-067 removed,
and a guard that names its own blind spot has stopped being a guard.

### 3.2 Widening the guard found an older gap than the one it was widened for

Direction B scanned `settings-form.tsx` only, by `name=` attributes mapped to
columns. Rather than adding a second file by hand, the scan is **derived from
the settings page's own JSX mounts**.

That immediately surfaced a control nobody had remembered: **`CredentialPanel`
renders `apiKey` and has had no registry row since BYOK shipped.** A
hand-written list would have needed someone to think of it, and §79 records that
for `OnboardingRestore` nobody did — twice would not have been a coincidence.

Three rows added: `ai_credential`, `appearance`, `onboarding_restore`. Only
`appearance` is `visible`: a credential is not a preference, and the restore
control renders only when the guide is dismissed, so listing either in *what
these preferences change* would describe an affordance the page does not offer.

A `controls` field joins `columns` as a second anchor, for exactly the reason
`2O-ACTIVATION-007` added `columns`: the guard resolves a control by name, and a
capability with no column had nothing to resolve to.

### 3.3 `/{locale}/consent` is not the consent record, so it is not linked

`2O-PREF-002` names *the consent record* as one of three destinations. The
obvious link would be `/{locale}/consent` — and it is **an interposition, not a
record**: it redirects to `/{locale}/app` the moment nothing is owed, which is
true of every account that is up to date. A link labelled "consent" would bounce
almost every reader who clicked it straight back to the cockpit, and `R-2O-12`
refuses a control that changes nothing.

**What is reached instead:** the two policy documents, derived from
`POLICY_DOCUMENTS`, which is `2O-CONSENT-003`'s *"reachable in one step"*.

**What is not reached, with its destination:** *which version was accepted, and
when.* That has **no reader anywhere in the product** and is `2O-CONSENT-001`
and `-002`, in slice 2O.5. The section is shaped so that record slots into it.

### 3.4 The section reads nothing, and that is the same call `2O-ONBOARD-005` made

Conta e dados is navigational. Ajustes already performs four reads before it
renders; a fifth to show a consent date would be paid by every visit to a page
most people open for something else.

This is the owner's confirmed interpretation applied a second time: **reach the
existing surface by an explicit, contextual link rather than embedding it,
keeping one write path and one mount point.** Deletion in particular is reached
by a link to the page that asks properly — putting an irreversible action one
click from a preferences list is what `SH-DELETE-002`'s confirmation and
re-authentication exist to prevent.

### 3.5 The legal documents deliberately wear no strip

`2O-PREF-002` asks the reached route to wear a strip with a way back. Both
authenticated destinations do. The policy documents do **not**: they are public
(`SH-LEGAL-001`), linked from the register form before an account exists, so
*"back to Ajustes"* would point a signed-out reader at a page they cannot open.
`ACCOUNT_CENTRE_STRIP_ROUTES` records this as a closed set rather than as an
omission.

### 3.6 `scheduled_reviews` reaches the final wording `2O-ACTIVATION-006` deferred

That requirement set the row to `uncontrolled` — *real consumers, no authorized
control* — and said its final wording and `visible` value belong to
`2O-PREF-004`. The controls ship, so `uncontrolled` became the false reading.
The row is `operational` and `visible`, and the type system produced **TS2741
once per locale** until the copy was written.

**The `uncontrolled` state is not removed with it.** ADR-117 requires exactly
that vocabulary for `embedding_model` in slice 2O.4.

### 3.7 `defaultAgentPreferences.tone` — recorded, not changed

The constant says `direct`; the column defaults to `informal`. **Nothing reads
that field** — the constant's live consumers are `.timezone` and `.agentName`,
and `onboarding-guard.test.ts` already forbids onboarding from deriving defaults
from it.

Changing the literal was declined: it alters a shipped constant on a finding
rather than on a requirement, and no product path would behave differently.
Deleting the field was declined for the same reason. **It is recorded here with
its destination**: whoever gives that field a consumer must reconcile it with
the schema first, and the existing guard is what will stop them doing so
silently.

---

## 4. Four things I got wrong, and how each was caught

### 4.1 The script's validation depended on the order of the closed set

The first version asked `indexOf(v) > 0` — correct only while `system` sits at
index zero. A reordering of `appearanceChoices` would have started writing
`data-theme="system"` onto the document **with no test failing**, because every
test used the shipped order.

Fixed by deriving `explicitAppearanceChoices` so the question has no order in
it, and asserted directly: the script must not contain `indexOf(v)>0` and must
not contain the string `"system"` at all.

### 4.2 The framework's own guide is the vulnerability

`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`
demonstrates this exact technique with
`if(t)document.documentElement.setAttribute("data-theme",t)` — the stored string
written straight onto the document with **no validation**. That is `T-16`
verbatim.

Read before writing any of it, as `CLAUDE.md` requires, and the technique was
taken while that line was not. Planting the guide's version fails four tests.

### 4.3 A failed save destroyed the reader's input — `2O-PREF-011` was false

Found by writing the requirement's test, not by review. **React resets an
uncontrolled form after a form action returns, and it cannot tell a failed save
from a successful one** — the action function returned normally either way; the
failure is in its *value*.

So a save that failed for any reason wiped every field back to the server's
values, and the reader who had just retyped four of them was told to *try again*
with their work already gone. `aiProfile` and the model routes never had the
problem, because they are React state; everything else in that form is
uncontrolled.

Fixed by snapshotting the submission on its way out and restoring it in a
**layout** effect when the outcome is an error, so the write lands before paint
and nothing blinks. Declined: making every field controlled (a much larger
change to a form that is otherwise correct), and round-tripping the draft
through the Server Action to be handed straight back.

### 4.4 The appearance control polluted its own accessible name

All three radios answered to the name "Claro", because *"Seguir o aparelho"* is
described as *"acompanha o modo **claro** ou escuro"* and a `<small>` nested
inside a `<label>` joins the control's accessible **name** — the label's whole
subtree is the name.

This repository had already found and documented this, in `settings-form.tsx`
and `ModelSelect`. The same correction is applied: the label names the control
and `aria-describedby` carries the description. A screen-reader user would
otherwise have heard the same two words on every option.

**And one mistake in a guard, worth recording because it is this repository's
recurring shape.** The appearance guard sliced `layout.tsx` from `indexOf("<html")`
— and found `<html>` inside the *comment* that explains why the element needs
`suppressHydrationWarning`. It failed rather than passed, which is the safer
direction, but it is the same error as a check passing by containing its own
subject. Comments are now stripped first.

---

## 5. Requirement by requirement

| Requirement | Status | Evidence |
|---|---|---|
| `2O-PREF-001` | **built** | Ajustes holds credential, preferences, restore, appearance, summary, Dados e IA and Conta e dados; browser journey asserts the page renders and reaches each |
| `2O-PREF-002` | **built** | `account-centre/contracts.ts`; four doors; strip on both authenticated routes; `account-centre.test.tsx` asserts no route redirected and pagination kept |
| `2O-PREF-003` | **built** | `mobile-reachability-guard.test.ts` re-derived; census gains a row; guard proved to fail in **three** planted directions |
| `2O-PREF-004` | **built** | schema, view, payload and form; `settings-payload.test.ts` asserts the three come from the form and `planning_*` from the row |
| `2O-PREF-005` | **built** | `review-preferences-copy.ts`; the section repeats `/app/reviews`'s promise; asserted in both locales |
| `2O-PREF-006` | **built** | `/app/reviews` copy unchanged and still asserted by `phase-2m-inert-preferences-guard.test.ts` in both locales; nothing scheduled |
| `2O-PREF-007` | **built** | no control, no label, no field, and now **no submitted key** — asserted as a `FormData` absence, since a hidden input would pass a label check and break every save |
| `2O-PREF-008` | **built** | scan derived from the page's mounts; `controls` anchor; three rows added, one of them a gap older than this phase |
| `2O-PREF-009` | **built** | `<details>` with no `open`, present in the DOM while closed; asserted that nothing else is behind a disclosure |
| `2O-PREF-010` | **built** | `save-outcome.ts`; effects reused from `capability-copy.ts`; a no-op save says so |
| `2O-PREF-011` | **built** | the React reset defect found and fixed; alert role, input restored, retry enabled, one RPC |
| `2O-PREF-012` | **built** | every control returns to every prior value; the appearance choice cycles all three states |
| `2O-PREF-013` | **built** | three states, both locales |
| `2O-PREF-014` | **built** | `localStorage`, pre-paint script in `<head>`, closed-set validation, **no CSP change** |
| `2O-PREF-015` | **built** | both directions asserted in the guard against `tokens.css` and in the browser against a real emulated machine; the surface states it does not follow the account |

**15 `built`, 0 `partial`, 0 `undelivered`.**
**41 of 116 requirements delivered** across slices 2O.0, 2O.1, 2O.2 and 2O.3.

### `2O-ONBOARD-003` — re-evaluated here, and it stays `partial`

§80 required its remainder to be re-assessed inside this slice, closing it only
if the preferences centre offers a true and coherent solution.

**It does not, and the classification is unchanged.** The remainder is that the
guided path never asks for locale and timezone, because
`2O-ACTIVATION-001`'s first fact **cannot be false** — `profiles.locale` and
`profiles.timezone` are `not null` with defaults and `handle_new_user` creates
the row.

The preferences centre already offered a timezone control before this slice and
still does; it is `2O-PREF-004`'s neighbour in section 01. That does not close
the remainder, because the remainder is about **onboarding not asking**, not
about the preference being unreachable. Closing it on the strength of a control
that already existed would be claiming a delivery this slice did not make.

Onboarding and activation are **not** made to diverge, valid defaults are **not**
turned into incomplete state, and the remainder keeps its destination: it is the
owner's to close, for the price of one form field, and the alternative — asking
every Brazilian owner in São Paulo to confirm defaults that are already correct
for them — was declined in slice 2O.2 and is declined again here.

### `2O-ONBOARD-005` — the owner's confirmation, recorded

The owner confirmed that **integrating the existing credential panel by an
explicit, contextual link satisfies the requirement**, that the form must not be
embedded or duplicated in the cockpit, and that one write path and one mount
point must be preserved.

**Recorded without reopening anything.** The classification, the count and slice
2O.2's acceptance record are unchanged; this slice made no change to the
onboarding step, and the credential form still has exactly one mount point —
`/app/settings`. The same interpretation is applied a second time in §3.4 above,
which is now the confirmed pattern rather than an agent's reading.

---

## 6. Gates

| Gate | Result |
|---|---|
| `npm run lint` | zero errors |
| `npm run typecheck` | zero errors |
| `npm test` | green |
| `npm run build` | green |
| Migrations | **none created**; 94 = 94, parity `202608140094` |
| CSP | unchanged; `csp.test.ts` untouched |
| Browser proof | `e2e/online-preferences-centre.spec.ts`, authenticated, desktop and mobile |

**Local baseline note.** Three test *files* fail on Windows with a shebang parse
error and zero failing tests, which is the recorded local baseline since
2026-08-05 and is green in CI.

---

## 7. What this slice did not do

- **It did not create a migration.** `OD-2O-2` **A** is the reason there is
  none, and M2 has no destination.
- **It did not touch `embedding_model`**, the CSP, signup or the rollout gate.
- **It did not display the consent record** — no reader exists; `2O-CONSENT-001`
  and `-002`, slice 2O.5.
- **It did not correct `viewport.themeColor`.** `layout.tsx` declares the
  browser-chrome colour under `prefers-color-scheme` media only, so an explicit
  light choice on a dark machine leaves the chrome dark while the page is light.
  This is a **consequence of the control this slice adds**, and it is recorded
  rather than fixed: repairing it means adding literals and DOM work to the
  highest-severity script in the product on a finding rather than on a
  requirement. **Destination: slice 2O.7**, where the mobile surface is scoped
  and the browser chrome is a mobile concern.
- **It did not change `defaultAgentPreferences.tone`** — recorded in §3.7 with
  its destination.
- **It did not repair `ai_provider`'s literal write** — still `2O-AICONFIG`'s,
  slice 2O.4.
- **It did not absorb a declined residual**, reallocate M2, resume the push HTTP
  403 track, or start the successor phase.
