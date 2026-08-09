/**
 * `2L-EDIT-007` — the Work shell: a list, and a slot beside it.
 *
 * ## Why a parallel route rather than a modal component
 *
 * The task detail has to be three things at once: a shareable URL, a full
 * surface on a refresh, and a panel beside the list when the user opened it
 * from there. A component toggled by client state gives up the first two — the
 * URL stops describing what is on screen, and a refresh loses the panel. Next's
 * parallel + intercepting routes are the mechanism for exactly this, so the
 * detail keeps one URL and one implementation, and the interception decides
 * only whether the list stays mounted behind it.
 *
 * ## Why the narrow viewport is not an overlay
 *
 * On a narrow viewport the panel is a *full surface*, and the list beside it is
 * `display: none` rather than covered — see `operations.css`. That is the
 * difference between a surface and an untrapped modal: a covered list is still
 * in the accessibility tree and still reachable by a screen reader while the
 * user believes they are on the task. Removing it means there is nothing behind
 * to escape from, and no focus trap to get wrong.
 *
 * The slot renders `null` for every route that is not an intercepted task
 * (`default.tsx`, `page.tsx`, `[...catchAll]/page.tsx`), so a hard load of the
 * list, of the recovery route, or of the detail's own route shows exactly one
 * surface.
 */
export default function WorkLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  return (
    <div className="work-shell">
      <div className="work-shell-main">{children}</div>
      {panel}
    </div>
  );
}
