import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../assets/firebase/firebase.init";
import { departments } from "../config/departments";

/* =========================================================
   Constants
========================================================= */

const CARE_DEPARTMENT_ID = normalizeId(departments?.CARE?.id);
const CARE_DEPARTMENT_NAME = departments?.CARE?.name || "";

const COLLECTIONS = {
  students: "students",
  attendance: "attendance",
  offlineExams: "examMarks",
  onlineExams: "examResults",
  careMonths: "batchMonthStates",
};

/* =========================================================
   Basic Helpers
========================================================= */

function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeId(value) {
  const id = String(value ?? "").trim();

  return /^\d+$/.test(id) ? String(Number(id)) : id;
}

function getDepartmentId(record) {
  return normalizeId(record?.departmentId ?? record?.departmentID);
}

function getDepartmentName(record) {
  return String(record?.departmentName ?? record?.department ?? "").trim();
}

function getBatchId(record) {
  return String(record?.batchId || record?.classId || "").trim();
}

function getBatchName(record) {
  return String(
    record?.batchName ??
      record?.className ??
      record?.batch ??
      record?.class ??
      "",
  ).trim();
}

function getStudentIdentifiers(record) {
  return [
    record?.studentDocumentId,
    record?.studentDocId,
    record?.studentId,
    record?.studentID,
    record?.uid,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String);
}

function isSameStudent(record, studentDocumentId, studentId) {
  const identifiers = getStudentIdentifiers(record);

  return (
    identifiers.includes(String(studentDocumentId)) ||
    (studentId && identifiers.includes(String(studentId)))
  );
}

function getNumericMark(...values) {
  const value = values.find(
    (item) => item !== undefined && item !== null && item !== "",
  );

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

/* =========================================================
   Date Helpers
========================================================= */

function toDateString(value) {
  if (!value) return "";

  let date;

  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    return value.slice(0, 10);
  } else if (typeof value === "number") {
    date = new Date(value);
  } else {
    return "";
  }

  if (Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getRecordDate(record, fields) {
  for (const field of fields) {
    const date = toDateString(record?.[field]);

    if (date) return date;
  }

  return "";
}

function isWithinPeriod(date, period) {
  return Boolean(date && date >= period.startDate && date <= period.endDate);
}

function getCurrentMonthPeriod() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const startDate = `${year}-${month}-01`;

  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

  const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

  return {
    startDate,
    endDate,
    periodId: `${year}-${month}`,
  };
}

/* =========================================================
   Department Helpers
========================================================= */

function isCareDepartment(student) {
  const departmentId = getDepartmentId(student);
  const departmentName = normalize(getDepartmentName(student));

  return (
    (CARE_DEPARTMENT_ID && departmentId === CARE_DEPARTMENT_ID) ||
    departmentName === normalize(CARE_DEPARTMENT_NAME) ||
    departmentName.includes("care")
  );
}

function matchesDepartment(record, student) {
  const recordDepartmentId = getDepartmentId(record);
  const studentDepartmentId = getDepartmentId(student);

  if (recordDepartmentId && studentDepartmentId) {
    return recordDepartmentId === studentDepartmentId;
  }

  const recordDepartmentName = normalize(getDepartmentName(record));
  const studentDepartmentName = normalize(getDepartmentName(student));

  if (recordDepartmentName && studentDepartmentName) {
    return recordDepartmentName === studentDepartmentName;
  }

  // Older records may not have department information.
  return true;
}

/* =========================================================
   CARE Batch Period
   CARE marks accumulate from the first batch month
   to the active/latest month.
========================================================= */

/* =========================================================
   CARE Batch Period
   CARE marks accumulate from the first batch month
   to the active/latest month.
========================================================= */

async function getCareBatchPeriod(student, batchMonthSnapshot) {
  const studentBatchId = normalizeId(getBatchId(student));
  const studentBatchName = normalize(getBatchName(student));

  if (!studentBatchId && !studentBatchName) {
    throw new Error("CARE student batch information not found.");
  }

  const matchingMonths = batchMonthSnapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data(),
    }))
    .filter((month) => {
      // Department matching
      const monthDepartmentId = getDepartmentId(month);
      const monthDepartmentName = normalize(getDepartmentName(month));

      if (
        monthDepartmentId &&
        CARE_DEPARTMENT_ID &&
        monthDepartmentId !== CARE_DEPARTMENT_ID
      ) {
        return false;
      }

      if (
        monthDepartmentName &&
        monthDepartmentName !== normalize(CARE_DEPARTMENT_NAME) &&
        !monthDepartmentName.includes("care")
      ) {
        return false;
      }

      // Batch matching
      const monthBatchId = normalizeId(getBatchId(month));
      const monthBatchName = normalize(getBatchName(month));

      const sameBatchId =
        studentBatchId && monthBatchId && studentBatchId === monthBatchId;

      const sameBatchName =
        studentBatchName &&
        monthBatchName &&
        studentBatchName === monthBatchName;

      // Match by ID or fallback to batch name.
      if (sameBatchId || sameBatchName) {
        return true;
      }

      return false;
    })
    .filter((month) => {
      const startDate = toDateString(month.startDate);

      // Active month is valid even when endDate is null.
      const isActive = month.status === "active";

      const hasEndDate =
        toDateString(month.endDate) || toDateString(month.closedDate);

      return Boolean(startDate && (isActive || hasEndDate));
    })
    .sort((a, b) =>
      toDateString(a.startDate).localeCompare(toDateString(b.startDate)),
    );

  if (!matchingMonths.length) {
    throw new Error(
      `CARE batch period not found for ${getBatchName(student)}.`,
    );
  }

  // First month determines the cumulative starting date.
  const firstMonth = matchingMonths[0];

  // Prefer active month; otherwise use latest closed month.
  const activeMonth = matchingMonths.find((month) => month.status === "active");

  const latestMonth = matchingMonths[matchingMonths.length - 1];

  const selectedMonth = activeMonth || latestMonth;

  const startDate = toDateString(firstMonth.startDate);

  // Active month: calculate up to today.
  // Closed month: calculate up to its saved closing date.
  const endDate =
    selectedMonth.status === "active"
      ? toDateString(new Date())
      : toDateString(selectedMonth.closedDate || selectedMonth.endDate);

  if (!startDate || !endDate) {
    throw new Error("Invalid CARE batch date range.");
  }

  return {
    startDate,
    endDate,

    periodId: `care:${studentBatchId || studentBatchName}`,

    batchId: getBatchId(student),
    batchName: getBatchName(student),

    monthNumber: Number(selectedMonth.monthNumber ?? 0),

    status: selectedMonth.status,
  };
}

/* =========================================================
   Batch Matching
========================================================= */

function matchesBatch(record, period, isCare) {
  if (!isCare) return true;

  const recordBatchId = getBatchId(record);

  if (recordBatchId && period.batchId) {
    return recordBatchId === period.batchId;
  }

  const recordBatchName = normalize(getBatchName(record));

  return (
    recordBatchName !== "" && recordBatchName === normalize(period.batchName)
  );
}

function matchesExamBatch(record, period, isCare) {
  if (!isCare) return true;

  const recordBatchId = getBatchId(record);
  const recordBatchName = getBatchName(record);

  // Keep compatibility with older exam records
  // that do not contain batch information.
  if (!recordBatchId && !recordBatchName) {
    return true;
  }

  return matchesBatch(record, period, true);
}

/* =========================================================
   Attendance Helpers
========================================================= */

function isPresent(record) {
  const status = normalize(
    record?.attendanceStatus ?? record?.attendance ?? record?.status ?? "",
  );

  return (
    record?.present === true ||
    record?.isPresent === true ||
    status === "present" ||
    status === "উপস্থিত" ||
    status === "প্রেজেন্ট"
  );
}

function getStudentAttendanceFromSheet(sheet, studentDocumentId, studentId) {
  const records = sheet?.records;

  if (!records || typeof records !== "object") {
    return null;
  }

  // Current attendance format:
  // records[studentDocumentId] = { present, status, ... }
  const directRecord = records[String(studentDocumentId)];

  if (directRecord) {
    return directRecord;
  }

  // Compatibility with older record formats.
  return (
    Object.values(records).find(
      (item) =>
        String(item?.studentId ?? "") === String(studentId) ||
        String(item?.studentDocId ?? "") === String(studentDocumentId),
    ) ?? null
  );
}

function calculateAttendanceMark(
  attendanceSnapshot,
  student,
  studentDocumentId,
  period,
  isCare,
) {
  const presentDates = new Set();

  attendanceSnapshot.docs.forEach((item) => {
    const sheet = item.data();

    const attendanceDate = getRecordDate(sheet, [
      "date",
      "sessionDate",
      "attendanceDate",
    ]);

    if (!isWithinPeriod(attendanceDate, period)) return;
    if (!matchesDepartment(sheet, student)) return;
    if (!matchesBatch(sheet, period, isCare)) return;

    const studentAttendance = getStudentAttendanceFromSheet(
      sheet,
      studentDocumentId,
      student.studentId,
    );

    if (!studentAttendance) return;

    if (isPresent(studentAttendance)) {
      // Set prevents duplicate attendance counting
      // for the same student on the same date.
      presentDates.add(attendanceDate);
    }
  });

  return presentDates.size;
}

/* =========================================================
   Offline Exam Mark
========================================================= */

function calculateOfflineExamMark(
  examSnapshot,
  student,
  studentDocumentId,
  period,
  isCare,
) {
  let total = 0;

  examSnapshot.docs.forEach((item) => {
    const record = item.data();

    if (!isSameStudent(record, studentDocumentId, student.studentId)) {
      return;
    }

    if (!matchesDepartment(record, student)) return;
    if (!matchesExamBatch(record, period, isCare)) return;

    const examDate = getRecordDate(record, [
      "examDate",
      "date",
      "createdAt",
      "updatedAt",
    ]);

    if (!isWithinPeriod(examDate, period)) return;

    total += getNumericMark(record.obtainedMark, record.marks);
  });

  return total;
}

/* =========================================================
   Online Exam Mark
========================================================= */

function calculateOnlineExamMark(
  examSnapshot,
  student,
  studentDocumentId,
  period,
  isCare,
) {
  let total = 0;

  examSnapshot.docs.forEach((item) => {
    const record = item.data();

    if (!isSameStudent(record, studentDocumentId, student.studentId)) {
      return;
    }

    if (!matchesDepartment(record, student)) return;
    if (!matchesExamBatch(record, period, isCare)) return;

    const examDate = getRecordDate(record, [
      "submittedAt",
      "createdAt",
      "examDate",
      "date",
    ]);

    if (!isWithinPeriod(examDate, period)) return;

    total += getNumericMark(
      record.marks,
      record.obtainedMark,
      record.score,
      record.correctAnswers,
    );
  });

  return total;
}

/* =========================================================
   Main Function
========================================================= */

export async function calculateCurrentMark(input) {
  const studentDocumentId =
    typeof input === "object" && input !== null
      ? input.studentDocumentId || input.documentId || input.docId
      : input;

  if (!studentDocumentId) {
    throw new Error("Student document ID is required.");
  }

  try {
    const studentRef = doc(db, COLLECTIONS.students, String(studentDocumentId));

    const studentSnapshot = await getDoc(studentRef);

    if (!studentSnapshot.exists()) {
      throw new Error(`Student not found. Document ID: ${studentDocumentId}`);
    }

    const student = {
      id: studentSnapshot.id,
      ...studentSnapshot.data(),
    };

    const isCare = isCareDepartment(student);

    /*
     * Fetch source collections only once per calculation.
     * These reads run in parallel to reduce waiting time.
     */
    const [
      attendanceSnapshot,
      offlineExamSnapshot,
      onlineExamSnapshot,
      batchMonthSnapshot,
    ] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.attendance)),
      getDocs(collection(db, COLLECTIONS.offlineExams)),
      getDocs(collection(db, COLLECTIONS.onlineExams)),
      isCare
        ? getDocs(collection(db, COLLECTIONS.careMonths))
        : Promise.resolve(null),
    ]);

    const period = isCare
      ? await getCareBatchPeriod(student, batchMonthSnapshot)
      : getCurrentMonthPeriod();

    /*
     * Calculate all three mark categories.
     * No Firestore writes happen inside these calculations.
     */
    const attendanceMark = calculateAttendanceMark(
      attendanceSnapshot,
      student,
      studentDocumentId,
      period,
      isCare,
    );

    const offlineExamMark = calculateOfflineExamMark(
      offlineExamSnapshot,
      student,
      studentDocumentId,
      period,
      isCare,
    );

    const onlineExamMark = calculateOnlineExamMark(
      onlineExamSnapshot,
      student,
      studentDocumentId,
      period,
      isCare,
    );

    const currentMark = attendanceMark + offlineExamMark + onlineExamMark;

    /*
     * IMPORTANT:
     * Only currentMark-related fields are updated.
     * The point field is never read or modified here.
     */
    await updateDoc(studentRef, {
      currentMark,
      currentMarkPeriod: period.periodId,
      currentMarkUpdatedAt: serverTimestamp(),
    });

    const result = {
      studentDocumentId: String(studentDocumentId),
      studentId: student.studentId ?? String(studentDocumentId),
      departmentId: getDepartmentId(student),
      batchId: getBatchId(student),
      batchName: getBatchName(student),
      period,
      attendanceMark,
      offlineExamMark,
      onlineExamMark,
      currentMark,
    };

    console.log("CurrentMark calculated successfully:", result);

    return result;
  } catch (error) {
    console.error("Calculate currentMark error:", error);
    throw error;
  }
}

export default calculateCurrentMark;
