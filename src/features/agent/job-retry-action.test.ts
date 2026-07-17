import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as agentActions from "./actions";
import type { AgentFormState } from "./forms";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/preferences", () => ({ defaultAgentPreferences: {} }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));

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
      from: vi.fn().mockReturnValue(query),
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
