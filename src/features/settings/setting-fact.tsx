import type { ReactNode } from "react";

/**
 * A setting, as a fact that is changed in place — Editorial calmo (ADR-180),
 * after the task detail's list of facts (ADR-185).
 *
 * Closed, it is one row: what the setting is, what it is set to now, and one
 * verb. Open, the same row carries its editor underneath — the controls and
 * the Server Action it always had, unchanged.
 *
 * ## A native `<details>`, not state
 *
 * - It needs no client boundary, so the Server Components that render most of
 *   Ajustes can use it without becoming Client Components.
 * - The editor stays mounted while closed. A form inside keeps its draft, its
 *   `useActionState` outcome and its focus when the row is closed and reopened,
 *   and a `router.refresh()` after a save does not shut the row the owner is
 *   reading the result in.
 * - `group` (the element's `name`) makes the rows of one list exclusive:
 *   opening one closes the other — "one row open at a time", done by the
 *   browser.
 * - Find-in-page and the keyboard work as the platform defines them.
 *
 * The two verbs are both in the summary and the stylesheet shows the one that
 * applies; the other is `display: none`, so it is not in the accessible name.
 *
 * ## The label may be a heading
 *
 * `heading` renders the label as that element, a direct child of `<summary>`
 * (which is where HTML allows a heading), so a row can stay in the page's
 * outline (`h1` → `h2` → `h3`) where the component it replaces had a heading.
 */
export function SettingFact({
  label,
  labelId,
  heading,
  value,
  verb,
  closeVerb,
  group,
  open,
  className,
  children,
}: {
  /** What the setting is. */
  label: string;
  labelId?: string;
  heading?: "h2" | "h3";
  /** What it is set to now, in words. */
  value?: ReactNode;
  verb: string;
  closeVerb: string;
  /** Rows sharing a group open one at a time. */
  group?: string;
  /** Open on arrival — for the row the page is asking the owner to deal with. */
  open?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Label = heading ?? "span";
  return (
    <details className={className ? `setting-fact ${className}` : "setting-fact"} name={group} open={open}>
      <summary className="setting-fact-summary">
        <Label className="setting-fact-label" id={labelId}>{label}</Label>
        {value ? <span className="setting-fact-value">{value}</span> : null}
        <span className="setting-fact-verb" data-when="closed">{verb}</span>
        <span className="setting-fact-verb" data-when="open">{closeVerb}</span>
      </summary>
      <div className="setting-fact-editor">{children}</div>
    </details>
  );
}
