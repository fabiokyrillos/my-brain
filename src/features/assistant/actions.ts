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
 * 3. **The memory branch cannot write.** It is reached before any provider call
 *    and returns a proposal with a link. DEC-5's confirmed-memory contract is
 *    Slice G's, and until it exists there is deliberately no path from here to
 *    `memories`.
 */

import { sendChatMessage } from "@/features/chat/actions";
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
    return { route: "command", command, notice: null, echo: null, announcement: command.announcement };
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
    // No provider call, no write, and nothing downstream to reach. The proposal
    // names what was understood and points at the surface that can actually
    // create a memory today (DEC-5; the conversational contract is Slice G).
    return noticed(
      "memory_intent",
      {
        heading: copy.memoryHeading,
        detail: copy.memoryDetail,
        nextStep: { href: `/${locale}/app/memories`, label: copy.memoryNextStep },
      },
      text,
    );
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
  return { route: "command", command, notice: null, echo: null, announcement: command.announcement };
}
