import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { formatCountdown, getExamState, toDate } from "../examUtils";
import ExamResultCard from "./ExamResultsCard";

const RETAKE_COST = 10;

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
  retakeUsed = false,
  studentPoint = 0,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const state = getExamState(exam, new Date(now));

  const start = toDate(exam.startTime);
  const finish = toDate(exam.finishTime);

  const poolSize = Array.isArray(exam.questions)
    ? exam.questions.length
    : Array.isArray(exam.questionList)
      ? exam.questionList.length
      : 0;

  const requestedCount = Number(exam.questionCount);

  const totalQuestions =
    Number.isInteger(requestedCount) && requestedCount > 0
      ? Math.min(requestedCount, poolSize || requestedCount)
      : poolSize;

  const fullMarks =
    exam.fullMarks ?? exam.totalMarks ?? exam.totalScore ?? totalQuestions;

  const remainingTime =
    state === "upcoming" ? start?.getTime() - now : finish?.getTime() - now;

  const isRunning = state === "active";
  const hasAttempt = attempt?.status === "in_progress";

  const isBeforeDeadline = Boolean(finish && now < finish.getTime());

  const canShowAnswers =
    Boolean(result) &&
    isBeforeDeadline &&
    canReviewAnswers &&
    typeof onViewAnswers === "function";

  const handleRetake = async () => {
    if (Number(studentPoint) < RETAKE_COST) {
      await Swal.fire({
        icon: "warning",
        title: "পর্যাপ্ত পয়েন্ট নেই",
        html: `তোমার বর্তমান পয়েন্ট <b>${studentPoint}</b>। Retake করতে <b>১০ পয়েন্ট</b> প্রয়োজন।`,
        confirmButtonText: "ঠিক আছে",
      });
      return;
    }

    const confirmation = await Swal.fire({
      icon: "warning",
      title: "আবার পরীক্ষা দিতে চাও?",
      html: `
        <div style="font-size:15px;line-height:2">
          Retake করতে তোমার <b>১০ পয়েন্ট</b> খরচ হবে।<br/>
          বর্তমান পয়েন্ট: <b>${studentPoint}</b><br/>
          অবশিষ্ট থাকবে: <b>${Number(studentPoint) - RETAKE_COST}</b><br/><br/>
          <span style="color:#dc2626">একটি পরীক্ষায় মাত্র একবার Retake করা যাবে।</span>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "১০ পয়েন্ট খরচ করে শুরু",
      cancelButtonText: "বাতিল",
      reverseButtons: true,
      confirmButtonColor: "#4f46e5",
    });

    if (confirmation.isConfirmed) {
      onParticipate(exam, true);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition hover:shadow-md">
      <div className="p-5">
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
                ? "শুরু হয়নি"
                : state === "disabled"
                  ? "বন্ধ"
                  : state === "expired"
                    ? "সময় শেষ"
                    : "সময়সূচি নেই"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">প্রশ্নসংখ্যা</p>
            <p className="mt-1 text-lg font-bold">{totalQuestions}</p>
          </div>

          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">পূর্ণমান</p>
            <p className="mt-1 text-lg font-bold">{fullMarks}</p>
          </div>

          <div className="rounded-xl bg-base-200 p-3">
            <p className="text-sm text-base-content/60">পরীক্ষার সময়</p>
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

        {start && finish && (
          <div className="mt-4 space-y-1 text-xs text-base-content/60 sm:text-sm">
            <p>শুরু: {start.toLocaleString("bn-BD")}</p>
            <p>শেষ: {finish.toLocaleString("bn-BD")}</p>
          </div>
        )}

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
                  ? "উত্তর পর্যালোচনা উপলভ্য নয়"
                  : "উত্তর দেখার সময় শেষ"}
              </button>
            )}

            {!retakeUsed && isRunning && (
              <button
                type="button"
                className="btn btn-warning w-full"
                onClick={handleRetake}
                disabled={busy}
              >
                {busy
                  ? "অপেক্ষা করুন..."
                  : `আবার পরীক্ষা দিন — ${RETAKE_COST} পয়েন্ট`}
              </button>
            )}

            {retakeUsed && (
              <div className="rounded-xl bg-base-200 p-3 text-center text-sm text-base-content/60">
                এই পরীক্ষায় Retake ইতোমধ্যে ব্যবহার করা হয়েছে।
              </div>
            )}

            {!retakeUsed && isRunning && Number(studentPoint) < RETAKE_COST && (
              <p className="text-center text-xs text-error">
                Retake করতে ১০ পয়েন্ট লাগবে। তোমার পয়েন্ট: {studentPoint}
              </p>
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
                ? "পরীক্ষা চালিয়ে যাও"
                : "পরীক্ষা চালানোর সময় শেষ"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary mt-5 w-full"
            disabled={!isRunning || busy}
            onClick={() => onParticipate(exam, false)}
          >
            {busy
              ? "অপেক্ষা করুন..."
              : isRunning
                ? "পরীক্ষায় অংশগ্রহণ করুন"
                : state === "upcoming"
                  ? "পরীক্ষা শুরুর অপেক্ষায়"
                  : state === "disabled"
                    ? "পরীক্ষা বন্ধ"
                    : "অংশগ্রহণের সময় শেষ"}
          </button>
        )}
      </div>
    </article>
  );
};

export default ExamCard;
