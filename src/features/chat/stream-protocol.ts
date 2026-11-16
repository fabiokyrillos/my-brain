import { z } from "zod";

/**
 * Life Brain E.5 part 2 (ADR-175) — what the streaming chat route sends.
 *
 * Newline-delimited JSON, one event per line, so a reader needs no SSE parser
 * and every piece of text travels JSON-escaped. In order:
 *
 * - `conversation` once the question row is written (a new conversation's id
 *   is learnt here, before the answer);
 * - `delta` for each written piece of the answer's text — a draft, never the
 *   message;
 * - then exactly one of `done` (the validated answer is persisted; refresh to
 *   it) or `error` (nothing after the question was persisted).
 *
 * Shared by the route and the composer, and pure, so it is client-safe.
 */

export const CHAT_STREAM_PATH = (locale: string) => `/${locale}/api/chat`;

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("conversation"), conversationId: z.string().uuid() }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("done"), conversationId: z.string().uuid(), href: z.string().startsWith("/") }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    conversationId: z.string().uuid().nullable(),
  }),
]);

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

export function encodeChatStreamEvent(event: ChatStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Reads an NDJSON body, calling `onEvent` for each well-formed event. A line
 * that is not one of the four events is skipped rather than trusted: the
 * stream is the server's, but the reader still validates its boundary.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (line: string) => {
    if (line.trim() === "") return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return;
    }
    const parsed = chatStreamEventSchema.safeParse(raw);
    if (parsed.success) onEvent(parsed.data);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      flush(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  flush(buffer);
}
