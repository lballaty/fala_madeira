export interface Lesson {
  id: string;
  title: string;
  description: string;
  level: number; // 1 to 6 (months)
  day: number;   // 1 to 30 (days within month)
  category: 'daily' | 'social' | 'travel' | 'work' | 'custom';
  patterns: string[];
  vocabulary: { word: string; translation: string; pronunciation?: string }[];
  is_static: boolean;
  created_at?: string;
  goals?: string[];
  explanation?: string;
  video_url?: string;
}

export interface QuizQuestion {
  id: string;
  type: 'translation' | 'multiple-choice' | 'matching';
  question: string;
  answer: string;
  options?: string[];
}

export interface Quiz {
  lesson_id: string;
  questions: QuizQuestion[];
}

export interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  status: 'open' | 'in-progress' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
}

export interface AppLog {
  id: string;
  user_id: string;
  event: string;
  details: string;
  timestamp: string;
  device_info?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  streak: number;
  xp: number;
  unlocked_level: number; // Max level unlocked
  completed_lessons: string[];
  last_active: string;
  selected_tutor_id?: string;
  active_month?: number;
  total_time_spent?: number; // in seconds
  role?: 'user' | 'admin';
  completed_lessons_order?: string[]; // Array of lesson IDs for custom review order
  subscription_tier?: 'free' | 'premium' | 'unlimited';
  voice_limit?: number;
  voice_usage_today?: number;
  last_voice_usage_date?: string;
  has_accepted_terms?: boolean;
  has_accepted_ai_usage?: boolean;
  playback_speed?: number;
  is_sound_enabled?: boolean;
}

export interface VideoSuggestion {
  id: string;
  lesson_id: string;
  user_id: string;
  video_url: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Tutor {
  id: string;
  name: string;
  age: number;
  gender: 'male' | 'female';
  description: string;
  avatar: string;
  personality: string;
}

export interface LessonRequest {
  id: string;
  user_id: string;
  theme: string;
  description: string;
  status: 'pending' | 'reviewed' | 'implemented';
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface LessonCorrection {
  id: string;
  lesson_id: string;
  user_id: string;
  correction_text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
