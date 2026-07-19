import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

type ActionSource = {
  id: string;
  href?: string;
};

type CaptureReceiptSource = {
  entryId: string;
  persisted: boolean;
  productState: string;
  messageKey: string;
  safeHref?: string;
  replayed: boolean;
};

type InboxItemSource = {
  entryId: string;
  title: string;
  originalPreview: string;
  significantAt: string;
  originalPreserved: boolean;
  availableActions: readonly ActionSource[];
  lifecycle: {
    entryLifecycle: string;
    job?: { status: string; retryAt?: string | null } | null;
    hasValidTaskCandidates?: boolean;
    hasOpenQuestion?: boolean;
    recordOnly?: boolean;
    hasMaterializedTaskForCandidates?: boolean;
    hasConsistencyIssue?: boolean;
    now?: string;
  };
};

type NeedsAttentionItemSource = {
  key: string;
  kind: string;
  entryId: string;
  title: string;
  explanation: string;
  primaryAction: ActionSource;
  secondaryAction?: ActionSource;
  occurredAt: string;
  groupKey: string;
};

type WorkItemSource = {
  taskId: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  status: string;
  createdBy: string;
  availableActions: readonly ActionSource[];
};

type ProjectionMappersModule = {
  toCaptureReceipt?: (source: CaptureReceiptSource) => unknown;
  toInboxItemView?: (source: InboxItemSource) => unknown;
  toNeedsAttentionItemView?: (source: NeedsAttentionItemSource) => unknown;
  toWorkItemView?: (source: WorkItemSource) => unknown;
};

const mappersPath = `./${"projection-mappers"}.ts`;
const mappers = await vi.importActual<ProjectionMappersModule>(mappersPath).catch(() => ({})) as ProjectionMappersModule;

function map<T>(mapper: ((source: T) => unknown) | undefined, source: T) {
  expect(mapper).toBeTypeOf("function");
  return mapper?.(source);
}

const occurredAt = "2026-07-17T15:00:00.000Z";
const entryActions = [{ id: "open_entry", href: "/pt-BR/app/inbox/entry-1" }];

describe("daily cycle product projection mappers", () => {
  it("maps and serializes the stable CaptureReceipt contract without internal fields", () => {
    const receipt = map(mappers.toCaptureReceipt, {
      entryId: "entry-1",
      persisted: true,
      productState: "organizing",
      messageKey: "capture_saved",
      safeHref: "/pt-BR/app/inbox/entry-1",
      replayed: false,
      jobId: "internal-job-id",
      provider: "internal-provider",
    } as CaptureReceiptSource & { jobId: string; provider: string });

    expect(receipt).toEqual({
      entryId: "entry-1",
      persisted: true,
      productState: "organizing",
      messageKey: "capture_saved",
      safeHref: "/pt-BR/app/inbox/entry-1",
      replayed: false,
    });
    expect(JSON.parse(JSON.stringify(receipt))).toEqual(receipt);
    expect(Object.isFrozen(receipt as object)).toBe(true);
    expect(receipt).not.toHaveProperty("jobId");
    expect(receipt).not.toHaveProperty("provider");
  });

  it("derives InboxItemView from lifecycle input and keeps a stable product-only shape", () => {
    const item = map(mappers.toInboxItemView, {
      entryId: "entry-1",
      title: "Preparar a reunião",
      originalPreview: "Precisamos alinhar os próximos passos.",
      significantAt: occurredAt,
      originalPreserved: true,
      availableActions: entryActions,
      lifecycle: {
        entryLifecycle: "completed",
        hasValidTaskCandidates: true,
      },
      currentInterpretationId: "internal-interpretation-id",
      confidence: 0.94,
      evidence: { source: "model" },
    } as InboxItemSource & { currentInterpretationId: string; confidence: number; evidence: object });

    expect(item).toEqual({
      entryId: "entry-1",
      title: "Preparar a reunião",
      originalPreview: "Precisamos alinhar os próximos passos.",
      productState: "needs_attention",
      attentionReason: "confirm_existing_candidates",
      significantAt: occurredAt,
      availableActions: entryActions,
      originalPreserved: true,
    });
    expect(Object.keys(item as object)).toEqual([
      "entryId",
      "title",
      "originalPreview",
      "productState",
      "attentionReason",
      "significantAt",
      "availableActions",
      "originalPreserved",
    ]);
    expect(Object.isFrozen(item as object)).toBe(true);
    expect(Object.isFrozen((item as { availableActions: object }).availableActions)).toBe(true);
    expect(item).not.toHaveProperty("currentInterpretationId");
    expect(item).not.toHaveProperty("confidence");
    expect(item).not.toHaveProperty("evidence");
  });

  it("maps the product-only contracts for attention and work items", () => {
    const attention = map(mappers.toNeedsAttentionItemView, {
      key: "entry-1:review",
      kind: "review_interpretation",
      entryId: "entry-1",
      title: "Revise a interpretação",
      explanation: "Confira a compreensão antes de seguir.",
      primaryAction: { id: "review_interpretation", href: "/pt-BR/app/inbox/entry-1" },
      secondaryAction: { id: "open_entry", href: "/pt-BR/app/inbox/entry-1" },
      occurredAt,
      groupKey: "entry-1",
      policy: "internal-policy",
    } as NeedsAttentionItemSource & { policy: string });
    const work = map(mappers.toWorkItemView, {
      taskId: "task-1",
      title: "Enviar proposta",
      description: "Versão final",
      dueAt: "2026-07-18T12:00:00.000Z",
      status: "waiting",
      createdBy: "agent",
      availableActions: [{ id: "resume_task" }],
      sourceEntryId: "entry-1",
      candidateIndex: 0,
    } as WorkItemSource & { sourceEntryId: string; candidateIndex: number });

    expect(attention).toEqual({
      key: "entry-1:review",
      kind: "review_interpretation",
      entryId: "entry-1",
      title: "Revise a interpretação",
      explanation: "Confira a compreensão antes de seguir.",
      primaryAction: { id: "review_interpretation", href: "/pt-BR/app/inbox/entry-1" },
      secondaryAction: { id: "open_entry", href: "/pt-BR/app/inbox/entry-1" },
      occurredAt,
      groupKey: "entry-1",
    });
    expect(work).toEqual({
      taskId: "task-1",
      title: "Enviar proposta",
      description: "Versão final",
      dueAt: "2026-07-18T12:00:00.000Z",
      humanState: "waiting_on_someone",
      origin: "brain",
      availableActions: [{ id: "resume_task" }],
    });
    expect(JSON.parse(JSON.stringify(attention))).toEqual(attention);
    expect(JSON.parse(JSON.stringify(work))).toEqual(work);
    expect(Object.isFrozen(attention as object)).toBe(true);
    expect(Object.isFrozen(work as object)).toBe(true);
    expect(work).not.toHaveProperty("sourceEntryId");
    expect(work).not.toHaveProperty("candidateIndex");
  });

  it("fails closed for invalid persistence, lifecycle, status, actions, and unsafe destinations", () => {
    expect(map(mappers.toCaptureReceipt, {
      entryId: "entry-1",
      persisted: false,
      productState: "ready",
      messageKey: "capture_saved",
      replayed: false,
    })).toBeNull();
    expect(map(mappers.toCaptureReceipt, {
      entryId: "entry-1",
      persisted: true,
      productState: "legacy_ready",
      messageKey: "capture_saved",
      safeHref: "https://untrusted.example",
      replayed: false,
    })).toBeNull();
    expect(map(mappers.toInboxItemView, {
      entryId: "entry-1",
      title: "Entrada",
      originalPreview: "Original",
      significantAt: occurredAt,
      originalPreserved: true,
      availableActions: entryActions,
      lifecycle: { entryLifecycle: "legacy_completed" },
    })).toBeNull();
    expect(map(mappers.toNeedsAttentionItemView, {
      key: "entry-1:legacy",
      kind: "unsupported_reason",
      entryId: "entry-1",
      title: "Atenção",
      explanation: "Motivo inválido.",
      primaryAction: { id: "legacy_action" },
      occurredAt,
      groupKey: "entry-1",
    })).toBeNull();
    expect(map(mappers.toWorkItemView, {
      taskId: "task-1",
      title: "Tarefa",
      status: "cancelled",
      createdBy: "agent",
      availableActions: [],
    })).toBeNull();
  });

  it("keeps projection mappers free of React, Supabase, database types, and data access", () => {
    const filePath = path.resolve(process.cwd(), "src/features/daily-cycle/projection-mappers.ts");
    const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";

    expect(source).not.toBe("");
    expect(source).not.toMatch(/(?:from|import)\s*["'][^"']*(?:react|supabase|database\.types)[^"']*["']/i);
    expect(source).not.toMatch(/Database\s*\[\s*["']public["']\s*\]/);
    expect(source).not.toMatch(/\.from\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(/);
    expect(source).not.toMatch(/from\s*["'][^"']*\.tsx?["']/i);
  });
});
