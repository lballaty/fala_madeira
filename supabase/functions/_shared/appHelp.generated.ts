// File: supabase/functions/_shared/appHelp.generated.ts
// DO NOT EDIT — generated from src/content/appCapabilities.ts by scripts/gen-app-help.mjs.
// Run `node scripts/gen-app-help.mjs` to regenerate; scripts/check-help-drift.mjs guards drift.
// This is the compact chat-help projection (EN-17a): per app area, each capability's title +
// one-line summary. The gemini isHelpMode branch builds its "APP STRUCTURE" section from this.

/** One app area with its capabilities, projected for the chat-help system prompt. */
export interface AppHelpSection {
  area: string;
  label: string;
  items: { title: string; short: string }[];
}

export const APP_HELP_SECTIONS: AppHelpSection[] = [
  {
    "area": "home",
    "label": "Home",
    "items": [
      {
        "title": "Today's Focus",
        "short": "Home shows your streak, XP, and the recommended next step for your chosen path."
      }
    ]
  },
  {
    "area": "learning",
    "label": "Learning",
    "items": [
      {
        "title": "Lesson roadmap",
        "short": "Learning holds your lesson roadmap by month; open a month to see its lessons."
      },
      {
        "title": "Look up any word",
        "short": "Vocabulary lookup accepts Portuguese OR English and tolerates accents and small typos."
      }
    ]
  },
  {
    "area": "practice",
    "label": "Practice",
    "items": [
      {
        "title": "Practice modes",
        "short": "Practice has focused drills — listening, pattern building, and quizzes."
      },
      {
        "title": "Situation Simulator",
        "short": "A role-play conversation at difficulty levels 1–5 where you choose replies or speak."
      },
      {
        "title": "Browse situations",
        "short": "Browse any track, level, or situation freely — nothing is locked."
      }
    ]
  },
  {
    "area": "tutor",
    "label": "Tutor (Chat)",
    "items": [
      {
        "title": "AI tutor chat",
        "short": "Chat with your tutor any time; tap the mic to speak. Read-aloud is opt-in."
      },
      {
        "title": "In-app help",
        "short": "Ask the in-app help chat how to do something and it points you to the right place."
      }
    ]
  },
  {
    "area": "profile",
    "label": "Profile",
    "items": [
      {
        "title": "Learning paths",
        "short": "Switch between four learning paths anytime in Profile → Learning Path; progress is shared."
      },
      {
        "title": "Goal track",
        "short": "Pick a life goal and the app orders that track by level; choose your goal below the switcher."
      },
      {
        "title": "Use it offline",
        "short": "Download lessons for offline use by whole track or one situation at a time."
      },
      {
        "title": "Appearance & audio",
        "short": "Set light / dark / system appearance, audio speed, and choose your tutor in Profile."
      },
      {
        "title": "Getting around & Sign Out",
        "short": "Move between the five tabs; Sign Out is always at the bottom of the navigation sidebar."
      }
    ]
  },
  {
    "area": "account",
    "label": "Account & Settings",
    "items": [
      {
        "title": "Support & account",
        "short": "Report a problem or send a message via Support; account settings live in Profile."
      },
      {
        "title": "Access & voice limits",
        "short": "Content unlocks via access keys or an admin grant; voice practice has a fair-use daily limit."
      }
    ]
  }
];

export const APP_HELP_TEXT = "Home:\n- Today's Focus: Home shows your streak, XP, and the recommended next step for your chosen path.\n\nLearning:\n- Lesson roadmap: Learning holds your lesson roadmap by month; open a month to see its lessons.\n- Look up any word: Vocabulary lookup accepts Portuguese OR English and tolerates accents and small typos.\n\nPractice:\n- Practice modes: Practice has focused drills — listening, pattern building, and quizzes.\n- Situation Simulator: A role-play conversation at difficulty levels 1–5 where you choose replies or speak.\n- Browse situations: Browse any track, level, or situation freely — nothing is locked.\n\nTutor (Chat):\n- AI tutor chat: Chat with your tutor any time; tap the mic to speak. Read-aloud is opt-in.\n- In-app help: Ask the in-app help chat how to do something and it points you to the right place.\n\nProfile:\n- Learning paths: Switch between four learning paths anytime in Profile → Learning Path; progress is shared.\n- Goal track: Pick a life goal and the app orders that track by level; choose your goal below the switcher.\n- Use it offline: Download lessons for offline use by whole track or one situation at a time.\n- Appearance & audio: Set light / dark / system appearance, audio speed, and choose your tutor in Profile.\n- Getting around & Sign Out: Move between the five tabs; Sign Out is always at the bottom of the navigation sidebar.\n\nAccount & Settings:\n- Support & account: Report a problem or send a message via Support; account settings live in Profile.\n- Access & voice limits: Content unlocks via access keys or an admin grant; voice practice has a fair-use daily limit.";
