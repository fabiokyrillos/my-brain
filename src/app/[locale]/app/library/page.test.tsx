import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(async () => ({ supabase: {}, user: { id: "user-1" } })),
}));
vi.mock("@/features/entities/actions", () => ({ createOrganization: vi.fn() }));
vi.mock("@/features/profile/owner-timezone", () => ({ getOwnerTimeZone: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("@/features/library/overview", () => ({ loadBrainOverview: vi.fn() }));
vi.mock("@/features/library/life-areas", () => ({ loadLifeAreas: vi.fn() }));
vi.mock("@/features/areas/area-page", () => ({ loadAreaCounts: vi.fn(), loadIdeas: vi.fn() }));

import { loadAreaCounts, loadIdeas } from "@/features/areas/area-page";
import type { LibraryDomainSummary } from "@/features/library/contracts";
import { loadLifeAreas } from "@/features/library/life-areas";
import { loadBrainOverview } from "@/features/library/overview";

import LibraryPage from "./page";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const NORMAL = { kind: "derived", level: "normal" } as const;

function domain(key: string, overrides: Partial<LibraryDomainSummary> = {}): LibraryDomainSummary {
  return {
    key,
    href: `/pt-BR/app/${key}`,
    count: 3,
    countSupported: true,
    recent: [],
    recentSurface: null,
    recencySupported: false,
    recentFailed: false,
    ...overrides,
  } as LibraryDomainSummary;
}

const PEOPLE = domain("people", {
  count: 42,
  recencySupported: true,
  recent: [
    { id: "p1", label: "Dr. Silva", sensitivity: null },
    { id: "p2", label: "Marina Duarte", sensitivity: null },
  ],
});
const MEMORIES = domain("memories", {
  count: 63,
  recencySupported: true,
  recentSurface: "memory",
  recent: [{ id: "m1", label: "Prefiro consultas pela manhã.", sensitivity: NORMAL }],
});

async function mount(domains: readonly LibraryDomainSummary[] = [PEOPLE, MEMORIES, domain("contexts")]) {
  vi.mocked(loadBrainOverview).mockResolvedValue(domains);
  vi.mocked(loadLifeAreas).mockResolvedValue({
    status: "ok",
    bounded: false,
    areas: [{ id: "a1", name: "Saúde", kind: "health" }, { id: "a2", name: "Ideias", kind: "ideas" }],
  });
  vi.mocked(loadAreaCounts).mockResolvedValue(new Map([["a1", { count: 19, atLeast: false }]]));
  vi.mocked(loadIdeas).mockResolvedValue({
    status: "ok",
    records: [{ id: "e1", preview: "Um deck de madeira na varanda.", occurredAt: "2026-11-12T22:10:00.000Z", sensitivity: NORMAL }],
  });
  return render(await LibraryPage({ params: Promise.resolve({ locale: "pt-BR" }) }) as React.ReactElement);
}

/** Document order of two nodes: true when `first` comes before `second`. */
const precedes = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("the overview is for finding something: search comes first", () => {
  it("offers search as the first control after the page's name", async () => {
    await mount();
    const search = screen.getByRole("link", { name: "Buscar em tudo" });
    expect(search.getAttribute("href")).toBe("/pt-BR/app/search");
    const strip = screen.getByRole("navigation", { name: "Lentes da Memória" });
    expect(precedes(screen.getByRole("heading", { level: 1, name: "Memória" }), search)).toBe(true);
    expect(precedes(search, strip)).toBe(true);
  });

  it("orders the page: what the Brain holds, then the areas, then the ideas", async () => {
    await mount();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "O que o Brain guarda",
      "Áreas da vida",
      "Ideias",
    ]);
  });
});

describe("a domain is one row: its name, its count and what it last learned", () => {
  it("makes the domain's name the link to its own route", async () => {
    await mount();
    const index = screen.getByRole("region", { name: "O que o Brain guarda" });
    const rows = within(index).getAllByRole("heading", { level: 3 });
    expect(rows.map((row) => row.textContent)).toEqual(["Pessoas", "Memórias", "Áreas da vida"]);
    expect(within(rows[0]!).getByRole("link").getAttribute("href")).toBe("/pt-BR/app/people");
  });

  it("has one link per row, so the row has one destination", async () => {
    const { container } = await mount();
    for (const row of container.querySelectorAll(".brain-domain")) {
      expect(row.querySelectorAll("a")).toHaveLength(1);
    }
  });

  it("shows the count and the latest labels as the row's context", async () => {
    const { container } = await mount();
    const people = container.querySelectorAll<HTMLElement>(".brain-domain")[0]!;
    expect(within(people).getByText("42")).toBeInTheDocument();
    expect([...people.querySelectorAll(".brain-recent li")].map((item) => item.textContent)).toEqual(["Dr. Silva", "Marina Duarte"]);
  });

  it("says what a domain is for where it has no recency source, instead of describing the page", async () => {
    const { container } = await mount();
    const contexts = container.querySelectorAll<HTMLElement>(".brain-domain")[2]!;
    expect(within(contexts).getByText("Áreas da sua vida.")).toBeInTheDocument();
    expect(screen.queryByText("Sem lista recente por aqui.")).toBeNull();
    // A row that DOES show recent labels does not also carry the sentence.
    expect(screen.queryByText("Quem faz parte da sua vida.")).toBeNull();
  });

  it("keeps the three count states apart: a figure, a failed read, and no table at all", async () => {
    const { container } = await mount([
      domain("people", { count: 7 }),
      domain("files", { count: null }),
      domain("chat", { count: null, countSupported: false }),
    ]);
    const [counted, failed, uncounted] = [...container.querySelectorAll<HTMLElement>(".brain-domain")];
    expect(within(counted!).getByText("7")).toBeInTheDocument();
    expect(within(failed!).getByText("Não foi possível contar agora.")).toBeInTheDocument();
    expect(uncounted!.querySelector(".brain-domain-count, .brain-domain-unavailable")).toBeNull();
  });

  it("never prints an empty domain where the recent read failed", async () => {
    await mount([domain("people", { recencySupported: true, recentFailed: true })]);
    expect(screen.getByText(/Não foi possível ler os recentes agora/)).toBeInTheDocument();
    expect(screen.queryByText("Nada aqui ainda.")).toBeNull();
  });

  it("says a domain is empty only when its recent read succeeded with nothing", async () => {
    await mount([domain("people", { recencySupported: true })]);
    expect(screen.getByText("Nada aqui ainda.")).toBeInTheDocument();
  });
});

describe("the areas and the ideas are rows that lead somewhere", () => {
  it("links each area to its own page, with its real count when one was read", async () => {
    await mount();
    const areas = screen.getByRole("region", { name: "Áreas da vida" });
    const health = within(areas).getByRole("link", { name: /Saúde/ });
    expect(health.getAttribute("href")).toBe("/pt-BR/app/contexts/a1");
    expect(within(health).getByText("19 registros")).toBeInTheDocument();
    // No count was read for the second area: it shows none rather than a zero.
    expect(within(within(areas).getByRole("link", { name: /Ideias/ })).queryByText(/registro/)).toBeNull();
    expect(within(areas).getByRole("link", { name: "Ver todas as áreas" }).getAttribute("href")).toBe("/pt-BR/app/contexts");
  });

  it("links each idea to its record, and the lens to the Ideias area", async () => {
    await mount();
    const ideas = screen.getByRole("region", { name: "Ideias" });
    expect(within(ideas).getByRole("link", { name: "Um deck de madeira na varanda." }).getAttribute("href")).toBe("/pt-BR/app/inbox/e1");
    expect(within(ideas).getByRole("link", { name: "Ver a área Ideias" }).getAttribute("href")).toBe("/pt-BR/app/contexts/a2");
  });
});

describe("creating an organization stays reachable from the overview", () => {
  it("offers it once, as the page's last control, not under the lens strip", async () => {
    await mount();
    const buttons = screen.getAllByRole("button", { name: /nova organização/i });
    expect(buttons).toHaveLength(1);
    expect(precedes(screen.getByRole("region", { name: "Ideias" }), buttons[0]!)).toBe(true);
  });
});
