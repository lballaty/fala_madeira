import { GoogleGenAI, Modality } from "@google/genai";
import { Tutor } from "../types";
import { audioCache } from "../lib/audioCache";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const getSystemInstruction = (tutor?: Tutor, isHelpMode: boolean = false) => {
  if (isHelpMode) {
    return `You are the FalaMadeira App Guide. Your goal is to help users navigate and understand the application.
    
    APP STRUCTURE:
    1. Dashboard (Home): Shows daily streak, total XP, and active month.
    2. Curriculum (Learning): Lists lessons for the current month. Users can unlock months 1-6.
    3. AI Tutor (Chat): Real-time conversational practice with different personalities.
    4. Settings: Profile management, audio speed, tutor selection, user manual, and support.
    
    FEATURES:
    - AI Practice: Interactive sessions based on specific lessons.
    - Custom Lessons: Users can request specific themes (Premium).
    - Voice Input: Users can speak to the tutor using the microphone icon.
    - Pronunciation: Click the speaker icon to hear phrases.
    
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
- If providing a dialogue, use bold names and clear line breaks:
  **Maria:** [Fala]
  
  **User:** [Fala]
- Keep responses well-structured and avoid "wall of text" paragraphs.
- If translating to another language (e.g., Czech), follow the same pattern.

Current Curriculum Context:
Month 1 focuses on Foundations & Daily Life (Greetings, Ordering, Numbers, Directions, Opinions, Self-Intro, Time, Past Tense, Third Person, TER, PODER, Shopping, Health, Connectors).
Always stay in character as a local Madeiran. If the user is stuck, provide a hint in brackets [like this].`;
};

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

export const geminiService = {
  async generateLesson(topic: string, tutor?: Tutor) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a language lesson for the topic: ${topic}. 
        Include: 
        - A catchy title
        - 3 key conversational patterns with pronunciation guides
        - 5 essential vocabulary words with translations and pronunciation guides
        - A short practice dialogue.
        Format as JSON.`,
        config: {
          systemInstruction: getSystemInstruction(tutor),
          responseMimeType: "application/json",
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      console.error("Generate lesson error:", error);
      throw new Error("Failed to generate lesson. Please try again.");
    }
  },

  async startChat(tutor?: Tutor, isHelpMode: boolean = false) {
    try {
      return ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: getSystemInstruction(tutor, isHelpMode),
        },
      });
    } catch (error) {
      console.error("Start chat error:", error);
      throw new Error("Failed to start AI chat session.");
    }
  },

  async translateWord(word: string, tutor?: Tutor) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Translate and explain the Portuguese word or phrase: "${word}". 
        Provide:
        - English translation
        - Contextual usage in Madeira
        - A short example sentence in Portuguese with English translation.
        Format as JSON with keys: translation, explanation, example_pt, example_en.`,
        config: {
          systemInstruction: getSystemInstruction(tutor),
          responseMimeType: "application/json",
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      console.error("Translate word error:", error);
      throw new Error("Failed to lookup word. Please try again.");
    }
  },

  stopSpeech() {
    if (currentSource) {
      try {
        currentSource.stop();
      } catch (e) {
        // Ignore
      }
      currentSource = null;
    }
  },

  async playSpeech(text: string, tutor?: Tutor, speed: number = 1.0, onEnd?: () => void) {
    try {
      this.stopSpeech();

      const cacheKey = `${text}_${tutor?.id || 'default'}_${speed}`;
      let arrayBuffer = await audioCache.get(cacheKey);

      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (!arrayBuffer) {
        let voiceName = 'Kore';
        if (tutor) {
          if (tutor.gender === 'female') {
            voiceName = tutor.age > 40 ? 'Zephyr' : 'Kore';
          } else {
            voiceName = tutor.age > 40 ? 'Charon' : 'Fenrir';
          }
        }

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `Speak this naturally: ${text}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          arrayBuffer = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
          await audioCache.set(cacheKey, arrayBuffer);
        }
      }

      if (arrayBuffer) {
        const buffer = audioContext.createBuffer(1, arrayBuffer.byteLength / 2, 24000);
        const nowBuffering = buffer.getChannelData(0);
        const dataView = new DataView(arrayBuffer.slice(0));
        
        for (let i = 0; i < buffer.length; i++) {
          nowBuffering[i] = dataView.getInt16(i * 2, true) / 32768;
        }
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = speed;
        source.connect(audioContext.destination);
        
        source.onended = () => {
          if (currentSource === source) {
            currentSource = null;
          }
          if (onEnd) onEnd();
        };

        currentSource = source;
        source.start();
      }
    } catch (error) {
      console.error("Speech error:", error);
    }
  }
};
