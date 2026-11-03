import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router";

import { db, auth } from "../firebase/firebase.init";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const toDate = (value) => {
  if (!value) return null;

  if (value?.toDate) return value.toDate();

  if (value?.seconds) {
    return new Date(value.seconds * 1000);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const normalize = (value) => String(value ?? "").trim();

const getExamId = (item) =>
  item?.examId || item?.onlineExamId || item?.exam?.id || item?.id;

const isSubmitted = (attempt, result) => {
  if (result) return true;

  return (
    attempt?.isSubmitted === true ||
    attempt?.submitted === true ||
    attempt?.status === "submitted" ||
    attempt?.status === "completed"
  );
};

const getClassIds = (exam) => {
  const classes =
    exam?.selectedClasses?.length > 0
      ? exam.selectedClasses
      : exam?.classes || [];

  return classes.map((item) =>
    normalize(typeof item === "object" ? item.id : item),
  );
};

const isStudentEligible = (exam, student) => {
  if (!student || !exam) return false;

  // Department matching
  if (normalize(exam.departmentId) !== normalize(student.departmentId)) {
    return false;
  }

  // Class / Batch matching
  const examClasses = getClassIds(exam);

  if (examClasses.length === 0) return true;

  const studentClass = normalize(student.classId);
  const studentBatch = normalize(student.batchId);

  return examClasses.some((id) => id === studentClass || id === studentBatch);
};

const formatCountdown = (milliseconds) => {
  if (milliseconds <= 0) return "সময় শেষ";

  const totalSeconds = Math.floor(milliseconds / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value) => String(value).padStart(2, "0");

  if (days > 0) {
    return `${days} দিন ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

// --------------------------------------------------
// Main Component
// --------------------------------------------------

export default function RunningExamsWidget({
  student,
  onParticipate,
  onResume,
  onViewAnswers,
}) {
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [results, setResults] = useState([]);

  const [currentTime, setCurrentTime] = useState(Date.now());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const studentUid =
    student?.uid ||
    student?.studentUid ||
    student?.authUid ||
    auth?.currentUser?.uid;

  // --------------------------------------------------
  // Countdown Timer
  // --------------------------------------------------

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // --------------------------------------------------
  // Load Exams
  // --------------------------------------------------

  useEffect(() => {
    if (!student) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      collection(db, "onlineExams"),

      (snapshot) => {
        const examList = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));

        setExams(examList);
        setLoading(false);
      },

      (err) => {
        console.error("Exam loading error:", err);
        setError("পরীক্ষার তথ্য লোড করা যায়নি।");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [student]);

  // --------------------------------------------------
  // Load Student Attempts
  // --------------------------------------------------

  useEffect(() => {
    if (!studentUid) {
      setAttempts([]);
      return;
    }

    const attemptsQuery = query(
      collection(db, "examAttempts"),
      where("studentUid", "==", studentUid),
    );

    const unsubscribe = onSnapshot(
      attemptsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));

        setAttempts(data);
      },
      (err) => {
        console.error("Attempt loading error:", err);
      },
    );

    return () => unsubscribe();
  }, [studentUid]);

  // --------------------------------------------------
  // Load Student Results
  // --------------------------------------------------

  useEffect(() => {
    if (!studentUid) {
      setResults([]);
      return;
    }

    const resultsQuery = query(
      collection(db, "examResults"),
      where("studentUid", "==", studentUid),
    );

    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));

        setResults(data);
      },
      (err) => {
        console.error("Result loading error:", err);
      },
    );

    return () => unsubscribe();
  }, [studentUid]);

  // --------------------------------------------------
  // Select Nearest Deadline Exam
  // --------------------------------------------------

  const selectedExam = useMemo(() => {
    if (!student || exams.length === 0) return null;

    const eligibleExams = exams
      .filter((exam) => {
        if (!isStudentEligible(exam, student)) return false;

        // Disabled / inactive exams
        if (
          exam.isActive === false ||
          exam.status === "inactive" ||
          exam.status === "disabled" ||
          exam.status === "draft"
        ) {
          return false;
        }

        const startTime = toDate(exam.startTime);
        const finishTime = toDate(exam.finishTime);

        if (!startTime || !finishTime) return false;

        // Exam must have started
        if (currentTime < startTime.getTime()) return false;

        // Exam must not have expired
        if (currentTime >= finishTime.getTime()) return false;

        return true;
      })
      .sort((a, b) => {
        const aFinish = toDate(a.finishTime).getTime();
        const bFinish = toDate(b.finishTime).getTime();

        return aFinish - bFinish;
      });

    return eligibleExams[0] || null;
  }, [exams, student, currentTime]);

  // --------------------------------------------------
  // Selected Exam Attempt / Result
  // --------------------------------------------------

  const examActivity = useMemo(() => {
    if (!selectedExam) {
      return {
        attempt: null,
        result: null,
        submitted: false,
      };
    }

    const examId = normalize(selectedExam.id);

    const attempt =
      attempts.find((item) => normalize(getExamId(item)) === examId) || null;

    const result =
      results.find((item) => normalize(getExamId(item)) === examId) || null;

    return {
      attempt,
      result,
      submitted: isSubmitted(attempt, result),
    };
  }, [selectedExam, attempts, results]);

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------

  const handleParticipate = () => {
    if (!selectedExam) return;

    if (onParticipate) {
      onParticipate(selectedExam);
      return;
    }

    // Match this route with your existing exam participation route.
    navigate(`/exam-list`, {
      state: {
        exam: selectedExam,
        action: "participate",
      },
    });
  };

  const handleResume = () => {
    if (!selectedExam) return;

    if (onResume) {
      onResume(selectedExam, examActivity.attempt);
      return;
    }

    // Match this route with your existing resume route.
    navigate(`/exam-list`, {
      state: {
        exam: selectedExam,
        attempt: examActivity.attempt,
        action: "resume",
      },
    });
  };

  const handleViewAnswers = () => {
    if (!selectedExam) return;

    if (onViewAnswers) {
      onViewAnswers(selectedExam, examActivity.result);
      return;
    }

    navigate(`/portal/online-exams/${selectedExam.id}`, {
      state: {
        exam: selectedExam,
        result: examActivity.result,
        action: "result",
      },
    });
  };

  // --------------------------------------------------
  // Countdown
  // --------------------------------------------------

  const remainingTime = selectedExam
    ? toDate(selectedExam.finishTime).getTime() - currentTime
    : 0;

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
        <div className="flex items-center gap-3">
          <span className="loading loading-spinner loading-sm text-primary" />
          <span className="text-sm text-base-content/60">
            পরীক্ষা লোড হচ্ছে...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-error/20 bg-error/5 p-5">
        <p className="text-sm text-error">{error}</p>
      </div>
    );
  }

  if (!selectedExam) return null;

  const { attempt, result, submitted } = examActivity;

  const isInProgress = attempt && !submitted;

  const allowReview =
    selectedExam.canReviewAnswers === true ||
    selectedExam.allowAnswerReview === true;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm mt-5">
      {/* Top Accent */}
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary to-secondary" />

      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold leading-snug text-base-content sm:text-xl">
            {selectedExam.examName ||
              selectedExam.title ||
              selectedExam.name ||
              "অনলাইন পরীক্ষা"}
          </h3>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>

            <span className="text-xs font-bold uppercase tracking-wider text-success">
              চলমান পরীক্ষা
            </span>
          </div>
        </div>

        {/* Exam Name */}

        {/* Exam Description */}
        {selectedExam.description && (
          <p className="mt-2 text-sm leading-relaxed text-base-content/60">
            {selectedExam.description}
          </p>
        )}

        {/* Countdown */}
        <div className="mt-5 rounded-xl bg-base-200/70 p-4">
          <p className="mb-2 text-xs font-medium text-base-content/60">
            {submitted ? "ফলাফল দেখার সময় বাকি" : "পরীক্ষা শেষ হতে বাকি"}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-xl font-bold tracking-wide text-primary sm:text-2xl">
              {formatCountdown(remainingTime)}
            </div>

            <span className="text-xs text-base-content/50">
              Deadline:{" "}
              {toDate(selectedExam.finishTime).toLocaleString("bn-BD", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>
        </div>

        {/* Result */}
        {submitted ? (
          <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">✓</span>

              <div>
                <p className="font-bold text-success">পরীক্ষা সম্পন্ন হয়েছে</p>

                <p className="mt-1 text-xs text-base-content/60">
                  তোমার পরীক্ষার ফলাফল প্রকাশিত হয়েছে।
                </p>
              </div>
            </div>

            {result && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-base-100 p-3">
                  <p className="text-xs text-base-content/50">প্রাপ্ত নম্বর</p>

                  <p className="mt-1 text-xl font-bold text-success">
                    {result.obtainedMarks ??
                      result.totalObtainedMarks ??
                      result.marks ??
                      "—"}
                  </p>
                </div>

                <div className="rounded-lg bg-base-100 p-3">
                  <p className="text-xs text-base-content/50">মোট নম্বর</p>

                  <p className="mt-1 text-xl font-bold text-base-content">
                    {result.totalMarks ?? selectedExam.totalMarks ?? "—"}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleViewAnswers}
                className="btn btn-success btn-sm flex-1"
              >
                ফলাফল দেখুন
              </button>

              {allowReview && (
                <button
                  type="button"
                  onClick={handleViewAnswers}
                  className="btn btn-outline btn-success btn-sm flex-1"
                >
                  উত্তর দেখুন
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Not Submitted */
          <div className="mt-4">
            {isInProgress ? (
              <>
                <div className="mb-3 flex items-center gap-2 text-sm text-warning">
                  <span>●</span>
                  <span>তোমার পরীক্ষা অসম্পূর্ণ রয়েছে।</span>
                </div>

                <button
                  type="button"
                  onClick={handleResume}
                  className="btn btn-primary w-full"
                >
                  পরীক্ষা চালিয়ে যাও
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleParticipate}
                className="btn btn-primary w-full"
              >
                পরীক্ষা দিন
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
