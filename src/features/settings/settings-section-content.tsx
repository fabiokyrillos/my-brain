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

  switch (section) {
    case "general": {
      const [values, onboardingDismissed] = await Promise.all([
        loadSettingsFormValues(supabase, user.id),
        readDismissal(),
      ]);
      return (
        <>
          <SettingsForm action={updateProfile} locale={locale} section="general" values={values} />
          {/*
            `2O-ONBOARD-010`'s reversal. It renders only when the guide is
            actually dismissed, so it is never a control that changes nothing
            (`R-2O-12`), and it governs a per-browser cookie rather than a
            persisted preference column.
          */}
          <OnboardingRestore
            locale={locale}
            dismissed={onboardingDismissed}
            restoreAction={restoreOnboarding}
          />
          {/*
            `2O-ACTIVATION-004`. The surface's own claim is that only
            preferences with a verifiable consumer are offered here. Until slice
            2O.3 that was prose: `capabilityRegistry` recorded which ones those
            are and nothing rendered it, so the claim and the registry could
            drift apart with nobody able to tell.

            It belongs in Geral now that the surface has sections, because it is
            a statement about **all** of them. Leaving it in one topical section
            would have made it read as a claim about that section alone.
          */}
          <CapabilitySummary locale={locale} />
        </>
      );
    }

    case "assistant": {
      const [values, automation, automationHistory] = await Promise.all([
        loadSettingsFormValues(supabase, user.id),
        loadAutomationStatus(supabase),
        loadAutomationPolicyHistory(supabase, new Date().toISOString()),
      ]);
      return (
        <>
          <SettingsForm action={updateProfile} locale={locale} section="assistant" values={values} />
          {/*
            `2P-AUTONOMY-001`, `-003`, `-009`, `-010` — slice 2P.4, moved here by
            slice 2P.5 **without changing its semantics**, which is what ADR-123
            Decision 7 required of this move.

            It sits with the assistant's other preferences because it IS one, and
            it is the one with the largest consequence: it decides whether the
            agent may write without asking. The authority is still the database
            function, the projection is still `loadAutomationStatus`, and the
            copy is still a typed module — mounting is the only thing this file
            decides.
          */}
          <AutomationSection
            locale={locale}
            decisions={automation}
            history={automationHistory}
            saveAction={setAutomationCategoryPolicy}
            undoAction={undoAutomationCategoryPolicy}
          />
        </>
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
            First in the section, deliberately. Every AI surface in the product
            depends on it, so a reader who arrived here because something was
            gated should not have to scroll past model routing to find the thing
            that fixes it.

            `2P-SETTINGS-006`: the panel keeps its security posture exactly.
            `loadCredentialMetadata` reads metadata — never the ciphertext and
            never a decryptable value — and the section renders the same
            component with the same props it had on the single page.
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
          {/*
            `2O-AICONFIG-001` … `-005` and `-008`. What the product does with a
            model, stated after the controls that change it.

            It takes `credential.status` rather than loading anything of its own:
            `2O-AICONFIG-008` needs one boolean, this section already has it, and
            a second read of the credential row would be a second place for the
            product's answer about the key to come from.
          */}
          <AiConfigSection locale={locale} credentialStatus={credential.status} saved={values} />
        </>
      );
    }

    case "planning": {
      const values = await loadSettingsFormValues(supabase, user.id);
      return <SettingsForm action={updateProfile} locale={locale} section="planning" values={values} />;
    }

    case "notifications": {
      const consent = await readPushConsent(supabase, user.id);
      return (
        /*
          `2P-SETTINGS-008`. The governance controls, moved here from
          `/app/notifications` so that page can be the history surface it is
          named after.

          The component is unchanged and so are its props: consent, the enabled
          types, the frequency, the quiet window and the daily cap all arrive
          exactly as they did, and `begin_push_delivery` still reads every one of
          them before sending. Moving a control must not move its meaning.

          The resolution is still fail-closed: a missing or unreadable record
          resolves to `unsupported`, never to a default-on.
        */
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
      );
    }

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
          {/*
            Privacy precedes consent because *"what is stored about me"* is the
            question people arrive with, and *"what did I agree to"* is the one
            they ask once they are already reading. Dados e IA follows both: it
            is what was DONE with the two above.
          */}
          <PrivacySection locale={locale} census={census} email={signedInEmail} />
          <ConsentSection
            locale={locale}
            record={consent}
            pushConsent={pushConsent.state}
            timeZone={timeZone}
          />
          {/*
            `02-arquitetura-e-rotas.md` puts the transparency centre inside
            Ajustes. It is a section that **reaches** the three surfaces rather
            than three tabs that replace them, for the reason
            `transparency/contracts.ts` gives: a tab here would have to
            re-implement History's filters and pagination, Costs' RPC and
            Processamento's states, and three routes would stop being rendering
            surfaces to make room for it.
          */}
          <DataAiSection locale={locale} />
        </>
      );
    }

    case "appearance":
      return (
        <>
          <AppearanceControl locale={locale} />
          {/*
            `2O-MOBILE-004`. Beside the appearance choice, which is the other
            answer to *how does this product show up on my device*.

            **Not** beside notifications, which was the alternative and is worse
            in the way that matters — it would read as a step toward turning
            alerts on, and that is the claim `OD-2O-11` forbids. With Settings
            sectioned, that adjacency is now a routing decision rather than a
            scroll position, so the requirement is honoured structurally.
          */}
          <InstallSection locale={locale} />
        </>
      );

    case "account":
      return (
        /*
          `2O-PREF-001` and `2O-PREF-002`. Conta e dados — reaching
          notifications, the policy documents and account deletion.

          Last of the eight, deliberately. Everything above it is something the
          owner came here to change; this is where they go when they are done,
          including the one door that ends the account.
        */
        <AccountDataSection locale={locale} />
      );
  }
}
