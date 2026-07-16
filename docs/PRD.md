# My Brain — Product Requirements

## Vision

My Brain is a private, proactive personal agent that turns natural daily language into durable context, traceable actions, and useful follow-up. It preserves what the user actually said, separates facts from inference, and only interrupts when something deserves attention.

## Outcomes

- Capture anything without choosing a form or object type first.
- Recover commitments, decisions, activities, people, projects, and durable memories later.
- Prevent work from disappearing through contextual heartbeats, reviews, and waiting-state awareness.
- Make every AI action explainable, auditable, reversible when possible, and isolated per user.

## Primary user and jobs

The first user manages professional and personal contexts at once. They need to record requests quickly, understand today, retrieve historical context, follow work delegated to others, and review progress without maintaining a complex taxonomy manually.

## Core principles

1. Original input is immutable; interpretation is versioned separately.
2. Not every entry is a task; one entry may produce several concepts.
3. Implicit task creation requires confirmation; explicit, unambiguous requests may execute.
4. Reversible, high-confidence organization can happen automatically with notice and undo.
5. Protected, destructive, external, bulk, or permission-changing actions always require confirmation.
6. Silence is a valid heartbeat outcome.
7. Facts, inferences, confidence, model, strategy version, and internal sources remain visible.
8. `occurred_at` drives timelines; `created_at` records ingestion.

## MVP journeys

### Foundation

Register or sign in, recover access, use Google OAuth, change language, maintain a profile and agent preferences, and use the responsive application shell.

### First priority slice

Capture a free-form message; persist the immutable original; interpret people, organization, project, concepts, dates, and candidate tasks; review or edit candidates; confirm selected tasks; persist relationships and audit records; inspect the original; undo resulting actions.

### Follow-on journeys

Manage tasks and dependencies; converse with grounded internal citations; browse person and project timelines; receive contextual internal notifications; complete daily, weekly, and monthly reviews; attach and asynchronously process files; install the secure PWA and draft offline.

## Information architecture

Home, Today, Inbox, Tasks, Waiting, Projects, People, Reminders, Reviews, Agent chat, Memories, Files, Pending questions, Change history, Notifications, and Settings. Desktop uses a side navigation; mobile uses a bottom navigation with quick capture.

## Autonomy policy

Confidence is a decision bundle, not a model number. It combines schema validity, ambiguity count, entity conflicts, missing dates, semantic match margin, impact, reversibility, and action scope. Protected actions always override confidence. Ignored questions remain non-blocking, enter a pending queue, respect cooldowns, and appear in reviews.

## Acceptance

No phase is complete with fake controls, permanent mock data, incomplete RLS, lost originals, unconfirmed implicit tasks, unaudited mutations, cosmetic undo, ungrounded chat, repeated heartbeats, broken mobile behavior, exposed secrets, irreproducible migrations, failing verification, or incorrect retroactive dates.

