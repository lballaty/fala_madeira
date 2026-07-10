// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/missions/MissionsView.tsx
// Description: Real-World Missions engine body (CONTENT-ARCHITECTURE §3: prep →
//   do-it-for-real → after-action review; UI per docs/ui-mockup/intended-ui-v3.html Missions
//   screens). Flow: mission list (open + completed from missions_log via missionsStore) →
//   pick a situation → prep sheet (authored mission data, or the degraded self-made sheet
//   built from the situation's real patterns/vocab — prepSheet.ts) with TTS phrase audio →
//   "I'm doing it" (missions_log 'planned') → "I did it" → after-action review (went well /
//   partly / not yet + free note → 'completed', or kept open on 'not yet'). Calm/honest
//   (§12): no deadlines, no guilt — "it counts whenever you do it." Default-exports a
//   ComponentType<PracticeModeProps> (ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  Meh,
  Plus,
  Smile,
  Sparkles,
  Sprout,
  Volume2,
} from 'lucide-react';
import type { PracticeModeProps } from '../registry';
import type { Situation } from '../../../content/schema';
import { contentRepository } from '../../../content/repository';
import { geminiService } from '../../../services/geminiService';
import { TUTORS } from '../../../data/tutors';
import { config } from '../../../config';
import { errorMessage, logger, userMessage } from '../../../lib/logger';
import { buildPrepSheet, missionsConfig, PrepPhrase, PrepSheet } from './prepSheet';
import {
  listMissionLog,
  logMissionOutcome,
  logMissionPlanned,
  MissionGrade,
  MissionLogEntry,
} from './missionsStore';

// ---------------------------------------------------------------------------
// Screen state machine
// ---------------------------------------------------------------------------

type Screen =
  | { name: 'list' }
  | { name: 'pick' }
  | { name: 'prep'; situation: Situation }
  | { name: 'review'; entry: MissionLogEntry }
  | { name: 'logged'; entry: MissionLogEntry };

const GRADES: { grade: MissionGrade; Icon: typeof Smile; label: string; hint: string }[] = [
  { grade: 'went_well', Icon: Smile, label: 'Went well', hint: 'They understood me' },
  { grade: 'partly', Icon: Meh, label: 'Partly', hint: 'Got there with some help or pointing' },
  { grade: 'not_yet', Icon: Sprout, label: 'Not yet', hint: 'Stays open — trying counts' },
];

const gradeLabel = (grade: MissionGrade | undefined): string =>
  GRADES.find((g) => g.grade === grade)?.label ?? '';

const formatDay = (iso: string): string => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
};

/** Debounce guard for prep-audio plays (module-level: event-handler-only, never render). */
const isPlayDebounced = (lastPlayRef: MutableRefObject<number>): boolean => {
  const now = Date.now();
  if (now - lastPlayRef.current < missionsConfig.playDebounceMs) return true;
  lastPlayRef.current = now;
  return false;
};

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const MissionsView = ({ situationId, onExit }: PracticeModeProps) => {
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [missions, setMissions] = useState<MissionLogEntry[] | null>(null);
  const [situations, setSituations] = useState<Situation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Prep screen state (self-made mission statement) + accept/save progress.
  const [missionStatement, setMissionStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // After-action review state.
  const [grade, setGrade] = useState<MissionGrade | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Prep audio (geminiService.playSpeech with the default tutor voice).
  const lastPlayRef = useRef(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [log, allSituations] = await Promise.all([
          listMissionLog(),
          contentRepository.listSituations(),
        ]);
        if (cancelled) return;
        setMissions(log);
        setSituations(allSituations);
        if (situationId) {
          const picked = allSituations.find((s) => s.id === situationId) ?? null;
          if (picked) {
            setScreen({ name: 'prep', situation: picked });
          } else {
            logger.warn('MISSION_SITUATION_UNKNOWN', `situation "${situationId}" not found in the content repository — showing the mission list`, {
              category: 'DATA_PROCESSING',
              details: { situationId },
            });
          }
        }
      } catch (error) {
        if (cancelled) return;
        const event = logger.error('MISSIONS_LOAD_FAILED', 'could not load missions/situations for the Missions engine', {
          category: 'DATA_PROCESSING',
          error,
        });
        setLoadError(
          userMessage('MISSIONS_LOAD_FAILED', errorMessage(error) || 'Could not load missions.', event.request_id)
        );
        setMissions([]);
        setSituations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [situationId]);

  const situationTitle = (id: string): string =>
    situations?.find((s) => s.id === id)?.title ?? id;

  const playPhrase = async (text: string) => {
    if (isPlayDebounced(lastPlayRef)) return;
    setAudioError(null);
    try {
      await geminiService.playSpeech(text, TUTORS[0], config.audio.defaultPlaybackSpeed);
    } catch (error) {
      const event = logger.error('MISSION_PREP_AUDIO_FAILED', 'prep-phrase audio playback failed', {
        category: 'AI_DECISION',
        error,
        details: { textLength: text.length },
      });
      setAudioError(
        userMessage('TTS_FAILED', errorMessage(error) || 'Audio playback failed.', event.request_id)
      );
    }
  };

  const openPrep = (situation: Situation) => {
    setMissionStatement('');
    setActionError(null);
    setAudioError(null);
    setScreen({ name: 'prep', situation });
  };

  const openReview = (entry: MissionLogEntry) => {
    setGrade(null);
    setReviewNote('');
    setActionError(null);
    setScreen({ name: 'review', entry });
  };

  const acceptMission = async (situation: Situation, sheet: PrepSheet) => {
    const statement = missionStatement.trim();
    if (sheet.kind === 'self_made' && statement === '') {
      setActionError('Write your mission in one sentence first — e.g. "I will order a bica at the café tomorrow."');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const entry = await logMissionPlanned({
        situationId: situation.id,
        title: sheet.kind === 'self_made' ? statement : sheet.title,
        selfMade: sheet.kind === 'self_made',
        missionStatement: sheet.kind === 'self_made' ? statement : undefined,
      });
      logger.info('MISSION_ACCEPTED', `mission accepted for situation "${situation.id}"`, {
        category: 'USER_ACTION',
        details: { situationId: situation.id, selfMade: sheet.kind === 'self_made', local: entry.local },
      });
      setMissions((prev) => [entry, ...(prev ?? [])]);
      setScreen({ name: 'list' });
    } catch (error) {
      // logMissionPlanned only throws when even the device-local write failed (already logged).
      setActionError(errorMessage(error) || 'Could not save the mission. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async (entry: MissionLogEntry) => {
    if (!grade) {
      setActionError('Pick how it went first — any answer is a good answer.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const updated = await logMissionOutcome(entry, grade, reviewNote);
      // COACH SIGNAL: real-world after-action grades are the strongest behavior-change
      // signal the Coach/Insights loop gets (CONTENT-ARCHITECTURE §6b).
      logger.info('MISSION_AFTER_ACTION', `mission after-action recorded: ${grade}`, {
        category: 'USER_ACTION',
        details: {
          situationId: entry.situation_id,
          grade,
          selfMade: entry.notes.self_made,
          hasNote: reviewNote.trim().length > 0,
          local: entry.local,
        },
      });
      setMissions((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)));
      setScreen({ name: 'logged', entry: updated });
    } catch (error) {
      // Store already logged with a support Ref; keep the screen so the user can retry.
      setActionError(errorMessage(error) || 'Could not save your review. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── Shared bits ──────────────────────────────────────────────────────────

  const phraseRow = (phrase: PrepPhrase, key: string) => (
    <div key={key} className="flex items-start justify-between space-x-2 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium">{phrase.text}</p>
        {phrase.translation && <p className="text-xs text-ios-gray">{phrase.translation}</p>}
      </div>
      <button
        onClick={() => void playPhrase(phrase.text)}
        aria-label={`Play "${phrase.text}"`}
        className="p-2 rounded-full bg-ios-bg text-ios-blue flex-shrink-0 active:scale-95 transition-transform min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <Volume2 className="w-4 h-4" />
      </button>
    </div>
  );

  const errorBanner = (message: string | null) =>
    message ? (
      <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2" role="alert">
        {message}
      </p>
    ) : null;

  // ── Loading ──────────────────────────────────────────────────────────────

  if (missions === null || situations === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
      </div>
    );
  }

  // ── Prep screen ──────────────────────────────────────────────────────────

  if (screen.name === 'prep') {
    const { situation } = screen;
    const sheet = buildPrepSheet(situation);
    const selfMade = sheet.kind === 'self_made';
    return (
      <div className="p-6 space-y-3">
        <div className="bg-card rounded-2xl ios-shadow p-4 border-l-4 border-[#FF9500] space-y-1">
          <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide">
            {selfMade ? 'Self-made mission · Real world' : 'Mission · Real world'}
          </p>
          <h3 className="font-bold text-lg">{sheet.title}</h3>
          <p className="text-xs text-ios-gray">{situation.summary}</p>
        </div>

        {selfMade && (
          <div className="bg-card rounded-2xl ios-shadow p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide flex items-center space-x-1">
              <Sparkles className="w-3 h-3" />
              <span>Your mission, your words</span>
            </p>
            <p className="text-xs text-ios-gray">
              This situation has no ready-made mission yet, so make it yours: one real thing you
              will do out there, in one sentence.
            </p>
            <textarea
              value={missionStatement}
              onChange={(e) => setMissionStatement(e.target.value)}
              aria-label="My mission statement"
              placeholder='e.g. "I will order a bica at the café tomorrow."'
              rows={2}
              className="w-full text-sm border border-ios-bg rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-ios-blue/40 resize-none"
            />
          </div>
        )}

        <div className="bg-card rounded-2xl ios-shadow p-4 space-y-3">
          {sheet.prep.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide">Prep phrases</p>
              <div className="mt-1 divide-y divide-ios-bg">
                {sheet.prep.map((p, i) => phraseRow(p, `prep-${i}`))}
              </div>
            </div>
          )}
          {sheet.vocabulary.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide">Words to have ready</p>
              <div className="mt-1 divide-y divide-ios-bg">
                {sheet.vocabulary.map((p, i) => phraseRow(p, `vocab-${i}`))}
              </div>
            </div>
          )}
          {sheet.fallbacks.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide">If you get stuck</p>
              <div className="mt-1 divide-y divide-ios-bg">
                {sheet.fallbacks.map((p, i) => phraseRow(p, `fallback-${i}`))}
              </div>
            </div>
          )}
          {sheet.likelyResponses.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide">What they'll likely say</p>
              <div className="mt-1 divide-y divide-ios-bg">
                {sheet.likelyResponses.map((p, i) => phraseRow(p, `likely-${i}`))}
              </div>
            </div>
          )}
          {sheet.prep.length === 0 && sheet.vocabulary.length === 0 && (
            <p className="text-xs text-ios-gray">
              This situation has no phrases yet — you can still set the mission and do it in your
              own words.
            </p>
          )}
        </div>

        {errorBanner(audioError)}
        {errorBanner(actionError)}

        <button
          onClick={() => void acceptMission(situation, sheet)}
          disabled={busy}
          className="w-full py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform disabled:opacity-50"
        >
          {busy ? 'Saving…' : "I'm doing it"}
        </button>
        <p className="text-[11px] text-ios-gray text-center">
          No pressure, no deadline. It counts whenever you do it.
        </p>
        <button
          onClick={() => setScreen({ name: 'list' })}
          className="w-full py-2 text-ios-blue text-sm font-semibold"
        >
          Back to missions
        </button>
      </div>
    );
  }

  // ── Situation picker ─────────────────────────────────────────────────────

  if (screen.name === 'pick') {
    return (
      <div className="p-6 space-y-3">
        <header className="space-y-1">
          <h3 className="font-bold text-lg">Pick a situation</h3>
          <p className="text-xs text-ios-gray">
            Any situation works — ones with a ready-made mission are marked, the rest become a
            mission you write yourself.
          </p>
        </header>
        {situations.length === 0 && (
          <p className="text-sm text-ios-gray text-center py-8">
            No situations are loaded yet. Content may still be downloading — try again shortly.
          </p>
        )}
        {situations.map((situation) => (
          <button
            key={situation.id}
            onClick={() => openPrep(situation)}
            className="w-full bg-card p-4 rounded-2xl ios-shadow flex items-center space-x-3 text-left active:scale-95 transition-transform"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm truncate">{situation.title}</span>
                <span className="text-[9px] font-bold uppercase text-ios-gray bg-ios-bg px-1.5 py-0.5 rounded-full flex-shrink-0">
                  L{situation.level}
                </span>
                {situation.mission && (
                  <span className="text-[9px] font-bold uppercase text-white bg-[#FF9500] px-1.5 py-0.5 rounded-full flex-shrink-0">
                    mission ready
                  </span>
                )}
              </div>
              <span className="text-xs text-ios-gray block truncate">{situation.summary}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
          </button>
        ))}
        <button
          onClick={() => setScreen({ name: 'list' })}
          className="w-full py-2 text-ios-blue text-sm font-semibold"
        >
          Back to missions
        </button>
      </div>
    );
  }

  // ── After-action review ──────────────────────────────────────────────────

  if (screen.name === 'review') {
    const { entry } = screen;
    return (
      <div className="p-6 space-y-3">
        <div className="bg-card rounded-2xl ios-shadow p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide">After-action review</p>
          <h3 className="font-bold text-lg">{entry.notes.title}</h3>
          <p className="text-xs text-ios-gray">{situationTitle(entry.situation_id)}</p>
        </div>

        <div className="bg-card rounded-2xl ios-shadow p-4 space-y-2">
          <p className="font-bold text-sm">How did it go?</p>
          {GRADES.map(({ grade: g, Icon, label, hint }) => (
            <button
              key={g}
              onClick={() => setGrade(g)}
              className={`w-full p-3 rounded-xl flex items-center space-x-3 text-left border transition-colors ${
                grade === g ? 'border-ios-blue bg-ios-blue/5' : 'border-ios-bg bg-card'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${grade === g ? 'text-ios-blue' : 'text-ios-gray'}`} />
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-sm block">{label}</span>
                <span className="text-xs text-ios-gray block">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="bg-card rounded-2xl ios-shadow p-4 space-y-2">
          <p className="font-bold text-sm">Anything worth remembering?</p>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            aria-label="After-action note"
            placeholder="What worked? What tripped you up? (optional)"
            rows={3}
            className="w-full text-sm border border-ios-bg rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-ios-blue/40 resize-none"
          />
        </div>

        {errorBanner(actionError)}

        <button
          onClick={() => void saveReview(entry)}
          disabled={busy}
          className="w-full py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save review'}
        </button>
        <button
          onClick={() => setScreen({ name: 'list' })}
          className="w-full py-2 text-ios-blue text-sm font-semibold"
        >
          Back to missions
        </button>
      </div>
    );
  }

  // ── Logged confirmation ──────────────────────────────────────────────────

  if (screen.name === 'logged') {
    const { entry } = screen;
    const stillOpen = entry.status === 'planned';
    return (
      <div className="p-6">
        <div className="bg-card rounded-2xl ios-shadow p-8 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FF9500]/10 flex items-center justify-center">
            {stillOpen ? (
              <Sprout className="w-7 h-7 text-[#FF9500]" />
            ) : (
              <CheckCircle2 className="w-7 h-7 text-[#FF9500]" />
            )}
          </div>
          <h3 className="font-bold text-lg">{stillOpen ? 'Attempt logged' : 'Mission logged'}</h3>
          <p className="text-xs text-ios-gray">
            {stillOpen
              ? 'The mission stays open — trying is exactly how this works. It counts whenever you do it.'
              : 'Real-world use is the strongest signal there is. It feeds what the app suggests next.'}
          </p>
          <div className="pt-2 space-y-2">
            <button
              onClick={() => setScreen({ name: 'list' })}
              className="w-full py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
            >
              Back to missions
            </button>
            <button onClick={onExit} className="w-full py-2 text-ios-blue text-sm font-semibold">
              Back to Practice
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Mission list (default) ───────────────────────────────────────────────

  const openMissions = missions.filter((m) => m.status === 'planned');
  const completedMissions = missions.filter((m) => m.status === 'completed');

  return (
    <div className="p-6 space-y-3">
      <header className="space-y-1">
        <h3 className="font-bold text-lg">Real-world missions</h3>
        <p className="text-xs text-ios-gray">
          Prep a few phrases, do one real thing out there, then tell the app how it went. No
          deadlines, nothing to lose.
        </p>
      </header>

      {errorBanner(loadError)}

      <button
        onClick={() => setScreen({ name: 'pick' })}
        className="w-full bg-[#FF9500] p-4 rounded-2xl text-white shadow-lg flex items-center justify-between active:scale-95 transition-transform"
      >
        <div className="flex items-center space-x-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold block text-sm">New mission</span>
            <span className="text-orange-100 text-xs">Pick a situation and prep for it</span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 opacity-70" />
      </button>

      {openMissions.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide pt-1">Open missions</p>
          {openMissions.map((entry) => {
            const situation = situations.find((s) => s.id === entry.situation_id) ?? null;
            return (
              <div key={entry.id} className="bg-card p-4 rounded-2xl ios-shadow space-y-2">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-[#FF9500] flex-shrink-0" />
                  <span className="font-bold text-sm flex-1 min-w-0 truncate">{entry.notes.title}</span>
                  {entry.notes.self_made && (
                    <span className="text-[9px] font-bold uppercase text-ios-gray bg-ios-bg px-1.5 py-0.5 rounded-full flex-shrink-0">
                      self-made
                    </span>
                  )}
                  {entry.local && (
                    <span className="text-[9px] font-bold uppercase text-ios-gray bg-ios-bg px-1.5 py-0.5 rounded-full flex-shrink-0">
                      on this device
                    </span>
                  )}
                </div>
                <p className="text-xs text-ios-gray">{situationTitle(entry.situation_id)}</p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openReview(entry)}
                    className="flex-1 py-2 bg-ios-blue text-white rounded-xl font-bold text-xs active:scale-95 transition-transform"
                  >
                    I did it
                  </button>
                  {situation && (
                    <button
                      onClick={() => openPrep(situation)}
                      className="flex-1 py-2 bg-ios-bg text-ios-blue rounded-xl font-bold text-xs active:scale-95 transition-transform"
                    >
                      Prep again
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {completedMissions.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-ios-gray tracking-wide pt-1">Completed</p>
          {completedMissions.map((entry) => (
            <div key={entry.id} className="bg-card p-4 rounded-2xl ios-shadow flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-sm block truncate">{entry.notes.title}</span>
                <span className="text-xs text-ios-gray block truncate">
                  {gradeLabel(entry.notes.grade)}
                  {entry.completed_at ? ` · ${formatDay(entry.completed_at)}` : ''}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {openMissions.length === 0 && completedMissions.length === 0 && !loadError && (
        <p className="text-sm text-ios-gray text-center py-6">
          No missions yet. Start small — greeting the baker for real beats ten perfect drills.
        </p>
      )}
    </div>
  );
};

export default MissionsView;
