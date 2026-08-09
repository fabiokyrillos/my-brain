/**
 * Everything else under `/app/work`, with no panel (`2L-EDIT-007`).
 *
 * The recovery route is the live case: a user with a task panel open who
 * follows the link to `/app/work/cancelled` would otherwise keep the panel,
 * because a slot's active subpage survives a client-side navigation that no
 * longer matches it. This is the documented way to close one — match the slot
 * to something that renders nothing.
 *
 * It does not shadow the intercepting route beside it: an interception is
 * resolved for the segment it names, and a catch-all is the least specific
 * match there is.
 */
export default function WorkPanelElsewhere() {
  return null;
}
