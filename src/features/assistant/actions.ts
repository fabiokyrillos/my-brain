"use server";

/**
 * The unified composer's single entry point (UX-07, DEC-3 (a)).
 *
 * This module **routes**; it does not write. Every domain effect it can cause
 * belongs to an action that already existed and is called unchanged:
 * `runTaskCommand` for the whole command pipeline, `sendChatMessage` for the
 * grounded answer. So One Write Path, ownership proof, the pre-state, the
 * operation key, the request fingerprint, destructive confirmation, audit, undo
 * and idempotency are not re-implemented here — there is nothing here to
 * re-implement them with.
 *
 * Three properties are load-bearing:
 *
 * 1. **Nothing is caught.** `sendChatMessage` finishes by redirecting into the
 *    thread, and `redirect()` signals that by throwing. A `try` around the
 *    delegation would swallow it and strand the user on the composer with an
 *    answer they cannot see. The command path already maps its own faults onto
 *    rendered states (`actions.ts`'s `guard`), so there is nothing left for a
 *    catch here to do except break the one case that depends on throwing.
 * 2. **Fallthrough is a declared value, never an exception.** `routing.ts`
 *    decides it from the model's own closed vocabulary; a refusal, a provider
 *    fault and invalid model output all stay with the command pipeline.
 * 3. **The memory branch still cannot write.** It is reached before any provider
 *    call and returns a *proposal* — the memory that would be stored, for the
 *    owner to read and accept. Slice G completes DEC-5's contract by giving that
 *    proposal a confirm control wired to `createProposedMemory`; the write lives
 *    there, behind the owner's explicit act, and there is deliberately still no
 *    path from this module to `memories`.
 */

import { captureEntry } from "@/features/capture/actions";
import { sendChatMessage } from "@/features/chat/actions";
import { readOnlyPreviewCard } from "@/features/conversation-cards/contracts";
import { getMemoryCopy } from "@/features/memories/copy";
import { runTaskCommand } from "@/features/task-commands/actions";
import {
  TASK_COMMAND_INTENTS,
  idleTaskCommandState,
  type TaskCommandIntent,
} from "@/features/task-commands/console-state";
import { resolveLocale, type Locale } from "@/lib/preferences";

import {
  idleAssistantComposerState,
  type AssistantComposerState,
  type AssistantNotice,
} from "./composer-state";
import { getAssistantCopy } from "./copy";
import { buildMemoryProposal } from "./memory-proposal";
import { commandTurnFallsThrough, decideAssistantRoute } from "./routing";

/** The ceiling `chat/actions.ts` already enforces; repeated so the refusal can be localized here. */
const MAX_COMPOSER_TEXT_LENGTH = 12_000;

function isTaskCommandIntent(value: unknown): value is TaskCommandIntent {
  return typeof value === "string"
    && (TASK_COMMAND_INTENTS as readonly string[]).includes(value);
}

function noticed(
  route: AssistantComposerState["route"],
  notice: AssistantNotice,
  echo: string | null,
): AssistantComposerState {
  return {
    ...idleAssistantComposerState,
    route,
    notice,
    echo,
    announcement: `${notice.heading}. ${notice.detail}`,
  };
}

/**
 * The grounded answer, reached only once the command path has declined the turn.
 *
 * The return value is the *failure* shape by construction: a successful
 * `sendChatMessage` redirects to the thread and never returns here. That is the
 * pre-existing behaviour of the chat action and this slice keeps it, so a
 * question still lands the user in the conversation that holds its answer.
 */
async function answerFromKnowledge(
  text: string,
  locale: Locale,
  conversationId: string | null,
): Promise<AssistantComposerState> {
  const copy = getAssistantCopy(locale);
  const request = new FormData();
  request.set("question", text);
  request.set("locale", locale);
  if (conversationId !== null) request.set("conversationId", conversationId);

  const result = await sendChatMessage({ status: "idle", message: "" }, request);
  return noticed(
    "knowledge_failed",
    { heading: copy.knowledgeFailedHeading, detail: result.message, nextStep: null },
    text,
  );
}

export async function runAssistantTurn(
  previous: AssistantComposerState,
  formData: FormData,
): Promise<AssistantComposerState> {
  // Resolved first and independently, because every refusal below happens
  // before any schema succeeds and each of them still has to be localized
  // (ADR-036).
  const locale = resolveLocale(formData.get("locale"));
  const copy = getAssistantCopy(locale);
  const intent = formData.get("intent");

  // Every step *after* the first belongs to the command pipeline — Apply,
  // Confirm, Choose, Clarify, Create, Undo, Restore — and is forwarded with its
  // own state untouched. Re-deriving any of them here would be a second place
  // the confirmation requirement is decided.
  if (isTaskCommandIntent(intent)) {
    const command = await runTaskCommand(previous.command, formData);
    return {
      route: "command",
      command,
      notice: null,
      echo: null,
      proposal: null,
      cards: [],
      announcement: command.announcement,
    };
  }

  if (intent !== "ask") {
    return noticed(
      "invalid",
      { heading: copy.unexpectedHeading, detail: copy.unexpectedDetail, nextStep: null },
      null,
    );
  }

  const submitted = formData.get("composerText");
  const text = typeof submitted === "string" ? submitted.trim() : "";
  if (text === "") {
    return noticed("invalid", { heading: copy.emptyHeading, detail: copy.emptyDetail, nextStep: null }, null);
  }
  if (text.length > MAX_COMPOSER_TEXT_LENGTH) {
    return noticed(
      "invalid",
      { heading: copy.tooLongHeading, detail: copy.tooLongDetail, nextStep: null },
      null,
    );
  }

  const conversation = formData.get("conversationId");
  const conversationId = typeof conversation === "string" && conversation !== "" ? conversation : null;

  const decision = decideAssistantRoute(text);

  if (decision.kind === "memory_intent") {
    // Still no provider call and still no write *here* (DEC-5). What Slice G
    // adds is the other half: the turn now carries the memory it would store, so
    // the owner can read it, correct it and accept it. Persistence happens only
    // in `createProposedMemory`, from the confirm control on that proposal.
    const proposal = buildMemoryProposal(text);
    const memoryCopy = getMemoryCopy(locale);
    return {
      ...noticed(
        "memory_intent",
        proposal
          ? {
              heading: memoryCopy.proposalHeading,
              detail: memoryCopy.proposalDetail,
              nextStep: null,
            }
          : {
              // The opener with nothing after it. There is no memory to show, so
              // the composer asks for one rather than offering an empty card.
              heading: memoryCopy.proposalHeading,
              detail: memoryCopy.proposalEmpty,
              nextStep: { href: `/${locale}/app/memories`, label: copy.memoryNextStep },
            },
        text,
      ),
      proposal,
    };
  }

  if (decision.kind === "capture_ambiguous") {
    // Nothing is written and no provider is called: the sentence asked for two
    // objects and the honest answer is to ask which (2G-CAPTURE-002).
    return noticed(
      "capture_ambiguous",
      {
        heading: copy.captureAmbiguousHeading,
        detail: copy.captureAmbiguousDetail,
        nextStep: null,
      },
      text,
    );
  }

  if (decision.kind === "capture_intent") {
    // The one composer branch that writes. It reuses `captureEntry` whole —
    // the same Server Action the capture page submits to — so the owner's
    // lifecycle gate, the SH.6 quota ceilings (2G-CAPTURE-005), the
    // idempotency key (2G-CAPTURE-006), the `awaiting_ai_configuration` path
    // when no credential exists (2G-CAPTURE-004) and the worker nudge are all
    // inherited rather than re-implemented beside them.
    const request = new FormData();
    request.set("content", text);
    request.set("locale", locale);
    // `entries.source` has admitted `'chat'` since `202607160003`; this is
    // where the entry came from, and `captureSource` is which surface asked.
    request.set("source", "chat");
    request.set("idempotencyKey", crypto.randomUUID());
    request.set("captureSource", "composer");

    const captured = await captureEntry({ status: "idle" }, request);
    if (captured.status !== "success") {
      return noticed(
        "capture_intent",
        {
          heading: copy.captureFailedHeading,
          // A quota ceiling and a storage fault are different facts, and
          // `captureEntry` already localizes both — surfacing its message
          // keeps the honest one rather than flattening them into a generic
          // failure.
          detail: captured.status === "error" ? captured.message : copy.captureFailedDetail,
          nextStep: null,
        },
        text,
      );
    }
    /**
     * `2K-CARD-007` — the entry the turn produced, as a read-only preview.
     *
     * It replaces the bare "open the entry" link the route used to render.
     * Same destination, but now inside the one card grammar, which is what
     * makes the acknowledgment say *what kind of thing* was created and makes
     * it impossible for this route to grow a mutating control later:
     * `entry` is read-only by OD-2K-B and `mayRenderMutatingControl` enforces
     * it in the renderer.
     *
     * The receipt deliberately carries **no content** — `CaptureReceipt` has
     * no text field, which `sensitivity-convergence.test.ts` asserts — so the
     * card has no snippet, and its classification defaults closed rather than
     * being invented here.
     */
    const href = captured.receipt.safeHref;
    return {
      ...noticed(
        "capture_intent",
        { heading: copy.captureHeading, detail: copy.captureDetail, nextStep: null },
        text,
      ),
      cards: [
        readOnlyPreviewCard({
          cardType: "entry",
          objectId: captured.receipt.entryId,
          href: href ?? null,
        }),
      ],
    };
  }

  if (decision.kind === "knowledge") {
    return answerFromKnowledge(text, locale, conversationId);
  }

  const request = new FormData();
  request.set("intent", "start");
  request.set("commandText", text);
  request.set("locale", locale);
  // The composer is the Brain mount, so the funnel keeps distinguishing it from
  // the Work mount exactly as before. `TaskCommandOrigin` does not widen.
  request.set("origin", "chat");

  const command = await runTaskCommand(idleTaskCommandState, request);
  if (commandTurnFallsThrough(command)) {
    return answerFromKnowledge(text, locale, conversationId);
  }
  return {
    route: "command",
    command,
    notice: null,
    echo: null,
    proposal: null,
    cards: [],
    announcement: command.announcement,
  };
}
