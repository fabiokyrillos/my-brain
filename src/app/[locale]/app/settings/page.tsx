import { interpretPendingEntries, removeAiCredential, saveAiCredential } from "@/features/byok/actions";
import { CredentialPanel } from "@/features/byok/credential-panel";
import { loadCredentialMetadata } from "@/features/byok/credential-view";
import { loadPendingEntryCount } from "@/features/byok/pending-entries";
import { SettingsForm } from "@/features/profile/settings-form";
import { updateProfile } from "@/features/profile/actions";
import { loadSettingsFormValues } from "@/features/profile/settings-view";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { restoreOnboarding } from "@/features/onboarding/actions";
import { OnboardingRestore } from "@/features/onboarding/onboarding-restore";
import { readDismissal } from "@/features/onboarding/onboarding-view";
import { CapabilitySummary } from "@/features/shell/capability-summary";
import { DataAiSection } from "@/features/transparency/data-ai-section";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const [values, credential, pending, onboardingDismissed] = await Promise.all([
    loadSettingsFormValues(supabase, user.id),
    loadCredentialMetadata(supabase, user.id),
    loadPendingEntryCount(supabase, user.id),
    readDismissal(),
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
        `2O-ONBOARD-010`'s reversal. It renders only when the guide is actually
        dismissed, so it is never a control that changes nothing (`R-2O-12`),
        and it governs a per-browser cookie rather than a persisted preference
        column — which is why it needs no capability-registry row and why the
        registry would have nothing true to say about it.
      */}
      <OnboardingRestore
        locale={locale}
        dismissed={onboardingDismissed}
        restoreAction={restoreOnboarding}
      />
      {/*
        `2O-ACTIVATION-004`. The page's own intro claims that only preferences
        with a verifiable consumer are offered here. Until this section that was
        prose: `capabilityRegistry` recorded which ones those are and **nothing
        rendered it**, so the claim and the registry could drift apart with
        nobody able to tell. It is placed after the controls and before Dados e
        IA deliberately — here is what you can change, here is what each change
        does, here is where to see what was done with it.
      */}
      <CapabilitySummary locale={locale} />
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
