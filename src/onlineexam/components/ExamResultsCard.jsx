import { useEffect } from "react";
import confetti from "canvas-confetti";
import { getResultComment, formatCountdown } from "../examUtils";

const ExamResultCard = ({ result, departmentName }) => {
  const totalQuestions = Number(result.totalQuestions || 0);
  const correctAnswers = Number(result.correctAnswers || 0);
  const marks = Number(result.marks || 0);

  const percentage =
    totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

  const timeNeeded = Number(result.timeNeededSeconds || 0);

  useEffect(() => {
    if (totalQuestions > 0 && correctAnswers === totalQuestions) {
      const endTime = Date.now() + 3000;

      const launch = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
        });

        confetti({
          particleCount: 5,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
        });

        if (Date.now() < endTime) {
          requestAnimationFrame(launch);
        }
      };

      launch();
    }
  }, [correctAnswers, totalQuestions]);

  return (
    <div className="rounded-xl border border-success/30 bg-success/5 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">পরীক্ষার ফলাফল</h3>

        <span className="badge badge-success">সম্পন্ন</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-base-100 p-3">
          <p className="text-xs text-base-content/60">মোট প্রশ্ন</p>
          <p className="text-xl font-bold">{totalQuestions}</p>
        </div>

        <div className="rounded-lg bg-base-100 p-3">
          <p className="text-xs text-base-content/60">সঠিক উত্তর</p>
          <p className="text-xl font-bold text-success">{correctAnswers}</p>
        </div>

        <div className="rounded-lg bg-base-100 p-3">
          <p className="text-xs text-base-content/60">প্রাপ্ত নম্বর</p>
          <p className="text-xl font-bold">
            {marks}/{totalQuestions}
          </p>
        </div>

        <div className="rounded-lg bg-base-100 p-3">
          <p className="text-xs text-base-content/60">ফলাফল</p>
          <p className="text-xl font-bold">{percentage.toFixed(0)}%</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-base-100 p-3">
        <p className="text-sm text-base-content/60">পরীক্ষায় প্রয়োজনীয় সময়</p>

        <p className="mt-1 font-semibold">
          {formatCountdown(timeNeeded * 1000)}
        </p>
      </div>

      <p className="mt-4 font-medium">
        {getResultComment(percentage, departmentName)}
      </p>
    </div>
  );
};

export default ExamResultCard;
