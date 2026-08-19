import { AccountDataSection } from "@/features/account-centre/account-data-section";
import {
  setAutomationCategoryPolicy,
  undoAutomationCategoryPolicy,
} from "@/features/agent/automation-actions";
import { loadAutomationPolicyHistory, loadAutomationStatus } from "@/features/agent/automation-data";
import { AutomationSection } from "@/features/agent/automation-section";
import { AiConfigSection } from "@/features/ai-config/ai-config-section";
import { AppearanceControl } from "@/features/appearance/appearance-control";
import { interpretPendingEntries, removeAiCredential, saveAiCredential } from "@/features/byok/actions";
import { CredentialPanel } from "@/features/byok/credential-panel";
import { loadCredentialMetadata } from "@/features/byok/credential-view";
import { loadPendingEntryCount } from "@/features/byok/pending-entries";
import { SettingsForm } from "@/features/profile/settings-form";
import { updateProfile } from "@/features/profile/actions";
import { loadSettingsFormValues } from "@/features/profile/settings-view";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { readPushConsent } from "@/features/notifications/consent-reader";
import { restoreOnboarding } from "@/features/onboarding/actions";
import { OnboardingRestore } from "@/features/onboarding/onboarding-restore";
import { readDismissal } from "@/features/onboarding/onboarding-view";
import { InstallSection } from "@/features/pwa/install-section";
import { loadPrivacyCensus } from "@/features/privacy/census";
import { loadConsentRecord } from "@/features/privacy/consent-record";
import { ConsentSection } from "@/features/privacy/consent-section";
import { PrivacySection } from "@/features/privacy/privacy-section";
import { readSignedInEmail } from "@/features/privacy/session-identity";
import { CapabilitySummary } from "@/features/shell/capability-summary";
import { DataAiSection } from "@/features/transparency/data-ai-section";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const [
    values,
    credential,
    pending,
    onboardingDismissed,
    census,
    consent,
    pushConsent,
    automation,
    automationHistory,
  ] = await Promise.all([
      loadSettingsFormValues(supabase, user.id),
      loadCredentialMetadata(supabase, user.id),
      loadPendingEntryCount(supabase, user.id),
      readDismissal(),
      /*
        Slice 2O.5's three reads, in the page's existing parallel batch rather
        than in three sequential awaits: the census alone is twelve counts, and
        serialising them behind the credential read would make the most-visited
        authenticated page pay for it. Every one runs on the request-scoped
        `authenticated` client under forced RLS — there is no privileged client
        on this page and `2O-PRIVACY-002`'s enumeration is never reached from
        here (`2O-SEC-001`, `2O-SEC-002`).
      */
      loadPrivacyCensus(supabase, user.id),
      loadConsentRecord(supabase, user.id),
      readPushConsent(supabase, user.id),
      /*
        Slice 2P.4's two reads, in the same batch and for the same reason the
        three above are: both run on the request-scoped `authenticated` client
        under forced RLS, the status projection is one RPC over six categories,
        and the history is five rows keyed by `action_type`.
      */
      loadAutomationStatus(supabase),
      loadAutomationPolicyHistory(supabase, new Date().toISOString()),
    ]);
  const signedInEmail = await readSignedInEmail(supabase);

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
        `2P-AUTONOMY-001`, `-003`, `-009`, `-010` — slice 2P.4.

        It sits directly after the saved preferences because it IS one, and
        because it is the preference with the largest consequence on the page:
        it decides whether the agent may write without asking. Nothing is
        automatic today and the section says so in its own first paragraph
        rather than leaving the reader to infer it from six identical selects.

        `2P-SETTINGS-001` gives Settings stable sections in slice 2P.5 and this
        is written to be moved into one without changing its semantics: the
        authority is the database function, the projection is
        `loadAutomationStatus`, and the copy is a typed module. Mounting is the
        only thing this page decides.
      */}
      <AutomationSection
        locale={locale}
        decisions={automation}
        history={automationHistory}
        saveAction={setAutomationCategoryPolicy}
        undoAction={undoAutomationCategoryPolicy}
      />
      {/*
        `2O-ONBOARD-010`'s reversal. It renders only when the guide is actually
        dismissed, so it is never a control that changes nothing (`R-2O-12`),
        and it governs a per-browser cookie rather than a persisted preference
        column.

        **The second half of this comment used to be wrong and is corrected
        here.** It said the control "needs no capability-registry row" and that
        "the registry would have nothing true to say about it". Half of that was
        right — there is no column — and half was wrong: the dismissal cookie has
        a real reader, so `2O-PREF-008` reaches it. Slice 2O.3 added the
        `onboarding_restore` row with `controls: ["restoreOnboarding"]` and fixed
        the copy of this reasoning in `capabilities.ts`, and left this one
        standing. A comment asserting the opposite of the tree is the shape
        `R-2O-16` exists to catch, so it is repaired rather than deleted.
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
      {/*
        `2O-PREF-013`. The appearance choice, which ADR-114 Decision 3 specified
        and never shipped a control for.

        It sits **after** the saved preferences and before the navigational
        sections, which is where it belongs on both counts: it is a preference,
        so it goes with the preferences, and it is the only one on this page with
        no save button — held in this browser, applied the moment it is clicked
        (`2O-PREF-014`). Putting it inside `SettingsForm` would have given it a
        submit path it does not have and a payload it does not belong in.
      */}
      <AppearanceControl locale={locale} />
      <CapabilitySummary locale={locale} />
      {/*
        `2O-MOBILE-004`. Directly after the appearance choice and the capability
        summary: this is where the page stops being about what the product does
        with your data and starts being about how you use it.

        Not beside notifications, which was the alternative and is worse in the
        way that matters — it would read as a step toward turning alerts on, and
        that is the claim `OD-2O-11` forbids. The section says so itself rather
        than relying on its position to avoid the implication.
      */}
      <InstallSection locale={locale} />
      {/*
        `2O-AICONFIG-001` … `-005` and `-008`. What the product does with a
        model, stated after the controls that change it.

        It follows `CapabilitySummary` rather than preceding it because the two
        answer different questions in a deliberate order: *what can I change
        here*, then *what is being done with it*. And it precedes Dados e IA,
        which is where the owner goes to see what each of those calls cost —
        routing, then spend.

        It takes `credential.status` rather than loading anything of its own:
        `2O-AICONFIG-008` needs one boolean, the page already has it, and a
        second read of the credential row would be a second place for the
        product's answer about the key to come from.
      */}
      <AiConfigSection
        locale={locale}
        credentialStatus={credential.status}
        saved={values}
      />
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
      {/*
        `2O-PREF-001` and `2O-PREF-002`. Conta e dados — the same pattern applied
        a second time, reaching notifications, the policy documents and account
        deletion.

        Last on the page, deliberately. Everything above it is something the
        owner came here to change; this section is where they go when they are
        done — including the one door that ends the account. Dados e IA precedes
        it because looking at what the product did is the more common errand than
        leaving.
      */}
      <AccountDataSection locale={locale} />
      {/*
        Slice 2O.5 — `2O-PRIVACY-001` … `-010` and `2O-CONSENT-001` … `-005`.

        Both sections follow Conta e dados rather than replacing it: that section
        is navigational and reaches three routes that keep their own properties,
        and these two answer questions no route in the product answered at all.
        Privacy precedes consent because *"what is stored about me"* is the
        question people arrive with, and *"what did I agree to"* is the one they
        ask once they are already reading.
      */}
      <PrivacySection locale={locale} census={census} email={signedInEmail} />
      <ConsentSection
        locale={locale}
        record={consent}
        pushConsent={pushConsent.state}
        timeZone={await getOwnerTimeZone()}
      />
    </div>
  );
}
