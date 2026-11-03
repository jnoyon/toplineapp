// src/pages/MonthlyReport.jsx

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import toast from "react-hot-toast";

import { db } from "../assets/firebase/firebase.init";
import { departmentList } from "../config/departments";

/* =========================================================
   Constants & helpers
========================================================= */

const ALL_STUDENTS = "__all__";

const MONTH_NAMES = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const WEEK_DAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

const normalize = (value) => String(value ?? "").trim();

const pad = (value) => String(value).padStart(2, "0");

function toBangla(value) {
  const digits = "০১২৩৪৫৬৭৮৯";

  return String(value ?? "").replace(/\d/g, (digit) => digits[Number(digit)]);
}

/**
 * Firestore Timestamp, Date, "YYYY-MM-DD" অথবা অন্য date string থেকে Date।
 */
function toDate(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") return value.toDate();

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);

  if (!date) return "—";

  return toBangla(
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
  );
}

// প্রথম বৈধ সংখ্যা ফেরত দেয়
function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;

    const number = Number(value);

    if (Number.isFinite(number)) return number;
  }

  return null;
}

// দশমিকের পর সর্বোচ্চ ২ ঘর, বাংলা অঙ্কে
function formatNumber(value) {
  if (value === null || value === undefined) return "—";

  return toBangla(Math.round(value * 100) / 100);
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";

  return `${toBangla(value.toFixed(1))}%`;
}

function getMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startKey: `${year}-${pad(month)}-01`,
    endKey: `${year}-${pad(month)}-${pad(lastDay)}`,
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
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

function getExamClassIds(exam) {
  return [
    ...(Array.isArray(exam.selectedClasses) ? exam.selectedClasses : []),
    ...(Array.isArray(exam.classes) ? exam.classes : []),
    ...(Array.isArray(exam.selectedClassIds) ? exam.selectedClassIds : []),
  ]
    .map((item) =>
      item && typeof item === "object"
        ? normalize(item.id ?? item.classId ?? item.batchId ?? item.value)
        : normalize(item),
    )
    .filter(Boolean);
}

/* =========================================================
   Exam statistics
========================================================= */

function makeExamBlock({ id, title, date, total, entries, roster }) {
  const values = [...entries.values()];
  const participants = values.length;

  const highest = participants ? Math.max(...values) : null;

  const average = participants
    ? values.reduce((sum, value) => sum + value, 0) / participants
    : null;

  const nameByDoc = new Map(
    roster.map((student) => [student.docId, student.name || "নাম নেই"]),
  );

  const toppers =
    highest === null
      ? []
      : [...entries]
          .filter(([, value]) => value === highest)
          .map(([key]) => nameByDoc.get(key) || "—");

  return {
    id,
    title,
    date,
    total,
    entries,
    values,
    participants,
    highest,
    average,
    toppers,
  };
}

/**
 * নির্বাচিত বিভাগ, শ্রেণি/ব্যাচ ও মাসের জন্য উপস্থিতি এবং
 * অনলাইন ও অফলাইন পরীক্ষার সব তথ্য একবারে লোড করে।
 * (ক্লাসের গড়, সর্বোচ্চ নম্বর ও অবস্থান হিসাবের জন্য পুরো ক্লাসের তথ্য লাগে।)
 */
async function loadMonthData({ departmentId, classId, year, month, roster }) {
  const warnings = [];
  const { startKey, endKey, start, end } = getMonthRange(year, month);

  const byDoc = new Map();
  const byStudentId = new Map();

  roster.forEach((student) => {
    byDoc.set(normalize(student.docId), student);

    if (student.studentId) {
      byStudentId.set(normalize(student.studentId), student);
    }
  });

  const findStudent = (record) =>
    byDoc.get(normalize(record.studentDocId ?? record.studentDocumentId)) ||
    byStudentId.get(normalize(record.studentId)) ||
    byStudentId.get(normalize(record.studentUid)) ||
    null;

  /* ---------- Attendance ---------- */

  const attendanceByStudent = new Map();
  const classDaySet = new Set();

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "attendance"),
        where("date", ">=", startKey),
        where("date", "<=", endKey),
      ),
    );

    snapshot.docs.forEach((item) => {
      const record = item.data();
      const student = findStudent(record);

      if (!student) return;

      const status = getAttendanceStatus(record);

      if (status === "none") return;

      const date = String(record.date).slice(0, 10);

      classDaySet.add(date);

      const statusMap = attendanceByStudent.get(student.docId) || new Map();

      // একই দিনে একাধিক রেকর্ড থাকলে "উপস্থিত" অগ্রাধিকার পায়
      if (statusMap.get(date) !== "present") {
        statusMap.set(date, status);
      }

      attendanceByStudent.set(student.docId, statusMap);
    });
  } catch (error) {
    console.error("Attendance load error:", error);
    warnings.push("উপস্থিতির তথ্য লোড করা যায়নি।");
  }

  const classDays = [...classDaySet].sort();

  /* ---------- Online exams ---------- */

  const online = [];

  try {
    const snapshot = await getDocs(collection(db, "onlineExams"));

    const exams = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((exam) => {
        if (normalize(exam.departmentId) !== normalize(departmentId)) {
          return false;
        }

        const examClassIds = getExamClassIds(exam);

        if (
          examClassIds.length > 0 &&
          !examClassIds.includes(normalize(classId))
        ) {
          return false;
        }

        const date =
          toDate(exam.startTime) ||
          toDate(exam.finishTime) ||
          toDate(exam.createdAt);

        return Boolean(date && date >= start && date < end);
      })
      .sort(
        (a, b) =>
          (toDate(a.startTime)?.getTime() ?? 0) -
          (toDate(b.startTime)?.getTime() ?? 0),
      );

    const resultSnapshots = await Promise.all(
      exams.map((exam) =>
        getDocs(
          query(collection(db, "examResults"), where("examId", "==", exam.id)),
        ),
      ),
    );

    exams.forEach((exam, index) => {
      const entries = new Map();

      let total = firstNumber(exam.fullMarks);

      resultSnapshots[index].docs.forEach((item) => {
        const result = item.data();
        const student = findStudent(result);

        if (!student) return;

        const obtained = firstNumber(result.marks, result.correctAnswers);

        if (obtained === null) return;

        entries.set(student.docId, obtained);

        if (total === null) {
          total = firstNumber(result.totalMarks, result.fullMarks);
        }
      });

      if (total === null) total = firstNumber(exam.questionCount);

      online.push(
        makeExamBlock({
          id: exam.id,
          title: exam.title || "অনলাইন পরীক্ষা",
          date: exam.startTime || exam.finishTime || exam.createdAt,
          total,
          entries,
          roster,
        }),
      );
    });
  } catch (error) {
    console.error("Online results load error:", error);
    warnings.push("অনলাইন পরীক্ষার ফলাফল লোড করা যায়নি।");
  }

  /* ---------- Offline (manual entry) exams ---------- */

  const offline = [];

  try {
    const snapshot = await getDocs(collection(db, "syllabuses"));

    const exams = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((exam) => {
        if (normalize(exam.departmentId) !== normalize(departmentId)) {
          return false;
        }

        if (normalize(exam.classId ?? exam.batchId) !== normalize(classId)) {
          return false;
        }

        const examDate = normalize(exam.examDate).slice(0, 10);

        return examDate >= startKey && examDate <= endKey;
      })
      .sort((a, b) =>
        normalize(a.examDate).localeCompare(normalize(b.examDate)),
      );

    const markSnapshots = await Promise.all(
      exams.map((exam) =>
        getDocs(
          query(collection(db, "examMarks"), where("examId", "==", exam.id)),
        ),
      ),
    );

    exams.forEach((exam, index) => {
      const entries = new Map();

      let total = firstNumber(exam.totalMark);

      markSnapshots[index].docs.forEach((item) => {
        const mark = item.data();
        const student = findStudent(mark);

        if (!student) return;

        const obtained = firstNumber(mark.obtainedMark, mark.marks);

        if (obtained === null) return;

        entries.set(student.docId, obtained);

        if (total === null) {
          total = firstNumber(mark.totalMark, mark.totalMarks);
        }
      });

      offline.push(
        makeExamBlock({
          id: exam.id,
          title: exam.examType || exam.examName || "পরীক্ষা",
          date: exam.examDate,
          total,
          entries,
          roster,
        }),
      );
    });
  } catch (error) {
    console.error("Offline marks load error:", error);
    warnings.push("অফলাইন পরীক্ষার নম্বর লোড করা যায়নি।");
  }

  /* ---------- Month totals (সামগ্রিক অবস্থানের জন্য) ---------- */

  const gradedExams = [...online, ...offline].filter(
    (exam) => exam.total !== null && exam.total > 0,
  );

  const totalFull = gradedExams.reduce((sum, exam) => sum + exam.total, 0);

  // যে পরীক্ষা দেয়নি, তার নম্বর ০ ধরা হয়
  const totalsByStudent = new Map(
    roster.map((student) => [
      student.docId,
      gradedExams.reduce(
        (sum, exam) => sum + (exam.entries.get(student.docId) ?? 0),
        0,
      ),
    ]),
  );

  return {
    data: {
      attendance: { byStudent: attendanceByStudent, classDays },
      online,
      offline,
      totalFull,
      totalsByStudent,
    },
    warnings,
  };
}

/**
 * একজন শিক্ষার্থীর রিপোর্টের সব সংখ্যা হিসাব করে।
 */
function buildStudentReport(student, data) {
  const { classDays } = data.attendance;

  const statusMap = data.attendance.byStudent.get(student.docId) || new Map();

  const totalClass = classDays.length;

  const attended = classDays.filter(
    (day) => statusMap.get(day) === "present",
  ).length;

  const rowFor = (exam) => {
    const obtained = exam.entries.has(student.docId)
      ? exam.entries.get(student.docId)
      : null;

    return {
      ...exam,
      obtained,
      percent:
        obtained !== null && exam.total ? (obtained / exam.total) * 100 : null,
      position:
        obtained !== null
          ? 1 + exam.values.filter((value) => value > obtained).length
          : null,
    };
  };

  const totalObtained = data.totalsByStudent.get(student.docId) ?? 0;

  const allTotals = [...data.totalsByStudent.values()];

  const hasExams = data.totalFull > 0;

  return {
    attendance: {
      classDays,
      statusMap,
      totalClass,
      attended,
      absent: totalClass - attended,
      percent: totalClass ? (attended / totalClass) * 100 : null,
    },
    online: data.online.map(rowFor),
    offline: data.offline.map(rowFor),
    overall: {
      totalFull: data.totalFull,
      totalObtained,
      percent: hasExams ? (totalObtained / data.totalFull) * 100 : null,
      position: hasExams
        ? 1 + allTotals.filter((value) => value > totalObtained).length
        : null,
      studentCount: allTotals.length,
    },
  };
}

/* =========================================================
   Printable report parts
========================================================= */

function AttendanceGrid({ year, month, classDays, statusMap }) {
  const classDaySet = new Set(classDays);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();

  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return (
    <table className="attendance-grid w-full table-fixed border-collapse">
      <thead>
        <tr>
          {WEEK_DAYS.map((day) => (
            <th key={day} className="border border-black bg-gray-200 py-1">
              {day}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {weeks.map((week, weekIndex) => (
          <tr key={weekIndex}>
            {week.map((day, dayIndex) => {
              if (day === null) {
                return (
                  <td
                    key={dayIndex}
                    className="border border-black"
                    style={{ height: "9mm" }}
                  />
                );
              }

              const dateKey = `${year}-${pad(month)}-${pad(day)}`;
              const isClassDay = classDaySet.has(dateKey);
              const isPresent = statusMap.get(dateKey) === "present";

              return (
                <td
                  key={dayIndex}
                  className={`border border-black p-0 align-top ${
                    isClassDay && !isPresent ? "bg-gray-200" : ""
                  }`}
                  style={{ height: "9mm" }}
                >
                  <div
                    className="px-1 leading-none"
                    style={{ fontSize: "7pt", paddingTop: "1mm" }}
                  >
                    {toBangla(day)}
                  </div>

                  <div
                    className="text-center font-bold leading-none"
                    style={{ fontSize: "10pt", marginTop: "0.5mm" }}
                  >
                    {isClassDay ? (isPresent ? "উ" : "অ") : ""}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultsTable({ title, rows, emptyText }) {
  const totalFull = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
  const totalObtained = rows.reduce((sum, row) => sum + (row.obtained ?? 0), 0);

  return (
    <section className="report-section mt-4">
      <h3 className="mb-1 font-bold">{title}</h3>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-200">
            {[
              "পরীক্ষার নাম",
              "তারিখ",
              "পূর্ণমান",
              "প্রাপ্ত নম্বর",
              "শতকরা",
              "শ্রেণির গড়",
              "সর্বোচ্চ নম্বর",
              "সর্বোচ্চ প্রাপক",
              "অবস্থান",
            ].map((heading) => (
              <th
                key={heading}
                className="border border-black px-1 py-1 text-center"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="border border-black p-2 text-center">
                {emptyText}
              </td>
            </tr>
          ) : (
            <>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-black px-1 py-1 font-semibold">
                    {row.title}
                  </td>

                  <td className="whitespace-nowrap border border-black px-1 py-1 text-center">
                    {formatDate(row.date)}
                  </td>

                  <td className="border border-black px-1 py-1 text-center">
                    {formatNumber(row.total)}
                  </td>

                  <td className="border border-black px-1 py-1 text-center font-bold">
                    {row.obtained === null
                      ? "অংশগ্রহণ করেনি"
                      : formatNumber(row.obtained)}
                  </td>

                  <td className="border border-black px-1 py-1 text-center">
                    {formatPercent(row.percent)}
                  </td>

                  <td className="border border-black px-1 py-1 text-center">
                    {formatNumber(row.average)}
                  </td>

                  <td className="border border-black px-1 py-1 text-center">
                    {formatNumber(row.highest)}
                  </td>

                  <td className="border border-black px-1 py-1">
                    {row.toppers.length ? row.toppers.join(", ") : "—"}
                  </td>

                  <td className="whitespace-nowrap border border-black px-1 py-1 text-center">
                    {row.position === null
                      ? "—"
                      : `${toBangla(row.position)} / ${toBangla(
                          row.participants,
                        )}`}
                  </td>
                </tr>
              ))}

              <tr className="bg-gray-100 font-bold">
                <td
                  colSpan={2}
                  className="border border-black px-1 py-1 text-center"
                >
                  মোট
                </td>

                <td className="border border-black px-1 py-1 text-center">
                  {formatNumber(totalFull)}
                </td>

                <td className="border border-black px-1 py-1 text-center">
                  {formatNumber(totalObtained)}
                </td>

                <td className="border border-black px-1 py-1 text-center">
                  {formatPercent(
                    totalFull > 0 ? (totalObtained / totalFull) * 100 : null,
                  )}
                </td>

                <td colSpan={4} className="border border-black" />
              </tr>
            </>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ReportSheet({
  student,
  report,
  department,
  isCare,
  year,
  month,
  printedOn,
}) {
  const monthLabel = `${MONTH_NAMES[month - 1]} ${toBangla(year)}`;

  const { attendance, overall } = report;

  return (
    <article className="report-page bg-white text-black">
      <header className="mb-3 border-b-2 border-black pb-2 text-center">
        <h2 className="text-xl font-bold">টপলাইন</h2>

        <p>{department?.name}</p>

        <h3 className="mt-1 text-base font-bold">
          মাসিক শিক্ষার্থী রিপোর্ট — {monthLabel}
        </h3>
      </header>

      <section className="report-section grid grid-cols-2 gap-x-6 gap-y-1">
        <p>
          <b>নাম:</b> {student.name}
        </p>

        <p>
          <b>স্টুডেন্ট আইডি:</b> {toBangla(student.studentId)}
        </p>

        <p>
          <b>{isCare ? "ব্যাচ" : "শ্রেণি"}:</b>{" "}
          {isCare ? student.batchName : student.className}
        </p>

        <p>
          <b>বর্তমান পয়েন্ট:</b> {toBangla(student.currentMark ?? 0)}
        </p>
      </section>

      {/* Attendance */}
      <section className="report-section mt-4">
        <h3 className="mb-1 font-bold">উপস্থিতি</h3>

        <table className="mb-2 w-full table-fixed border-collapse">
          <tbody>
            <tr>
              {[
                ["মোট ক্লাস", toBangla(attendance.totalClass)],
                ["উপস্থিত", toBangla(attendance.attended)],
                ["অনুপস্থিত", toBangla(attendance.absent)],
                ["উপস্থিতির হার", formatPercent(attendance.percent)],
              ].map(([label, value]) => (
                <td
                  key={label}
                  className="border border-black px-1 py-1 text-center"
                >
                  <div style={{ fontSize: "8pt" }}>{label}</div>
                  <div className="text-base font-bold">{value}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {attendance.totalClass === 0 ? (
          <p className="border border-black p-2 text-center">
            এই মাসে কোনো উপস্থিতির রেকর্ড নেই।
          </p>
        ) : (
          <>
            <AttendanceGrid
              year={year}
              month={month}
              classDays={attendance.classDays}
              statusMap={attendance.statusMap}
            />

            <p className="mt-1" style={{ fontSize: "8pt" }}>
              উ = উপস্থিত &nbsp;|&nbsp; অ = অনুপস্থিত (ছায়াযুক্ত ঘর)
              &nbsp;|&nbsp; ফাঁকা ঘর = ক্লাস হয়নি
            </p>
          </>
        )}
      </section>

      {/* Exam results */}
      <ResultsTable
        title="অনলাইন পরীক্ষার ফলাফল"
        rows={report.online}
        emptyText="এই মাসে কোনো অনলাইন পরীক্ষা নেই।"
      />

      <ResultsTable
        title="অফলাইন পরীক্ষার ফলাফল"
        rows={report.offline}
        emptyText="এই মাসে কোনো অফলাইন পরীক্ষার নম্বর নেই।"
      />

      {/* Overall */}
      <section className="report-section mt-4">
        <h3 className="mb-1 font-bold">মাসের সামগ্রিক ফলাফল</h3>

        <table className="w-full table-fixed border-collapse">
          <tbody>
            <tr>
              {[
                ["মোট পূর্ণমান", formatNumber(overall.totalFull)],
                ["মোট প্রাপ্ত নম্বর", formatNumber(overall.totalObtained)],
                ["গড় শতকরা", formatPercent(overall.percent)],
                [
                  "শ্রেণিতে অবস্থান",
                  overall.position === null
                    ? "—"
                    : `${toBangla(overall.position)} / ${toBangla(
                        overall.studentCount,
                      )}`,
                ],
              ].map(([label, value]) => (
                <td
                  key={label}
                  className="border border-black px-1 py-1 text-center"
                >
                  <div style={{ fontSize: "8pt" }}>{label}</div>
                  <div className="text-base font-bold">{value}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <p className="mt-1" style={{ fontSize: "8pt" }}>
          * শ্রেণির গড় ও সর্বোচ্চ নম্বর শুধু যারা পরীক্ষা দিয়েছে তাদের নম্বর
          থেকে হিসাব করা হয়েছে। সামগ্রিক ফলাফলে যে পরীক্ষা দেওয়া হয়নি তার
          নম্বর ০ ধরা হয়েছে।
        </p>
      </section>

      <footer className="report-section mt-16 flex items-end justify-between">
        <div
          className="border-t border-black pt-1 text-center"
          style={{ width: "45mm" }}
        >
          অভিভাবকের স্বাক্ষর
        </div>

        <p style={{ fontSize: "8pt" }}>প্রিন্টের তারিখ: {printedOn}</p>

        <div
          className="border-t border-black pt-1 text-center"
          style={{ width: "45mm" }}
        >
          কর্তৃপক্ষ
          <br />
          {department?.name}
        </div>
      </footer>
    </article>
  );
}

/* =========================================================
   Page
========================================================= */

export default function MonthlyReport() {
  const today = new Date();

  const [departmentId, setDepartmentId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [students, setStudents] = useState([]);
  const [data, setData] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const [studentsLoading, setStudentsLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  const department = departmentList.find(
    (item) => Number(item.id) === Number(departmentId),
  );

  const isCare = department?.type === "batch";

  const classes = department?.classes || [];

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();

    return Array.from({ length: 5 }, (_, index) => current - 3 + index);
  }, []);

  /* ---------- Students of the selected department ---------- */

  useEffect(() => {
    if (!departmentId) {
      setStudents([]);
      return;
    }

    let active = true;

    const loadStudents = async () => {
      setStudentsLoading(true);

      try {
        const snapshot = await getDocs(collection(db, "students"));

        const filtered = snapshot.docs
          .map((item) => ({ ...item.data(), docId: item.id }))
          .filter(
            (student) =>
              student.approved !== false &&
              student.isActive !== false &&
              Number(student.departmentId) === Number(departmentId),
          );

        if (active) setStudents(filtered);
      } catch (error) {
        console.error(error);
        toast.error("শিক্ষার্থীদের তথ্য লোড করা যায়নি");
      } finally {
        if (active) setStudentsLoading(false);
      }
    };

    loadStudents();

    return () => {
      active = false;
    };
  }, [departmentId]);

  /* ---------- Students of the selected class / batch ---------- */

  const classStudents = useMemo(() => {
    if (!classId) return [];

    return students
      .filter(
        (student) =>
          normalize(
            isCare
              ? student.batchId || student.classId
              : student.classId || student.batchId,
          ) === normalize(classId),
      )
      .sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? ""), "bn"),
      );
  }, [students, classId, isCare]);

  const selectedStudents = useMemo(() => {
    if (!studentId) return [];

    if (studentId === ALL_STUDENTS) return classStudents;

    return classStudents.filter(
      (student) => normalize(student.studentId) === normalize(studentId),
    );
  }, [classStudents, studentId]);

  /* ---------- Month data (attendance + exams of the whole class) ---------- */

  useEffect(() => {
    if (!departmentId || !classId || classStudents.length === 0) {
      setData(null);
      setWarnings([]);
      return undefined;
    }

    let active = true;

    const run = async () => {
      setDataLoading(true);

      try {
        const result = await loadMonthData({
          departmentId,
          classId,
          year,
          month,
          roster: classStudents,
        });

        if (!active) return;

        setData(result.data);
        setWarnings(result.warnings);
      } catch (error) {
        console.error("Monthly report load error:", error);

        if (active) {
          setData(null);
          toast.error("রিপোর্টের তথ্য লোড করা যায়নি");
        }
      } finally {
        if (active) setDataLoading(false);
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [departmentId, classId, year, month, classStudents]);

  /* ---------- Reports ---------- */

  const reports = useMemo(() => {
    if (!data) return [];

    return selectedStudents.map((student) => ({
      student,
      report: buildStudentReport(student, data),
    }));
  }, [data, selectedStudents]);

  const printedOn = useMemo(() => formatDate(new Date()), []);

  const handleDepartmentChange = (value) => {
    setDepartmentId(value);
    setClassId("");
    setStudentId("");
    setData(null);
  };

  const handleClassChange = (value) => {
    setClassId(value);
    setStudentId("");
    setData(null);
  };

  const handlePrint = () => {
    if (!reports.length) {
      toast.error("প্রথমে শিক্ষার্থী নির্বাচন করুন");
      return;
    }

    window.print();
  };

  const monthLabel = `${MONTH_NAMES[month - 1]} ${toBangla(year)}`;

  const sheetProps = {
    department,
    isCare,
    year,
    month,
    printedOn,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <h1 className="text-2xl font-bold">মাসিক শিক্ষার্থী রিপোর্ট</h1>

      {/* Controls */}
      <div className="grid gap-4 rounded-xl border bg-base-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="form-control">
          <span className="label-text mb-2">ডিপার্টমেন্ট</span>

          <select
            className="select select-bordered"
            value={departmentId}
            onChange={(event) => handleDepartmentChange(event.target.value)}
          >
            <option value="">নির্বাচন করুন</option>

            {departmentList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-2">{isCare ? "ব্যাচ" : "শ্রেণি"}</span>

          <select
            className="select select-bordered"
            value={classId}
            disabled={!departmentId}
            onChange={(event) => handleClassChange(event.target.value)}
          >
            <option value="">নির্বাচন করুন</option>

            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-2">মাস</span>

            <select
              className="select select-bordered"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control">
            <span className="label-text mb-2">বছর</span>

            <select
              className="select select-bordered"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  {toBangla(item)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-control sm:col-span-2">
          <span className="label-text mb-2">শিক্ষার্থী</span>

          <select
            className="select select-bordered"
            value={studentId}
            disabled={!classId || studentsLoading}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">
              {studentsLoading ? "লোড হচ্ছে..." : "শিক্ষার্থী নির্বাচন করুন"}
            </option>

            {classStudents.length > 0 && (
              <option value={ALL_STUDENTS}>
                সব শিক্ষার্থী ({toBangla(classStudents.length)} জন)
              </option>
            )}

            {classStudents.map((student) => (
              <option key={student.docId} value={student.studentId}>
                {student.name} ({student.studentId})
              </option>
            ))}
          </select>

          {classId && !studentsLoading && classStudents.length === 0 && (
            <span className="mt-1 text-sm text-error">
              এই শ্রেণি/ব্যাচে অনুমোদিত শিক্ষার্থী পাওয়া যায়নি।
            </span>
          )}
        </label>

        <button
          type="button"
          className="btn btn-primary self-end"
          disabled={!reports.length || dataLoading}
          onClick={handlePrint}
        >
          {dataLoading ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              তথ্য লোড হচ্ছে...
            </>
          ) : studentId === ALL_STUDENTS ? (
            `${toBangla(reports.length)} জনের রিপোর্ট প্রিন্ট করুন`
          ) : (
            "রিপোর্ট প্রিন্ট করুন"
          )}
        </button>
      </div>

      {warnings.map((message) => (
        <div key={message} className="alert alert-warning text-sm">
          <span>
            {message} Firestore Rules যাচাই করুন; এই অংশ রিপোর্টে খালি দেখাতে
            পারে।
          </span>
        </div>
      ))}

      {/* Preview */}
      {reports.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-base-content/70">
            <p>
              প্রিভিউ: <b>{reports[0].student.name}</b> — {monthLabel}
            </p>

            {reports.length > 1 && (
              <p>
                প্রিন্টে মোট {toBangla(reports.length)}টি আলাদা পৃষ্ঠা তৈরি হবে
                (নিচে প্রথম শিক্ষার্থীর প্রিভিউ)।
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-base-300 bg-gray-100 p-3">
            <div className="mx-auto" style={{ maxWidth: "210mm" }}>
              <ReportSheet
                student={reports[0].student}
                report={reports[0].report}
                {...sheetProps}
              />
            </div>
          </div>
        </section>
      )}

      {/* Print area: সব রিপোর্ট <body>-তে আলাদা কনটেইনারে বসে, যাতে একাধিক পৃষ্ঠা ঠিকভাবে প্রিন্ট হয় */}
      {reports.length > 0 &&
        createPortal(
          <div id="monthly-report-print">
            {reports.map(({ student, report }) => (
              <ReportSheet
                key={student.docId}
                student={student}
                report={report}
                {...sheetProps}
              />
            ))}
          </div>,
          document.body,
        )}

      <style>{`
        .report-page {
          box-sizing: border-box;
          width: 100%;
          padding: 10mm;
          font-size: 10pt;
          line-height: 1.4;
          background: #fff;
          color: #000;
        }

        .report-page table { font-size: 9pt; }

        .report-page th { font-weight: 700; }

        #monthly-report-print { display: none; }

        @media print {
          @page { size: A4 portrait; margin: 12mm; }

          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* অ্যাপের বাকি সব কিছু লুকিয়ে শুধু রিপোর্ট দেখাবে */
          body > *:not(#monthly-report-print) { display: none !important; }

          #monthly-report-print { display: block !important; }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .report-page {
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }

          .report-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          .report-page thead { display: table-header-group; }

          .report-page tr,
          .report-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
