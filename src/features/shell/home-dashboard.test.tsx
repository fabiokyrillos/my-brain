import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth/require-user";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import type { InboxItemView } from "@/features/daily-cycle/contracts";
import { HomeDashboard } from "./home-dashboard";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/daily-cycle/inbox-projection", () => ({ loadInboxProjection: vi.fn() }));
vi.mock("@/features/capture/actions", () => ({ captureEntry: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Result = { data: unknown; error: unknown; count?: number | null };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.maybeSingle = vi.fn(async () => result);
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub;
}

function setup(options: {
  items?: readonly InboxItemView[];
  tasks?: Array<{ id: string; title: string; due_at: string | null; status: string }>;
} = {}) {
  const { items = [], tasks = [] } = options;

  const tasksBuilders = [
    queryStub({ data: tasks, error: null }),
    queryStub({ data: null, error: null, count: 0 }),
  ];
  const from = vi.fn((table: string) => {
    if (table === "tasks") return tasksBuilders.shift();
    if (table === "pending_questions") return queryStub({ data: [], error: null });
    return queryStub({ data: null, error: null });
  });
  const supabase = { from };
  vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
  vi.mocked(loadInboxProjection).mockResolvedValue({ items, hasNext: false });
  return { supabase };
}

function item(overrides: Partial<InboxItemView> = {}): InboxItemView {
  return {
    entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    title: "Ligar para a Marina",
    originalPreview: "Ligar para a Marina sobre o contrato do Atlas.",
    productState: "ready",
    significantAt: "2026-07-17T12:00:00.000Z",
    availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" }],
    originalPreserved: true,
    ...overrides,
  };
}

describe("HomeDashboard", () => {
  it("renders recent activity through the shared inbox projection with localized product-state labels", async () => {
    setup({
      items: [
        item({ entryId: "entry-1", title: "Ligar para a Marina", productState: "ready" }),
        item({ entryId: "entry-2", title: "Revisar orçamento", productState: "needs_attention", attentionReason: "confirm_existing_candidates" }),
      ],
    });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Atividade recente")).toBeInTheDocument();
    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(screen.getByText("Revisar orçamento")).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
    expect(screen.getByText("Precisa de você")).toBeInTheDocument();
  });

  it("never renders a raw internal product state or entry lifecycle string", async () => {
    setup({ items: [item({ productState: "could_not_organize", attentionReason: "retry_processing" })] });

    render(await HomeDashboard({ locale: "en" }));

    expect(screen.queryByText("could_not_organize")).not.toBeInTheDocument();
    expect(screen.queryByText("retry_processing")).not.toBeInTheDocument();
    expect(screen.getByText("Could not organize")).toBeInTheDocument();
  });

  it("shows an empty state for recent activity when the inbox projection has no items", async () => {
    setup({ items: [] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Atividade recente")).toBeInTheDocument();
    expect(screen.getByText(/Nada por aqui ainda/)).toBeInTheDocument();
  });

  it("still renders the existing priority task panel unchanged", async () => {
    setup({ tasks: [{ id: "task-1", title: "Preparar reunião", due_at: null, status: "todo" }] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Preparar reunião")).toBeInTheDocument();
  });
});
