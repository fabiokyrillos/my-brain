/**
 * `2P-CHAT-002`, `2P-CHAT-003` — the diagnostic contract.
 *
 * The property under test is not "does this map look right". It is that the
 * mapping is **total over the sink's own vocabulary**, that the five classes
 * the requirement names are genuinely distinguishable from one another, and
 * that nothing a provider or a database said can reach the owner through it.
 *
 * Slice 2P.0 measured why this matters: one `catch` answered five different
 * facts with one sentence, and a guard that merely checked the sentence existed
 * would have passed against that defect.
 */

import { describe, expect, it } from "vitest";

import { ERROR_REASONS, classifyError, type ErrorReason } from "@/lib/observability/error-sink";
import { locales } from "@/lib/preferences";

import {
  CHAT_FAILURE_CLASSES,
  chatFailureClassForReason,
  chatFailureCopy,
  chatFailureMessage,
  classifyChatFailure,
  type ChatFailureClass,
} from "./diagnostics";

const CORRELATION = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

describe("the mapping is total over the sink's vocabulary", () => {
  it("answers for every reason the sink can produce", () => {
    for (const reason of ERROR_REASONS) {
      const failure = chatFailureClassForReason(reason);
      expect(CHAT_FAILURE_CLASSES, reason).toContain(failure);
    }
    // Non-vacuous: the loop above is worthless if the vocabulary is empty.
    expect(ERROR_REASONS).toHaveLength(14);
  });

  it("uses every class it declares, so none is dead vocabulary", () => {
    const used = new Set(ERROR_REASONS.map(chatFailureClassForReason));
    expect([...used].sort()).toEqual([...CHAT_FAILURE_CLASSES].sort());
  });

  it("keeps the five named classes distinct from one another", () => {
    // `2P-CHAT-002` names five failures and requires distinct recovery states.
    // Same class for two of them would satisfy a weaker reading of the
    // requirement and defeat its purpose.
    const named: Readonly<Record<string, ErrorReason>> = {
      credential: "permission_denied",
      quota: "quota_exceeded",
      retrieval: "database_error",
      provider: "provider_error",
      temporary: "provider_timeout",
    };
    const classes = Object.values(named).map(chatFailureClassForReason);
    expect(new Set(classes).size).toBe(5);
    for (const [expected, reason] of Object.entries(named)) {
      expect(chatFailureClassForReason(reason), reason).toBe(expected);
    }
  });

  it("does not collapse the provider's ceiling into the owner's quota", () => {
    // The regression this prevents is telling the owner they spent something
    // they did not: `provider_rate_limited` is the provider throttling us.
    expect(chatFailureClassForReason("provider_rate_limited")).toBe("provider");
    expect(chatFailureClassForReason("quota_exceeded")).toBe("quota");
    expect(chatFailureClassForReason("provider_rate_limited"))
      .not.toBe(chatFailureClassForReason("quota_exceeded"));
  });
});

describe("the row and the sentence are the same decision", () => {
  it("returns the sink's own reason alongside the class", () => {
    // If these were two calls to `classifyError` they could drift. The action
    // records `reason` and renders `failure`; both come from one call.
    const quota = classifyChatFailure({ detail: "QUOTA_AI_MONTHLY" });
    expect(quota.reason).toBe("quota_exceeded");
    expect(quota.failure).toBe("quota");

    const timeout = classifyChatFailure(Object.assign(new Error("x"), { name: "AbortError" }));
    expect(timeout.reason).toBe("timeout");
    expect(timeout.failure).toBe("temporary");

    const denied = classifyChatFailure({ code: "42501" });
    expect(denied.reason).toBe("permission_denied");
    expect(denied.failure).toBe("credential");

    const upstream = classifyChatFailure({ status: 503 });
    expect(upstream.reason).toBe("provider_error");
    expect(upstream.failure).toBe("provider");
  });

  it("agrees with classifyError for every shape it is given", () => {
    for (const shape of [
      null,
      "a string",
      new Error("boom"),
      { code: "PGRST116" },
      { code: "23514" },
      { status: 429 },
      { detail: "ACCOUNT_LIFECYCLE_SUSPENDED" },
    ]) {
      expect(classifyChatFailure(shape).reason).toBe(classifyError(shape));
    }
  });
});

describe("nothing the provider or the database said reaches the owner", () => {
  it("never interpolates a thrown message, code or status into the sentence", () => {
    const thrown = {
      code: "42501",
      status: 503,
      detail: "QUOTA_AI_MONTHLY exceeded for org acct_9931",
      message: "openai: model gpt-5.6-terra refused key sk-live-abcdef",
    };
    const { failure } = classifyChatFailure(thrown);
    for (const locale of locales) {
      const sentence = chatFailureMessage(locale, failure, CORRELATION);
      for (const leak of ["openai", "gpt-5.6-terra", "sk-live", "acct_9931", "42501", "503", "QUOTA_AI_MONTHLY"]) {
        expect(sentence, `${locale} leaked ${leak}`).not.toContain(leak);
      }
      // The one variable value that may appear is the sink's correlation id.
      expect(sentence).toContain(CORRELATION);
    }
  });

  it("carries the reference on every class, so no failure is unquotable", () => {
    for (const locale of locales) {
      for (const failure of CHAT_FAILURE_CLASSES) {
        expect(chatFailureMessage(locale, failure, CORRELATION), `${locale}/${failure}`)
          .toContain(CORRELATION);
      }
    }
  });
});

describe("the copy is complete and localized", () => {
  it("answers in both locales for every class", () => {
    for (const locale of locales) {
      for (const failure of CHAT_FAILURE_CLASSES) {
        const copy = chatFailureCopy(locale, failure);
        expect(copy.message.length, `${locale}/${failure}`).toBeGreaterThan(20);
      }
    }
  });

  it("differs between locales, so a missing translation cannot pass", () => {
    // Two locales returning the same string is the shape of a stub that was
    // never translated. Every class must actually differ.
    for (const failure of CHAT_FAILURE_CLASSES) {
      expect(chatFailureCopy("pt-BR", failure).message, failure)
        .not.toBe(chatFailureCopy("en", failure).message);
    }
  });

  it("says the question was saved wherever that is true", () => {
    // The one reassurance that is load-bearing: the user message is inserted
    // before the provider work begins, so every failure inside the try really
    // does leave the question in the thread. Saying so is what makes "try
    // again" safe rather than a suggestion to retype.
    for (const failure of CHAT_FAILURE_CLASSES) {
      expect(chatFailureCopy("pt-BR", failure).message, failure).toMatch(/ficou salva/);
      expect(chatFailureCopy("en", failure).message, failure).toMatch(/was saved/);
    }
  });

  it("routes only the two classes the owner can act on, and to real destinations", () => {
    const withStep = CHAT_FAILURE_CLASSES.filter(
      (failure) => chatFailureCopy("pt-BR", failure).nextStep !== null,
    );
    expect([...withStep].sort()).toEqual(["credential", "quota"]);
    // A next step that points nowhere is worse than none: it moves the owner
    // away from their question to a page that cannot help.
    for (const failure of withStep) {
      for (const locale of locales) {
        const step = chatFailureCopy(locale, failure).nextStep!;
        expect(step.path, `${locale}/${failure}`).toMatch(/^app\/[a-z]+$/);
        expect(step.label.length).toBeGreaterThan(4);
      }
    }
  });

  it("is not vacuous: an unmapped class would be visible", () => {
    const bogus = "definitely_not_a_class" as unknown as ChatFailureClass;
    expect(CHAT_FAILURE_CLASSES as readonly string[]).not.toContain(bogus);
    expect(() => chatFailureCopy("pt-BR", bogus).message.length).toThrow();
  });
});
