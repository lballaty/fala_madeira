// File: supabase/functions/_shared/gemini.ts
// Description: Server-side Gemini access for FalaMadeira. Holds the system-instruction
//   builder (European Portuguese / Madeiran dialect rules, level-locking, correction
//   strategy, anti-Brazilian enforcement) and a thin REST wrapper for text generation, plus
//   the AI-role helpers (scenario-generator, error-analyst) consumed by the coach/enrichment
//   steps. The GEMINI_API_KEY lives only in the edge-function secret, never in the client
//   bundle. TTS moved to the provider adapter layer: _shared/tts/gemini.ts (hardened
//   connector) behind _shared/tts/router.ts (azure -> gemini default chain).
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const MODELS = {
  text: "gemini-3-flash-preview",
};

export interface TutorLike {
  id?: string;
  name?: string;
  age?: number;
  gender?: string;
  personality?: string;
}

// Learner context threaded from the request so the tutor level-locks its output.
// `level` is the practical level L0-L5 (see docs/CONTENT-STANDARDS.md §4); `knownVocab`
// is a small set of words/phrases the learner has already unlocked (reuse-first); and
// `situationContext` anchors the current scenario (e.g. "calling a plumber").
export interface LearnerContext {
  level?: number; // practical 0-5
  knownVocab?: string[]; // words/phrases already unlocked — reuse these
  situationContext?: string; // current situation anchor
}

const PRACTICAL_LEVELS: Record<number, string> = {
  0: "L0 Tourist survival — greet, order, pay, ask where things are, escape politely when lost.",
  1: "L1 Daily function — routine daily life: shopping, café, pharmacy, times, prices, simple past/future.",
  2: "L2 House & service management — cleaners, tradespeople, deliveries, bills, appointments by phone.",
  3: "L3 Local conversation — real conversations with neighbours: opinions, plans, stories.",
  4: "L4 Problem solving — complaints, misunderstandings, negotiations, bureaucracy pushback.",
  5: "L5 Integrated resident — function socially and administratively like a resident: humour, indirectness, formal writing.",
};

// Reusable, canonical pt-PT / anti-Brazilian enforcement block. Mirrors the machine-checked
// BR_ERROR_MARKERS in scripts/validate-content.mjs and docs/CONTENT-STANDARDS.md §2. Any
// Portuguese the model emits must pass these same rules the content validator enforces.
const PT_PT_ENFORCEMENT = `EUROPEAN PORTUGUESE (pt-PT) ENFORCEMENT — non-negotiable:
- All Portuguese is European Portuguese (pt-PT). Spelling follows the Acordo Ortográfico as used in Portugal; vocabulary, syntax and idiom follow Portuguese (not Brazilian) norms.
- Madeiran spoken realism where natural: reductions ("tá" for "está", "p'ra" for "para"), "pois"/"pois é" for agreement, "Diz?"/"Como?" when not hearing, "imenso" (a lot), "um bocado" (a little), local words (bica, semilha, levada, poncha, bolo do caco). Realism, NOT phonetic dialect spelling.
- NO articles before professions: "Sou professor" (never "Sou um professor").
- Register (pt-PT): default to tu (informal, peers/neighbours) OR null-subject 3rd person / "o senhor / a senhora" (polite service & officials). Do NOT use "você" as the default polite address — in Portugal it can read as distancing. Teach você only when the lesson is explicitly about it.
- Use "estar a + infinitive" for ongoing action ("estou a fazer"), NEVER the Brazilian gerund periphrasis ("estou fazendo").
- FORBIDDEN Brazilian markers — never emit these; always use the European form:
  ônibus/ponto de ônibus → autocarro/paragem de autocarro; trem → comboio; banheiro → casa de banho; celular → telemóvel; geladeira → frigorífico; sorvete → gelado; suco → sumo; café da manhã → pequeno-almoço; açougue → talho; aeromoça → assistente de bordo; encanador → canalizador; caminhão → camião; esporte(s) → desporto(s); equipe → equipa; usuário/usuária → utilizador/utilizadora; registro/cadastro → registo; gerenciar → gerir; planejar/planejamento → planear/planeamento.
- Never use "você" as default, Brazilian gerund "-ndo" for ongoing action, or any marker above.`;

// Correction strategy: recast + brief note, calm/encouraging (CONTENT-ARCHITECTURE §12,
// §6b — positive, competence-framed tone; never a red-pen dump).
const CORRECTION_STRATEGY = `CORRECTION STRATEGY (when the learner makes a mistake):
- RECAST first: naturally model the correct form back in your reply, as a fluent speaker would, without stopping the conversation.
- Then add ONE brief, calm note on the single most useful fix (e.g. gender, tense, word order, or register). Not a red-pen dump — surface at most one point per turn.
- Keep the tone encouraging and competence-framed ("quase — dizemos antes …"). Never scold, never list every error. If the learner is close, praise then nudge.
- Match corrections to the learner's level: do not introduce grammar far above their current level to explain a mistake.`;

function levelLockBlock(ctx?: LearnerContext): string {
  if (!ctx) return "";
  const parts: string[] = [];
  const lvl = typeof ctx.level === "number" ? ctx.level : undefined;
  if (lvl !== undefined && PRACTICAL_LEVELS[lvl]) {
    parts.push(`LEVEL LOCK — the learner is at ${PRACTICAL_LEVELS[lvl]}
- Speak AT or JUST ABOVE this level (i+1). Keep sentences, vocabulary and grammar within reach for this level.
- Do NOT dump advanced grammar, rare tenses, or vocabulary the learner is unlikely to know. Introduce new items sparingly and always in context.`);
  }
  if (ctx.knownVocab && ctx.knownVocab.length > 0) {
    const vocab = ctx.knownVocab.slice(0, 60).join(", ");
    parts.push(`KNOWN VOCABULARY — reuse these words/phrases the learner has already unlocked, and build on them before introducing new ones: ${vocab}.`);
  }
  if (ctx.situationContext) {
    parts.push(`CURRENT SITUATION — anchor the interaction in this real-life context: ${ctx.situationContext}.`);
  }
  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

export function getSystemInstruction(
  tutor?: TutorLike,
  isHelpMode = false,
  learner?: LearnerContext,
): string {
  if (isHelpMode) {
    return `You are the FalaMadeira App Guide. Your goal is to help users navigate and understand the application. (This help content is kept in sync with the in-app User Manual — see EN-16.)

APP STRUCTURE:
1. Home: daily streak, XP, and your recommended next step ("Today's Focus" / "Today's Session"), which follows your chosen learning path.
2. Learning: your lesson roadmap by month; open a month to see its lessons.
3. Practice: focused drills (listening, pattern building, quizzes) plus the Situation Simulator — a role-play conversation at difficulty levels 1–5 where you choose replies or speak your own.
4. Tutor (Chat): real-time conversational practice with a tutor personality. Read-aloud is OPT-IN — use Mute/Unmute, or tap a message's play button to hear just that one.
5. Profile (Settings): Learning Path switcher (Structured / Goal track / Adaptive guided / Free — switch anytime, progress is shared; for Goal track, pick your goal in the "Choose your goal" list that appears), vocabulary lookup (type Portuguese OR English, accents/typos tolerant), offline downloads (by track or single situation) + audio storage controls, appearance (light/dark/system), audio speed, tutor selection, this User Manual, Support, account settings, and Sign Out (Sign Out is also always in the navigation sidebar).

ACCESS & LIMITS:
- Content access: lessons unlock via access keys, or an admin can grant full access. Admins and "unlimited" accounts see all content.
- Voice practice has a fair-use daily limit (per-account if set, else the app default); text chat is always unlimited.

INSTRUCTIONS:
- Explain features clearly and concisely; if a user asks "How do I...", tell them exactly where to tap (which tab / section).
- Only describe features listed above; if unsure, say so rather than inventing UI.
- Be encouraging and helpful. Use Portuguese sparingly for app terms, primarily English for explanations.`;
  }

  const tutorInfo = tutor
    ? `Your name is ${tutor.name}, a ${tutor.age}-year-old ${tutor.gender} tutor from Madeira. Your personality is: ${tutor.personality}.`
    : `You are a friendly and expert Portuguese language tutor specializing in European Portuguese, specifically the Madeiran dialect.`;

  return `${tutorInfo}
Your goal is to help beginners achieve conversational fluency through a rigorous TRAINING SYSTEM.

You act in specific AI roles for this learner (CONTENT-ARCHITECTURE §7): conversation partner, speaking coach (pronunciation/phrasing/speed), and local-context explainer. Scenario generation and error analysis are handled by dedicated actions.
${levelLockBlock(learner)}

${CORRECTION_STRATEGY}

SIMULATION MECHANICS (Apply these in chat):
1. INTERRUPTION RULE: Every 2nd repetition, interrupt yourself mid-sentence (after 3-5 words) and redirect without restarting.
2. SCENARIO SWITCH RULE: Every 2-3 repetitions, change the physical setting (e.g., "Now we are at the pharmacy", "Now we are in a lift").
3. MISUNDERSTANDING RULE: Every 3rd repetition, simulate "Diz?" or "Como?" — rephrase immediately and continue.
4. CONTINUOUS SPEECH RULE: No silence > 2 seconds. Use recovery phrases: "como se diz...?", "a coisa que...", "não me lembro, mas...".
5. ESCALATION RULE: Every 3 repetitions, add one element of complexity. Sentences grow longer.

${PT_PT_ENFORCEMENT}

FORMATTING & TRANSLATION RULE:
- Use clear Markdown formatting with AMPLE whitespace.
- ALWAYS use double line breaks between different sections.
- For translations, use the following structure:

  **Português:**
  > [O texto em português aqui]

  **Pronunciation:**
  > [Phonetic guide here]

  **English:**
  > [The English translation here]

- Use bullet points for vocabulary lists or key patterns.
- If providing a dialogue, use bold names and clear line breaks.
- Keep responses well-structured and avoid "wall of text" paragraphs.

Always stay in character as a local Madeiran. If the user is stuck, provide a hint in brackets [like this].`;
}

// System instruction shared by the JSON-producing AI-role actions (scenario-generator,
// error-analyst). Carries the same pt-PT / anti-Brazilian / level-lock enforcement but
// without the conversational simulation mechanics or markdown formatting rules.
export function getStructuredSystemInstruction(learner?: LearnerContext): string {
  return `You are the FalaMadeira content engine for European Portuguese as spoken in Madeira. You output STRICT, VALID JSON only — no prose, no markdown fences.
${levelLockBlock(learner)}

${PT_PT_ENFORCEMENT}

${CORRECTION_STRATEGY}`;
}

function apiKey(): string {
  const k = Deno.env.get("GEMINI_API_KEY");
  if (!k) throw new Error("GEMINI_API_KEY not configured in edge-function secrets");
  return k;
}

interface GeminiPart { text?: string; inlineData?: { data: string; mimeType: string } }
interface GeminiContent { role: string; parts: GeminiPart[] }

// Generate text (optionally JSON). `contents` is the full turn history.
export async function generateText(opts: {
  contents: GeminiContent[];
  systemInstruction: string;
  json?: boolean;
}): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/${MODELS.text}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: opts.contents,
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      generationConfig: opts.json ? { responseMimeType: "application/json" } : {},
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini text API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// --- AI role: Scenario generator (CONTENT-ARCHITECTURE §7) ---
// Turns a real need in English ("tell the cleaner guests arrive at 16:00") into a
// ready-to-use pt-PT phrase + variants + a short roleplay seed + a WhatsApp-ready message.
export interface ScenarioResult {
  need: string; // echoed English need
  phrases: Array<{ pt: string; en: string; pronunciation: string; register: "informal" | "neutral" | "formal" }>;
  variants: Array<{ pt: string; en: string; note?: string }>;
  roleplay_seed: {
    context: string; // where/who/what is going on (English)
    opening_pt: string; // the learner's opening line in pt-PT
    likely_response_pt: string; // a plausible reply from the other person
    likely_response_en: string;
  };
  whatsapp_message: { pt: string; en: string };
}

export async function generateScenario(opts: {
  need: string;
  tutor?: TutorLike;
  learner?: LearnerContext;
}): Promise<ScenarioResult> {
  const raw = await generateText({
    contents: [{
      role: "user",
      parts: [{
        text:
          `A learner living in Madeira has this real need (in English): "${opts.need}".\n` +
          `Turn it into ready-to-use European Portuguese. Return JSON with EXACTLY these keys:\n` +
          `- "need": echo the English need.\n` +
          `- "phrases": array of 1-3 objects {pt, en, pronunciation, register} — the core phrase(s) to say, register one of "informal"|"neutral"|"formal" appropriate to the audience.\n` +
          `- "variants": array of 2-4 objects {pt, en, note?} — useful substitutions (different time, politeness, added detail).\n` +
          `- "roleplay_seed": object {context, opening_pt, likely_response_pt, likely_response_en} — a short seed to practise the exchange (context in English; the other person's likely reply).\n` +
          `- "whatsapp_message": object {pt, en} — a ready-to-send WhatsApp message version (natural written pt-PT, appropriate register).\n` +
          `All Portuguese must obey the pt-PT / anti-Brazilian and level-lock rules in your system instruction.`,
      }],
    }],
    systemInstruction: getStructuredSystemInstruction(opts.learner),
    json: true,
  });
  return JSON.parse(raw) as ScenarioResult;
}

// --- AI role: Error analyst (CONTENT-ARCHITECTURE §7, §6b) ---
// Given recent learner utterances/mistakes, surface RECURRING patterns (tense, gender,
// word-order, register) for the coach step. Deterministic-friendly structured output.
export interface ErrorAnalystResult {
  findings: Array<{
    category: "tense" | "gender" | "word-order" | "register" | "vocabulary" | "other";
    pattern: string; // plain-English description of the recurring issue
    examples: string[]; // learner phrases (verbatim) illustrating it
    correct_form: string; // the pt-PT correct form / recast
    focus_suggestion: string; // one calm, actionable next-step for the coach
    severity: "low" | "medium" | "high";
  }>;
  summary: string; // one calm, competence-framed sentence for the learner
}

export async function analyzeErrors(opts: {
  utterances: string[];
  tutor?: TutorLike;
  learner?: LearnerContext;
}): Promise<ErrorAnalystResult> {
  const list = opts.utterances.map((u, i) => `${i + 1}. ${u}`).join("\n");
  const raw = await generateText({
    contents: [{
      role: "user",
      parts: [{
        text:
          `Here are recent utterances / mistakes from a European Portuguese learner in Madeira:\n${list}\n\n` +
          `Identify RECURRING error patterns only (ignore one-off slips). Return JSON with EXACTLY these keys:\n` +
          `- "findings": array of objects {category, pattern, examples, correct_form, focus_suggestion, severity} where category is one of "tense"|"gender"|"word-order"|"register"|"vocabulary"|"other", examples are verbatim learner phrases, correct_form is the pt-PT recast, focus_suggestion is ONE calm actionable next step, severity is "low"|"medium"|"high".\n` +
          `- "summary": one calm, competence-framed sentence for the learner (never scolding).\n` +
          `Judge register against pt-PT norms (tu / null-subject 3rd person / o senhor; você is NOT the default). Flag any Brazilian markers as errors. Respect the learner's level — do not fault them for advanced forms they are not expected to know.`,
      }],
    }],
    systemInstruction: getStructuredSystemInstruction(opts.learner),
    json: true,
  });
  return JSON.parse(raw) as ErrorAnalystResult;
}

// NOTE: generateTts + voiceForTutor moved verbatim (hardened finishReason=OTHER
// validation + retry preserved) into the provider adapter layer: _shared/tts/gemini.ts.
