import { collection, getDocs, query, where } from "firebase/firestore";

/* =========================================================
   Attendance reader

   Attendance is stored in two shapes inside the same
   "attendance" collection:

   1. NEW - one "sheet" document per class/batch per day
      id: "<department>_<class or batch>_<yyyy-mm-dd>"
      {
        date, departmentId, departmentName, classId, className,
        batchId?, batchName?,
        studentDocIds: [ ... ],
        records: { [studentDocId]: { studentId, name, present, status } },
        ...
      }

   2. LEGACY - one document per student per day
      { date, studentDocId, studentId, present, status, ... }

   This helper returns ONE flat list of per-student records for a
   single student, whichever shape they came from, so that the
   student profile, the mark calculation and any other reader can
   keep working with the simple record shape they already know.
========================================================= */

const ATTENDANCE_COLLECTION = "attendance";

// Fields a legacy record may use to point at the student document.
const LEGACY_DOCUMENT_ID_FIELDS = ["studentDocId", "studentDocumentId"];

const recordKey = (record) =>
  [
    String(record.date ?? ""),
    String(record.classId ?? record.batchId ?? record.className ?? ""),
  ].join("|");

function sheetToStudentRecord(sheet, studentDocumentId) {
  const entry = sheet.records?.[studentDocumentId];

  if (!entry) return null;

  const present = entry.present === true;

  return {
    ...entry,
    id: `${sheet.id}:${studentDocumentId}`,
    sheetId: sheet.id,
    source: "sheet",

    date: sheet.date,

    studentDocId: studentDocumentId,
    studentId: String(entry.studentId ?? ""),
    studentName: entry.name ?? "",

    present,
    status: entry.status ?? (present ? "present" : "absent"),

    departmentId: sheet.departmentId,
    departmentName: sheet.departmentName,
    classId: sheet.classId,
    className: sheet.className,
    batchId: sheet.batchId,
    batchName: sheet.batchName,
  };
}

/**
 * All attendance records of one student, oldest first.
 *
 * If the same student has both a sheet entry and a legacy record for the
 * same date and class, the sheet entry wins.
 */
export async function getStudentAttendance({
  db,
  studentDocumentId,
  studentId,
}) {
  const collectionRef = collection(db, ATTENDANCE_COLLECTION);

  const legacyRequests = [];
  let sheetRequest = null;

  if (studentDocumentId) {
    // Sheets: array-contains on a single field needs no composite index.
    sheetRequest = getDocs(
      query(
        collectionRef,
        where("studentDocIds", "array-contains", studentDocumentId),
      ),
    );

    LEGACY_DOCUMENT_ID_FIELDS.forEach((field) => {
      legacyRequests.push(
        getDocs(query(collectionRef, where(field, "==", studentDocumentId))),
      );
    });
  }

  if (studentId) {
    legacyRequests.push(
      getDocs(query(collectionRef, where("studentId", "==", studentId))),
    );
  }

  const [sheetSnapshot, ...legacySnapshots] = await Promise.all([
    sheetRequest ?? Promise.resolve(null),
    ...legacyRequests,
  ]);

  const merged = new Map();

  // Legacy first, so sheet entries override them.
  legacySnapshots.forEach((snapshot) => {
    snapshot.docs.forEach((item) => {
      const record = { id: item.id, source: "legacy", ...item.data() };

      // Only real per-student records (sheets have no top-level studentId).
      if (!record.studentDocId && !record.studentId) return;

      merged.set(recordKey(record), record);
    });
  });

  sheetSnapshot?.docs.forEach((item) => {
    const sheet = { id: item.id, ...item.data() };
    const record = sheetToStudentRecord(sheet, studentDocumentId);

    if (record) merged.set(recordKey(record), record);
  });

  return [...merged.values()].sort((a, b) =>
    String(a.date ?? "").localeCompare(String(b.date ?? "")),
  );
}
