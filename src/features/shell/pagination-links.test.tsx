import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaginationLinks } from "./pagination-links";

afterEach(cleanup);

describe("PaginationLinks", () => {
  it("renders no controls for a single first page", () => {
    const { container } = render(
      <PaginationLinks locale="pt-BR" path="tasks" page={1} hasNext={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders localized previous and next links", () => {
    render(<PaginationLinks locale="en" path="tasks" page={2} hasNext />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/en/app/tasks?page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/en/app/tasks?page=3",
    );
  });
});
