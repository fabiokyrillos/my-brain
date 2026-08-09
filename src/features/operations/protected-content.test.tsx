import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";
import { ProtectedContent } from "./protected-content";
import { getWorkCopy } from "./copy";

afterEach(cleanup);

/**
 * `2L-PRIVACY-003`, `-004`, `-007`, `-008` — the one component every Work
 * surface withholds content through.
 *
 * The convergence requirement is structural: the list, the detail and every
 * surface after them mount *this*, so "the list and the detail agree" is not a
 * property anybody has to maintain. What is asserted here is therefore the
 * behaviour of the single component — masked in place, revealed locally, and
 * never persisted.
 */

const masked: TaskSensitivity = { kind: "derived", level: "highly_sensitive" };
const ordinary: TaskSensitivity = { kind: "derived", level: "normal" };
const undetermined: TaskSensitivity = { kind: "undetermined" };

function renderProtected(sensitivity: TaskSensitivity, locale: "pt-BR" | "en" = "en") {
  return render(
    <ProtectedContent locale={locale} revealKey="task-1" sensitivity={sensitivity}>
      <span>Revisar o contrato</span>
    </ProtectedContent>,
  );
}

describe("ProtectedContent", () => {
  it("renders an ordinary task's content untouched", () => {
    renderProtected(ordinary);
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a manual task's content untouched", () => {
    // `2L-PRIVACY-004`: no source, no derivable classification, and no mask —
    // and, just as importantly, no invented `normal`.
    renderProtected(undetermined);
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
  });

  it("withholds a highly sensitive task's content and says something is there", () => {
    renderProtected(masked);
    expect(screen.queryByText("Revisar o contrato")).toBeNull();
    // `2L-PRIVACY-003`: the *existence* is not hidden. A row that vanished would
    // make the count a lie; a row that says nothing is honest.
    expect(screen.getByText(getWorkCopy("en").protected.label)).toBeVisible();
  });

  it("reveals in place, on an explicit local action", () => {
    renderProtected(masked);
    fireEvent.click(screen.getByRole("button", { name: getWorkCopy("en").protected.reveal }));
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
  });

  it("hides again on a second explicit action", () => {
    renderProtected(masked);
    const copy = getWorkCopy("en").protected;
    fireEvent.click(screen.getByRole("button", { name: copy.reveal }));
    fireEvent.click(screen.getByRole("button", { name: copy.hide }));
    expect(screen.queryByText("Revisar o contrato")).toBeNull();
  });

  it("reveals only itself: two masked items do not share a reveal", () => {
    render(
      <>
        <ProtectedContent locale="en" revealKey="task-1" sensitivity={masked}>
          <span>First secret</span>
        </ProtectedContent>
        <ProtectedContent locale="en" revealKey="task-2" sensitivity={masked}>
          <span>Second secret</span>
        </ProtectedContent>
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: getWorkCopy("en").protected.reveal })[0]);
    expect(screen.getByText("First secret")).toBeVisible();
    expect(screen.queryByText("Second secret")).toBeNull();
  });

  it("names what the control does to which object, in both locales", () => {
    // `2L-ACCESS-003`: controls that differ only by row must be distinguishable,
    // so the accessible name carries the row's own label rather than a bare verb.
    for (const locale of ["pt-BR", "en"] as const) {
      cleanup();
      render(
        <ProtectedContent
          locale={locale}
          revealKey="task-1"
          sensitivity={masked}
          describedAs="Revisar o contrato"
        >
          <span>Revisar o contrato</span>
        </ProtectedContent>,
      );
      const copy = getWorkCopy(locale).protected;
      expect(screen.getByRole("button", { name: copy.revealFor("Revisar o contrato") })).toBeVisible();
    }
  });

  it("keeps a masked row openable, without putting the withheld text in the link", () => {
    // The Work list's title is both the content and the way in. Masking it
    // naively would leave a row nobody can open, which `2L-PRIVACY-003` never
    // asked for: the content is withheld, the row stays truthful and reachable.
    render(
      <ProtectedContent
        href="/en/app/work/task-1"
        locale="en"
        revealKey="task-1"
        sensitivity={masked}
      >
        <span>Revisar o contrato</span>
      </ProtectedContent>,
    );
    const link = screen.getByRole("link", { name: getWorkCopy("en").protected.label });
    expect(link).toHaveAttribute("href", "/en/app/work/task-1");
    expect(link).not.toHaveTextContent("Revisar o contrato");
  });

  it("persists nothing — the reveal is local and transient (OD-2J-1)", () => {
    // Asserted on the source rather than on behaviour, in the shape
    // `sensitivity-convergence.test.ts` established: a component that wrote the
    // reveal anywhere would still pass every behavioural test above.
    const code = readFileSync(join(__dirname, "protected-content.tsx"), "utf8");
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie|agent_preferences/);
  });
});
