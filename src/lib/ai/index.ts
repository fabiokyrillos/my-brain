import "server-only";

import type { Secret } from "@/lib/byok/secret";

import type { AIProvider } from "./provider";
import { OpenAIProvider } from "./openai-provider";

/**
 * The application's only provider constructor — now with a **required**
 * credential (`BYOK-ADAPTER-001`).
 *
 * ## Why the signature rather than a runtime check
 *
 * The previous signature was `{ model?, embeddingModel? }`: it did not accept a
 * credential at all, and `OpenAIProvider` filled the gap from
 * `process.env.OPENAI_API_KEY`. That read is now deleted, and the credential is
 * a **required property of a required argument** — so a call site that forgot
 * one fails at `tsc`, not at runtime on somebody's first chat message. A runtime
 * check would have been satisfiable by an empty string and would have shipped.
 *
 * ## Why it takes a `Secret` and not a `string`
 *
 * `BYOK-ADAPTER-006`. A `string` credential is indistinguishable from every
 * other string in the program, so nothing can stop it being logged, spread into
 * a result, or interpolated into a message. A `Secret` throws on all three.
 *
 * **This function is the only place in the application that unwraps one**, which
 * is what makes `.expose()` a greppable, one-line audit.
 */
export function getAIProvider(options: {
  credential: Secret;
  model?: string;
  embeddingModel?: string;
}): AIProvider {
  return new OpenAIProvider({
    apiKey: options.credential.expose(),
    model: options.model,
    embeddingModel: options.embeddingModel,
  });
}

export type { AIProvider } from "./provider";
export type { EntryExtraction } from "./extraction-schema";
export type { ChatInput, ChatResult, ChatSource, EmbeddingResult, ExtractionInput, ExtractionResult } from "./types";
export type { AIUsageDetails } from "./usage-details";
