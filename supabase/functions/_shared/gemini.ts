// File: supabase/functions/_shared/gemini.ts
// Description: Server-side Gemini access for FalaMadeira. Holds the system-instruction
//   builder (European Portuguese / Madeiran dialect rules) and thin REST wrappers for
//   text generation and TTS. The GEMINI_API_KEY lives only in the edge-function secret,
//   never in the client bundle.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const MODELS = {
  text: "gemini-3-flash-preview",
  tts: "gemini-2.5-flash-preview-tts",
};

export interface TutorLike {
  id?: string;
  name?: string;
  age?: number;
  gender?: string;
  personality?: string;
}

export function getSystemInstruction(tutor?: TutorLike, isHelpMode = false): string {
  if (isHelpMode) {
    return `You are the FalaMadeira App Guide. Your goal is to help users navigate and understand the application.

APP STRUCTURE:
1. Dashboard (Home): Shows daily streak, total XP, and active month.
2. Curriculum (Learning): Lists lessons for the current month. Users can unlock months 1-3.
3. AI Tutor (Chat): Real-time conversational practice with different personalities.
4. Settings: Profile management, audio speed, tutor selection, user manual, and support.

INSTRUCTIONS:
- Explain features clearly and concisely.
- If a user asks "How do I...", tell them exactly which tab to click.
- Be encouraging and helpful.
- Use Portuguese sparingly for app terms, but primarily English for explanations.`;
  }

  const tutorInfo = tutor
    ? `Your name is ${tutor.name}, a ${tutor.age}-year-old ${tutor.gender} tutor from Madeira. Your personality is: ${tutor.personality}.`
    : `You are a friendly and expert Portuguese language tutor specializing in European Portuguese, specifically the Madeiran dialect.`;

  return `${tutorInfo}
Your goal is to help beginners achieve conversational fluency through a rigorous TRAINING SYSTEM.

SIMULATION MECHANICS (Apply these in chat):
1. INTERRUPTION RULE: Every 2nd repetition, interrupt yourself mid-sentence (after 3-5 words) and redirect without restarting.
2. SCENARIO SWITCH RULE: Every 2-3 repetitions, change the physical setting (e.g., "Now we are at the pharmacy", "Now we are in a lift").
3. MISUNDERSTANDING RULE: Every 3rd repetition, simulate "Diz?" or "Como?" — rephrase immediately and continue.
4. CONTINUOUS SPEECH RULE: No silence > 2 seconds. Use recovery phrases: "como se diz...?", "a coisa que...", "não me lembro, mas...".
5. ESCALATION RULE: Every 3 repetitions, add one element of complexity. Sentences grow longer.

NATURALNESS RULE (Madeiran/European Portuguese):
- Use Madeiran reductions: "tá" instead of "está", "p'ra" instead of "para".
- Use "pois" or "pois é" for agreement.
- Use "Diz?" as the primary response to not hearing something.
- Use "imenso" for "a lot" and "um bocado" for "a little bit".
- Use European Portuguese vocabulary: "pequeno-almoço" (not "café da manhã"), "autocarro" (not "ônibus"), "bica" (espresso).
- NO articles before professions: "Sou professor" (not "Sou um professor").
- NEVER use Brazilian Portuguese forms (gerund "-ndo" for ongoing action, "você" as default, "trem/ônibus/celular/café da manhã").

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

export function voiceForTutor(tutor?: TutorLike): string {
  if (!tutor) return "Kore";
  if (tutor.gender === "female") return (tutor.age ?? 0) > 40 ? "Zephyr" : "Kore";
  return (tutor.age ?? 0) > 40 ? "Charon" : "Fenrir";
}

// Number of attempts for the documented intermittent-empty-audio defect (see below).
const TTS_MAX_ATTEMPTS = 4;

// Generate TTS audio, returns base64 PCM (24kHz mono s16le) as the app expects.
//
// KNOWN UPSTREAM DEFECT: Gemini TTS preview models (2.5-flash, 2.5-pro, 3.1-flash)
// intermittently return HTTP 200 with finishReason="OTHER" and NO inlineData audio,
// even though usageMetadata bills audio tokens. Documented at
// https://github.com/google-gemini/cookbook/issues/1231 and the Google AI dev forum.
// Measured behaviour (2026-07-09): the failure rate is strongly RATE-correlated — it acts
// like a soft rate-limit surfaced as 200+OTHER rather than 429. At ~2.5s spacing all three
// TTS models return audio 6/6; under rapid bursts (~1s) the same request fails ~75-100%.
// Real usage (spaced clicks, sequential playback, IndexedDB cache) rarely hits it.
// Google's recommended handling: don't trust HTTP 200 — require finishReason STOP + present
// audio and retry. Backoff is deliberately long (approaching the ~2s that measures 100%) so
// retries clear the soft-throttle rather than re-triggering it. Input is plain text.
export async function generateTts(text: string, tutor?: TutorLike): Promise<string> {
  let lastReason = "unknown";
  for (let attempt = 1; attempt <= TTS_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/${MODELS.tts}:generateContent?key=${apiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceForTutor(tutor) } } },
        },
      }),
    });

    // Genuine transport/quota errors are not the empty-audio defect — surface immediately.
    if (!res.ok) {
      throw new Error(`Gemini TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const audio = candidate?.content?.parts?.[0]?.inlineData?.data;
    lastReason = candidate?.finishReason ?? "noFinishReason";

    // Valid only when the model stopped normally AND actually returned audio.
    if (lastReason === "STOP" && audio) return audio;

    // Intermittent empty result — back off briefly and retry the identical request.
    if (attempt < TTS_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw new Error(`Gemini TTS returned no audio after ${TTS_MAX_ATTEMPTS} attempts (last finishReason=${lastReason})`);
}
