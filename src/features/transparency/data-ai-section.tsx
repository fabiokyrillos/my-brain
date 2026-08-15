import Link from "next/link";

import { getNavigationHref } from "@/features/shell/capabilities";
import type { Locale } from "@/lib/preferences";

import { TRANSPARENCY_LENSES } from "./contracts";
import { getTransparencyCopy } from "./copy";

/**
 * Dados e IA, inside Ajustes.
 *
 * ## Three doors, not three tabs — and Processamento is one of them
 *
 * `02-arquitetura-e-rotas.md` says *nenhuma delas na navegação primária* and
 * *"Jobs" … alcançável a partir da falha, sem entrada de menu*. Both hold:
 * `history` and `costs` stay in the `more` disclosure, `jobs` stays
 * `context-only` with no navigation label, and this section is the place inside
 * Ajustes where all three are named together.
 *
 * Processamento is listed here **as well as** being reachable from a failure.
 * "No menu entry" is a statement about the navigation, not an instruction to
 * make a surface findable only by having something go wrong — an owner who
 * wants to know what is running should not have to wait for a failure to be
 * allowed to look.
 *
 * ## No control here does anything but navigate
 *
 * Three links. No toggle, no export, no retry, no "clear history" — every one of
 * those would be a control this section cannot honour, and ADR-114 Decision 7
 * forbids the affordance before it forbids the feature.
 */
export function DataAiSection({ locale }: { locale: Locale }) {
  const copy = getTransparencyCopy(locale);

  return (
    <section className="data-ai-section" aria-labelledby="data-ai-heading">
      <h2 id="data-ai-heading">{copy.title}</h2>
      <p className="data-ai-intro">{copy.intro}</p>
      <ul className="data-ai-doors">
        {TRANSPARENCY_LENSES.map((lens) => (
          <li key={lens}>
            <Link className="data-ai-door" href={getNavigationHref(locale, lens)}>
              <strong>{copy.lenses[lens]}</strong>
              <span>{copy.descriptions[lens]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
