"use client";

/**
 * A task row's actions in a sheet — Life Brain A.3 part 3 (`LB-A-006`,
 * `DESIGN_DIRECTION.md` §6.1).
 *
 * On a phone the row's inline actions are hidden by CSS and this "⋯" is what
 * remains: one square, named for its row, that opens the same actions at the
 * bottom of the screen. On a wider viewport the trigger is hidden instead and
 * the inline group is the interface.
 *
 * ## Why `ConfirmDialog`, not a new modal
 *
 * `DESIGN_DIRECTION.md` §4 lists a `Sheet` as A.3's primitive *"so no slice
 * invents a modal before it exists"*. The product already has exactly one
 * modal — `ConfirmDialog`, with initial focus, the Tab cycle, Escape with focus
 * returned, the scroll lock, the outside tap and the discard question, each
 * tested and each fixed on a real iPhone. A second implementation in
 * `src/components/ui` would be the invented modal the rule exists to prevent,
 * so the sheet is that dialog presented from the bottom: `work-row-sheet` is a
 * presentation class and nothing else.
 *
 * ## What it holds, and what it deliberately does not
 *
 * The row's own verbs (`WorkItemActions`: complete, wait, resume, reopen) and a
 * link to the task page. **Not** the quick edit: its controls open
 * `ConfirmDialog`s of their own, and a dialog inside a dialog would put two
 * Escape handlers and two focus cycles on one document. Everything the quick
 * edit changes is on the task page, one tap from here, and the sentence under
 * the title says so.
 *
 * ## Why a portal
 *
 * The list is a size container (`.list-stack { container-type: inline-size }`,
 * which is how its rows reflow by their own width), and a size container is the
 * containing block for every `position: fixed` element inside it. Rendered in
 * place, the backdrop would cover the list instead of the screen and the sheet
 * would sit at the list's bottom edge. The dialog is portalled to `document.body`
 * — only while open, which only ever happens after hydration, so the server
 * never renders it.
 *
 * ## No gesture
 *
 * OD-2L-5 A: no swipe, no long press, no drag on a Work surface
 * (`phase-2l-no-gesture-guard` scans this file). The sheet opens from a visible,
 * labelled button and closes from one.
 */

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { IconButton, buttonVariants } from "@/components/ui";
import type { WorkItemView } from "@/features/daily-cycle/contracts";
import { ConfirmDialog } from "@/features/task-commands/confirm-dialog";
import type { Locale } from "@/lib/preferences";
import { getWorkCopy } from "./copy";
import type { TaskUndoHandler } from "./undo-affordance";
import { WorkItemActions, type WorkItemActionHandler } from "./work-item-actions";

export function RowActionsSheet({
  action,
  label,
  locale,
  openHref,
  task,
  undoAction,
}: {
  action: WorkItemActionHandler;
  /** What the row may be called: its title, or the protected stub when masked. */
  label: string;
  locale: Locale;
  openHref?: string;
  task: WorkItemView;
  undoAction?: TaskUndoHandler;
}) {
  const [open, setOpen] = useState(false);
  const copy = getWorkCopy(locale).rowActions;

  return (
    <>
      <IconButton
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={copy.moreFor(label)}
        className="work-row-more"
        icon={<MoreHorizontal />}
        onClick={() => setOpen(true)}
        // `md`, not `sm`: the full 44px whatever the pointer reports. A
        // narrow desktop window is still a phone-shaped row.
        size="md"
      />
      {open ? createPortal(
        <ConfirmDialog
          cancelLabel={copy.close}
          className="work-row-sheet"
          description={copy.description}
          // Nothing here can be typed into: the forms carry hidden fields and a
          // submit, so there is nothing an outside tap could throw away.
          discard={null}
          idPrefix={`work-row-sheet-${task.taskId}`}
          onClose={() => setOpen(false)}
          open={open}
          title={label}
        >
          <WorkItemActions action={action} locale={locale} task={task} undoAction={undoAction} />
          {openHref ? (
            <Link className={buttonVariants({ variant: "secondary", size: "md" })} href={openHref}>
              {copy.open}
            </Link>
          ) : null}
        </ConfirmDialog>,
        document.body,
      ) : null}
    </>
  );
}
