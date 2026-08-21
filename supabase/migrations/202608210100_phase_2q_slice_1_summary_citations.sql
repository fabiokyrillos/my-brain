-- Phase 2Q slice 2Q.1 -- a generated review keeps the references it was written
-- from.
--
-- THE ONE MIGRATION THIS PHASE HAS. OD-2Q-7 is signed as option A: 1 allocated,
-- and this spends it. A SECOND MIGRATION OF ANY KIND IS A STOP CONDITION
-- (ADR-127 Decision 7, ADR-128 Decision 3) -- OD-2Q-4 is signed as option A, so
-- no pending decision could fund one.
--
-- WHY THE SCHEMA CANNOT CARRY THE DELIVERY WITHOUT IT
--
-- public.summaries has fourteen columns and no join table. Measured on the
-- deployed database at parity 202608190099: id, user_id, period_type,
-- period_start, period_end, title, content, original_content, status, model,
-- input_tokens, output_tokens, generated_at, updated_at. Not one of them can
-- hold a reference to a record, and the generated types carry
-- `Relationships: []`. The provider already returns `citedSourceIds`, validated
-- against the rows the request read under RLS, and generateReview drops them at
-- the upsert. So the review page has nothing to vouch for and passes an empty
-- allow-set, which is why every link a model writes collapses into plain text.
--
-- WHAT THIS DELIBERATELY IS NOT
--
--   1. NOT A FOREIGN KEY. A review is a historical statement: it said what it
--      said on the day it was written, and deleting a task must not edit it.
--      An FK with `on delete cascade` would rewrite history; one with
--      `on delete set null` would make NULL ambiguous between "no source" and
--      "deleted source", which this repository has already paid for once.
--      2Q-CITE-003 proves it by deleting a cited task and asserting the stored
--      envelope is byte-identical.
--   2. NOT A CHECK CONSTRAINT, NOT A TRIGGER, NOT A DEPLOYED VALIDATOR. The
--      envelope's shape is pinned in TypeScript by a `.strict()` Zod schema
--      (conversation-sources/contracts.ts), exactly as
--      conversation_messages.citations has been since 202607160006. That is what
--      makes widening the type vocabulary to `entry | memory | task` cost ZERO
--      migrations -- verified against that migration's text, not assumed.
--   3. NOT A NEW POLICY AND NOT A NEW GRANT. A column inherits its table's
--      row-level security and its table-level privileges. public.summaries
--      already has RLS enabled AND forced, three policies granted to
--      `authenticated` alone (summaries_insert_own, summaries_select_own,
--      summaries_update_own), and `authenticated` holds no DELETE. 2Q-CITE-002
--      asserts that set is UNCHANGED by this migration, against the pre-state
--      recorded in the slice 2Q.0 acceptance record -- because a requirement
--      asserting "unchanged" with no recorded pre-state asserts nothing.
--   4. NOT A BACKFILL. OD-2Q-3 is signed as option A. A review written before
--      the producer existed carries `[]`, which parses to the `unknown`
--      evidence state -- "nobody recorded whether the Brain found anything",
--      the only honest thing that can be said about it. Re-running retrieval
--      over past windows would produce references the original review was not
--      written from: an invention with a token cost.
--
-- WHY `not null default '[]'::jsonb`
--
-- Every existing row gets an empty array rather than NULL, so the reader never
-- has to distinguish "no citations" from "column absent", and `parseCitations`
-- has exactly one legacy shape to recognise instead of two. It matches
-- conversation_messages.citations byte for byte, which is the point: one
-- envelope, one parser, one set of degradation rules.
--
-- THE WRITER SHIPS IN THIS SAME SLICE. ADR-123 Decision 7's rule -- a migration
-- may not create schema nobody uses -- applies unchanged: generateReview
-- persists the envelope in the same write as the review, in the same pull
-- request as this file.

alter table public.summaries
  add column citations jsonb not null default '[]'::jsonb;

comment on column public.summaries.citations is
  'Phase 2Q (2Q-CITE-001). The structured references a generated review was '
  'written from: {v, evidence, reach, sources[]} where each source is '
  '{id, type, sourceId, support} and type is entry | memory | task. '
  'IDENTIFIERS ONLY -- there is nowhere in the shape to put an excerpt, a title '
  'or a snippet, and that absence is the privacy control (2Q-CITE-006). '
  'Deliberately not a foreign key: a review is a historical statement and '
  'deleting a cited record must not rewrite what it said (2Q-CITE-003). '
  'Deliberately unconstrained in SQL: the shape is enforced by a strict Zod '
  'schema at both the write and the read, so the vocabulary can widen without a '
  'second migration. The stored envelope is a CLAIM about what was cited, never '
  'proof the row still exists -- every citation is re-read at render time under '
  'the reader''s own session (2Q-TRUST-001).';
