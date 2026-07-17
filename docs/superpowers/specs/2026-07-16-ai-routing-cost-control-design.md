# Model routing and AI cost control design

## Goal

Give My Brain a cost-aware AI control plane without lowering the default quality of the product. Each AI operation gets its own model route, every successful provider call records its token usage with the price that applied at that moment, and the user gets a clear cost dashboard.

## Product decision

The default profile is **Maximum quality**:

| Operation | Default model | Reason |
| --- | --- | --- |
| Main chat | `gpt-5.6-terra` | User-facing answers need stronger judgment and grounded synthesis. |
| Capture and organization | `gpt-5.6-luna` | Structured extraction is constrained by a schema and benefits from speed. |
| Reviews and advanced reasoning | `gpt-5.6-terra` | Daily, weekly, and monthly synthesis should prioritize quality. |
| File analysis | `gpt-5.6-luna` | High-volume multimodal extraction is bounded and asynchronous. |
| Background routines | `gpt-5-mini` | Small classification and housekeeping tasks prioritize cost. |
| Semantic search | `text-embedding-3-small` | Dedicated low-cost embedding model. |

Two additional presets are available: **Balanced** and **Economy**. Selecting a preset fills all routes consistently. Selecting an individual model changes the profile to **Custom**. Only OpenAI models supported by the current provider appear.

## Architecture

`src/lib/ai/model-routing.ts` owns model identifiers, operation identifiers, profile presets, labels, and route resolution. Server actions load the user's routes from `agent_preferences` and pass the selected model to the provider. The current `ai_model` column remains for backwards compatibility but is no longer the routing source.

The provider returns a normalized usage object containing request id, input tokens, cached input tokens, output tokens, and reasoning tokens. `src/lib/ai/usage.ts` records that usage through the `record_ai_usage` database function. Recording failure never discards a successful user operation; it is logged without sensitive content.

## Cost ledger

`ai_model_pricing` is a read-only catalog seeded by migrations with standard-processing prices per million tokens. `ai_usage_events` is an append-only, user-isolated ledger. Every row stores a price snapshot as well as the calculated USD cost, so later price changes cannot rewrite history.

The database calculates:

`uncached input × input price + cached input × cached price + output × output price`

Reasoning tokens are stored for observability and are already included in output tokens, so they are not charged twice. Long-context multipliers are applied only to models whose official catalog defines them.

This is the exact cost according to returned token usage and the stored standard-processing price. It is not presented as an OpenAI invoice: priority processing, explicit cache writes, service-tier differences, credits, taxes, and organization-level adjustments require reconciliation with OpenAI billing. A future organization admin key can add provider-side invoice sync without changing this ledger.

## User experience

Settings replaces the single model selector with a compact cost profile chooser and six readable route rows. Each row explains the work it controls and the relative price tier.

The new **AI costs** navigation item opens a dashboard with:

- today, current month, and all-time calculated spend;
- calls and tokens for the current month;
- breakdown by model and operation;
- recent calls with model, tokens, cache, and USD cost;
- the current pricing catalog and an honest billing note.

The visual signature is a restrained horizontal “spend trace”: model-colored segments encode where the month cost came from. It uses the existing My Brain editorial type, navy ink, blue action color, and amber only for cost attention.

## Security and failure handling

- RLS and forced RLS isolate every usage event by `user_id`.
- Authenticated clients can read their own ledger and call the recording RPC only for themselves.
- The Edge Function uses service-role access only after authenticating and claiming an owned job.
- Provider request ids make event recording idempotent when available.
- No prompt, source content, API key, or file content is stored in the cost ledger.
- Unknown model pricing records token usage with `cost_status = 'unpriced'` instead of inventing a number.

## Acceptance criteria

1. Maximum quality is the default profile and uses the routes in the table above.
2. Settings saves a preset and every individual route.
3. Capture, chat, reviews, embeddings, and file analysis use their assigned routes.
4. Successful calls create isolated cost events without storing user content.
5. Cost math handles uncached, cached, output, and long-context tokens deterministically.
6. The dashboard is useful with both empty and populated ledgers on desktop and mobile.
7. Typecheck, lint, unit tests, build, Supabase lint, online migration, and a real authenticated flow pass before publication.
