import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { motion } from "framer-motion";

import { departments } from "../../config/departments";
import { db } from "../firebase/firebase.init";

const MONTHLY_CLASS_TARGET = 20;

const toBangla = (value) =>
  String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[digit]);

const normalizeName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

function getStudentDepartmentName(student) {
  return String(
    student?.departmentName ??
      student?.department ??
      student?.programName ??
      "",
  ).trim();
}

function getStudentClassName(student) {
  return String(
    student?.batchName ??
      student?.className ??
      student?.batch ??
      student?.class ??
      "",
  ).trim();
}

function getDepartmentByName(student) {
  const departmentName = normalizeName(getStudentDepartmentName(student));

  if (!departmentName) return null;

  return (
    Object.values(departments).find(
      (department) => normalizeName(department.name) === departmentName,
    ) ?? null
  );
}

function getConfiguredClassName(student, department) {
  if (!department) return "";

  const studentClassName = normalizeName(getStudentClassName(student));

  if (!studentClassName) return "";

  const configuredClass = department.classes?.find(
    (item) => normalizeName(item.name) === studentClassName,
  );

  return configuredClass?.name ?? "";
}

function toDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && value.seconds != null) {
    return new Date(value.seconds * 1000);
  }

  return null;
}

function getRecordDepartmentName(record) {
  return String(
    record?.departmentName ?? record?.department ?? record?.programName ?? "",
  ).trim();
}

function getRecordClassName(record) {
  return String(
    record?.batchName ??
      record?.className ??
      record?.batch ??
      record?.class ??
      "",
  ).trim();
}

function getMonthNumber(record) {
  if (record?.monthNumber != null) {
    return Number(record.monthNumber);
  }

  const date = toDate(
    record?.startDate ?? record?.monthStart ?? record?.createdAt,
  );

  return date ? date.getMonth() + 1 : 0;
}

function getYear(record) {
  if (record?.year != null) {
    return Number(record.year);
  }

  const date = toDate(
    record?.startDate ?? record?.monthStart ?? record?.createdAt,
  );

  return date?.getFullYear() ?? new Date().getFullYear();
}

function getDateString(value) {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = toDate(value);

  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Works for attendance records (and old session records).
function getSessionDate(record) {
  return getDateString(
    record?.date ??
      record?.sessionDate ??
      record?.attendanceDate ??
      record?.createdAt,
  );
}

function getMonthStart(record) {
  return getDateString(
    record?.startDate ?? record?.monthStart ?? record?.fromDate,
  );
}

function getMonthEnd(record) {
  return getDateString(record?.endDate ?? record?.monthEnd ?? record?.toDate);
}

// Batch month, not calendar month.
function getMonthName(monthNumber) {
  return `মাস ${toBangla(monthNumber)}`;
}

function isSessionWithinMonth(record, month) {
  const sessionDate = getSessionDate(record);

  if (!sessionDate) return false;

  const startDate = getMonthStart(month);
  const endDate = getMonthEnd(month);

  if (startDate && sessionDate < startDate) return false;
  if (endDate && sessionDate > endDate) return false;

  if (!startDate && !endDate) {
    return (
      Number(sessionDate.slice(5, 7)) === getMonthNumber(month) &&
      Number(sessionDate.slice(0, 4)) === getYear(month)
    );
  }

  return true;
}

export default function MonthlyProgress({
  student,
  compact = false,
  onViewAll,
}) {
  const [months, setMonths] = useState([]);
  // Attendance records for this batch (one per student per day).
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const department = useMemo(() => getDepartmentByName(student), [student]);

  const departmentName = department?.name ?? "";

  const className = useMemo(
    () => getConfiguredClassName(student, department),
    [student, department],
  );

  // Realtime Firestore updates
  useEffect(() => {
    if (!departmentName || !className) {
      setMonths([]);
      setAttendanceRecords([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    let pending = 2;

    const handleLoaded = () => {
      pending -= 1;

      if (pending === 0) {
        setLoading(false);
      }
    };

    const handleError = (err) => {
      console.error("Monthly progress loading failed:", err);
      setError("অগ্রগতির তথ্য লোড করা যায়নি।");
      setLoading(false);
    };

    const departmentKey = normalizeName(departmentName);
    const classKey = normalizeName(className);

    const unsubscribeMonths = onSnapshot(
      collection(db, "batchMonthStates"),
      (snapshot) => {
        const records = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter(
            (record) =>
              normalizeName(getRecordDepartmentName(record)) ===
                departmentKey &&
              normalizeName(getRecordClassName(record)) === classKey,
          )
          .sort((a, b) => {
            const yearDifference = getYear(a) - getYear(b);

            return yearDifference !== 0
              ? yearDifference
              : getMonthNumber(a) - getMonthNumber(b);
          });

        setMonths(records);
        handleLoaded();
      },
      handleError,
    );

    // Read attendance directly. AddAttendance saves className = batch name.
    const unsubscribeAttendance = onSnapshot(
      query(
        collection(db, "attendance"),
        where("departmentName", "==", departmentName),
        where("className", "==", className),
      ),
      (snapshot) => {
        setAttendanceRecords(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
        handleLoaded();
      },
      handleError,
    );

    return () => {
      unsubscribeMonths();
      unsubscribeAttendance();
    };
  }, [departmentName, className]);

  // Current active month or latest month
  const currentMonth = useMemo(() => {
    const activeMonth = months.find(
      (month) => normalizeName(month.status) === "active",
    );

    return activeMonth ?? months.at(-1) ?? null;
  }, [months]);

  // Attendance records inside current month
  const currentMonthRecords = useMemo(() => {
    if (!currentMonth) return [];

    return attendanceRecords.filter((record) =>
      isSessionWithinMonth(record, currentMonth),
    );
  }, [attendanceRecords, currentMonth]);

  // One class = one unique attendance date for this batch.
  const completedClasses = useMemo(() => {
    const dates = new Set(
      currentMonthRecords.map(getSessionDate).filter(Boolean),
    );

    return dates.size;
  }, [currentMonthRecords]);

  const target = Math.max(
    1,
    Number(
      currentMonth?.plannedClasses ??
        currentMonth?.targetClasses ??
        currentMonth?.monthlyTarget ??
        MONTHLY_CLASS_TARGET,
    ),
  );

  const percentage = Math.min(
    100,
    Math.round((completedClasses / target) * 100),
  );

  const isActive = normalizeName(currentMonth?.status) === "active";

  const monthLabel = currentMonth
    ? getMonthName(getMonthNumber(currentMonth))
    : "";

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (!department || !className) {
    if (compact) return null;

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
        শিক্ষার্থীর ডিপার্টমেন্ট ও ব্যাচের নাম departments.js-এর সঙ্গে মিলছে না।
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!currentMonth) {
    if (compact) return null;

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {className} ব্যাচের মাসিক অগ্রগতির তথ্য এখনো তৈরি হয়নি।
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            মাসিক ক্লাস অগ্রগতি
          </p>

          <h3 className="mt-1 truncate text-base font-bold text-slate-800 dark:text-slate-100">
            {monthLabel}
          </h3>

          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {className}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isActive
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {isActive ? "চলমান" : "বন্ধ"}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {toBangla(completedClasses)}
            <span className="ml-1 text-sm font-medium text-slate-400 dark:text-slate-500">
              / {toBangla(target)} ক্লাস
            </span>
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {percentage === 100
              ? "মাসিক ক্লাসের লক্ষ্য পূরণ হয়েছে"
              : `আর ${toBangla(Math.max(0, target - completedClasses))}টি ক্লাস বাকি`}
          </p>
        </div>

        <span className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
          {toBangla(percentage)}%
        </span>
      </div>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-label="মাসিক ক্লাস অগ্রগতি"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(completedClasses, target)}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full rounded-full ${
            percentage === 100
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-blue-600 to-sky-400 dark:from-blue-500 dark:to-cyan-400"
          }`}
        />
      </div>

      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-4 text-xs font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          বিস্তারিত দেখুন <span aria-hidden="true">→</span>
        </button>
      )}
    </motion.section>
  );
}
