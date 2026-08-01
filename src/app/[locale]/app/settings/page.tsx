import { removeAiCredential, saveAiCredential } from "@/features/byok/actions";
import { CredentialPanel } from "@/features/byok/credential-panel";
import { loadCredentialMetadata } from "@/features/byok/credential-view";
import { SettingsForm } from "@/features/profile/settings-form";
import { updateProfile } from "@/features/profile/actions";
import { loadSettingsFormValues } from "@/features/profile/settings-view";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const values = await loadSettingsFormValues(supabase, user.id);
  const credential = await loadCredentialMetadata(supabase, user.id);

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
        saveAction={saveAiCredential}
        removeAction={removeAiCredential}
      />
      <SettingsForm action={updateProfile} locale={locale} values={values} />
    </div>
  );
}
