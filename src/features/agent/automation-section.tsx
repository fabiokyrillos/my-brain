import type { Locale } from "@/lib/preferences";

import type { AutomationPolicyChange } from "./automation-data";
import { getAutomationCopy } from "./automation-copy";
import {
  calibrationShortfall,
  permitsAutomaticWrite,
  type AutomationCategoryDecision,
} from "./automation-policy";

/**
 * `2P-AUTONOMY-001`, `-003`, `-009` and `-010`'s surface.
 *
 * ## It renders a refusal, and says why in the owner's words
 *
 * Every category reads *suggest only* today, and the interface says so at the
 * top rather than leaving the reader to infer it from six identical selects.
 * "Nothing is automatic" is the product's actual posture, and a screen that
 * only showed controls would let it read as an accident.
 *
 * Each row states its own reason from the closed vocabulary the database
 * returned — never a generic "not available" — because *why* a category refuses
 * is the difference between "you switched it off", "there is not enough
 * evidence yet" and "you took something back a moment ago", and those call for
 * three different responses from the owner.
 *
 * ## Where the eligibility decision is NOT made
 *
 * Here. `permitsAutomaticWrite` reads what the database decided and refuses
 * anything that is not literally the one eligible reason; it recomputes
 * nothing. A component that re-derived eligibility from the calibration numbers
 * would be a second authority over the same question, which is the defect slice
 * 2P.1 spent a whole migration removing.
 *
 * ## Where this lives, and what slice 2P.5 may do with it
 *
 * On `/app/settings`, as a section among the others. `2P-SETTINGS-001` gives
 * Settings stable sections in slice 2P.5, and this is written to be moved into
 * one: the semantics are in the action, the projection and the copy, and none
 * of them cares where the section is mounted.
 */

function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function CategoryRow({
  decision,
  locale,
  saveAction,
}: {
  decision: AutomationCategoryDecision;
  locale: Locale;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const copy = getAutomationCopy(locale);
  const category = copy.categories[decision.category];
  const shortfall = calibrationShortfall(decision);
  const automatic = permitsAutomaticWrite(decision);
  const selectId = `automation-state-${decision.category}`;
  const evidenceId = `automation-evidence-${decision.category}`;

  return (
    <li className="automation-row">
      <div className="automation-row-heading">
        <h3>{category.name}</h3>
        <p
          className={automatic ? "automation-state automation-state-active" : "automation-state"}
          data-reason={decision.reason}
        >
          {copy.reasons[decision.reason]}
        </p>
      </div>
      <p className="automation-risk">{category.risk}</p>

      <div className="automation-evidence" id={evidenceId}>
        <p className="automation-evidence-label">{copy.evidenceLabel}</p>
        {!decision.calibration.hasProducer ? (
          <p className="automation-evidence-empty">{copy.noProducer}</p>
        ) : decision.calibration.reviewed === 0 ? (
          <p className="automation-evidence-empty">{copy.noEvidence}</p>
        ) : (
          <dl className="automation-counts">
            <div>
              <dt>{copy.reviewed}</dt>
              <dd>{decision.calibration.reviewed}</dd>
            </div>
            <div>
              <dt>{copy.approved}</dt>
              <dd>{decision.calibration.approved}</dd>
            </div>
            <div>
              <dt>{copy.corrected}</dt>
              <dd>{decision.calibration.corrected}</dd>
            </div>
            <div>
              <dt>{copy.rejected}</dt>
              <dd>{decision.calibration.rejected}</dd>
            </div>
            <div>
              <dt>{copy.undone}</dt>
              <dd>{decision.calibration.undone}</dd>
            </div>
            {decision.calibration.precision !== null ? (
              <div>
                <dt>{copy.precision}</dt>
                <dd>{formatPercent(decision.calibration.precision, locale)}</dd>
              </div>
            ) : null}
          </dl>
        )}
        <p className="automation-required">
          {copy.required}: {decision.requiredReviewed} {copy.reviewed} ·{" "}
          {formatPercent(decision.requiredPrecision, locale)} {copy.precision}
        </p>
        {shortfall !== null && shortfall.reviewed > 0 ? (
          <p className="automation-shortfall">{copy.shortfall(shortfall.reviewed)}</p>
        ) : null}
      </div>

      <form action={saveAction} className="automation-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="category" value={decision.category} />
        <label htmlFor={selectId}>{copy.stateLabel}</label>
        <select
          id={selectId}
          name="automationCategoryState"
          defaultValue={decision.state}
          aria-describedby={evidenceId}
        >
          {(["disabled", "suggest_only", "automatic_when_eligible"] as const).map((state) => (
            <option key={state} value={state}>
              {copy.states[state]}
            </option>
          ))}
        </select>
        <p className="automation-state-help">{copy.stateHelp[decision.state]}</p>
        <button type="submit" className="automation-save">
          {copy.save}
        </button>
      </form>
    </li>
  );
}

export function AutomationSection({
  locale,
  decisions,
  history,
  saveAction,
  undoAction,
}: {
  locale: Locale;
  decisions: readonly AutomationCategoryDecision[];
  history: readonly AutomationPolicyChange[];
  /** Injected, so this component stays free of Server Actions. */
  saveAction: (formData: FormData) => Promise<void>;
  undoAction: (formData: FormData) => Promise<void>;
}) {
  const copy = getAutomationCopy(locale);
  const anyAutomatic = decisions.some(permitsAutomaticWrite);

  return (
    <section className="automation-section" aria-labelledby="automation-title">
      <h2 id="automation-title">{copy.title}</h2>
      <p>{copy.intro}</p>
      {!anyAutomatic ? <p className="automation-posture">{copy.posture}</p> : null}

      <ul className="automation-list" aria-label={copy.listLabel}>
        {decisions.map((decision) => (
          <CategoryRow
            key={decision.category}
            decision={decision}
            locale={locale}
            saveAction={saveAction}
          />
        ))}
      </ul>

      <div className="automation-history">
        <p className="automation-history-label">{copy.historyLabel}</p>
        {history.length > 0 ? (
          <ul className="automation-history-list">
            {history.map((change) => (
              <li key={change.undoId}>
                <span>
                  {copy.categories[change.category].name}: {copy.changedFrom}{" "}
                  {copy.states[change.from ?? "suggest_only"]} → {copy.states[change.to]}
                </span>
                {change.undoable ? (
                  <form action={undoAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="undoId" value={change.undoId} />
                    <button type="submit" className="automation-undo">
                      {copy.undo}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
