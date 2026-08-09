"use client";

/**
 * `2L-EDIT-007` — closing the task panel.
 *
 * `router.back()` rather than a link to `/app/work`, because the panel was
 * opened *from a position*: a view, a page, and — after slice 2L.3 — a filter,
 * an ordering and a grouping. A link would send the user to the list's default
 * instead of to where they actually were, which is the "back went somewhere
 * else" failure `2L-RETURN-001` exists to end.
 *
 * A `<button>` and not an `<a>`, deliberately. It performs a history operation
 * rather than naming a destination, and an anchor with an `href` that lies
 * about where it leads is worse than a button that says what it does.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function TaskPanelClose({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button className="back-link task-panel-close" onClick={() => router.back()} type="button">
      <ArrowLeft size={16} aria-hidden="true" />{label}
    </button>
  );
}
