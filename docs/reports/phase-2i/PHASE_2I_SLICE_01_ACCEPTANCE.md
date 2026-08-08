# Phase 2I — Slice 2I.1 acceptance — visual language and universal states

**Date:** 2026-08-07 · **Migrations: 0** · **Requirements:** `2I-LANG-001` … `2I-LANG-007`

---

## What shipped

| File | Role |
| --- | --- |
| `src/features/experience/state-vocabulary.ts` | The vocabulary **as data** — six tones, seven states, closed |
| `src/features/experience/copy.ts` | Typed copy, both locales, **zero inline ternaries** |
| `src/app/experience.css` | The single source of state colour |
| `src/features/experience/universal-state.tsx` | `UniversalStateView`, `UniversalSkeleton`, `AuthoredBlock`, `ToneIcon` |
| `src/lib/closeout/phase-2i-experience-guard.test.ts` | 18 structural assertions |
| `src/features/experience/universal-state.test.tsx` | 14 behavioural assertions |

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-LANG-001` | **built** | Six tones declared once in `state-vocabulary.ts`; `experience.css` declares `--tone-<t>-fg/bg/line` for each; the guard asserts the stylesheet is imported by `globals.css`, because a token set nobody imports is a design document |
| `2I-LANG-002` | **built** | `AuthoredBlock` renders user / interpretation / suggestion / confirmed with a **rendered label** plus a distinct border *style* — not colour. A border style alone is invisible to a screen reader; the label is the affordance |
| `2I-LANG-003` | **built** | Typography, spacing, radius and density tokens in `experience.css`; density is a surface choice, meaning is not |
| `2I-LANG-004` | **built** | Seven states, one implementation, both locales. The guard asserts every state has a title and description in each locale **and** that the two locales do not share a string — the non-vacuity half |
| `2I-LANG-005` | **built** | `interpreting` is its own state with `contentIsSafe: true` and a rendered safety line in both locales. Behavioural test asserts *"Suas palavras já estão salvas."* / *"Your words are already saved."* |
| `2I-LANG-006` | **built** | Every tone carries an icon (the guard fails otherwise); 44 px targets under 760 px; `prefers-reduced-motion` honoured by the **absence** of the animation rather than by a second rule restating it |
| `2I-LANG-007` | **built** | The guard asserts `experience.css` contains no `prefers-color-scheme` and no `[data-theme=`. Dark mode is out (D5) and **not partially implemented** |

## The design decision worth recording

**`contentIsSafe` lives in the vocabulary, not in per-surface copy.** It is the
single most important thing a state can say in this product — capture is
asynchronous since Phase 2X, so an entry is durable *before* the AI runs — and
leaving it to each surface is how the reassurance gets forgotten on the one
screen that needed it.

`error_terminal` is the **control**: the only state that does not promise
safety. Without it, "every state that should promise safety does" would be
satisfied by a vocabulary that always says yes.

## Three defects, all in this slice's own guard

*Suspect the probe before the product.* The guard failed three times against
**correct product code**:

1. `Array.from({ length: rows })` matched a bare `\.from\(` PostgREST detector.
2. `copy.ts`'s header explains that no `pt ?` ternary is added — the raw scan
   read that sentence as the violation.
3. `experience.css`'s header says there is no `prefers-color-scheme` block — the
   raw scan read that one too.

All three have the same root cause: **scanning raw text including comments.**
Fixed by running the detectors over comment-stripped source, plus a non-vacuity
assertion so the comment stripper cannot pass by deleting everything.

## Verification

lint clean · typecheck clean · build passes · guard **18/18** · behaviour
**14/14** · full suite **4332/4332**.
