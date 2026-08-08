"use server";

/**
 * `2J-VOICE-001` … `2J-VOICE-015` — the transcription Server Action.
 *
 * ## What it does, and the two things it deliberately does not
 *
 * It takes a recording and returns text. It does **not** create an entry, and
 * it does **not** store the audio.
 *
 * The transcript is a **draft** (`2J-VOICE-012`/`015`). Nothing is captured
 * until the user edits, reads and confirms it, and confirmation goes through
 * `captureEntry` like any other text — which is why voice needs no job type, no
 * bucket and no second write path. A transcript is not an entry; a recording is
 * not an entry.
 *
 * ## Who pays (OD-2J-2, `2J-VOICE-002`)
 *
 * The user's own BYOK credential, resolved through `openAiGate` exactly as chat
 * and extraction do. With no valid credential the action **refuses and says so**
 * — it does not queue the audio for later, does not fall back to a project key,
 * and does not silently subsidize the call. Queuing would be durable audio
 * retention wearing a helpful hat, which is the one thing the signed
 * audio-discard decision forbids outright.
 */

import { after } from "next/server";
import { z } from "zod";

import { getByokCopy } from "@/features/byok/copy";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import { getAIProvider } from "@/lib/ai";
import { recordAIUsage } from "@/lib/ai/usage";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { gateMessageKey, openAiGate } from "@/lib/byok/gate";
import { resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

import { transcriptionCopy } from "./voice-copy";
import {
  MAX_RECORDING_BYTES,
  isAcceptedAudioType,
  type TranscribeState,
} from "./voice-contracts";

const requestSchema = z.object({
  locale: z.enum(["pt-BR", "en"]),
  mimeType: z.string().min(1).max(120),
});


export async function transcribeRecording(
  _state: TranscribeState,
  formData: FormData,
): Promise<TranscribeState> {
  const locale = resolveLocale(formData.get("locale"));
  const text = transcriptionCopy[locale];

  const audio = formData.get("audio");
  const parsed = requestSchema.safeParse({
    locale,
    mimeType: formData.get("mimeType"),
  });
  if (!parsed.success || !(audio instanceof File)) {
    return { status: "error", code: "unsupported_format", message: text.unsupportedFormat };
  }
  if (!isAcceptedAudioType(parsed.data.mimeType)) {
    return { status: "error", code: "unsupported_format", message: text.unsupportedFormat };
  }
  if (audio.size <= 0 || audio.size > MAX_RECORDING_BYTES) {
    return { status: "error", code: "too_large", message: text.tooLarge };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "unauthenticated", message: text.sessionExpired };
  await assertActiveAccount(supabase, user.id, locale);

  // OD-2J-2. The gate is the same one chat and extraction use; transcription
  // gets no special path to a key, and no fallback when there is none.
  const gate = await openAiGate(supabase, user.id);
  if (!gate.ok) {
    return {
      status: "error",
      code: "no_credential",
      message: getByokCopy(locale).messages[gateMessageKey(gate.reason)],
    };
  }

  /*
    `2H-RATE-001`. One recording is one AI operation. Admission sits AFTER the
    BYOK gate -- a user who cannot reach a provider never spends a slot -- and
    BEFORE the provider call, so a refusal reaches no network. Voice reaches a
    provider like any other operation and gets no exemption from the ceiling.

    The `operation` here is the error-sink vocabulary, which is a DIFFERENT
    closed set from the usage ledger's and does contain `other` (ADR-096). None
    of its sixteen values names transcription, and `other` is the honest choice
    rather than borrowing `chat_answer` -- this parameter is only read when the
    limiter itself faults.
  */
  const admission = await admitRateLimitedOperation({
    client: supabase,
    bucket: "ai",
    locale,
    operation: "other",
  });
  if (!admission.ok) {
    return { status: "error", code: "transcription_failed", message: admission.message };
  }

  const provider = getAIProvider({ credential: gate.credential.secret });

  let result;
  try {
    result = await provider.transcribeAudio({
      audio,
      mimeType: parsed.data.mimeType,
      locale,
    });
  } catch {
    // `2J-VOICE-011`. The provider's error object never escapes -- the BYOK
    // discipline, applied to a new call site. The caller still holds its draft;
    // this returns a code, never a provider message, and never the transcript
    // of a partial attempt.
    return { status: "error", code: "transcription_failed", message: text.failed };
  }

  /*
    The ledger write. `after()` keeps it off the response path -- the user is
    waiting on their words, not on our bookkeeping -- but it is not optional and
    not conditional: every provider call is recorded, including ones whose cost
    the ledger cannot price (ADR-096: no audio pricing row exists, so these land
    as `cost_status = 'unpriced'`).

    No `sourceType`/`sourceId`: there is nothing to point at. The transcript is
    a draft in the user's browser, and if they discard it the recorded fact is
    still true -- a provider call happened and they paid for it.
  */
  after(async () => {
    await recordAIUsage(supabase, {
      operation: "transcription",
      model: result.model,
      userId: user.id,
      usage: result,
    });
  });

  return { status: "success", text: result.text };
}
