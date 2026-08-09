/**
 * The slot at the list itself — deliberately empty (`2L-EDIT-007`).
 *
 * A parallel route keeps its active subpage across client-side navigation, so
 * without this the panel would stay open while the user switched Work views:
 * `?view=waiting` is the same route with a different query, and the slot would
 * have no reason to change. Matching `/app/work` to something that renders
 * nothing is what closes it.
 */
export default function WorkPanelAtList() {
  return null;
}
