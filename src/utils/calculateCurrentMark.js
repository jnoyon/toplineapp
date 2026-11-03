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

const CARE_DEPARTMENT_ID = String(departments.CARE.id);
const CARE_DEPARTMENT_NAME = departments.CARE.name;

/* =========================================================
   Helpers
========================================================= */

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeId = (value) => {
  const id = String(value ?? "").trim();

  return /^\d+$/.test(id) ? String(Number(id)) : id;
};

const getDepartmentId = (record) =>
  normalizeId(record?.departmentId ?? record?.departmentID);

const getDepartmentName = (record) =>
  String(record?.departmentName ?? record?.department ?? "").trim();

const getBatchId = (record) =>
  String(record?.batchId || record?.classId || "").trim();

const getBatchName = (record) =>
  String(
    record?.batchName ??
      record?.className ??
      record?.batch ??
      record?.class ??
      "",
  ).trim();

const getStudentIdentifiers = (record) =>
  [
    record?.studentDocumentId,
    record?.studentDocId,
    record?.studentId,
    record?.studentID,
    record?.uid,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String);

const isSameStudent = (record, studentDocumentId, studentId) => {
  const identifiers = getStudentIdentifiers(record);

  return (
    identifiers.includes(String(studentDocumentId)) ||
    (studentId && identifiers.includes(String(studentId)))
  );
};

/* =========================================================
   Date Helpers
========================================================= */

const toDateString = (value) => {
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
};

const getRecordDate = (record, fields) => {
  for (const field of fields) {
    const date = toDateString(record?.[field]);

    if (date) return date;
  }

  return "";
};

const isWithinPeriod = (date, period) =>
  Boolean(date && date >= period.startDate && date <= period.endDate);

const getCurrentMonthPeriod = () => {
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
};

/* =========================================================
   Mark Helpers
========================================================= */

const getNumericMark = (...values) => {
  const value = values.find(
    (item) => item !== undefined && item !== null && item !== "",
  );

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

/* =========================================================
   Department Helpers
========================================================= */

const isCareDepartment = (student) => {
  const departmentId = getDepartmentId(student);

  const departmentName = normalize(getDepartmentName(student));

  return (
    departmentId === CARE_DEPARTMENT_ID ||
    departmentName === normalize(CARE_DEPARTMENT_NAME) ||
    departmentName.includes("care")
  );
};

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

  return true;
}

/* =========================================================
   Care Batch Period
========================================================= */

async function getCareBatchPeriod(student) {
  const studentBatchId = getBatchId(student);
  const studentBatchName = getBatchName(student);

  if (!studentBatchId && !studentBatchName) {
    throw new Error("Care student batch information not found.");
  }

  const snapshot = await getDocs(collection(db, "batchMonthStates"));

  const matchingMonths = snapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data(),
    }))
    .filter((month) => {
      const departmentId = getDepartmentId(month);

      const departmentName = normalize(getDepartmentName(month));

      const isCareMonth =
        departmentId === CARE_DEPARTMENT_ID ||
        departmentName === normalize(CARE_DEPARTMENT_NAME) ||
        departmentName.includes("care");

      if (!isCareMonth) return false;

      const monthBatchId = getBatchId(month);

      if (monthBatchId && studentBatchId) {
        return monthBatchId === studentBatchId;
      }

      return normalize(getBatchName(month)) === normalize(studentBatchName);
    })
    .filter(
      (month) => toDateString(month.startDate) && toDateString(month.endDate),
    )
    .sort((a, b) => Number(a.monthNumber ?? 0) - Number(b.monthNumber ?? 0));

  if (!matchingMonths.length) {
    throw new Error(`Care batch period not found for ${studentBatchName}.`);
  }

  const activeMonth = matchingMonths.find((month) => month.status === "active");

  const selectedMonth =
    activeMonth || matchingMonths[matchingMonths.length - 1];

  const startDate = toDateString(selectedMonth.startDate);

  const endDate = toDateString(
    selectedMonth.status === "closed"
      ? selectedMonth.closedDate || selectedMonth.endDate
      : selectedMonth.endDate,
  );

  return {
    startDate,
    endDate,
    periodId: `care:${studentBatchId || normalize(studentBatchName)}`,
    batchId: studentBatchId,
    batchName: studentBatchName,
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

/* =========================================================
   Attendance
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

  // New attendance sheet uses student document ID as key.
  const directRecord = records[String(studentDocumentId)];

  if (directRecord) {
    return directRecord;
  }

  // Fallback if the record key differs.
  return (
    Object.values(records).find(
      (item) =>
        String(item?.studentId ?? "") === String(studentId) ||
        String(item?.studentDocId ?? "") === String(studentDocumentId),
    ) ?? null
  );
}

async function calculateAttendanceMark(
  student,
  studentDocumentId,
  period,
  isCare,
) {
  const snapshot = await getDocs(collection(db, "attendance"));

  const presentDates = new Set();

  snapshot.docs.forEach((item) => {
    const sheet = item.data();

    const attendanceDate = getRecordDate(sheet, [
      "date",
      "sessionDate",
      "attendanceDate",
    ]);

    if (!isWithinPeriod(attendanceDate, period)) {
      return;
    }

    if (!matchesDepartment(sheet, student)) {
      return;
    }

    if (!matchesBatch(sheet, period, isCare)) {
      return;
    }

    const studentAttendance = getStudentAttendanceFromSheet(
      sheet,
      studentDocumentId,
      student.studentId,
    );

    if (!studentAttendance) return;

    if (isPresent(studentAttendance)) {
      presentDates.add(attendanceDate);
    }
  });

  return presentDates.size;
}

/* =========================================================
   Exam Matching
========================================================= */

function matchesExamBatch(record, period, isCare) {
  if (!isCare) return true;

  const recordBatchId = getBatchId(record);
  const recordBatchName = getBatchName(record);

  // Accept exam records without batch information.
  if (!recordBatchId && !recordBatchName) {
    return true;
  }

  return matchesBatch(record, period, true);
}

/* =========================================================
   Offline Exam Marks
========================================================= */

async function calculateOfflineExamMark(
  student,
  studentDocumentId,
  period,
  isCare,
) {
  const snapshot = await getDocs(collection(db, "examMarks"));

  let total = 0;

  snapshot.docs.forEach((item) => {
    const record = item.data();

    if (!isSameStudent(record, studentDocumentId, student.studentId)) {
      return;
    }

    if (!matchesDepartment(record, student)) {
      return;
    }

    if (!matchesExamBatch(record, period, isCare)) {
      return;
    }

    const examDate = getRecordDate(record, [
      "examDate",
      "date",
      "updatedAt",
      "createdAt",
    ]);

    if (!isWithinPeriod(examDate, period)) {
      return;
    }

    total += getNumericMark(record.obtainedMark, record.marks);
  });

  return total;
}

/* =========================================================
   Online Exam Marks
========================================================= */

async function calculateOnlineExamMark(
  student,
  studentDocumentId,
  period,
  isCare,
) {
  const snapshot = await getDocs(collection(db, "examResults"));

  let total = 0;

  snapshot.docs.forEach((item) => {
    const record = item.data();

    if (!isSameStudent(record, studentDocumentId, student.studentId)) {
      return;
    }

    if (!matchesDepartment(record, student)) {
      return;
    }

    if (!matchesExamBatch(record, period, isCare)) {
      return;
    }

    const examDate = getRecordDate(record, [
      "submittedAt",
      "createdAt",
      "examDate",
      "date",
    ]);

    if (!isWithinPeriod(examDate, period)) {
      return;
    }

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
  // Supports string or object argument.
  const studentDocumentId =
    typeof input === "object" && input !== null
      ? input.studentDocumentId || input.documentId || input.docId
      : input;

  if (!studentDocumentId) {
    throw new Error("Student document ID is required.");
  }

  try {
    const studentRef = doc(db, "students", String(studentDocumentId));

    const studentSnapshot = await getDoc(studentRef);

    if (!studentSnapshot.exists()) {
      throw new Error(`Student not found. Document ID: ${studentDocumentId}`);
    }

    const student = {
      id: studentSnapshot.id,
      ...studentSnapshot.data(),
    };

    const isCare = isCareDepartment(student);

    const period = isCare
      ? await getCareBatchPeriod(student)
      : getCurrentMonthPeriod();

    const [attendanceMark, offlineExamMark, onlineExamMark] = await Promise.all(
      [
        calculateAttendanceMark(student, studentDocumentId, period, isCare),

        calculateOfflineExamMark(student, studentDocumentId, period, isCare),

        calculateOnlineExamMark(student, studentDocumentId, period, isCare),
      ],
    );

    const currentMark = attendanceMark + offlineExamMark + onlineExamMark;

    await updateDoc(studentRef, {
      currentMark,
      currentMarkPeriod: period.periodId,
      currentMarkUpdatedAt: serverTimestamp(),
    });

    const result = {
      studentDocumentId,
      studentId: student.studentId ?? studentDocumentId,
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
