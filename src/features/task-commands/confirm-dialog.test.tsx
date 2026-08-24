import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { scrollLockHolders } from "@/features/shell/use-scroll-lock";

import { ConfirmDialog, type DiscardGuard } from "./confirm-dialog";

/**
 * The second device checkpoint's findings two and three, on the shared dialog
 * every modal in the product is built from.
 *
 * *"Com o modal aberto, ainda consigo rolar a página atrás dele."*
 * *"Tocar fora do modal não fecha o modal."*
 * *"Se houver algo escrito ou alterado, fechar pelo backdrop deve pedir
 * confirmação antes de descartar."*
 *
 * Asserted here rather than in any one consumer, because six surfaces mount this
 * component and a contract proved on one of them is a contract five of them can
 * quietly break.
 */

const DISCARD: DiscardGuard = {
  confirmLabel: "Descartar",
  prompt: "Descartar o que você escreveu?",
  resumeLabel: "Continuar editando",
};

/**
 * The children are a real `<form>`, because the dialog derives *"has anything
 * changed?"* from its own contents rather than from a flag a consumer supplies.
 *
 * That matters for these tests specifically: a stubbed `isDirty` would have
 * proved the prompt renders, and nothing at all about whether it renders at the
 * right times. Every case below makes the form genuinely dirty, or deliberately
 * does not.
 */
const CONTENT = (
  <>
    <form>
      <label htmlFor="note">Nota</label>
      <input defaultValue="" id="note" name="note" type="text" />
    </form>
    <button type="button">Confirmar</button>
  </>
);

function mount(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <ConfirmDialog
      cancelLabel="Fechar"
      description="d"
      discard={null}
      onClose={onClose}
      open
      title="t"
      {...props}
    >
      {CONTENT}
    </ConfirmDialog>,
  );
  return { ...view, onClose };
}

const backdrop = () => document.querySelector(".task-command-dialog-backdrop") as HTMLElement;

/** Actually edits the form, which is the only way this dialog becomes dirty. */
const edit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Nota"), "meio escrito");
};

/** A press that starts and ends on the same element, which is what a tap is. */
const tap = async (user: ReturnType<typeof userEvent.setup>, target: HTMLElement) => {
  await user.click(target);
};

describe("the page behind does not move while a dialog is open", () => {
  it("holds the document and gives it back when the dialog goes", () => {
    const { rerender } = render(
      <ConfirmDialog cancelLabel="Fechar" description="d" discard={null} onClose={vi.fn()} open title="t">
        {CONTENT}
      </ConfirmDialog>,
    );
    expect(scrollLockHolders()).toBe(1);
    expect(document.body.style.position).toBe("fixed");

    rerender(
      <ConfirmDialog cancelLabel="Fechar" description="d" discard={null} onClose={vi.fn()} open={false} title="t">
        {CONTENT}
      </ConfirmDialog>,
    );
    expect(scrollLockHolders()).toBe(0);
    expect(document.body.style.position).toBe("");
  });
});

describe("tapping outside means cancel", () => {
  it("closes immediately when there is nothing to lose", async () => {
    // The three consumers whose whole body is hidden inputs and buttons. An
    // outside tap is cancel, and cancel is safe.
    const user = userEvent.setup();
    const { onClose } = mount();
    await tap(user, backdrop());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes immediately when an editable dialog has not been edited", async () => {
    // Focus is not an edit, which is *"não considere sujo apenas porque um
    // campo recebeu foco"* asserted rather than asserted about.
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await user.click(screen.getByLabelText("Nota"));
    await tap(user, backdrop());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes immediately once an edit has been undone by hand", async () => {
    // *"Reverter manualmente os campos ao valor inicial deve voltar ao estado
    // limpo."* True by construction: the same contents serialise the same way
    // however they got there.
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);
    await user.clear(screen.getByLabelText("Nota"));
    await tap(user, backdrop());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("never closes on a press inside the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await tap(user, screen.getByRole("dialog"));
    await tap(user, screen.getByLabelText("Nota"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(DISCARD.prompt)).toBeNull();
  });

  it("does not close when the press began inside and ended on the backdrop", async () => {
    /*
      Selecting the text of a field and releasing past the edge of the panel
      produces a `click` whose target IS the backdrop. Acting on that alone
      interrupts somebody in the middle of editing, which is why the press has to
      have started out here too.
    */
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);
    fireEvent.pointerDown(screen.getByLabelText("Nota"));
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(DISCARD.prompt), "it asked about a drag, not a dismissal").toBeNull();
  });
});

describe("a dialog holding something asks before losing it", () => {
  it("puts the question up instead of closing", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);
    await tap(user, backdrop());

    expect(screen.getByText(DISCARD.prompt)).toBeTruthy();
    expect(onClose, "it closed before asking").not.toHaveBeenCalled();
  });

  it("closes once the discard is confirmed", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);
    await tap(user, backdrop());
    await user.click(screen.getByRole("button", { name: DISCARD.confirmLabel }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog and everything in it when the owner goes back", async () => {
    /*
      *"Escolher continuar editando mantém modal e conteúdo intactos."* The body
      is HIDDEN rather than unmounted for exactly this: unmounting the form would
      empty every uncontrolled field in it, which is the thing the question was
      asking whether to throw away.
    */
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);

    await tap(user, backdrop());
    expect(screen.getByLabelText("Nota"), "the form was unmounted").toBeTruthy();

    await user.click(screen.getByRole("button", { name: DISCARD.resumeLabel }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("Nota") as HTMLInputElement).value).toBe("meio escrito");
    expect(screen.queryByText(DISCARD.prompt)).toBeNull();
  });

  it("hides the body rather than removing it, and shows it again", async () => {
    const user = userEvent.setup();
    mount({ discard: DISCARD });
    const body = document.querySelector(".task-command-dialog-body") as HTMLElement;
    expect(body.hasAttribute("hidden")).toBe(false);
    await edit(user);

    await tap(user, backdrop());
    expect(body.hasAttribute("hidden"), "the form is still on screen under the question").toBe(true);

    await user.click(screen.getByRole("button", { name: DISCARD.resumeLabel }));
    expect(body.hasAttribute("hidden")).toBe(false);
  });

  it("asks inside the same panel, with one backdrop and one dialog", async () => {
    // *"Não crie recursão de modais ou dois backdrops competindo."*
    const user = userEvent.setup();
    mount({ discard: DISCARD });
    await edit(user);
    await tap(user, backdrop());

    expect(document.querySelectorAll(".task-command-dialog-backdrop")).toHaveLength(1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(scrollLockHolders(), "the question took a second lock").toBe(1);
  });

  it("puts focus on the way back, not on the destructive answer", async () => {
    const user = userEvent.setup();
    mount({ discard: DISCARD });
    await edit(user);
    await tap(user, backdrop());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: DISCARD.resumeLabel }),
    );
  });

  it("keeps Tab inside the question while it is up", async () => {
    const user = userEvent.setup();
    mount({ discard: DISCARD });
    await edit(user);
    await tap(user, backdrop());

    const prompt = document.querySelector(".task-command-dialog-discard") as HTMLElement;
    await user.tab();
    expect(prompt.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(prompt.contains(document.activeElement), "Tab reached the hidden form").toBe(true);
  });
});

describe("Escape and the cancel button follow the same rule as the backdrop", () => {
  it("Escape asks when there is something to lose", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);
    await user.keyboard("{Escape}");
    expect(screen.getByText(DISCARD.prompt)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape closes straight away when there is not", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("the cancel button asks when there is something to lose", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ discard: DISCARD });
    await edit(user);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.getByText(DISCARD.prompt)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("a write in flight cannot be interrupted", () => {
  it("refuses the backdrop, Escape and its own cancel while busy", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({ busy: true, discard: null });
    await tap(user, backdrop());
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    // And the control is disabled rather than merely inert, so nothing invites
    // the second press that a silent refusal would.
    expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
  });
});

describe("the question does not survive the dialog", () => {
  it("re-opens without a discard prompt left over from last time", async () => {
    // A dialog closed from outside while its question was up would otherwise
    // re-open showing that question over a form nobody had touched.
    const user = userEvent.setup();
    const props = { cancelLabel: "Fechar", description: "d", discard: DISCARD, onClose: vi.fn(), title: "t" };
    const { rerender } = render(<ConfirmDialog {...props} open>{CONTENT}</ConfirmDialog>);
    await edit(user);
    await tap(user, backdrop());
    expect(screen.getByText(DISCARD.prompt)).toBeTruthy();

    rerender(<ConfirmDialog {...props} open={false}>{CONTENT}</ConfirmDialog>);
    rerender(<ConfirmDialog {...props} open>{CONTENT}</ConfirmDialog>);

    expect(screen.queryByText(DISCARD.prompt)).toBeNull();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar" })).toBeTruthy();
  });
});

describe("focus comes back to whatever opened it", () => {
  it("restores the opener on close", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">Abrir</button>
          <ConfirmDialog
            cancelLabel="Fechar"
            description="d"
            discard={null}
            onClose={() => setOpen(false)}
            open={open}
            title="t"
          >
            {CONTENT}
          </ConfirmDialog>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeTruthy();

    await tap(user, backdrop());
    expect(document.activeElement).toBe(opener);
  });
});
