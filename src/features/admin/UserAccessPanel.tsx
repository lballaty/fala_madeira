// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/UserAccessPanel.tsx
// Description: Thin admin "grant content access" control (EN-15 §4). Rendered inside AdminView's
//   Access tab (already gated on role==='admin'). Looks up a user by email, then sets their
//   subscription_tier — tier 'unlimited' is the EN-15 "grant all levels" bypass — and optionally
//   unlocked_level. Every grant goes through a confirm dialog + success/error toast + a
//   structured logger audit event (useUserAccess). Presentational shell over useUserAccess; owns
//   only local form + confirm state.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { useState } from 'react';
import { KeyRound, Search } from 'lucide-react';
import { ConfirmationModal } from '../../components/ConfirmationModal';
import { useConfirmationModal } from '../../hooks/useConfirmationModal';
import { useUserAccess, type SubscriptionTier, type UserAccessState } from './useUserAccess';

const TIERS: SubscriptionTier[] = ['free', 'premium', 'unlimited'];

interface UserAccessPanelProps {
  access: UserAccessState;
}

export const UserAccessPanel = ({ access }: UserAccessPanelProps) => {
  const { target, isLooking, isSaving, lookupByEmail, grantAccess, clearTarget } = access;
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<SubscriptionTier>('unlimited');
  const [levelInput, setLevelInput] = useState('');
  const [voiceLimitInput, setVoiceLimitInput] = useState('');
  const { confirmModal, requestConfirmation, closeConfirmation } = useConfirmationModal();

  const submitLookup = () => {
    void lookupByEmail(email);
  };

  const confirmGrant = () => {
    if (!target) return;
    const parsedLevel = levelInput.trim() === '' ? null : Number(levelInput);
    const parsedVoice = voiceLimitInput.trim() === '' ? null : Number(voiceLimitInput);
    const levelClause =
      parsedLevel != null && Number.isFinite(parsedLevel) ? ` and unlocked level to ${Math.max(1, Math.trunc(parsedLevel))}` : '';
    const voiceClause =
      parsedVoice != null && Number.isFinite(parsedVoice)
        ? ` and daily voice limit to ${Math.max(0, Math.trunc(parsedVoice))}`
        : '';
    requestConfirmation({
      title: 'Update user access',
      message: `Set ${target.email}'s subscription tier to "${tier}"${levelClause}${voiceClause}? Tier "unlimited" grants access to all content.`,
      confirmText: 'Update access',
      cancelText: 'Cancel',
      onConfirm: () => {
        void grantAccess(tier, parsedLevel, parsedVoice);
      },
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold">Grant content access</h2>
        <p className="text-xs text-ios-gray mt-1">
          Look up a user by email, then set their tier. Tier <span className="font-semibold">unlimited</span> (and any
          admin) bypasses the content paywall and unlocks every level.
        </p>
      </div>

      {/* Lookup */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-ios-gray uppercase" htmlFor="access-email">
          User email
        </label>
        <div className="flex items-center gap-2">
          <input
            id="access-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitLookup();
            }}
            placeholder="user@example.com"
            className="flex-1 bg-ios-bg p-3 rounded-xl outline-none text-sm border-2 border-transparent focus:border-ios-blue transition-all"
          />
          <button
            onClick={submitLookup}
            disabled={isLooking}
            className="flex items-center gap-1 px-4 py-3 bg-ios-blue text-white rounded-xl font-bold text-xs disabled:opacity-50"
            aria-label="Look up user"
          >
            <Search className="w-4 h-4" />
            {isLooking ? 'Looking…' : 'Look up'}
          </button>
        </div>
      </div>

      {/* Target + grant form */}
      {target && (
        <div className="bg-ios-bg rounded-2xl p-4 space-y-4">
          <div className="text-sm">
            <p className="font-bold break-all">{target.email}</p>
            <p className="text-xs text-ios-gray mt-0.5">
              Current: tier <span className="font-semibold">{target.subscription_tier ?? 'free'}</span> · level{' '}
              <span className="font-semibold">{target.unlocked_level ?? 1}</span> · role{' '}
              <span className="font-semibold">{target.role ?? 'user'}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-ios-gray uppercase" htmlFor="access-tier">
              Subscription tier
            </label>
            <select
              id="access-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as SubscriptionTier)}
              className="w-full bg-card p-3 rounded-xl outline-none text-sm border-2 border-transparent focus:border-ios-blue"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-ios-gray uppercase" htmlFor="access-level">
              Unlocked level (optional)
            </label>
            <input
              id="access-level"
              type="number"
              min={1}
              value={levelInput}
              onChange={(e) => setLevelInput(e.target.value)}
              placeholder="leave blank to keep current"
              className="w-full bg-card p-3 rounded-xl outline-none text-sm border-2 border-transparent focus:border-ios-blue"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-ios-gray uppercase" htmlFor="access-voice-limit">
              Daily voice limit (optional)
            </label>
            <input
              id="access-voice-limit"
              data-testid="user-access-voice-limit"
              type="number"
              min={0}
              value={voiceLimitInput}
              onChange={(e) => setVoiceLimitInput(e.target.value)}
              placeholder="blank = use global default"
              className="w-full bg-card p-3 rounded-xl outline-none text-sm border-2 border-transparent focus:border-ios-blue"
            />
            <p className="text-[10px] text-ios-gray">
              Current: <span className="font-semibold">{target.voice_limit ?? '(global default)'}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={confirmGrant}
              disabled={isSaving}
              className="flex items-center gap-1 flex-1 justify-center px-4 py-3 bg-ios-blue text-white rounded-xl font-bold text-xs disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {isSaving ? 'Saving…' : 'Update access'}
            </button>
            <button
              onClick={() => {
                clearTarget();
                setEmail('');
                setLevelInput('');
                setVoiceLimitInput('');
              }}
              className="px-4 py-3 bg-card text-ios-gray rounded-xl font-bold text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmation}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        isDestructive={confirmModal.isDestructive}
      />
    </div>
  );
};

export default UserAccessPanel;

// Re-export for callers that want the hook alongside the panel.
export { useUserAccess };
