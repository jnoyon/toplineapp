import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import Swal from "sweetalert2";
import { AnimatePresence, motion } from "framer-motion";

import { db } from "../../assets/firebase/firebase.init";
import { formatCountdown, toDate } from "../examUtils";

/* =========================================================
   Helpers
========================================================= */

function getQuestions(exam) {
  if (Array.isArray(exam?.questions)) return exam.questions;
  if (Array.isArray(exam?.questionList)) return exam.questionList;

  return [];
}

function getOptions(question) {
  if (Array.isArray(question?.options)) return question.options;
  if (Array.isArray(question?.choices)) return question.choices;

  return [];
}

function getOptionText(option) {
  if (option === null || option === undefined) return "";

  if (typeof option === "object") {
    return String(
      option.text ??
        option.label ??
        option.value ??
        option.name ??
        option.option ??
        "",
    );
  }

  return String(option);
}

function getQuestionText(question) {
  return (
    question?.question ||
    question?.questionText ||
    question?.text ||
    question?.title ||
    question?.desc ||
    "প্রশ্নের বিবরণ পাওয়া যায়নি"
  );
}

function getCorrectOptionIndex(question) {
  const answer =
    question?.correctAnswer ??
    question?.correctOption ??
    question?.correctIndex ??
    question?.correctAnswerIndex ??
    question?.correctOptionIndex;

  if (answer === undefined || answer === null || answer === "") {
    return -1;
  }

  const index = Number(answer);
  const options = getOptions(question);

  return Number.isInteger(index) && index >= 0 && index < options.length
    ? index
    : -1;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let value = seed >>> 0;

  return function random() {
    value += 0x6d2b79f5;

    let result = value;

    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seedText) {
  const shuffled = [...items];
  const random = createSeededRandom(hashString(seedText));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));

    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function normalizeStoredIndex(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const index = Number(value);

  return Number.isInteger(index) && index >= 0 ? index : null;
}

/* =========================================================
   Main Component
========================================================= */

const ExamRunner = ({
  exam,
  attempt,
  student,
  departmentName,
  onSubmitted,
}) => {
  const questions = useMemo(() => getQuestions(exam), [exam]);

  const attemptId = attempt?.id;
  const examId = exam?.id;

  /* -------------------------------------------------------
     Stable question order
  ------------------------------------------------------- */

  const shuffledQuestionIndexes = useMemo(() => {
    return shuffleWithSeed(
      questions.map((_, index) => index),
      `${attemptId || examId || "exam"}:question-order`,
    );
  }, [questions, attemptId, examId]);

  /* -------------------------------------------------------
     Stable option order
  ------------------------------------------------------- */

  const shuffledOptionIndexes = useMemo(() => {
    const result = {};

    questions.forEach((question, questionIndex) => {
      result[questionIndex] = shuffleWithSeed(
        getOptions(question).map((_, optionIndex) => optionIndex),
        `${attemptId || examId || "exam"}:question:${questionIndex}:options`,
      );
    });

    return result;
  }, [questions, attemptId, examId]);

  /* -------------------------------------------------------
     State
  ------------------------------------------------------- */

  const [answers, setAnswers] = useState(() => attempt?.answers || {});

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() => {
    const savedIndex = Number(attempt?.currentQuestionIndex ?? 0);

    if (!Number.isInteger(savedIndex) || savedIndex < 0) return 0;

    return Math.min(savedIndex, questions.length);
  });

  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [saveError, setSaveError] = useState("");

  const answersRef = useRef(attempt?.answers || {});
  const submittingRef = useRef(false);
  const advancingRef = useRef(false);
  const currentIndexRef = useRef(currentQuestionIndex);
  const timerRef = useRef(null);

  /* -------------------------------------------------------
     Exam timing
  ------------------------------------------------------- */

  const deadline = useMemo(
    () => toDate(attempt?.deadlineAt),
    [attempt?.deadlineAt],
  );

  const startedAt = useMemo(
    () => toDate(attempt?.startedAt) || new Date(),
    [attempt?.startedAt],
  );

  const remainingMs = deadline ? Math.max(0, deadline.getTime() - now) : 0;

  const totalQuestions = questions.length;
  const isFinished = currentQuestionIndex >= totalQuestions;

  const studentId = String(student?.studentId ?? attempt?.studentId ?? "");

  const originalQuestionIndex = isFinished
    ? -1
    : shuffledQuestionIndexes[currentQuestionIndex];

  const currentQuestion =
    originalQuestionIndex >= 0 ? questions[originalQuestionIndex] : null;

  const currentOptions = currentQuestion ? getOptions(currentQuestion) : [];

  const selectedOption =
    currentQuestion && answers[originalQuestionIndex] !== undefined
      ? normalizeStoredIndex(answers[originalQuestionIndex])
      : null;

  const progressPercent =
    totalQuestions > 0
      ? (Math.min(currentQuestionIndex + 1, totalQuestions) / totalQuestions) *
        100
      : 0;

  /* -------------------------------------------------------
     Clear answer timer
  ------------------------------------------------------- */

  const clearAnswerTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* -------------------------------------------------------
     Save progress
  ------------------------------------------------------- */

  const saveProgress = useCallback(
    async (nextIndex) => {
      if (!attemptId) return;

      try {
        await updateDoc(doc(db, "examAttempts", attemptId), {
          currentQuestionIndex: nextIndex,
          lastActivityAt: serverTimestamp(),
        });

        setSaveError("");
      } catch (error) {
        console.error("Save exam progress error:", error);

        setSaveError(
          error?.code === "permission-denied"
            ? "পরীক্ষার অগ্রগতি সংরক্ষণ করা যাচ্ছে না।"
            : "অগ্রগতি সংরক্ষণে সমস্যা হচ্ছে। ইন্টারনেট সংযোগ পরীক্ষা করো।",
        );
      }
    },
    [attemptId],
  );

  /* -------------------------------------------------------
     Advance to next question
  ------------------------------------------------------- */

  const advanceQuestion = useCallback(
    async (expectedIndex) => {
      if (submittingRef.current || advancingRef.current) return;

      if (currentIndexRef.current !== expectedIndex) return;

      advancingRef.current = true;
      clearAnswerTimer();

      const nextIndex = Math.min(expectedIndex + 1, totalQuestions);

      currentIndexRef.current = nextIndex;
      setCurrentQuestionIndex(nextIndex);

      try {
        await saveProgress(nextIndex);
      } finally {
        advancingRef.current = false;
      }
    },
    [clearAnswerTimer, saveProgress, totalQuestions],
  );

  /* -------------------------------------------------------
     Select answer
  ------------------------------------------------------- */

  const handleAnswerChange = useCallback(
    async (questionIndex, optionIndex) => {
      if (submittingRef.current || advancingRef.current || !attemptId) {
        return;
      }

      if (questionIndex !== originalQuestionIndex) return;

      clearAnswerTimer();

      const nextAnswers = {
        ...answersRef.current,
        [questionIndex]: optionIndex,
      };

      // Update UI immediately.
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
      setSaveError("");
      setSavingAnswer(true);

      try {
        await updateDoc(doc(db, "examAttempts", attemptId), {
          answers: nextAnswers,
          lastActivityAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Save answer error:", error);

        setSaveError(
          error?.code === "permission-denied"
            ? "উত্তর সংরক্ষণের অনুমতি নেই।"
            : "উত্তর সংরক্ষণে সমস্যা হচ্ছে। আবার চেষ্টা করো।",
        );
      } finally {
        setSavingAnswer(false);
      }
    },
    [attemptId, clearAnswerTimer, originalQuestionIndex],
  );

  /* -------------------------------------------------------
     Auto-next
  ------------------------------------------------------- */

  useEffect(() => {
    if (
      submitting ||
      isFinished ||
      !currentQuestion ||
      selectedOption === null ||
      selectedOption === undefined
    ) {
      clearAnswerTimer();
      return undefined;
    }

    const expectedIndex = currentQuestionIndex;

    timerRef.current = setTimeout(() => {
      void advanceQuestion(expectedIndex);
    }, 1000);

    return clearAnswerTimer;
  }, [
    currentQuestionIndex,
    currentQuestion,
    selectedOption,
    submitting,
    isFinished,
    clearAnswerTimer,
    advanceQuestion,
  ]);

  /* -------------------------------------------------------
     Skip question
  ------------------------------------------------------- */

  const handleSkip = useCallback(async () => {
    if (submittingRef.current || advancingRef.current || isFinished) {
      return;
    }

    clearAnswerTimer();
    await advanceQuestion(currentQuestionIndex);
  }, [advanceQuestion, clearAnswerTimer, currentQuestionIndex, isFinished]);

  /* -------------------------------------------------------
     Submit exam
  ------------------------------------------------------- */

  const submitExam = useCallback(
    async (reason = "manual") => {
      if (submittingRef.current) return;

      submittingRef.current = true;
      setSubmitting(true);
      setSaveError("");
      clearAnswerTimer();

      try {
        if (!studentId) {
          throw new Error("শিক্ষার্থীর পরিচয় পাওয়া যায়নি।");
        }

        if (!attemptId) {
          throw new Error("পরীক্ষার attempt পাওয়া যায়নি।");
        }

        const selectedAnswers = answersRef.current || {};

        const review = questions.map((question, index) => {
          const rawAnswer = selectedAnswers[index];

          const selectedAnswer =
            rawAnswer === undefined || rawAnswer === null || rawAnswer === ""
              ? null
              : Number(rawAnswer);

          const correctAnswer = getCorrectOptionIndex(question);
          const options = getOptions(question);

          const isCorrect =
            selectedAnswer !== null &&
            correctAnswer >= 0 &&
            selectedAnswer === correctAnswer;

          return {
            question: getQuestionText(question),
            options: [...options],
            correctAnswer,
            selectedAnswer,
            isCorrect,
            explanation: question.explanation || "",
          };
        });

        const correctAnswers = review.filter((item) => item.isCorrect).length;

        const effectiveEnd = Math.min(
          Date.now(),
          deadline?.getTime() ?? Date.now(),
        );

        const timeNeededSeconds = Math.max(
          0,
          Math.floor((effectiveEnd - startedAt.getTime()) / 1000),
        );

        const resultData = {
          examId,
          examTitle: exam.title || "",
          subject: exam.subject || "",
          subjectName: exam.subjectName || exam.subject || "",

          studentUid: studentId,
          studentId,

          studentDocumentId:
            student?.documentId ?? attempt.studentDocumentId ?? "",

          studentName: student?.name ?? attempt.studentName ?? "",

          departmentId:
            student?.departmentId ??
            attempt.departmentId ??
            exam.departmentId ??
            null,

          departmentName:
            departmentName ||
            attempt.departmentName ||
            exam.departmentName ||
            "",

          classId: student?.classId ?? attempt.classId ?? "",
          className: student?.className ?? attempt.className ?? "",
          batchId: student?.batchId ?? attempt.batchId ?? "",
          batchName: student?.batchName ?? attempt.batchName ?? "",

          totalQuestions,
          correctAnswers,

          incorrectAnswers: review.filter(
            (item) => item.selectedAnswer !== null && !item.isCorrect,
          ).length,

          unansweredQuestions: review.filter(
            (item) => item.selectedAnswer === null,
          ).length,

          marks: correctAnswers,
          totalMarks: totalQuestions,

          percentage:
            totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0,

          answers: selectedAnswers,
          review,
          timeNeededSeconds,
          submitReason: reason,
          submittedAt: serverTimestamp(),
        };

        const batch = writeBatch(db);

        batch.set(doc(db, "examResults", attemptId), resultData);

        batch.delete(doc(db, "examAttempts", attemptId));

        await batch.commit();

        await Swal.fire({
          icon: "success",
          title: "পরীক্ষা জমা হয়েছে",
          html: `
            <div style="font-size:16px;line-height:2">
              <div>প্রাপ্ত নম্বর</div>
              <div style="font-size:32px;font-weight:800">
                ${correctAnswers} / ${totalQuestions}
              </div>
            </div>
          `,
          confirmButtonText: "ফলাফল দেখুন",
          confirmButtonColor: "#4f46e5",
        });

        onSubmitted?.({
          ...resultData,
          id: attemptId,
          submittedAt: new Date(),
        });
      } catch (error) {
        console.error("Submit exam error:", error);

        setSaveError(
          error?.code === "permission-denied"
            ? "ফলাফল সংরক্ষণের অনুমতি নেই। Firebase Security Rules পরীক্ষা করো।"
            : error?.message ||
                "পরীক্ষা জমা দেওয়া যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করো।",
        );

        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [
      studentId,
      student,
      attempt,
      attemptId,
      questions,
      exam,
      examId,
      deadline,
      startedAt,
      departmentName,
      totalQuestions,
      onSubmitted,
      clearAnswerTimer,
    ],
  );

  /* -------------------------------------------------------
     Countdown and auto-submit
  ------------------------------------------------------- */

  useEffect(() => {
    const timer = setInterval(() => {
      const currentTime = Date.now();

      setNow(currentTime);

      if (
        deadline &&
        currentTime >= deadline.getTime() &&
        !submittingRef.current
      ) {
        void submitExam("time_expired");
      }
    }, 500);

    return () => clearInterval(timer);
  }, [deadline, submitExam]);

  /* -------------------------------------------------------
     Browser back / page close protection
  ------------------------------------------------------- */

  useEffect(() => {
    window.history.pushState(
      { examInProgress: true },
      "",
      window.location.href,
    );

    const handlePopState = async () => {
      if (submittingRef.current) return;

      const choice = await Swal.fire({
        icon: "warning",
        title: "পরীক্ষা থেকে বের হতে চাও?",
        text: "ফিরে গেলে পরীক্ষা জমা হয়ে যাবে।",
        showCancelButton: true,
        confirmButtonText: "জমা দিয়ে বের হব",
        cancelButtonText: "পরীক্ষা চালিয়ে যাব",
        reverseButtons: true,
        allowOutsideClick: false,
      });

      if (choice.isConfirmed) {
        await submitExam("back_navigation");
      } else {
        window.history.pushState(
          { examInProgress: true },
          "",
          window.location.href,
        );
      }
    };

    const handleBeforeUnload = (event) => {
      if (submittingRef.current) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [submitExam]);

  /* -------------------------------------------------------
     Synchronize current question index
  ------------------------------------------------------- */

  useEffect(() => {
    currentIndexRef.current = currentQuestionIndex;
    advancingRef.current = false;
  }, [currentQuestionIndex]);

  /* -------------------------------------------------------
     Empty exam
  ------------------------------------------------------- */

  if (totalQuestions === 0) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-10">
        <section className="w-full rounded-3xl border border-warning/30 bg-base-100 p-7 text-center shadow-sm">
          <div className="mb-4 text-5xl">📭</div>

          <h2 className="text-xl font-extrabold">
            পরীক্ষার প্রশ্ন পাওয়া যায়নি
          </h2>

          <p className="mt-3 text-sm leading-7 text-base-content/60">
            পরীক্ষার ডেটায় questions অথবা questionList আছে কি না যাচাই করো।
          </p>
        </section>
      </main>
    );
  }

  /* -------------------------------------------------------
     Exam UI
  ------------------------------------------------------- */

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-3 pb-6 pt-3 sm:px-5 sm:pt-5">
      {/* Sticky exam header */}
      <header className="sticky top-0 z-30 mb-4 rounded-2xl border border-base-300 bg-base-100/95 p-3 shadow-sm backdrop-blur-xl sm:mb-6 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold sm:text-xl">
              {exam.title || exam.name || "অনলাইন পরীক্ষা"}
            </h1>

            <p className="mt-1 truncate text-xs text-base-content/55 sm:text-sm">
              {exam.subjectName || exam.subject || "অনলাইন পরীক্ষা"}
              {departmentName ? ` · ${departmentName}` : ""}
            </p>
          </div>

          <div
            className={`shrink-0 rounded-xl px-3 py-2 text-center ${
              remainingMs <= 60000
                ? "bg-error/10 text-error"
                : "bg-primary/10 text-primary"
            }`}
          >
            <p className="text-[10px] font-semibold opacity-70 sm:text-xs">
              বাকি সময়
            </p>

            <p className="font-mono text-lg font-extrabold tabular-nums sm:text-xl">
              {formatCountdown(remainingMs)}
            </p>
          </div>
        </div>

        {!isFinished && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-base-content/70">
                প্রশ্ন {currentQuestionIndex + 1} / {totalQuestions}
              </span>

              <span className="font-medium text-base-content/50">
                {Math.round(progressPercent)}%
              </span>
            </div>

            <progress
              className="progress progress-primary h-1.5 w-full"
              value={progressPercent}
              max={100}
            />
          </div>
        )}
      </header>

      {/* Save error */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-4 rounded-xl border border-error/20 bg-error/5 p-3 text-sm leading-6 text-error"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true">⚠️</span>
              <p>{saveError}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current question */}
      {!isFinished && currentQuestion && (
        <>
          <AnimatePresence mode="wait">
            <motion.section
              key={`${attemptId}-${currentQuestionIndex}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm sm:rounded-3xl"
            >
              {/* Question */}
              <div className="border-b border-base-300 bg-base-200/30 p-4 sm:p-6">
                <h2 className="whitespace-pre-wrap text-base font-bold leading-8 sm:text-xl sm:leading-9">
                  {getQuestionText(currentQuestion)}
                </h2>

                {currentQuestion.image && (
                  <img
                    src={currentQuestion.image}
                    alt="প্রশ্নের ছবি"
                    loading="lazy"
                    className="mt-4 max-h-72 w-auto max-w-full rounded-xl object-contain"
                  />
                )}
              </div>

              {/* Options */}
              <div className="space-y-3 p-3 sm:p-5">
                {(shuffledOptionIndexes[originalQuestionIndex] || []).map(
                  (optionIndex, displayIndex) => {
                    const option = currentOptions[optionIndex];
                    const isSelected = selectedOption === optionIndex;
                    const label = String.fromCharCode(65 + displayIndex);

                    return (
                      <motion.button
                        key={`${originalQuestionIndex}-${optionIndex}`}
                        type="button"
                        whileTap={{ scale: 0.99 }}
                        onClick={() =>
                          handleAnswerChange(originalQuestionIndex, optionIndex)
                        }
                        disabled={submitting || advancingRef.current}
                        aria-pressed={isSelected}
                        className={`flex min-h-[60px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 sm:min-h-[68px] sm:gap-4 sm:p-4 ${
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                            : "border-base-300 bg-base-100 active:bg-base-200 hover:border-primary/40 sm:hover:bg-base-200/50"
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                            isSelected
                              ? "bg-primary text-primary-content"
                              : "bg-base-200 text-base-content/70"
                          }`}
                        >
                          {label}
                        </span>

                        <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-medium leading-7 sm:text-base">
                          {getOptionText(option)}
                        </span>

                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-base-300"
                          }`}
                        >
                          {isSelected && (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </span>
                      </motion.button>
                    );
                  },
                )}
              </div>

              {/* Selection status */}
              <div className="px-3 pb-3 sm:px-5 sm:pb-5">
                <div className="flex min-h-10 items-center gap-2 rounded-xl bg-base-200/50 px-3 py-2 text-xs text-base-content/55 sm:text-sm">
                  {savingAnswer ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      উত্তর সংরক্ষণ হচ্ছে...
                    </>
                  ) : selectedOption !== null &&
                    selectedOption !== undefined ? (
                    <>
                      <span className="text-success" aria-hidden="true">
                        ✓
                      </span>
                      উত্তর নির্বাচিত হয়েছে
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">👆</span>
                      একটি উত্তর নির্বাচন করো
                    </>
                  )}
                </div>
              </div>
            </motion.section>
          </AnimatePresence>

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting || advancingRef.current}
              className="btn btn-outline min-h-12 flex-1 rounded-xl sm:flex-none"
            >
              Skip →
            </button>

            <p className="text-right text-[11px] leading-5 text-base-content/45 sm:text-xs">
              {selectedOption !== null && selectedOption !== undefined
                ? "পরের প্রশ্ন স্বয়ংক্রিয়ভাবে আসবে"
                : "উত্তর না জানলে Skip করো"}
            </p>
          </div>
        </>
      )}

      {/* After the final question, show only the submit button. */}
      {isFinished && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-2"
        >
          <button
            type="button"
            className="btn btn-primary min-h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/15"
            disabled={submitting}
            onClick={async () => {
              const choice = await Swal.fire({
                icon: "question",
                title: "পরীক্ষা জমা দেবে?",
                text: "জমা দেওয়ার পর আর উত্তর পরিবর্তন করা যাবে না।",
                showCancelButton: true,
                confirmButtonText: "হ্যাঁ, জমা দাও",
                cancelButtonText: "ফিরে যাই",
                reverseButtons: true,
                confirmButtonColor: "#4f46e5",
                allowOutsideClick: false,
              });

              if (choice.isConfirmed) {
                await submitExam("manual");
              }
            }}
          >
            {submitting ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                পরীক্ষা জমা হচ্ছে...
              </>
            ) : (
              "পরীক্ষা জমা দিন"
            )}
          </button>
        </motion.section>
      )}
    </main>
  );
};

export default ExamRunner;
