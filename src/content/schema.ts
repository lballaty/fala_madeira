// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/content/schema.ts
// Description: Modular content model for FalaMadeira — Situation / Track / ContentPack types
//              (per docs/CONTENT-ARCHITECTURE.md §2, §4, §8) plus a hand-rolled runtime
//              validator (JSON-schema-shaped: path + message issues) used by
//              scripts/validate-content.mjs and later by the Content Creation Studio.
//              Platform-neutral: no Node/browser-only APIs so it loads everywhere.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/** Bump when the content schema changes shape (packs record the version they target). */
export const CONTENT_SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Enumerations (CONTENT-ARCHITECTURE §4 levels, §8 voice types)
// ---------------------------------------------------------------------------

/** Practical, product-facing levels: L0 Tourist survival … L5 Integrated resident. */
export const PRACTICAL_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type PracticalLevel = (typeof PRACTICAL_LEVELS)[number];

/** CEFR background tagging only — the product speaks in practical levels. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/**
 * The 7 speaker/voice archetypes (CONTENT-ARCHITECTURE §8):
 * clear teacher, natural local, older, younger, service-worker,
 * phone-audio, noisy café/market. Realized via TTS voices now, recordings later.
 */
export const VOICE_TYPES = [
  'teacher',
  'local',
  'older',
  'younger',
  'service',
  'phone',
  'noisy',
] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

/**
 * Register of a word/phrase/variant. Address-form guidance (tu / você /
 * o senhor) lives in docs/CONTENT-STANDARDS.md; this enum captures the
 * broader formality dimension used for selection and display.
 */
export const REGISTERS = ['informal', 'neutral', 'formal'] as const;
export type Register = (typeof REGISTERS)[number];

/** Mastery dimensions for adaptive review (CONTENT-ARCHITECTURE §6). */
export const REVIEW_DIMENSIONS = ['hear', 'say', 'retrieve', 'avoid'] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

/** Roleplay difficulty: L1 fully guided → L5 messy real-life. */
export const ROLEPLAY_DIFFICULTIES = [1, 2, 3, 4, 5] as const;
export type RoleplayDifficulty = (typeof ROLEPLAY_DIFFICULTIES)[number];

/** Lesson categories carried over from the legacy course (src/types.ts Lesson). */
export const COURSE_CATEGORIES = ['daily', 'social', 'travel', 'work', 'custom'] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const MEDIA_TYPES = ['audio', 'video', 'image'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

// Aligned with the DB CHECK on content_packs.status (00006_content_model.sql):
// draft | published | deprecated | archived. 'deprecated' and 'archived' are
// treated as synonyms for now (see the migration's NB comment).
export const PACK_STATUSES = ['draft', 'published', 'deprecated', 'archived'] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Situation building blocks (CONTENT-ARCHITECTURE §2.1; §3 maps field → engine)
// ---------------------------------------------------------------------------

/** A substitution slot inside a phrase pattern's base text, referenced as {name}. */
export interface PatternSlot {
  /** Slot name; the base phrase references it as `{name}`. */
  name: string;
  description?: string;
  /** Substitution options drilled by the Pattern Builder (tomorrow→today→Friday…). */
  options: string[];
}

/** A ready-made variant of the base phrase (different register, person, politeness). */
export interface PatternVariant {
  text: string;
  translation?: string;
  register?: Register;
  note?: string;
}

/** Base phrase + substitution slots + variants → consumed by the Pattern Builder. */
export interface PhrasePattern {
  id: string;
  /** The base phrase in European Portuguese; may contain `{slot}` markers. */
  base: string;
  translation?: string;
  slots?: PatternSlot[];
  variants?: PatternVariant[];
}

/** Word/phrase entry → vocabulary drills, review derivation. */
export interface VocabularyItem {
  word: string;
  translation: string;
  pronunciation?: string;
  register?: Register;
  note?: string;
}

/** One line in a multi-speaker dialogue → consumed by the Listening Engine. */
export interface DialogueLine {
  /** Display name / role of the speaker (e.g. "Empregado", "Ana"). */
  speaker: string;
  /** One of the 7 voice archetypes; drives TTS voice + audio treatment. */
  voice_type: VoiceType;
  /** European Portuguese text of the line. */
  text: string;
  translation?: string;
}

/** A multi-speaker script (slow/normal/natural renderings are an engine concern). */
export interface Dialogue {
  id: string;
  title?: string;
  /** Scene-setting: where, who, what is going on. */
  context?: string;
  lines: DialogueLine[];
}

/** Social code / register / indirectness explainer → Cultural Context Layer. */
export interface CulturalNote {
  id?: string;
  title: string;
  body: string;
}

/** One choice the learner can take at a roleplay node. */
export interface RoleplayOption {
  /** What the learner says (European Portuguese). */
  text: string;
  translation?: string;
  /** Id of the next node; omit to end the conversation on this branch. */
  next?: string;
  /** Coaching feedback shown after choosing this option. */
  feedback?: string;
}

/** One NPC turn + the learner's branching choices. */
export interface RoleplayNode {
  id: string;
  /** What the other party says (European Portuguese). */
  npc_text: string;
  npc_translation?: string;
  /** Voice archetype for the NPC line (defaults to 'local' if omitted). */
  npc_voice_type?: VoiceType;
  options: RoleplayOption[];
}

/** Branching conversation script → Situation Simulator (difficulty L1 guided → L5 messy). */
export interface Roleplay {
  /** Scene description shown before starting. */
  scenario: string;
  difficulty: RoleplayDifficulty;
  /** Id of the node the conversation starts at. */
  entry_node: string;
  nodes: RoleplayNode[];
}

/** Real-world assignment → Real-World Missions engine. */
export interface Mission {
  title: string;
  /** What to rehearse before doing it for real. */
  prep: string[];
  /** Escape hatches when it goes sideways (European Portuguese). */
  fallback_phrases: string[];
  /** What the other party will probably say (European Portuguese). */
  likely_responses: string[];
}

/** Derived recall/pronunciation/listening item → Adaptive Review (SM-2 substrate). */
export interface ReviewItem {
  id: string;
  /** Weakest-dimension targeting: hear | say | retrieve | avoid (§6). */
  dimension: ReviewDimension;
  prompt: string;
  answer?: string;
  /** Optional pointer back to the source (pattern id, vocab word, dialogue id). */
  source_ref?: string;
}

/** Optional real audio/video reference. */
export interface MediaRef {
  type: MediaType;
  url: string;
  caption?: string;
}

/**
 * Structured-course placement (path type 1, CONTENT-ARCHITECTURE §5).
 * Carries the legacy month/day calendar position so the seed lessons keep
 * their strict ordering inside the Structured Course path.
 */
export interface CourseSlot {
  /** 1-based month in the structured course (legacy Lesson.level). */
  month: number;
  /** 1-based absolute day in the structured course (legacy Lesson.day). */
  day: number;
  category?: CourseCategory;
  /** Original lesson id (e.g. 'd42') for traceability during/after migration. */
  legacy_lesson_id?: string;
}

// ---------------------------------------------------------------------------
// Situation — the atomic content unit (§2.1)
// ---------------------------------------------------------------------------

export interface Situation {
  id: string;
  title: string;
  summary: string;
  /** Track ids this situation serves (many-to-many). */
  tracks: string[];
  /** Practical level 0–5 (§4). */
  level: PracticalLevel;
  /** CEFR background tag (A1–B2). */
  cefr: CefrLevel;
  /** Recommendation hints ONLY — never hard locks (§5). Situation ids. */
  soft_prerequisites?: string[];
  phrase_patterns: PhrasePattern[];
  vocabulary: VocabularyItem[];
  dialogues?: Dialogue[];
  cultural_notes?: CulturalNote[];
  roleplay?: Roleplay;
  mission?: Mission;
  review_items?: ReviewItem[];
  media?: MediaRef[];
  /** Learner-facing objectives (seed lessons carry these as `goals`). */
  goals?: string[];
  /** Placement in the Structured Course path (seed lessons carry month/day). */
  course?: CourseSlot;
}

// ---------------------------------------------------------------------------
// Track — goal-oriented ordered collection (§2.2)
// ---------------------------------------------------------------------------

export interface Track {
  id: string;
  name: string;
  /** The life-goal this track serves (e.g. "Run a rental property in Madeira"). */
  goal: string;
  description?: string;
  /** Ordered situation ids (curation order; soft, never a hard gate). */
  situations: string[];
}

// ---------------------------------------------------------------------------
// ContentPack — the shippable, versioned modular unit (§2.3)
// ---------------------------------------------------------------------------

export interface ContentPack {
  id: string;
  name: string;
  /** Pack version (e.g. "1.0.0"); devices use it to detect updates (§10). */
  version: string;
  /** Schema version this pack was authored against. */
  schema_version?: string;
  status?: PackStatus;
  /** sha256 hex of canonicalPackPayload(pack); computed/verified at publish time. */
  checksum?: string;
  situations: Situation[];
  tracks?: Track[];
}

// ---------------------------------------------------------------------------
// Runtime validation (hand-rolled, JSON-schema-shaped issues: path + message)
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** JSON-pointer-ish path, e.g. "situations[3].dialogues[0].lines[2].voice_type". */
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

type Issues = ValidationIssue[];

const err = (path: string, message: string): ValidationIssue => ({ path, message, severity: 'error' });
const warn = (path: string, message: string): ValidationIssue => ({ path, message, severity: 'warning' });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkString(out: Issues, obj: Record<string, unknown>, key: string, path: string, required: boolean): void {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (required) out.push(err(`${path}.${key}`, `missing required string "${key}"`));
    return;
  }
  if (typeof v !== 'string' || v.trim() === '') {
    out.push(err(`${path}.${key}`, `"${key}" must be a non-empty string`));
  }
}

function checkStringArray(out: Issues, obj: Record<string, unknown>, key: string, path: string, required: boolean): void {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (required) out.push(err(`${path}.${key}`, `missing required array "${key}"`));
    return;
  }
  if (!Array.isArray(v)) {
    out.push(err(`${path}.${key}`, `"${key}" must be an array of strings`));
    return;
  }
  v.forEach((item, i) => {
    if (typeof item !== 'string' || item.trim() === '') {
      out.push(err(`${path}.${key}[${i}]`, 'must be a non-empty string'));
    }
  });
}

function checkEnum(
  out: Issues,
  obj: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly (string | number)[],
  required: boolean
): void {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (required) out.push(err(`${path}.${key}`, `missing required "${key}" (one of: ${allowed.join(', ')})`));
    return;
  }
  if (!allowed.includes(v as string | number)) {
    out.push(err(`${path}.${key}`, `"${String(v)}" is not one of: ${allowed.join(', ')}`));
  }
}

// --- sub-validators --------------------------------------------------------

export function validatePhrasePattern(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'phrase pattern must be an object')];
  checkString(out, value, 'id', path, true);
  checkString(out, value, 'base', path, true);
  const slots = value.slots;
  if (slots !== undefined) {
    if (!Array.isArray(slots)) {
      out.push(err(`${path}.slots`, 'slots must be an array'));
    } else {
      const base = typeof value.base === 'string' ? value.base : '';
      slots.forEach((slot, i) => {
        const sp = `${path}.slots[${i}]`;
        if (!isRecord(slot)) {
          out.push(err(sp, 'slot must be an object'));
          return;
        }
        checkString(out, slot, 'name', sp, true);
        checkStringArray(out, slot, 'options', sp, true);
        if (Array.isArray(slot.options) && slot.options.length === 0) {
          out.push(err(`${sp}.options`, 'slot must offer at least one substitution option'));
        }
        if (typeof slot.name === 'string' && base !== '' && !base.includes(`{${slot.name}}`)) {
          out.push(warn(`${sp}.name`, `base phrase does not reference slot "{${slot.name}}"`));
        }
      });
    }
  }
  const variants = value.variants;
  if (variants !== undefined) {
    if (!Array.isArray(variants)) {
      out.push(err(`${path}.variants`, 'variants must be an array'));
    } else {
      variants.forEach((variant, i) => {
        const vp = `${path}.variants[${i}]`;
        if (!isRecord(variant)) {
          out.push(err(vp, 'variant must be an object'));
          return;
        }
        checkString(out, variant, 'text', vp, true);
        checkEnum(out, variant, 'register', vp, REGISTERS, false);
      });
    }
  }
  return out;
}

export function validateVocabularyItem(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'vocabulary item must be an object')];
  checkString(out, value, 'word', path, true);
  checkString(out, value, 'translation', path, true);
  checkEnum(out, value, 'register', path, REGISTERS, false);
  return out;
}

export function validateDialogue(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'dialogue must be an object')];
  checkString(out, value, 'id', path, true);
  const lines = value.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    out.push(err(`${path}.lines`, 'dialogue must have a non-empty lines array'));
    return out;
  }
  lines.forEach((line, i) => {
    const lp = `${path}.lines[${i}]`;
    if (!isRecord(line)) {
      out.push(err(lp, 'dialogue line must be an object'));
      return;
    }
    checkString(out, line, 'speaker', lp, true);
    checkString(out, line, 'text', lp, true);
    checkEnum(out, line, 'voice_type', lp, VOICE_TYPES, true);
  });
  return out;
}

export function validateCulturalNote(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'cultural note must be an object')];
  checkString(out, value, 'title', path, true);
  checkString(out, value, 'body', path, true);
  return out;
}

export function validateRoleplay(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'roleplay must be an object')];
  checkString(out, value, 'scenario', path, true);
  checkEnum(out, value, 'difficulty', path, ROLEPLAY_DIFFICULTIES, true);
  checkString(out, value, 'entry_node', path, true);
  const nodes = value.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    out.push(err(`${path}.nodes`, 'roleplay must have a non-empty nodes array'));
    return out;
  }
  const nodeIds = new Set<string>();
  nodes.forEach((node, i) => {
    const np = `${path}.nodes[${i}]`;
    if (!isRecord(node)) {
      out.push(err(np, 'roleplay node must be an object'));
      return;
    }
    checkString(out, node, 'id', np, true);
    checkString(out, node, 'npc_text', np, true);
    checkEnum(out, node, 'npc_voice_type', np, VOICE_TYPES, false);
    if (typeof node.id === 'string') {
      if (nodeIds.has(node.id)) out.push(err(`${np}.id`, `duplicate roleplay node id "${node.id}"`));
      nodeIds.add(node.id);
    }
    const options = node.options;
    if (!Array.isArray(options)) {
      out.push(err(`${np}.options`, 'node must have an options array (may be empty for terminal NPC lines)'));
      return;
    }
    options.forEach((opt, j) => {
      const op = `${np}.options[${j}]`;
      if (!isRecord(opt)) {
        out.push(err(op, 'roleplay option must be an object'));
        return;
      }
      checkString(out, opt, 'text', op, true);
      checkString(out, opt, 'next', op, false);
    });
  });
  // Branch integrity: entry node exists, every `next` resolves.
  if (typeof value.entry_node === 'string' && !nodeIds.has(value.entry_node)) {
    out.push(err(`${path}.entry_node`, `entry_node "${value.entry_node}" does not match any node id`));
  }
  nodes.forEach((node, i) => {
    if (!isRecord(node) || !Array.isArray(node.options)) return;
    node.options.forEach((opt, j) => {
      if (isRecord(opt) && typeof opt.next === 'string' && !nodeIds.has(opt.next)) {
        out.push(err(`${path}.nodes[${i}].options[${j}].next`, `next "${opt.next}" does not match any node id`));
      }
    });
  });
  return out;
}

export function validateMission(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'mission must be an object')];
  checkString(out, value, 'title', path, true);
  checkStringArray(out, value, 'prep', path, true);
  checkStringArray(out, value, 'fallback_phrases', path, true);
  checkStringArray(out, value, 'likely_responses', path, true);
  return out;
}

export function validateReviewItem(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'review item must be an object')];
  checkString(out, value, 'id', path, true);
  checkEnum(out, value, 'dimension', path, REVIEW_DIMENSIONS, true);
  checkString(out, value, 'prompt', path, true);
  return out;
}

export function validateMediaRef(value: unknown, path: string): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'media ref must be an object')];
  checkEnum(out, value, 'type', path, MEDIA_TYPES, true);
  checkString(out, value, 'url', path, true);
  return out;
}

// --- Situation / Track / Pack validators -----------------------------------

export function validateSituation(value: unknown, path = 'situation'): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'situation must be an object')];

  checkString(out, value, 'id', path, true);
  checkString(out, value, 'title', path, true);
  checkString(out, value, 'summary', path, true);
  checkStringArray(out, value, 'tracks', path, true);
  checkEnum(out, value, 'level', path, PRACTICAL_LEVELS, true);
  checkEnum(out, value, 'cefr', path, CEFR_LEVELS, true);
  checkStringArray(out, value, 'soft_prerequisites', path, false);
  checkStringArray(out, value, 'goals', path, false);

  if (Array.isArray(value.tracks) && value.tracks.length === 0) {
    out.push(warn(`${path}.tracks`, 'situation is not assigned to any track'));
  }

  const eachOf = (
    key: string,
    required: boolean,
    fn: (v: unknown, p: string) => Issues
  ): void => {
    const arr = value[key];
    if (arr === undefined || arr === null) {
      if (required) out.push(err(`${path}.${key}`, `missing required array "${key}"`));
      return;
    }
    if (!Array.isArray(arr)) {
      out.push(err(`${path}.${key}`, `"${key}" must be an array`));
      return;
    }
    arr.forEach((item, i) => out.push(...fn(item, `${path}.${key}[${i}]`)));
  };

  eachOf('phrase_patterns', true, validatePhrasePattern);
  eachOf('vocabulary', true, validateVocabularyItem);
  eachOf('dialogues', false, validateDialogue);
  eachOf('cultural_notes', false, validateCulturalNote);
  eachOf('review_items', false, validateReviewItem);
  eachOf('media', false, validateMediaRef);

  if (value.roleplay !== undefined && value.roleplay !== null) {
    out.push(...validateRoleplay(value.roleplay, `${path}.roleplay`));
  }
  if (value.mission !== undefined && value.mission !== null) {
    out.push(...validateMission(value.mission, `${path}.mission`));
  }
  if (value.course !== undefined && value.course !== null) {
    const cp = `${path}.course`;
    if (!isRecord(value.course)) {
      out.push(err(cp, 'course must be an object'));
    } else {
      const { month, day } = value.course;
      if (typeof month !== 'number' || !Number.isInteger(month) || month < 1) {
        out.push(err(`${cp}.month`, 'month must be a positive integer'));
      }
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 1) {
        out.push(err(`${cp}.day`, 'day must be a positive integer'));
      }
      checkEnum(out, value.course, 'category', cp, COURSE_CATEGORIES, false);
    }
  }

  // "A Situation must be practiceable by multiple modes from its own data"
  // (§2.1 design rule). Count the mode-feeding fields that carry data.
  const modeFeeds = [
    Array.isArray(value.phrase_patterns) && value.phrase_patterns.length > 0,
    Array.isArray(value.vocabulary) && value.vocabulary.length > 0,
    Array.isArray(value.dialogues) && value.dialogues.length > 0,
    Array.isArray(value.cultural_notes) && value.cultural_notes.length > 0,
    isRecord(value.roleplay),
    isRecord(value.mission),
    Array.isArray(value.review_items) && value.review_items.length > 0,
  ].filter(Boolean).length;
  if (modeFeeds < 2) {
    out.push(
      warn(
        path,
        'situation feeds fewer than 2 practice modes (phrase_patterns/vocabulary/dialogues/cultural_notes/roleplay/mission/review_items) — a good Situation is practiceable by multiple modes'
      )
    );
  }

  return out;
}

export function validateTrack(value: unknown, path = 'track'): Issues {
  const out: Issues = [];
  if (!isRecord(value)) return [err(path, 'track must be an object')];
  checkString(out, value, 'id', path, true);
  checkString(out, value, 'name', path, true);
  checkString(out, value, 'goal', path, true);
  checkStringArray(out, value, 'situations', path, true);
  return out;
}

/**
 * Validate a full content pack: shape of every situation/track, plus pack
 * integrity — unique ids, version present, track↔situation refs resolve,
 * duplicate roleplay/dialogue ids, soft prerequisites resolvable (warning).
 */
export function validateContentPack(value: unknown): ValidationResult {
  const out: Issues = [];
  const path = 'pack';

  if (!isRecord(value)) {
    return finalize([err(path, 'content pack must be an object')]);
  }

  checkString(out, value, 'id', path, true);
  checkString(out, value, 'name', path, true);
  checkString(out, value, 'version', path, true);
  checkString(out, value, 'schema_version', path, false);
  checkEnum(out, value, 'status', path, PACK_STATUSES, false);
  checkString(out, value, 'checksum', path, false);

  const situations = value.situations;
  if (!Array.isArray(situations)) {
    out.push(err(`${path}.situations`, 'pack must have a situations array'));
    return finalize(out);
  }
  if (situations.length === 0) {
    out.push(err(`${path}.situations`, 'pack must contain at least one situation'));
  }

  const situationIds = new Set<string>();
  situations.forEach((s, i) => {
    out.push(...validateSituation(s, `${path}.situations[${i}]`));
    if (isRecord(s) && typeof s.id === 'string') {
      if (situationIds.has(s.id)) {
        out.push(err(`${path}.situations[${i}].id`, `duplicate situation id "${s.id}"`));
      }
      situationIds.add(s.id);
    }
  });

  const tracks = value.tracks;
  const trackIds = new Set<string>();
  if (tracks !== undefined && tracks !== null) {
    if (!Array.isArray(tracks)) {
      out.push(err(`${path}.tracks`, 'tracks must be an array'));
    } else {
      tracks.forEach((t, i) => {
        out.push(...validateTrack(t, `${path}.tracks[${i}]`));
        if (isRecord(t) && typeof t.id === 'string') {
          if (trackIds.has(t.id)) {
            out.push(err(`${path}.tracks[${i}].id`, `duplicate track id "${t.id}"`));
          }
          trackIds.add(t.id);
        }
      });
      // Track → situation refs must resolve within the pack.
      tracks.forEach((t, i) => {
        if (!isRecord(t) || !Array.isArray(t.situations)) return;
        t.situations.forEach((ref, j) => {
          if (typeof ref === 'string' && !situationIds.has(ref)) {
            out.push(
              err(`${path}.tracks[${i}].situations[${j}]`, `situation ref "${ref}" not found in pack`)
            );
          }
        });
      });
    }
  }

  // Situation → track refs: error if the pack declares tracks and the ref is
  // missing; warning if the pack declares no tracks (ref may live in another pack).
  situations.forEach((s, i) => {
    if (!isRecord(s) || !Array.isArray(s.tracks)) return;
    s.tracks.forEach((ref, j) => {
      if (typeof ref !== 'string') return;
      if (trackIds.size > 0 && !trackIds.has(ref)) {
        out.push(err(`${path}.situations[${i}].tracks[${j}]`, `track ref "${ref}" not found in pack`));
      } else if (trackIds.size === 0) {
        out.push(
          warn(
            `${path}.situations[${i}].tracks[${j}]`,
            `track ref "${ref}" cannot be resolved (pack declares no tracks) — ensure it exists elsewhere`
          )
        );
      }
    });
    // Soft prerequisites should usually resolve in-pack; cross-pack is allowed → warning.
    if (Array.isArray(s.soft_prerequisites)) {
      s.soft_prerequisites.forEach((ref, j) => {
        if (typeof ref === 'string' && !situationIds.has(ref)) {
          out.push(
            warn(
              `${path}.situations[${i}].soft_prerequisites[${j}]`,
              `soft prerequisite "${ref}" not found in pack (cross-pack refs allowed but check spelling)`
            )
          );
        }
      });
    }
  });

  return finalize(out);
}

function finalize(issues: Issues): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Canonical payload for checksums (§2.3 / §10 pack integrity)
// ---------------------------------------------------------------------------

/** Deterministic JSON.stringify with recursively sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

/**
 * The canonical string a pack checksum is computed over (sha256 hex of this
 * string). Excludes `checksum` and `status` so publishing state changes do
 * not invalidate content integrity. Hashing itself is done by the caller
 * (Node script / edge function) — this module stays platform-neutral.
 */
export function canonicalPackPayload(pack: ContentPack): string {
  return stableStringify({
    id: pack.id,
    name: pack.name,
    version: pack.version,
    schema_version: pack.schema_version ?? CONTENT_SCHEMA_VERSION,
    situations: pack.situations,
    tracks: pack.tracks ?? [],
  });
}
