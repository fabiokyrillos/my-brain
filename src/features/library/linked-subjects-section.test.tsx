import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { boundedList } from "@/features/bounds/contracts";

import { getFileLibraryCopy } from "./copy";
import { ATTACHMENT_LINK_LIMIT, type LinkOutcome } from "./link-contracts";
import { LinkedFilesSection, LinkedSubjectsSection } from "./linked-subjects-section";
import { NO_CLASSIFICATION, type LinkedFile, type LinkedSubject } from "./linked-subjects";

afterEach(cleanup);

/**
 * `2N-FILES-003`/`-005`/`-009`, `2N-PERSON-008` — the three states, and the
 * control that must not exist.
 *
 * The load-bearing assertion in this file is a **negative** one: with no writer
 * for `entity_attachments`, the empty state must not carry a button, a disabled
 * control, or any affordance implying a link can be created. A test suite that
 * only checked the rows would pass on a version that shipped a dead "Link a
 * file" button, which is the single most likely way this slice could have gone
 * wrong.
 */

const OK: LinkOutcome<unknown> = { status: "ok", list: boundedList([], ATTACHMENT_LINK_LIMIT) };
const FAILED: LinkOutcome<unknown> = { status: "failed" };

const subject = (overrides: Partial<LinkedSubject> = {}): LinkedSubject => ({
  entityType: "person",
  entityId: "person-1",
  label: "Marina",
  sensitivity: NO_CLASSIFICATION,
  ...overrides,
});

const file = (overrides: Partial<LinkedFile> = {}): LinkedFile => ({
  attachmentId: "file-1",
  name: "contrato.pdf",
  status: "ready",
  sensitivity: NO_CLASSIFICATION,
  ...overrides,
});

const copy = getFileLibraryCopy("pt-BR");

function subjects(items: LinkedSubject[], bounded = false) {
  return bounded
    ? boundedList([...items, subject({ entityId: "overflow" })], items.length)
    : boundedList(items, ATTACHMENT_LINK_LIMIT);
}

describe("the file → subject direction", () => {
  it("renders a resolved subject as a link to its page", () => {
    render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files#file-1"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([subject()])}
      />,
    );
    const link = screen.getByRole("link", { name: "Marina" });
    expect(link.getAttribute("href")).toContain("/pt-BR/app/people/person-1");
  });

  it("returns the reader to the exact card they left", () => {
    render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files#file-1"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([subject()])}
      />,
    );
    expect(screen.getByRole("link", { name: "Marina" }).getAttribute("href")).toContain(
      encodeURIComponent("/pt-BR/app/files#file-1"),
    );
  });

  it("routes each authorized type to its own surface", () => {
    render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([
          subject({ entityType: "project", entityId: "project-1", label: "Atlas" }),
          subject({ entityType: "entry", entityId: "entry-1", label: "Reunião" }),
        ])}
      />,
    );
    expect(screen.getByRole("link", { name: "Atlas" }).getAttribute("href")).toContain(
      "/app/projects/project-1",
    );
    expect(screen.getByRole("link", { name: "Reunião" }).getAttribute("href")).toContain(
      "/app/inbox/entry-1",
    );
  });

  it("states its bound rather than looking complete", () => {
    render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([subject()], true)}
      />,
    );
    expect(screen.getByRole("note", { hidden: true })).toBeTruthy();
  });
});

describe("the empty state is honest, and carries no control", () => {
  it("says there is no link, and why none can be made", () => {
    render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([])}
      />,
    );
    expect(screen.getByText(copy.linkedEmpty)).toBeTruthy();
    expect(screen.getByText(copy.linkedNoWriter)).toBeTruthy();
  });

  it("offers no button, enabled or disabled, that would promise a link", () => {
    const { container } = render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([])}
      />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("input,select")).toHaveLength(0);
  });

  it("is not rendered as an error", () => {
    const { container } = render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={OK}
        subjects={subjects([])}
      />,
    );
    expect(container.querySelector("[data-link-state='empty']")).toBeTruthy();
    expect(container.querySelector("[data-link-state='failed']")).toBeNull();
    expect(container.querySelector(".form-error")).toBeNull();
  });
});

describe("a failed read is not an empty set", () => {
  it("says the links could not be read, and does not claim there are none", () => {
    const { container } = render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={FAILED}
        subjects={subjects([])}
      />,
    );
    expect(screen.getByText(copy.linkedFailed)).toBeTruthy();
    expect(screen.queryByText(copy.linkedEmpty)).toBeNull();
    expect(container.querySelector("[data-link-state='failed']")).toBeTruthy();
  });

  it("does not render a bound notice for a read that did not happen", () => {
    const { container } = render(
      <LinkedSubjectsSection
        back="/pt-BR/app/files"
        locale="pt-BR"
        outcome={FAILED}
        subjects={subjects([subject()], true)}
      />,
    );
    expect(container.querySelector("[data-bounded='true']")).toBeNull();
  });
});

describe("the subject → file direction converges on the same contract", () => {
  const statusLabel = (value: string) => `state:${value}`;

  it("renders a resolved file with its processing state", () => {
    render(
      <LinkedFilesSection
        files={boundedList([file()], ATTACHMENT_LINK_LIMIT)}
        locale="pt-BR"
        outcome={OK}
        statusLabel={statusLabel}
      />,
    );
    expect(screen.getByRole("link", { name: "contrato.pdf" })).toBeTruthy();
    expect(screen.getByText("state:ready")).toBeTruthy();
  });

  it("uses the same honest empty state, with no control", () => {
    const { container } = render(
      <LinkedFilesSection
        files={boundedList([], ATTACHMENT_LINK_LIMIT)}
        locale="pt-BR"
        outcome={OK}
        statusLabel={statusLabel}
      />,
    );
    expect(screen.getByText(copy.linkedFilesEmpty)).toBeTruthy();
    expect(screen.getByText(copy.linkedNoWriter)).toBeTruthy();
    expect(container.querySelectorAll("button,form,input,select")).toHaveLength(0);
  });

  it("distinguishes a failed read from an empty one", () => {
    render(
      <LinkedFilesSection
        files={boundedList([], ATTACHMENT_LINK_LIMIT)}
        locale="pt-BR"
        outcome={FAILED}
        statusLabel={statusLabel}
      />,
    );
    expect(screen.getByText(copy.linkedFilesFailed)).toBeTruthy();
    expect(screen.queryByText(copy.linkedFilesEmpty)).toBeNull();
  });
});

describe("both locales carry the copy", () => {
  it("renders the English empty state on the English page", () => {
    const en = getFileLibraryCopy("en");
    render(
      <LinkedFilesSection
        files={boundedList([], ATTACHMENT_LINK_LIMIT)}
        locale="en"
        outcome={OK}
        statusLabel={(value) => value}
      />,
    );
    expect(screen.getByText(en.linkedFilesEmpty)).toBeTruthy();
    expect(en.linkedFilesEmpty).not.toBe(copy.linkedFilesEmpty);
  });
});

describe("2N-PRIVACY-002: a classified subject is masked in place", () => {
  it("withholds a highly sensitive label and offers a local reveal", () => {
    render(
      <LinkedFilesSection
        files={boundedList(
          [file({ sensitivity: { kind: "derived", level: "highly_sensitive" } })],
          ATTACHMENT_LINK_LIMIT,
        )}
        locale="pt-BR"
        outcome={OK}
        statusLabel={(value) => value}
      />,
    );
    expect(screen.queryByText("contrato.pdf")).toBeNull();
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("shows a normal label with no reveal control at all", () => {
    render(
      <LinkedFilesSection
        files={boundedList(
          [file({ sensitivity: { kind: "derived", level: "normal" } })],
          ATTACHMENT_LINK_LIMIT,
        )}
        locale="pt-BR"
        outcome={OK}
        statusLabel={(value) => value}
      />,
    );
    expect(screen.getByText("contrato.pdf")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not put the withheld name into the accessible name of the control", () => {
    const { container } = render(
      <LinkedFilesSection
        files={boundedList(
          [file({ sensitivity: { kind: "derived", level: "highly_sensitive" } })],
          ATTACHMENT_LINK_LIMIT,
        )}
        locale="pt-BR"
        outcome={OK}
        statusLabel={(value) => value}
      />,
    );
    expect(container.innerHTML).not.toContain("contrato.pdf");
  });
});
