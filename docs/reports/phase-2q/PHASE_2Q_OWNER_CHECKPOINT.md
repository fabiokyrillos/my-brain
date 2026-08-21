# Phase 2Q — Owner device checkpoint

**Eight things to try, on your own device. Phase 2Q is not closed until you have.**

This is the gate. Every technical slice is merged, CI is green on each merge SHA,
the migration is applied, the matrix says 42/42 — and **none of that is the thing
the phase was for.** The phase was for: *"se a revisão disser que eu concluí a
tarefa X, deve existir um link para a tarefa X real"*. Only you can confirm that.

**One item spends money.** Item 1 generates a review, which is a paid AI call
against your BYOK credential. Nothing in this phase spent one — it is recorded as
**UNSPENDABLE**, not as a pass — and item 1 is where that gets settled, by you.

---

## Before you start

Open **Configurações → Aparência** and pick **Escuro** for items 7 and 8; the
rest work in either theme.

---

## 1. A new review, with its sources  ⚠️ *spends AI credit*

Go to **Revisões**, pick the tab for the period that is running now, and press
**Gerar**.

**What should happen:** the review is written, and below its text a **Fontes**
section lists **Itens citados** — one row per record it used, each showing a kind
(*Registro* / *Tarefa*), a date, and a link.

**What would be wrong:** a "Fontes" section with no links in it. That is
explicitly *not* delivery (ADR-125 Decision 4), and it is the shape this phase
was told to avoid.

---

## 2. The task link

In that review's **Itens citados**, find a row labelled **Tarefa** and open it.

**What should happen:** you land on that task's own page, showing the real task.

**This is `2P-REVIEW-CITATIONS`.** It has been NOT DELIVERED since Phase 2P, and
this is the moment it either becomes delivered or does not.

---

## 3. The entry link

In the same list, open a row labelled **Registro**.

**What should happen:** you land on that entry's page in **Entradas**.

**What would be wrong:** landing anywhere else, or a page that says the record
does not exist. A link that goes to the wrong surface is the exact defect
`2Q-LINK-002` closed.

---

## 4. A historical review

Open a review generated **before today** — any older one in the list.

**What should happen:** it says its references *"não foram registradas quando ela
foi escrita"*, and shows **no** empty list and no fabricated section.

**What would be wrong:** an empty "Itens citados" heading with nothing under it,
or a claim that the Brain found nothing. Those are different facts and the
product should tell you the true one.

---

## 5. A removed source

From the review in item 1, note one cited **task**. Open it, delete it, then go
back to the review and reload.

**What should happen:** that row is still listed, still labelled **Tarefa**, and
now reads **"Não está mais disponível"** — with **no link**.

**What would be wrong:** a link that leads to a "not found" page. Handing you a
link that fails is the failure class this phase exists to remove.

---

## 6. No preview anywhere

Look at the **Itens citados** list again, on any review.

**What should be true:** each row shows only a kind, a date and a link. **No
title, no excerpt, no preview of any record's content**, and no "mostrar mesmo
assim" button anywhere.

That is `OD-2Q-5` option C, which you chose against the recommendation. If you
see a title or a snippet there, the implementation drifted from your decision.

---

## 7. Mobile

Open the same review **on your phone**.

**What should be true:** each cited row stacks readably, the link is comfortable
to tap, and nothing scrolls sideways.

---

## 8. Contrast in Safari

On your iPhone or on Safari, in **dark mode**, open **Buscar** and then **Work**
with a couple of tasks selected so the bulk bar appears.

**What should be true:** every label, dropdown and control is readable — no black
text on the dark background.

**Context, so this item is not misread:** the WebKit contrast failure this phase
investigated turned out to be a **defect of the test lane, not of the product**
(ADR-129). Measured on the real app, both engines already agree. **This item is
you confirming that with your own eyes**, on real Safari rather than on
Playwright's WebKit — which is the one thing no lane here can do.

---

## What this checkpoint cannot settle, and is not asking you to

- **VoiceOver.** `2P-ACCESS-005` stays **WAIVED, NOT PASSED**. Nothing in this
  phase is screen-reader evidence, and none of the eight items above is a
  screen-reader test.
- **`RG-DEP-3`** and the rollout gate. Untouched, and still not closable by
  writing a file.
- **`2P-ATTENTION-008`'s back-navigation half.** Re-audited and found narrower
  than Phase 2P recorded; still open, still yours to place.

---

## After you have run it

Tell me which items passed and which did not. Then, and only then:

- the closing report is written,
- `2P-REVIEW-CITATIONS` is marked delivered **or stays not delivered**,
- and Phase 2Q is declared complete.

**If any item fails, the phase does not close.** A failing item is a defect to
fix, not a remainder to record.
