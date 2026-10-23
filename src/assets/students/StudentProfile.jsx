import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase/firebase.init";
import MonthlyProgress from "./MonthlyProgress";

// ==================================================
// Helper Functions
// ==================================================

export function toBangla(value) {
  const digits = "০১২৩৪৫৬৭৮৯";

  return String(value ?? "").replace(/\d/g, (digit) => digits[Number(digit)]);
}

export function banglaDate(value) {
  if (!value) return "তথ্য নেই";

  let date;

  if (value?.toDate) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "তথ্য নেই";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return toBangla(`${day}/${month}/${year}`);
}

function normalizeId(value) {
  return String(value ?? "").replace(/^0+/, "") || "0";
}

function getStatus(student) {
  if (student?.approved === true || student?.status === "approved") {
    return {
      label: "অনুমোদিত",
      className: "bg-green-100 text-green-700",
    };
  }

  if (student?.status === "rejected") {
    return {
      label: "অননুমোদিত",
      className: "bg-red-100 text-red-700",
    };
  }

  return {
    label: "অনুমোদনের অপেক্ষায়",
    className: "bg-amber-100 text-amber-700",
  };
}

function getAttendanceStatus(record) {
  if (!record) return "none";

  if (
    record.present === true ||
    record.present === "present" ||
    record.status === "present"
  ) {
    return "present";
  }

  if (
    record.present === false ||
    record.present === "absent" ||
    record.status === "absent"
  ) {
    return "absent";
  }

  return "none";
}

function getDressCodeStatus(value) {
  if (value === true) return "পরিহিত";
  if (value === false) return "পরিহিত নয়";

  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();

    if (
      ["yes", "true", "present", "worn", "পরিহিত", "হ্যাঁ"].includes(normalized)
    ) {
      return "পরিহিত";
    }

    if (
      ["no", "false", "absent", "not worn", "পরিহিত নয়", "না"].includes(
        normalized,
      )
    ) {
      return "পরিহিত নয়";
    }

    return value;
  }

  return "তথ্য নেই";
}

function getStudentName(student) {
  return (
    student?.name || student?.studentName || student?.fullName || "শিক্ষার্থী"
  );
}

// ==================================================
// Reusable UI Components
// ==================================================

function InfoItem({ label, value }) {
  const displayValue = value === 0 ? "০" : value || "তথ্য নেই";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>

      <p className="break-words font-medium text-slate-800 dark:text-slate-100">
        {displayValue}
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="mb-5 border-b border-slate-100 pb-3 text-lg font-bold text-slate-800 dark:border-slate-700 dark:text-slate-100">
        {title}
      </h2>

      {children}
    </section>
  );
}

// ==================================================
// Attendance Calendar
// ==================================================

function AttendanceCalendar({ records }) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();

  const monthName = selectedMonth.toLocaleDateString("bn-BD", {
    month: "long",
    year: "numeric",
  });

  const recordsByDate = useMemo(() => {
    const map = new Map();

    records.forEach((record) => {
      if (!record.date) return;

      map.set(String(record.date), record);
    });

    return map;
  }, [records]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const firstDay = new Date(year, month, 1).getDay();

  const calendarCells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const monthRecords = records.filter((record) => {
    if (!record.date) return false;

    const [recordYear, recordMonth] = String(record.date)
      .split("-")
      .map(Number);

    return recordYear === year && recordMonth === month + 1;
  });

  const presentCount = monthRecords.filter(
    (record) => getAttendanceStatus(record) === "present",
  ).length;

  const absentCount = monthRecords.filter(
    (record) => getAttendanceStatus(record) === "absent",
  ).length;

  const total = presentCount + absentCount;

  const percentage = total ? Math.round((presentCount / total) * 100) : 0;

  function changeMonth(amount) {
    setSelectedMonth(new Date(year, month + amount, 1));
  }

  function getCellStyle(status) {
    if (status === "present") {
      return "border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300";
    }

    if (status === "absent") {
      return "border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
    }

    return "border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500";
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          ← আগের মাস
        </button>

        <h3 className="text-center text-base font-bold text-slate-800 dark:text-slate-100 sm:text-lg">
          {monthName}
        </h3>

        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          পরের মাস →
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            মোট রেকর্ড
          </p>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">
            {toBangla(total)}
          </p>
        </div>

        <div className="rounded-xl bg-green-50 p-3 text-center dark:bg-green-950">
          <p className="text-xs text-green-700 dark:text-green-300">উপস্থিত</p>
          <p className="mt-1 text-xl font-bold text-green-700 dark:text-green-300">
            {toBangla(presentCount)}
          </p>
        </div>

        <div className="rounded-xl bg-red-50 p-3 text-center dark:bg-red-950">
          <p className="text-xs text-red-700 dark:text-red-300">অনুপস্থিত</p>
          <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">
            {toBangla(absentCount)}
          </p>
        </div>

        <div className="rounded-xl bg-blue-50 p-3 text-center dark:bg-blue-950">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            উপস্থিতির হার
          </p>
          <p className="mt-1 text-xl font-bold text-blue-700 dark:text-blue-300">
            {toBangla(percentage)}%
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-green-500" />
          উপস্থিত
        </span>

        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-red-500" />
          অনুপস্থিত
        </span>

        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-slate-300 dark:bg-slate-600" />
          রেকর্ড নেই
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"].map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm"
          >
            {day}
          </div>
        ))}

        {calendarCells.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} />;
          }

          const dateString = [
            year,
            String(month + 1).padStart(2, "0"),
            String(day).padStart(2, "0"),
          ].join("-");

          const record = recordsByDate.get(dateString);

          const status = getAttendanceStatus(record);

          const dressCode =
            record?.dressCode !== undefined && record?.dressCode !== null
              ? getDressCodeStatus(record.dressCode)
              : null;

          const title = [
            banglaDate(dateString),
            status === "present"
              ? "উপস্থিত"
              : status === "absent"
                ? "অনুপস্থিত"
                : "রেকর্ড নেই",
            dressCode ? `ড্রেসকোড: ${dressCode}` : "",
          ]
            .filter(Boolean)
            .join(" | ");

          return (
            <div
              key={dateString}
              title={title}
              className={`flex min-h-14 flex-col items-center justify-center rounded-lg border p-1 sm:min-h-16 ${getCellStyle(
                status,
              )}`}
            >
              <span className="text-sm font-bold sm:text-base">
                {toBangla(day)}
              </span>

              {status !== "none" && (
                <span className="mt-0.5 text-[10px] font-medium sm:text-xs">
                  {status === "present" ? "উপস্থিত" : "অনুপস্থিত"}
                </span>
              )}

              {dressCode === "পরিহিত" && (
                <span className="mt-0.5 text-[9px] sm:text-[10px]">
                  ড্রেস ✓
                </span>
              )}

              {dressCode === "পরিহিত নয়" && (
                <span className="mt-0.5 text-[9px] sm:text-[10px]">
                  ড্রেস ✕
                </span>
              )}
            </div>
          );
        })}
      </div>

      {monthRecords.length === 0 && (
        <p className="mt-5 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          এই মাসে কোনো উপস্থিতির রেকর্ড পাওয়া যায়নি।
        </p>
      )}
    </div>
  );
}

// ==================================================
// Student Profile
// ==================================================

export default function StudentProfile() {
  const { studentId: routeStudentId } = useParams();

  const studentId = decodeURIComponent(String(routeStudentId ?? ""));

  const [student, setStudent] = useState(null);
  const [department, setDepartment] = useState(null);
  const [classOrBatch, setClassOrBatch] = useState(null);

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [monthStates, setMonthStates] = useState([]);
  const [results, setResults] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      setStudent(null);
      setDepartment(null);
      setClassOrBatch(null);
      setAttendanceRecords([]);
      setMonthStates([]);
      setResults([]);

      try {
        if (!studentId) {
          throw new Error("Student ID পাওয়া যায়নি।");
        }

        // 1. Student information
        // Route parameter is the Firestore document ID.
        const studentRef = doc(db, "students", studentId);

        const studentSnap = await getDoc(studentRef);

        if (!studentSnap.exists()) {
          throw new Error("এই শিক্ষার্থীর তথ্য পাওয়া যায়নি।");
        }

        const studentData = {
          ...studentSnap.data(),
          documentId: studentSnap.id,
        };

        if (!active) return;

        setStudent(studentData);

        // Keep the actual student ID separate from document ID.
        const actualStudentId = String(studentData.studentId ?? "");

        // 2. Department
        const departmentId = normalizeId(studentData.departmentId);

        const isCare = departmentId === "3";

        const departmentsSnap = await getDocs(collection(db, "departments"));

        const departmentData = departmentsSnap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .find(
            (item) =>
              normalizeId(item.id) === departmentId ||
              normalizeId(item.departmentId) === departmentId,
          );

        if (active) {
          setDepartment(departmentData ?? null);
        }

        // 3. Class or batch
        const classId = String(
          isCare ? (studentData.batchId ?? "") : (studentData.classId ?? ""),
        );

        if (classId) {
          const classSnap = await getDoc(doc(db, "classes", classId));

          if (active && classSnap.exists()) {
            setClassOrBatch({
              id: classSnap.id,
              ...classSnap.data(),
            });
          }
        }

        // 4. Attendance
        // Assumes attendance.studentId stores the actual Student ID.
        if (actualStudentId) {
          const attendanceQuery = query(
            collection(db, "attendance"),
            where("studentId", "==", actualStudentId),
          );

          const attendanceSnap = await getDocs(attendanceQuery);

          const records = attendanceSnap.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .sort((a, b) =>
              String(a.date ?? "").localeCompare(String(b.date ?? "")),
            );

          if (active) {
            setAttendanceRecords(records);
          }
        }

        // 5. TopLine Care monthly batch progress
        if (isCare && studentData.batchId) {
          const monthQuery = query(
            collection(db, "batchMonthStates"),
            where("batchId", "==", studentData.batchId),
          );

          const monthSnap = await getDocs(monthQuery);

          if (active) {
            const records = monthSnap.docs
              .map((item) => ({
                id: item.id,
                ...item.data(),
              }))
              .filter(
                (item) =>
                  item.departmentId == null ||
                  normalizeId(item.departmentId) === "3",
              )
              .sort(
                (a, b) =>
                  Number(a.monthNumber ?? 0) - Number(b.monthNumber ?? 0),
              );

            setMonthStates(records);
          }
        }

        // 6. Exam results
        // Results are optional; permission failure should not
        // prevent the rest of the profile from rendering.
        if (actualStudentId) {
          try {
            const resultsQuery = query(
              collection(db, "results"),
              where("studentId", "==", actualStudentId),
            );

            const resultsSnap = await getDocs(resultsQuery);

            if (active) {
              setResults(
                resultsSnap.docs.map((item) => ({
                  id: item.id,
                  ...item.data(),
                })),
              );
            }
          } catch (resultError) {
            console.warn("Results could not be loaded:", resultError);

            if (active) {
              setResults([]);
            }
          }
        }
      } catch (err) {
        console.error("Student profile error:", err);

        if (active) {
          setError(
            err?.message ||
              "প্রোফাইল লোড করা যায়নি। Firebase Rules পরীক্ষা করুন।",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [studentId]);

  const departmentId = normalizeId(student?.departmentId);

  const isAcademy = departmentId === "1";
  const isCare = departmentId === "3";

  const status = student ? getStatus(student) : null;

  // Attendance summary
  const attendanceSummary = useMemo(() => {
    const present = attendanceRecords.filter(
      (record) => getAttendanceStatus(record) === "present",
    ).length;

    const absent = attendanceRecords.filter(
      (record) => getAttendanceStatus(record) === "absent",
    ).length;

    const total = present + absent;

    return {
      total,
      present,
      absent,
      percentage: total ? Math.round((present / total) * 100) : 0,
    };
  }, [attendanceRecords]);

  // Academy dress code summary
  const dressCodeSummary = useMemo(() => {
    const records = attendanceRecords.filter(
      (record) => record.dressCode !== undefined && record.dressCode !== null,
    );

    const worn = records.filter(
      (record) => getDressCodeStatus(record.dressCode) === "পরিহিত",
    ).length;

    const notWorn = records.filter(
      (record) => getDressCodeStatus(record.dressCode) === "পরিহিত নয়",
    ).length;

    return {
      total: records.length,
      worn,
      notWorn,
    };
  }, [attendanceRecords]);

  // Loading state
  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#E74C3C] dark:border-slate-700" />

          <p className="text-slate-600 dark:text-slate-300">
            শিক্ষার্থীর প্রোফাইল লোড হচ্ছে...
          </p>
        </div>
      </main>
    );
  }

  // Error or missing student
  if (error || !student) {
    return (
      <main className="mx-auto min-h-[60vh] max-w-xl bg-slate-50 px-4 py-16 dark:bg-slate-950">
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-900 dark:bg-slate-900">
          <h1 className="mb-3 text-xl font-bold text-red-600">
            প্রোফাইল পাওয়া যায়নি
          </h1>

          <p className="break-words text-slate-600 dark:text-slate-300">
            {error || "শিক্ষার্থীর তথ্য পাওয়া যায়নি।"}
          </p>

          <Link
            to="/"
            className="mt-6 inline-block rounded-lg bg-[#2C3E50] px-5 py-2.5 font-medium text-white hover:bg-[#1f2d3a]"
          >
            হোমে ফিরে যান
          </Link>
        </div>
      </main>
    );
  }

  const studentName = getStudentName(student);

  const firstCharacter = String(studentName).trim().charAt(0) || "শ";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Profile Header */}
        <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white shadow-md">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl font-bold">
                {firstCharacter}
              </div>

              <div className="min-w-0 flex-1">
                <p className="mb-1 text-sm text-slate-300">TOPLINE EDUCATION</p>

                <h1 className="break-words text-2xl font-bold sm:text-3xl">
                  {studentName}
                </h1>

                <p className="mt-2 text-slate-300">
                  Student ID: {toBangla(student.studentId)}
                </p>
              </div>

              <span
                className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${status.className}`}
              >
                {status.label}
              </span>
            </div>
          </div>
        </header>

        {/* Personal Information */}
        <Section title="ব্যক্তিগত তথ্য">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="পূর্ণ নাম" value={studentName} />

            <InfoItem label="Student ID" value={toBangla(student.studentId)} />

            <InfoItem label="মোবাইল নম্বর" value={toBangla(student.phone)} />

            <InfoItem
              label="লিঙ্গ"
              value={
                student.gender === "male"
                  ? "ছেলে"
                  : student.gender === "female"
                    ? "মেয়ে"
                    : student.gender
              }
            />

            <InfoItem label="গ্রাম" value={student.villageName} />

            <InfoItem
              label="ভর্তি তারিখ"
              value={banglaDate(student.createdAt)}
            />
          </div>
        </Section>
        {String(student?.departmentId) === "3" && (
          <div className="mt-6">
            <MonthlyProgress student={student} />
          </div>
        )}

        {/* Academic Information */}
        <Section title="শিক্ষাগত তথ্য">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem
              label="বিভাগ"
              value={student.departmentName || department?.name}
            />

            <InfoItem
              label={isCare ? "ব্যাচ" : "শ্রেণি"}
              value={
                isCare
                  ? student.batchName ||
                    classOrBatch?.className ||
                    classOrBatch?.name
                  : student.className ||
                    classOrBatch?.className ||
                    classOrBatch?.name
              }
            />

            <InfoItem label="ভর্তি অবস্থা" value={status.label} />
          </div>
        </Section>

        {/* Academy Dress Code */}
        {isAcademy && (
          <Section title="স্কুল ড্রেসকোড">
            <div className="grid gap-4 sm:grid-cols-3">
              <InfoItem
                label="ড্রেসকোড রেকর্ড"
                value={toBangla(dressCodeSummary.total)}
              />

              <InfoItem
                label="ড্রেস পরিহিত"
                value={toBangla(dressCodeSummary.worn)}
              />

              <InfoItem
                label="ড্রেস পরিহিত নয়"
                value={toBangla(dressCodeSummary.notWorn)}
              />
            </div>

            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              ড্রেসকোডের হিসাব উপস্থিতির রেকর্ডে সংরক্ষিত{" "}
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                dressCode
              </code>{" "}
              ফিল্ড থেকে দেখানো হচ্ছে।
            </p>
          </Section>
        )}

        {/* Attendance Calendar */}
        <Section title="উপস্থিতি ক্যালেন্ডার">
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem
              label="মোট ক্লাসের রেকর্ড"
              value={toBangla(attendanceSummary.total)}
            />

            <InfoItem
              label="উপস্থিত"
              value={toBangla(attendanceSummary.present)}
            />

            <InfoItem
              label="অনুপস্থিত"
              value={toBangla(attendanceSummary.absent)}
            />

            <InfoItem
              label="উপস্থিতির হার"
              value={`${toBangla(attendanceSummary.percentage)}%`}
            />
          </div>

          <AttendanceCalendar records={attendanceRecords} />
        </Section>

        {/* Exam Results */}
        <Section title="পরীক্ষার ফলাফল">
          {results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <th className="px-4 py-3 font-semibold">পরীক্ষা</th>

                    <th className="px-4 py-3 font-semibold">বিষয়</th>

                    <th className="px-4 py-3 font-semibold">প্রাপ্ত নম্বর</th>

                    <th className="px-4 py-3 font-semibold">পূর্ণমান</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((result) => (
                    <tr
                      key={result.id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="px-4 py-3">{result.examName || "—"}</td>

                      <td className="px-4 py-3">
                        {result.subjectName || result.subject || "—"}
                      </td>

                      <td className="px-4 py-3 font-semibold">
                        {result.marks ?? "—"}
                      </td>

                      <td className="px-4 py-3">{result.totalMarks ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              এখনো পরীক্ষার ফলাফল প্রকাশ করা হয়নি।
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}
