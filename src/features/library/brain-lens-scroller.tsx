"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Life Brain D.2 — the Memória lens strip says when it hides tabs (T3).
 *
 * The strip scrolled sideways with its scrollbar hidden (`brain.css`), so on an
 * iPhone half the lenses were off screen and nothing said so. Three signals now,
 * none of them a gesture (OD-2M-6 A):
 *
 * - the current lens is scrolled into view when the page opens, so the owner
 *   never lands on a lens whose tab is off screen;
 * - each edge that hides tabs fades (`data-overflow-start` / `-end` on the
 *   frame), which is the platform's own way of saying "there is more";
 * - the scrollbar is visible again, thin.
 *
 * The tabs are still links, still in one `<nav>`, still reachable by Tab.
 */

const EDGE_TOLERANCE = 1;

export function overflowEdges(box: {
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}): { readonly start: boolean; readonly end: boolean } {
  const hidden = box.scrollWidth - box.clientWidth;
  if (hidden <= EDGE_TOLERANCE) return { start: false, end: false };
  return {
    start: box.scrollLeft > EDGE_TOLERANCE,
    end: box.scrollLeft < hidden - EDGE_TOLERANCE,
  };
}

export function BrainLensScroller({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  const strip = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    node.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const measure = () => setEdges(overflowEdges(node));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  return (
    <div
      className="brain-lenses-frame"
      data-overflow-end={edges.end ? "true" : "false"}
      data-overflow-start={edges.start ? "true" : "false"}
    >
      <nav
        aria-label={label}
        className="brain-lenses"
        onScroll={(event) => setEdges(overflowEdges(event.currentTarget))}
        ref={strip}
      >
        {children}
      </nav>
    </div>
  );
}
