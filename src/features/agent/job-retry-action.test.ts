import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import * as agentActions from "./actions";
import type { AgentFormState } from "./forms";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/preferences", () => ({
  defaultAgentPreferences: {},
  resolveLocale: (value: unknown) => (value === "en" ? "en" : "pt-BR"),
}));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "44444444-4444-5444-8444-444444444444"),
  recordProductEvent: vi.fn(),
}));
// 2H-RATE-001. Admitted by default so the pre-existing cases keep testing what
// they were written to test; the refusal case below flips it deliberately.
vi.mock("@/features/rate-limits/server", () => ({
  admitRateLimitedOperation: vi.fn(async () => ({ ok: true })),
}));

type RetryAction = (
  state: AgentFormState,
  formData: FormData,
) => Promise<AgentFormState>;

const retryAttachmentJob = (agentActions as unknown as {
  retryAttachmentJob?: RetryAction;
}).retryAttachmentJob;

const idleState: AgentFormState = { status: "idle", message: "" };
const jobId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function retryForm(locale: "pt-BR" | "en", id = jobId) {
  const formData = new FormData();
  formData.set("locale", locale);
  formData.set("jobId", id);
  return formData;
}

function createSupabaseMock(initialJob: object | null, finalJob?: object | null) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValueOnce({ data: initialJob, error: null });
  if (finalJob !== undefined)
    maybeSingle.mockResolvedValueOnce({ data: finalJob, error: null });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const lifecycleQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
  };
  lifecycleQuery.select.mockReturnValue(lifecycleQuery);
  lifecycleQuery.eq.mockReturnValue(lifecycleQuery);
  const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "access-token" } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => (table === "account_lifecycle" ? lifecycleQuery : query)),
      functions: { invoke },
    },
    invoke,
  };
}

describe("retryAttachmentJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects untrusted malformed input before opening a data client", async () => {
    expect(retryAttachmentJob).toBeTypeOf("function");
    if (!retryAttachmentJob) return;

    const result = await retryAttachmentJob(
      idleState,
      retryForm("pt-BR", "not-a-uuid"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Não foi possível tentar novamente.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rechecks ownership and reports the persisted completed state", async () => {
    expect(retryAttachmentJob).toBeTypeOf("function");
    if (!retryAttachmentJob) return;

    const { client, invoke } = createSupabaseMock(
      {
        id: jobId,
        status: "failed",
        attempts: 1,
        max_attempts: 5,
        next_attempt_at: "2020-01-01T00:00:00.000Z",
      },
      { status: "completed", next_attempt_at: "2020-01-01T00:00:00.000Z" },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryAttachmentJob(idleState, retryForm("pt-BR"));

    expect(invoke).toHaveBeenCalledWith("process-jobs", {
      body: { jobId },
      headers: { authorization: "Bearer access-token" },
    });
    expect(result).toEqual({ status: "success", message: "Análise concluída." });
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/files");
  });

  it("does not invoke a job that is not owned by the authenticated user", async () => {
    expect(retryAttachmentJob).toBeTypeOf("function");
    if (!retryAttachmentJob) return;

    const { client, invoke } = createSupabaseMock(null);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryAttachmentJob(idleState, retryForm("en"));

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "error", message: "Job is not available." });
  });

  it("2H-RATE-001: a rate refusal stops the retry before the worker is invoked", async () => {
    // PRD §14.2 V-4: a user-initiated retry consumes a slot, so it can be
    // refused. What matters is where the refusal lands — before the invoke, so
    // no provider work is started and no attempt is spent on a request the
    // ceiling had already declined.
    expect(retryAttachmentJob).toBeTypeOf("function");
    if (!retryAttachmentJob) return;

    vi.mocked(admitRateLimitedOperation).mockResolvedValueOnce({
      ok: false,
      refusal: "RATE_LIMIT_AI",
      message: "Hourly AI pace reached. …",
    });

    const { client, invoke } = createSupabaseMock({
      id: jobId,
      status: "failed",
      attempts: 1,
      max_attempts: 5,
      next_attempt_at: "2020-01-01T00:00:00.000Z",
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryAttachmentJob(idleState, retryForm("en"));

    expect(invoke).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toContain("Hourly AI pace reached");
  });

  it("honors the persisted backoff before invoking the worker", async () => {
    expect(retryAttachmentJob).toBeTypeOf("function");
    if (!retryAttachmentJob) return;

    const { client, invoke } = createSupabaseMock({
      id: jobId,
      status: "failed",
      attempts: 1,
      max_attempts: 5,
      next_attempt_at: "2100-01-01T00:00:00.000Z",
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryAttachmentJob(idleState, retryForm("en"));

    expect(invoke).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toContain("Retry available");
  });
});
