import { useCallback, useEffect, useState } from "react";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  getFirestore,
} from "firebase/firestore";

import {
  MdMenuBook,
  MdCalendarMonth,
  MdAccessTime,
  MdTimer,
  MdRefresh,
  MdEventAvailable,
  MdHistory,
  MdSchool,
  MdErrorOutline,
} from "react-icons/md";
import { app } from "../firebase/firebase.init";

const db = getFirestore(app);

const normalize = (value) => String(value ?? "").trim();

const normalizeDepartment = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && normalize(value) !== ""
    ? String(number)
    : normalize(value);
};

const getExamDate = (exam) => {
  if (!exam.examDate) return null;

  const date = normalize(exam.examDate);
  const time = normalize(exam.examTime) || "00:00";
  const parsed = new Date(`${date}T${time}:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date) =>
  date
    ? new Intl.DateTimeFormat("bn-BD", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    : "তারিখ নির্ধারিত নয়";

const formatTime = (time) => {
  if (!time) return "সময় নির্ধারিত নয়";

  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return new Intl.DateTimeFormat("bn-BD", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

function Countdown({ target }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, target.getTime() - Date.now()),
  );

  useEffect(() => {
    const update = () =>
      setRemaining(Math.max(0, target.getTime() - Date.now()));

    update();
    const timer = setInterval(update, 1000);

    return () => clearInterval(timer);
  }, [target]);

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (remaining <= 0) {
    return (
      <div className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-center font-bold text-success">
        পরীক্ষা শুরু হওয়ার সময় হয়েছে!
      </div>
    );
  }

  const units = [
    { label: "দিন", value: days },
    { label: "ঘণ্টা", value: hours },
    { label: "মিনিট", value: minutes },
    { label: "সেকেন্ড", value: seconds },
  ];

  return (
    <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-3">
      {units.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-xl border border-white/15 bg-white/10 px-1 py-3 text-center backdrop-blur-sm sm:py-4"
        >
          <div className="text-2xl font-black tabular-nums sm:text-3xl">
            {value.toLocaleString("bn-BD", { minimumIntegerDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-white/70">{label}</div>
        </div>
      ))}
    </div>
  );
}

function SyllabusCard({ exam }) {
  const date = getExamDate(exam);

  return (
    <article className="group rounded-2xl border border-base-300 bg-base-100 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:scale-105">
          <MdMenuBook size={23} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold leading-6">
            {exam.examType || "পরীক্ষার সিলেবাস"}
          </h3>
          <p className="mt-1 text-xs text-base-content/55">
            {exam.departmentName || "TopLine Education"} ·{" "}
            {exam.className || "শ্রেণি নির্ধারিত নয়"}
          </p>
        </div>

        {Number.isFinite(Number(exam.totalMark)) && (
          <span className="shrink-0 rounded-lg bg-base-200 px-2.5 py-1.5 text-xs font-bold">
            {Number(exam.totalMark)} নম্বর
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-base-content/60">
        <span className="inline-flex items-center gap-1.5">
          <MdCalendarMonth className="text-primary" size={16} />
          {formatDate(date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MdAccessTime className="text-primary" size={16} />
          {formatTime(exam.examTime)}
        </span>
      </div>

      {Array.isArray(exam.subjects) && exam.subjects.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-base-300 pt-3">
          {exam.subjects.map((subject, index) => (
            <div
              key={subject.subjectId || `${subject.subjectName}-${index}`}
              className="rounded-xl bg-base-200/70 p-3"
            >
              <h4 className="text-sm font-bold">
                {subject.subjectName || "বিষয়"}
              </h4>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-base-content/70">
                {subject.syllabus || "সিলেবাস উল্লেখ করা হয়নি।"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 border-t border-base-300 pt-3 text-sm text-base-content/55">
          এই সিলেবাসে কোনো বিষয় যোগ করা হয়নি।
        </p>
      )}
    </article>
  );
}

export default function ViewSyllabus() {
  const [student, setStudent] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSyllabuses = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sessionText = localStorage.getItem("studentSession");

      if (!sessionText) {
        throw new Error("শিক্ষার্থীর লগইন তথ্য পাওয়া যায়নি। আবার লগইন করুন।");
      }

      const session = JSON.parse(sessionText);
      const studentDocId = session.documentId || session.studentId;

      if (!studentDocId) {
        throw new Error("শিক্ষার্থীর ID পাওয়া যায়নি।");
      }

      const studentSnapshot = await getDoc(
        doc(db, "students", String(studentDocId)),
      );

      if (!studentSnapshot.exists()) {
        throw new Error("শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি।");
      }

      const profile = {
        ...studentSnapshot.data(),
        ...session,
      };

      // Firestore profile-এর class/batch তথ্যকে অগ্রাধিকার দিন।
      const actualStudent = {
        ...session,
        ...studentSnapshot.data(),
        documentId: studentSnapshot.id,
      };

      // Session-এ সংরক্ষিত display তথ্য হারিয়ে গেলে ব্যবহার করুন।
      actualStudent.name ||= profile.name;
      actualStudent.departmentName ||= profile.departmentName;

      setStudent(actualStudent);

      const snapshot = await getDocs(collection(db, "syllabuses"));

      const departmentId = normalizeDepartment(actualStudent.departmentId);
      const isCare = departmentId === "3";

      // Care শিক্ষার্থীদের batchId; অন্যদের classId।
      const groupId = normalize(
        isCare
          ? actualStudent.batchId || actualStudent.classId
          : actualStudent.classId || actualStudent.batchId,
      );

      if (!departmentId || !groupId) {
        setExams([]);
        return;
      }

      const matchingExams = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((exam) => {
          const sameDepartment =
            normalizeDepartment(exam.departmentId) === departmentId;

          // Care-এর syllabus-এ classId=batch1 এবং classType=classes
          // থাকলেও এটি সঠিকভাবে match করবে।
          const sameGroup = normalize(exam.classId) === groupId;

          return sameDepartment && sameGroup;
        })
        .sort((a, b) => {
          const dateA = getExamDate(a)?.getTime() || 0;
          const dateB = getExamDate(b)?.getTime() || 0;
          return dateB - dateA;
        });

      setExams(matchingExams);
    } catch (err) {
      console.error("View syllabus error:", err);
      setError(
        err.code === "permission-denied"
          ? "সিলেবাস দেখার অনুমতি নেই। Firestore Security Rules পরীক্ষা করুন।"
          : err.message || "সিলেবাস লোড করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSyllabuses();
  }, [loadSyllabuses]);

  const now = Date.now();

  const upcomingExams = exams
    .filter((exam) => {
      const date = getExamDate(exam);
      return date && date.getTime() > now;
    })
    .sort((a, b) => getExamDate(a) - getExamDate(b));

  const nextExam = upcomingExams[0];

  const oldExams = exams.filter((exam) => {
    const date = getExamDate(exam);
    return !date || date.getTime() <= now;
  });

  if (loading) {
    return (
      <main className="min-h-[60vh] bg-base-200/50 px-4 py-12 text-base-content">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-base-300" />
          <div className="h-44 animate-pulse rounded-2xl bg-base-300" />
          <div className="h-28 animate-pulse rounded-2xl bg-base-300" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-[60vh] bg-base-200/50 px-4 py-12 text-base-content">
        <div className="mx-auto max-w-lg rounded-2xl border border-base-300 bg-base-100 p-7 text-center shadow-sm">
          <MdErrorOutline className="mx-auto mb-3 text-4xl text-error" />
          <h2 className="text-lg font-extrabold">সিলেবাস লোড করা যায়নি</h2>
          <p className="mt-2 text-sm leading-6 text-base-content/60">{error}</p>
          <button
            type="button"
            onClick={loadSyllabuses}
            className="btn btn-primary btn-sm mt-5 gap-2"
          >
            <MdRefresh size={18} />
            আবার চেষ্টা করুন
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-200/50 px-4 py-6 text-base-content transition-colors duration-300 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        {/* Student heading */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">
              STUDENT PORTAL
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              পরীক্ষার সিলেবাস
            </h1>
            <p className="mt-1 text-sm text-base-content/60">
              {student?.name || "শিক্ষার্থী"} ·{" "}
              {student?.departmentName || "আপনার বিভাগ"}
            </p>
          </div>

          <button
            type="button"
            onClick={loadSyllabuses}
            className="btn btn-ghost btn-square rounded-xl border border-base-300 bg-base-100"
            title="রিফ্রেশ"
            aria-label="সিলেবাস রিফ্রেশ করুন"
          >
            <MdRefresh size={21} />
          </button>
        </header>

        {/* Upcoming exam countdown */}
        {nextExam ? (
          <section className="countdown-enter relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-secondary p-5 text-primary-content shadow-xl shadow-primary/10 sm:p-7">
            <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[28px] border-white/[0.07]" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-white/[0.07] blur-2xl" />

            <div className="relative">
              <h2 className="mt-3 text-xl font-black sm:text-2xl">
                {nextExam.examType || "আসন্ন পরীক্ষা"}
              </h2>

              <p className="mt-1 text-sm text-white/75">
                {nextExam.departmentName} · {nextExam.className}
              </p>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <MdCalendarMonth size={18} />
                  {formatDate(getExamDate(nextExam))}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MdAccessTime size={18} />
                  {formatTime(nextExam.examTime)}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-2 text-sm font-bold">
                <MdTimer size={20} />
                পরীক্ষা শুরু হতে বাকি
              </div>

              <Countdown key={nextExam.id} target={getExamDate(nextExam)} />
            </div>
          </section>
        ) : (
          <section className="mb-8 rounded-2xl border border-base-300 bg-base-100 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
                <MdEventAvailable size={25} />
              </div>
              <div>
                <h2 className="font-extrabold">এখন কোনো আসন্ন পরীক্ষা নেই</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  নতুন পরীক্ষার সিলেবাস প্রকাশ হলে এখানে দেখতে পাবেন।
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Upcoming syllabus details */}
        {upcomingExams.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <MdEventAvailable className="text-primary" size={22} />
              <h2 className="text-lg font-black">আসন্ন পরীক্ষার সিলেবাস</h2>
              <span className="badge badge-primary badge-sm">
                {upcomingExams.length.toLocaleString("bn-BD")}
              </span>
            </div>

            <div className="space-y-4">
              {upcomingExams.map((exam) => (
                <SyllabusCard key={exam.id} exam={exam} />
              ))}
            </div>
          </section>
        )}

        {/* Previous exams */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <MdHistory className="text-primary" size={22} />
            <h2 className="text-lg font-black">পুরোনো সিলেবাস</h2>
            <span className="badge badge-ghost border border-base-300">
              {oldExams.length.toLocaleString("bn-BD")}
            </span>
          </div>

          {oldExams.length > 0 ? (
            <div className="space-y-4">
              {oldExams.map((exam) => (
                <SyllabusCard key={exam.id} exam={exam} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 px-5 py-10 text-center">
              <MdSchool className="mx-auto mb-3 text-4xl text-base-content/25" />
              <h3 className="font-bold">এখনো কোনো পুরোনো সিলেবাস নেই</h3>
              <p className="mt-1 text-sm text-base-content/55">
                পরীক্ষার সিলেবাস প্রকাশ হলে এখানে সংরক্ষিত থাকবে।
              </p>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes countdown-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .countdown-enter {
          animation: countdown-enter .45s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .countdown-enter { animation: none; }
        }
      `}</style>
    </main>
  );
}
