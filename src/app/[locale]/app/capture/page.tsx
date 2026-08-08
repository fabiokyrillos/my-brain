import { notFound } from "next/navigation";
import { uploadAttachment } from "@/features/agent/actions";
import { UploadForm } from "@/features/agent/forms";
import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { transcribeRecording } from "@/features/capture/transcribe-action";
import { CaptureModeReporter } from "@/features/capture/capture-mode-reporter";
import { VoiceComposer } from "@/features/capture/voice-composer";
import { isLocale } from "@/lib/preferences";
import { getAgentName } from "@/features/profile/agent-identity";

/**
 * `2J-CAPTURE-001` … `2J-CAPTURE-007` — the one capture surface.
 *
 * This page owns **both** Server Actions and hands each to the modality that
 * uses it. `UnifiedCapture` is a client component and imports neither, which is
 * what keeps `T-2I-02` intact: the user stops having to choose between three
 * places to put something, and the code keeps the two contracts it already had.
 *
 * Text goes to `captureEntry` -> `capture_entry_async`. A file goes to
 * `uploadAttachment` -> the `process_attachment` job. Nothing merges them into a
 * third record, and `capture-write-path-guard.test.ts` fails the build if a
 * second entry writer ever appears.
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
        ? `Escreva, envie um arquivo ou fale. O ${agentName} preserva o original, identifica o contexto e pede sua confirmação antes de criar tarefas.`
        : `Write, upload a file, or speak. ${agentName} preserves the original, finds the context, and asks before creating tasks.`}</p>

      <CaptureModeReporter
        locale={locale}
        textAction={
          <QuickCaptureForm
            action={captureEntry}
            agentName={agentName}
            locale={locale}
            captureSource="capture_page"
          />
        }
        attachmentAction={<UploadForm action={uploadAttachment} locale={locale} />}
        voice={
          <VoiceComposer
            locale={locale}
            transcribeAction={transcribeRecording}
            captureAction={captureEntry}
            agentName={agentName}
          />
        }
      />
    </div>
  );
}
