import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

import type { AICostSummary, AIUsageRow } from "@/lib/ai/cost-summary";

import { CostsView, type PriceRow } from "./cost-view";

const usd = (value: number) => Math.round(value * 1_000_000_000);

const SUMMARY: AICostSummary = {
  todayCostNanoUsd: usd(0.42),
  monthCostNanoUsd: usd(12.84),
  allTimeCostNanoUsd: usd(40),
  monthCalls: 120,
  allTimeCalls: 400,
  monthTokens: 9000,
  unpricedCalls: 0,
  byModel: [{ key: "gpt-5.6-terra", costNanoUsd: usd(40), calls: 400, inputTokens: 1000, outputTokens: 200 }],
  byOperation: [
    { key: "chat", costNanoUsd: usd(30), calls: 300, inputTokens: 800, outputTokens: 150 },
    { key: "review", costNanoUsd: usd(10), calls: 100, inputTokens: 200, outputTokens: 50 },
  ],
};

const USAGE: AIUsageRow[] = [
  {
    id: "u1",
    operation: "chat",
    model: "gpt-5.6-terra",
    input_tokens: 4000,
    cached_input_tokens: 2048,
    output_tokens: 510,
    reasoning_tokens: 0,
    cost_usd: "0.012300",
    cost_status: "calculated",
    created_at: "2026-11-18T14:12:00.000Z",
  },
  {
    id: "u2",
    operation: "review",
    model: "some-new-model",
    input_tokens: 10,
    cached_input_tokens: 0,
    output_tokens: 5,
    reasoning_tokens: 0,
    cost_usd: null,
    cost_status: "unpriced",
    created_at: "2026-11-18T13:12:00.000Z",
  },
];

const PRICING: PriceRow[] = [
  {
    id: "p1",
    model: "gpt-5.6-terra",
    input_usd_per_million: "2.500",
    cached_input_usd_per_million: "0.250",
    output_usd_per_million: "15",
    pricing_version: "openai-2026-10-01",
    source_url: "https://example.test/pricing",
    effective_from: "2026-10-01",
  },
];

function view(overrides: Partial<Parameters<typeof CostsView>[0]> = {}) {
  return render(
    <CostsView
      agentName="Michael"
      locale="pt-BR"
      pricing={PRICING}
      pricingUnreadable={false}
      profile="balanced"
      quotaUsage={[{ detail: "QUOTA_ENTRIES_PER_DAY", ceiling: 300, used: 14, window: "utc-day" }]}
      summary={SUMMARY}
      timezone="America/Sao_Paulo"
      usage={USAGE}
      usageUnreadable={false}
      {...overrides}
    />,
  );
}

describe("Custos — the figure is the subject", () => {
  it("opens with this month's amount, named, before anything else", () => {
    const { container } = view();
    const figure = container.querySelector(".cost-figure")!;
    expect(container.firstElementChild).toBe(figure);
    expect(within(figure as HTMLElement).getByText("Este mês")).toBeInTheDocument();
    expect(figure.querySelector(".cost-figure-value")?.textContent).toBe("US$ 12,84");
  });

  it("says the two other periods beside their names", () => {
    const { container } = view();
    const others = [...container.querySelectorAll(".cost-figure-others > div")].map((node) => node.textContent);
    expect(others).toEqual(["HojeUS$ 0,42", "Desde o inícioUS$ 40,00"]);
  });

  it("says once what kind of number it is, and the zone its periods use (2O-COST-006)", () => {
    const { container } = view();
    const captions = container.querySelectorAll(".cost-zone");
    expect(captions).toHaveLength(1);
    expect(captions[0].textContent).toContain("Estimativa");
    expect(captions[0].textContent).toContain("fuso da sua conta (America/Sao_Paulo)");
  });

  it("states unpriced calls in words, only when there are some", () => {
    expect(view().container.querySelector(".cost-warning")).toBeNull();
    const { container } = view({ summary: { ...SUMMARY, unpricedCalls: 2 } });
    expect(container.querySelector(".cost-warning")?.textContent).toContain("2 chamadas sem preço");
  });
});

describe("Custos — what makes the spend up is rows", () => {
  it("lists each function with its amount, its part of the whole and a rule as long as that part", () => {
    const { container } = view();
    const section = container.querySelector(".cost-section")!;
    expect(within(section as HTMLElement).getByRole("heading", { level: 2 }).textContent).toContain("Por função");
    const rows = [...section.querySelectorAll(".cost-row")];
    expect(rows.map((row) => row.querySelector(".cost-row-label")?.textContent)).toEqual([
      "Chat principal",
      "Revisões e resumos",
    ]);
    expect(rows[0].querySelector(".cost-row-amount")?.textContent).toBe("US$ 30,00");
    expect(rows[0].querySelector(".cost-row-caption")?.textContent).toBe("75% · 300 chamadas");
    expect((rows[0].querySelector(".cost-row-rule > span") as HTMLElement).style.width).toBe("75%");
    expect((rows[1].querySelector(".cost-row-rule > span") as HTMLElement).style.width).toBe("25%");
  });

  it("says the breakdown covers the whole ledger, not the month above it", () => {
    const { container } = view();
    expect(container.querySelector(".cost-section-title small")?.textContent).toBe("desde o início");
  });

  it("draws no table and no card", () => {
    const { container } = view();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("article")).toBeNull();
  });
});

describe("Custos — what is consulted is folded", () => {
  it("keeps the per-model split, the last calls and the price catalogue closed", () => {
    const { container } = view();
    const folds = [...container.querySelectorAll("details.cost-fold")] as HTMLDetailsElement[];
    expect(folds.map((fold) => fold.querySelector("summary > span")?.textContent)).toEqual([
      "Por modelo",
      "Últimas chamadas",
      "Preços aplicados",
    ]);
    expect(folds.every((fold) => !fold.open)).toBe(true);
  });

  it("writes a call as a row: function, one caption, the amount — or that it has no price", () => {
    const { container } = view();
    const rows = [...container.querySelectorAll(".recent-costs .cost-row")];
    expect(rows).toHaveLength(USAGE.length);
    expect(rows[0].querySelector(".cost-row-caption")?.textContent).toMatch(
      /GPT-5\.6 Terra · 4\.510 tokens · 2\.048 em cache$/,
    );
    expect(rows[0].querySelector(".cost-row-amount")?.textContent).toBe("US$ 0,01");
    expect(rows[1].querySelector(".cost-row-amount")?.textContent).toBe("Sem preço");
    expect(rows[1].querySelector(".cost-row-caption")?.textContent).not.toContain("em cache");
  });

  it("makes a catalogue row the link to its source", () => {
    const { container } = view();
    const link = container.querySelector(".pricing-catalog .cost-row-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://example.test/pricing");
    expect(link.textContent).toContain("entrada $2.5 · cache $0.25 · saída $15");
  });

  it("says a failed read of the calls or the catalogue as one, inside its fold (2O-COST-007)", () => {
    const { container } = view({ usage: [], usageUnreadable: true, pricing: [], pricingUnreadable: true });
    expect(container.querySelector(".recent-costs .cost-read-failed")?.textContent).toContain(
      "Não foi possível ler as últimas chamadas",
    );
    expect(container.querySelector(".pricing-catalog .cost-read-failed")?.textContent).toContain(
      "Não foi possível ler o catálogo",
    );
  });
});

describe("Custos — states that are not a figure", () => {
  it("never prints a zero for a summary it could not read (2O-COST-007)", () => {
    const { container } = view({ summary: null });
    const figure = container.querySelector(".cost-figure.unreadable")!;
    expect(figure.textContent).toContain("Não foi possível ler o total.");
    expect(figure.textContent).toContain("Isto não significa custo zero.");
    expect(container.textContent).not.toContain("0,00");
    expect(container.querySelector(".cost-section")).toBeNull();
    // What did not fail is still on the page.
    expect(container.querySelector(".quota-section")).not.toBeNull();
    expect(container.querySelector(".pricing-catalog")).not.toBeNull();
  });

  it("says there is no cost yet instead of a breakdown of nothing", () => {
    const { container } = view({
      summary: { ...SUMMARY, allTimeCalls: 0, allTimeCostNanoUsd: 0, monthCostNanoUsd: 0, byModel: [], byOperation: [] },
      usage: [],
    });
    expect(screen.getByText("Nenhum custo registrado ainda")).toBeInTheDocument();
    expect(container.querySelector(".cost-figure")).toBeNull();
    expect(container.querySelector(".cost-section")).toBeNull();
    expect(container.querySelector(".recent-costs")).toBeNull();
  });
});

describe("Custos — limits and the way out", () => {
  it("keeps the account's ceilings on the page as rows (2O-COST-002)", () => {
    const { container } = view();
    const item = container.querySelector(".quota-item")!;
    expect(item.textContent).toContain("Registros por dia");
    expect(item.querySelector(".quota-figure")?.textContent).toBe("14 de 300");
    expect(container.querySelector(".quota-intro")?.textContent).toContain("meia-noite UTC");
  });

  it("ends with one link: the profile that decides the figure", () => {
    const { container } = view();
    const link = container.querySelector(".cost-profile") as HTMLAnchorElement;
    expect(container.lastElementChild).toBe(link);
    expect(link.getAttribute("href")).toBe("/pt-BR/app/settings");
    expect(link.textContent).toBe("Perfil de IAEquilibrado");
  });

  it("speaks English from the same module", () => {
    const { container } = view({ locale: "en" });
    expect(container.querySelector(".cost-figure-period")?.textContent).toBe("This month");
    expect(container.querySelector(".cost-figure-value")?.textContent).toBe("$12.84");
    expect(container.querySelector(".cost-profile")?.textContent).toBe("AI profileBalanced");
  });
});
