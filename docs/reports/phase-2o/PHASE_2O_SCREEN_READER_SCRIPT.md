# Phase 2O — the screen-reader session, and the script for running it

**Status: `NOT EXECUTED`.**

`2O-ACCESS-006` closes **`partial`** for slice 2O.7. ADR-118 Decision 8 and
ADR-116 Decision 3 permit exactly two outcomes and this is the second one: the
session is executed and recorded with device, software and version, or it is
recorded as not executed. **There is no third outcome, and nothing in this
document may be read as one.** No automated scan, no emulator, no inference
from either, and no part of the axe coverage slice 2O.7 shipped promotes this to
a pass.

The residual is open since `2L-ACCESS-008`. `OD-2O-11` admits it as one of the
two things this phase may take on, and `OD-2O-12` **B** means its absence does
not on its own block closeout.

---

## What the automated coverage already proves, and what it cannot

Slice 2O.7 ships axe over **nineteen real rendered surfaces** in two locales,
light and dark, with a control that fails if a dark run silently renders light.
It also proves every control has a computed accessible name, a visible focus
indicator and a keyboard path.

None of that is a screen-reader session. Axe reads the accessibility tree; a
person hears an announcement. The things only the second one finds are the
things this script is pointed at:

- an accessible **name** that is correct and **useless** — "Aplicar", "Abrir",
  "Ver" — repeated eleven times on one page with nothing to tell them apart;
- an announcement that arrives in the wrong **order**, or twice, or not at all;
- a live region that announces the same sentence the heading already said;
- a state change the eye sees and the ear never hears.

---

## The device and software to record

Fill this in when the session runs. All four fields, because "VoiceOver on
iPhone" is not a version.

| Field | Value |
|---|---|
| Device | |
| OS and version | |
| Screen reader and version | |
| Browser and version | |
| Date | |

---

## The script — about twenty minutes

Turn VoiceOver on with **triple-click of the side button**, or Settings →
Accessibility → VoiceOver. Swipe right to move forward, swipe left to move back,
double-tap to activate. Use the **rotor** (two fingers, rotate) to switch to
*Headings* where the script asks for it.

Sign in first, with VoiceOver **off** — the login form is not what this is
testing, and fighting it wastes the session.

### 1 · Ajustes — the preferences centre (`/pt-BR/app/settings`)

This is the densest surface the phase built and the one most likely to fail.

1. Set the rotor to **Headings** and swipe down through the page. **Say aloud
   whether you can tell what each section is for from its heading alone.** The
   page should open at *"Ajustes"* and never announce a heading before it.
2. Return the rotor to **Characters/Words** and swipe forward through the
   credential panel. Listen for:
   - the status sentence — it must say either **"Nenhuma chave configurada"** or
     **"Chave removida"**, and these must be different sentences. (Slice 2O.7
     minted the second one for exactly this reason.)
   - the key field's label and its hint. **The hint must be announced as a
     description, not as part of the field's name.**
   - **nothing that reads out a key, a fragment of one, or a placeholder that
     sounds like one.**
3. Reach the **appearance** choice. Three radios. Each must announce its own
   label — *"Seguir o aparelho"*, *"Claro"*, *"Escuro"* — and its description
   separately. **If all three announce the same two words, that is the defect
   this surface was corrected for once already; say so.**
4. Reach **Instalar como app**. Three platforms, each a term and its
   instruction. **Does the pairing survive?** If the platform name and the
   gesture are announced as two unrelated lines, the description list is not
   doing its job.
5. Reach the two actions at the bottom: **"Gerar exportação"** and **"Sair de
   todos os dispositivos"**. Activate neither. Both must announce as buttons
   with those names.

### 2 · Notificações (`/pt-BR/app/notifications`)

1. Swipe to the three facts. **They must be three separate statements** —
   consent, permission, delivery. If you hear one summary, that is
   `2O-NOTIFY-007`'s defect.
2. **Nothing may claim that alerts are being delivered.** Push fails with HTTP
   403 on iPhone and has never been tested on Android; the surface is supposed
   to say so. If anything you hear implies delivery works, that is the most
   important finding in this whole session.
3. Reach the strip of links at the top. The **current page must not be a link**
   — it should announce as text, not as something to activate.

### 3 · O cockpit (`/pt-BR/app`)

1. Move to the composer. **The textarea must announce a label.** It is visually
   hidden, which is correct; hearing nothing is not.
2. Type something short and submit. **Is the outcome announced?** Listen for
   whether it arrives once or twice — a double announcement is a real defect and
   this product has shipped one before.
3. Swipe through the onboarding path. Each step announces a title, a state and
   an action. **A step already done must say so in words**, not only by looking
   dimmer.

### 4 · Privacidade e consentimento (bottom of Ajustes)

1. Swipe through the twelve data categories. **Each must announce its name and
   its count.** A number with no name, or a name with no number, is a finding.
2. The three withheld categories must announce **why** they are withheld.

### 5 · One page in English

Switch to `/en/app/settings` and swipe through the headings. **VoiceOver reads
in the voice it thinks the page is in.** If the English page is announced with
Portuguese pronunciation, the document's language is wrong — and that is a
finding this whole slice's automated coverage cannot see.

---

## Recording what you find

For each finding, three lines are enough:

```
Surface:      Ajustes — appearance
Heard:        "Claro" three times, once per option
Expected:     each option's own label, with its description separate
```

Anything found here is dispositioned in the 2O.8 closeout: repaired, or recorded
as a named residual with a destination. **A session that finds nothing is still
a pass and must still be recorded** with the device table filled in — that is
what turns `2O-ACCESS-006` from `partial` into `built`, and it is the only thing
that can.
