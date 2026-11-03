import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import toast from "react-hot-toast";
import {
  FiCalendar,
  FiClock,
  FiFileText,
  FiUsers,
  FiCheckCircle,
  FiLoader,
  FiArrowLeft,
  FiBookOpen,
} from "react-icons/fi";

import OnlineExamQuestions from "../components/OnlineExamQuestions";
import { db } from "../../assets/firebase/firebase.init";
import { departmentList } from "../../config/departments";

const SUBJECTS = {
  ICT: "তথ্য ও যোগাযোগ প্রযুক্তি",
  BANGLA: "বাংলা",
  ENGLISH: "ইংরেজি",
  MATHEMATICS: "গণিত",
  SCIENCE: "বিজ্ঞান",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#E74C3C] focus:ring-2 focus:ring-[#E74C3C]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const labelClass =
  "mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200";

function toDateTimeLocal(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2C3E50]/10 text-[#2C3E50] dark:bg-white/10 dark:text-white">
        <Icon size={20} />
      </div>

      <div>
        <h2 className="font-bold text-[#2C3E50] dark:text-white">{title}</h2>

        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export default function EditOnlineExam() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("ICT");
  const [syllabus, setSyllabus] = useState("");

  // বিভাগ
  const [departmentId, setDepartmentId] = useState("");

  // নির্বাচিত শ্রেণি/ব্যাচের ID
  const [selectedClasses, setSelectedClasses] = useState([]);

  // পরীক্ষার সময়
  const [minutes, setMinutes] = useState("30");
  const [seconds, setSeconds] = useState("0");

  // পরীক্ষার তারিখ ও সময়
  const [startTime, setStartTime] = useState("");
  const [finishTime, setFinishTime] = useState("");

  // পরীক্ষার Status
  const [status, setStatus] = useState(true);

  // প্রতিটি শিক্ষার্থী যতগুলো প্রশ্ন পাবে
  const [questionCount, setQuestionCount] = useState("10");

  // পূর্ণমান
  const [fullMarks, setFullMarks] = useState("10");

  // প্রশ্নভান্ডার
  const [questions, setQuestions] = useState([]);

  // নির্বাচিত বিভাগের তথ্য
  const selectedDepartment =
    departmentList.find(
      (department) => String(department.id) === String(departmentId),
    ) || null;

  // নির্বাচিত বিভাগের শ্রেণি/ব্যাচ
  const availableClasses = selectedDepartment?.classes || [];

  // প্রতি প্রশ্নের নম্বর (প্রদর্শনের জন্য)
  const marksPerQuestion =
    Number(questionCount) > 0
      ? Math.round((Number(fullMarks) / Number(questionCount)) * 100) / 100
      : 0;

  useEffect(() => {
    let cancelled = false;

    async function loadExam() {
      if (!examId) {
        toast.error("পরীক্ষার ID পাওয়া যায়নি।");
        navigate("/manage-exams", { replace: true });
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "onlineExams", examId));

        if (cancelled) return;

        if (!snapshot.exists()) {
          toast.error("পরীক্ষাটি পাওয়া যায়নি।");
          navigate("/manage-exams", { replace: true });
          return;
        }

        const exam = snapshot.data();

        // পরীক্ষার সাধারণ তথ্য
        setTitle(exam.title ?? "");
        setSubject(
          exam.subject && SUBJECTS[exam.subject] ? exam.subject : "ICT",
        );
        setSyllabus(exam.syllabus ?? "");

        // পুরোনো এবং নতুন উভয় ধরনের পরীক্ষার তথ্য থেকে বিভাগ শনাক্ত করা।
        const savedDepartment =
          departmentList.find(
            (department) => String(department.id) === String(exam.departmentId),
          ) ||
          departmentList.find(
            (department) => department.key === exam.departmentKey,
          ) ||
          departmentList.find(
            (department) =>
              Array.isArray(exam.participants) &&
              exam.participants.includes(department.key),
          );

        if (savedDepartment) {
          setDepartmentId(String(savedDepartment.id));

          const departmentClassIds = (savedDepartment.classes || []).map(
            (item) => String(item.id),
          );

          let savedClassIds = [];

          if (Array.isArray(exam.selectedClasses)) {
            savedClassIds = exam.selectedClasses;
          } else if (Array.isArray(exam.classes)) {
            savedClassIds = exam.classes.map((item) => item.id);
          }

          // Firestore-এ ID string বা number যেভাবেই থাকুক,
          // বিভাগের ID-এর সঙ্গে মিলিয়ে নেওয়া হবে।
          savedClassIds = savedClassIds
            .map(String)
            .filter((id) => departmentClassIds.includes(id));

          setSelectedClasses(savedClassIds);
        } else {
          setDepartmentId("");
          setSelectedClasses([]);
        }

        // পরীক্ষার সময়
        setMinutes(String(exam.durationMinutes ?? 30));
        setSeconds(String(exam.durationSeconds ?? 0));

        setStartTime(toDateTimeLocal(exam.startTime));
        setFinishTime(toDateTimeLocal(exam.finishTime));

        setStatus(exam.status !== false);

        // প্রশ্নসংখ্যা ও পূর্ণমান
        const savedQuestions = Array.isArray(exam.questions)
          ? exam.questions
          : [];

        const savedQuestionCount =
          exam.questionCount ?? savedQuestions.length ?? 1;

        setQuestionCount(String(savedQuestionCount));

        // পুরোনো পরীক্ষায় fullMarks না থাকলে প্রশ্নসংখ্যার সমান ধরা হবে।
        setFullMarks(String(exam.fullMarks ?? savedQuestionCount ?? 10));

        // প্রশ্ন ও অপশন (অপশন যতগুলো সংরক্ষিত আছে ততগুলোই থাকবে)
        setQuestions(
          savedQuestions.map((question, index) => ({
            id: question.id || `existing-${index}-${Date.now()}`,
            question: question.question ?? "",
            options:
              Array.isArray(question.options) && question.options.length >= 2
                ? question.options.map((option) => option ?? "")
                : ["", "", "", ""],
            correctAnswer: Number(question.correctAnswer ?? 0),
            explanation: question.explanation ?? "",
          })),
        );
      } catch (error) {
        console.error("Load exam for editing error:", error);

        if (!cancelled) {
          toast.error("পরীক্ষার তথ্য লোড করা যায়নি।");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadExam();

    return () => {
      cancelled = true;
    };
  }, [examId, navigate]);

  // বিভাগ পরিবর্তন
  const handleDepartmentChange = (event) => {
    setDepartmentId(event.target.value);

    // নতুন বিভাগ বেছে নিলে আগের বিভাগের শ্রেণি বাদ যাবে।
    setSelectedClasses([]);
  };

  // শ্রেণি/ব্যাচ নির্বাচন
  const handleClassChange = (classId) => {
    setSelectedClasses((previous) =>
      previous.includes(classId)
        ? previous.filter((id) => id !== classId)
        : [...previous, classId],
    );
  };

  async function handleSubmit(event) {
    event.preventDefault();

    if (!examId) {
      toast.error("পরীক্ষার ID পাওয়া যায়নি।");
      return;
    }

    if (!title.trim()) {
      toast.error("পরীক্ষার নাম লিখুন।");
      return;
    }

    if (!SUBJECTS[subject]) {
      toast.error("একটি বিষয় নির্বাচন করুন।");
      return;
    }

    if (!selectedDepartment) {
      toast.error("একটি বিভাগ নির্বাচন করুন।");
      return;
    }

    if (selectedClasses.length === 0) {
      toast.error("অন্তত একটি শ্রেণি বা ব্যাচ নির্বাচন করুন।");
      return;
    }

    if (!Number.isInteger(Number(minutes)) || Number(minutes) < 0) {
      toast.error("পরীক্ষার সময় সঠিকভাবে লিখুন।");
      return;
    }

    if (
      !Number.isInteger(Number(seconds)) ||
      Number(seconds) < 0 ||
      Number(seconds) > 59
    ) {
      toast.error("সেকেন্ড ০ থেকে ৫৯-এর মধ্যে হতে হবে।");
      return;
    }

    if (Number(minutes) * 60 + Number(seconds) <= 0) {
      toast.error("পরীক্ষার সময় শূন্য হতে পারবে না।");
      return;
    }

    const requestedCount = Number(questionCount);

    if (!Number.isInteger(requestedCount) || requestedCount < 1) {
      toast.error("প্রশ্নের সংখ্যা কমপক্ষে ১ হতে হবে।");
      return;
    }

    if (!(Number(fullMarks) > 0)) {
      toast.error("পূর্ণমান ০-এর বেশি হতে হবে।");
      return;
    }

    if (questions.length === 0) {
      toast.error("কমপক্ষে একটি প্রশ্ন তৈরি করুন।");
      return;
    }

    if (requestedCount > questions.length) {
      toast.error(
        `নির্ধারিত প্রশ্ন ${requestedCount}টি, কিন্তু প্রশ্নভান্ডারে আছে মাত্র ${questions.length}টি।`,
      );
      return;
    }

    if (!startTime || !finishTime) {
      toast.error("পরীক্ষার শুরুর ও শেষের তারিখ-সময় নির্ধারণ করুন।");
      return;
    }

    const startDate = new Date(startTime);
    const finishDate = new Date(finishTime);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(finishDate.getTime())
    ) {
      toast.error("পরীক্ষার তারিখ ও সময় সঠিক নয়।");
      return;
    }

    if (finishDate <= startDate) {
      toast.error("পরীক্ষার শেষ সময় শুরুর সময়ের পরে হতে হবে।");
      return;
    }

    const invalidQuestion = questions.some((question) => {
      const options = question.options;

      return (
        !question.question?.trim() ||
        !Array.isArray(options) ||
        options.length < 2 ||
        options.some((option) => !String(option ?? "").trim()) ||
        !Number.isInteger(Number(question.correctAnswer)) ||
        Number(question.correctAnswer) < 0 ||
        Number(question.correctAnswer) >= options.length
      );
    });

    if (invalidQuestion) {
      toast.error("প্রতিটি প্রশ্নের লেখা, সব অপশন ও সঠিক উত্তর পূরণ করুন।");
      return;
    }

    setSaving(true);

    try {
      // নির্বাচিত শ্রেণি/ব্যাচের ID ও নাম
      const classesToSave = availableClasses
        .filter((item) => selectedClasses.includes(String(item.id)))
        .map((item) => ({
          id: item.id,
          name: item.name,
        }));

      const examData = {
        title: title.trim(),

        subject,
        subjectName: SUBJECTS[subject],
        syllabus: syllabus.trim(),

        // বিভাগের তথ্য
        departmentId: selectedDepartment.id,
        departmentKey: selectedDepartment.key,
        departmentName: selectedDepartment.name,
        departmentType: selectedDepartment.type,

        // শ্রেণি/ব্যাচের তথ্য
        selectedClasses: classesToSave.map((item) => item.id),
        classes: classesToSave,

        // পুরোনো পরীক্ষার তালিকার সঙ্গে সামঞ্জস্য
        participants: [selectedDepartment.key],

        // পরীক্ষার সময়
        durationMinutes: Number(minutes),
        durationSeconds: Number(seconds),

        startTime: startDate,
        finishTime: finishDate,

        // On/Off
        status: Boolean(status),

        // প্রতিটি শিক্ষার্থী যতগুলো প্রশ্ন পাবে
        questionCount: requestedCount,

        // প্রশ্নভান্ডারে মোট প্রশ্ন
        totalQuestions: questions.length,

        // পূর্ণমান ও প্রতি প্রশ্নের নম্বর
        fullMarks: Number(fullMarks),
        marksPerQuestion: Number(fullMarks) / requestedCount,

        questions: questions.map(({ id, ...question }) => ({
          ...question,
          options: [...question.options],
          correctAnswer: Number(question.correctAnswer),
        })),

        requiresPublicDetails: false,

        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "onlineExams", examId), examData);

      toast.success("পরীক্ষার পরিবর্তন সফলভাবে সংরক্ষণ হয়েছে।");

      navigate("/manage-exams");
    } catch (error) {
      console.error("Update online exam error:", error);

      toast.error(
        error?.code === "permission-denied"
          ? "পরীক্ষা আপডেট করার অনুমতি নেই।"
          : "পরীক্ষা আপডেট করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-[#E74C3C]" />

          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            পরীক্ষার তথ্য লোড হচ্ছে...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-7 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/manage-exams")}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            aria-label="পরীক্ষার তালিকায় ফিরে যান"
          >
            <FiArrowLeft size={20} />
          </button>

          <div>
            <h1 className="text-2xl font-black text-[#2C3E50] dark:text-white sm:text-3xl">
              Edit Online Exam
            </h1>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              পরীক্ষার তথ্য, বিভাগ, শ্রেণি/ব্যাচ ও প্রশ্ন পরিবর্তন করুন।
            </p>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* সাধারণ তথ্য */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <SectionTitle
              icon={FiFileText}
              title="পরীক্ষার তথ্য"
              description="পরীক্ষার নাম, বিষয়, প্রশ্নসংখ্যা, পূর্ণমান ও সিলেবাস সম্পাদনা করুন।"
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="exam-title" className={labelClass}>
                  পরীক্ষার নাম *
                </label>

                <input
                  id="exam-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="exam-subject" className={labelClass}>
                  বিষয় *
                </label>

                <select
                  id="exam-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className={inputClass}
                  required
                >
                  {Object.entries(SUBJECTS).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="question-count" className={labelClass}>
                  প্রতি শিক্ষার্থী যতগুলো প্রশ্ন পাবে *
                </label>

                <input
                  id="question-count"
                  type="number"
                  min="1"
                  max={questions.length || undefined}
                  value={questionCount}
                  onChange={(event) => setQuestionCount(event.target.value)}
                  className={inputClass}
                  required
                />

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  প্রশ্নভান্ডারে মোট: {questions.length}
                </p>
              </div>

              <div>
                <label htmlFor="full-marks" className={labelClass}>
                  পূর্ণমান *
                </label>

                <input
                  id="full-marks"
                  type="number"
                  min="1"
                  step="any"
                  value={fullMarks}
                  onChange={(event) => setFullMarks(event.target.value)}
                  className={inputClass}
                  required
                />

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  প্রতি প্রশ্নে নম্বর: {marksPerQuestion}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="exam-syllabus" className={labelClass}>
                  সিলেবাস
                </label>

                <textarea
                  id="exam-syllabus"
                  rows={3}
                  value={syllabus}
                  onChange={(event) => setSyllabus(event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* বিভাগ */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <SectionTitle
              icon={FiBookOpen}
              title="বিভাগ নির্বাচন"
              description="পরীক্ষাটি কোন বিভাগের শিক্ষার্থীদের জন্য, তা নির্ধারণ করুন।"
            />

            <label htmlFor="department" className={labelClass}>
              বিভাগ *
            </label>

            <select
              id="department"
              value={departmentId}
              onChange={handleDepartmentChange}
              className={inputClass}
              required
            >
              <option value="">বিভাগ নির্বাচন করুন</option>

              {departmentList.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            {selectedDepartment && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="font-semibold">{selectedDepartment.name}</p>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  নিচ থেকে এক বা একাধিক শ্রেণি/ব্যাচ নির্বাচন করুন।
                </p>
              </div>
            )}
          </section>

          {/* শ্রেণি/ব্যাচ */}
          {selectedDepartment && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <SectionTitle
                icon={FiUsers}
                title="শ্রেণি / ব্যাচ নির্বাচন"
                description="নির্বাচিত বিভাগ থেকে যেসব শ্রেণি বা ব্যাচ পরীক্ষা দিতে পারবে, সেগুলো বেছে নিন।"
              />

              {availableClasses.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableClasses.map((item) => {
                    const classId = String(item.id);

                    return (
                      <label
                        key={classId}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                          selectedClasses.includes(classId)
                            ? "border-[#E74C3C] bg-[#E74C3C]/5"
                            : "border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(classId)}
                          onChange={() => handleClassChange(classId)}
                          className="checkbox checkbox-error"
                        />

                        <span className="text-sm font-semibold">
                          {item.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  এই বিভাগের জন্য কোনো শ্রেণি বা ব্যাচ পাওয়া যায়নি।
                </p>
              )}

              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                নির্বাচিত শ্রেণি/ব্যাচ:{" "}
                <strong>{selectedClasses.length}</strong>
              </p>
            </section>
          )}

          {/* সময় ও Status */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <SectionTitle
              icon={FiClock}
              title="সময় ও Status"
              description="পরীক্ষার সময়সীমা এবং চালু/বন্ধ অবস্থা পরিবর্তন করুন।"
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="duration-minutes" className={labelClass}>
                  পরীক্ষার সময় — মিনিট *
                </label>

                <input
                  id="duration-minutes"
                  type="number"
                  min="0"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label htmlFor="duration-seconds" className={labelClass}>
                  অতিরিক্ত সময় — সেকেন্ড *
                </label>

                <input
                  id="duration-seconds"
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(event) => setSeconds(event.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label htmlFor="exam-start" className={labelClass}>
                  <span className="inline-flex items-center gap-2">
                    <FiCalendar size={15} />
                    পরীক্ষা শুরুর তারিখ ও সময় *
                  </span>
                </label>

                <input
                  id="exam-start"
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label htmlFor="exam-finish" className={labelClass}>
                  <span className="inline-flex items-center gap-2">
                    <FiCalendar size={15} />
                    পরীক্ষা শেষের তারিখ ও সময় *
                  </span>
                </label>

                <input
                  id="exam-finish"
                  type="datetime-local"
                  value={finishTime}
                  onChange={(event) => setFinishTime(event.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>পরীক্ষার Status</label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setStatus(true)}
                    aria-pressed={status}
                    className={`rounded-xl px-5 py-2.5 text-sm font-bold ${
                      status
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    On
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus(false)}
                    aria-pressed={!status}
                    className={`rounded-xl px-5 py-2.5 text-sm font-bold ${
                      !status
                        ? "bg-red-600 text-white"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    Off
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* প্রশ্নভান্ডার */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <SectionTitle
              icon={FiFileText}
              title="প্রশ্নভান্ডার"
              description="প্রশ্ন, অপশন, সঠিক উত্তর ও ব্যাখ্যা সম্পাদনা করুন। শিক্ষার্থীরা এখান থেকে এলোমেলোভাবে নির্ধারিত সংখ্যক প্রশ্ন পাবে।"
            />

            {/* সংখ্যার সারাংশ */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  প্রশ্নভান্ডারে মোট
                </p>
                <p className="mt-1 text-2xl font-bold">{questions.length}</p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  প্রতি শিক্ষার্থী পাবে
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {Number(questionCount) || 0}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  পূর্ণমান / প্রতি প্রশ্নে
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {Number(fullMarks) || 0} / {marksPerQuestion}
                </p>
              </div>
            </div>

            {questions.length > 0 &&
              questions.length < (Number(questionCount) || 0) && (
                <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  প্রশ্নভান্ডারে আছে {questions.length}টি, কিন্তু{" "}
                  {Number(questionCount)}টি নির্ধারিত। আরও প্রশ্ন যোগ করুন অথবা
                  প্রশ্নসংখ্যা কমান।
                </p>
              )}

            <OnlineExamQuestions
              questions={questions}
              setQuestions={setQuestions}
            />
          </section>

          {/* Actions */}
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => navigate("/manage-exams")}
              className="rounded-xl border border-slate-200 px-5 py-3 font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              বাতিল
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E74C3C] px-6 py-3 font-bold text-white shadow-lg shadow-[#E74C3C]/20 transition hover:bg-[#D94335] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <FiLoader className="animate-spin" size={18} />
                  সংরক্ষণ হচ্ছে...
                </>
              ) : (
                <>
                  <FiCheckCircle size={18} />
                  পরিবর্তন সংরক্ষণ করুন
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
