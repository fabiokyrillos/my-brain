/**
 * Life Brain E.5 part 2 (ADR-175) — the `answer` string, read out of a JSON
 * object while the object is still being written.
 *
 * The chat model answers with Structured Outputs: one object,
 * `{ "answer": "…", "citedSourceIds": [ … ] }`, that arrives over the stream a
 * few characters at a time. What the owner should see as it is written is the
 * answer's text and nothing else — not the braces, not the citation ids, not a
 * half-written escape. This scanner keeps just enough JSON state to know when it
 * is inside the top-level `answer` string, and hands back each piece of that
 * string decoded.
 *
 * What it is NOT: a validator. It never decides whether the object is valid —
 * `chatAnswerSchema` still parses the complete object at the end, and only that
 * parsed answer is ever persisted. A draft built from these pieces is a preview,
 * replaced by the persisted message once the turn completes.
 *
 * Pure, synchronous and dependency-free, so it is tested by chunking the same
 * JSON every possible way.
 */

import type { AIUsageDetails } from "./usage-details";

export type AnswerFieldExtractor = {
  /** Feeds the next chunk of raw model output; returns the newly decoded answer text (often ""). */
  push(chunk: string): string;
};

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

type StringRole = "key" | "answer" | "other";

export function createAnswerFieldExtractor(): AnswerFieldExtractor {
  /** Open containers, outermost first: `{` or `[`. */
  const stack: string[] = [];
  let inString = false;
  let role: StringRole = "other";
  let escape: null | "backslash" | "unicode" = null;
  let hex = "";
  let keyBuffer = "";
  /** At depth 1 of the top-level object, the next string is a key. */
  let expectingKey = false;
  /** A key has closed and its `:` has not been seen yet. */
  let awaitingColon = false;
  let pendingKey: string | null = null;
  /** The key whose value comes next, once its `:` has been seen. */
  let valueKey: string | null = null;
  /** The answer string was read to its closing quote; nothing more is emitted. */
  let done = false;

  const atTopObject = () => stack.length === 1 && stack[0] === "{";

  return {
    push(chunk) {
      let out = "";
      const append = (text: string) => {
        if (role === "answer") out += text;
        else if (role === "key") keyBuffer += text;
      };

      for (const char of chunk) {
        if (inString) {
          if (escape === "backslash") {
            escape = null;
            if (char === "u") {
              escape = "unicode";
              hex = "";
            } else {
              append(SIMPLE_ESCAPES[char] ?? char);
            }
          } else if (escape === "unicode") {
            hex += char;
            if (hex.length === 4) {
              escape = null;
              const code = Number.parseInt(hex, 16);
              // A UTF-16 code unit, surrogates included: the halves of a pair
              // arrive as two escapes and join again in the concatenated text.
              if (!Number.isNaN(code)) append(String.fromCharCode(code));
            }
          } else if (char === "\\") {
            escape = "backslash";
          } else if (char === '"') {
            inString = false;
            if (role === "key") {
              pendingKey = keyBuffer;
              awaitingColon = true;
            } else if (role === "answer") {
              done = true;
            }
            role = "other";
          } else {
            append(char);
          }
          continue;
        }

        if (char === " " || char === "\n" || char === "\r" || char === "\t") continue;

        if (char === "{" || char === "[") {
          if (atTopObject()) valueKey = null;
          stack.push(char);
          if (char === "{" && stack.length === 1) expectingKey = true;
        } else if (char === "}" || char === "]") {
          stack.pop();
        } else if (char === ",") {
          if (atTopObject()) {
            expectingKey = true;
            valueKey = null;
          }
        } else if (char === ":") {
          if (atTopObject() && awaitingColon) {
            valueKey = pendingKey;
            awaitingColon = false;
          }
        } else if (char === '"') {
          inString = true;
          if (atTopObject() && expectingKey) {
            role = "key";
            keyBuffer = "";
            expectingKey = false;
          } else if (atTopObject() && valueKey === "answer" && !done) {
            role = "answer";
            valueKey = null;
          } else {
            role = "other";
            if (atTopObject()) valueKey = null;
          }
        } else if (atTopObject()) {
          // A number or a literal: the value is not a string.
          valueKey = null;
        }
      }
      return out;
    },
  };
}

/**
 * A streamed answer the provider ended as `failed`, after reporting what it
 * billed (ADR-192).
 *
 * The Responses API reports usage only on a terminal response. `completed` and
 * `incomplete` return it to the caller as a normal result; `failed` is also
 * terminal and may carry usage, so the stream throws this, holding the bill,
 * and the pipeline records it in `ai_usage_events` before it fails the turn.
 * A stream that ends with an `error` event, or that drops before any terminal
 * response, carries no usage: there is nothing truthful to record, so it
 * throws a plain `Error` and the ledger stays without a row rather than with an
 * invented one.
 */
export class BilledAnswerStreamFailure extends Error {
  constructor(readonly billed: AIUsageDetails & { readonly model: string }) {
    super("OpenAI reported a failed answer stream");
    this.name = "BilledAnswerStreamFailure";
  }
}
