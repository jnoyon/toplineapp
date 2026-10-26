import { useEffect, useState } from "react";

import { formatCountdown, getExamState, toDate } from "../examUtils";

import ExamResultCard from "./ExamResultsCard";

const ExamCard = ({
  exam,
  result,
  attempt,
  onParticipate,
  onResume,
  onViewAnswers,
  canReviewAnswers = false,
  busy,
  departmentName,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const state = getExamState(exam, new Date(now));

  const start = toDate(exam.startTime);
  const finish = toDate(exam.finishTime);

  const questions = Array.isArray(exam.questions)
    ? exam.questions
    : Array.isArray(exam.questionList)
      ? exam.questionList
      : [];

  const totalQuestions = questions.length;
  const fullMarks = exam.totalMarks ?? exam.totalScore ?? totalQuestions;

  const remainingTime =
    state === "upcoming" ? start?.getTime() - now : finish?.getTime() - now;

  const isRunning = state === "active";
  const hasAttempt = attempt?.status === "in_progress";

  // Local countdown অনুযায়ী deadline যাচাই।
  const isBeforeDeadline = Boolean(finish && now < finish.getTime());

  const canShowAnswers =
    Boolean(result) &&
    isBeforeDeadline &&
    canReviewAnswers &&
    typeof onViewAnswers === "function";

  return (
    <article className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition hover:shadow-md">
      <div className="p-5">
        {/* Exam heading */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-sm text-base-content/60">
              {exam.departmentName || departmentName}
            </p>

            <h2 className="break-words text-xl font-bold">
              {exam.title || exam.name || "অনলাইন পরীক্ষা"}
            </h2>

            <p className="mt-1 text-sm text-primary">
              {exam.subjectName || exam.subject || ""}
            </p>
          </div>

          <span
            className={`badge shrink-0 ${
              isRunning
                ? "badge-success"
                : state === "upcoming"
                  ? "badge-info"
                  : state === "disabled"
                    ? "badge-error"
                    : "badge-ghost"
            }`}
          >
            {isRunning
              ? "পরীক্ষা চলমান"
              : state === "upcoming"
                ? "শুরু হয়নি"
                : state === "disabled"
                  ? "বন্ধ"
                  : state === "expired"
                    ? "সময় শেষ"
                    : "সময়সূচি নেই"}
          </span>
        </div>

        {/* Exam information */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">মোট প্রশ্ন</p>

            <p className="mt-1 text-lg font-bold">{totalQuestions}</p>
          </div>

          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">পূর্ণমান</p>

            <p className="mt-1 text-lg font-bold">{fullMarks}</p>
          </div>

          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">পরীক্ষার সময়</p>

            <p className="mt-1 text-sm font-semibold">
              {Number(exam.durationMinutes || 0)} মিনিট{" "}
              {Number(exam.durationSeconds || 0)} সেকেন্ড
            </p>
          </div>

          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">
              {state === "upcoming" ? "শুরু হতে বাকি" : "শেষ হতে বাকি"}
            </p>

            <p className="mt-1 font-mono font-bold">
              {remainingTime > 0 ? formatCountdown(remainingTime) : "00:00:00"}
            </p>
          </div>
        </div>

        {/* Exam schedule */}
        {start && finish && (
          <div className="mt-4 space-y-1 text-xs text-base-content/60 sm:text-sm">
            <p>শুরু: {start.toLocaleString("bn-BD")}</p>

            <p>শেষ: {finish.toLocaleString("bn-BD")}</p>
          </div>
        )}

        {/* Submitted result */}
        {result ? (
          <div className="mt-5 space-y-3">
            <ExamResultCard result={result} departmentName={departmentName} />

            {canShowAnswers ? (
              <button
                type="button"
                className="btn btn-outline btn-primary w-full"
                onClick={() => onViewAnswers(exam, result)}
              >
                সঠিক ও ভুল উত্তর দেখুন
              </button>
            ) : (
              <button type="button" className="btn btn-outline w-full" disabled>
                {isBeforeDeadline
                  ? "উত্তর পর্যালোচনা উপলভ্য নয়"
                  : "উত্তর দেখার সময় শেষ"}
              </button>
            )}
          </div>
        ) : hasAttempt ? (
          <button
            type="button"
            className="btn btn-primary mt-5 w-full"
            onClick={() => onResume(exam, attempt)}
            disabled={busy || !isRunning}
          >
            {busy
              ? "অপেক্ষা করুন..."
              : isRunning
                ? "পরীক্ষা চালিয়ে যাও"
                : "পরীক্ষা চালানোর সময় শেষ"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary mt-5 w-full"
            disabled={!isRunning || busy}
            onClick={() => onParticipate(exam)}
          >
            {busy
              ? "অপেক্ষা করুন..."
              : isRunning
                ? "পরীক্ষায় অংশগ্রহণ করুন"
                : state === "upcoming"
                  ? "পরীক্ষা শুরুর অপেক্ষায়"
                  : state === "disabled"
                    ? "পরীক্ষা বন্ধ"
                    : "অংশগ্রহণের সময় শেষ"}
          </button>
        )}
      </div>
    </article>
  );
};

export default ExamCard;
