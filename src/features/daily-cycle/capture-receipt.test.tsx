import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaptureReceiptView } from "./capture-receipt";
import type { CaptureReceipt } from "./contracts";

function receipt(overrides: Partial<CaptureReceipt> = {}): CaptureReceipt {
  return {
    entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    persisted: true,
    productState: "organizing",
    messageKey: "capture_saved",
    replayed: false,
    ...overrides,
  };
}

describe("CaptureReceiptView", () => {
  it("announces the localized save message as a status region", () => {
    render(<CaptureReceiptView receipt={receipt()} locale="pt-BR" />);

    expect(screen.getByRole("status")).toHaveTextContent("Salvo. A organização foi solicitada.");
  });

  it("renders the English replay message when the capture was deduplicated", () => {
    render(<CaptureReceiptView receipt={receipt({ messageKey: "capture_replayed", replayed: true })} locale="en" />);

    expect(screen.getByRole("status")).toHaveTextContent("This record was already saved.");
  });

  it("offers a safe link to the record when the action supplied one", () => {
    render(<CaptureReceiptView receipt={receipt({ safeHref: "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" })} locale="pt-BR" />);

    expect(screen.getByRole("link", { name: "Ver registro" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    );
  });

  it("never renders a link when no safe href was supplied", () => {
    render(<CaptureReceiptView receipt={receipt()} locale="en" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
