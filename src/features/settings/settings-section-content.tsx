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
import { readPushConsent, readVapidPublicKey } from "@/features/notifications/consent-reader";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import { restoreOnboarding } from "@/features/onboarding/actions";
import { OnboardingRestore } from "@/features/onboarding/onboarding-restore";
import { readDismissal } from "@/features/onboarding/onboarding-view";
import { updateProfile } from "@/features/profile/actions";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { SettingsForm } from "@/features/profile/settings-form";
import { loadSettingsFormValues } from "@/features/profile/settings-view";
import { loadPrivacyCensus } from "@/features/privacy/census";
import { loadConsentRecord } from "@/features/privacy/consent-record";
import { ConsentSection } from "@/features/privacy/consent-section";
import { PrivacySection } from "@/features/privacy/privacy-section";
import { readSignedInEmail } from "@/features/privacy/session-identity";
import { InstallSection } from "@/features/pwa/install-section";
import { CapabilitySummary } from "@/features/shell/capability-summary";
import { DataAiSection } from "@/features/transparency/data-ai-section";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { getSettingsCopy } from "./copy";
import type { SettingsSection } from "./sections";

/**
 * One section's content, and only that section's reads.
 *
 * ## What changed, and why it is a correctness property rather than a
 * performance one
 *
 * Before slice 2P.5 this was one page issuing eight projections in a single
 * `Promise.all` — the privacy census alone is twelve counts — on every visit,
 * because every section was on screen at once. With eight routes, a reader who
 * came to change the timezone runs one read, and a reader who came to look at
 * the census runs the census.
 *
 * The parallelism *within* a section is kept for the same reason it existed:
 * two reads a section needs together are started together, never serialised
 * behind one another.
 *
 * ## Every read is still the owner's own
 *
 * `requireUser` returns the request-scoped `authenticated` client under forced
 * RLS. There is no privileged client on this surface and
 * `2O-PRIVACY-002`'s enumeration is never reached from here (`2O-SEC-001`,
 * `2O-SEC-002`) — unchanged by the move, and asserted by the closeout guard.
 *
 * ## The switch is exhaustive by type
 *
 * `SettingsSection` is a closed union and every arm returns, so a ninth section
 * added to the routing contract fails to compile here rather than rendering an
 * empty panel.
 */
export async function SettingsSectionContent({
  locale,
  section,
}: {
  locale: Locale;
  section: SettingsSection;
}) {
  const { supabase, user } = await requireUser(locale);

  const copy = getSettingsCopy(locale);

  switch (section) {
    case "general": {
      const [values, onboardingDismissed] = await Promise.all([
        loadSettingsFormValues(supabase, user.id),
        readDismissal(),
      ]);
      return (
        <>
          {/*
            Life Brain E.1 joins 2P.5's Geral and Assistente: who the assistant
            is, then where and when you are. Two forms, because each profile
            form owns its own columns (`settings-sections.ts`), and
            `2P-SETTINGS-004` stays structural: neither can blank the other.
          */}
          <SettingsForm action={updateProfile} locale={locale} section="assistant" values={values} />
          <SettingsForm action={updateProfile} locale={locale} section="general" values={values} />
          {/* `2O-ONBOARD-010`'s reversal; renders only when the guide is dismissed. */}
          <OnboardingRestore
            locale={locale}
            dismissed={onboardingDismissed}
            restoreAction={restoreOnboarding}
          />
          {/*
            `2O-ACTIVATION-004`. Still rendered, still a statement about every
            group — behind a disclosure, because it explains the product to
            the people who build it before it helps the person using it.
          */}
          <details className="settings-how">
            <summary>{copy.howItWorks.capabilities}</summary>
            <CapabilitySummary locale={locale} />
          </details>
        </>
      );
    }

    case "day": {
      const [values, consent] = await Promise.all([
        loadSettingsFormValues(supabase, user.id),
        readPushConsent(supabase, user.id),
      ]);
      return (
        <>
          {/* 2P.5's Planejamento: quiet hours, the daily cap, review offers. */}
          <SettingsForm action={updateProfile} locale={locale} section="planning" values={values} />
          {/*
            2P.5's Notificações, unchanged in semantics. Its quiet period and
            cap are the push sender's own (`begin_push_delivery`), not the
            profile's above; they are separate columns with separate consumers
            and this slice does not merge them (ADR-169).
          */}
          <NotificationSettings
            locale={locale}
            state={consent.state}
            pushPublicKey={readVapidPublicKey()}
            enabledTypes={consent.enabledTypes}
            frequency={consent.frequency}
            quietStart={consent.quietStart ?? "22:30"}
            quietEnd={consent.quietEnd ?? "07:00"}
            dailyCap={consent.dailyCap}
          />
        </>
      );
    }

    case "autonomy": {
      const [automation, automationHistory] = await Promise.all([
        loadAutomationStatus(supabase),
        loadAutomationPolicyHistory(supabase, new Date().toISOString()),
      ]);
      return (
        /*
          `2P-AUTONOMY-001`, `-003`, `-009`, `-010`. Its own group since Life
          Brain E.1: it decides whether the agent may write without asking,
          which is the setting with the largest consequence on the surface.
        */
        <AutomationSection
          locale={locale}
          decisions={automation}
          history={automationHistory}
          saveAction={setAutomationCategoryPolicy}
          undoAction={undoAutomationCategoryPolicy}
        />
      );
    }

    case "ai": {
      const [values, credential, pending, timeZone] = await Promise.all([
        loadSettingsFormValues(supabase, user.id),
        loadCredentialMetadata(supabase, user.id),
        loadPendingEntryCount(supabase, user.id),
        getOwnerTimeZone(),
      ]);
      return (
        <>
          {/*
            First, because every AI surface depends on it. `2P-SETTINGS-006`:
            the panel reads metadata only, never the ciphertext.
          */}
          <CredentialPanel
            locale={locale}
            credential={credential}
            pending={pending}
            saveAction={saveAiCredential}
            removeAction={removeAiCredential}
            interpretPendingAction={interpretPendingEntries}
            timeZone={timeZone}
          />
          <SettingsForm action={updateProfile} locale={locale} section="ai" values={values} />
          {/* `2O-AICONFIG-001` … `-005`, `-008`: still rendered, behind a disclosure. */}
          <details className="settings-how">
            <summary>{copy.howItWorks.ai}</summary>
            <AiConfigSection locale={locale} credentialStatus={credential.status} saved={values} />
          </details>
        </>
      );
    }

    case "appearance":
      return (
        <>
          <AppearanceControl locale={locale} />
          <InstallSection locale={locale} />
        </>
      );

    case "privacy": {
      const [census, consent, pushConsent, signedInEmail, timeZone] = await Promise.all([
        loadPrivacyCensus(supabase, user.id),
        loadConsentRecord(supabase, user.id),
        readPushConsent(supabase, user.id),
        readSignedInEmail(supabase),
        getOwnerTimeZone(),
      ]);
      return (
        <>
          <PrivacySection locale={locale} census={census} email={signedInEmail} />
          <ConsentSection
            locale={locale}
            record={consent}
            pushConsent={pushConsent.state}
            timeZone={timeZone}
          />
          <DataAiSection locale={locale} />
          {/* 2P.5's Conta: documents, the notifications page, and the way out — last. */}
          <AccountDataSection locale={locale} />
        </>
      );
    }
  }
}
