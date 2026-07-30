import { notFound } from "next/navigation";
import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { isLocale } from "@/lib/preferences";
import { getAgentName } from "@/features/profile/agent-identity";

export default async function CapturePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const pt = locale === "pt-BR";
  const agentName = await getAgentName();

  return (
    <div className="content-page capture-page">
      <p className="eyebrow">{pt ? "CAPTURA RÁPIDA" : "QUICK CAPTURE"}</p>
      <h1>{pt ? "Tire isso da cabeça." : "Get it out of your head."}</h1>
      <p>{pt
        ? `Escreva do seu jeito. O ${agentName} preserva o original, identifica o contexto e pede sua confirmação antes de criar tarefas.`
        : `Write naturally. ${agentName} preserves the original, finds the context, and asks before creating tasks.`}</p>
      <QuickCaptureForm action={captureEntry} agentName={agentName} locale={locale} captureSource="capture_page" />
    </div>
  );
}
