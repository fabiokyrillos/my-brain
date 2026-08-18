import { notFound } from "next/navigation";
import { uploadAttachment } from "@/features/agent/actions";
import { captureEntry } from "@/features/capture/actions";
import { Composer } from "@/features/capture/composer";
import { transcribeRecording } from "@/features/capture/transcribe-action";
import { isLocale } from "@/lib/preferences";
import { getAgentName } from "@/features/profile/agent-identity";

/**
 * `2P-CAPTURE-001` … `2P-CAPTURE-010` — the one capture surface.
 *
 * This page owns **all three** Server Actions and hands each to the composer as
 * a prop. `Composer` is a client component and imports none of them, which is
 * what keeps `T-1` intact: the owner stops choosing between three panels, and
 * the code keeps the two write contracts it already had.
 *
 * Text goes to `captureEntry` -> `capture_entry_async`. A file goes to
 * `uploadAttachment` -> the `process_attachment` job. A recording goes to
 * `transcribeRecording` and comes back as text the owner edits before sending,
 * so it creates nothing of its own. Nothing merges them into a third record,
 * and `capture-write-path-guard.test.ts` fails the build if a second entry
 * writer ever appears.
 *
 * Today mounts the same component with `captureSource="home"`. That is
 * `2P-CAPTURE-001` in full: one contract, two surfaces, and the only things
 * that differ are the draft key and the analytics surface -- both of which
 * MUST differ, or the cockpit would show the capture page's half-written text.
 */
export default async function CapturePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const pt = locale === "pt-BR";
  const agentName = await getAgentName();

  return (
    <div className="content-page capture-page">
      <p className="eyebrow">{pt ? "CAPTURA" : "CAPTURE"}</p>
      <h1>{pt ? "Tire isso da cabeça." : "Get it out of your head."}</h1>
      <p>{pt
        ? `Escreva, anexe um arquivo ou fale — tudo no mesmo lugar. O ${agentName} preserva o original, identifica o contexto e pede sua confirmação antes de criar tarefas.`
        : `Write, attach a file, or speak — all in the same place. ${agentName} preserves the original, finds the context, and asks before creating tasks.`}</p>

      <Composer
        action={captureEntry}
        attachmentAction={uploadAttachment}
        transcribeAction={transcribeRecording}
        agentName={agentName}
        locale={locale}
        captureSource="capture_page"
      />
    </div>
  );
}
