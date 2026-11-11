import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  MdArrowForward,
  MdMenuBook,
  MdCheckCircle,
  MdSchedule,
  MdLock,
  MdRefresh,
} from "react-icons/md";
import vocabulary from "../../students/data/modifierWords";

const SESSION_KEY = "studentSession";
const START_DATE = "2026-11-04";
const DAILY_COUNT = 15;

/* =========================================================
   Get Today's Set Information
========================================================= */

function getSetInfo() {
  if (!vocabulary?.length || DAILY_COUNT < 1) return null;

  const totalSets = Math.ceil(vocabulary.length / DAILY_COUNT);

  const [year, month, day] = START_DATE.split("-").map(Number);

  const start = Date.UTC(year, month - 1, day);

  const now = new Date();

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const elapsed = Math.max(0, Math.floor((today - start) / 86400000));

  const setNumber = (elapsed % totalSets) + 1;

  const cycle = Math.floor(elapsed / totalSets);

  return {
    setNumber,
    totalSets,
    setKey: `${START_DATE.replaceAll("-", "")}_count${DAILY_COUNT}_set${setNumber}_cycle${cycle}`,
  };
}

/* =========================================================
   Read Exam Result
========================================================= */

function readExam(studentId, setKey) {
  try {
    const storageKey = `topline-modifier-result-${studentId}_${setKey}`;

    const raw = localStorage.getItem(storageKey);

    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Unable to read verb result:", error);

    return null;
  }
}

/* =========================================================
   Get Student Session
========================================================= */

function getStudentSession() {
  try {
    const rawSession = localStorage.getItem(SESSION_KEY);

    if (!rawSession) return null;

    const session = JSON.parse(rawSession);

    if (session?.role !== "student" || !session?.documentId) {
      return null;
    }

    return session;
  } catch (error) {
    console.error("Unable to read student session:", error);

    return null;
  }
}

/* =========================================================
   Main Word Widget
========================================================= */

export default function WordWidget() {
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  /* Load Exam Information */

  const loadExam = useCallback(() => {
    setLoading(true);
    setError(false);

    try {
      const session = getStudentSession();

      if (!session) {
        setLoggedIn(false);
        setExam(null);
        return;
      }

      setLoggedIn(true);

      const setInfo = getSetInfo();

      if (!setInfo) {
        setError(true);
        return;
      }

      const result = readExam(String(session.documentId), setInfo.setKey);

      if (result) {
        setExam({
          ...result,
          setNumber: setInfo.setNumber,
        });
      } else {
        setExam({
          status: "not-started",
          mark: 0,
          setNumber: setInfo.setNumber,
        });
      }
    } catch (err) {
      console.error("WordWidget:", err);

      setError(true);
      setExam(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExam();
  }, [loadExam]);

  /* =======================================================
     Status Information
  ======================================================= */

  const status = exam?.status;

  let statusContent = (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
      <MdSchedule size={16} />
    </p>
  );

  let buttonText = "দেখুন";

  let buttonClass =
    "bg-[#2C3E50] text-white hover:bg-[#243442] shadow-[#2C3E50]/10";

  let Icon = MdArrowForward;

  /* Not Logged In */

  if (!loggedIn && !loading) {
    statusContent = (
      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 sm:text-sm">
        Modifer Vocabulary পরীক্ষার জন্য শিক্ষার্থী হিসেবে লগইন করুন।
      </p>
    );

    buttonText = "লগইন করুন";
  } else if (loading) {
    /* Loading */
    statusContent = (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
        <MdRefresh className="animate-spin" size={16} />
        পরীক্ষার তথ্য লোড হচ্ছে...
      </p>
    );

    buttonText = "লোড হচ্ছে";
    Icon = MdRefresh;
  } else if (error) {
    /* Error */
    statusContent = (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-red-500 sm:text-sm">
        <MdLock size={16} />
        পরীক্ষার তথ্য লোড করা যায়নি।
      </p>
    );

    buttonText = "আবার চেষ্টা করুন";
    Icon = MdRefresh;

    buttonClass =
      "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400";
  } else if (status === "in-progress") {
    /* In Progress */
    statusContent = (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 sm:text-sm">
        <MdSchedule size={16} />
        পরীক্ষা অসম্পূর্ণ। বাকি সময়ের মধ্যে উত্তর দিন।
      </p>
    );

    buttonText = "পরীক্ষা চালিয়ে যান";

    buttonClass = "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/10";
  } else if (status === "submitted") {
    /* Submitted */
    statusContent = (
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
        <MdCheckCircle size={17} className="text-emerald-500" />

        <span className="text-slate-500 dark:text-slate-400">
          আজকের প্রাপ্ত পয়েন্ট:
        </span>

        <span className="font-black text-emerald-600 dark:text-emerald-400">
          {Number(exam?.mark) || 0}
        </span>
      </p>
    );

    buttonText = "ফলাফল দেখুন";

    buttonClass =
      "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/10";

    Icon = MdCheckCircle;
  } else if (status === "expired") {
    /* Expired */
    statusContent = (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 sm:text-sm">
        <MdLock size={16} />
        সময় শেষ হয়েছে। প্রাপ্ত পয়েন্ট: ০
      </p>
    );

    buttonText = "ফলাফল দেখুন";

    buttonClass =
      "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/10";

    Icon = MdLock;
  }

  /* =======================================================
     Button Navigation
  ======================================================= */

  const destination = loggedIn ? "/todays-word" : "/login";

  /* =======================================================
     UI
  ======================================================= */

  return (
    <section className="group relative my-4 overflow-hidden rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/[0.04] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Decorative Background */}

      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border-[24px] border-[#E74C3C]/[0.045] transition-transform duration-500 group-hover:scale-110" />

      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-32 w-32 rounded-full bg-[#2C3E50]/[0.04] blur-2xl dark:bg-white/[0.04]" />

      {/* Top Accent */}

      <div className="h-1 w-full bg-gradient-to-r from-[#2C3E50] via-[#E74C3C] to-[#2C3E50]" />

      <div className="relative flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        {/* Left Content */}

        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {/* Icon */}

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E74C3C]/10 text-[#E74C3C] shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-14 sm:w-14">
            <MdMenuBook size={29} />
          </div>

          {/* Text */}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black tracking-tight text-[#2C3E50] dark:text-white sm:text-base">
                আজকের Modifier Vocabulary
              </h3>

              {!loading && !error && loggedIn && exam?.setNumber && (
                <span className="rounded-md border border-[#E74C3C]/15 bg-[#E74C3C]/10 px-2 py-0.5 text-[10px] font-black text-[#E74C3C]">
                  সেট {exam.setNumber}
                </span>
              )}
            </div>

            {statusContent}

            {/* Daily Information */}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <MdMenuBook size={12} />
                দৈনিক {DAILY_COUNT}টি শব্দ
              </span>

              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <MdSchedule size={12} />
                প্রতিদিন নতুন সেট
              </span>
            </div>
          </div>
        </div>

        {/* Right Action */}

        <div className="flex shrink-0 items-center gap-2">
          {/* Retry Button */}

          {error && (
            <button
              type="button"
              onClick={loadExam}
              disabled={loading}
              title="আবার চেষ্টা করুন"
              aria-label="আবার চেষ্টা করুন"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <MdRefresh size={20} className={loading ? "animate-spin" : ""} />
            </button>
          )}

          <Link
            to={destination}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-md transition-all duration-200 active:scale-[0.97] sm:text-sm ${buttonClass} ${
              loading ? "pointer-events-none opacity-60" : ""
            }`}
            aria-disabled={loading}
            onClick={(event) => {
              if (loading || error) {
                event.preventDefault();
              }
            }}
          >
            <span>{buttonText}</span>

            <Icon size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
