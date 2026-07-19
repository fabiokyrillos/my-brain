import { beforeEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { answerPendingQuestion } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "66666666-6666-5666-8666-666666666666"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));
vi.mock("@/lib/jobs/entry-worker", () => ({ kickEntryInterpretationWorker: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/preferences", () => ({ defaultAgentPreferences: {} }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));

const questionId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function form() {
  const data = new FormData();
  data.set("locale", "pt-BR");
  data.set("questionId", questionId);
  data.set("answer", "Resposta privada que nunca entra no evento");
  return data;
}

function questionClient(error: unknown = null) {
  const query = {
    eq: vi.fn(function (this: unknown) { return this; }),
    select: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: error ? null : { id: questionId }, error })),
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    from: vi.fn(() => ({ update: vi.fn(() => query) })),
  };
}

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

describe("answerPendingQuestion analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits only a subject-scoped basic answer outcome after the owner update succeeds", async () => {
    vi.mocked(createClient).mockResolvedValue(questionClient() as never);

    const result = await answerPendingQuestion({ status: "idle", message: "" }, form());

    expect(result.status).toBe("success");
    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "question_answered_basic",
      subject: { type: "pending_question", id: questionId },
      properties: {},
    }));
    expect(JSON.stringify(vi.mocked(recordProductEvent).mock.calls[0][0])).not.toContain("Resposta privada");
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("question_answered_basic", questionId);
  });

  it("does not emit when the owner-scoped update fails", async () => {
    vi.mocked(createClient).mockResolvedValue(questionClient({ code: "42501", message: "forbidden" }) as never);

    const result = await answerPendingQuestion({ status: "idle", message: "" }, form());

    expect(result.status).toBe("error");
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });
});
