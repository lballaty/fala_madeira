// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/ContentStudio.tsx
// Description: Content Creation Studio UI (A12/admin; docs/CONTENT-ARCHITECTURE.md §8). Drives the
//   useContentStudio authoring loop: pick a pack (drafts included), pick a situation to edit or
//   start a new one, edit scalar fields inline + nested enrichable fields (phrase_patterns,
//   vocabulary, cultural_notes) as JSON textareas, VALIDATE (schema validators, errors/warnings
//   shown inline), and PUBLISH (save draft or publish) which upserts the versioned pack + its
//   projected situations/tracks under admin RLS. Presentational only: all logic in useContentStudio.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { AlertTriangle, CheckCircle2, FilePlus2, RefreshCw, Save, Upload } from 'lucide-react';
import { ContentStudioState } from './useContentStudio';
import { ValidationIssue } from '../../content/schema';

interface ContentStudioProps {
  studio: ContentStudioState;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-bold text-ios-gray uppercase tracking-wide">{label}</span>
    {children}
  </label>
);

const inputClass =
  'w-full text-sm px-3 py-2 bg-ios-bg rounded-lg border border-transparent focus:border-ios-blue focus:outline-none';
const jsonClass = `${inputClass} font-mono text-xs`;

const IssueList = ({ issues }: { issues: ValidationIssue[] }) => {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-lg space-y-1">
          <p className="text-[10px] font-bold text-red-600 dark:text-red-300 uppercase flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {errors.length} error(s)
          </p>
          {errors.map((e, i) => (
            <p key={i} className="text-[11px] text-red-700 dark:text-red-300 break-words">
              <span className="font-mono">{e.path}</span>: {e.message}
            </p>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-950/40 rounded-lg space-y-1">
          <p className="text-[10px] font-bold text-yellow-700 dark:text-yellow-300 uppercase">{warnings.length} warning(s)</p>
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-yellow-800 dark:text-yellow-200 break-words">
              <span className="font-mono">{w.path}</span>: {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export const ContentStudio = ({ studio }: ContentStudioProps) => {
  const {
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
    levels,
    cefrLevels,
  } = studio;

  const noErrors = !issues.some((i) => i.severity === 'error');

  return (
    <div className="space-y-5">
      {/* Pack picker */}
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-3">
          <Field label="Pack">
            <select
              value={selectedPackId ?? ''}
              onChange={(e) => selectPack(e.target.value || null)}
              className={inputClass}
            >
              <option value="">Select a pack…</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id} · v{p.version}{p.status ? ` · ${p.status}` : ''})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={isLoading}
          className="mt-4 flex items-center space-x-1 text-xs font-bold text-ios-blue disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Reload</span>
        </button>
      </div>

      {selectedPack && (
        <>
          {/* Situation picker for the selected pack */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <Field label="Edit situation">
                <select
                  value=""
                  onChange={(e) => e.target.value && editSituation(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Load an existing situation…</option>
                  {selectedPack.situations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} — {s.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              onClick={newSituation}
              className="mt-4 flex items-center space-x-1 text-xs font-bold text-ios-blue"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Situation editor form */}
          <div className="space-y-3 p-3 rounded-xl border border-ios-bg">
            <Field label="Situation id">
              <input
                value={draft.id}
                onChange={(e) => setDraftField('id', e.target.value)}
                placeholder="e.g. cafe-order-coffee"
                className={inputClass}
              />
            </Field>
            <Field label="Title">
              <input value={draft.title} onChange={(e) => setDraftField('title', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Summary">
              <textarea
                value={draft.summary}
                onChange={(e) => setDraftField('summary', e.target.value)}
                rows={2}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Level">
                <select
                  value={draft.level}
                  onChange={(e) => setDraftField('level', Number(e.target.value))}
                  className={inputClass}
                >
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      L{l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="CEFR">
                <select value={draft.cefr} onChange={(e) => setDraftField('cefr', e.target.value)} className={inputClass}>
                  {cefrLevels.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Tracks (comma-separated ids)">
              <input
                value={draft.tracksCsv}
                onChange={(e) => setDraftField('tracksCsv', e.target.value)}
                placeholder="daily-survival, cafe-life"
                className={inputClass}
              />
            </Field>
            <Field label="Goals (one per line)">
              <textarea
                value={draft.goalsText}
                onChange={(e) => setDraftField('goalsText', e.target.value)}
                rows={2}
                className={inputClass}
              />
            </Field>
            <Field label="Phrase patterns (JSON array)">
              <textarea
                value={draft.phrasePatternsJson}
                onChange={(e) => setDraftField('phrasePatternsJson', e.target.value)}
                rows={5}
                className={jsonClass}
              />
            </Field>
            <Field label="Vocabulary (JSON array)">
              <textarea
                value={draft.vocabularyJson}
                onChange={(e) => setDraftField('vocabularyJson', e.target.value)}
                rows={5}
                className={jsonClass}
              />
            </Field>
            <Field label="Cultural notes (JSON array, optional)">
              <textarea
                value={draft.culturalNotesJson}
                onChange={(e) => setDraftField('culturalNotesJson', e.target.value)}
                rows={3}
                className={jsonClass}
              />
            </Field>
          </div>

          <IssueList issues={issues} />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => validateDraft()}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-ios-bg rounded-lg"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Validate
            </button>
            <button
              onClick={() => void publish({ publishStatus: 'draft' })}
              disabled={isPublishing}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-ios-bg rounded-lg disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> Save draft
            </button>
            <button
              onClick={() => void publish({ publishStatus: 'published' })}
              disabled={isPublishing || !noErrors}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-ios-blue text-white rounded-lg disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" /> Publish
            </button>
          </div>
        </>
      )}

      {!selectedPack && !isLoading && (
        <p className="text-xs text-ios-gray italic">Select a pack to author or edit its situations.</p>
      )}
    </div>
  );
};
