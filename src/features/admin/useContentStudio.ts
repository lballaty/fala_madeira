// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/useContentStudio.ts
// Description: Content Creation Studio logic (A12/admin; docs/CONTENT-ARCHITECTURE.md §8). A real
//   authoring loop over the modular content model (src/content/schema.ts): load the admin-visible
//   packs (including drafts) via a direct RLS-gated select, pick/create/edit a Situation through a
//   flat form (scalar fields) + JSON textareas (nested enrichable fields), VALIDATE with the
//   schema's own validateSituation / validateContentPack (no re-implemented rules), and PUBLISH —
//   upsert content_packs + situations (+ tracks) rows under admin RLS (migration 00006), stamping
//   the pack version, schema_version, checksum (sha256 hex of canonicalPackPayload), and status.
//   Publishing a pack rebuilds its projected situations rows so the queryable projection stays in
//   sync with the authoritative payload. Every failure routes through src/lib/logger with
//   correlation IDs + handleSupabaseError; missing config fails loudly (no hardcoded fallback).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ShowToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import {
  CONTENT_SCHEMA_VERSION,
  ContentPack,
  PRACTICAL_LEVELS,
  CEFR_LEVELS,
  Situation,
  ValidationIssue,
  canonicalPackPayload,
  validateContentPack,
  validateSituation,
} from '../../content/schema';

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/**
 * Browser-safe sha256 hex over the canonical pack payload (matches
 * src/content/repository.ts packChecksum). Returns null when crypto.subtle is
 * unavailable (non-secure context) — publish records null rather than a wrong hash.
 */
const packChecksum = async (pack: ContentPack): Promise<string | null> => {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalPackPayload(pack)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// Row shape of public.content_packs (admin select includes drafts).
interface ContentPackRow {
  id: string;
  name: string;
  version: string;
  schema_version: string | null;
  status: string | null;
  checksum: string | null;
  payload: unknown;
}

const looksLikePack = (value: unknown): value is ContentPack => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.version === 'string' && Array.isArray(v.situations);
};

/**
 * The editable form state for a single Situation. Scalar fields are flat; the
 * complex nested arrays/objects are edited as JSON text and parsed on validate.
 */
export interface SituationDraft {
  id: string;
  title: string;
  summary: string;
  level: number;
  cefr: string;
  /** Comma-separated track ids. */
  tracksCsv: string;
  /** Newline-separated goals. */
  goalsText: string;
  /** JSON array text. */
  phrasePatternsJson: string;
  /** JSON array text. */
  vocabularyJson: string;
  /** JSON array text (optional; empty = omit). */
  culturalNotesJson: string;
}

const emptyDraft = (): SituationDraft => ({
  id: '',
  title: '',
  summary: '',
  level: 0,
  cefr: 'A1',
  tracksCsv: '',
  goalsText: '',
  phrasePatternsJson: '[]',
  vocabularyJson: '[]',
  culturalNotesJson: '[]',
});

const pretty = (value: unknown): string => JSON.stringify(value ?? [], null, 2);

/** Load an existing Situation into the flat/JSON draft form. */
const situationToDraft = (s: Situation): SituationDraft => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  level: s.level,
  cefr: s.cefr,
  tracksCsv: (s.tracks ?? []).join(', '),
  goalsText: (s.goals ?? []).join('\n'),
  phrasePatternsJson: pretty(s.phrase_patterns),
  vocabularyJson: pretty(s.vocabulary),
  culturalNotesJson: pretty(s.cultural_notes ?? []),
});

interface DraftBuildResult {
  situation: Situation | null;
  issues: ValidationIssue[];
}

/**
 * Turn the draft form into a candidate Situation and validate it with the
 * schema's own validateSituation. JSON parse failures surface as issues on the
 * offending field (so the studio shows them inline like any other error).
 */
const buildAndValidateDraft = (draft: SituationDraft): DraftBuildResult => {
  const issues: ValidationIssue[] = [];
  const parseJson = (text: string, field: string): unknown => {
    const trimmed = text.trim();
    if (trimmed === '') return [];
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      issues.push({
        path: `situation.${field}`,
        message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
      return undefined;
    }
  };

  const phrase_patterns = parseJson(draft.phrasePatternsJson, 'phrase_patterns');
  const vocabulary = parseJson(draft.vocabularyJson, 'vocabulary');
  const cultural_notes = parseJson(draft.culturalNotesJson, 'cultural_notes');

  const tracks = draft.tracksCsv
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const goals = draft.goalsText
    .split('\n')
    .map((g) => g.trim())
    .filter(Boolean);

  const candidate: Record<string, unknown> = {
    id: draft.id.trim(),
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    level: draft.level,
    cefr: draft.cefr,
    tracks,
    phrase_patterns,
    vocabulary,
  };
  if (goals.length > 0) candidate.goals = goals;
  if (Array.isArray(cultural_notes) && cultural_notes.length > 0) candidate.cultural_notes = cultural_notes;

  // Run the schema validator regardless (it reports the missing/malformed pieces),
  // then merge any JSON-parse issues so both surface together.
  const schemaIssues = validateSituation(candidate, 'situation');
  const allIssues = [...issues, ...schemaIssues];

  const hasError = allIssues.some((i) => i.severity === 'error');
  return { situation: hasError ? null : (candidate as unknown as Situation), issues: allIssues };
};

interface ContentStudioDeps {
  supabase: SupabaseClient | null;
  isAdmin: boolean;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

export interface ContentStudioState {
  packs: ContentPack[];
  isLoading: boolean;
  isPublishing: boolean;
  selectedPackId: string | null;
  selectPack: (packId: string | null) => void;
  selectedPack: ContentPack | null;
  draft: SituationDraft;
  setDraftField: <K extends keyof SituationDraft>(key: K, value: SituationDraft[K]) => void;
  /** Load an existing situation from the selected pack into the draft form. */
  editSituation: (situationId: string) => void;
  /** Reset the draft to a blank new-situation form. */
  newSituation: () => void;
  /** Validate the current draft (schema validators); populates `issues`. Returns validity. */
  validateDraft: () => boolean;
  issues: ValidationIssue[];
  refresh: () => Promise<void>;
  /**
   * Publish: fold the validated draft into the selected pack (or a new pack),
   * validate the whole pack, then upsert content_packs + situations (+ tracks).
   */
  publish: (opts: { publishStatus: 'draft' | 'published' }) => Promise<void>;
  levels: readonly number[];
  cefrLevels: readonly string[];
}

export const useContentStudio = ({
  supabase,
  isAdmin,
  showToast,
  handleSupabaseError,
}: ContentStudioDeps): ContentStudioState => {
  const [packs, setPacks] = useState<ContentPack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SituationDraft>(emptyDraft);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const refresh = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    const correlationId = newCorrelationId();
    setIsLoading(true);
    try {
      // Admin RLS (00006) grants SELECT on all packs including drafts.
      const { data, error } = await supabase
        .from('content_packs')
        .select('id, name, version, schema_version, status, checksum, payload');
      if (error) throw error;

      const loaded: ContentPack[] = [];
      for (const row of (data ?? []) as ContentPackRow[]) {
        if (looksLikePack(row.payload)) {
          loaded.push(row.payload);
        } else {
          logger.warn('CONTENT_STUDIO_PACK_NO_PAYLOAD', `pack "${row.id}" has no usable payload — showing shell`, {
            category: 'DATA_PROCESSING',
            correlationId,
            details: { packId: row.id },
          });
          loaded.push({ id: row.id, name: row.name, version: row.version, situations: [], tracks: [] });
        }
      }
      setPacks(loaded);
      logger.info('CONTENT_STUDIO_LOADED', `content studio loaded ${loaded.length} pack(s)`, {
        category: 'DATA_PROCESSING',
        correlationId,
        details: { packIds: loaded.map((p) => p.id) },
      });
    } catch (error) {
      logger.error('CONTENT_STUDIO_LOAD_FAILED', 'could not load packs for the content studio', {
        category: 'DATA_PROCESSING',
        correlationId,
        error,
      });
      handleSupabaseError(error, 'refresh', 'content_packs');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, isAdmin, handleSupabaseError]);

  // Initial load on becoming admin. State updates live in refresh's promise callbacks
  // (deferred via a microtask) so no setState fires synchronously in the effect body.
  useEffect(() => {
    if (!isAdmin) return;
    void Promise.resolve().then(() => refresh());
  }, [isAdmin, refresh]);

  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) ?? null,
    [packs, selectedPackId],
  );

  const selectPack = useCallback((packId: string | null) => {
    setSelectedPackId(packId);
    setIssues([]);
  }, []);

  const setDraftField = useCallback(
    <K extends keyof SituationDraft>(key: K, value: SituationDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const editSituation = useCallback(
    (situationId: string) => {
      const situation = selectedPack?.situations.find((s) => s.id === situationId);
      if (!situation) {
        showToast('Situation not found in pack', 'error');
        return;
      }
      setDraft(situationToDraft(situation));
      setIssues([]);
    },
    [selectedPack, showToast],
  );

  const newSituation = useCallback(() => {
    setDraft(emptyDraft());
    setIssues([]);
  }, []);

  const validateDraft = useCallback((): boolean => {
    const { issues: found } = buildAndValidateDraft(draft);
    setIssues(found);
    const ok = !found.some((i) => i.severity === 'error');
    showToast(ok ? 'Situation is valid' : 'Situation has validation errors', ok ? 'success' : 'error');
    return ok;
  }, [draft, showToast]);

  const publish = useCallback(
    async ({ publishStatus }: { publishStatus: 'draft' | 'published' }) => {
      if (!supabase) {
        logger.error('CONTENT_STUDIO_NO_CLIENT', 'cannot publish: Supabase client unavailable', {
          category: 'DATA_PROCESSING',
        });
        showToast('Not connected — cannot publish', 'error');
        return;
      }
      const pack = selectedPack;
      if (!pack) {
        showToast('Select a pack to publish into', 'error');
        return;
      }

      const correlationId = newCorrelationId();
      // 1. Build + validate the situation draft with the schema validator.
      const { situation, issues: draftIssues } = buildAndValidateDraft(draft);
      setIssues(draftIssues);
      if (!situation) {
        showToast('Fix the situation errors before publishing', 'error');
        return;
      }

      // 2. Fold the situation into the pack (replace by id, else append).
      const nextSituations = (() => {
        const idx = pack.situations.findIndex((s) => s.id === situation.id);
        if (idx === -1) return [...pack.situations, situation];
        const copy = [...pack.situations];
        copy[idx] = situation;
        return copy;
      })();

      const nextPack: ContentPack = {
        ...pack,
        schema_version: pack.schema_version ?? CONTENT_SCHEMA_VERSION,
        situations: nextSituations,
        tracks: pack.tracks ?? [],
        status: publishStatus,
      };

      // 3. Validate the whole pack (unique ids, track/situation ref integrity, …).
      const packValidation = validateContentPack(nextPack);
      if (!packValidation.valid) {
        setIssues([...draftIssues, ...packValidation.errors, ...packValidation.warnings]);
        logger.warn('CONTENT_STUDIO_PACK_INVALID', `pack "${nextPack.id}" failed validation — publish blocked`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { packId: nextPack.id, errors: packValidation.errors.slice(0, 10) },
        });
        showToast('Pack has validation errors — see below', 'error');
        return;
      }

      setIsPublishing(true);
      try {
        const checksum = await packChecksum(nextPack);

        // 4a. Upsert the authoritative pack row (payload + checksum + status).
        const { error: packError } = await supabase.from('content_packs').upsert({
          id: nextPack.id,
          name: nextPack.name,
          version: nextPack.version,
          schema_version: nextPack.schema_version,
          status: nextPack.status,
          checksum,
          payload: nextPack,
        });
        if (packError) throw packError;

        // 4b. Rebuild the projected situations rows for this pack (queryable projection).
        const situationRows = nextPack.situations.map((s) => ({
          id: s.id,
          pack_id: nextPack.id,
          payload: s,
          level: s.level,
          cefr: s.cefr,
          tracks: s.tracks,
          course_month: s.course?.month ?? null,
          course_day: s.course?.day ?? null,
        }));
        const { error: sitError } = await supabase.from('situations').upsert(situationRows);
        if (sitError) throw sitError;

        // 4c. Rebuild the projected tracks rows (if any).
        if ((nextPack.tracks ?? []).length > 0) {
          const trackRows = (nextPack.tracks ?? []).map((t) => ({
            id: t.id,
            pack_id: nextPack.id,
            name: t.name,
            goal: t.goal,
            situation_ids: t.situations,
            payload: t,
          }));
          const { error: trackError } = await supabase.from('tracks').upsert(trackRows);
          if (trackError) throw trackError;
        }

        // Reflect the published pack in local state.
        setPacks((prev) => prev.map((p) => (p.id === nextPack.id ? nextPack : p)));
        logger.info('CONTENT_STUDIO_PUBLISHED', `pack "${nextPack.id}" published (${publishStatus})`, {
          category: 'USER_ACTION',
          correlationId,
          details: {
            packId: nextPack.id,
            status: publishStatus,
            situationId: situation.id,
            situationCount: nextPack.situations.length,
            checksum,
          },
        });
        showToast(
          publishStatus === 'published' ? 'Pack published' : 'Draft saved',
          'success',
        );
      } catch (error) {
        logger.error('CONTENT_STUDIO_PUBLISH_FAILED', `failed to publish pack "${nextPack.id}"`, {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
          details: { packId: nextPack.id, status: publishStatus },
        });
        handleSupabaseError(error, 'publish', 'content_packs');
      } finally {
        setIsPublishing(false);
      }
    },
    [supabase, selectedPack, draft, showToast, handleSupabaseError],
  );

  return {
    packs,
    isLoading,
    isPublishing,
    selectedPackId,
    selectPack,
    selectedPack,
    draft,
    setDraftField,
    editSituation,
    newSituation,
    validateDraft,
    issues,
    refresh,
    publish,
    levels: PRACTICAL_LEVELS,
    cefrLevels: CEFR_LEVELS,
  };
};
