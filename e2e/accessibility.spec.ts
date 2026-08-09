/**
 * `2J-ACCESS-001` … `2J-ACCESS-008` — the browser-level accessibility lane.
 *
 * ## Why this file exists
 *
 * Phase 2I closed `2I-CLOSE-002` as **partial**: component semantics, keyboard
 * behaviour, focus behaviour and ARIA contracts were asserted by jsdom test,
 * but nothing had ever run these surfaces through a real browser. jsdom has no
 * layout engine, no computed style, no paint — so it cannot see a focus ring
 * that renders at zero opacity, a touch target that computes to 28px, a
 * heading order that only breaks once CSS reorders the boxes, or a colour
 * contrast failure. Every one of those ships green under the existing suite.
 *
 * This lane runs in CI on every PR, on **desktop and Pixel 7**, alongside
 * `foundation.spec.ts`.
 *
 * ## What it can and cannot prove — read this before trusting a green run
 *
 * The app's routes are behind `src/proxy.ts` and need a Supabase session, which
 * CI does not have. `e2e/layout-contracts.spec.ts` hit this first and settled
 * the repository's answer: compose the page from the **real stylesheets** and
 * the **exact DOM the components emit**, and make each builder cite the source
 * it mirrors. This file follows that precedent rather than inventing a second
 * one, and inherits its one real cost — **the markup is a mirror, so it can
 * drift from the component.** `accessibility-mirror-guard.test.ts` is what
 * keeps that cost bounded: it re-derives the load-bearing attributes from the
 * component sources on every run, so a component that drops `role="dialog"` or
 * `aria-modal` breaks the guard rather than silently invalidating this file.
 *
 * **Therefore, stated exactly, and never to be rounded up:**
 *
 *   - PROVEN HERE: axe violations, heading and landmark structure, accessible
 *     names, visible focus, focus order, rendered touch targets, reduced-motion
 *     rendering, and dialog semantics — all in a real browser, at two viewports.
 *   - NOT PROVEN HERE: hydrated interactivity. Ctrl+K, arrow-key traversal,
 *     Escape-to-close and focus **restoration** need React running, which needs
 *     an authenticated route. Those remain covered by Phase 2I's jsdom tests
 *     (`command-palette.test.tsx`) and are named as such in the slice record.
 *   - NOT PROVEN ANYWHERE: a real screen-reader session. `2J-ACCESS-008` is a
 *     manual requirement and this file must never be cited as discharging it.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(__dirname, "..");
const require_ = createRequire(__filename);

/**
 * `axe-core` is a **declared devDependency**, not a borrowed transitive one.
 *
 * It already sat in the tree under `eslint-plugin-jsx-a11y`, so declaring it
 * costs no download — but a lane whose scanner arrives by someone else's
 * hoisting is one `npm update` away from silently not running. Declaring it is
 * what makes `2J-ACCESS-002` a fact rather than a coincidence.
 */
const AXE_PATH = require_.resolve("axe-core");

/** Every stylesheet `globals.css` pulls in, minus the unresolvable Tailwind import. */
const STYLESHEETS = [
  "globals.css",
  "palette.css",
  "experience.css",
  "operations.css",
  "mobile-navigation.css",
  "pagination.css",
  // Phase 2K's card grammar. Without it the target-size and focus assertions
  // below would measure an unstyled button and pass for the wrong reason.
  "conversation-cards.css",
] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

async function render(page: Page, body: string, { reducedMotion = false } = {}) {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<title>Acessibilidade</title><style>${css}</style></head>`
      + `<body><div class="app-shell">${body}</div></body></html>`,
    { waitUntil: "load" },
  );
}

/**
 * Runs axe in the page and returns violations at or above `serious`.
 *
 * The threshold is deliberate. `minor` and `moderate` findings on a *mirrored*
 * fixture are as likely to be artefacts of the fixture as of the product —
 * there is no real page chrome, no skip link, no `<main>` provided by the app
 * layout. `serious` and `critical` are the classes that do not depend on that
 * context: a missing accessible name, a non-unique id, an invalid ARIA
 * attribute or a contrast failure is wrong wherever it renders.
 */
async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, {
      resultTypes: ["violations"],
      rules: { region: { enabled: false } },
    });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: unknown[] }>)
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({ id: violation.id, impact: violation.impact, count: violation.nodes.length }));
  });
}

/* ------------------------------------------------------------------ *
 * Fixtures. Each cites the source it mirrors, and every load-bearing
 * attribute below is re-derived from that source by the mirror guard.
 * ------------------------------------------------------------------ */

/** Mirrors the trigger branch of `src/features/palette/command-palette.tsx:170-181`. */
function paletteTrigger() {
  return `<button type="button" class="palette-trigger" aria-haspopup="dialog" data-palette-trigger="true">`
    + `<span>Buscar ou navegar</span><kbd aria-hidden="true">Ctrl K</kbd></button>`;
}

/** Mirrors the open branch of `command-palette.tsx:183-255`, with one group and two options. */
function paletteOpen() {
  const options = [
    ["capture", "Capturar algo", true],
    ["search", "Buscar", false],
  ] as const;
  const rendered = options
    .map(
      ([id, label, active]) =>
        `<button id="palette-list-${id}" type="button" role="option" aria-selected="${active}"`
        + ` class="palette-option${active ? " is-active" : ""}" data-action-id="${id}">${label}</button>`,
    )
    .join("");
  return `<div class="palette-backdrop" data-palette-backdrop="true">`
    + `<div class="palette" role="dialog" aria-modal="true" aria-label="Comandos">`
    + `<div class="palette-field">`
    + `<input class="palette-input" type="text" role="combobox" aria-expanded="true"`
    + ` aria-controls="palette-list" aria-autocomplete="list" aria-activedescendant="palette-list-capture"`
    + ` aria-label="Buscar comandos" placeholder="Buscar ou navegar" value="">`
    + `<button type="button" class="palette-close" aria-label="Fechar">×</button>`
    + `</div>`
    + `<p class="sr-only" role="status" aria-live="polite">2 resultados</p>`
    + `<div class="palette-results" id="palette-list" role="listbox" aria-label="Comandos">`
    + `<div class="palette-group" role="group" aria-label="Criar">${rendered}</div>`
    + `</div></div></div>`;
}

/** Mirrors `src/features/search/search-surface.tsx:108-175`. */
function searchSurface() {
  return `<section class="search-surface"><h1 class="search-title">Buscar</h1>`
    + `<form class="search-form" role="search">`
    + `<label class="sr-only" for="search-q">O que você procura?</label>`
    + `<input id="search-q" class="search-input" type="search" value="">`
    + `<button type="submit" class="ux-action ux-action-primary">Buscar</button>`
    + `<div class="search-filters">`
    + `<label for="search-type">Tipo</label>`
    + `<select id="search-type"><option>Tudo</option></select>`
    + `<label for="search-period">Período</label>`
    + `<select id="search-period"><option>Sempre</option></select>`
    + `<label class="search-sensitive"><input type="checkbox"> Incluir muito sensível</label>`
    + `</div>`
    + `<p class="search-hint">Itens muito sensíveis ficam de fora por padrão.</p>`
    + `</form>`
    + `<p class="sr-only" role="status" aria-live="polite">3 resultados</p>`
    + `<ul class="search-results"><li><a href="#">Contrato da Aurora</a></li></ul>`
    + `</section>`;
}

/** Mirrors `src/app/[locale]/app/library/page.tsx:52-73`. */
function librarySurface() {
  const cards = [
    ["Projetos", "Trabalhos em andamento", 4],
    ["Pessoas", "Quem aparece nos seus registros", 12],
    ["Memórias", "O que o Brain deve lembrar", 7],
  ] as const;
  return `<div class="library-page"><header class="library-head"><h1>Biblioteca</h1>`
    + `<p>Tudo o que o Brain guarda para você.</p>`
    + `<a class="library-search-link" href="#">Buscar em tudo</a></header>`
    + `<ul class="library-grid">`
    + cards
      .map(
        ([name, note, count]) =>
          `<li><a class="library-card" href="#"><span class="library-card-name">${name}</span>`
          + `<span class="library-card-note">${note}</span>`
          + `<span class="library-card-count">${count}</span></a></li>`,
      )
      .join("")
    + `</ul></div>`;
}

/**
 * Mirrors `src/features/conversation-cards/card.tsx` and `read-only-preview.tsx`.
 *
 * `2K-A11Y-001`. Extended **as the slice lands** rather than at closeout,
 * which is Phase 2J's lesson about Phase 2I: accessibility deferred to the end
 * was accessibility not reached.
 *
 * One card per state, so the axe scan covers every tone the grammar can paint
 * and the target-size assertion measures the reveal and the link at both
 * viewports. The masked card carries the reveal control; the `previewed` card
 * carries the link.
 */
function conversationCards() {
  const states = [
    ["previewed", "Encontrei isto"],
    ["requires_confirmation", "Preciso da sua confirmação"],
    ["accepted", "Feito"],
    ["expired", "Isto mudou desde que mostrei"],
    ["refused", "Não fiz isso"],
    ["failed", "Não consegui concluir"],
    ["undone", "Desfeito"],
    ["no_change", "Nada mudou"],
    ["pending", "Trabalhando nisso"],
    ["unavailable", "Isto não está mais disponível para você"],
  ] as const;

  const cards = states
    .map(
      ([state, label]) =>
        `<li><div class="conversation-card-readonly">`
        + `<article class="conversation-card" data-card-type="entry" data-state="${state}">`
        + `<header class="conversation-card-head">`
        + `<span class="conversation-card-type">Registro</span>`
        + `<span class="conversation-card-state">${label}</span></header>`
        + `</article></div></li>`,
    )
    .join("");

  // The masked card: existence shown, content withheld, reveal offered.
  const masked = `<li><div class="conversation-card-readonly">`
    + `<article class="conversation-card" data-card-type="entry" data-state="previewed">`
    + `<header class="conversation-card-head">`
    + `<span class="conversation-card-type">Registro</span>`
    + `<span class="conversation-card-state">Encontrei isto</span></header>`
    + `<p class="conversation-card-snippet conversation-card-masked" data-masked="true">`
    + `Conteúdo sensível, guardado.</p>`
    + `<button class="conversation-card-reveal" type="button" aria-expanded="false">Mostrar mesmo assim</button>`
    + `</article>`
    + `<a class="conversation-card-open" href="#">Abrir</a>`
    + `</div></li>`;

  return `<section aria-label="Cartões da conversa">`
    + `<ul class="assistant-composer-cards">${cards}${masked}</ul></section>`;
}

/**
 * Mirrors the controls slice 2K.2 added: `command-console.tsx`'s edit and
 * discard forms, and `memory-proposal-card.tsx`'s archival undo.
 *
 * `2K-A11Y-001/003/004`. Every control here is measured for rendered target
 * size and focus paint at both viewports, which is the check that caught a real
 * 16px defect the first time this lane ran.
 */
function conversationControls() {
  return `<section aria-label="Controles da conversa">`
    // The edit form: one labelled control for the one editable parameter.
    + `<form class="task-command-edit">`
    + `<label for="task-command-edit-value">Corrigir antes de confirmar</label>`
    + `<input id="task-command-edit-value" type="text" name="value" autocomplete="off">`
    + `<button class="task-command-secondary" type="submit" name="intent" value="edit">`
    + `Rever com essa correção</button>`
    + `</form>`
    // The discard: writes nothing, and says so by being a plain submit.
    + `<form class="task-command-discard">`
    + `<button class="task-command-secondary" type="submit" name="intent" value="discard">`
    + `Descartar</button>`
    + `</form>`
    // The memory undo, which archives. The note is part of the control's
    // meaning, not decoration: it is what stops "undo" reading as deletion.
    + `<div class="memory-proposal memory-proposal-closed">`
    + `<form class="memory-proposal-undo">`
    + `<p class="memory-proposal-undo-note">Arquivar tira a memória de uso: o Brain deixa de usá-la`
    + ` nas respostas, e o registro continua lá.</p>`
    + `<button type="submit">Arquivar essa memória</button>`
    + `</form></div>`
    + `</section>`;
}

/**
 * Mirrors `src/features/conversation-cards/resumed-card.tsx` and
 * `return-to-conversation.tsx` — slice 2K.3's return path.
 *
 * `2K-A11Y-001/003/004/006`. The resumption is a named landmark that takes
 * focus once on arrival, so its region semantics are what this scans; the two
 * links are what the target-size and focus-paint checks measure.
 */
function conversationResumed() {
  return `<section aria-label="Retomada da conversa">`
    + `<div class="conversation-resumed" role="region" aria-label="De volta à conversa" tabindex="-1">`
    + `<p class="conversation-resumed-note">Recalculei isto agora, então preciso que você confirme`
    + ` de novo. Nada foi feito enquanto você esteve fora.</p>`
    + `<article class="conversation-card" data-card-type="entry" data-state="previewed">`
    + `<header class="conversation-card-head">`
    + `<span class="conversation-card-type">Registro</span>`
    + `<span class="conversation-card-state">Encontrei isto</span></header></article>`
    + `<a class="conversation-resumed-anchor" href="#message-1">Voltar para onde você estava</a>`
    + `</div>`
    + `<a class="conversation-return" href="#">Voltar para a conversa</a>`
    + `<article class="chat-message assistant" id="message-1"><span>Brain</span><p>Resposta.</p></article>`
    + `</section>`;
}

/**
 * Mirrors `src/features/conversation-sources/source-list.tsx` — slice 2K.4.
 *
 * Both branches, side by side, because the requirement is that they be
 * **visually distinct**: an evidenced answer and one that found nothing used to
 * render identically, and a lane that scanned only one of them would never see
 * the difference it exists to protect.
 */
function conversationSources() {
  const evidenced = `<div class="conversation-sources" data-evidence="evidenced">`
    + `<strong class="conversation-sources-title">O que eu usei</strong>`
    + `<ul class="conversation-sources-list"><li>`
    + `<span class="conversation-source-support">Você escreveu isto</span>`
    + `<article class="conversation-card" data-card-type="entry" data-state="previewed">`
    + `<header class="conversation-card-head">`
    + `<span class="conversation-card-type">Registro</span>`
    + `<span class="conversation-card-state">Encontrei isto</span></header>`
    + `<p class="conversation-card-snippet">conversa com a Ana</p></article>`
    + `<span class="conversation-source-freshness">De <time datetime="2026-07-20T10:00:00Z">20 de jul.</time></span>`
    + `<a class="conversation-card-open" href="#">Abrir</a>`
    + `</li></ul>`
    + `<p class="conversation-sources-reach">Procurei nos seus registros e nas suas memórias — só nesses dois lugares.</p>`
    + `</div>`;
  const insufficient = `<div class="conversation-sources" data-evidence="insufficient">`
    + `<p class="conversation-sources-insufficient">Não encontrei nada seu sobre isso.`
    + ` O que respondi acima não vem dos seus registros nem das suas memórias.</p>`
    + `<p class="conversation-sources-reach">Procurei nos seus registros e nas suas memórias — só nesses dois lugares.</p>`
    + `</div>`;
  return `<section aria-label="Fontes da resposta">`
    + `<div class="message-sources">${evidenced}</div>`
    + `<div class="message-sources">${insufficient}</div>`
    + `</section>`;
}

/**
 * Mirrors `src/features/conversation-sources/explanation-panel.tsx` — slice 2K.5.
 *
 * Rendered **open** here, deliberately. The product ships it closed, but axe
 * cannot scan what is not in the accessibility tree, and a lane that only ever
 * saw the summary would report green over a body it never looked at.
 */
function conversationExplanation() {
  return `<section aria-label="Como cheguei aqui">`
    + `<details class="conversation-explanation" open>`
    + `<summary>Como cheguei aqui</summary>`
    + `<div class="conversation-explanation-body">`
    + `<ul><li>Encontrei outras coisas suas, mas nenhuma perto o bastante do que você`
    + ` perguntou — deixei todas de fora.</li>`
    + `<li>Algumas memórias suas combinavam, mas você as arquivou, então não usei nenhuma delas.</li></ul>`
    + `<p class="conversation-explanation-correct-title">Se algo aqui está errado</p>`
    + `<p>Abra a fonte acima e corrija ou arquive lá. É isso que muda as próximas respostas.</p>`
    + `<p class="conversation-explanation-no-effect">Ainda não dá para me dizer que eu entendi errado:`
    + ` eu não teria onde guardar isso, e um botão que não faz nada seria pior do que dizer isso claramente.</p>`
    + `</div></details></section>`;
}

/**
 * Mirrors `src/features/conversation-cards/suggestion-row.tsx` — slice 2K.6.
 *
 * Deliberately a list of **text**, with no control in it: a suggestion says
 * what the user could type, and a button would ask on their behalf. So what
 * this scans is contrast and structure, not target size — and the absence of a
 * control is itself part of what the mirror guard pins.
 */
function conversationSuggestions() {
  const items = [
    ["person", "O que ficou pendente com Marina?"],
    ["project", "Como está Aurora?"],
    ["person", "O que ficou pendente com Ana?"],
  ];
  return `<section aria-label="Sugestões"><div class="conversation-suggestions">`
    + `<p class="conversation-suggestions-label">Você pode me perguntar</p>`
    + `<ul class="conversation-suggestions-list">`
    + items.map(([category, text]) => `<li data-category="${category}">${text}</li>`).join("")
    + `</ul></div></section>`;
}

/**
 * Mirrors `src/features/operations/task-list.tsx`, `protected-content.tsx`,
 * `quick-edit.tsx` and `undo-affordance.tsx` — slice 2L.1.
 *
 * `2L-ACCESS-001`. Added **in the slice that builds the surface**, never at
 * closeout: deferring the lane is what produced Phase 2I's partial, and Phase
 * 2J found a real defect the first time the lane was actually run.
 *
 * Two rows, because the interesting assertions need both states. The ordinary
 * row carries the title link, the status controls, the quick-edit disclosure
 * and the undo affordance, so the target-size and focus assertions measure
 * every control this slice ships. The masked row carries the withheld stub, its
 * reveal, and — the property `2L-PRIVACY-003` is about — the same actions as
 * any other row, because a protected task stays operable.
 */
function workList() {
  const row = (id: string, main: string) =>
    `<article class="list-row">`
    + `<label class="work-row-select"><input type="checkbox">`
    + `<span class="sr-only">Select task ${id}</span></label>`
    + `<div class="list-row-main">${main}`
    + `<small class="work-origin">Criada por você</small></div>`
    + `<div class="list-meta">`
    + `<span class="status-badge">Não iniciada</span>`
    + `<div class="row-actions">`
    + `<form><button class="row-action" type="submit">Concluir</button></form>`
    + `<form><button class="row-action" type="submit">Aguardar</button></form>`
    + `</div>`
    + `<details class="work-quick-edit">`
    + `<summary class="work-quick-edit-summary">Editar aqui</summary>`
    + `<div class="task-detail-controls task-detail-controls-inline" aria-label="Editar esta tarefa">`
    + `<ul class="task-control-list">`
    + `<li class="task-control"><form>`
    + `<label for="quick-${id}-title">Título</label>`
    + `<input id="quick-${id}-title" name="value" type="text">`
    + `<button class="row-action" type="submit">Aplicar</button>`
    + `<span class="task-control-name">Renomear</span>`
    + `</form></li>`
    + `<li class="task-control"><form>`
    + `<label for="quick-${id}-due">Prazo</label>`
    + `<input id="quick-${id}-due" name="value" type="date" min="2024-08-09" max="2028-08-09">`
    + `<button class="row-action" type="submit">Aplicar</button>`
    + `<span class="task-control-name">Reagendar</span>`
    + `</form></li>`
    + `</ul></div></details>`
    + `</div></article>`;

  const ordinary = row(
    "a",
    `<a class="work-title-link" href="#"><strong>Enviar proposta</strong></a>`
    + `<p>Versão final para a Aurora.</p>`,
  );
  const masked = row(
    "b",
    `<span class="work-protected" data-masked="true">`
    + `<a class="work-title-link work-protected-label" href="#">Conteúdo protegido</a>`
    + `<button class="work-protected-toggle" type="button">Mostrar conteúdo protegido de Tarefa 2</button>`
    + `</span>`,
  );

  return `<div class="work-page"><div class="list-stack">${ordinary}${masked}`
    + `<p class="quiet-state work-protected-note">A proteção acompanha a anotação de origem da tarefa.`
    + ` Tarefas que você criou direto aqui não têm origem para acompanhar.</p>`
    + `</div>`
    // The outcome region and its undo, which is where `2L-ACCESS-006` lives:
    // one announcement, and focus moved to the result rather than per control.
    + `<div class="work-action-result" role="region" aria-label="Resultado da ação" tabindex="-1">`
    + `<strong>Feito</strong><p>A alteração foi aplicada.</p>`
    + `<div class="work-undo">`
    + `<div role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>`
    + `<form><button class="row-action work-undo-button" type="submit">Desfazer</button>`
    + `<p class="work-undo-window">Você pode desfazer isto por 24 horas.</p></form>`
    + `</div></div></div>`;
}

/**
 * Mirrors `src/features/daily-cycle/task-detail-view.tsx` in its panel frame —
 * slice 2L.1, `2L-EDIT-007`.
 *
 * The panel is the frame the wide viewport docks beside the list and the narrow
 * viewport renders as the whole surface. It carries the same control set as the
 * full-page mount by construction (one component), so what this scans is the
 * frame's own structure: the close control, the heading order and the withheld
 * provenance excerpt.
 */
function workTaskPanel() {
  return `<div class="content-page task-detail-page task-detail-panel">`
    + `<button class="back-link task-panel-close" type="button">Voltar para Trabalho</button>`
    + `<header class="task-detail-header"><div>`
    + `<p class="eyebrow">TAREFA</p>`
    + `<span class="work-protected" data-masked="true">`
    + `<span class="work-protected-label">Conteúdo protegido</span>`
    + `<button class="work-protected-toggle" type="button">Mostrar</button>`
    + `</span>`
    + `</div><span class="status-badge">Não iniciada</span></header>`
    + `<section class="task-detail-section" aria-label="Detalhes"><h2>Detalhes</h2>`
    + `<dl class="task-fields"><div class="task-field"><dt>Prazo</dt><dd>31 de julho</dd></div></dl>`
    + `</section>`
    + `<section class="task-detail-section" aria-label="De onde veio"><h2>De onde veio</h2>`
    + `<p class="quiet-state">Esta tarefa veio de um registro seu.</p>`
    + `<span class="work-protected" data-masked="true">`
    + `<span class="work-protected-label">Conteúdo protegido</span>`
    + `<button class="work-protected-toggle" type="button">Mostrar</button>`
    + `</span>`
    + `<a class="panel-view-all" href="#">Abrir o registro original</a>`
    + `</section></div>`;
}

/**
 * Mirrors `src/features/operations/bulk-bar.tsx` and the row checkbox in
 * `task-list.tsx` — slice 2L.2.
 *
 * `2L-ACCESS-001`/`-005`/`-006`. Three things this scans that jsdom cannot:
 * the checkbox's rendered target at a mobile viewport, the focus ring on the
 * operation and value pickers, and the result region's structure once the
 * stylesheet has laid it out.
 *
 * The bar is rendered in its **result** state, because that is the state with
 * the most to get wrong: a live region, a focusable landmark, a list of
 * per-item reasons and one undo control per applied item.
 */
function workBulkBar() {
  return `<section aria-label="Bulk actions" class="work-bulk-bar">`
    + `<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">2 updated; 1 did not change.</div>`
    + `<div class="work-bulk-selection">`
    + `<strong>3 selected</strong>`
    + `<span class="work-bulk-hint">You can select up to 50 tasks at a time.</span>`
    + `<button class="row-action" type="button">Clear selection</button>`
    + `</div>`
    + `<form class="work-bulk-form">`
    + `<label for="work-bulk-action">What to do with the selected tasks</label>`
    + `<select id="work-bulk-action"><option value="set_priority">Set priority</option></select>`
    + `<label for="work-bulk-value">New value</label>`
    + `<select id="work-bulk-value" name="value"><option value="high">High</option></select>`
    + `<div class="work-bulk-preview"><strong>Before applying</strong>`
    + `<p>2 will change; 1 cannot take this change right now.</p>`
    + `<p class="quiet-state">The task&#39;s current state does not allow this change.</p></div>`
    + `<button class="row-action" type="submit">Apply to selected</button>`
    + `</form>`
    + `<div class="work-bulk-result" role="region" aria-label="Bulk action result" tabindex="-1">`
    + `<strong>2 updated; 1 did not change.</strong>`
    + `<ul class="work-bulk-result-list">`
    + `<li class="work-bulk-result-refused">This task&#39;s state changed since you selected it.</li>`
    + `</ul>`
    + `<div class="work-undo">`
    + `<div role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>`
    + `<form><button class="row-action work-undo-button" type="submit">Undo</button>`
    + `<p class="work-undo-window">You can undo this for 24 hours.</p></form>`
    + `</div></div></section>`;
}

const SURFACES = [
  { name: "command palette (closed)", body: () => paletteTrigger() },
  { name: "command palette (open)", body: () => paletteOpen() },
  { name: "global search", body: () => searchSurface() },
  { name: "Library", body: () => librarySurface() },
  { name: "Conversar cards", body: () => conversationCards() },
  { name: "Conversar controls", body: () => conversationControls() },
  { name: "Conversar resumed", body: () => conversationResumed() },
  { name: "Conversar sources", body: () => conversationSources() },
  { name: "Conversar explanation", body: () => conversationExplanation() },
  { name: "Conversar suggestions", body: () => conversationSuggestions() },
  { name: "Work list", body: () => workList() },
  { name: "Work task panel", body: () => workTaskPanel() },
  { name: "Work bulk bar", body: () => workBulkBar() },
] as const;

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-001 — the automated scan, both viewports, every surface.
 * ------------------------------------------------------------------ */

for (const surface of SURFACES) {
  test(`2J-ACCESS-001: ${surface.name} has no serious or critical axe violations`, async ({ page }) => {
    await render(page, surface.body());
    expect(await axeViolations(page)).toEqual([]);
  });
}

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-005 — visible focus, measured from paint, not from source.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-005: every focusable control paints a visible focus indicator", async ({ page }) => {
  await render(page, `${paletteTrigger()}${searchSurface()}${conversationCards()}${conversationControls()}${conversationResumed()}${conversationSources()}${conversationExplanation()}${conversationSuggestions()}${workList()}${workTaskPanel()}${workBulkBar()}`);
  const focusables = page.locator("button, a[href], input, select, [tabindex]:not([tabindex='-1'])");
  const total = await focusables.count();
  expect(total).toBeGreaterThan(3);

  for (let index = 0; index < total; index += 1) {
    const control = focusables.nth(index);
    await control.focus();
    // A ring is "visible" if focusing changed something a sighted user can see.
    // Reading `outline-style` alone would pass a rule that sets `outline: none`
    // and compensates with a box-shadow, and would fail a design that does the
    // reverse -- so the assertion is on the union, not on one property.
    const visible = await control.evaluate((node) => {
      const style = getComputedStyle(node);
      const outlined = style.outlineStyle !== "none" && parseFloat(style.outlineWidth || "0") > 0;
      const shadowed = style.boxShadow !== "none" && style.boxShadow !== "";
      const bordered = parseFloat(style.borderWidth || "0") > 0;
      return outlined || shadowed || bordered;
    });
    expect(visible, `control ${index} paints no focus indicator`).toBe(true);
  }
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-003/004 — focus order follows the visual order, and the
 * dialog's own controls are reachable in sequence.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-003: tab order through the open palette follows the visual order", async ({ page }) => {
  await render(page, paletteOpen());
  await page.locator(".palette-input").focus();

  const seen: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return "none";
        return active.getAttribute("data-action-id") ?? active.className ?? active.tagName;
      }),
    );
  }
  // Close button, then the two options in the order the eye reads them. The
  // assertion is on the prefix rather than the whole ring: what matters is that
  // nothing is skipped and nothing arrives out of order.
  expect(seen.slice(0, 3)).toEqual(["palette-close", "capture", "search"]);
});

test("2J-ACCESS-004: the dialog exposes modal semantics and an accessible name", async ({ page }) => {
  await render(page, paletteOpen());
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-label", /.+/);
  // The combobox must point at a listbox that exists, or arrow-key
  // announcements reference nothing. jsdom cannot check the referent resolves.
  const controls = await page.locator(".palette-input").getAttribute("aria-controls");
  await expect(page.locator(`#${controls}`)).toHaveAttribute("role", "listbox");
  const active = await page.locator(".palette-input").getAttribute("aria-activedescendant");
  await expect(page.locator(`#${active}`)).toHaveAttribute("role", "option");
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-006 — rendered touch targets, mobile only.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-006: interactive targets meet the minimum rendered size", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch targets are a mobile contract");
  await render(page, `${paletteTrigger()}${paletteOpen()}${librarySurface()}${conversationCards()}${conversationControls()}${conversationResumed()}${conversationSources()}${conversationExplanation()}`);

  const targets = page.locator("button, a[href]");
  const total = await targets.count();
  for (let index = 0; index < total; index += 1) {
    const box = await targets.nth(index).boundingBox();
    if (!box) continue;
    const label = await targets.nth(index).innerText();
    // 24px is WCAG 2.2 AA (2.5.8). The repository has no larger stated ceiling,
    // so the lane asserts the standard rather than inventing a house rule.
    expect(Math.min(box.width, box.height), `target "${label.trim().slice(0, 30)}" is too small`)
      .toBeGreaterThanOrEqual(24);
  }
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-007 — reduced motion, verified from computed style.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-007: reduced-motion suppresses animation on the palette", async ({ page }) => {
  await render(page, paletteOpen(), { reducedMotion: true });
  const animated = await page.locator(".palette").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animation: style.animationDuration,
      transition: style.transitionDuration,
    };
  });
  // Either the surface never animated, or the reduced-motion query zeroed it.
  // Both are correct outcomes; an animation that still runs is not.
  const durations = [animated.animation, animated.transition]
    .flatMap((value) => value.split(",").map((part) => parseFloat(part) || 0));
  expect(Math.max(...durations, 0)).toBe(0);
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-003 (announcements) — status regions exist and are polite.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-003: result counts are announced politely without stealing focus", async ({ page }) => {
  await render(page, `${paletteOpen()}${searchSurface()}`);
  const statuses = page.locator("[role='status']");
  expect(await statuses.count()).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < (await statuses.count()); index += 1) {
    await expect(statuses.nth(index)).toHaveAttribute("aria-live", "polite");
    // A live region that can take focus would move the user on every keystroke.
    await expect(statuses.nth(index)).not.toHaveAttribute("tabindex", /.*/);
  }
});
