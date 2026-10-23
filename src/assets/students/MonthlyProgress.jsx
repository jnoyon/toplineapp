import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import toast from "react-hot-toast";
import {
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiTrendingUp,
} from "react-icons/fi";
import { db } from "../firebase/firebase.init";

const MONTHLY_CLASS_TARGET = 20;

function getBatchId(student) {
  return String(
    student?.batchId ?? student?.classId ?? student?.batchDocumentId ?? "",
  );
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getPercentage(completed, target) {
  if (!target || target <= 0) return 0;

  return Math.min(100, Math.round((completed / target) * 100));
}

export default function MonthlyProgress({
  student,
  compact = false,
  onViewAll,
}) {
  const [months, setMonths] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const batchId = getBatchId(student);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!student || !batchId) {
        setMonths([]);
        setSessions([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [monthSnapshot, sessionSnapshot] = await Promise.all([
          getDocs(collection(db, "batchMonthStates")),
          getDocs(collection(db, "attendanceSessions")),
        ]);

        if (cancelled) return;

        const monthRecords = monthSnapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter(
            (item) =>
              String(item.batchId ?? "") === batchId &&
              String(item.departmentId ?? "") === "3",
          )
          .sort(
            (a, b) => Number(a.monthNumber ?? 0) - Number(b.monthNumber ?? 0),
          );

        const attendanceRecords = sessionSnapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter(
            (item) =>
              String(item.classId ?? "") === batchId &&
              String(item.departmentId ?? "") === "3",
          );

        setMonths(monthRecords);
        setSessions(attendanceRecords);
      } catch (error) {
        console.error("Monthly progress loading error:", error);

        if (!cancelled) {
          toast.error("মাসিক অগ্রগতি লোড করা যায়নি।");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProgress();

    return () => {
      cancelled = true;
    };
  }, [student, batchId]);

  const progress = useMemo(() => {
    const activeMonth = months.find((month) => month.status === "active");

    const latestMonth = months.at(-1) ?? null;
    const currentMonth = activeMonth ?? latestMonth;

    if (!currentMonth) {
      return {
        activeMonth: null,
        latestMonth: null,
        currentMonth: null,
        completed: 0,
        target: MONTHLY_CLASS_TARGET,
        percentage: 0,
        history: months,
      };
    }

    let completed = Number(currentMonth.completedClasses ?? 0);

    if (activeMonth) {
      const uniqueSessions = new Set();

      sessions.forEach((session) => {
        const date = String(session.date ?? "");

        if (
          date >= String(activeMonth.startDate ?? "") &&
          date <= String(activeMonth.endDate ?? "")
        ) {
          uniqueSessions.add(session.id);
        }
      });

      completed = uniqueSessions.size;
    }

    const target = Number(currentMonth.plannedClasses ?? MONTHLY_CLASS_TARGET);

    return {
      activeMonth,
      latestMonth,
      currentMonth,
      completed,
      target,
      percentage: getPercentage(completed, target),
      history: months,
    };
  }, [months, sessions]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <span className="loading loading-spinner loading-sm text-[#E74C3C]" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          মাসিক অগ্রগতি লোড হচ্ছে...
        </p>
      </div>
    );
  }

  if (!progress.currentMonth) {
    return compact ? null : (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#2C3E50] dark:bg-slate-700 dark:text-white">
            <FiCalendar size={22} />
          </span>

          <div>
            <h2 className="font-bold text-[#2C3E50] dark:text-white">
              মাসিক অগ্রগতি
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              এখনো মাসিক ক্লাসের তথ্য পাওয়া যায়নি।
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { activeMonth, currentMonth, completed, target, percentage, history } =
    progress;

  const isActive = activeMonth?.id === currentMonth.id;
  const remaining = Math.max(0, target - completed);

  // Portal: compact progress bar only
  if (compact) {
    return (
      <section className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 text-white backdrop-blur-md sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FiTrendingUp size={19} className="text-emerald-300" />
            <h2 className="text-sm font-bold sm:text-base">
              মাসিক ক্লাসের অগ্রগতি
            </h2>
          </div>

          <span className="text-sm font-bold">{percentage}%</span>
        </div>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-400 transition-[width] duration-700"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/75">
          <span>
            {completed} / {target}টি ক্লাস সম্পন্ন
          </span>
          <span>{remaining}টি বাকি</span>
        </div>
      </section>
    );
  }

  // Student Profile: full monthly progress
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <div className="h-1.5 bg-gradient-to-r from-[#2C3E50] via-[#E74C3C] to-[#F39C12]" />

      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E74C3C]/10 text-[#E74C3C]">
              <FiCalendar size={22} />
            </span>

            <div>
              <h2 className="text-lg font-black text-[#2C3E50] dark:text-white sm:text-xl">
                মাসিক অগ্রগতি
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                মাসিক ক্লাসের হিসাব
              </p>
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              isActive
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            }`}
          >
            {isActive ? "চলমান মাস" : "মাস সম্পন্ন"}
          </span>
        </div>

        <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isActive ? "বর্তমান মাস" : "সর্বশেষ মাস"}
            </p>

            <h3 className="mt-1 text-3xl font-black text-[#2C3E50] dark:text-white">
              মাস {currentMonth.monthNumber}
            </h3>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {formatDate(currentMonth.startDate)}
              {" — "}
              {formatDate(currentMonth.endDate)}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(#E74C3C ${percentage * 3.6}deg, var(--progress-track) 0deg)`,
                "--progress-track": "rgb(226 232 240)",
              }}
            >
              <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-white dark:bg-slate-800">
                <span className="text-xl font-black text-[#2C3E50] dark:text-white">
                  {percentage}%
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  অগ্রগতি
                </span>
              </div>
            </div>

            <div>
              <p className="text-2xl font-black text-[#2C3E50] dark:text-white">
                {completed}
                <span className="text-base font-semibold text-slate-400">
                  {" "}
                  / {target}
                </span>
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                সম্পন্ন ক্লাস
              </p>

              <p className="mt-1 text-xs font-semibold text-[#E74C3C]">
                {remaining}টি বাকি
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2C3E50] to-[#E74C3C] transition-[width] duration-700"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#2C3E50] dark:text-white">
              মাসের ইতিহাস
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {history.length}টি মাস
            </span>
          </div>

          <div className="space-y-2">
            {[...history]
              .slice(-3)
              .reverse()
              .map((month) => {
                const current = month.id === activeMonth?.id;
                const monthTarget = Number(
                  month.plannedClasses ?? MONTHLY_CLASS_TARGET,
                );

                let monthCompleted = Number(month.completedClasses ?? 0);

                if (current) {
                  const uniqueSessions = new Set(
                    sessions
                      .filter((session) => {
                        const date = String(session.date ?? "");
                        return (
                          date >= String(month.startDate ?? "") &&
                          date <= String(month.endDate ?? "")
                        );
                      })
                      .map((session) => session.id),
                  );

                  monthCompleted = uniqueSessions.size;
                }

                const monthPercentage = getPercentage(
                  monthCompleted,
                  monthTarget,
                );

                return (
                  <div
                    key={month.id}
                    className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-black text-[#2C3E50] shadow-sm dark:bg-slate-700 dark:text-white">
                      {month.monthNumber}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#2C3E50] dark:text-white">
                          মাস {month.monthNumber}
                        </p>

                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {monthCompleted}/{monthTarget}
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={`h-full rounded-full ${
                            current ? "bg-[#E74C3C]" : "bg-[#2C3E50]"
                          }`}
                          style={{ width: `${monthPercentage}%` }}
                        />
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                        current
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {current ? "চলমান" : "বন্ধ"}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-[#2C3E50] transition hover:border-[#E74C3C]/40 hover:bg-[#E74C3C]/5 hover:text-[#E74C3C] dark:border-slate-600 dark:text-white dark:hover:bg-slate-700"
          >
            বিস্তারিত দেখুন
            <FiClock size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
