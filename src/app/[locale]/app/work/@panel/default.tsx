/**
 * The unmatched-slot fallback (`2L-EDIT-007`).
 *
 * Rendered on a hard load of any route under `/app/work` that is not an
 * intercepted task — including the detail's own route, which must then be the
 * whole surface rather than a panel over an empty list. Without this file Next
 * would answer 404 for the slot instead of nothing.
 */
export default function WorkPanelDefault() {
  return null;
}
