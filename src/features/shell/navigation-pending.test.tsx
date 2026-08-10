import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLinkStatus } from "next/link";
import { NavigationPendingIndicator } from "./navigation-pending";

vi.mock("next/link", () => ({ useLinkStatus: vi.fn() }));

describe("NavigationPendingIndicator", () => {
  it("announces an active route transition", () => {
    vi.mocked(useLinkStatus).mockReturnValue({ pending: true });
    render(<NavigationPendingIndicator locale="pt-BR" />);

    expect(screen.getByRole("status")).toHaveTextContent("Abrindo…");
  });

  it("stays absent when its link is idle", () => {
    vi.mocked(useLinkStatus).mockReturnValue({ pending: false });
    render(<NavigationPendingIndicator locale="en" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
