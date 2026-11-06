/**
 * Life Brain B.7 — "é preencher, não enviar", as behaviour rather than as a
 * comment.
 *
 * Every case below is one sentence of the owner's complaint of 5 November 2026:
 * the chip must put its question **in the field**, it must not navigate, it must
 * not send, and it must never destroy what the owner already typed.
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ComposerSeedProvider,
  MAX_SEED_LENGTH,
  boundSeed,
  fillField,
  useComposerSeed,
  useRegisterComposerSeed,
} from "./composer-seed";

afterEach(cleanup);

/** A stand-in for the composer: one field that registers itself and nothing else. */
function Field({ onFill }: { onFill?: (text: string) => void }) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const lastFill = useRef<string | null>(null);
  useRegisterComposerSeed((text) => {
    onFill?.(text);
    const target = field.current;
    if (target === null) return;
    lastFill.current = fillField(target, text, lastFill.current);
  });
  return <textarea aria-label="field" ref={field} />;
}

/** A stand-in for the chip, so this file tests the channel and not the chip. */
function Chip({ question }: { question: string }) {
  const seed = useComposerSeed();
  return (
    <button
      data-ready={seed?.ready ? "yes" : "no"}
      onClick={() => seed?.fill(question)}
      type="button"
    >
      {question}
    </button>
  );
}

describe("boundSeed: the one bound both paths honour", () => {
  it("trims and cuts at the same length `?q=` has always used", () => {
    expect(MAX_SEED_LENGTH).toBe(240);
    expect(boundSeed("  O que tenho hoje?  ")).toBe("O que tenho hoje?");
    expect(boundSeed("a".repeat(400))).toHaveLength(MAX_SEED_LENGTH);
  });

  it("turns whitespace into nothing, so a blank chip fills nothing", () => {
    expect(boundSeed("   ")).toBe("");
  });
});

describe("fillField: the one rule for text arriving in a field", () => {
  function field(value: string) {
    const node = document.createElement("textarea");
    node.value = value;
    document.body.append(node);
    return node;
  }

  it("fills an empty field", () => {
    const node = field("");
    expect(fillField(node, "O que tenho hoje?", null)).toBe("O que tenho hoje?");
    expect(node.value).toBe("O que tenho hoje?");
  });

  it("joins the owner's own sentence rather than replacing it (2P-CAPTURE-006)", () => {
    const node = field("Preciso saber");
    fillField(node, "o que tenho hoje?", null);
    expect(node.value).toBe("Preciso saber o que tenho hoje?");
  });

  it("replaces the previous fill, because the common fix is tapping another chip", () => {
    const node = field("");
    const first = fillField(node, "Pergunta um?", null);
    fillField(node, "Pergunta dois?", first);
    expect(node.value).toBe("Pergunta dois?");
  });

  it("stops replacing the moment the owner types into it", () => {
    const node = field("");
    const first = fillField(node, "Pergunta um?", null);
    node.value = `${first} e mais`;
    fillField(node, "Pergunta dois?", first);
    expect(node.value).toBe("Pergunta um? e mais Pergunta dois?");
  });

  it("leaves the caret at the end, so the next keystroke continues the sentence", () => {
    const node = field("");
    fillField(node, "Pergunta?", null);
    expect(node.selectionStart).toBe("Pergunta?".length);
  });
});

describe("the channel: a chip fills the composer and sends nothing", () => {
  it("puts the chip's question in the registered field", async () => {
    render(
      <ComposerSeedProvider>
        <Field />
        <Chip question="Tem algum aniversário próximo?" />
      </ComposerSeedProvider>,
    );

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByLabelText("field")).toHaveValue("Tem algum aniversário próximo?");
  });

  it("bounds what it fills, wherever the question came from", async () => {
    const seen = vi.fn();
    render(
      <ComposerSeedProvider>
        <Field onFill={seen} />
        <Chip question={"a".repeat(400)} />
      </ComposerSeedProvider>,
    );

    await userEvent.click(screen.getByRole("button"));
    expect(seen).toHaveBeenCalledWith("a".repeat(MAX_SEED_LENGTH));
  });

  it("reports that a composer is listening, so a surface can tell", () => {
    render(
      <ComposerSeedProvider>
        <Field />
        <Chip question="Pergunta?" />
      </ComposerSeedProvider>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-ready", "yes");
  });

  it("reports that none is, when the field is not there", () => {
    render(
      <ComposerSeedProvider>
        <Chip question="Pergunta?" />
      </ComposerSeedProvider>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-ready", "no");
  });

  it("does nothing at all outside a provider, rather than failing the surface", async () => {
    render(<Chip question="Pergunta?" />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("data-ready", "no");
  });

  it("stops listening when the composer unmounts", () => {
    function Surface({ withField }: { withField: boolean }) {
      return (
        <ComposerSeedProvider>
          {withField ? <Field /> : null}
          <Chip question="Pergunta?" />
        </ComposerSeedProvider>
      );
    }
    const { rerender } = render(<Surface withField />);
    expect(screen.getByRole("button")).toHaveAttribute("data-ready", "yes");
    rerender(<Surface withField={false} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-ready", "no");
  });
});
