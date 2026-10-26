import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

/* =========================================================
   Configuration
========================================================= */

const CARE_DEPARTMENT_ID = "3";

const ATTENDANCE_COLLECTION = "attendance";
const OFFLINE_EXAM_COLLECTION = "examMarks";
const ONLINE_EXAM_COLLECTION = "examResults";

/* =========================================================
   Helpers
========================================================= */

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const toDateString = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (typeof value?.toDate === "function") {
    return toDateString(value.toDate());
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return "";
};

const getToday = () => toDateString(new Date());

const getCurrentMonth = () => getToday().slice(0, 7);

const getMonthStart = (month) => `${month}-01`;

const getDepartmentId = (record) =>
  String(record?.departmentId ?? record?.departmentID ?? "");

const getDepartmentName = (record) =>
  String(record?.departmentName ?? record?.department ?? "").trim();

const getBatchName = (record) =>
  String(
    record?.batchName ??
      record?.className ??
      record?.batch ??
      record?.class ??
      "",
  ).trim();

const getBatchId = (record) =>
  String(record?.batchId ?? record?.classId ?? "").trim();

const isCareStudent = (student) => {
  const departmentId = getDepartmentId(student);

  const departmentName = normalize(
    student?.departmentName ?? student?.department ?? "",
  );

  return (
    departmentId === CARE_DEPARTMENT_ID ||
    departmentName.includes("care") ||
    departmentName.includes("কেয়ার") ||
    departmentName.includes("কেয়ার")
  );
};

const isCareDepartmentRecord = (record) => {
  const departmentId = getDepartmentId(record);
  const departmentName = normalize(getDepartmentName(record));

  return (
    departmentId === CARE_DEPARTMENT_ID ||
    departmentName.includes("care") ||
    departmentName.includes("কেয়ার") ||
    departmentName.includes("কেয়ার")
  );
};

const isDateInsidePeriod = (date, startDate, endDate) =>
  Boolean(date && startDate && endDate) && date >= startDate && date <= endDate;

const getRecordStudentDocumentId = (record) =>
  String(
    record?.studentDocumentId ??
      record?.studentDocId ??
      record?.documentId ??
      "",
  );

const getRecordStudentId = (record) => String(record?.studentId ?? "");

const belongsToStudent = (record, studentDocumentId, studentId) => {
  const recordDocumentId = getRecordStudentDocumentId(record);
  const recordStudentId = getRecordStudentId(record);

  // Prefer the document ID when both IDs are available.
  if (recordDocumentId && studentDocumentId) {
    if (recordDocumentId === studentDocumentId) {
      return true;
    }

    // Allow studentId fallback for legacy records.
    return Boolean(
      studentId && recordStudentId && recordStudentId === studentId,
    );
  }

  return Boolean(studentId && recordStudentId && recordStudentId === studentId);
};

const getAttendanceDate = (record) =>
  toDateString(record?.date ?? record?.attendanceDate);

const getOfflineExamDate = (record) =>
  toDateString(record?.examDate ?? record?.date);

const getOnlineExamDate = (record) =>
  toDateString(
    record?.examDate ??
      record?.date ??
      record?.submittedAt ??
      record?.createdAt,
  );

const getAttendanceMark = (record) => {
  if (typeof record?.present === "boolean") {
    return record.present ? 1 : 0;
  }

  return normalize(record?.status) === "present" ? 1 : 0;
};

const getOfflineMark = (record) =>
  Math.max(0, Number(record?.obtainedMark) || 0);

const getOnlineMark = (record) => {
  const value =
    record?.marks ??
    record?.obtainedMark ??
    record?.score ??
    record?.correctAnswers;

  return Math.max(0, Number(value) || 0);
};

/* =========================================================
   Read records belonging to a student
========================================================= */

async function getRecordsByStudent({
  db,
  collectionName,
  documentIdFields = [],
  studentDocumentId,
  studentId,
}) {
  const collectionRef = collection(db, collectionName);
  const requests = [];

  // Query every supported document-ID field.
  if (studentDocumentId) {
    for (const field of documentIdFields) {
      requests.push(
        getDocs(query(collectionRef, where(field, "==", studentDocumentId))),
      );
    }
  }

  // Legacy fallback.
  if (studentId) {
    requests.push(
      getDocs(query(collectionRef, where("studentId", "==", studentId))),
    );
  }

  const snapshots = await Promise.all(requests);
  const uniqueRecords = new Map();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((item) => {
      uniqueRecords.set(item.id, {
        id: item.id,
        ...item.data(),
      });
    });
  });

  return [...uniqueRecords.values()].filter((record) =>
    belongsToStudent(record, studentDocumentId, studentId),
  );
}

/* =========================================================
   Get Care batch period
========================================================= */

async function getCareBatchPeriod({ db, student }) {
  const batchName = getBatchName(student);
  const batchId = getBatchId(student);

  if (!batchName && !batchId) {
    throw new Error("Care student-এর batchName অথবা batchId পাওয়া যায়নি।");
  }

  const snapshot = await getDocs(collection(db, "batchMonthStates"));

  let months = snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));

  // Match the Care department.
  months = months.filter((item) => {
    const hasDepartmentInformation =
      Boolean(getDepartmentId(item)) || Boolean(getDepartmentName(item));

    return isCareDepartmentRecord(item) || !hasDepartmentInformation;
  });

  // Prefer batch ID.
  if (batchId) {
    const matchingBatchId = months.filter(
      (item) => getBatchId(item) === batchId,
    );

    if (matchingBatchId.length > 0) {
      months = matchingBatchId;
    } else {
      months = months.filter(
        (item) => normalize(getBatchName(item)) === normalize(batchName),
      );
    }
  } else {
    months = months.filter(
      (item) => normalize(getBatchName(item)) === normalize(batchName),
    );
  }

  months = months
    .filter((item) => toDateString(item.startDate))
    .sort((a, b) => {
      const difference = toDateString(a.startDate).localeCompare(
        toDateString(b.startDate),
      );

      if (difference !== 0) {
        return difference;
      }

      return Number(a.monthNumber ?? 0) - Number(b.monthNumber ?? 0);
    });

  if (months.length === 0) {
    return {
      startDate: "",
      endDate: "",
      period: `care:${batchId || batchName}`,
      hasPeriod: false,
    };
  }

  const firstMonth = months[0];
  const latestMonth = months[months.length - 1];

  const startDate = toDateString(firstMonth.startDate);

  const latestMonthEndDate = toDateString(
    latestMonth.endDate ?? latestMonth.closedDate,
  );

  let endDate;

  if (normalize(latestMonth.status) === "closed") {
    endDate = latestMonthEndDate || getToday();
  } else {
    endDate = latestMonthEndDate
      ? [latestMonthEndDate, getToday()].sort()[0]
      : getToday();
  }

  return {
    startDate,
    endDate,
    period: `care:${batchId || batchName}`,
    hasPeriod: true,
  };
}

/* =========================================================
   Main function
========================================================= */

/**
 * Calculates:
 *
 * currentMark = attendanceMark + offlineMark + onlineMark
 *
 * Academy / Coaching:
 * Current calendar month.
 *
 * Care:
 * From the first matched batch month through the latest
 * matched batch month.
 */
export async function calculateCurrentMark({
  db,
  studentDocumentId,
  studentId,
}) {
  if (!db) {
    throw new Error("calculateCurrentMark: db is required.");
  }

  if (!studentDocumentId) {
    throw new Error("calculateCurrentMark: studentDocumentId is required.");
  }

  /* -----------------------------------------
     1. Read student
  ----------------------------------------- */

  const studentRef = doc(db, "students", studentDocumentId);

  const studentSnapshot = await getDoc(studentRef);

  if (!studentSnapshot.exists()) {
    throw new Error(`Student not found: ${studentDocumentId}`);
  }

  const student = {
    id: studentSnapshot.id,
    ...studentSnapshot.data(),
  };

  const resolvedStudentId = String(student.studentId ?? studentId ?? "");

  const careStudent = isCareStudent(student);

  /* -----------------------------------------
     2. Determine calculation period
  ----------------------------------------- */

  let startDate;
  let endDate;
  let currentMarkPeriod;

  if (careStudent) {
    const period = await getCareBatchPeriod({
      db,
      student,
    });

    currentMarkPeriod = period.period;

    if (!period.hasPeriod) {
      // Do not overwrite existing marks with zero when
      // the batch period configuration is missing.
      console.error("CurrentMark: Care batch period not found.", {
        studentDocumentId,
        studentId: resolvedStudentId,
        batchId: getBatchId(student),
        batchName: getBatchName(student),
      });

      throw new Error(
        "Care batch-এর batchMonthStates পাওয়া যায়নি। " +
          "currentMark আপডেট করা হয়নি।",
      );
    }

    startDate = period.startDate;
    endDate = period.endDate;
  } else {
    currentMarkPeriod = getCurrentMonth();
    startDate = getMonthStart(currentMarkPeriod);
    endDate = getToday();
  }

  /* -----------------------------------------
     3. Read source records
  ----------------------------------------- */

  const [attendanceRecords, offlineRecords, onlineRecords] = await Promise.all([
    getRecordsByStudent({
      db,
      collectionName: ATTENDANCE_COLLECTION,
      documentIdFields: ["studentDocId", "studentDocumentId"],
      studentDocumentId,
      studentId: resolvedStudentId,
    }),

    getRecordsByStudent({
      db,
      collectionName: OFFLINE_EXAM_COLLECTION,
      documentIdFields: ["studentDocumentId", "studentDocId"],
      studentDocumentId,
      studentId: resolvedStudentId,
    }),

    getRecordsByStudent({
      db,
      collectionName: ONLINE_EXAM_COLLECTION,
      documentIdFields: ["studentDocumentId", "studentDocId"],
      studentDocumentId,
      studentId: resolvedStudentId,
    }),
  ]);

  /* -----------------------------------------
     4. Filter by Care batch
  ----------------------------------------- */

  const belongsToCurrentBatch = (record) => {
    if (!careStudent) {
      return true;
    }

    const studentBatchId = getBatchId(student);
    const recordBatchId = getBatchId(record);

    const studentBatchName = normalize(getBatchName(student));

    const recordBatchName = normalize(getBatchName(record));

    if (studentBatchId && recordBatchId) {
      return studentBatchId === recordBatchId;
    }

    if (studentBatchName && recordBatchName) {
      return studentBatchName === recordBatchName;
    }

    // Cannot safely match records without batch information.
    return false;
  };

  /* -----------------------------------------
     5. Calculate attendance marks
  ----------------------------------------- */

  const filteredAttendance = attendanceRecords
    .filter(belongsToCurrentBatch)
    .filter((record) =>
      isDateInsidePeriod(getAttendanceDate(record), startDate, endDate),
    );

  const attendanceMark = filteredAttendance.reduce(
    (sum, record) => sum + getAttendanceMark(record),
    0,
  );

  /* -----------------------------------------
     6. Calculate offline exam marks
  ----------------------------------------- */

  const filteredOffline = offlineRecords
    .filter(belongsToCurrentBatch)
    .filter((record) =>
      isDateInsidePeriod(getOfflineExamDate(record), startDate, endDate),
    );

  const offlineMark = filteredOffline.reduce(
    (sum, record) => sum + getOfflineMark(record),
    0,
  );

  /* -----------------------------------------
     7. Calculate online exam marks
  ----------------------------------------- */

  const filteredOnline = onlineRecords
    .filter(belongsToCurrentBatch)
    .filter((record) =>
      isDateInsidePeriod(getOnlineExamDate(record), startDate, endDate),
    );

  const onlineMark = filteredOnline.reduce(
    (sum, record) => sum + getOnlineMark(record),
    0,
  );

  /* -----------------------------------------
     8. Calculate total
  ----------------------------------------- */

  const currentMark = attendanceMark + offlineMark + onlineMark;

  /* -----------------------------------------
     9. Debug information
  ----------------------------------------- */

  console.log("Current Mark Debug:", {
    studentDocumentId,
    studentId: resolvedStudentId,
    departmentId: getDepartmentId(student),
    careStudent,
    batchId: getBatchId(student),
    batchName: getBatchName(student),
    startDate,
    endDate,
    attendanceCount: attendanceRecords.length,
    filteredAttendanceCount: filteredAttendance.length,
    offlineExamCount: offlineRecords.length,
    filteredOfflineExamCount: filteredOffline.length,
    onlineExamCount: onlineRecords.length,
    filteredOnlineExamCount: filteredOnline.length,
    attendanceMark,
    offlineMark,
    onlineMark,
    currentMark,
  });

  console.table(
    filteredOffline.map((record) => ({
      id: record.id,
      studentId: record.studentId,
      studentDocumentId: record.studentDocumentId,
      studentDocId: record.studentDocId,
      batchId: record.batchId,
      classId: record.classId,
      examDate: record.examDate,
      obtainedMark: record.obtainedMark,
    })),
  );

  console.table(
    filteredOnline.map((record) => ({
      id: record.id,
      studentId: record.studentId,
      studentDocumentId: record.studentDocumentId,
      studentDocId: record.studentDocId,
      batchId: record.batchId,
      classId: record.classId,
      examDate: record.examDate,
      marks: record.marks,
      obtainedMark: record.obtainedMark,
      score: record.score,
      correctAnswers: record.correctAnswers,
      calculatedMark: getOnlineMark(record),
    })),
  );

  /* -----------------------------------------
     10. Update student document
  ----------------------------------------- */

  await updateDoc(studentRef, {
    currentMark,
    currentMarkPeriod,
    currentMarkUpdatedAt: serverTimestamp(),
  });

  return {
    currentMark,
    currentMarkPeriod,
    attendanceMark,
    offlineMark,
    onlineMark,
  };
}
