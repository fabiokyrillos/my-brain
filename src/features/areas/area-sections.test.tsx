import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AreaSections } from "./area-sections";
import { getAreaCopy } from "./copy";

afterEach(cleanup);

const ZONE = "America/Sao_Paulo";
const normal = { kind: "derived", level: "normal" } as const;

describe("AreaSections — an area of life's page", () => {
  it("renders the timeline newest first, with the record's own words and its fact date", () => {
    render(
      <AreaSections
        events={{ status: "ok", events: [] }}
        locale="pt-BR"
        people={[]}
        records={{ status: "ok", total: 2, bounded: false, records: [
          { id: "e2", preview: "Exame de sangue em jejum", occurredAt: "2026-11-04T12:00:00.000Z", sensitivity: normal },
          { id: "e1", preview: "Consulta com o cardiologista", occurredAt: "2026-11-01T12:00:00.000Z", sensitivity: normal },
        ] }}
        tasks={[]}
        timeZone={ZONE}
      />,
    );
    const timeline = screen.getByRole("heading", { name: /Linha do tempo/ }).closest("section")!;
    const links = within(timeline).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Exame de sangue em jejum", "Consulta com o cardiologista"]);
    expect(links[0]).toHaveAttribute("href", "/pt-BR/app/inbox/e2");
    expect(within(timeline).getByText("2 registros")).toBeInTheDocument();
  });

  it("keeps a highly sensitive record in position with its words withheld", () => {
    render(
      <AreaSections
        events={{ status: "ok", events: [] }}
        locale="pt-BR"
        people={[]}
        records={{ status: "ok", total: 1, bounded: false, records: [
          { id: "e9", preview: "Diagnóstico que não deve aparecer", occurredAt: "2026-11-04T12:00:00.000Z", sensitivity: { kind: "derived", level: "highly_sensitive" } },
        ] }}
        tasks={[]}
        timeZone={ZONE}
      />,
    );
    expect(screen.queryByText("Diagnóstico que não deve aparecer")).toBeNull();
    expect(document.querySelector('[data-masked="true"]')).not.toBeNull();
  });

  it("says a failed read failed, and an event with a period offers what happened inside it", () => {
    const copy = getAreaCopy("pt-BR");
    render(
      <AreaSections
        events={{ status: "ok", events: [{
          id: "ev1", title: "Viagem a Lisboa", startsAt: "2026-12-03T03:00:00.000Z", endsAt: "2026-12-11T02:59:59.000Z",
          allDay: true, sourceEntryId: null, sensitivity: { kind: "undetermined" },
          inPeriod: [{ id: "r1", preview: "Jantar no Bairro Alto", occurredAt: "2026-12-05T22:00:00.000Z", sensitivity: normal }],
        }] }}
        locale="pt-BR"
        people={null}
        records={{ status: "failed" }}
        tasks={null}
        timeZone={ZONE}
      />,
    );
    expect(screen.getByText("Viagem a Lisboa")).toBeInTheDocument();
    expect(screen.getByText(copy.inPeriod(1))).toBeInTheDocument();
    expect(screen.getByText(copy.timelineFailed)).toBeInTheDocument();
    expect(screen.getByText(copy.pendingFailed)).toBeInTheDocument();
    expect(screen.getByText(copy.peopleFailed)).toBeInTheDocument();
  });
});
