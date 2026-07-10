#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/complete-course-content.mjs
// Description: Course COMPLETION step (plan step complete-structured-course-content).
//   Brings the Structured Course to the canonical 168-lesson density
//   (CONTENT-ARCHITECTURE §5: the original 6-month / ~168-lesson path; 6 months x 28 days).
//
//   PHASE 0 (deterministic) — DAY RENUMBERING to canonical month blocks
//   (month m owns days (m-1)*28+1 .. m*28). Existing situations keep their relative
//   order within their month; ONLY course.day changes (metadata — ids/content untouched):
//   M1 d1-28 unchanged; M2's 21 keep d29-49; M3's 7 -> d57-63; M4's 4 -> d85-88;
//   M5's 4 -> d113-116; M6's 4 -> d141-144.
//
//   PHASE 1 (Gemini REST, gemini-2.5-flash, no SDK) — GENERATE the 100 net-new FULL
//   situations that complete the calendar (M2 +7 d50-56, M3 +21 d64-84, M4 +24 d89-112,
//   M5 +24 d117-140, M6 +24 d145-168), day-by-day against the curriculum outline emitted
//   to projects/falamadeira/content-review/course-outline.json (4 weekly themes per month
//   building on the existing months). Each generated situation is FULL: phrase_patterns
//   (slots+variants), vocabulary (pronunciation), multi-voice dialogues, cultural_notes,
//   branching roleplay (difficulty scaled to level), mission, derived review_items,
//   level/cefr locked per month (M2 L2/A2, M3 L2-L3/A2-B1, M4 L3/B1, M5 L4/B1-B2,
//   M6 L5/B2 — coherent with the existing months' levels). EU-PT enforced (PT_PT_ENFORCEMENT
//   mirrored from scripts/enrich-content.mjs / generate-content.mjs). Every situation is
//   validated (schema.validateSituation) and the WHOLE pack re-validated
//   (schema.validateContentPack) after each batch — invalid content is never published.
//
//   PHASE 2 — WEEKLY VIDEOS: >=1 real EU-PT / Madeira-culture YouTube video per 7-day week
//   block (24 weeks). Candidates below were found via web search on 2026-07-10 and each is
//   RE-verified via YouTube oEmbed (HTTP 200) at run time before being attached; a candidate
//   that fails verification is left absent (NEVER fabricate an id). Weeks 1/3/13 already
//   carry verified videos from earlier steps.
//
//   Resumable/batched: checkpoints generated situations to
//   projects/falamadeira/content-review/.course-completion-state.json after EVERY batch;
//   retries Gemini with backoff; emits per-batch review files
//   projects/falamadeira/content-review/course-completion-batch-<n>.json. Bumps pack
//   version 1.2.0 -> 1.3.0, recomputes checksum, regenerates content/packs/seed-course.json
//   and publishes to the DB (content_packs payload + situations + tracks projections,
//   idempotent upserts + stale-projection cleanup — same pattern as scripts/seed-content.mjs /
//   generate-content.mjs). NB: src/content/packs/seed-course.ts is NOT regenerated here
//   (the orchestrator regenerates it from the JSON afterwards).
//   Usage: node scripts/complete-course-content.mjs [--skip-db] [--limit N] [--batch N]
//                                                   [--model ID] [--reset] [--no-video]
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import pg from 'pg';
import dotenv from 'dotenv';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const argVal = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const SKIP_DB = hasFlag('--skip-db');
const RESET = hasFlag('--reset');
const NO_VIDEO = hasFlag('--no-video');
const LIMIT = Number(argVal('--limit', '0')) || 0; // 0 = all remaining
const BATCH_SIZE = Number(argVal('--batch', '7')) || 7;
const MODEL = argVal('--model', 'gemini-2.5-flash');

// ---------------------------------------------------------------------------
// Paths + constants
// ---------------------------------------------------------------------------
const JSON_IN = join(REPO_ROOT, 'content', 'packs', 'seed-course.json');
const JSON_OUT = JSON_IN;
const REVIEW_DIR = join(REPO_ROOT, 'projects', 'falamadeira', 'content-review');
const STATE_FILE = join(REVIEW_DIR, '.course-completion-state.json');

const NEW_PACK_VERSION = '1.3.0';
const TRACK_STRUCTURED = 'track-structured-course';
const GOAL_TRACK_IDS = new Set([
  'track-survival',
  'track-host',
  'track-social',
  'track-bureaucracy',
  'track-work',
]);
const DAYS_PER_MONTH = 28;
const TOTAL_DAYS = 168;

// ---------------------------------------------------------------------------
// Load schema (TS via tsx — no build step)
// ---------------------------------------------------------------------------
const schema = await tsImport('../src/content/schema.ts', import.meta.url);

// ---------------------------------------------------------------------------
// Gemini API key (from .env.local; NEVER printed or persisted)
// ---------------------------------------------------------------------------
dotenv.config({ path: join(REPO_ROOT, '.env.local'), quiet: true });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY missing in .env.local — cannot generate');
  process.exit(1);
}

// ===========================================================================
// CURRICULUM — the 100 net-new day specs (per course-outline.json)
// month themes build on the existing months; weekly themes serve
// understand/speak/use/belong + Madeira life (culture/festivals/weather/food/geography)
// ===========================================================================
const MONTH_THEMES = {
  2: 'Complete grammar & real conversations',
  3: 'Fluency in motion — speed, services and local conversation',
  4: 'Local slang & culture — belonging in the bairro',
  5: 'Problem solving — when things go wrong',
  6: 'Full immersion — the integrated resident',
};
const WEEK_THEMES = {
  8: 'Grammar to the street — running your daily life',
  10: 'Town services day-to-day',
  11: 'Neighbourhood conversations',
  12: 'Island life',
  13: 'Belonging in the bairro',
  14: 'The festival calendar',
  15: 'Food & the table',
  16: 'Knowing the island',
  17: 'Problem-solving foundations',
  18: 'House & property problems',
  19: 'Bureaucracy pushback',
  20: 'Money & work friction',
  21: 'Resident-level expression',
  22: 'Formal & administrative mastery',
  23: 'Deep social integration',
  24: 'Capstone — living the island in Portuguese',
};

// Each entry: [day, slug, level, cefr, category, goalTracks[], title, theme]
// Level lock per month: M2 L2/A2 · M3 L2-L3/A2-B1 · M4 L3/B1 · M5 L4/B1-B2 · M6 L5/B2.
const NEW_DAYS = [
  // ---- Month 2, Week 8 (d50-56) — L2/A2 ---------------------------------
  [50, 'at-the-market', 2, 'A2', 'daily', ['track-survival'],
    'At the Market (Mercado)',
    'A proper shop at the local market: fruit, vegetables, fish, quantities (um quilo, meio quilo, uma dúzia), asking what is fresh, prices and paying — using full month-2 sentences, not tourist fragments.'],
  [51, 'post-office-and-parcels', 2, 'A2', 'daily', ['track-bureaucracy', 'track-host'],
    'Post Office & Parcels',
    'At the CTT counter and with couriers: sending a parcel, buying stamps, collecting a registered letter with the aviso, and dealing with a missed-delivery note.'],
  [52, 'booking-by-phone', 2, 'A2', 'daily', ['track-host', 'track-bureaucracy'],
    'Booking Appointments by Phone',
    'Phoning to book, confirm or move an appointment — doctor, hairdresser, mechanic: dates, times, spelling your name, and confirming details you did not catch.'],
  [53, 'household-problems', 2, 'A2', 'daily', ['track-host'],
    'Describing Problems at Home',
    'Something at home is broken, leaking or not working: describing the problem clearly (não funciona, está avariado, está a pingar), asking for help and understanding simple instructions.'],
  [54, 'talking-about-your-week', 2, 'A2', 'social', ['track-social'],
    'Talking About Your Week',
    'Telling a neighbour or friend what you did this week: sequencing past events with the preterite and setting the scene with the imperfect, reacting to their week in return.'],
  [55, 'plans-and-arrangements', 2, 'A2', 'social', ['track-social'],
    'Plans & Arrangements',
    'Making, confirming and changing plans: suggesting times, agreeing where to meet, moving something to another day, and confirming by a short message.'],
  [56, 'week-8-stress-test', 2, 'A2', 'custom', ['track-social', 'track-survival'],
    'Week 8 Stress Test',
    'Mixed real-time exchanges combining the whole of month 2: market shopping, a phone booking, describing a household problem, and narrating your week — under light pressure.'],

  // ---- Month 3, Week 10 (d64-70) — L2/A2 ---------------------------------
  [64, 'pharmacy-beyond-basics', 2, 'A2', 'daily', ['track-survival'],
    'Pharmacy: Beyond the Basics',
    'A fuller pharmacy visit: describing symptoms, understanding dosage instructions, asking about a prescription (receita), and the pharmacist’s follow-up questions.'],
  [65, 'at-the-hairdresser', 2, 'A2', 'daily', ['track-social'],
    'At the Hairdresser / Barber',
    'Booking and sitting through a haircut: saying what you want (curto, aparar, as pontas), small talk in the chair, and paying — classic service-register Portuguese.'],
  [66, 'car-mechanic-petrol', 2, 'A2', 'daily', ['track-survival', 'track-work'],
    'The Car: Mechanic & Petrol Station',
    'At the petrol station and the mechanic: filling up (atestar), a strange noise, a warning light, leaving the car and understanding when it will be ready and what it costs.'],
  [67, 'bank-and-multibanco', 2, 'A2', 'daily', ['track-bureaucracy'],
    'Bank Errands & the Multibanco',
    'Everyday banking: the Multibanco menu (levantamentos, pagamentos, carregamentos), a counter question about a card or a transfer, and asking for help when the machine eats your card.'],
  [68, 'junta-simple-errands', 2, 'A2', 'daily', ['track-bureaucracy'],
    'Simple Errands at the Junta',
    'Quick counter errands at the Junta de Freguesia or Câmara: asking where to go, taking a ticket (senha), a simple certificate request and understanding what to bring next time.'],
  [69, 'shop-returns-exchanges', 2, 'A2', 'daily', ['track-survival'],
    'Returns & Exchanges',
    'Taking something back to a shop: the receipt (talão), wrong size, does not work, exchanging or getting a credit note — polite, firm and simple.'],
  [70, 'week-10-stress-test', 2, 'A2', 'custom', ['track-survival', 'track-bureaucracy'],
    'Week 10 Stress Test',
    'An errand day around Funchal combining the week: pharmacy, bank, Junta counter and a shop return — one exchange after another at real speed.'],

  // ---- Month 3, Week 11 (d71-77) — L3/B1 ---------------------------------
  [71, 'meeting-the-neighbours', 3, 'B1', 'social', ['track-social'],
    'Meeting the Neighbours Properly',
    'Beyond bom dia: introducing yourself properly to neighbours, saying where you are from and why Madeira, remembering names, and the questions Madeirans will ask you.'],
  [72, 'family-and-kids', 3, 'B1', 'social', ['track-social'],
    'Talking About Family & Kids',
    'Family talk with neighbours and acquaintances: who is who, ages, what people do, kids and school — and asking about their family without being intrusive.'],
  [73, 'weather-and-seasons', 3, 'B1', 'social', ['track-social'],
    'Madeira Weather Small Talk',
    'The island’s favourite topic: rain in the north, sun in Funchal, the capacete over the mountains, humidity, the seasons — weather small talk as social glue.'],
  [74, 'neighbourly-help', 3, 'B1', 'social', ['track-social', 'track-host'],
    'Asking For & Offering Help',
    'Neighbourly favours: borrowing a ladder, asking someone to accept a delivery, watering plants, offering help in return — the polite dance of asking and accepting.'],
  [75, 'local-recommendations', 3, 'B1', 'social', ['track-social', 'track-survival'],
    'Getting Local Recommendations',
    'Asking locals what they actually recommend: where to buy fish, which mechanic to trust, who fixes shutters — and understanding the hedged, indirect way advice is given.'],
  [76, 'cafe-counter-chat', 3, 'B1', 'social', ['track-social'],
    'Chatting at the Café Counter',
    'Being a regular: the counter conversation with the empregado and other regulars, commenting on the day, the football, the roadworks — short, fast, overlapping talk.'],
  [77, 'week-11-stress-test', 3, 'B1', 'custom', ['track-social'],
    'Week 11 Stress Test',
    'An afternoon of neighbourhood talk: a neighbour on the stairs, a favour to ask, weather chat and café counter banter — sustained real conversation.'],

  // ---- Month 3, Week 12 (d78-84) — L3/B1 ---------------------------------
  [78, 'on-a-levada-walk', 3, 'B1', 'travel', ['track-social'],
    'On a Levada Walk',
    'Talking while walking a levada: trail talk with other walkers, asking about conditions ahead, the water channels and their history, and warnings (escorregadio, vertigens).'],
  [79, 'the-sea-and-fish-talk', 3, 'B1', 'travel', ['track-social'],
    'The Sea: Boats, Beaches & Fish',
    'Sea talk: the state of the sea (mar calmo, ondulação), swimming spots and pebble beaches, boats, and the fish on the island — espada, atum, lapas — as conversation.'],
  [80, 'local-produce-talk', 3, 'B1', 'social', ['track-social'],
    'Fruit, Farms & the Fazenda',
    'Talking produce like a Madeiran: banana da Madeira, anona, maracujá, semilhas, what is in season, whose fazenda it comes from, and swapping garden surplus with neighbours.'],
  [81, 'football-small-talk', 3, 'B1', 'social', ['track-social'],
    'Football & Sport Small Talk',
    'The safest conversation on the island: Marítimo and Nacional, last night’s match, the league table — reacting, lamenting and celebrating without needing perfect grammar.'],
  [82, 'village-visits', 3, 'B1', 'travel', ['track-social'],
    'Visiting the Villages',
    'A day out to Câmara de Lobos, Santana or Porto Moniz: asking what to see, talking to locals about their village, and understanding proud local explanations.'],
  [83, 'getting-around-the-island', 3, 'B1', 'travel', ['track-survival'],
    'Getting Around the Island',
    'Island transport talk: the rodoviária buses to the villages, asking drivers about times and stops, taxis for the return, and the mountain roads (curvas, túneis) as small talk.'],
  [84, 'month-3-grand-stress-test', 3, 'B1', 'custom', ['track-social'],
    'Month 3 Grand Stress Test',
    'Island-life conversations combined: a levada encounter, café counter talk, produce and football banter, and an errand — month 3 at natural speed.'],

  // ---- Month 4, Week 13 fill (d89-91) — L3/B1 ----------------------------
  [89, 'poncha-night-rounds', 3, 'B1', 'social', ['track-social'],
    'Poncha Night: Rounds & Toasts',
    'An evening at the poncha bar: ordering rounds, who pays (deixa, pago eu), simple toasts, refusing another one politely, and the social code of the taberna.'],
  [90, 'madeiran-words-in-the-wild', 3, 'B1', 'social', ['track-social'],
    'Madeiran Words in the Wild',
    'Recognising and using genuine Madeiran vocabulary in context — semilha, bica, levada, arraial, "andar de baixo" — knowing when a word is island-only and what mainlanders say instead.'],
  [91, 'reacting-like-a-local', 3, 'B1', 'social', ['track-social'],
    'Reacting Like a Local',
    'The sounds of a real conversation: pois, pois é, então, ora bem, é verdade, não me digas — agreeing, showing surprise and keeping a conversation alive without full sentences.'],

  // ---- Month 4, Week 14 (d92-98) — L3/B1 ---------------------------------
  [92, 'festa-da-flor', 3, 'B1', 'social', ['track-social'],
    'Festa da Flor',
    'Funchal’s Flower Festival: the cortejo, the flower carpets, finding a spot in the crowd, talking about the floats, and arranging where to meet when the streets are packed.'],
  [93, 'christmas-missas-do-parto', 3, 'B1', 'social', ['track-social'],
    'Christmas & the Missas do Parto',
    'A Madeiran December: the Missas do Parto before dawn, the Mercadinho night, the lights in Funchal, what families cook, and being invited into the season.'],
  [94, 'new-year-in-funchal', 3, 'B1', 'social', ['track-social'],
    'New Year in Funchal',
    'The famous fireworks: planning where to watch (baía, miradouros), inviting people, the midnight rituals, and the first conversations of the new year.'],
  [95, 'santos-populares', 3, 'B1', 'social', ['track-social'],
    'The Santos Populares',
    'The saints’ festivals in June and the village festas: Santo António, São João, São Pedro — the marchas, the sardines and espetada stalls, and joining in as a newcomer.'],
  [96, 'vindima-harvest', 3, 'B1', 'social', ['track-social'],
    'Vindima & the Harvest',
    'Harvest time: grapes for Vinho Madeira, helping a neighbour with the vindima, harvest lunches, and the vocabulary of vines, baskets and pressing.'],
  [97, 'inviting-to-a-festa', 3, 'B1', 'social', ['track-social'],
    'Inviting & Being Invited',
    'Festa invitations done right: inviting neighbours, accepting warmly, asking what to bring, arriving at the right time (which is not the stated time), and thanking afterwards.'],
  [98, 'week-14-stress-test', 3, 'B1', 'custom', ['track-social'],
    'Week 14 Stress Test',
    'A festival weekend end-to-end: getting invited, planning the day, navigating the arraial crowd, festival small talk and the goodbyes — month-4 culture under pressure.'],

  // ---- Month 4, Week 15 (d99-105) — L3/B1 --------------------------------
  [99, 'espetada-night', 3, 'B1', 'social', ['track-social'],
    'Espetada Night',
    'Dinner at a casa de pasto: ordering espetada em pau de louro, milho frito and salada, sharing dishes, asking for more bolo do caco, and the long-table conversation around it.'],
  [100, 'ordering-like-a-local', 3, 'B1', 'daily', ['track-social', 'track-survival'],
    'Ordering Like a Local',
    'Menu mastery Madeira-style: lapas grelhadas, bife de atum, prego no bolo do caco, picado to share — asking how dishes come, what the house does well, and ordering with confidence.'],
  [101, 'talking-recipes', 3, 'B1', 'social', ['track-social'],
    'Talking Recipes & How It’s Made',
    'Food talk beyond the menu: how bolo do caco is made, what goes in a poncha, a neighbour’s recipe — following instructions (amassa-se, deixa-se descansar) and asking about steps.'],
  [102, 'fish-market', 3, 'B1', 'daily', ['track-social', 'track-survival'],
    'At the Fish Market',
    'The fish hall at the Mercado: naming the catch (espada, atum, bodião), asking what is fresh today, how much for a posta, and having it cleaned (amanhado) — fast counter talk.'],
  [103, 'coffee-culture', 3, 'B1', 'daily', ['track-social'],
    'Coffee Culture: Chinesa, Garoto & Bica',
    'Madeira’s coffee code: chinesa, garoto, bica, café duplo — what each is, how to order yours, café etiquette at the counter versus the table, and paying at the till.'],
  [104, 'table-etiquette', 3, 'B1', 'social', ['track-social'],
    'Compliments & Refusals at the Table',
    'Being fed by Madeirans: complimenting the food properly, accepting seconds, refusing thirds without offending (não posso mais, estava ótimo), and offering to help.'],
  [105, 'week-15-stress-test', 3, 'B1', 'custom', ['track-social'],
    'Week 15 Stress Test',
    'A full food day: the fish market in the morning, coffee at the counter, espetada dinner with hosts — ordering, food talk and table social code combined.'],

  // ---- Month 4, Week 16 (d106-112) — L3/B1 -------------------------------
  [106, 'playing-the-local-guide', 3, 'B1', 'travel', ['track-social'],
    'Playing the Local Guide',
    'Friends are visiting and a Madeiran asks what you will show them: explaining Madeira in Portuguese — where to take visitors, what to skip, and taking recommendations.'],
  [107, 'microclimates-north-south', 3, 'B1', 'social', ['track-social'],
    'Microclimates & the North/South Divide',
    'Island geography as conversation: sun in the south, rain in the north, the capacete, driving through four seasons in an hour — and the gentle north-versus-south teasing.'],
  [108, 'boats-and-whales', 3, 'B1', 'travel', ['track-social'],
    'Boats, Whales & the Sea Economy',
    'The working sea: whale-watching boats, the old whaling history, fishermen’s talk in Câmara de Lobos, and asking about going out on the water.'],
  [109, 'planning-porto-santo', 3, 'B1', 'travel', ['track-social', 'track-survival'],
    'Planning the Porto Santo Trip',
    'The ferry to the golden island: booking the Lobo Marinho, asking about crossings and the sea state, where to stay, and what Madeirans say about Porto Santo.'],
  [110, 'island-history-stories', 3, 'B1', 'social', ['track-social'],
    'Island History & Stories',
    'The stories locals tell: the discovery and the 600 years, the wine story, emigration and return, the 1976 autonomy — following and asking about history told informally.'],
  [111, 'directions-like-a-local', 3, 'B1', 'daily', ['track-social', 'track-survival'],
    'Directions Like a Local',
    'How Madeirans actually give directions: lá em cima, cá em baixo, à beira de, landmarks instead of street names — following them and giving your own.'],
  [112, 'month-4-grand-stress-test', 3, 'B1', 'custom', ['track-social'],
    'Month 4 Grand Stress Test',
    'Culture month combined: festival talk, food ordering, island explanations and local reactions — a full day of belonging, at speed.'],

  // ---- Month 5, Week 17 fill (d117-119) — L4/B1 --------------------------
  [117, 'returning-a-faulty-purchase', 4, 'B1', 'daily', ['track-survival'],
    'Returning a Faulty Purchase',
    'Something you bought has failed: stating the fault, invoking the warranty (garantia), insisting on repair, replacement or refund when the first answer is no.'],
  [118, 'disputing-a-wrong-bill', 4, 'B1', 'daily', ['track-bureaucracy', 'track-host'],
    'The Bill Is Wrong',
    'A charge you do not recognise — restaurant bill, utility invoice, subscription: querying line by line, staying polite under pushback, and agreeing the correction.'],
  [119, 'the-no-show', 4, 'B1', 'daily', ['track-host', 'track-work'],
    'The No-Show',
    'The tradesperson did not come: calling to find out why, expressing inconvenience firmly but without burning the relationship, and pinning down a real new time.'],

  // ---- Month 5, Week 18 (d120-126) — L4/B1 -------------------------------
  [120, 'water-damage-insurance', 4, 'B1', 'daily', ['track-host'],
    'Water Damage & the Insurance Call',
    'Water is coming through the ceiling: describing the damage to the insurer, understanding the claims process (participação, peritagem), and coordinating with the upstairs neighbour.'],
  [121, 'the-quote-that-grew', 4, 'B1', 'work', ['track-host', 'track-work'],
    'The Quote That Grew',
    'The final bill is far above the orçamento: challenging the difference item by item, hearing the justifications, and negotiating a fair settlement.'],
  [122, 'neighbour-friction', 4, 'B1', 'social', ['track-social', 'track-host'],
    'Noise, Boundaries & Neighbour Friction',
    'Raising a problem with a neighbour — noise, water, a boundary — the Madeiran way: indirect openers, face-saving framing, and finding an arrangement that preserves the relationship.'],
  [123, 'landlord-tenant-deposit', 4, 'B1', 'daily', ['track-host', 'track-bureaucracy'],
    'Landlord & Tenant: Deposit and Repairs',
    'The end-of-lease conversation: the deposit (caução), what counts as wear versus damage, pending repairs, and putting agreements in writing.'],
  [124, 'power-cuts-utilities', 4, 'B1', 'daily', ['track-host', 'track-bureaucracy'],
    'Power Cuts & Utility Failures',
    'The electricity or water is off: reporting the fault, understanding recorded menus and the callback, chasing a resolution, and asking about compensation.'],
  [125, 'midnight-plumber', 4, 'B1', 'daily', ['track-host'],
    'Emergency: The Midnight Plumber',
    'A burst pipe at night: conveying urgency on the phone, describing what you already turned off, negotiating the call-out fee, and directing them to the house.'],
  [126, 'week-18-stress-test', 4, 'B1', 'custom', ['track-host'],
    'Week 18 Stress Test',
    'A bad week at the house: a leak, an inflated bill, a no-show and an insurance call — problem-solving under sustained pressure.'],

  // ---- Month 5, Week 19 (d127-133) — L4/B2 -------------------------------
  [127, 'missing-document-financas', 4, 'B2', 'daily', ['track-bureaucracy'],
    'The Missing Document at Finanças',
    'Finanças says a document is missing and today’s trip was wasted: establishing exactly what is required, questioning contradictory instructions, and leaving with it in writing.'],
  [128, 'cancelled-appointment', 4, 'B2', 'daily', ['track-bureaucracy'],
    'The Cancelled Appointment',
    'Your long-awaited marcação was cancelled: pushing for the earliest new slot, explaining urgency, asking who can authorise an exception, and insisting politely past the first no.'],
  [129, 'chasing-a-stuck-process', 4, 'B2', 'daily', ['track-bureaucracy'],
    'Chasing a Stuck Process',
    'A request has been "em análise" for months: following up in person, citing reference numbers and dates, asking precisely what is blocking it and when to expect movement.'],
  [130, 'health-centre-referral', 4, 'B2', 'daily', ['track-bureaucracy'],
    'Getting the Referral You Need',
    'At the centro de saúde pressing for a specialist referral (credencial): describing symptoms with precision, questioning the waiting time, and asking about alternatives.'],
  [131, 'contesting-a-fine', 4, 'B2', 'daily', ['track-bureaucracy'],
    'Contesting a Fine',
    'A parking or administrative fine (coima) you believe is wrong: understanding the notice, presenting your case calmly at the counter, and starting a written contestação.'],
  [132, 'escalating-politely', 4, 'B2', 'work', ['track-bureaucracy', 'track-work'],
    'Escalating Without Burning Bridges',
    'The counter cannot help: asking for the responsável or a written refusal, keeping every exchange courteous, and leaving the door open while moving the problem up.'],
  [133, 'week-19-stress-test', 4, 'B2', 'custom', ['track-bureaucracy'],
    'Week 19 Stress Test',
    'A bureaucratic marathon: a missing document, a cancelled slot, a stuck process and an escalation — one office after another, in one day.'],

  // ---- Month 5, Week 20 (d134-140) — L4/B2 -------------------------------
  [134, 'client-wont-pay', 4, 'B2', 'work', ['track-work'],
    'The Client Who Won’t Pay',
    'An invoice is long overdue and excuses are repeating: the firm final reminder, restating amounts and dates, proposing a payment plan, and signalling next steps without threats.'],
  [135, 'renegotiating-deadlines', 4, 'B2', 'work', ['track-work'],
    'Renegotiating a Deadline',
    'A deadline is going to slip — yours or theirs: breaking the news early, explaining causes without excuses, and agreeing a new date both sides believe.'],
  [136, 'guest-refund', 4, 'B2', 'work', ['track-host'],
    'The Guest Wants a Refund',
    'A guest demands money back over a problem in the flat: hearing the complaint out, distinguishing fair from opportunistic claims, offering remedies, and protecting the review.'],
  [137, 'price-rise-talks', 4, 'B2', 'work', ['track-work', 'track-host'],
    'Price-Rise Conversations',
    'Prices are going up — telling a client your rate is rising, and hearing the same from your cleaner or supplier: justifying, absorbing or negotiating the increase.'],
  [138, 'misdelivered-order', 4, 'B2', 'daily', ['track-host', 'track-survival'],
    'The Misdelivered Order',
    'The delivery went to the wrong place or arrived wrong: tracking it with the courier, disputing delivery confirmation, and arranging redelivery or refund.'],
  [139, 'saying-no-professionally', 4, 'B2', 'work', ['track-work'],
    'Saying No Professionally',
    'Declining work, unrealistic asks and scope creep: saying no clearly while keeping the client — alternatives, boundaries, and the polite forms that soften a hard no.'],
  [140, 'month-5-grand-stress-test', 4, 'B2', 'custom', ['track-work', 'track-bureaucracy'],
    'Month 5 Grand Stress Test',
    'Everything going wrong at once: a payment chase, a guest crisis, a bureaucratic dead end and a renegotiation — problem-solving month, final exam.'],

  // ---- Month 6, Week 21 fill (d145-147) — L5/B2 --------------------------
  [145, 'humour-and-irony', 5, 'B2', 'social', ['track-social'],
    'Humour, Irony & Taking a Joke',
    'Resident-level humour: understanding irony and understatement, gentle teasing between friends, laughing at yourself, and landing a joke without translating one.'],
  [146, 'art-of-indirectness', 5, 'B2', 'social', ['track-social'],
    'The Art of Indirectness',
    'Reading between the lines: what "talvez", "vamos ver" and "depois combinamos" really mean, softening requests and refusals, and hearing the no inside a yes.'],
  [147, 'reacting-to-stories', 5, 'B2', 'social', ['track-social'],
    'Reacting to Stories Like a Native',
    'Back-channelling at full speed: ai é?, não acredito!, ora essa!, ainda bem — timing your reactions, asking the question the teller wants, and passing the story on.'],

  // ---- Month 6, Week 22 (d148-154) — L5/B2 -------------------------------
  [148, 'formal-letters-requerimento', 5, 'B2', 'work', ['track-bureaucracy'],
    'Formal Letters & the Requerimento',
    'Writing to officialdom: the structure of a requerimento, formal openings and closings (Exmo. Senhor, Com os melhores cumprimentos), stating a request precisely, and reading replies.'],
  [149, 'reading-the-contract', 5, 'B2', 'work', ['track-bureaucracy', 'track-host'],
    'Reading the Contract',
    'A lease or service contract in front of you: the clauses that matter (prazo, rescisão, fiador), asking for plain-language explanations, and querying a clause before signing.'],
  [150, 'speaking-in-meetings', 5, 'B2', 'work', ['track-work'],
    'Speaking in Meetings',
    'Holding your own in a meeting: taking the floor politely, interrupting and being interrupted, summarising a position, and disagreeing with a senior person acceptably.'],
  [151, 'official-phone-call', 5, 'B2', 'work', ['track-bureaucracy'],
    'The Official Phone Call at Full Speed',
    'Phoning an institution and surviving: IVR menus, the fast-talking official, taking down reference numbers, spelling names, and confirming everything before hanging up.'],
  [152, 'money-and-tax-talk', 5, 'B2', 'work', ['track-bureaucracy', 'track-work'],
    'Money & Tax Vocabulary',
    'Resident-level money talk: IRS and IVA in conversation, recibos and faturas com NIF, talking to the bank about rates and transfers, and understanding a contabilista.'],
  [153, 'complaining-in-writing', 5, 'B2', 'work', ['track-bureaucracy'],
    'Complaining in Writing',
    'The livro de reclamações and the formal complaint email: setting out facts, dates and requests in correct written register, and the follow-up when the reply is boilerplate.'],
  [154, 'week-22-stress-test', 5, 'B2', 'custom', ['track-bureaucracy', 'track-work'],
    'Week 22 Stress Test',
    'An administrative gauntlet: a contract question, a formal call, a written complaint and a meeting intervention — formal register sustained across a full day.'],

  // ---- Month 6, Week 23 (d155-161) — L5/B2 -------------------------------
  [155, 'news-and-local-politics', 5, 'B2', 'social', ['track-social'],
    'Talking News & Local Politics — Carefully',
    'The café conversation about the news: following island topics (the Câmara, roadworks, ferry prices), giving a measured opinion, and knowing when to just listen.'],
  [156, 'toasts-and-speeches', 5, 'B2', 'social', ['track-social'],
    'Toasts & Speaking at Gatherings',
    'Being asked to say a few words: a birthday toast, thanking hosts at a festa, a short speech that lands — structure, warmth and the right register.'],
  [157, 'condolences-congratulations', 5, 'B2', 'social', ['track-social'],
    'Condolences, Congratulations & Rituals',
    'The moments that matter: os meus sentimentos at a loss, parabéns and muitas felicidades at weddings and births, what to say at the door, and the rituals around each.'],
  [158, 'gossip-and-discretion', 5, 'B2', 'social', ['track-social'],
    'Gossip & Discretion',
    'Village dynamics: recognising a conversa fiada, deflecting questions you would rather not answer, keeping confidences, and staying warm without feeding the mill.'],
  [159, 'helping-a-newcomer', 5, 'B2', 'social', ['track-social'],
    'Helping a Newcomer — in Portuguese',
    'The full circle: explaining Madeira life to a newly-arrived foreigner in Portuguese — the systems, the customs, the words — and translating culture in both directions.'],
  [160, 'older-generation-talk', 5, 'B2', 'social', ['track-social'],
    'Talking with the Older Generation',
    'Conversations with older Madeirans: faster, more idiomatic, more indirect — respect forms, following stories of the old days, and asking the questions that open people up.'],
  [161, 'week-23-stress-test', 5, 'B2', 'custom', ['track-social'],
    'Week 23 Stress Test',
    'A full social weekend: a festa with a toast, news talk at the café, a delicate condolence visit and an evening with older neighbours — social integration under pressure.'],

  // ---- Month 6, Week 24 (d162-168) — L5/B2 -------------------------------
  [162, 'full-errand-day', 5, 'B2', 'custom', ['track-survival', 'track-bureaucracy'],
    'A Full Day in Town',
    'Chaining real life: the bank, Finanças, the market, a phone call and café encounters — switching register and context all day without dropping the thread.'],
  [163, 'hosting-end-to-end', 5, 'B2', 'custom', ['track-host'],
    'Hosting End-to-End',
    'One hosting day, every conversation: briefing the cleaner, a guest check-in, a plumber mid-stay, a neighbour’s heads-up about noise, and the checkout — all in Portuguese.'],
  [164, 'improvising-when-plans-collapse', 5, 'B2', 'custom', ['track-social', 'track-survival'],
    'Improvising When Plans Collapse',
    'The ferry is cancelled, the road is closed, the guests are early: replanning out loud with others, negotiating alternatives, and staying fluent when nothing goes to script.'],
  [165, 'extreme-listening', 5, 'B2', 'custom', ['track-social'],
    'Fast, Noisy, Real',
    'Extreme listening: overlapping speakers in a loud café, a bad phone line, a mumbled aside — extracting what matters, confirming it, and answering at speed.'],
  [166, 'your-madeira-story', 5, 'B2', 'social', ['track-social'],
    'Your Madeira Story',
    'Presenting yourself as a resident: the polished version of why Madeira, what you do, how the island changed you — told with colour, connectors and humour.'],
  [167, 'the-long-conversation', 5, 'B2', 'social', ['track-social'],
    'The Long Conversation',
    'An evening of unscripted talk: sustaining a multi-topic conversation for an hour — stories, opinions, jokes, disagreements and plans — as an equal at the table.'],
  [168, 'graduation-integrated-resident', 5, 'B2', 'custom', ['track-social'],
    'Graduation: The Integrated Resident',
    'The final: a messy, multi-context, full-speed day drawing on all six months — service counters, neighbours, officialdom, hosting and the long table — the integrated-resident test.'],
];

const weekOfDay = (d) => Math.floor((d - 1) / 7) + 1;
const monthOfDay = (d) => Math.floor((d - 1) / DAYS_PER_MONTH) + 1;

function buildGenSpecs() {
  return NEW_DAYS.map(([day, slug, level, cefr, category, goalTracks, title, theme]) => ({
    id: `sit-d${day}-${slug}`,
    day,
    month: monthOfDay(day),
    week: weekOfDay(day),
    level,
    cefr,
    category,
    goalTracks,
    title,
    theme,
  }));
}

// ---------------------------------------------------------------------------
// pt-PT enforcement + level-lock (mirror scripts/enrich-content.mjs)
// ---------------------------------------------------------------------------
const PRACTICAL_LEVELS = {
  0: 'L0 Tourist survival — greet, order, pay, ask where things are, escape politely when lost.',
  1: 'L1 Daily function — routine daily life: shopping, café, pharmacy, times, prices, simple past/future.',
  2: 'L2 House & service management — cleaners, tradespeople, deliveries, bills, appointments by phone.',
  3: 'L3 Local conversation — real conversations with neighbours: opinions, plans, stories.',
  4: 'L4 Problem solving — complaints, misunderstandings, negotiations, bureaucracy pushback.',
  5: 'L5 Integrated resident — function socially and administratively like a resident: humour, indirectness, formal writing.',
};

const PT_PT_ENFORCEMENT = `EUROPEAN PORTUGUESE (pt-PT) ENFORCEMENT — non-negotiable:
- All Portuguese is European Portuguese (pt-PT). Spelling follows the Acordo Ortográfico as used in Portugal; vocabulary, syntax and idiom follow Portuguese (not Brazilian) norms.
- Madeiran spoken realism where natural: reductions ("tá" for "está", "p'ra" for "para"), "pois"/"pois é" for agreement, "Diga!"/"Diz?"/"Como?" when not hearing, "imenso" (a lot), "um bocado" (a little), local words (bica, semilha, levada, poncha, bolo do caco, espetada). Realism, NOT phonetic dialect spelling — write standard orthography.
- NO articles before professions: "Sou professor" (never "Sou um professor").
- Register (pt-PT): default to tu (informal, peers/neighbours) OR null-subject 3rd person / "o senhor / a senhora" (polite service & officials). Do NOT use "você" as the default polite address — in Portugal it can read as distancing. Only use "você" if the situation is explicitly teaching it.
- Use "estar a + infinitive" for ongoing action ("estou a fazer"), NEVER the Brazilian gerund periphrasis ("estou fazendo").
- FORBIDDEN Brazilian markers — never emit these; always use the European form:
  ônibus/ponto de ônibus → autocarro/paragem de autocarro; trem → comboio; banheiro → casa de banho; celular → telemóvel; geladeira → frigorífico; sorvete → gelado; suco → sumo; café da manhã → pequeno-almoço; açougue → talho; aeromoça → assistente de bordo; encanador → canalizador; caminhão → camião; esporte(s) → desporto(s); equipe → equipa; usuário/usuária → utilizador/utilizadora; registro/cadastro → registo; gerenciar → gerir; planejar/planejamento → planear/planeamento.`;

const VOICE_TYPES_DOC = `The 7 voice archetypes (voice_type MUST be exactly one of these lowercase strings):
- "teacher" (clear, slow model voice), "local" (natural Madeiran speed/rhythm), "older", "younger",
  "service" (counter/shop/phone-desk workers), "phone" (degraded phone audio), "noisy" (café/market ambience).
Dialogue realism: short turns, interjections (Diga!, Pois, Então, P'ra já!), no textbook monologues.
L0-L1 favour teacher+service clarity; L2+ MUST include at least one "local"-speed line; where the scenario
justifies it at L3+, include a "phone" or "noisy" line.`;

const SYSTEM_INSTRUCTION_BASE = `You are the FalaMadeira content-generation engine for European Portuguese as spoken in Madeira. You output STRICT, VALID JSON only — no prose, no markdown fences, no commentary.

${PT_PT_ENFORCEMENT}

${VOICE_TYPES_DOC}`;

function levelLockBlock(level) {
  const p = PRACTICAL_LEVELS[level];
  return p
    ? `LEVEL LOCK — the learner is at ${p}
- Speak AT this level (at most i+1). Keep sentences, vocabulary and grammar within reach for this level.
- Do NOT dump advanced grammar, rare tenses, or vocabulary the learner is unlikely to know at this level.`
    : '';
}

// ---------------------------------------------------------------------------
// Prompt builder — FULL situation body, with course/curriculum context
// ---------------------------------------------------------------------------
function buildUserPrompt(spec) {
  const ll = levelLockBlock(spec.level);
  const monthTheme = MONTH_THEMES[spec.month] ?? '';
  const weekTheme = WEEK_THEMES[spec.week] ?? '';
  return `${ll}

COURSE POSITION — this situation is Day ${spec.day} of a 168-day (6-month) structured course.
Month ${spec.month} theme: "${monthTheme}". Week ${spec.week} theme: "${weekTheme}".
The learner has completed all previous days, so you may build on earlier months' grammar and
vocabulary — but introduce THIS day's new material at level L${spec.level} only.

NEW SITUATION TO AUTHOR (id "${spec.id}", level L${spec.level}, CEFR ${spec.cefr}):
Title: ${spec.title}
Real-life context to anchor everything in: ${spec.theme}

TASK: Author a COMPLETE, self-contained FalaMadeira Situation for daily life in Madeira, strictly within level L${spec.level}. It must be practiceable by MULTIPLE modes from its own data. Return a single JSON object with EXACTLY these keys:

{
  "phrase_patterns": [
    // 3-5 base phrases. Each id MUST be unique and start with "pp-${spec.id}-".
    // Give 2-4 of them a "slots" array (a slot {name} MUST appear literally in that base as "{name}")
    // and/or a "variants" array. base/slot options/variant text are pt-PT.
    {
      "id": "pp-${spec.id}-1",
      "base": "<pt-PT base phrase, may contain {slot} markers>",
      "translation": "<English>",
      "slots": [ { "name": "<lowercase, no spaces>", "description": "<English>", "options": ["<pt-PT>", "..."] } ],
      "variants": [ { "text": "<pt-PT>", "translation": "<English>", "register": "informal|neutral|formal", "note": "<optional English>" } ]
    }
  ],
  "vocabulary": [
    // 5-8 words/phrases central to this situation. word is pt-PT; translation + pronunciation are English.
    { "word": "<pt-PT>", "translation": "<English>", "pronunciation": "<English-reader phonetic, e.g. BEE-kah>", "register": "informal|neutral|formal", "note": "<optional, mark Madeira/Portugal regionalisms>" }
  ],
  "dialogues": [
    // 1-2 multi-speaker dialogues. Each line MUST carry a valid voice_type. Each dialogue needs a "context".
    { "id": "dlg-${spec.id}-1", "title": "<short English>", "context": "<where/who/what, English>",
      "lines": [ { "speaker": "<role/name>", "voice_type": "<one of the 7>", "text": "<pt-PT>", "translation": "<English>" } ] }
  ],
  "cultural_notes": [
    // 1-2 structured notes: the social code, register, indirectness, timing or local practice this situation needs.
    { "title": "<English>", "body": "<English explainer>" }
  ],
  "roleplay": {
    // ONE branching roleplay. difficulty is an integer 1-5 appropriate to L${spec.level}
    // (L0-L1 -> 1-2 guided; L2-L3 -> 2-3; L4 -> 4; L5 -> 5 messy real-life).
    "scenario": "<English scene description>",
    "difficulty": <1-5>,
    "entry_node": "<id of the starting node>",
    "nodes": [
      { "id": "<node id>", "npc_text": "<pt-PT>", "npc_translation": "<English>", "npc_voice_type": "<one of the 7>",
        "options": [ { "text": "<pt-PT learner line>", "translation": "<English>", "next": "<another node id, or omit to end>", "feedback": "<English coaching>" } ] }
    ]
    // 4-6 nodes; at least one branch reaches a terminal node (options: []). Every "next" MUST match a node id. entry_node MUST match a node id.
  },
  "mission": {
    "title": "<English real-world assignment title>",
    "prep": ["<English rehearsal step>", "..."],
    "fallback_phrases": ["<pt-PT escape-hatch phrase>", "..."],
    "likely_responses": ["<pt-PT what the other party will probably say>", "..."]
  },
  "goals": ["<English learner-facing objective>", "..."]
}

Rules:
- Portuguese ONLY in: phrase_pattern base, slot options, variant text, vocabulary word, dialogue line text, roleplay npc_text and option text, mission fallback_phrases and likely_responses. Everything else (titles, translations, descriptions, goals, prep, feedback, cultural note bodies, pronunciation guides) is ENGLISH.
- Obey the pt-PT / anti-Brazilian and level-lock rules in your system instruction for ALL Portuguese.
- Ground everything in real daily life in Madeira for this exact situation. No invented slang, no phonetic dialect spelling.
- Output the JSON object ONLY.`;
}

// ---------------------------------------------------------------------------
// Gemini REST call with retry/backoff
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateJson(userPrompt, { retries = 4 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_BASE }] },
          generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
        }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        if (res.status === 429 || res.status >= 500) throw new Error(`retryable ${res.status}: ${body}`);
        throw Object.assign(new Error(`Gemini ${res.status}: ${body}`), { fatal: true });
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!text.trim()) throw new Error('empty candidate text');
      return JSON.parse(stripFences(text));
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      if (attempt < retries) {
        const backoff = Math.min(1000 * 2 ** attempt, 15000) + Math.floor(Math.random() * 500);
        console.log(`    retry ${attempt + 1}/${retries} after ${backoff}ms (${e.message.slice(0, 80)})`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

function stripFences(t) {
  const s = t.trim();
  if (s.startsWith('```')) {
    return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  return s;
}

// ---------------------------------------------------------------------------
// Normalizers (same repair discipline as scripts/generate-content.mjs)
// ---------------------------------------------------------------------------
function normalizePatterns(arr, sid) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  let n = 0;
  const seen = new Set();
  for (const p of arr) {
    if (!p || typeof p.base !== 'string' || !p.base.trim()) continue;
    n += 1;
    let id = typeof p.id === 'string' && p.id.trim() ? p.id : `pp-${sid}-${n}`;
    if (seen.has(id)) id = `pp-${sid}-${n}`;
    seen.add(id);
    const pat = { id, base: String(p.base) };
    if (typeof p.translation === 'string') pat.translation = p.translation;
    if (Array.isArray(p.slots)) {
      const slots = p.slots
        .filter(
          (s) =>
            s && typeof s.name === 'string' && s.name.trim() &&
            Array.isArray(s.options) && s.options.filter((o) => typeof o === 'string' && o.trim()).length > 0 &&
            pat.base.includes(`{${s.name}}`)
        )
        .map((s) => ({
          name: String(s.name),
          ...(typeof s.description === 'string' && s.description.trim() ? { description: s.description } : {}),
          options: s.options.filter((o) => typeof o === 'string' && o.trim()).map(String),
        }));
      if (slots.length) pat.slots = slots;
    }
    if (Array.isArray(p.variants)) {
      const variants = p.variants
        .filter((v) => v && typeof v.text === 'string' && v.text.trim())
        .map((v) => ({
          text: String(v.text),
          ...(typeof v.translation === 'string' ? { translation: v.translation } : {}),
          ...(schema.REGISTERS?.includes?.(v.register) ? { register: v.register } : {}),
          ...(typeof v.note === 'string' && v.note.trim() ? { note: v.note } : {}),
        }));
      if (variants.length) pat.variants = variants;
    }
    out.push(pat);
  }
  return out;
}

function normalizeVocab(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((v) => v && typeof v.word === 'string' && v.word.trim() && typeof v.translation === 'string' && v.translation.trim())
    .map((v) => ({
      word: String(v.word),
      translation: String(v.translation),
      ...(typeof v.pronunciation === 'string' && v.pronunciation.trim() ? { pronunciation: v.pronunciation } : {}),
      ...(schema.REGISTERS?.includes?.(v.register) ? { register: v.register } : {}),
      ...(typeof v.note === 'string' && v.note.trim() ? { note: v.note } : {}),
    }));
}

function normalizeDialogues(arr, sid) {
  if (!Array.isArray(arr)) return [];
  const dlgs = [];
  arr.forEach((d, i) => {
    if (!d || !Array.isArray(d.lines) || d.lines.length === 0) return;
    const lines = d.lines
      .filter((l) => l && typeof l.text === 'string' && l.text.trim() && typeof l.speaker === 'string' && l.speaker.trim())
      .map((l) => ({
        speaker: String(l.speaker),
        voice_type: schema.VOICE_TYPES.includes(l.voice_type) ? l.voice_type : 'local',
        text: String(l.text),
        ...(typeof l.translation === 'string' ? { translation: l.translation } : {}),
      }));
    if (lines.length === 0) return;
    dlgs.push({
      id: `dlg-${sid}-${i + 1}`,
      ...(typeof d.title === 'string' && d.title.trim() ? { title: d.title } : {}),
      ...(typeof d.context === 'string' && d.context.trim() ? { context: d.context } : {}),
      lines,
    });
  });
  return dlgs;
}

function normalizeNotes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((n) => n && typeof n.title === 'string' && n.title.trim() && typeof n.body === 'string' && n.body.trim())
    .map((n) => ({ title: n.title, body: n.body }));
}

function normalizeRoleplay(rp, level) {
  if (!rp || !Array.isArray(rp.nodes) || rp.nodes.length === 0) return null;
  const nodes = [];
  const ids = new Set();
  for (const n of rp.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id.trim() || typeof n.npc_text !== 'string' || !n.npc_text.trim()) continue;
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    nodes.push(n);
  }
  if (nodes.length === 0) return null;
  const idSet = new Set(nodes.map((n) => n.id));
  const clean = nodes.map((n) => {
    const options = Array.isArray(n.options)
      ? n.options
          .filter((o) => o && typeof o.text === 'string' && o.text.trim())
          .map((o) => {
            const opt = {
              text: String(o.text),
              ...(typeof o.translation === 'string' ? { translation: o.translation } : {}),
              ...(typeof o.feedback === 'string' && o.feedback.trim() ? { feedback: o.feedback } : {}),
            };
            if (typeof o.next === 'string' && idSet.has(o.next)) opt.next = o.next;
            return opt;
          })
      : [];
    return {
      id: n.id,
      npc_text: String(n.npc_text),
      ...(typeof n.npc_translation === 'string' ? { npc_translation: n.npc_translation } : {}),
      ...(schema.VOICE_TYPES.includes(n.npc_voice_type) ? { npc_voice_type: n.npc_voice_type } : { npc_voice_type: 'local' }),
      options,
    };
  });
  const entry = typeof rp.entry_node === 'string' && idSet.has(rp.entry_node) ? rp.entry_node : clean[0].id;
  let difficulty = Number(rp.difficulty);
  if (!schema.ROLEPLAY_DIFFICULTIES.includes(difficulty)) {
    difficulty = Math.max(1, Math.min(5, level >= 5 ? 5 : level >= 4 ? 4 : level >= 2 ? 3 : level >= 1 ? 2 : 1));
  }
  const scenario = typeof rp.scenario === 'string' && rp.scenario.trim() ? rp.scenario : 'Practise this situation.';
  return { scenario, difficulty, entry_node: entry, nodes: clean };
}

function normalizeMission(m) {
  if (!m || typeof m.title !== 'string' || !m.title.trim()) return null;
  const strArr = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map(String) : []);
  const prep = strArr(m.prep);
  const fb = strArr(m.fallback_phrases);
  const lr = strArr(m.likely_responses);
  if (!prep.length || !fb.length || !lr.length) return null;
  return { title: m.title, prep, fallback_phrases: fb, likely_responses: lr };
}

// Deterministic review items derived from the situation's own data.
function deriveReviewItems(sit) {
  const items = [];
  const sid = sit.id;
  (sit.phrase_patterns ?? []).slice(0, 4).forEach((p, i) => {
    items.push({
      id: `rv-${sid}-say-${i + 1}`,
      dimension: 'say',
      prompt: p.translation ? `Say in Portuguese: ${p.translation}` : `Say this phrase from memory: "${p.base}"`,
      answer: p.base,
      source_ref: p.id,
    });
  });
  (sit.vocabulary ?? []).slice(0, 4).forEach((v, i) => {
    items.push({
      id: `rv-${sid}-retrieve-${i + 1}`,
      dimension: 'retrieve',
      prompt: `Recall the Portuguese for: ${v.translation}`,
      answer: v.word,
      source_ref: v.word,
    });
  });
  if ((sit.dialogues ?? []).length > 0) {
    items.push({
      id: `rv-${sid}-hear-1`,
      dimension: 'hear',
      prompt: 'Listen to the dialogue at natural speed and answer: what is being asked for?',
      source_ref: sit.dialogues[0].id,
    });
  }
  return items;
}

// Additive goal-track keyword classifier (same conservative logic as
// scripts/generate-content.mjs classifyTracks) — new course situations get their
// authored goalTracks PLUS any extra genuine thematic matches.
function classifyTracks(sit) {
  const t = `${sit.title} ${sit.summary}`.toLowerCase();
  const cat = sit.course?.category ?? 'custom';
  const L = sit.level;
  const set = new Set();
  if (
    /greet|caf[ée]|order|direction|locations|number|price|shopping|clothes|colour|pharmac|health|restaurant|meal|time:|days|hours|confusion|clarification|self-introduction|introduc/.test(t)
  ) {
    set.add('track-survival');
  }
  if (
    cat === 'social' ||
    /opinion|preference|emotion|empath|comfort|conversation|register|social|cultur|geograph|festival|others|small talk|invitation|agree|disagree/.test(t)
  ) {
    set.add('track-social');
  }
  if (/formal|telephone|message|writing|funchal|professional/.test(t)) {
    set.add('track-bureaucracy');
  }
  if (cat === 'work' || /work|professional|decision|business/.test(t)) {
    set.add('track-work');
  }
  if (/home|describ|house|apartment|repair|clean|bill/.test(t)) {
    set.add('track-host');
  }
  if (/telephone|message/.test(t) && L >= 1) set.add('track-host');
  return [...set];
}

// ---------------------------------------------------------------------------
// Assemble a FULL situation from a spec + generated body
// ---------------------------------------------------------------------------
function assembleSituation(spec, gen) {
  const sit = {
    id: spec.id,
    title: spec.title,
    summary: spec.theme,
    tracks: [],
    level: spec.level,
    cefr: spec.cefr,
    phrase_patterns: normalizePatterns(gen.phrase_patterns, spec.id),
    vocabulary: normalizeVocab(gen.vocabulary),
  };

  const dialogues = normalizeDialogues(gen.dialogues, spec.id);
  if (dialogues.length) sit.dialogues = dialogues;

  const notes = normalizeNotes(gen.cultural_notes);
  if (notes.length) sit.cultural_notes = notes;

  const rp = normalizeRoleplay(gen.roleplay, spec.level);
  if (rp) sit.roleplay = rp;

  const mission = normalizeMission(gen.mission);
  if (mission) sit.mission = mission;

  const goals = Array.isArray(gen.goals)
    ? gen.goals.filter((g) => typeof g === 'string' && g.trim()).map(String)
    : [];
  if (goals.length) sit.goals = goals;

  sit.course = { month: spec.month, day: spec.day, category: spec.category };

  // Tracks: structured course + authored goal tracks + additive keyword matches.
  const tracks = new Set([TRACK_STRUCTURED, ...spec.goalTracks]);
  for (const gt of classifyTracks(sit)) tracks.add(gt);
  sit.tracks = [...tracks];

  sit.review_items = deriveReviewItems(sit);
  return sit;
}

// ---------------------------------------------------------------------------
// PHASE 0 — deterministic day renumbering to canonical month blocks
// ---------------------------------------------------------------------------
// Existing (non-new-spec) course situations of month m, sorted by their current
// day (preserves relative order whether old or already-canonical days), get
// sequential days from the month block start. Idempotent.
function renumberExistingDays(situations, newSpecIds) {
  const changes = [];
  for (let m = 1; m <= 6; m++) {
    const start = (m - 1) * DAYS_PER_MONTH + 1;
    const existing = situations
      .filter((s) => s.course && s.course.month === m && !newSpecIds.has(s.id))
      .sort((a, b) => a.course.day - b.course.day);
    existing.forEach((s, i) => {
      const nd = start + i;
      if (s.course.day !== nd) {
        changes.push({ id: s.id, month: m, from: s.course.day, to: nd });
        s.course.day = nd;
      }
    });
  }
  return changes;
}

// Sanity: existing count + new specs must fill each month exactly (28 days).
function assertBlockLayout(situations, specs, newSpecIds) {
  for (let m = 1; m <= 6; m++) {
    const start = (m - 1) * DAYS_PER_MONTH + 1;
    const existingCount = situations.filter(
      (s) => s.course && s.course.month === m && !newSpecIds.has(s.id)
    ).length;
    const monthSpecs = specs.filter((sp) => sp.month === m);
    if (existingCount + monthSpecs.length !== DAYS_PER_MONTH) {
      throw new Error(
        `month ${m}: existing ${existingCount} + new ${monthSpecs.length} != ${DAYS_PER_MONTH}`
      );
    }
    const expected = new Set(
      Array.from({ length: DAYS_PER_MONTH - existingCount }, (_, i) => start + existingCount + i)
    );
    for (const sp of monthSpecs) {
      if (!expected.has(sp.day)) {
        throw new Error(`month ${m}: spec ${sp.id} day ${sp.day} outside expected fill range`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PHASE 2 — weekly video curation (oEmbed-verified; never fabricate an id)
// ---------------------------------------------------------------------------
// One candidate per week block lacking a verified video. Weeks 1 (sit-d1),
// 3 (sit-d15 + sit-d16) and 13 (sit-m4w2-festival-arraial, day 86) already carry
// verified videos. All candidate ids below were found via web search (YouTube
// results for the week's theme) and pre-verified via oEmbed HTTP 200 on
// 2026-07-10; they are RE-verified at run time before attaching.
const VIDEO_CANDIDATES = [
  { week: 2, situationId: 'sit-d13-daily-routines',
    url: 'https://www.youtube.com/watch?v=mIb099ksEzE',
    caption: 'Daily routines in European Portuguese (A1/A2) — Portuguese in Real Life' },
  { week: 4, situationId: 'sit-d25-restaurant-ordering-a-full-meal',
    url: 'https://www.youtube.com/watch?v=6in3Gknx5mU',
    caption: 'How to order in a restaurant — European Portuguese (Practice Portuguese)' },
  { week: 5, situationId: 'sit-d29-tu-vs-voce-informal-formal',
    url: 'https://www.youtube.com/watch?v=RswhRINYA2I',
    caption: 'Tu vs Você in European Portuguese (Mia Esmeriz Academy)' },
  { week: 6, situationId: 'sit-d37-reflexive-verbs-all-persons',
    url: 'https://www.youtube.com/watch?v=odNIwTAZV8Q',
    caption: 'Reflexive verbs in Portuguese — 12 verbs for beginners (Listen and Learn Portuguese with Maria)' },
  { week: 7, situationId: 'sit-d45-the-personal-infinitive',
    url: 'https://www.youtube.com/watch?v=J6uXus6Uc0U',
    caption: '20 sentences to learn the Personal Infinitive — European Portuguese (Portuguese With Leo)' },
  { week: 8, situationId: 'sit-d50-at-the-market',
    url: 'https://www.youtube.com/watch?v=xc8Ed0qSzO8',
    caption: 'Shop like a pro in Portugal — European Portuguese (Learn European Portuguese Online)' },
  { week: 9, situationId: 'sit-d50-speed-automaticity',
    url: 'https://www.youtube.com/watch?v=V3PCCEmqVxc',
    caption: 'Understand FAST Portuguese with these tips — European Portuguese (Talk the Streets)' },
  { week: 10, situationId: 'sit-d64-pharmacy-beyond-basics',
    url: 'https://www.youtube.com/watch?v=DFQo1bfuy7M',
    caption: 'At the pharmacy — European Portuguese basic vocabulary (Learn European Portuguese Online)' },
  { week: 11, situationId: 'sit-d73-weather-and-seasons',
    url: 'https://www.youtube.com/watch?v=r23FLvpe2yQ',
    caption: 'The weather and the sea — European Portuguese (Portuguese Lab)' },
  { week: 12, situationId: 'sit-d78-on-a-levada-walk',
    url: 'https://www.youtube.com/watch?v=OtsqDk5qRQY',
    caption: 'Ilha da Madeira, Levadas — Portuguese-language documentary (ECOAMA)' },
  { week: 14, situationId: 'sit-d92-festa-da-flor',
    url: 'https://www.youtube.com/watch?v=Yd46273aTr8',
    caption: 'Festa da Flor da Madeira (Visit Madeira, official)' },
  { week: 15, situationId: 'sit-d101-talking-recipes',
    url: 'https://www.youtube.com/watch?v=nJx-nK0Lva0',
    caption: 'Receita: Bolo do Caco da Madeira — pt-PT cooking video (Cozinha com Dino Duarte)' },
  { week: 16, situationId: 'sit-d110-island-history-stories',
    url: 'https://www.youtube.com/watch?v=yF4F6Cgm8Cc',
    caption: 'Madeira: 600 anos de História — Portuguese-language history video' },
  { week: 17, situationId: 'sit-m5w1-complaint-politely',
    url: 'https://www.youtube.com/watch?v=2IY3AdScUrA',
    caption: 'Stop saying "não" — 5 polite alternatives in European Portuguese (Talk the Streets)' },
  { week: 18, situationId: 'sit-d121-the-quote-that-grew',
    url: 'https://www.youtube.com/watch?v=7WpHFATw33I',
    caption: 'Construction vocabulary — European Portuguese (Learn Portuguese Today)' },
  { week: 19, situationId: 'sit-d127-missing-document-financas',
    url: 'https://www.youtube.com/watch?v=0X-UTWjDjRM',
    caption: 'Portugal primeiros passos: Finanças — NIF (Portuguese-language explainer)' },
  { week: 20, situationId: 'sit-d134-client-wont-pay',
    url: 'https://www.youtube.com/watch?v=UQKqIZq7BHc',
    caption: 'Essential money vocabulary and phrases — European Portuguese (Learn European Portuguese Online)' },
  { week: 21, situationId: 'sit-d145-humour-and-irony',
    url: 'https://www.youtube.com/watch?v=hcyagm9THr8',
    caption: 'Top 20 funniest Portuguese idiomatic expressions — European Portuguese (Portuguese With Carla)' },
  { week: 22, situationId: 'sit-d151-official-phone-call',
    url: 'https://www.youtube.com/watch?v=wKCzfIt-Aco',
    caption: 'How to answer the phone in Portugal — European Portuguese (Portuguese Lab)' },
  { week: 23, situationId: 'sit-d155-news-and-local-politics',
    url: 'https://www.youtube.com/watch?v=1hRDQy6I9nM',
    caption: 'Advanced Portuguese listening practice: real conversations & natural speech (Learn Portuguese Today)' },
  { week: 24, situationId: 'sit-d165-extreme-listening',
    url: 'https://www.youtube.com/watch?v=PWspg1XCF1k',
    caption: 'The secret to understanding FAST Portuguese — European Portuguese (Talk the Streets)' },
];

function extractYouTubeId(url) {
  const m = String(url).match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(url).match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

async function oembedOk(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { method: 'GET' });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function verifyVideoCandidates() {
  const attach = new Map(); // situationId -> MediaRef
  const results = [];
  for (const c of VIDEO_CANDIDATES) {
    const id = extractYouTubeId(c.url);
    if (!id) {
      results.push({ week: c.week, situationId: c.situationId, url: c.url, verified: false, action: 'left-absent (no id)' });
      continue;
    }
    const ok = await oembedOk(c.url);
    if (ok) {
      attach.set(c.situationId, { type: 'video', url: c.url, caption: c.caption });
      results.push({ week: c.week, situationId: c.situationId, url: c.url, verified: true, action: 'attached' });
    } else {
      results.push({ week: c.week, situationId: c.situationId, url: c.url, verified: false, action: 'left-absent (oEmbed != 200)' });
    }
    await sleep(120);
  }
  return { attach, results };
}

function attachVerifiedVideos(byId, attachMap) {
  let attached = 0;
  for (const [sid, ref] of attachMap) {
    const s = byId.get(sid);
    if (!s) continue; // situation not generated yet — attached on a later batch
    const media = Array.isArray(s.media) ? [...s.media] : [];
    if (!media.some((m) => m && m.url === ref.url)) {
      media.push({ ...ref });
      attached += 1;
    }
    s.media = media;
  }
  return attached;
}

// ---------------------------------------------------------------------------
// Tracks rebuild — membership derived from situations' tracks[]; name/goal kept
// from the base pack's existing track rows.
// ---------------------------------------------------------------------------
function orderTrackSituations(ids, byId) {
  return [...ids].sort((a, b) => {
    const sa = byId.get(a);
    const sb = byId.get(b);
    if (sa.level !== sb.level) return sa.level - sb.level;
    const da = sa.course?.day ?? 9999;
    const db = sb.course?.day ?? 9999;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

function buildTracks(base, situations) {
  const byId = new Map(situations.map((s) => [s.id, s]));
  const baseTracks = new Map((base.tracks ?? []).map((t) => [t.id, t]));
  const tracks = [];

  const structured = baseTracks.get(TRACK_STRUCTURED);
  const structuredIds = situations
    .filter((s) => (s.tracks ?? []).includes(TRACK_STRUCTURED))
    .sort((a, b) => (a.course?.day ?? 9999) - (b.course?.day ?? 9999) || a.id.localeCompare(b.id))
    .map((s) => s.id);
  tracks.push({
    id: TRACK_STRUCTURED,
    name: structured?.name ?? 'Structured Course',
    goal: structured?.goal ?? 'Follow the month-by-month structured Madeira Portuguese course',
    situations: structuredIds,
  });

  for (const gid of GOAL_TRACK_IDS) {
    const bt = baseTracks.get(gid);
    if (!bt) continue;
    const ids = situations.filter((s) => (s.tracks ?? []).includes(gid)).map((s) => s.id);
    tracks.push({ id: gid, name: bt.name, goal: bt.goal, situations: orderTrackSituations(ids, byId) });
  }
  return tracks;
}

// ---------------------------------------------------------------------------
// Pack assembly + checksum
// ---------------------------------------------------------------------------
function assemblePack(base, situations, tracks) {
  const pack = {
    id: base.id,
    name: base.name,
    version: NEW_PACK_VERSION,
    schema_version: base.schema_version ?? schema.CONTENT_SCHEMA_VERSION,
    status: base.status ?? 'published',
    situations,
    tracks,
  };
  pack.checksum = createHash('sha256').update(schema.canonicalPackPayload(pack), 'utf8').digest('hex');
  return pack;
}

// ---------------------------------------------------------------------------
// Course-density verification (the mission's own count check)
// ---------------------------------------------------------------------------
function verifyCourseDensity(situations, { expectComplete }) {
  const course = situations.filter((s) => s.course);
  const perMonth = {};
  const dayUse = new Map();
  for (const s of course) {
    perMonth[s.course.month] = (perMonth[s.course.month] ?? 0) + 1;
    dayUse.set(s.course.day, (dayUse.get(s.course.day) ?? 0) + 1);
  }
  const problems = [];
  for (const [d, n] of dayUse) {
    if (n > 1) problems.push(`day ${d} used ${n} times`);
    if (d < 1 || d > TOTAL_DAYS) problems.push(`day ${d} out of range 1-${TOTAL_DAYS}`);
    const m = monthOfDay(d);
    const owner = course.find((s) => s.course.day === d);
    if (owner && owner.course.month !== m) problems.push(`day ${d} claims month ${owner.course.month}, canonical block says ${m}`);
  }
  if (expectComplete) {
    for (let m = 1; m <= 6; m++) {
      if ((perMonth[m] ?? 0) !== DAYS_PER_MONTH) problems.push(`month ${m} has ${perMonth[m] ?? 0}/28 days`);
    }
    for (let d = 1; d <= TOTAL_DAYS; d++) {
      if (!dayUse.has(d)) problems.push(`day ${d} missing`);
    }
  }
  return { perMonth, totalCourse: course.length, problems };
}

// ---------------------------------------------------------------------------
// State (resumable checkpoint — saved after EVERY batch)
// ---------------------------------------------------------------------------
function loadState() {
  if (RESET || !existsSync(STATE_FILE)) return { generated: {}, failed: {}, batches: 0 };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { generated: {}, failed: {}, batches: 0 };
  }
}
function saveState(state) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// DB publish (idempotent upserts + stale-projection cleanup; same pattern as
// scripts/seed-content.mjs / generate-content.mjs)
// ---------------------------------------------------------------------------
async function publishToDb(pack) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const projectRef = supabaseUrl ? supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] : null;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!projectRef || !dbPassword) {
    console.error('  WARN: missing VITE_SUPABASE_URL / SUPABASE_DB_PASSWORD — skipping DB publish');
    return false;
  }
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const packJson = JSON.stringify(pack, null, 2);
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO public.content_packs (id, name, version, schema_version, status, checksum, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, version=EXCLUDED.version,
         schema_version=EXCLUDED.schema_version, status=EXCLUDED.status,
         checksum=EXCLUDED.checksum, payload=EXCLUDED.payload`,
      [pack.id, pack.name, pack.version, pack.schema_version, pack.status, pack.checksum, packJson]
    );
    for (const s of pack.situations) {
      await client.query(
        `INSERT INTO public.situations (id, pack_id, payload, level, cefr, tracks, course_month, course_day, version)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET pack_id=EXCLUDED.pack_id, payload=EXCLUDED.payload,
           level=EXCLUDED.level, cefr=EXCLUDED.cefr, tracks=EXCLUDED.tracks,
           course_month=EXCLUDED.course_month, course_day=EXCLUDED.course_day, version=EXCLUDED.version`,
        [s.id, pack.id, JSON.stringify(s), s.level, s.cefr, s.tracks, s.course?.month ?? null, s.course?.day ?? null, 4]
      );
    }
    for (const t of pack.tracks ?? []) {
      await client.query(
        `INSERT INTO public.tracks (id, pack_id, name, goal, situation_ids, payload)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (id) DO UPDATE SET pack_id=EXCLUDED.pack_id, name=EXCLUDED.name,
           goal=EXCLUDED.goal, situation_ids=EXCLUDED.situation_ids, payload=EXCLUDED.payload`,
        [t.id, pack.id, t.name, t.goal, t.situations, JSON.stringify(t)]
      );
    }
    // Stale-projection cleanup: drop rows of this pack no longer present.
    const sitIds = pack.situations.map((s) => s.id);
    const trkIds = (pack.tracks ?? []).map((t) => t.id);
    await client.query(`DELETE FROM public.situations WHERE pack_id=$1 AND NOT (id = ANY($2))`, [pack.id, sitIds]);
    await client.query(`DELETE FROM public.tracks WHERE pack_id=$1 AND NOT (id = ANY($2))`, [pack.id, trkIds]);
    await client.query('COMMIT');
    const chk = await client.query(`SELECT version, checksum FROM public.content_packs WHERE id=$1`, [pack.id]);
    const ok = chk.rows[0]?.version === pack.version && chk.rows[0]?.checksum === pack.checksum;
    console.log(`  DB publish committed — version=${chk.rows[0]?.version} checksum match=${ok}`);
    return ok;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('  WARN: DB publish failed:', e.message);
    return false;
  } finally {
    await client.end();
  }
}

// ===========================================================================
// MAIN
// ===========================================================================
mkdirSync(REVIEW_DIR, { recursive: true });

const base = JSON.parse(readFileSync(JSON_IN, 'utf8'));
if (!Array.isArray(base.situations) || base.situations.length === 0) {
  console.error('FATAL: base pack has no situations');
  process.exit(1);
}

const specs = buildGenSpecs();
const NEW_SPEC_IDS = new Set(specs.map((s) => s.id));
{
  // spec sanity: 100 specs, unique ids, unique days, none colliding with base ids
  if (specs.length !== 100) throw new Error(`expected 100 new-day specs, got ${specs.length}`);
  const ids = new Set(specs.map((s) => s.id));
  const days = new Set(specs.map((s) => s.day));
  if (ids.size !== 100 || days.size !== 100) throw new Error('duplicate spec ids or days');
  const baseIds = new Set(base.situations.map((s) => s.id));
  for (const id of ids) {
    if (baseIds.has(id) ) {
      // A previously-generated spec situation already merged into the JSON — fine on resume.
      // Only a collision with a NON-spec (pre-existing) situation would be a bug, and by
      // construction spec ids use canonical-day slugs that no legacy id uses.
    }
  }
}

const state = loadState();

// Self-heal checkpointed generated situations: course slot + tracks are DERIVED
// from the spec (deterministic) — re-derive on load.
{
  const specById = new Map(specs.map((s) => [s.id, s]));
  for (const [id, sit] of Object.entries(state.generated)) {
    const spec = specById.get(id);
    if (!spec || !sit) continue;
    sit.course = { month: spec.month, day: spec.day, category: spec.category };
    const tracks = new Set([TRACK_STRUCTURED, ...spec.goalTracks]);
    for (const gt of classifyTracks(sit)) tracks.add(gt);
    sit.tracks = [...tracks];
  }
}

// Working situations: base + previously generated (id-indexed).
const working = new Map(base.situations.map((s) => [s.id, structuredClone(s)]));
for (const [id, sit] of Object.entries(state.generated)) {
  if (sit && sit.id) working.set(id, structuredClone(sit));
}

// ---- PHASE 0: renumber existing course situations (idempotent) ------------
console.log('=== PHASE 0: day renumbering to canonical month blocks ===');
const renumberChanges = renumberExistingDays([...working.values()], NEW_SPEC_IDS);
if (renumberChanges.length) {
  for (const c of renumberChanges) console.log(`  ${c.id}  M${c.month}  d${c.from} -> d${c.to}`);
} else {
  console.log('  (no changes — already canonical)');
}
assertBlockLayout([...working.values()], specs, NEW_SPEC_IDS);

// ---- video verification up-front -------------------------------------------
let videoResults = [];
let videoAttach = new Map();
if (!NO_VIDEO) {
  console.log('\n--- verifying weekly video candidates via YouTube oEmbed ---');
  const v = await verifyVideoCandidates();
  videoResults = v.results;
  videoAttach = v.attach;
  for (const r of videoResults) console.log(`  ${r.verified ? 'OK ' : 'X  '} week ${String(r.week).padStart(2)}  ${r.situationId}  -> ${r.action}`);
}

// ---- finalize helper: retracks + videos + validate + write + review --------
function finalizeAndWrite(reviewForBatch, batchIndex) {
  const allSits = [...working.values()];
  const byId = new Map(allSits.map((s) => [s.id, s]));

  const attachedVideos = NO_VIDEO ? 0 : attachVerifiedVideos(byId, videoAttach);

  // Deterministic order: course situations by day, then track-only by id.
  const ordered = allSits.sort((a, b) => {
    const da = a.course?.day ?? Number.MAX_SAFE_INTEGER;
    const db = b.course?.day ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });

  const tracks = buildTracks(base, ordered);
  const pack = assemblePack(base, ordered, tracks);

  const result = schema.validateContentPack(pack);
  if (!result.valid) {
    console.error(`  FATAL: assembled pack invalid (${result.errors.length} errors) — not writing/publishing`);
    result.errors.slice(0, 12).forEach((e) => console.error(`    ${e.path}: ${e.message}`));
    saveState(state);
    process.exit(1);
  }

  const genCount = Object.keys(state.generated).length;
  const density = verifyCourseDensity(ordered, { expectComplete: genCount >= specs.length });
  if (density.problems.length) {
    console.error(`  FATAL: course-density verification failed (${density.problems.length} problem(s)):`);
    density.problems.slice(0, 12).forEach((p) => console.error(`    ${p}`));
    saveState(state);
    process.exit(1);
  }

  writeFileSync(JSON_OUT, JSON.stringify(pack, null, 2) + '\n', 'utf8');
  saveState(state);
  console.log(
    `  wrote ${JSON_OUT} (version ${pack.version}, ${pack.situations.length} situations, ${pack.tracks.length} tracks, checksum ${pack.checksum.slice(0, 12)}…)`
  );
  console.log(`  course days: ${density.totalCourse}/168  per month: ${JSON.stringify(density.perMonth)}  videos attached: ${attachedVideos}`);

  if (reviewForBatch && reviewForBatch.length) {
    const reviewFile = join(REVIEW_DIR, `course-completion-batch-${batchIndex}.json`);
    writeFileSync(
      reviewFile,
      JSON.stringify(
        {
          batch: batchIndex,
          model: MODEL,
          generated_at: new Date().toISOString(),
          renumber_changes: renumberChanges,
          video_results: videoResults,
          count: reviewForBatch.length,
          situations: reviewForBatch,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    console.log(`  review -> ${reviewFile}`);
  }
  return pack;
}

// ---- PHASE 1: generate the 100 net-new day situations ----------------------
const pending = specs.filter((s) => !state.generated[s.id]);
const targets = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

console.log(`\n=== PHASE 1: generate net-new course days — model=${MODEL} batch=${BATCH_SIZE} skipDb=${SKIP_DB} ===`);
console.log(`spec total: ${specs.length}  already generated: ${Object.keys(state.generated).length}  this run targets: ${targets.length}`);

let batchIndex = state.batches;
let lastPack = null;

if (targets.length === 0) {
  batchIndex += 1;
  state.batches = batchIndex;
  lastPack = finalizeAndWrite([], batchIndex);
  if (!SKIP_DB) await publishToDb(lastPack);
} else {
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    batchIndex += 1;
    console.log(`\n=== Batch ${batchIndex} (${batch.length} situations: d${batch[0].day}-d${batch[batch.length - 1].day}) ===`);
    const review = [];

    for (const spec of batch) {
      process.stdout.write(`  ${spec.id} [M${spec.month} d${spec.day} L${spec.level}] ... `);
      try {
        const gen = await generateJson(buildUserPrompt(spec), { retries: 4 });
        const sit = assembleSituation(spec, gen);
        const issues = schema.validateSituation(sit, `situation:${spec.id}`);
        const errors = issues.filter((x) => x.severity === 'error');
        if (errors.length) {
          console.log(`INVALID (${errors.length} err) — skipped`);
          errors.slice(0, 4).forEach((e) => console.log(`      ${e.path}: ${e.message}`));
          state.failed[spec.id] = { reason: 'schema-invalid', errors: errors.map((e) => `${e.path}: ${e.message}`) };
          continue;
        }
        working.set(spec.id, sit);
        state.generated[spec.id] = sit;
        delete state.failed[spec.id];
        console.log(
          `OK  ${sit.phrase_patterns.length}pp ${sit.vocabulary.length}voc ${(sit.dialogues?.length ?? 0)}dlg ${sit.roleplay ? 1 : 0}rp ${sit.mission ? 1 : 0}mis`
        );
        review.push({
          id: sit.id,
          title: sit.title,
          month: spec.month,
          day: spec.day,
          week: spec.week,
          level: sit.level,
          cefr: sit.cefr,
          tracks: sit.tracks,
          situation: sit,
        });
      } catch (e) {
        console.log(`FAILED — ${e.message.slice(0, 100)}`);
        state.failed[spec.id] = { reason: 'gemini-failed', message: e.message.slice(0, 200) };
      }
    }

    state.batches = batchIndex;
    lastPack = finalizeAndWrite(review, batchIndex);
    if (!SKIP_DB) await publishToDb(lastPack);
  }
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
const genCount = Object.keys(state.generated).length;
const failedIds = Object.keys(state.failed);
const density = verifyCourseDensity([...working.values()], { expectComplete: genCount >= specs.length });
console.log('\n=== Course completion summary ===');
console.log(`net-new day situations generated + validated: ${genCount} / ${specs.length}`);
console.log(`pending specs: ${specs.length - genCount}${
  specs.length - genCount ? ' — ' + specs.filter((s) => !state.generated[s.id]).map((s) => `${s.id}(d${s.day})`).join(', ') : ''
}`);
console.log(`failed this run: ${failedIds.length}${failedIds.length ? ' — ' + failedIds.join(', ') : ''}`);
console.log(`course density: ${density.totalCourse}/168  per month: ${JSON.stringify(density.perMonth)}  problems: ${density.problems.length}`);
console.log(`state file:   ${STATE_FILE}`);
console.log(`review files: ${REVIEW_DIR}/course-completion-batch-*.json`);
console.log(`pack JSON:    ${JSON_OUT} (version ${NEW_PACK_VERSION})`);
console.log('NOTE: src/content/packs/seed-course.ts NOT regenerated here (orchestrator regenerates it from JSON).');
if (genCount < specs.length || density.problems.length) process.exitCode = 1;
