import { ArrowUpRight, Clock3, MessageSquareText, Sparkles } from "lucide-react";
import type { Locale } from "@/lib/preferences";
import { getMessages } from "@/i18n/messages";

export function HomeDashboard({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home;
  return <div className="dashboard">
    <section className="hero"><p className="eyebrow">{t.eyebrow}</p><h1>{t.greeting}<br/><span>{t.prompt}</span></h1><form className="capture-card"><label htmlFor="quick-entry" className="sr-only">{t.placeholder}</label><textarea id="quick-entry" name="entry" placeholder={t.placeholder}/><div className="capture-actions"><span><Sparkles size={15}/> Brain interpreta depois de salvar</span><button type="submit">{t.send}<ArrowUpRight size={17}/></button></div></form></section>
    <section className="dashboard-grid">
      <article className="panel priority-panel"><header><div><span className="panel-kicker">01 / AGORA</span><h2>{t.priority}</h2></div><span className="count">0</span></header><div className="empty-state"><div className="thread-line"/><div><strong>{t.empty}</strong><p>{t.emptyHint}</p></div></div></article>
      <article className="panel"><header><div><span className="panel-kicker">02 / CONTEXTO</span><h2>{t.waiting}</h2></div><Clock3 size={19}/></header><p className="quiet-state">Nada aguardando retorno.</p></article>
      <article className="panel"><header><div><span className="panel-kicker">03 / CLAREZA</span><h2>{t.questions}</h2></div><MessageSquareText size={19}/></header><p className="quiet-state">Nenhuma pergunta em aberto.</p></article>
      <article className="panel review-panel"><header><div><span className="panel-kicker">04 / RITMO</span><h2>{t.nextReview}</h2></div></header><div className="review-time"><strong>22:00</strong><span>Resumo diário · hoje</span></div></article>
    </section>
  </div>;
}
