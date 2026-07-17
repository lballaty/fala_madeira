// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/AdminConfigPanel.tsx
// Description: Admin "Config" tab (EN-25) — consolidates global admin configuration under the single
//   AdminView. Currently hosts the GLOBAL daily voice-limit stepper (moved verbatim from the legacy
//   Settings "admin mode" panel, which EN-25 deletes). Presentational: owns no state; the value +
//   setter are lifted from useSettings via AdminView props so persistence/write-back stays in one place.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

interface AdminConfigPanelProps {
  globalVoiceLimit: number;
  setGlobalVoiceLimit: (n: number) => void;
}

export const AdminConfigPanel = ({ globalVoiceLimit, setGlobalVoiceLimit }: AdminConfigPanelProps) => (
  <div className="space-y-5">
    <div>
      <h2 className="text-base font-bold">Config</h2>
      <p className="text-xs text-ios-gray mt-1">Global configuration applied to all users.</p>
    </div>

    <div className="p-4 bg-purple-50 dark:bg-purple-950/40 space-y-4 border border-purple-100 dark:border-purple-900 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="font-bold text-xs text-purple-800 dark:text-purple-200">Global Voice Limit</p>
          <p className="text-[10px] text-purple-600 dark:text-purple-300">Daily free messages for users</p>
        </div>
        <div className="flex items-center space-x-3 bg-card p-1 rounded-xl border border-purple-100 dark:border-purple-900">
          <button
            onClick={() => setGlobalVoiceLimit(Math.max(0, globalVoiceLimit - 1))}
            className="w-8 h-8 flex items-center justify-center text-purple-600 dark:text-purple-300 font-bold hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
          >-</button>
          <span
            data-testid="admin-voice-limit-global"
            className="font-bold text-purple-800 dark:text-purple-200 w-6 text-center text-sm"
          >{globalVoiceLimit}</span>
          <button
            onClick={() => setGlobalVoiceLimit(globalVoiceLimit + 1)}
            className="w-8 h-8 flex items-center justify-center text-purple-600 dark:text-purple-300 font-bold hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
          >+</button>
        </div>
      </div>
    </div>
  </div>
);

export default AdminConfigPanel;
