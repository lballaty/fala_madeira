// File: src/content/appCapabilities.ts
// Description: The App Capability Registry (EN-17a + EN-18) — one canonical, pure-data source of
//   "what the app can do and where it lives". Authored ONCE per feature; every consumer reads only
//   the fields it needs: the User Manual renders `long` grouped by `area` (4a); a build step projects
//   `{title, short, area}` into the edge chat-help prompt (4b, scripts/gen-app-help.mjs); the
//   navigate service resolves `target` to switch tab + focus a control (4c); contextual hints
//   reference a capability `id` and call navigateToCapability (4d). Stable `id`s are the contract and
//   `target.controlId` reuses the e2e `data-testid` selectors (one identifier, three uses). Pure data
//   only — NO client/edge-only imports — so it is safe to project into either runtime.
//   See docs/EN-17-EN-18-HELP-GUIDANCE-DESIGN.md.
// Author: Lane A (with assistant)
// Created: 2026-07-15

/** The five primary navigation areas (mirrors App.tsx TabId) plus derived sub-areas. */
export type AppArea = 'home' | 'learning' | 'practice' | 'tutor' | 'profile' | 'account';

/** Human-facing label for each area — used by the manual section headers and the help projection. */
export const APP_AREA_LABELS: Record<AppArea, string> = {
  home: 'Home',
  learning: 'Learning',
  practice: 'Practice',
  tutor: 'Tutor (Chat)',
  profile: 'Profile',
  account: 'Account & Settings',
};

/** Where a capability's control lives — enables reactive "take me there" navigation (EN-18). */
export interface NavTarget {
  /** Which primary tab/screen the control lives on. */
  area: AppArea;
  /** A data-testid to scroll to + briefly highlight (reuses the e2e selector). Optional: some
   *  capabilities describe an area rather than a single control, so switching the tab is enough. */
  controlId?: string;
}

export interface AppCapability {
  /** Stable key — the contract every consumer references. Never renamed lightly. */
  id: string;
  /** Primary area this capability belongs to (drives manual grouping + help projection). */
  area: AppArea;
  /** Short display title, e.g. "Goal track". */
  title: string;
  /** <=1 line — compact contexts (chat help prompt, hints). No markup. */
  short: string;
  /** Prose — the User Manual body. Plain text (no literal markdown asterisks). */
  long: string;
  /** Help matching / search keywords (lowercase). */
  keywords: string[];
  /** Where the control lives — enables "take me there". Absent = describe-only capability. */
  target?: NavTarget;
}

/**
 * One entry per user-facing feature. Seeded from the current User Manual
 * (src/features/settings/UserManualModal.tsx) and the chat-help branch
 * (supabase/functions/_shared/gemini.ts isHelpMode) so this is behavior-preserving.
 *
 * DOCUMENTATION-IMPACT RULE: a user-facing feature change is expected to add or update its
 * APP_CAPABILITIES entry here (scripts/check-help-drift.mjs guards the edge projection).
 */
export const APP_CAPABILITIES: AppCapability[] = [
  // ── Home ────────────────────────────────────────────────────────────────────────
  {
    id: 'home-today',
    area: 'home',
    title: "Today's Focus",
    short: 'Home shows your streak, XP, and the recommended next step for your chosen path.',
    long: "Home is your daily starting point. It shows your streak, XP, and your recommended next step (\"Today's Focus\" / \"Today's Session\"), which follows the learning path you have chosen. Tap it to jump straight into the recommended lesson, session, or situation.",
    keywords: ['home', 'streak', 'xp', 'today', 'focus', 'next step', 'daily', 'session'],
    target: { area: 'home', controlId: 'tab-home' },
  },

  // ── Learning ────────────────────────────────────────────────────────────────────
  {
    id: 'learning-roadmap',
    area: 'learning',
    title: 'Lesson roadmap',
    short: 'Learning holds your lesson roadmap by month; open a month to see its lessons.',
    long: 'The Learning tab holds your lesson roadmap organised by month. Open a month to see its lessons, then open a lesson for its content, vocabulary, and practice entries.',
    keywords: ['learning', 'lessons', 'roadmap', 'month', 'plan', 'curriculum'],
    target: { area: 'learning', controlId: 'learning-plan' },
  },
  {
    id: 'vocab-lookup',
    area: 'learning',
    title: 'Look up any word',
    short: 'Vocabulary lookup accepts Portuguese OR English and tolerates accents and small typos.',
    long: 'The vocabulary lookup accepts either a Portuguese or an English word and gives you the translation in the right direction. It ignores accents and small typos, so "cafe" still finds "café". Words outside the course vocabulary fall back to an AI translation (online). Open it from a lesson in the Learning tab.',
    keywords: ['vocab', 'vocabulary', 'lookup', 'dictionary', 'translate', 'word', 'meaning'],
    target: { area: 'learning', controlId: 'learning-plan' },
  },

  // ── Practice ────────────────────────────────────────────────────────────────────
  {
    id: 'practice-modes',
    area: 'practice',
    title: 'Practice modes',
    short: 'Practice has focused drills — listening, pattern building, and quizzes.',
    long: 'Beyond lessons and the tutor, the Practice area has focused drills — listening, pattern building, and quizzes — each working on the same situations from a different angle. Pick a mode tile to start.',
    keywords: ['practice', 'drills', 'listening', 'pattern', 'quiz', 'modes'],
    target: { area: 'practice', controlId: 'practice-hub' },
  },
  {
    id: 'situation-simulator',
    area: 'practice',
    title: 'Situation Simulator',
    short: 'A role-play conversation at difficulty levels 1–5 where you choose replies or speak.',
    long: 'The Situation Simulator is a role-play where you hold a real conversation — by choosing replies or speaking your own — at difficulty levels 1 to 5. Find it among the Practice mode tiles.',
    keywords: ['simulator', 'situation', 'role-play', 'roleplay', 'conversation', 'speak', 'levels'],
    target: { area: 'practice', controlId: 'practice-hub' },
  },
  {
    id: 'browse-situations',
    area: 'practice',
    title: 'Browse situations',
    short: 'Browse any track, level, or situation freely — nothing is locked.',
    long: 'From the Practice hub you can browse situations across any track and any level — nothing is locked. Use it to self-direct practice on whatever you want to work on.',
    keywords: ['browse', 'situations', 'free', 'explore', 'track', 'level'],
    target: { area: 'practice', controlId: 'practice-browse' },
  },

  // ── Tutor (Chat) ──────────────────────────────────────────────────────────────────
  {
    id: 'tutor-chat',
    area: 'tutor',
    title: 'AI tutor chat',
    short: 'Chat with your tutor any time; tap the mic to speak. Read-aloud is opt-in.',
    long: "This is the heart of FalaMadeira. Type to your tutor any time, or tap the microphone to speak. Your tutor knows which lesson you're on and guides you through that day's patterns. The tutor no longer reads every reply aloud by default — use the Mute / Unmute control to turn read-aloud on, or tap the play button on any message to hear just that one.",
    keywords: ['tutor', 'chat', 'conversation', 'speak', 'microphone', 'read aloud', 'mute', 'unmute'],
    target: { area: 'tutor', controlId: 'tab-chat' },
  },
  {
    id: 'in-app-help',
    area: 'tutor',
    title: 'In-app help',
    short: 'Ask the in-app help chat how to do something and it points you to the right place.',
    long: 'You can ask the in-app help chat how to do something ("How do I change my level?", "Where are downloads?") and it will point you to the right place — and offer to take you straight there. Turn on help mode with the help button in the tutor chat.',
    keywords: ['help', 'guide', 'how do i', 'where is', 'assistant', 'support'],
    target: { area: 'tutor', controlId: 'tab-chat' },
  },

  // ── Profile ─────────────────────────────────────────────────────────────────────
  {
    id: 'learning-paths',
    area: 'profile',
    title: 'Learning paths',
    short: 'Switch between four learning paths anytime in Profile → Learning Path; progress is shared.',
    long: 'In Profile → Learning Path you can switch between four paths at any time — your progress is shared across all of them: Structured course (month by month, the app leads); Goal track (pick a life goal such as Survival or Work and the app orders that track by level); Adaptive guided (a ~30-minute daily session built around you); and Free (pick any situation, level, or mode yourself).',
    keywords: ['path', 'learning path', 'structured', 'goal', 'adaptive', 'free', 'switch'],
    target: { area: 'profile', controlId: 'path-switcher' },
  },
  {
    id: 'goal-track',
    area: 'profile',
    title: 'Goal track',
    short: 'Pick a life goal and the app orders that track by level; choose your goal below the switcher.',
    long: 'When you choose the Goal track path from the Learning Path switcher, pick a life goal (e.g. Survival, Work) so the app knows which track to follow. The app then orders that track by level for you.',
    keywords: ['goal', 'goal track', 'survival', 'work', 'choose goal', 'life goal'],
    target: { area: 'profile', controlId: 'path-switcher' },
  },
  {
    id: 'offline-downloads',
    area: 'profile',
    title: 'Use it offline',
    short: 'Download lessons for offline use by whole track or one situation at a time.',
    long: 'In Profile you can download lessons for offline use — by whole track or one situation at a time, so downloads stay small and finish reliably. Audio you play is saved on your device to load faster and cut data use; you can set the storage limit or clear it in Profile.',
    keywords: ['offline', 'download', 'downloads', 'storage', 'audio cache', 'data'],
    target: { area: 'profile', controlId: 'tab-settings' },
  },
  {
    id: 'appearance-audio',
    area: 'profile',
    title: 'Appearance & audio',
    short: 'Set light / dark / system appearance, audio speed, and choose your tutor in Profile.',
    long: 'Appearance (light / dark / system), audio playback speed, and your tutor selection all live in Profile, alongside legal pages and this User Manual.',
    keywords: ['appearance', 'dark', 'light', 'theme', 'audio speed', 'tutor', 'settings'],
    target: { area: 'profile', controlId: 'tab-settings' },
  },
  {
    id: 'navigation-signout',
    area: 'profile',
    title: 'Getting around & Sign Out',
    short: 'Move between the five tabs; Sign Out is always at the bottom of the navigation sidebar.',
    long: 'Move between Home, Learning, Practice, the Tutor, and Profile from the navigation. Sign Out is always available at the bottom of the navigation sidebar (you no longer have to scroll to the end of Profile to find it).',
    keywords: ['navigation', 'sign out', 'logout', 'sidebar', 'tabs', 'getting around'],
    target: { area: 'profile', controlId: 'tab-settings' },
  },

  // ── Account ─────────────────────────────────────────────────────────────────────
  {
    id: 'account-support',
    area: 'account',
    title: 'Support & account',
    short: 'Report a problem or send a message via Support; account settings live in Profile.',
    long: 'This User Manual and the Support option (to report a problem or send a message) are both in Profile. Your account settings — including account deletion — also live there.',
    keywords: ['support', 'account', 'report', 'problem', 'contact', 'delete account'],
    target: { area: 'profile', controlId: 'tab-settings' },
  },
  {
    id: 'access-limits',
    area: 'account',
    title: 'Access & voice limits',
    short: 'Content unlocks via access keys or an admin grant; voice practice has a fair-use daily limit.',
    long: 'Content access: lessons unlock via access keys, or an admin can grant full access. Admins and "unlimited" accounts see all content. FalaMadeira is free to use; voice practice has a fair-use daily limit that resets every day (per-account if one is set for you, otherwise the app default). Text chat with your tutor is always available, with no limit.',
    keywords: ['access', 'unlock', 'key', 'limit', 'voice', 'fair use', 'free', 'text chat'],
  },
];
