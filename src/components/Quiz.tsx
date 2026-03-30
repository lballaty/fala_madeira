import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, ArrowRight, Volume2 } from 'lucide-react';
import { Lesson, QuizQuestion } from '../types';
import { cn } from '../lib/utils';

interface QuizProps {
  lesson: Lesson;
  onComplete: (score: number) => void;
  onClose: () => void;
  playSpeech: (text: string) => void;
}

export const Quiz: React.FC<QuizProps> = ({ lesson, onComplete, onClose, playSpeech }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [userInput, setUserInput] = useState('');

  // Generate questions based on lesson content
  const [questions] = useState<QuizQuestion[]>(() => {
    const vocabQuestions: QuizQuestion[] = lesson.vocabulary.map((v, i) => ({
      id: `v-${i}`,
      type: 'multiple-choice' as const,
      question: `What is the translation for "${v.word}"?`,
      answer: v.translation,
      options: [
        v.translation,
        ...lesson.vocabulary
          .filter(other => other.word !== v.word)
          .map(other => other.translation)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
      ].sort(() => Math.random() - 0.5)
    }));

    const patternQuestions: QuizQuestion[] = lesson.patterns.map((p, i) => ({
      id: `p-${i}`,
      type: 'translation' as const,
      question: `Listen and type what you hear:`,
      answer: p,
    }));

    return [...vocabQuestions, ...patternQuestions]
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);
  });

  const currentQuestion = questions[currentQuestionIndex];

  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "") // Remove punctuation
      .replace(/\s{2,}/g, " "); // Remove extra spaces
  };

  const handleAnswer = (answer: string) => {
    if (isAnswered) return;
    setSelectedOption(answer);
    setIsAnswered(true);
    
    const normalizedUser = normalizeText(answer);
    const normalizedCorrect = normalizeText(currentQuestion.answer);

    if (normalizedUser === normalizedCorrect) {
      setScore(prev => prev + 1);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setUserInput('');
    } else {
      onComplete(score);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      <header className="p-6 border-b flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={onClose} className="p-2 bg-ios-bg rounded-full">
            <XCircle className="w-6 h-6 text-ios-gray" />
          </button>
          <div>
            <h2 className="font-bold">Quiz: {lesson.title}</h2>
            <div className="flex space-x-1 mt-1">
              {questions.map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "h-1.5 w-8 rounded-full transition-all",
                    i < currentQuestionIndex ? "bg-ios-blue" : i === currentQuestionIndex ? "bg-ios-blue/30" : "bg-ios-bg"
                  )} 
                />
              ))}
            </div>
          </div>
        </div>
        <span className="font-bold text-ios-blue">{score}/{questions.length}</span>
      </header>

      <main className="flex-1 p-6 flex flex-col justify-center max-w-md mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="space-y-4 text-center">
              <h3 className="text-2xl font-bold tracking-tight">{currentQuestion.question}</h3>
              {currentQuestion.id.startsWith('p-') && (
                <button 
                  onClick={() => playSpeech(currentQuestion.answer)}
                  className="p-3 bg-ios-blue/10 text-ios-blue rounded-full mx-auto flex items-center justify-center"
                >
                  <Volume2 className="w-6 h-6" />
                </button>
              )}
            </div>

            {currentQuestion.type === 'multiple-choice' ? (
              <div className="grid grid-cols-1 gap-3">
                {currentQuestion.options?.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(opt)}
                    className={cn(
                      "p-5 rounded-2xl text-left font-bold transition-all border-2",
                      isAnswered 
                        ? opt === currentQuestion.answer 
                          ? "bg-green-50 border-green-500 text-green-700"
                          : opt === selectedOption 
                            ? "bg-red-50 border-red-500 text-red-700"
                            : "bg-ios-bg border-transparent opacity-50"
                        : "bg-ios-bg border-transparent hover:border-ios-blue/30 active:scale-95"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <input 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Type the answer..."
                  className="w-full bg-ios-bg p-5 rounded-2xl outline-none font-bold text-center"
                  disabled={isAnswered}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnswer(userInput)}
                />
                {!isAnswered && (
                  <button 
                    onClick={() => handleAnswer(userInput)}
                    className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg"
                  >
                    Check Answer
                  </button>
                )}
                {isAnswered && (
                  <div className={cn(
                    "p-4 rounded-2xl text-center font-bold",
                    userInput.toLowerCase().trim() === currentQuestion.answer.toLowerCase().trim()
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  )}>
                    {userInput.toLowerCase().trim() === currentQuestion.answer.toLowerCase().trim() 
                      ? "Correct!" 
                      : `Incorrect. The answer was: ${currentQuestion.answer}`}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="p-6 border-t">
        <button 
          onClick={nextQuestion}
          disabled={!isAnswered}
          className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50 active:scale-95 transition-transform"
        >
          <span>{currentQuestionIndex === questions.length - 1 ? "Finish Quiz" : "Next Question"}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
};
