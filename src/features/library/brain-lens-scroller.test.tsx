import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrainLensScroller, overflowEdges } from "./brain-lens-scroller";

/**
 * Life Brain D.2 (T3, V1 3:47: "eu tenho várias abas. Eu tenho que fazer um
 * scroll horizontal, que não é legal"). The strip scrolled with its scrollbar
 * hidden and nothing on screen said there were more tabs.
 */

afterEach(cleanup);

describe("overflowEdges", () => {
  it("says which edges hide tabs", () => {
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({ start: false, end: false });
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 })).toEqual({ start: false, end: true });
    expect(overflowEdges({ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 })).toEqual({ start: true, end: true });
    expect(overflowEdges({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 })).toEqual({ start: true, end: false });
  });

  it("tolerates the sub-pixel remainder a zoomed page leaves", () => {
    expect(overflowEdges({ scrollLeft: 299.4, scrollWidth: 600, clientWidth: 300 })).toEqual({ start: true, end: false });
  });
});

function geometry(node: HTMLElement, values: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(node, "scrollWidth", { configurable: true, value: values.scrollWidth });
  Object.defineProperty(node, "clientWidth", { configurable: true, value: values.clientWidth });
}

describe("BrainLensScroller", () => {
  it("marks the edge that hides tabs, and updates as it scrolls", () => {
    const { container } = render(
      <BrainLensScroller label="Lentes">
        <a href="#a">A</a>
        <a aria-current="page" href="#b">B</a>
      </BrainLensScroller>,
    );
    const strip = container.querySelector("nav") as HTMLElement;
    const frame = container.querySelector(".brain-lenses-frame") as HTMLElement;
    geometry(strip, { scrollWidth: 600, clientWidth: 300 });
    fireEvent.scroll(strip);
    expect(frame.dataset.overflowEnd).toBe("true");
    expect(frame.dataset.overflowStart).toBe("false");

    strip.scrollLeft = 300;
    fireEvent.scroll(strip);
    expect(frame.dataset.overflowStart).toBe("true");
    expect(frame.dataset.overflowEnd).toBe("false");
  });

  it("brings the current tab into view when it opens", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <BrainLensScroller label="Lentes">
        <a href="#a">A</a>
        <a aria-current="page" href="#b">B</a>
      </BrainLensScroller>,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("keeps the strip a labelled navigation landmark", () => {
    const { getByRole } = render(<BrainLensScroller label="Lentes"><a href="#a">A</a></BrainLensScroller>);
    expect(getByRole("navigation", { name: "Lentes" })).toHaveClass("brain-lenses");
  });
});
