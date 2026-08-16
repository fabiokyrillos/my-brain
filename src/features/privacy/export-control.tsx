"use client";

import { useActionState } from "react";

import type { Locale } from "@/lib/preferences";

import { exportAccountData } from "./actions";
import { idleExportState } from "./contracts";
import { getPrivacyCopy } from "./copy";

/**
 * The export control — `2O-PRIVACY-004` and `-006`.
 *
 * ## The archive is built on the server and handed down as text
 *
 * `OD-2O-4` **A** signed the export synchronous and server-side. The Server
 * Action returns the whole archive as a string; this component turns it into a
 * `blob:` URL only at the moment the reader asks to save it. **Nothing is
 * stored** — no job row, no storage object, no signed URL — which is what keeps
 * this clear of ADR-118 Decision 9's *"an export needing a job, storage or a
 * migration"*.
 *
 * **A `blob:` URL rather than a `data:` URI, deliberately.** A `data:` href is
 * one line shorter and silently truncates or fails on large archives in several
 * browsers, which would turn a complete export into a partial download — the
 * failure `R-2O-19` forbids, reintroduced below the layer that enforces it. The
 * object URL is revoked immediately after the click so the archive does not
 * outlive the save. Neither form is affected by the CSP, which `R-2O-27` freezes
 * for this phase: anchor `href` is governed by no fetch directive.
 *
 * ## A refusal is rendered as a refusal
 *
 * There is deliberately **no download control in the refused branch**: offering
 * a file next to the words "could not be completed" is exactly the presentation
 * `R-2O-19` forbids, and the action never returns an archive alongside a refusal
 * to make it possible. `role="alert"`, because a refusal is something the reader
 * must not miss on a page about their own data.
 */
export function ExportControl({ locale }: { locale: Locale }) {
  const copy = getPrivacyCopy(locale);
  const [state, formAction, pending] = useActionState(exportAccountData, idleExportState);

  function save(archive: string, filename: string) {
    const url = URL.createObjectURL(new Blob([archive], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="privacy-export">
      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" disabled={pending}>
          {pending ? copy.export.pending : copy.export.action}
        </button>
      </form>

      {state.status === "ready" ? (
        <p role="status">
          {copy.export.ready(state.rows)}{" "}
          <button type="button" onClick={() => save(state.archive, state.filename)}>
            {copy.export.download}
          </button>
        </p>
      ) : null}

      {state.status === "refused" || state.status === "failed" ? (
        <p role="alert">{state.message}</p>
      ) : null}
    </div>
  );
}
