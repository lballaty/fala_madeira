# FalaMadeira — Content Standards (European Portuguese / Madeira)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/CONTENT-STANDARDS.md
**Description:** Authoring rules for all FalaMadeira content: correct European Portuguese as the base, Madeiran spoken realism without dialect gimmickry, register guidance (tu / você / o senhor), the anti-Brazilian marker list enforced by scripts/validate-content.mjs, dialogue realism rules, level guidance L0–L5 with CEFR mapping, and the multi-mode practiceability test for Situations. Companion to docs/CONTENT-ARCHITECTURE.md (§2, §4, §8, §12) and src/content/schema.ts.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** content-model-schema plan step

## 1. Language baseline

1. **All Portuguese content is European Portuguese (pt-PT).** Spelling follows the Acordo Ortográfico as used in Portugal; vocabulary, syntax, and idiom follow Portuguese (not Brazilian) norms.
2. **Madeira realism, not dialect gimmickry** (CONTENT-ARCHITECTURE §12). We do not write phonetic dialect spellings ("põexe", "cã") into content. Madeiran spoken reality — reductions, rhythm, speed, local vocabulary like *bica*, *semilha*, *levada* — is delivered through:
   - `voice_type` on dialogue lines (see §5) driving natural local voices,
   - phrasing choices that locals actually use (e.g. *"P'ra já!"*, *"Um bocado"*, *"Pois é"*),
   - cultural notes explaining what the learner will hear vs what the textbook form is.
3. **Local vocabulary is welcome and encouraged** when it is what Madeirans genuinely say (*bica*, *bolo do caco*, *espetada*, *poncha*, *levada*, *semilha* for potato). Mark regionalisms in a `note` on the vocabulary item so learners know when a word is Madeira/Portugal-specific.
4. **Translations and metadata are English**; only the fields listed in §7 carry Portuguese and are scanned by the validator.

## 2. Anti-Brazilian rules (enforced by `scripts/validate-content.mjs`)

### 2.1 Hard errors — never use these in content

| Brazilian | European (use this) |
|---|---|
| ônibus / ponto de ônibus | autocarro / paragem de autocarro |
| trem | comboio |
| banheiro | casa de banho |
| celular | telemóvel |
| geladeira | frigorífico |
| sorvete | gelado |
| suco | sumo |
| café da manhã | pequeno-almoço |
| açougue | talho |
| aeromoça | assistente de bordo |
| encanador | canalizador |
| caminhão | camião |
| esporte(s) | desporto(s) |
| equipe | equipa |
| usuário/usuária | utilizador/utilizadora |
| registro / cadastro | registo |
| gerenciar | gerir |
| planejar / planejamento | planear / planeamento |

The canonical machine-checked list lives in `scripts/validate-content.mjs` (`BR_ERROR_MARKERS`) — **extend it there first**, then mirror new entries into this table.

### 2.2 Gerund periphrasis (hard error)

- Brazilian: *estou fazendo*, *estava comendo* — **never**.
- European: **estar a + infinitive** — *estou a fazer*, *estava a comer*.
- The validator flags `estar (present/imperfect) + -ndo` forms, with an exception list for non-gerund words that merely end in *-ndo* (*quando*, *lindo*, *brando*). Genuine standalone gerunds in fixed expressions are rare in pt-PT content; if one is truly needed, restructure the sentence instead.

### 2.3 Register-sensitive markers (warnings)

- **você** — legitimate in Portugal but **not the default register** (see §3). Every occurrence is flagged for review: is this deliberate? Would *tu* or *o senhor / a senhora* be more natural?
- **vocês** — the normal plural address in Portugal; flagged only so authors verify the register of surrounding lines.

## 3. Register: tu / você / o senhor

| Form | When to use | Example |
|---|---|---|
| **tu** | Friends, peers, younger people, informal neighborhood contexts. The default informal register in Madeira. | *Como estás? O que fazes aqui?* |
| **(null subject) + 3rd person** | The safest polite form: drop the pronoun entirely and use the verb in 3rd person. This is how most polite EP actually sounds. | *Pode ajudar-me? Quer um café?* |
| **o senhor / a senhora** | Explicit respectful address: older strangers, officials, formal service situations. | *O senhor sabe onde fica a farmácia?* |
| **você** | Use sparingly and deliberately. In Portugal it can read as distancing or even slightly rude when spoken directly; it appears mostly in ads and some regional/interpersonal niches. Content may *teach* it (e.g. the tu-vs-você lesson) but must not use it as the default polite register. | — |

Rules for authors:
- Service dialogues (café, shop, pharmacy, Finanças): customer uses null-subject 3rd person or *o senhor/a senhora*; staff typically respond in the same register.
- Neighbor/social dialogues: *tu* once familiarity is established; cultural notes should explain the switch moment.
- Every `PatternVariant` and `VocabularyItem` may carry `register: informal | neutral | formal` — use it whenever the form is register-bound.

## 4. Levels: practical L0–L5 with CEFR background

The product speaks in practical capability; CEFR is a background tag for content curation (CONTENT-ARCHITECTURE §4).

| Level | Name | The learner can… | CEFR (background) |
|---|---|---|---|
| **L0** | Tourist survival | Greet, order, pay, ask where things are, escape politely when lost. | A1 (early) |
| **L1** | Daily function | Handle routine daily life: shopping, café, pharmacy, times, prices, simple past/future. | A1–A2 |
| **L2** | House & service management | Deal with cleaners, tradespeople, deliveries, bills, appointments by phone. | A2 |
| **L3** | Local conversation | Hold real conversations with neighbors and acquaintances; opinions, plans, stories. | A2–B1 |
| **L4** | Problem solving | Handle things going wrong: complaints, misunderstandings, negotiations, bureaucracy pushback. | B1 |
| **L5** | Integrated resident | Function socially and administratively like a resident: humor, indirectness, formal writing. | B1–B2 |

Tagging rules:
- `level` (0–5) is **required** on every Situation; `cefr` (A1–B2) is required as the background tag.
- Tag by what the situation *demands*, not by grammar inventory. A phone call to a plumber is L2 even if its grammar is simple — phone audio and service register raise the practical bar.
- Soft prerequisites are hints, never locks (§5 of the architecture): reference the Situations whose patterns this one builds on.

## 5. Dialogue realism rules

1. **Every dialogue line carries a `voice_type`** — one of the 7 archetypes (CONTENT-ARCHITECTURE §8): `teacher` (clear, slow-capable model voice), `local` (natural Madeiran speed/rhythm), `older`, `younger`, `service` (counter/shop/phone-desk workers), `phone` (degraded phone audio), `noisy` (café/market ambience).
2. **Write how people actually speak**, within standard orthography: short turns, ellipses, interjections (*Diga!*, *Pois*, *Então*, *P'ra já!*), false starts sparingly. No textbook-paragraph monologues.
3. **Realistic participants**: a café dialogue has an employee (`service`) and a customer; a bureaucracy dialogue may include a `phone` voice for the call and a `service` voice at the counter; social dialogues should mix `older`/`younger`/`local` voices.
4. **Escalating authenticity by level**: L0–L1 dialogues favor `teacher` + `service` clarity; L2+ must include `local`-speed lines; L3+ should include at least one `phone` or `noisy` context per pack where the scenario justifies it.
5. **Every dialogue needs `context`** (where, who, what's going on) so the Listening Engine and the learner can anchor the scene.
6. **Cultural notes carry the social code**, not the dialogue itself: indirectness, greeting rituals, when to switch to *tu*, tipping, timing norms. If a dialogue depends on a social rule, add the matching `CulturalNote`.

## 6. The multi-mode practiceability test

**A Situation must be practiceable by multiple modes from its own data** (CONTENT-ARCHITECTURE §2.1). Before publishing, check the situation feeds at least 2 — ideally 4+ — of these engines:

- `phrase_patterns` (with slots) → Pattern Builder
- `vocabulary` → drills + review derivation
- `dialogues` (multi-voice) → Listening Engine, Speaking Coach
- `cultural_notes` → Cultural Context Layer
- `roleplay` (branching, difficulty 1–5) → Situation Simulator
- `mission` (prep / fallback_phrases / likely_responses) → Real-World Missions
- `review_items` (dimension: hear / say / retrieve / avoid) → Adaptive Review

The validator warns when a situation feeds fewer than 2 modes. A situation that only carries patterns and vocabulary is a flashcard set, not a Situation — enrich it or merge it.

Roleplay difficulty guidance: **L1** fully guided (one obvious correct option), **L2** guided with distractors, **L3** natural branching, **L4** complications (wrong item delivered, price dispute), **L5** messy real-life (interruptions, topic shifts, `noisy`/`phone` voices).

## 7. What the validator scans (and what it skips)

Portuguese-bearing fields (scanned): `phrase_patterns[].base`, slot `options`, `variants[].text`, `vocabulary[].word`, `dialogues[].lines[].text`, `roleplay` node `npc_text` + option `text`, `mission.fallback_phrases`, `mission.likely_responses`, `review_items[].prompt/answer`.

English fields (not scanned): `title`, `summary`, `translation`s, `goals`, cultural note bodies, mission `prep`.

Run it any time: `node /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/validate-content.mjs` — exit 0 means publishable; errors block publishing, warnings need author judgment.

## 8. Pack hygiene

- Every pack declares `id`, `name`, `version`; ids must be unique across situations and tracks in the pack.
- Track → situation references must resolve inside the pack; situation → track references must resolve when the pack declares tracks.
- `checksum` is the sha256 of `canonicalPackPayload(pack)` (see `src/content/schema.ts`); the validator verifies it when declared and reports the computed value when not.
- Seed content note: the 56 legacy lessons migrate verbatim into the seed pack — `title`→`title`, `description`→`summary`, `patterns`→`phrase_patterns[].base`, `vocabulary`→`vocabulary`, `goals`→`goals`, `explanation`→`cultural_notes`, `video_url`→`media`, `level`/`day`/`category`→`course` slot — then get enriched (dialogues, roleplays, missions) in later steps.
