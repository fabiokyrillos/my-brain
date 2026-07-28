/**
 * The Phase 2E action taxonomy's destination statuses, read from `taxonomy.ts`
 * rather than restated.
 *
 * This exists because the aggregate remote smoke hand-rolled its
 * `apply_task_command` patch as a literal `{}` and nothing caught it until the
 * chain was deployed. `complete_task` and `cancel_task` both declare a
 * destination status, and the RPC requires the canonical patch to carry it
 * (`202607260059`: `required_patch_keys := array['status']`). The production
 * path never had the bug, because it does not write the patch by hand:
 * `preview.ts` derives it, `buildApplyPayload` passes it through. The smoke was
 * the only caller that restated the contract, and a restatement is exactly what
 * drifts.
 *
 * The mechanism is the one ADR-052 already established for the product-event
 * vocabulary, for the same reason and with the same limits: the smoke is plain
 * Node and `apply.ts` is not importable from it — it resolves `@/lib/supabase/…`
 * through a TypeScript path alias that plain Node does not honour. So the
 * single source of truth is read, not copied, and a Vitest case holds this
 * reader to the real `actionPolicy` by exact equality. That mirror is what
 * makes this a read rather than a second copy.
 *
 * It fails loudly rather than defaulting. A reader that silently returned
 * `null` for an action whose `targetStatus` it could not parse would put the
 * smoke back where it started — sending a patch the RPC rejects, or worse,
 * sending a *valid* patch for the wrong status.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TAXONOMY_PATH = "src/features/task-commands/taxonomy.ts";

/**
 * Reads `export const TASK_COMMAND_ACTIONS = [ … ] as const;`.
 *
 * Deliberately narrow, like the product-event reader beside it: a flat list of
 * quoted strings, with comment lines tolerated. Anything else throws.
 */
export function parseTaskCommandActions(source) {
  const match = /export const TASK_COMMAND_ACTIONS\s*=\s*\[([\s\S]*?)\]\s*as const;/u.exec(source);
  if (!match) {
    throw new Error(`${TAXONOMY_PATH} no longer declares TASK_COMMAND_ACTIONS as a const array`);
  }

  const actions = [];
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) {
      continue;
    }
    const entry = /^(?:"([^"]+)"|'([^']+)')\s*,?$/u.exec(line);
    if (!entry) {
      throw new Error(`${TAXONOMY_PATH}: TASK_COMMAND_ACTIONS has an unparseable entry: ${line}`);
    }
    actions.push(entry[1] ?? entry[2]);
  }

  if (actions.length === 0) {
    throw new Error(`${TAXONOMY_PATH}: TASK_COMMAND_ACTIONS parsed as empty, which cannot be right`);
  }
  return actions;
}

/**
 * Extracts each action's `targetStatus` from its `policy({ … })` entry.
 *
 * `null` means the action declares none — which is a real answer, not a parse
 * failure: eleven of the fifteen take their destination from the patch or write
 * no status at all. The distinction that matters is between "declared none" and
 * "could not be read", and only the first returns; the second throws.
 *
 * The body is located by brace matching rather than a lazy regex, because a
 * `policy({ … })` entry contains nested arrays and a non-greedy `}` would stop
 * at the first one. Policy bodies hold only string literals, identifiers and
 * arrays — no braces inside strings — which is what makes the scan sound.
 */
export function parseActionTargetStatuses(source, actions) {
  const targetStatuses = {};

  for (const action of actions) {
    const opener = new RegExp(`(?:^|\\n)\\s{2}${action}:\\s*policy\\(`, "u");
    const found = opener.exec(source);
    if (!found) {
      throw new Error(`${TAXONOMY_PATH}: no policy({ … }) entry for action "${action}"`);
    }

    const braceStart = source.indexOf("{", found.index + found[0].length - 1);
    if (braceStart < 0) {
      throw new Error(`${TAXONOMY_PATH}: policy() for "${action}" has no object literal`);
    }

    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < source.length; i += 1) {
      const char = source[i];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) {
      throw new Error(`${TAXONOMY_PATH}: policy() for "${action}" is unbalanced`);
    }

    const body = source.slice(braceStart, end + 1);
    const declared = /targetStatus:\s*(?:"([^"]*)"|'([^']*)'|(null))/u.exec(body);
    targetStatuses[action] = declared && !declared[3] ? (declared[1] ?? declared[2]) : null;
  }

  return targetStatuses;
}

export function readTaskCommandTaxonomy(repositoryRoot) {
  const root = repositoryRoot
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = readFileSync(path.join(root, TAXONOMY_PATH), "utf8");
  const actions = parseTaskCommandActions(source);
  return { actions, targetStatuses: parseActionTargetStatuses(source, actions) };
}

/**
 * The status half of the canonical patch, mirroring `preview.ts`'s
 * `buildCanonicalPatch`:
 *
 *     if (policy.targetStatus !== null) draft.status = policy.targetStatus;
 *     else if (command.patch.status !== undefined) draft.status = command.patch.status;
 *
 * The smoke only exercises actions that take the first branch, so only the
 * first branch is here — with the second stated rather than silently absent, so
 * a future smoke that adds `set_status` finds the gap instead of a wrong
 * answer. `buildCanonicalPatch` itself is not exported and lives in a module
 * this script cannot import, which is why the rule is mirrored here and pinned
 * by the accompanying Vitest case rather than shared.
 */
export function canonicalStatusPatch(action, targetStatuses) {
  if (!(action in targetStatuses)) {
    throw new Error(`Unknown task command action "${action}"`);
  }
  const targetStatus = targetStatuses[action];
  if (targetStatus === null) {
    throw new Error(
      `Action "${action}" declares no targetStatus, so its canonical patch cannot be `
      + "derived from the taxonomy alone. Supply the patch explicitly.",
    );
  }
  return { status: targetStatus };
}
