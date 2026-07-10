// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/culture/explainers.ts
// Description: Curated static explainer cards for the Cultural Context Layer (CONTENT-
//   ARCHITECTURE §3 E7). CONTENT SOURCES — no AI-generated content: the register ladder card
//   is built from docs/CONTENT-STANDARDS.md §3 ("Register: tu / você / o senhor", including
//   its verbatim example sentences); the indirectness card from the "Queria… beats Quero…"
//   guidance on the Culture screen of docs/ui-mockup/intended-ui-v3.html (the register/
//   indirectness frame CONTENT-STANDARDS §5.6 assigns to cultural notes); the spoken-realism
//   card from docs/CONTENT-STANDARDS.md §1.2–1.3 (Madeira realism, local vocabulary) and §5.2
//   (write how people actually speak). Situation-attached cultural_notes stay in content packs;
//   these cards are the always-available layer above them.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

/** A Portuguese example line with its English gloss / usage caption. */
export interface ExplainerExample {
  pt: string;
  en: string;
}

/** One curated culture card (mockup layout: kicker / title / body / examples). */
export interface CultureExplainer {
  id: string;
  /** Tiny uppercase category line, e.g. "REGISTER · WHO IS “YOU”?". */
  kicker: string;
  title: string;
  body: string;
  examples?: ExplainerExample[];
}

export const CULTURE_EXPLAINERS: CultureExplainer[] = [
  {
    // Source: docs/CONTENT-STANDARDS.md §3 (register table + author rules); closing line from
    // the Culture screen of docs/ui-mockup/intended-ui-v3.html.
    id: 'register-ladder',
    kicker: 'REGISTER · WHO IS “YOU”?',
    title: 'tu · você · o senhor / a senhora',
    body:
      '"Tu" is for friends, peers, and younger people — the default informal register in Madeira. ' +
      'The safest polite form is no pronoun at all: just the verb in the 3rd person — that is how most polite European Portuguese actually sounds. ' +
      'Use "o senhor / a senhora" for explicit respect: older strangers, officials, formal service situations. ' +
      '"Você" is real in Portugal but use it sparingly — spoken directly it can read as distancing or even slightly rude. ' +
      'Madeirans forgive every grammar mistake — register mistakes they remember.',
    examples: [
      { pt: 'Como estás? O que fazes aqui?', en: 'informal — friends and peers (tu)' },
      { pt: 'Pode ajudar-me? Quer um café?', en: 'polite — verb only, no pronoun (the safest form)' },
      { pt: 'O senhor sabe onde fica a farmácia?', en: 'respectful — older strangers, officials' },
    ],
  },
  {
    // Source: Culture screen of docs/ui-mockup/intended-ui-v3.html ("Queria…" beats "Quero…");
    // frame per docs/CONTENT-STANDARDS.md §5.6 (indirectness is cultural-note territory).
    id: 'indirectness-queria',
    kicker: 'INDIRECTNESS · HOW TO ASK',
    title: '“Queria…” beats “Quero…”',
    body:
      'Requests soften: "Queria uma bica" (I\'d like…) not "Quero" (I want). ' +
      'On the phone, open with "Olhe, desculpe…" ("look, sorry…") before asking anything — ' +
      'it\'s oil for the conversation, not an actual apology.',
    examples: [
      { pt: 'Queria uma bica, por favor.', en: 'softened request — the everyday way to order' },
      { pt: 'Olhe, desculpe, queria fazer uma pergunta.', en: 'phone/counter opener before any ask' },
    ],
  },
  {
    // Source: docs/CONTENT-STANDARDS.md §1.2–1.3 (Madeira realism without dialect gimmickry,
    // local vocabulary) and §5.2 (write how people actually speak).
    id: 'spoken-madeira',
    kicker: 'WHAT YOU’LL HEAR · MADEIRA REALISM',
    title: 'Spoken Madeira vs the textbook',
    body:
      'Locals speak fast, with reductions and rhythm the textbook form hides — you\'ll hear "P\'ra já!", "Tá tudo?", "Pois é" long before their full written forms. ' +
      'Local vocabulary is real vocabulary: a "bica" is your espresso, "semilha" is potato, and a "levada" walk needs no translation here. ' +
      'The app teaches correct European Portuguese and trains your ear on how it actually sounds in Madeira.',
    examples: [
      { pt: 'P\'ra já!', en: '"coming right up" — service counters' },
      { pt: 'Tá tudo?', en: 'what "Está tudo bem?" sounds like on the street' },
      { pt: 'Queria uma bica e um bolo do caco.', en: 'ordering with the local words locals use' },
    ],
  },
];
