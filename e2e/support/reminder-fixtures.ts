/**
 * Static markup for Lembretes — the list and the reminder's own page — as
 * `reminder-list.tsx`, `reminder-actions.tsx`, `reminder-detail.tsx`,
 * `series-controls.tsx` (parts `fact` and `end`) and the reminders route emit
 * them since ADR-180.
 *
 * Shared by the two static lanes that measure these surfaces
 * (`lembretes-e-onboarding.spec.ts` and `life-brain-d1-agenda.spec.ts`), so the
 * mirror is written once. Each lane asserts, against the component source,
 * that the class names used here are still the ones emitted.
 */

const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"></svg>';

/** One unbreakable run, the shape that made Hoje scroll sideways. */
export const UNBREAKABLE = "dev_digital_bi.test_schema.nc_booking_population_by_ship_and_channel";

export type ReminderRowFixture = {
  id: string;
  time: string;
  day?: string;
  title: string;
  status?: "scheduled" | "sent" | "cancelled";
  caption?: string[];
  important?: boolean;
  verb?: string | null;
};

export function reminderRow(row: ReminderRowFixture): string {
  const status = row.status ?? "scheduled";
  const label = status === "sent" ? "Entregue em" : status === "cancelled" ? "Estava marcado para" : "Próximo aviso";
  const word = status === "sent" ? "Entregue" : status === "cancelled" ? "Cancelado" : "Agendado";
  const verb = row.verb === undefined ? (status === "scheduled" ? "Adiar 1h" : status === "cancelled" ? "Reativar" : null) : row.verb;
  return `<li class="reminder-row ${status}" id="reminder-${row.id}">`
    + `<p class="reminder-row-when"><span class="sr-only">${label}: <span>20 de novembro de 2026 às ${row.time}</span></span>`
    + (row.day ? `<span aria-hidden="true" class="reminder-row-day">${row.day}</span>` : "")
    + `<span aria-hidden="true" class="reminder-row-time">${row.time}</span></p>`
    + `<div class="reminder-row-main"><a class="reminder-row-title" href="#${row.id}">${row.title}</a>`
    + `<p class="reminder-row-caption"><span class="sr-only">${word}</span>`
    + (row.important ? `<span class="reminder-important">Importante</span>` : "")
    + (row.caption ?? []).map((part, index) => `<span class="${index === 0 ? "reminder-row-repeats" : "reminder-row-subject"}">${part}</span>`).join("")
    + `</p></div>`
    + (verb === null ? "" : `<form class="reminder-row-verb"><input name="action" type="hidden" value="snooze" /><button class="reminder-verb" type="submit">${verb}</button></form>`)
    + `</li>`;
}

export function reminderGroup(key: string, label: string, rows: string[], note?: string): string {
  return `<section aria-labelledby="reminder-group-${key}" class="reminder-group" data-group="${key}">`
    + `<h2 class="reminder-group-heading" id="reminder-group-${key}">${label}<span class="reminder-group-count">${rows.length}</span></h2>`
    + (note ? `<p class="reminder-group-note">${note}</p>` : "")
    + `<ul class="reminder-rows">${rows.join("")}</ul></section>`;
}

function masthead(subject: string, caption: string): string {
  const lens = (current: boolean, label: string) =>
    `<a class="ui-segmented__option" href="#"${current ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="agenda-masthead"><div class="agenda-masthead-top"><h1 class="agenda-masthead-title"><span>Agenda</span></h1>`
    + `<nav aria-label="Lentes da agenda" class="ui-segmented agenda-lenses">${lens(false, "Calendário")}${lens(false, "Planejar")}${lens(true, "Lembretes")}</nav></div>`
    + `<div class="reminders-subject"><p class="reminders-subject-title">${subject}</p><p class="reminders-subject-caption">${caption}</p>`
    + `<div class="reminder-compose"><button class="reminder-compose-open" type="button">${ICON}Novo lembrete</button></div></div></header>`;
}

function banners(): string {
  return `<div aria-atomic="true" aria-busy="false" aria-label="Lembretes" aria-live="polite" class="reminder-page-feedback" role="status"></div>`
    + `<div class="reminder-series-feedback"><div aria-atomic="true" aria-live="polite" class="reminder-series-live" role="status"></div></div>`;
}

function viewNav(current: string): string {
  const view = (key: string, label: string) =>
    `<a class="reminder-view" href="?view=${key}"${key === current ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<nav aria-label="Mostrar" class="reminder-views"><span aria-hidden="true" class="reminder-views-label">Mostrar</span>`
    + `${view("pending", "Pendentes")}${view("delivered", "Entregues")}${view("cancelled", "Cancelados")}${view("all", "Todos")}</nav>`;
}

/** The page: every section the list can draw, with a title that cannot break. */
export function remindersBody(options: { empty?: boolean } = {}): string {
  if (options.empty) {
    return `<div class="content-page">${masthead("Próximos lembretes", "Nenhum lembrete")}${banners()}`
      + `<p class="ux-state-line ux-tone-neutral reminder-empty" data-ux-state="empty" data-ux-density="line"><span class="ux-state-line-text">Crie um em “Novo lembrete” ou peça ao Brain durante uma captura.</span></p>`
      + `${viewNav("pending")}</div>`;
  }
  return `<div class="content-page">${masthead("Todos os lembretes", "8 lembretes")}${banners()}<div class="reminder-groups">`
    + reminderGroup("late", "Passou do horário", [
      reminderRow({ id: "r1", time: "08:00", title: "Tomar o remédio da pressão", caption: ["Todo dia"] }),
    ], "O horário já passou — vai disparar na próxima verificação.")
    + reminderGroup("today", "Hoje", [
      reminderRow({ id: "r2", time: "16:30", title: `Comparar a tabela ${UNBREAKABLE} com os próprios números` }),
      reminderRow({ id: "r3", time: "17:00", title: "Pagar o condomínio", important: true, caption: ["Toda última sexta-feira do mês", "Tarefa: Pagar o condomínio"] }),
    ])
    + reminderGroup("tomorrow", "Amanhã", [reminderRow({ id: "r4", time: "09:00", title: "Levar o passaporte para a reunião com a Marina" })])
    + reminderGroup("week", "Nos próximos dias", [
      reminderRow({ id: "r5", time: "14:00", day: "sex., 20/11", title: "Enviar o relatório semanal de participação do app por navio e por canal de venda", caption: ["Toda sexta-feira", `Tarefa: ${UNBREAKABLE}`] }),
    ])
    + reminderGroup("later", "Mais adiante", [
      reminderRow({ id: "r6", time: "09:00", day: "05/05/2027", title: "Aniversário da Ana", caption: ["Todo ano em 5 de maio", "Registro: Ana faz aniversário em 5 de maio."] }),
    ])
    + reminderGroup("delivered", "Entregues", [
      reminderRow({ id: "r7", time: "10:00", day: "dom., 15/11", title: "Comprar o presente da Ana", status: "sent" }),
    ], "Já foi entregue e não dispara de novo.")
    + reminderGroup("cancelled", "Cancelados", [
      reminderRow({ id: "r8", time: "09:00", day: "qui., 12/11", title: "Cancelar o Claude Code", status: "cancelled" }),
    ], "Não vai disparar até ser reativado.")
    + `</div>${viewNav("all")}</div>`;
}

const panelActions = (accept: string, dismiss: string, tone = "primary") =>
  `<div class="reminder-panel-actions"><button class="reminder-button ${tone}" type="submit">${accept}</button><button class="reminder-button" type="button">${dismiss}</button></div>`;

/**
 * The reminder's page: scheduled, repeating, linked — the busiest it can be.
 * `open` names the one editor that is open, as the page allows one at a time.
 */
export function reminderDetailBody(options: { open?: "reschedule" | "edit" | "series" | "end" | "cancel"; title?: string } = {}): string {
  const title = options.title ?? `Enviar o relatório ${UNBREAKABLE} semanal de participação do app`;
  const open = options.open;
  const fact = (label: string, dd: string) => `<div class="reminder-fact"><dt>${label}</dt><dd>${dd}</dd></div>`;
  const reschedule = open === "reschedule"
    ? `<div class="reminder-fact-editor"><form class="reminder-panel"><label for="remind-at">Novo horário<input id="remind-at" name="remindAtLocal" required type="datetime-local" value="2026-11-20T14:00" /></label>${panelActions("Salvar", "Fechar")}</form>`
      + `<form class="reminder-snooze"><label class="reminder-inline-label" for="snooze">Adiar por</label><select class="reminder-select" id="snooze" name="snoozeMinutes"><option>3 horas</option></select><button class="reminder-button" type="submit">Adiar</button></form></div>`
    : "";
  const series = open === "series"
    ? `<form class="reminder-panel reminder-fact-editor"><fieldset class="reminder-scope"><legend>O que você quer alterar?</legend><p class="reminder-series-hint">Escolha antes de salvar. Nada muda até você confirmar.</p>`
      + `<label class="reminder-checkbox" for="scope-a"><input checked id="scope-a" name="scope" type="radio" />Somente esta ocorrência</label>`
      + `<label class="reminder-checkbox" for="scope-b"><input id="scope-b" name="scope" type="radio" />Esta e as futuras</label></fieldset>`
      + `<label for="series-title">Novo título<input id="series-title" name="title" type="text" value="${title}" /></label>`
      + `<label for="series-time">Novo horário<input id="series-time" name="anchorTime" type="time" value="14:00" /></label>${panelActions("Salvar alteração", "Fechar")}</form>`
    : "";
  const edit = open === "edit"
    ? `<form class="reminder-panel reminder-fact-editor"><label for="edit-title">Título do lembrete<input id="edit-title" name="title" type="text" value="${title}" /></label>`
      + `<label class="reminder-checkbox" for="edit-important"><input id="edit-important" name="important" type="checkbox" />Marcar como importante</label>${panelActions("Salvar", "Fechar")}</form>`
    : "";
  const confirm = (heading: string, body: string, accept: string, dismiss: string) =>
    `<form class="reminder-panel danger"><p class="reminder-panel-title">${heading}</p><p class="reminder-panel-body">${body}</p>${panelActions(accept, dismiss, "danger")}</form>`;
  return `<div class="content-page">${banners()}<article class="reminder-detail scheduled" id="reminder-r5">`
    + `<header class="reminder-detail-head"><a class="reminder-detail-back" href="#">${ICON}Lembretes</a>`
    + `<h1 class="reminder-detail-title">${title}</h1>`
    + `<p class="reminder-detail-state"><span class="reminder-state">Agendado</span><span class="reminder-important">Importante</span></p>`
    + `<p class="reminder-detail-note" data-tone="attention">O horário já passou — vai disparar na próxima verificação.</p>`
    + `<div class="reminder-detail-verbs"><form class="reminder-row-verb"><button class="reminder-button" type="submit">Adiar 1h</button></form>`
    + `<button aria-expanded="${open === "edit"}" class="reminder-fact-verb" type="button">Editar</button></div>${edit}</header>`
    + `<section aria-labelledby="facts" class="reminder-detail-section"><h2 class="reminder-group-heading" id="facts">Detalhes</h2><dl class="reminder-facts">`
    + fact("Próximo aviso", `<span class="reminder-fact-value">20 de novembro de 2026 às 14:00</span><button aria-expanded="${open === "reschedule"}" class="reminder-fact-verb" type="button">Reagendar</button>${reschedule}`)
    + fact("Repetição", `<div class="reminder-series" data-part="fact"><p class="reminder-series-facts"><span class="reminder-series-badge sr-only">Repete</span><span class="reminder-series-rule">Toda última sexta-feira do mês</span></p>`
      + `<button aria-expanded="${open === "series"}" class="reminder-fact-verb" type="button">Alterar repetição</button>${series}</div>`)
    + fact("Ligado a", `<a class="reminder-fact-link" href="#">Tarefa: ${UNBREAKABLE}</a>`)
    + `</dl></section>`
    + `<footer class="reminder-detail-foot"><a class="reminder-history-link" href="#">Ver no histórico</a>`
    + `<div class="reminder-series" data-part="end"><button aria-expanded="${open === "end"}" class="reminder-risk-verb" type="button">Encerrar repetição</button>`
    + `<p class="reminder-series-hint">Cancelar esta ocorrência não encerra a repetição.</p>`
    + (open === "end" ? confirm("Encerrar esta repetição?", "Ela para de gerar novas ocorrências. As anteriores continuam na lista e no histórico.", "Sim, encerrar", "Manter repetindo") : "")
    + `</div><button aria-expanded="${open === "cancel"}" class="reminder-risk-verb" type="button">Cancelar lembrete</button>`
    + (open === "cancel" ? confirm("Cancelar este lembrete?", "Esta ocorrência é cancelada e a repetição agenda a próxima. Ela não poderá ser reativada.", "Sim, cancelar", "Manter agendado") : "")
    + `</footer></article></div>`;
}
