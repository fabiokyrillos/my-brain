import { handleChatStreamRequest } from "@/features/chat/stream-route";

/**
 * Life Brain E.5 part 2 (ADR-175): the grounded chat answer, streamed as it is
 * written. Everything — the origin check, authentication, the shared pipeline
 * and the stream — is in `handleChatStreamRequest`; the Server Action
 * `sendChatMessage` runs the same pipeline without the stream.
 *
 * POST only, and never cached (a non-GET route handler is not).
 */
export async function POST(request: Request): Promise<Response> {
  return handleChatStreamRequest(request);
}
