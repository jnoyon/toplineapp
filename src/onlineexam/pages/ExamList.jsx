import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
} from "firebase/firestore";

import Swal from "sweetalert2";
import toast from "react-hot-toast";
import { motion } from "framer-motion";

import { departmentList } from "../../config/departments";
import ExamCard from "../components/ExamCard";
import ExamRunner from "../components/ExamRunner";
import { getExamAttemptId, getExamState, toDate } from "../examUtils";
import { db } from "../../assets/firebase/firebase.init";

/* =========================================================
   Helpers
========================================================= */

function getStoredStudentSession() {
  try {
    const session = localStorage.getItem("studentSession");
    return session ? JSON.parse(session) : null;
  } catch (error) {
    console.error("Student session read error:", error);
    return null;
  }
}

function normalizeId(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function canReviewAnswers(exam) {
  const deadline = toDate(exam?.finishTime);
  return Boolean(deadline && Date.now() < deadline.getTime());
}

function getExamClassIds(exam) {
  const rawClasses = [
    ...(Array.isArray(exam.selectedClasses) ? exam.selectedClasses : []),
    ...(Array.isArray(exam.classes) ? exam.classes : []),
    ...(Array.isArray(exam.selectedClassIds) ? exam.selectedClassIds : []),
  ];

  return [
    ...new Set(
      rawClasses
        .map((item) => {
          if (item && typeof item === "object") {
            return normalizeId(
              item.id ?? item.classId ?? item.batchId ?? item.value,
            );
          }

          return normalizeId(item);
        })
        .filter(Boolean),
    ),
  ];
}

/**
 * Converts answer values to comparable strings.
 */
function normalizeAnswer(value) {
  if (value === undefined || value === null) return "";

  if (typeof value === "object") {
    if ("value" in value) return normalizeAnswer(value.value);
    if ("id" in value) return normalizeAnswer(value.id);
    if ("text" in value) return normalizeAnswer(value.text);
    if ("answer" in value) return normalizeAnswer(value.answer);

    return JSON.stringify(value);
  }

  return String(value).trim().toLowerCase();
}

/**
 * Gets the correct answer from a question.
 * Adjust these fields if your question schema uses different names.
 */
function getCorrectAnswer(question) {
  return (
    question?.correctAnswer ??
    question?.correctOption ??
    question?.correctOptionId ??
    question?.answer ??
    question?.correct ??
    question?.rightAnswer ??
    null
  );
}

/**
 * Gets the student's answer from a result.
 */
function getStudentAnswer(result, question, index) {
  const answers = result?.answers;

  if (!answers) return null;

  const questionId = question?.id ?? question?.questionId;

  if (Array.isArray(answers)) {
    const matchingAnswer = answers.find(
      (item) =>
        normalizeId(item?.questionId ?? item?.id) === normalizeId(questionId),
    );

    if (matchingAnswer) {
      return (
        matchingAnswer.answer ??
        matchingAnswer.selectedAnswer ??
        matchingAnswer.selectedOption ??
        matchingAnswer.value ??
        null
      );
    }

    const item = answers[index];

    if (item && typeof item === "object") {
      return (
        item.answer ??
        item.selectedAnswer ??
        item.selectedOption ??
        item.value ??
        null
      );
    }

    return item ?? null;
  }

  if (typeof answers === "object") {
    const answerKey = questionId ?? String(index);

    const answer = answers[answerKey];

    if (answer && typeof answer === "object") {
      return (
        answer.answer ??
        answer.selectedAnswer ??
        answer.selectedOption ??
        answer.value ??
        null
      );
    }

    return answer ?? null;
  }

  return null;
}

function getQuestionText(question) {
  return (
    question?.question ??
    question?.questionText ??
    question?.text ??
    question?.title ??
    "প্রশ্নের লেখা পাওয়া যায়নি"
  );
}

function getOptionText(question, answer) {
  if (answer === null || answer === undefined || answer === "") {
    return "উত্তর দেওয়া হয়নি";
  }

  const options = Array.isArray(question?.options)
    ? question.options
    : Array.isArray(question?.choices)
      ? question.choices
      : [];

  const answerValue = normalizeAnswer(answer);

  const matchedOption = options.find((option) => {
    if (typeof option !== "object" || option === null) {
      return normalizeAnswer(option) === answerValue;
    }

    const values = [
      option.id,
      option.value,
      option.key,
      option.label,
      option.text,
      option.option,
    ];

    return values.some(
      (value) => value !== undefined && normalizeAnswer(value) === answerValue,
    );
  });

  if (matchedOption) {
    if (typeof matchedOption === "object") {
      return (
        matchedOption.text ??
        matchedOption.label ??
        matchedOption.value ??
        matchedOption.option ??
        String(answer)
      );
    }

    return String(matchedOption);
  }

  return String(answer);
}

function isAnswerCorrect(studentAnswer, correctAnswer) {
  if (
    studentAnswer === null ||
    studentAnswer === undefined ||
    studentAnswer === "" ||
    correctAnswer === null ||
    correctAnswer === undefined ||
    correctAnswer === ""
  ) {
    return false;
  }

  return normalizeAnswer(studentAnswer) === normalizeAnswer(correctAnswer);
}

const pageVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      staggerChildren: 0.07,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
};

/* =========================================================
   Loading State
========================================================= */

function LoadingState() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 rounded-full border-4 border-primary/15 border-t-primary"
        />

        <span className="text-2xl">📚</span>
      </div>

      <p className="animate-pulse text-sm text-base-content/60">
        পরীক্ষার তথ্য লোড হচ্ছে...
      </p>
    </div>
  );
}

/* =========================================================
   Empty State
========================================================= */

function EmptyState() {
  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden rounded-3xl border border-base-300 bg-base-100 px-5 py-14 text-center shadow-sm sm:px-10"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/5 blur-3xl" />

      <motion.div
        animate={{ y: [0, -7, 0], rotate: [0, -3, 3, 0] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-4xl"
      >
        📝
      </motion.div>

      <h2 className="text-xl font-bold sm:text-2xl">
        বর্তমানে কোনো পরীক্ষা নেই
      </h2>

      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-base-content/60">
        তোমার বিভাগ ও শ্রেণি বা ব্যাচের জন্য নতুন পরীক্ষা চালু হলে এখানে দেখা
        যাবে।
      </p>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200/50 px-4 py-2 text-xs text-base-content/60">
        <span className="h-2 w-2 rounded-full bg-success" />
        পরীক্ষার তালিকা আপডেটের অপেক্ষায়
      </div>
    </motion.div>
  );
}

/* =========================================================
   Answer Review Screen — No Modal
========================================================= */

function AnswerReviewScreen({ exam, result, onBack }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const finishTime = toDate(exam?.finishTime);

  const reviewAllowed = Boolean(finishTime && now < finishTime.getTime());

  const questions = Array.isArray(exam?.questions)
    ? exam.questions
    : Array.isArray(exam?.questionList)
      ? exam.questionList
      : [];

  const reviewedQuestions = questions.map((question, index) => {
    const studentAnswer = getStudentAnswer(result, question, index);
    const correctAnswer = getCorrectAnswer(question);

    const answered =
      studentAnswer !== null &&
      studentAnswer !== undefined &&
      studentAnswer !== "";

    const correct = isAnswerCorrect(studentAnswer, correctAnswer);

    return {
      question,
      index,
      studentAnswer,
      correctAnswer,
      answered,
      correct,
    };
  });

  const correctCount = reviewedQuestions.filter((item) => item.correct).length;

  const wrongCount = reviewedQuestions.filter(
    (item) => item.answered && !item.correct,
  ).length;

  const unansweredCount = reviewedQuestions.filter(
    (item) => !item.answered,
  ).length;

  // Do not show answers after the exam's finish time.
  if (!reviewAllowed) {
    return (
      <motion.main
        initial="hidden"
        animate="visible"
        variants={pageVariants}
        className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8"
      >
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 rounded-xl border border-base-300 px-4 py-2 text-sm font-semibold hover:bg-base-200"
        >
          ← পরীক্ষার তালিকায় ফিরুন
        </button>

        <section className="rounded-3xl border border-warning/30 bg-warning/5 p-8 text-center">
          <div className="mb-3 text-4xl">🔒</div>

          <h2 className="text-xl font-bold">উত্তর পর্যালোচনার সময় শেষ</h2>

          <p className="mt-3 text-sm leading-7 text-base-content/60">
            পরীক্ষার নির্ধারিত সময় শেষ হয়ে যাওয়ায় এখন আর সঠিক ও ভুল উত্তর দেখা
            যাবে না।
          </p>
        </section>
      </motion.main>
    );
  }

  return (
    <motion.main
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6 sm:py-8"
    >
      <motion.section variants={itemVariants}>
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold transition hover:bg-base-200"
        >
          ← পরীক্ষার তালিকায় ফিরুন
        </button>

        <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">
                উত্তর পর্যালোচনা
              </p>

              <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
                {exam.title || exam.examName || "অনলাইন পরীক্ষা"}
              </h1>

              <p className="mt-2 text-sm text-base-content/60">
                নির্ধারিত সময় শেষ হওয়া পর্যন্ত এই পেজে উত্তর দেখা যাবে।
              </p>
            </div>

            <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-semibold text-warning">উত্তর দেখার শেষ সময়</p>

              <p className="mt-1">
                {finishTime
                  ? finishTime.toLocaleString("bn-BD")
                  : "নির্ধারিত নয়"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-base-200/70 p-4">
              <p className="text-sm text-base-content/60">মোট প্রশ্ন</p>
              <p className="mt-1 text-2xl font-extrabold">{questions.length}</p>
            </div>

            <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
              <p className="text-sm text-success">সঠিক উত্তর</p>
              <p className="mt-1 text-2xl font-extrabold text-success">
                {correctCount}
              </p>
            </div>

            <div className="rounded-2xl border border-error/20 bg-error/5 p-4">
              <p className="text-sm text-error">ভুল উত্তর</p>
              <p className="mt-1 text-2xl font-extrabold text-error">
                {wrongCount}
              </p>
            </div>

            <div className="rounded-2xl border border-base-300 bg-base-200/50 p-4">
              <p className="text-sm text-base-content/60">উত্তর দেওয়া হয়নি</p>
              <p className="mt-1 text-2xl font-extrabold">{unansweredCount}</p>
            </div>
          </div>
        </div>
      </motion.section>

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6 text-center">
          <p className="font-semibold">এই পরীক্ষার প্রশ্নগুলো পাওয়া যায়নি।</p>

          <p className="mt-2 text-sm text-base-content/60">
            পরীক্ষার ডেটায় questions অথবা questionList থাকতে হবে।
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {reviewedQuestions.map(
            ({
              question,
              index,
              studentAnswer,
              correctAnswer,
              answered,
              correct,
            }) => (
              <motion.article
                key={question.id || question.questionId || index}
                variants={itemVariants}
                className={`rounded-2xl border bg-base-100 p-5 shadow-sm sm:p-6 ${
                  !answered
                    ? "border-base-300"
                    : correct
                      ? "border-success/30"
                      : "border-error/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-base-200 text-sm font-bold">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          !answered
                            ? "bg-base-200 text-base-content/60"
                            : correct
                              ? "bg-success/10 text-success"
                              : "bg-error/10 text-error"
                        }`}
                      >
                        {!answered
                          ? "উত্তর দেওয়া হয়নি"
                          : correct
                            ? "সঠিক উত্তর"
                            : "ভুল উত্তর"}
                      </span>

                      {question.marks !== undefined && (
                        <span className="text-xs text-base-content/50">
                          নম্বর: {question.marks}
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 whitespace-pre-wrap text-base font-bold leading-7 sm:text-lg">
                      {getQuestionText(question)}
                    </h2>

                    {Array.isArray(question.options) &&
                      question.options.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {question.options.map((option, optionIndex) => {
                            const optionValue =
                              typeof option === "object" && option !== null
                                ? (option.id ??
                                  option.value ??
                                  option.key ??
                                  option.label ??
                                  option.text)
                                : option;

                            const optionText =
                              typeof option === "object" && option !== null
                                ? (option.text ??
                                  option.label ??
                                  option.value ??
                                  option.option ??
                                  String(optionValue ?? ""))
                                : String(option);

                            const isCorrectOption =
                              correctAnswer !== null &&
                              normalizeAnswer(optionValue) ===
                                normalizeAnswer(correctAnswer);

                            const isSelectedOption =
                              studentAnswer !== null &&
                              normalizeAnswer(optionValue) ===
                                normalizeAnswer(studentAnswer);

                            return (
                              <div
                                key={optionIndex}
                                className={`rounded-xl border px-4 py-3 text-sm ${
                                  isCorrectOption
                                    ? "border-success/40 bg-success/10"
                                    : isSelectedOption
                                      ? "border-error/40 bg-error/10"
                                      : "border-base-300"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <span className="flex-1">{optionText}</span>

                                  {isCorrectOption && (
                                    <span className="shrink-0 font-semibold text-success">
                                      সঠিক
                                    </span>
                                  )}

                                  {isSelectedOption && !isCorrectOption && (
                                    <span className="shrink-0 font-semibold text-error">
                                      তোমার উত্তর
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-base-300 p-3">
                        <p className="text-xs font-semibold text-base-content/50">
                          তোমার উত্তর
                        </p>

                        <p
                          className={`mt-1 whitespace-pre-wrap text-sm font-medium ${
                            !answered
                              ? "text-base-content/50"
                              : correct
                                ? "text-success"
                                : "text-error"
                          }`}
                        >
                          {getOptionText(question, studentAnswer)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                        <p className="text-xs font-semibold text-success">
                          সঠিক উত্তর
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-sm font-medium">
                          {getOptionText(question, correctAnswer)}
                        </p>
                      </div>
                    </div>

                    {question.explanation && (
                      <div className="mt-4 rounded-xl bg-base-200/60 p-4">
                        <p className="text-sm font-bold">ব্যাখ্যা</p>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-base-content/70">
                          {question.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.article>
            ),
          )}
        </section>
      )}
    </motion.main>
  );
}

/* =========================================================
   Main Component
========================================================= */

const OnlineExamList = ({ student: studentProp }) => {
  const [studentSession] = useState(getStoredStudentSession);

  const [student, setStudent] = useState(studentProp || null);

  const [exams, setExams] = useState([]);
  const [results, setResults] = useState({});
  const [attempts, setAttempts] = useState({});

  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const [busyExamId, setBusyExamId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  const [reviewSession, setReviewSession] = useState(null);

  const hasStudentSession =
    studentSession?.role === "student" &&
    Boolean(studentSession?.studentId) &&
    Boolean(studentSession?.documentId);

  /* =========================================================
     Load Student Profile
  ========================================================= */

  useEffect(() => {
    let active = true;

    async function loadStudentProfile() {
      if (!hasStudentSession) {
        setStudent(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      try {
        const studentRef = doc(db, "students", studentSession.documentId);
        const studentSnapshot = await getDoc(studentRef);

        if (!active) return;

        if (!studentSnapshot.exists()) {
          setStudent(null);
          toast.error("শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি।");
          return;
        }

        const studentData = studentSnapshot.data();

        const isActive =
          studentData.isActive ??
          studentData.active ??
          studentData.enabled ??
          true;

        if (isActive === false || isActive === "false" || isActive === 0) {
          localStorage.removeItem("studentSession");
          setStudent(null);
          toast.error("আপনার শিক্ষার্থী অ্যাকাউন্টটি নিষ্ক্রিয়।");
          return;
        }

        const classId =
          normalizeId(studentData.classId) ||
          normalizeId(studentSession.classId) ||
          normalizeId(studentProp?.classId);

        const batchId =
          normalizeId(studentData.batchId) ||
          normalizeId(studentSession.batchId) ||
          normalizeId(studentProp?.batchId);

        setStudent({
          ...studentProp,
          ...studentData,

          documentId: studentSnapshot.id,

          studentId: String(studentData.studentId ?? studentSession.studentId),

          name:
            studentData.name ||
            studentData.studentName ||
            studentSession.name ||
            studentProp?.name ||
            "",

          departmentId:
            studentData.departmentId ??
            studentSession.departmentId ??
            studentProp?.departmentId ??
            null,

          departmentName:
            studentData.departmentName ||
            studentSession.departmentName ||
            studentProp?.departmentName ||
            "",

          classId,
          batchId,

          className:
            studentData.className ||
            studentSession.className ||
            studentProp?.className ||
            "",

          batchName:
            studentData.batchName ||
            studentSession.batchName ||
            studentProp?.batchName ||
            "",
        });
      } catch (error) {
        console.error("Load student profile error:", error);

        if (active) {
          toast.error(
            "শিক্ষার্থীর তথ্য লোড করা যায়নি। ইন্টারনেট ও Firestore Rules পরীক্ষা করুন।",
          );
        }
      } finally {
        if (active) setProfileLoading(false);
      }
    }

    loadStudentProfile();

    return () => {
      active = false;
    };
  }, [hasStudentSession, studentSession, studentProp]);

  /* =========================================================
     Student Identity
  ========================================================= */

  const studentKey = student?.studentId
    ? String(student.studentId)
    : student?.documentId || null;

  const department = departmentList.find(
    (item) => normalizeId(item.id) === normalizeId(student?.departmentId),
  );

  const departmentName = department?.name || student?.departmentName || "বিভাগ";

  const studentClassId = normalizeId(student?.classId || student?.batchId);

  /* =========================================================
     Load Exams, Results and Attempts
  ========================================================= */

  const loadData = useCallback(async () => {
    if (!studentKey || !student) {
      setExams([]);
      setResults({});
      setAttempts({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [examSnapshot, resultSnapshot, attemptSnapshot] = await Promise.all(
        [
          getDocs(collection(db, "onlineExams")),

          getDocs(
            query(
              collection(db, "examResults"),
              where("studentUid", "==", studentKey),
            ),
          ),

          getDocs(
            query(
              collection(db, "examAttempts"),
              where("studentUid", "==", studentKey),
            ),
          ),
        ],
      );

      const allExams = examSnapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      const resultMap = {};

      resultSnapshot.docs.forEach((item) => {
        const result = {
          id: item.id,
          ...item.data(),
        };

        if (result.examId) {
          resultMap[result.examId] = result;
        }
      });

      const attemptMap = {};

      attemptSnapshot.docs.forEach((item) => {
        const attempt = {
          id: item.id,
          ...item.data(),
        };

        if (attempt.examId) {
          attemptMap[attempt.examId] = attempt;
        }
      });

      setExams(allExams);
      setResults(resultMap);
      setAttempts(attemptMap);

      const existingAttempt = Object.values(attemptMap).find(
        (item) => item.status === "in_progress",
      );

      if (existingAttempt) {
        const matchingExam = allExams.find(
          (item) => item.id === existingAttempt.examId,
        );

        if (matchingExam) {
          setActiveSession({
            exam: matchingExam,
            attempt: existingAttempt,
          });
        }
      }
    } catch (error) {
      console.error("Load online exams error:", error);

      toast.error(
        "পরীক্ষা বা ফলাফল লোড করা যায়নি। Firestore Rules ও ইন্টারনেট সংযোগ পরীক্ষা করুন।",
      );
    } finally {
      setLoading(false);
    }
  }, [studentKey, student]);

  useEffect(() => {
    if (profileLoading) return;

    if (!hasStudentSession || !student) {
      setLoading(false);
      return;
    }

    loadData();
  }, [profileLoading, hasStudentSession, student, loadData]);

  /* =========================================================
     Filter Visible Exams
  ========================================================= */

  const visibleExams = useMemo(() => {
    return exams
      .filter((exam) => {
        if (
          normalizeId(exam.departmentId) !== normalizeId(student?.departmentId)
        ) {
          return false;
        }

        const examClassIds = getExamClassIds(exam);

        if (examClassIds.length > 0) {
          const matchesClass =
            Boolean(studentClassId) && examClassIds.includes(studentClassId);

          if (!matchesClass) return false;
        }

        const hasPreviousActivity = Boolean(
          results[exam.id] || attempts[exam.id],
        );

        if (
          (exam.status === false ||
            exam.status === "disabled" ||
            exam.status === "inactive") &&
          !hasPreviousActivity
        ) {
          return false;
        }

        const start = toDate(exam.startTime);
        const finish = toDate(exam.finishTime);

        if (!start || !finish || finish <= start) {
          return hasPreviousActivity;
        }

        if (finish.getTime() <= Date.now()) {
          return hasPreviousActivity;
        }

        return true;
      })
      .sort((a, b) => {
        const priority = {
          active: 0,
          upcoming: 1,
          disabled: 2,
          expired: 3,
          invalid: 4,
        };

        return (
          (priority[getExamState(a)] ?? 9) - (priority[getExamState(b)] ?? 9)
        );
      });
  }, [exams, student, studentClassId, results, attempts]);

  /* =========================================================
     Start Exam
  ========================================================= */

  const handleParticipate = async (exam) => {
    if (!hasStudentSession || !student || !studentKey) {
      toast.error("তোমার session পাওয়া যায়নি। আবার লগইন করো।");
      return;
    }

    if (getExamState(exam) !== "active") {
      toast.error("এই মুহূর্তে পরীক্ষা দেওয়া যাচ্ছে না।");
      return;
    }

    const confirmation = await Swal.fire({
      icon: "question",
      title: "পরীক্ষা শুরু করবে?",
      text: "পরীক্ষা শুরু করার আগে প্রস্তুত হয়ে নাও। নির্ধারিত সময়ের মধ্যে উত্তর জমা দিতে হবে।",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, শুরু করি",
      cancelButtonText: "এখন নয়",
      reverseButtons: true,
      confirmButtonColor: "#4f46e5",
      allowOutsideClick: false,
    });

    if (!confirmation.isConfirmed) return;

    setBusyExamId(exam.id);

    try {
      const attemptId = getExamAttemptId(exam.id, studentKey);

      const attemptRef = doc(db, "examAttempts", attemptId);
      const resultRef = doc(db, "examResults", attemptId);

      const now = new Date();
      const start = toDate(exam.startTime);
      const finish = toDate(exam.finishTime);

      if (
        !start ||
        !finish ||
        now < start ||
        now >= finish ||
        exam.status === false
      ) {
        throw new Error("পরীক্ষার সময় হয়নি, সময় শেষ হয়েছে অথবা পরীক্ষা বন্ধ।");
      }

      const durationMs =
        (Number(exam.durationMinutes || 0) * 60 +
          Number(exam.durationSeconds || 0)) *
        1000;

      if (durationMs <= 0) {
        throw new Error("পরীক্ষার সময় নির্ধারণ করা হয়নি।");
      }

      const deadline = new Date(
        Math.min(now.getTime() + durationMs, finish.getTime()),
      );

      const attemptData = {
        examId: exam.id,

        studentUid: studentKey,
        studentId: String(student.studentId),
        studentDocumentId: student.documentId,
        studentName: student.name || "",

        departmentId: student.departmentId ?? null,
        departmentName,

        classId: student.classId || "",
        className: student.className || "",

        batchId: student.batchId || "",
        batchName: student.batchName || "",

        status: "in_progress",
        answers: {},

        startedAt: Timestamp.fromDate(now),
        deadlineAt: Timestamp.fromDate(deadline),
      };

      await runTransaction(db, async (transaction) => {
        const existingAttempt = await transaction.get(attemptRef);
        const existingResult = await transaction.get(resultRef);

        if (existingAttempt.exists() || existingResult.exists()) {
          throw new Error("এই পরীক্ষার attempt বা ফলাফল আগে থেকেই রয়েছে।");
        }

        transaction.set(attemptRef, attemptData);
      });

      const attempt = {
        id: attemptId,
        ...attemptData,
      };

      setAttempts((previous) => ({
        ...previous,
        [exam.id]: attempt,
      }));

      setActiveSession({
        exam,
        attempt,
      });
    } catch (error) {
      console.error("Start exam error:", error);

      await Swal.fire({
        icon: "error",
        title: "পরীক্ষা শুরু করা যায়নি",
        text:
          error.message ||
          "আবার চেষ্টা করো। প্রয়োজনে অ্যাডমিনের সঙ্গে যোগাযোগ করো।",
        confirmButtonText: "ঠিক আছে",
        confirmButtonColor: "#4f46e5",
      });

      await loadData();
    } finally {
      setBusyExamId(null);
    }
  };

  /* =========================================================
     Resume Exam
  ========================================================= */

  const handleResume = (exam, attempt) => {
    if (attempt?.deadlineAt) {
      const attemptDeadline = toDate(attempt.deadlineAt);

      if (attemptDeadline && Date.now() >= attemptDeadline.getTime()) {
        toast.error("এই পরীক্ষার সময় শেষ হয়েছে।");
        return;
      }
    }

    if (getExamState(exam) !== "active") {
      toast.error("এই মুহূর্তে পরীক্ষা চালিয়ে যাওয়া যাচ্ছে না।");
      return;
    }

    setActiveSession({ exam, attempt });
  };

  /* =========================================================
     Answer Review
  ========================================================= */

  const handleViewAnswers = (exam, result) => {
    if (!result) {
      toast.error("পরীক্ষার ফলাফল পাওয়া যায়নি।");
      return;
    }

    if (!canReviewAnswers(exam)) {
      toast.error("উত্তর পর্যালোচনার সময় শেষ হয়েছে।");
      return;
    }

    setReviewSession({ exam, result });
  };

  const handleBackFromReview = () => {
    setReviewSession(null);
  };

  /* =========================================================
     Submitted
  ========================================================= */

  const handleSubmitted = (result) => {
    setResults((previous) => ({
      ...previous,
      [result.examId]: result,
    }));

    setAttempts((previous) => {
      const next = { ...previous };
      delete next[result.examId];
      return next;
    });

    setActiveSession(null);

    toast.success("পরীক্ষা সফলভাবে জমা হয়েছে!");

    loadData();
  };

  /* =========================================================
     Session / Profile States
  ========================================================= */

  if (!hasStudentSession) {
    return (
      <div className="flex min-h-72 items-center justify-center p-5">
        <div className="max-w-md rounded-3xl border border-warning/20 bg-warning/5 p-8 text-center">
          <div className="mb-4 text-4xl">🔐</div>

          <h2 className="text-xl font-bold">লগইন প্রয়োজন</h2>

          <p className="mt-2 text-sm leading-6 text-base-content/60">
            অনলাইন পরীক্ষা দেখতে শিক্ষার্থী অ্যাকাউন্ট দিয়ে লগইন করো।
          </p>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return <LoadingState />;
  }

  if (!student) {
    return (
      <div className="p-5">
        <div className="mx-auto max-w-xl rounded-3xl border border-warning/30 bg-warning/5 p-8 text-center">
          <div className="mb-4 text-4xl">👤</div>

          <h2 className="text-xl font-bold">
            শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি
          </h2>

          <p className="mt-3 text-sm leading-6 text-base-content/60">
            আবার লগইন করো অথবা অ্যাডমিনের সঙ্গে যোগাযোগ করো।
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     Active Exam
  ========================================================= */

  if (activeSession) {
    return (
      <ExamRunner
        key={activeSession.attempt.id}
        exam={activeSession.exam}
        attempt={activeSession.attempt}
        student={student}
        departmentName={departmentName}
        onSubmitted={handleSubmitted}
      />
    );
  }

  /* =========================================================
     Answer Review Screen
  ========================================================= */

  if (reviewSession) {
    return (
      <AnswerReviewScreen
        exam={reviewSession.exam}
        result={reviewSession.result}
        onBack={handleBackFromReview}
      />
    );
  }

  /* =========================================================
     Exam Dashboard
  ========================================================= */

  return (
    <motion.main
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto min-h-screen max-w-7xl space-y-7 px-4 py-5 sm:px-6 sm:py-8 lg:px-8"
    >
      <motion.section
        variants={itemVariants}
        className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"
      >
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            পরীক্ষার তালিকা
          </h2>

          <p className="mt-2 text-sm leading-6 text-base-content/60">
            তোমার জন্য নির্ধারিত পরীক্ষা এখানে দেখতে পারবে।
          </p>

          <p className="mt-1 text-sm font-medium text-base-content/70">
            {departmentName}
            {student.className || student.batchName
              ? ` · ${student.className || student.batchName}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-base-300 bg-base-100 px-3.5 py-2.5 text-sm sm:self-auto">
          <span>📋</span>

          <span className="font-semibold">{visibleExams.length}টি পরীক্ষা</span>
        </div>
      </motion.section>

      {loading ? (
        <LoadingState />
      ) : visibleExams.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.section
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {visibleExams.map((exam) => {
            const result = results[exam.id];
            const attempt = attempts[exam.id];

            return (
              <motion.div
                key={exam.id}
                variants={itemVariants}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex min-w-0 flex-col gap-3"
              >
                <div className="flex-1">
                  <ExamCard
                    exam={exam}
                    result={result}
                    attempt={attempt}
                    departmentName={departmentName}
                    busy={busyExamId === exam.id}
                    onParticipate={handleParticipate}
                    onResume={handleResume}
                    onViewAnswers={handleViewAnswers}
                    canReviewAnswers={canReviewAnswers(exam)}
                  />
                </div>
              </motion.div>
            );
          })}
        </motion.section>
      )}
    </motion.main>
  );
};

export default OnlineExamList;
