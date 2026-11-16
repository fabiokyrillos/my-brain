import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { recordErrorEvent } from "@/lib/observability/error-sink";

import { chatFailureMessage, classifyChatFailure } from "./diagnostics";
import { openChatTurn, runChatTurn, type AnswerGenerator } from "./chat-turn";
import { encodeChatStreamEvent, type ChatStreamEvent } from "./stream-protocol";

/**
 * Life Brain E.5 part 2 (ADR-175) — the grounded chat turn, streamed.
 *
 * The route handler (`app/[locale]/api/chat/route.ts`) is one line; this is
 * the whole of it, so it is tested without a server.
 *
 * ## The boundary, in order
 *
 * 1. **Same origin, JSON only.** A Server Action gets Next's origin check for
 *    free; a route handler gets nothing. A cross-site page could otherwise
 *    post a simple form here with the owner's cookies and spend their key, so
 *    the `Origin` must name this host and the body must be `application/json`
 *    (which a cross-site form cannot send without a preflight). Both refusals
 *    happen before the session is read.
 * 2. **The same validation, authentication and account gate as the action**,
 *    through the same `openChatTurn`. `src/proxy.ts` does not guard `/api`
 *    paths (it guards `/app`), so this is the only auth check, and it is the
 *    action's own. Refused here, nothing is written and no provider is called.
 * 3. **The same pipeline** (`runChatTurn`), with a generator that streams.
 *    Usage is recorded when the stream completes and before anything is
 *    persisted; the complete object is validated with `chatAnswerSchema`;
 *    citation ids that were not provided are stripped; then the answer is
 *    persisted exactly as the action persists it.
 *
 * ## What an abort means
 *
 * A provider stream that aborts or fails throws into the pipeline's catch, is
 * recorded, and persists nothing after the question — the draft the owner saw
 * never becomes a message.
 *
 * The owner closing or reloading the page is NOT that abort. ADR-173 promised
 * that a question survives a reload; aborting the model call on a disconnect
 * would turn every reload into "this question went unanswered". So a cancelled
 * response only stops the forwarding: the turn runs on (kept alive by
 * `after()`), completes, validates and persists the whole answer, and the
 * reloaded page's "pensando" refresh finds it. Still never a half answer.
 */

const NO_STORE = "no-store, max-age=0, must-revalidate";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE },
  });
}

/**
 * The `Origin` header names the host this request was sent to. The same
 * comparison Next makes for a Server Action: `x-forwarded-host` behind a
 * proxy, `host` otherwise.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === expected.split(",")[0]!.trim();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleChatStreamRequest(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { type: "error", message: "Forbidden" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { type: "error", message: "Unsupported media type" });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  // Only the three fields the action reads; anything else in the body is ignored.
  const raw = isRecord(body)
    ? { question: body.question, locale: body.locale, conversationId: body.conversationId }
    : {};

  const opened = await openChatTurn(raw);
  if (!opened.ok) {
    return json(opened.reason === "invalid" ? 400 : 401, { type: "error", message: opened.state.message, conversationId: null });
  }
  const { turn } = opened;

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  /** False once the owner has gone, or the stream is closed: stop forwarding, keep working. */
  let forwarding = true;
  const stream = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
    cancel() {
      forwarding = false;
    },
  });
  const send = (event: ChatStreamEvent) => {
    if (!forwarding || controller === null) return;
    try {
      controller.enqueue(encoder.encode(encodeChatStreamEvent(event)));
    } catch {
      forwarding = false;
    }
  };
  const close = () => {
    if (!forwarding || controller === null) return;
    forwarding = false;
    try {
      controller.close();
    } catch {
      // Already closed by a cancel.
    }
  };

  const streamed: AnswerGenerator = (provider, input) =>
    provider.streamAnswerFromKnowledge(input, { onAnswerDelta: (text) => send({ type: "delta", text }) });

  let knownConversation: string | null = turn.conversationId ?? null;
  const work = runChatTurn(turn, streamed, {
    surface: "route_handler",
    onConversation: (conversationId) => {
      knownConversation = conversationId;
      send({ type: "conversation", conversationId });
    },
  })
    .then((outcome) => {
      if (outcome.status === "failed") {
        send({ type: "error", message: outcome.state.message, conversationId: outcome.conversationId });
        return;
      }
      const href = `/${outcome.locale}/app/chat/${outcome.conversationId}`;
      try {
        revalidatePath(href);
      } catch {
        // The client refreshes to the thread itself; a revalidation that cannot
        // run outside a render scope loses nothing.
      }
      send({ type: "done", conversationId: outcome.conversationId, href });
    })
    .catch(async (error: unknown) => {
      // Reached only by a fault outside the pipeline's own catch (before its
      // try block). Recorded and reported like any other, never as raw text.
      const { reason, failure } = classifyChatFailure(error);
      const { correlationId } = await recordErrorEvent(turn.supabase, {
        surface: "route_handler",
        operation: "chat_answer",
        reason,
      });
      console.error("Streamed chat failed", { reason, correlationId });
      send({ type: "error", message: chatFailureMessage(turn.locale, failure, correlationId), conversationId: knownConversation });
    })
    .finally(close);

  // The turn outlives the response if the owner leaves (see the header).
  after(work);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": NO_STORE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
