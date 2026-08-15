import { interpretPendingEntries, removeAiCredential, saveAiCredential } from "@/features/byok/actions";
import { CredentialPanel } from "@/features/byok/credential-panel";
import { loadCredentialMetadata } from "@/features/byok/credential-view";
import { loadPendingEntryCount } from "@/features/byok/pending-entries";
import { SettingsForm } from "@/features/profile/settings-form";
import { updateProfile } from "@/features/profile/actions";
import { loadSettingsFormValues } from "@/features/profile/settings-view";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { DataAiSection } from "@/features/transparency/data-ai-section";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const [values, credential, pending] = await Promise.all([
    loadSettingsFormValues(supabase, user.id),
    loadCredentialMetadata(supabase, user.id),
    loadPendingEntryCount(supabase, user.id),
  ]);

  return (
    <div className="settings-page">
      <p className="eyebrow">{pt ? "PREFERÊNCIAS OPERACIONAIS" : "OPERATIONAL PREFERENCES"}</p>
      <h1>{pt ? "Configurações com efeito real" : "Settings with real effects"}</h1>
      <p>{pt
        ? "Ajuste somente preferências que já possuem consumer verificável. O roteamento de IA fica em Avançado."
        : "Change only preferences with a verifiable consumer. AI routing lives under Advanced."}</p>
      {/* First, deliberately. Every AI surface in the product depends on it, so
          a user who arrived here because something was gated should not have to
          scroll past model routing to find the thing that fixes it. */}
      <CredentialPanel
        locale={locale}
        credential={credential}
        pending={pending}
        saveAction={saveAiCredential}
        removeAction={removeAiCredential}
        interpretPendingAction={interpretPendingEntries}
        timeZone={await getOwnerTimeZone()}
      />
      <SettingsForm action={updateProfile} locale={locale} values={values} />
      {/*
        Dados e IA — `02-arquitetura-e-rotas.md` puts the transparency centre
        inside Ajustes. It is a section that **reaches** the three surfaces
        rather than three tabs that replace them, for the reason
        `transparency/contracts.ts` gives: a tab of this page would have to
        re-implement History's filters and pagination, Costs' RPC and
        Processamento's states, and three routes would stop being rendering
        surfaces to make room for it.
      */}
      <DataAiSection locale={locale} />
    </div>
  );
}
