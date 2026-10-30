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

import {
  FiUser,
  FiPhone,
  FiMapPin,
  FiCalendar,
  FiShield,
  FiCheckCircle,
  FiXCircle,
  FiBookOpen,
  FiAward,
  FiClock,
  FiUsers,
} from "react-icons/fi";

import { db } from "../firebase/firebase.init";
import MonthlyProgress from "./MonthlyProgress";

// ==================================================
// Helpers
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

  return toBangla(
    `${String(date.getDate()).padStart(2, "0")}/${String(
      date.getMonth() + 1,
    ).padStart(2, "0")}/${date.getFullYear()}`,
  );
}

function normalizeId(value) {
  return String(value ?? "").replace(/^0+/, "") || "0";
}

function getStudentName(student) {
  return (
    student?.name || student?.studentName || student?.fullName || "শিক্ষার্থী"
  );
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

function getStatus(student) {
  if (student?.approved === true || student?.status === "approved") {
    return {
      label: "অনুমোদিত",
      icon: FiCheckCircle,
      className: "bg-green-500/10 text-green-600",
    };
  }

  if (student?.status === "rejected") {
    return {
      label: "অননুমোদিত",
      icon: FiXCircle,
      className: "bg-red-500/10 text-red-600",
    };
  }

  return {
    label: "অনুমোদনের অপেক্ষায়",
    icon: FiClock,
    className: "bg-amber-500/10 text-amber-600",
  };
}

// ==================================================
// Reusable Components
// ==================================================

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-3 shadow-sm sm:p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold sm:text-base">
        {Icon && <Icon className="text-primary" size={17} />}
        {title}
      </h2>

      {children}
    </section>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg bg-base-200/60 p-3">
      {Icon && (
        <Icon size={16} className="mt-0.5 shrink-0 text-base-content/50" />
      )}

      <div className="min-w-0">
        <p className="text-[11px] text-base-content/50 sm:text-xs">{label}</p>

        <p className="mt-0.5 break-words text-sm font-semibold">
          {value || "তথ্য নেই"}
        </p>
      </div>
    </div>
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

  const monthRecords = records.filter((record) => {
    if (!record.date) return false;

    const [recordYear, recordMonth] = String(record.date)
      .split("-")
      .map(Number);

    return recordYear === year && recordMonth === month + 1;
  });

  const present = monthRecords.filter(
    (record) => getAttendanceStatus(record) === "present",
  ).length;

  const absent = monthRecords.filter(
    (record) => getAttendanceStatus(record) === "absent",
  ).length;

  const total = present + absent;

  const percentage = total ? Math.round((present / total) * 100) : 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const changeMonth = (amount) => {
    setSelectedMonth(new Date(year, month + amount, 1));
  };

  return (
    <div>
      {/* Month Navigation */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="btn btn-sm btn-ghost"
        >
          ← আগের
        </button>

        <h3 className="text-sm font-bold sm:text-base">{monthName}</h3>

        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="btn btn-sm btn-ghost"
        >
          পরের →
        </button>
      </div>

      {/* Statistics */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-success/10 p-2.5 text-center">
          <p className="text-[11px] text-success">উপস্থিত</p>
          <p className="text-lg font-extrabold text-success">
            {toBangla(present)}
          </p>
        </div>

        <div className="rounded-lg bg-error/10 p-2.5 text-center">
          <p className="text-[11px] text-error">অনুপস্থিত</p>
          <p className="text-lg font-extrabold text-error">
            {toBangla(absent)}
          </p>
        </div>

        <div className="rounded-lg bg-info/10 p-2.5 text-center">
          <p className="text-[11px] text-info">উপস্থিতির হার</p>
          <p className="text-lg font-extrabold text-info">
            {toBangla(percentage)}%
          </p>
        </div>
      </div>

      <progress
        className="progress progress-success mb-4 w-full"
        value={percentage}
        max="100"
      />

      {/* Calendar */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"].map((day) => (
          <div
            key={day}
            className="py-1 text-center text-[10px] font-semibold text-base-content/50 sm:text-xs"
          >
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} />;
          }

          const dateString = [
            year,
            String(month + 1).padStart(2, "0"),
            String(day).padStart(2, "0"),
          ].join("-");

          const status = getAttendanceStatus(recordsByDate.get(dateString));

          const color =
            status === "present"
              ? "bg-success/15 text-success border-success/20"
              : status === "absent"
                ? "bg-error/15 text-error border-error/20"
                : "bg-base-200/60 text-base-content/50 border-base-300";

          return (
            <div
              key={dateString}
              title={`${banglaDate(dateString)} - ${
                status === "present"
                  ? "উপস্থিত"
                  : status === "absent"
                    ? "অনুপস্থিত"
                    : "রেকর্ড নেই"
              }`}
              className={`flex min-h-10 flex-col items-center justify-center rounded-md border text-xs font-semibold sm:min-h-12 sm:text-sm ${color}`}
            >
              {toBangla(day)}

              {status !== "none" && (
                <span className="mt-0.5 text-[8px] sm:text-[10px]">
                  {status === "present" ? "উপস্থিত" : "অনুপস্থিত"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-base-content/60 sm:text-xs">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" />
          উপস্থিত
        </span>

        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-error" />
          অনুপস্থিত
        </span>

        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-base-300" />
          রেকর্ড নেই
        </span>
      </div>

      {!monthRecords.length && (
        <p className="mt-3 rounded-lg bg-base-200 p-3 text-center text-xs text-base-content/60">
          এই মাসে কোনো উপস্থিতির রেকর্ড নেই।
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
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [results, setResults] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      setStudent(null);
      setAttendanceRecords([]);
      setResults([]);

      try {
        if (!studentId) {
          throw new Error("Student ID পাওয়া যায়নি।");
        }

        // Student
        const studentSnap = await getDoc(doc(db, "students", studentId));

        if (!studentSnap.exists()) {
          throw new Error("শিক্ষার্থীর তথ্য পাওয়া যায়নি।");
        }

        const studentData = {
          ...studentSnap.data(),
          documentId: studentSnap.id,
        };

        if (!active) return;

        setStudent(studentData);

        const actualStudentId = String(studentData.studentId ?? "");

        // Attendance: support both studentDocId and studentId
        const attendanceQueries = [];

        if (studentSnap.id) {
          attendanceQueries.push(
            getDocs(
              query(
                collection(db, "attendance"),
                where("studentDocId", "==", studentSnap.id),
              ),
            ),
          );
        }

        if (actualStudentId) {
          attendanceQueries.push(
            getDocs(
              query(
                collection(db, "attendance"),
                where("studentId", "==", actualStudentId),
              ),
            ),
          );
        }

        const attendanceSnapshots = await Promise.all(attendanceQueries);

        const attendanceMap = new Map();

        attendanceSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((item) => {
            attendanceMap.set(item.id, {
              id: item.id,
              ...item.data(),
            });
          });
        });

        const attendance = [...attendanceMap.values()].sort((a, b) =>
          String(a.date ?? "").localeCompare(String(b.date ?? "")),
        );

        if (active) {
          setAttendanceRecords(attendance);
        }

        // Results
        if (actualStudentId) {
          try {
            const resultsSnap = await getDocs(
              query(
                collection(db, "results"),
                where("studentId", "==", actualStudentId),
              ),
            );

            if (active) {
              setResults(
                resultsSnap.docs.map((item) => ({
                  id: item.id,
                  ...item.data(),
                })),
              );
            }
          } catch (err) {
            console.warn("Results loading error:", err);
          }
        }
      } catch (err) {
        console.error("Student profile error:", err);

        if (active) {
          setError(err?.message || "প্রোফাইল লোড করা যায়নি।");
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

  const attendanceSummary = useMemo(() => {
    const present = attendanceRecords.filter(
      (record) => getAttendanceStatus(record) === "present",
    ).length;

    const absent = attendanceRecords.filter(
      (record) => getAttendanceStatus(record) === "absent",
    ).length;

    const total = present + absent;

    return {
      present,
      absent,
      total,
      percentage: total ? Math.round((present / total) * 100) : 0,
    };
  }, [attendanceRecords]);

  const dressCodeSummary = useMemo(() => {
    const records = attendanceRecords.filter(
      (record) => record.dressCode !== undefined && record.dressCode !== null,
    );

    const worn = records.filter(
      (record) =>
        record.dressCode === true ||
        ["yes", "true", "পরিহিত", "হ্যাঁ"].includes(
          String(record.dressCode).toLowerCase(),
        ),
    ).length;

    return {
      total: records.length,
      worn,
      notWorn: records.length - worn,
    };
  }, [attendanceRecords]);

  // Loading
  if (loading) {
    return (
      <main className="grid min-h-[60vh] place-items-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </main>
    );
  }

  // Error
  if (error || !student) {
    return (
      <main className="grid min-h-[60vh] place-items-center bg-base-200 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-base-100 p-6 text-center shadow">
          <FiShield className="mx-auto mb-3 text-3xl text-error" />

          <h2 className="font-bold">প্রোফাইল পাওয়া যায়নি</h2>

          <p className="mt-2 text-sm text-base-content/60">
            {error || "শিক্ষার্থীর তথ্য পাওয়া যায়নি।"}
          </p>

          <Link to="/" className="btn btn-primary btn-sm mt-5">
            হোমে ফিরে যান
          </Link>
        </div>
      </main>
    );
  }

  const name = getStudentName(student);

  const StatusIcon = status.icon;

  return (
    <main className="min-h-screen bg-base-200 px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-4xl space-y-3 sm:space-y-4">
        {/* Profile Header */}
        <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#2C3E50] to-[#34495E] p-4 text-white shadow sm:p-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl font-bold sm:h-16 sm:w-16">
              {name.trim().charAt(0) || "শ"}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-wider text-white/60">
                TOPLINE EDUCATION
              </p>

              <h1 className="mt-1 truncate text-lg font-extrabold sm:text-2xl">
                {name}
              </h1>

              <p className="mt-1 text-xs text-white/70">
                ID: {toBangla(student.studentId)}
              </p>
            </div>

            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold sm:text-xs ${status.className}`}
            >
              <StatusIcon size={13} />
              <span className="hidden xs:inline">{status.label}</span>
              <span className="xs:hidden">
                {student.approved === true ? "সক্রিয়" : "অপেক্ষমাণ"}
              </span>
            </span>
          </div>
        </header>

        {/* Personal Information */}
        <Section title="ব্যক্তিগত তথ্য" icon={FiUser}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <InfoItem
              icon={FiPhone}
              label="মোবাইল"
              value={toBangla(student.phone)}
            />

            <InfoItem
              icon={FiUser}
              label="আপনি"
              value={
                student.gender === "male"
                  ? "ছেলে"
                  : student.gender === "female"
                    ? "মেয়ে"
                    : student.gender
              }
            />

            <InfoItem
              icon={FiMapPin}
              label="গ্রাম"
              value={student.villageName}
            />

            <InfoItem
              icon={FiCalendar}
              label="ভর্তির তারিখ"
              value={banglaDate(student.createdAt)}
            />

            <InfoItem
              icon={FiUsers}
              label="বিভাগ"
              value={student.departmentName}
            />

            <InfoItem
              icon={FiBookOpen}
              label={isCare ? "ব্যাচ" : "শ্রেণি"}
              value={isCare ? student.batchName : student.className}
            />
          </div>
        </Section>

        {/* Care Progress */}
        {isCare && (
          <Section title="ব্যাচের অগ্রগতি" icon={FiAward}>
            <MonthlyProgress student={student} />
          </Section>
        )}

        {/* Academy Dress Code */}
        {isAcademy && (
          <Section title="স্কুল ড্রেসকোড" icon={FiShield}>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["মোট", dressCodeSummary.total, "text-base-content"],
                ["পরিহিত", dressCodeSummary.worn, "text-success"],
                ["পরিহিত নয়", dressCodeSummary.notWorn, "text-error"],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  className="rounded-lg bg-base-200 p-3 text-center"
                >
                  <p className="text-[10px] text-base-content/50">{label}</p>

                  <p className={`mt-1 text-xl font-bold ${color}`}>
                    {toBangla(value)}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Attendance */}
        <Section title="উপস্থিতির বিবরণ" icon={FiCalendar}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ["মোট", attendanceSummary.total, "text-base-content"],
              ["উপস্থিত", attendanceSummary.present, "text-success"],
              ["অনুপস্থিত", attendanceSummary.absent, "text-error"],
            ].map(([label, value, color]) => (
              <div
                key={label}
                className="rounded-lg bg-base-200 p-2.5 text-center"
              >
                <p className="text-[10px] text-base-content/50">{label}</p>

                <p className={`text-lg font-extrabold ${color}`}>
                  {toBangla(value)}
                </p>
              </div>
            ))}
          </div>

          <AttendanceCalendar records={attendanceRecords} />
        </Section>

        {/* Results */}
        <Section title="পরীক্ষার ফলাফল" icon={FiAward}>
          {results.length ? (
            <div className="space-y-2">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-base-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {result.examName || "পরীক্ষা"}
                    </p>

                    <p className="mt-1 truncate text-xs text-base-content/60">
                      {result.subjectName || result.subject || "বিষয়"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-lg font-extrabold text-primary">
                      {toBangla(result.marks ?? "—")}
                    </p>

                    <p className="text-[10px] text-base-content/50">
                      পূর্ণমান: {toBangla(result.totalMarks ?? "—")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-base-200 p-4 text-center text-xs text-base-content/60">
              এখনো কোনো পরীক্ষার ফলাফল প্রকাশ করা হয়নি।
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}
