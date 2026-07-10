// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/LearningView.tsx
// Description: Learning tab extracted verbatim from App.tsx renderLearning: 6-month roadmap,
//   month activation, reorderable daily curriculum with review mode, plus the lesson detail
//   sheet and its request/suggest/correction/vocab modals. All state lives in the learning
//   slice hooks (useLessons/useLessonModals) so drafts survive tab switches.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { BookOpen, CheckCircle2, ChevronRight, Download, GripVertical, PlusCircle, Sparkles, Youtube, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { learningPlan } from '../../data/curriculum';
import { Lesson, UserProfile } from '../../types';
import { LessonDetailModal } from './LessonDetailModal';
import { RequestLessonModal } from './RequestLessonModal';
import { SuggestVideoModal } from './SuggestVideoModal';
import { CorrectionModal } from './CorrectionModal';
import { VocabLookupModal } from './VocabLookupModal';
import { useLessons } from './useLessons';
import { useLessonModals } from './useLessonModals';

interface LearningViewProps {
  profile: UserProfile | null;
  lessonsSlice: ReturnType<typeof useLessons>;
  lessonModals: ReturnType<typeof useLessonModals>;
  openPracticeModal: () => void;
  startAIPractice: (lesson: Lesson, isHelp?: boolean) => Promise<void>;
  openQuiz: () => void;
  playSpeech: (text: string) => void;
}

export const LearningView = ({
  profile,
  lessonsSlice,
  lessonModals,
  openPracticeModal,
  startAIPractice,
  openQuiz,
  playSpeech
}: LearningViewProps) => {
  const {
    lessons,
    selectedLesson, setSelectedLesson,
    selectedMonth, setSelectedMonth,
    isReviewMode, setIsReviewMode,
    sortedLessons,
    handleActivateMonth,
    handleReorder,
  } = lessonsSlice;

  const {
    isRequestModalOpen, setIsRequestModalOpen,
    requestTheme, setRequestTheme,
    requestDesc, setRequestDesc,
    isSuggestionModalOpen, setIsSuggestionModalOpen,
    suggestionUrl, setSuggestionUrl,
    suggestionNote, setSuggestionNote,
    isCorrectionModalOpen, setIsCorrectionModalOpen,
    correctionText, setCorrectionText,
    isCorrectionLoading,
    isVocabModalOpen, setIsVocabModalOpen,
    vocabQuery, setVocabQuery,
    vocabResult, setVocabResult,
    isVocabLoading,
    handleRequestLesson,
    handleSuggestVideo,
    handleSubmitCorrection,
    handleVocabLookup,
  } = lessonModals;

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full pb-32 no-scrollbar">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Learning Plan</h1>
        <button
          onClick={openPracticeModal}
          className="p-3 bg-ios-blue text-white rounded-full shadow-lg active:scale-95 transition-transform"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      </div>

      <div className="bg-card rounded-3xl p-6 ios-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">6-Month Roadmap</h2>
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="flex items-center space-x-1 text-ios-blue text-xs font-bold"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Request Theme</span>
          </button>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-4 no-scrollbar">
          {learningPlan.map((p) => (
            <button
              key={p.month}
              onClick={() => setSelectedMonth(p.month)}
              className={cn(
                "flex-shrink-0 w-24 h-24 rounded-2xl flex flex-col items-center justify-center transition-all relative",
                selectedMonth === p.month ? "bg-ios-blue text-white scale-105 shadow-md" : "bg-ios-bg text-ios-gray"
              )}
            >
              {profile?.active_month === p.month && (
                <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-1 shadow-sm">
                  <CheckCircle2 className="w-3 h-3" />
                </div>
              )}
              <span className="text-[10px] font-bold uppercase">Month</span>
              <span className="text-2xl font-black">{p.month}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedMonth}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-card rounded-3xl p-6 ios-shadow space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-ios-blue">{learningPlan[selectedMonth-1].title}</h3>
            <div className="flex items-center space-x-2">
              {profile?.active_month === selectedMonth ? (
                <span className="flex items-center space-x-1 text-green-500 text-[10px] font-bold uppercase">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Active</span>
                </span>
              ) : (
                <button
                  onClick={() => handleActivateMonth(selectedMonth)}
                  className="flex items-center space-x-1 text-ios-blue text-[10px] font-bold uppercase bg-ios-bg px-2 py-1 rounded-full"
                >
                  <Download className="w-3 h-3" />
                  <span>Activate</span>
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-ios-gray leading-relaxed">
            {learningPlan[selectedMonth-1].details}
          </p>
          <div className="p-4 bg-ios-bg rounded-2xl">
            <h4 className="text-[10px] font-bold text-ios-gray uppercase mb-2">Focus Areas</h4>
            <p className="text-sm font-medium">{learningPlan[selectedMonth-1].focus}</p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-ios-gray uppercase">Daily Curriculum</h4>
              <button
                onClick={() => setIsReviewMode(!isReviewMode)}
                className={cn(
                  "text-[10px] font-bold uppercase px-2 py-1 rounded-full transition-colors",
                  isReviewMode ? "bg-ios-blue text-white" : "bg-ios-bg text-ios-gray"
                )}
              >
                {isReviewMode ? "Finish Review" : "Review Mode"}
              </button>
            </div>

            <Reorder.Group axis="y" values={sortedLessons} onReorder={handleReorder} className="space-y-3">
              {sortedLessons.map(lesson => {
                const isCompleted = profile?.completed_lessons.includes(lesson.id);
                const canDrag = isReviewMode && isCompleted;

                return (
                  <Reorder.Item
                    key={lesson.id}
                    value={lesson}
                    dragListener={canDrag}
                    className={cn(
                      "flex items-center justify-between p-4 bg-ios-bg rounded-2xl cursor-pointer active:scale-[0.98] transition-all",
                      canDrag && "border-2 border-dashed border-ios-blue/30"
                    )}
                    onClick={() => !isReviewMode && setSelectedLesson(lesson)}
                  >
                    <div className="flex items-center">
                      {canDrag && <GripVertical className="w-4 h-4 text-ios-gray mr-2" />}
                      <div className="w-10 h-10 rounded-xl bg-card flex flex-col items-center justify-center text-ios-blue mr-3 shadow-sm border border-ios-blue/10">
                        <span className="text-[8px] font-bold uppercase leading-none">Day</span>
                        <span className="text-sm font-black leading-none">{lesson.day}</span>
                      </div>
                      <div>
                        <span className="text-sm font-bold block">{lesson.title}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-ios-gray font-medium">{lesson.category}</span>
                          {lesson.video_url && <Youtube className="w-3 h-3 text-red-500" />}
                          {isCompleted && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                        </div>
                      </div>
                    </div>
                    {!isReviewMode && <ChevronRight className="w-4 h-4 text-ios-gray" />}
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>

          <button
            onClick={() => {
              const monthLessons = lessons.filter(l => l.level === selectedMonth).sort((a, b) => (a.day || 0) - (b.day || 0));
              const nextLesson = monthLessons.find(l => !profile?.completed_lessons.includes(l.id)) || monthLessons[0];
              if (nextLesson) {
                startAIPractice(nextLesson);
              }
            }}
            className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all mt-4"
          >
            Start Today's Lesson
          </button>
        </motion.div>
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card p-4 rounded-3xl ios-shadow flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold uppercase text-ios-gray">Vocabulary</span>
          <span className="text-lg font-black">{profile?.completed_lessons?.length || 0 * 12}</span>
        </div>
        <div className="bg-card p-4 rounded-3xl ios-shadow flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 bg-green-100 text-green-500 rounded-full flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold uppercase text-ios-gray">Streak</span>
          <span className="text-lg font-black">{profile?.streak || 0} Days</span>
        </div>
      </div>

      {/* Lesson Detail Modal */}
      <LessonDetailModal
        selectedLesson={selectedLesson}
        setSelectedLesson={setSelectedLesson}
        playSpeech={playSpeech}
        startAIPractice={startAIPractice}
        openQuiz={openQuiz}
        setIsVocabModalOpen={setIsVocabModalOpen}
        setIsSuggestionModalOpen={setIsSuggestionModalOpen}
        setIsCorrectionModalOpen={setIsCorrectionModalOpen}
      />

      <RequestLessonModal
        isRequestModalOpen={isRequestModalOpen}
        setIsRequestModalOpen={setIsRequestModalOpen}
        requestTheme={requestTheme}
        setRequestTheme={setRequestTheme}
        requestDesc={requestDesc}
        setRequestDesc={setRequestDesc}
        handleRequestLesson={handleRequestLesson}
      />

      <SuggestVideoModal
        isSuggestionModalOpen={isSuggestionModalOpen}
        setIsSuggestionModalOpen={setIsSuggestionModalOpen}
        suggestionUrl={suggestionUrl}
        setSuggestionUrl={setSuggestionUrl}
        suggestionNote={suggestionNote}
        setSuggestionNote={setSuggestionNote}
        handleSuggestVideo={handleSuggestVideo}
      />

      <CorrectionModal
        isCorrectionModalOpen={isCorrectionModalOpen}
        setIsCorrectionModalOpen={setIsCorrectionModalOpen}
        correctionText={correctionText}
        setCorrectionText={setCorrectionText}
        isCorrectionLoading={isCorrectionLoading}
        handleSubmitCorrection={handleSubmitCorrection}
      />

      <VocabLookupModal
        isVocabModalOpen={isVocabModalOpen}
        setIsVocabModalOpen={setIsVocabModalOpen}
        vocabQuery={vocabQuery}
        setVocabQuery={setVocabQuery}
        vocabResult={vocabResult}
        setVocabResult={setVocabResult}
        isVocabLoading={isVocabLoading}
        handleVocabLookup={handleVocabLookup}
        playSpeech={playSpeech}
      />
    </div>
  );
};

export default LearningView;
