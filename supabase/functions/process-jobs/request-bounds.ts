/**
 * SH-QUOTA-008 — the largest request body `process-jobs` will read.
 *
 * ## Why this is its own module
 *
 * `index.ts` calls `Deno.serve` at module scope, so a test that imported it
 * would start a server. The bound lives here instead, which is also the only
 * way it can be tested at all — and an untested bound is a bound that stops
 * existing the first time somebody refactors the handler.
 *
 * ## What FINDINGS F-20 actually found
 *
 * Every legitimate request to this function is one of two shapes,
 * `{ jobId: "<uuid>" }` or `{ mode: "dispatch" }`, and neither exceeds a
 * hundred bytes. The handler nonetheless called `request.json()` on whatever
 * arrived — before authentication, because the dispatch branch is selected
 * *from the parsed body*. So an unauthenticated caller who could reach the
 * function could make it buffer and parse a payload of any size (T-27).
 *
 * Two kilobytes is roughly twenty times the largest real request, and small
 * enough that flooding this function costs the sender more than it costs us.
 */
export const MAX_REQUEST_BODY_BYTES = 2048;

/**
 * The parsed body, or `null` when the request is too large.
 *
 * `Content-Length` is consulted first because it lets an oversized request be
 * refused without reading a byte. It is a claim by the caller, though, and a
 * chunked request carries none at all — so the bytes are measured too. A bound
 * that trusted the header alone would be a bound the caller opts out of by
 * omitting it, which is not a bound.
 *
 * Malformed JSON returns `{}` rather than `null`: that is the pre-existing
 * behaviour (`.catch(() => ({}))`), it falls through to the same "job is not
 * available" answer, and conflating it with the size refusal would tell a
 * caller which of the two it tripped.
 */
export async function readBoundedBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) return null;

  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BODY_BYTES) return null;
  if (raw.trim() === "") return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
