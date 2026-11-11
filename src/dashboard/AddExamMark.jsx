import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { app } from "../assets/firebase/firebase.init";
import { departmentList } from "../config/departments";
import { calculateCurrentMark } from "../utils/calculateCurrentMark";

import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router";

const db = getFirestore(app);

const WRITE_BATCH_LIMIT = 400;
const RECALCULATION_CONCURRENCY = 5;

/* =========================================================
   Helpers
========================================================= */

const normalizeId = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const normalizeDepartmentId = (value) => {
  const normalized = normalizeId(value);

  return normalized && !Number.isNaN(Number(normalized))
    ? String(Number(normalized))
    : normalized;
};

const getStudentClassId = (student, isCare) => {
  if (isCare) {
    return normalizeId(student.batchId || student.classId);
  }

  return normalizeId(student.classId || student.batchId);
};

const getDepartment = (departmentId) =>
  departmentList.find(
    (department) =>
      normalizeDepartmentId(department.id) ===
      normalizeDepartmentId(departmentId),
  );

const formatDate = (value) => {
  if (!value) return "তারিখ নির্ধারিত নয়";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const getMarkDocumentId = (examId, studentId) => `${examId}__${studentId}`;

/* =========================================================
   Limited Concurrency

   Prevents too many simultaneous Firestore reads/writes
   during currentMark recalculation.
========================================================= */

async function runWithConcurrency(
  items,
  worker,
  concurrency = RECALCULATION_CONCURRENCY,
) {
  const results = new Array(items.length);

  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) return;

      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]),
        };
      } catch (error) {
        results[index] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

/* =========================================================
   Component
========================================================= */

export default function AddExamMark() {
  const [departmentId, setDepartmentId] = useState("");
  const [classId, setClassId] = useState("");
  const [examId, setExamId] = useState("");

  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [marks, setMarks] = useState({});

  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  /* =======================================================
     Selected Data
  ======================================================= */

  const selectedDepartment = useMemo(
    () => getDepartment(departmentId),
    [departmentId],
  );

  const isCare = selectedDepartment?.type === "batch";

  const availableClasses = selectedDepartment?.classes || [];

  const selectedClass = useMemo(
    () =>
      availableClasses.find(
        (item) => normalizeId(item.id) === normalizeId(classId),
      ),
    [availableClasses, classId],
  );

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === examId),
    [exams, examId],
  );

  const totalMark = Number(selectedExam?.totalMark || 0);

  /* =======================================================
     Load Exams
  ======================================================= */

  const loadExams = useCallback(async () => {
    if (!departmentId || !classId) {
      setExams([]);
      setExamId("");
      setStudents([]);
      setMarks({});
      return;
    }

    setLoadingExams(true);

    try {
      const snapshot = await getDocs(collection(db, "syllabuses"));

      const filteredExams = snapshot.docs
        .map((examDoc) => ({
          id: examDoc.id,
          ...examDoc.data(),
        }))
        .filter((exam) => {
          const sameDepartment =
            normalizeDepartmentId(exam.departmentId) ===
            normalizeDepartmentId(departmentId);

          // CARE may store batchId instead of classId.
          const examClassId = normalizeId(exam.classId || exam.batchId);

          return sameDepartment && examClassId === normalizeId(classId);
        })
        .sort((a, b) =>
          String(b.examDate || "").localeCompare(String(a.examDate || "")),
        );

      setExams(filteredExams);
      setExamId("");
      setStudents([]);
      setMarks({});
    } catch (error) {
      console.error("Load exams error:", error);

      toast.error("পরীক্ষার তালিকা লোড করা যায়নি।");

      setExams([]);
      setExamId("");
    } finally {
      setLoadingExams(false);
    }
  }, [departmentId, classId]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  /* =======================================================
     Load Students
  ======================================================= */

  const loadStudents = useCallback(async () => {
    if (!departmentId || !classId || !examId) {
      setStudents([]);
      setMarks({});
      return;
    }

    setLoadingStudents(true);

    try {
      const snapshot = await getDocs(collection(db, "students"));

      const filteredStudents = snapshot.docs
        .map((studentDoc) => ({
          documentId: studentDoc.id,
          ...studentDoc.data(),
        }))
        .filter((student) => {
          const sameDepartment =
            normalizeDepartmentId(student.departmentId) ===
            normalizeDepartmentId(departmentId);

          const sameClass =
            getStudentClassId(student, isCare) === normalizeId(classId);

          // Preserve compatibility with older approved records.
          const isApproved = student.approved !== false;
          const isActive = student.isActive !== false;

          return sameDepartment && sameClass && isApproved && isActive;
        })
        .sort((a, b) =>
          String(a.studentId || a.documentId).localeCompare(
            String(b.studentId || b.documentId),
            undefined,
            { numeric: true },
          ),
        );

      setStudents(filteredStudents);
      setMarks({});
    } catch (error) {
      console.error("Load students error:", error);

      toast.error("শিক্ষার্থীদের তালিকা লোড করা যায়নি।");

      setStudents([]);
      setMarks({});
    } finally {
      setLoadingStudents(false);
    }
  }, [departmentId, classId, examId, isCare]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  /* =======================================================
     Selection Handlers
  ======================================================= */

  const handleDepartmentChange = (value) => {
    if (saving) return;

    setDepartmentId(value);
    setClassId("");
    setExamId("");

    setExams([]);
    setStudents([]);
    setMarks({});
  };

  const handleClassChange = (value) => {
    if (saving) return;

    setClassId(value);
    setExamId("");

    setStudents([]);
    setMarks({});
  };

  const handleExamChange = (value) => {
    if (saving) return;

    setExamId(value);
    setStudents([]);
    setMarks({});
  };

  const handleMarkChange = (studentId, value) => {
    setMarks((previous) => ({
      ...previous,
      [studentId]: value,
    }));
  };

  /* =======================================================
     Entered Count
  ======================================================= */

  const enteredCount = useMemo(
    () =>
      students.filter((student) => {
        const studentId = String(student.studentId || student.documentId);

        return (
          marks[studentId] !== undefined &&
          String(marks[studentId]).trim() !== ""
        );
      }).length,
    [students, marks],
  );

  /* =======================================================
     Save Exam Marks
  ======================================================= */

  const handleSave = async (event) => {
    event.preventDefault();

    if (saving) return;

    if (!selectedExam) {
      toast.error("প্রথমে একটি পরীক্ষা নির্বাচন করুন।");
      return;
    }

    if (!students.length) {
      toast.error("এই শ্রেণিতে কোনো শিক্ষার্থী পাওয়া যায়নি।");
      return;
    }

    if (!Number.isFinite(totalMark) || totalMark <= 0) {
      toast.error("পরীক্ষার পূর্ণমান সঠিক নয়।");
      return;
    }

    /* -----------------------------------------------------
       Prepare Entries
    ----------------------------------------------------- */

    const entries = students
      .map((student) => {
        const studentId = String(student.studentId || student.documentId);

        const rawValue = marks[studentId];

        if (rawValue === undefined || String(rawValue).trim() === "") {
          return null;
        }

        return {
          student,
          studentId,
          obtainedMark: Number(rawValue),
        };
      })
      .filter(Boolean);

    if (!entries.length) {
      toast.error("অন্তত একজন শিক্ষার্থীর প্রাপ্ত নম্বর লিখুন।");
      return;
    }

    /* -----------------------------------------------------
       Validate Marks
    ----------------------------------------------------- */

    const invalidEntry = entries.find(
      ({ obtainedMark }) =>
        !Number.isFinite(obtainedMark) ||
        obtainedMark < 0 ||
        obtainedMark > totalMark,
    );

    if (invalidEntry) {
      toast.error(`প্রাপ্ত নম্বর ০ থেকে ${totalMark}-এর মধ্যে হতে হবে।`);
      return;
    }

    setSaving(true);

    try {
      /* ---------------------------------------------------
         Firestore Batch Save

         Deterministic document ID prevents duplicate
         exam marks for the same student and exam.

         Existing createdAt is preserved because merge
         writes do not overwrite it here.
      --------------------------------------------------- */

      for (let index = 0; index < entries.length; index += WRITE_BATCH_LIMIT) {
        const chunk = entries.slice(index, index + WRITE_BATCH_LIMIT);

        const batch = writeBatch(db);

        chunk.forEach(({ student, studentId, obtainedMark }) => {
          const markDocId = getMarkDocumentId(selectedExam.id, studentId);

          const markRef = doc(db, "examMarks", markDocId);

          const numericDepartmentId = Number(departmentId);

          batch.set(
            markRef,
            {
              examId: selectedExam.id,

              examType: selectedExam.examType || "",
              examDate: selectedExam.examDate || "",
              examTime: selectedExam.examTime || "",

              departmentId: Number.isFinite(numericDepartmentId)
                ? numericDepartmentId
                : departmentId,

              departmentName:
                selectedExam.departmentName || selectedDepartment?.name || "",

              classId,

              className: selectedExam.className || selectedClass?.name || "",

              // Keep batch fields for CARE records.
              ...(isCare
                ? {
                    batchId: classId,
                    batchName:
                      selectedExam.batchName || selectedClass?.name || "",
                  }
                : {}),

              classType: selectedExam.classType || "",

              studentId,
              studentName: student.name || "",
              studentDocumentId: student.documentId,

              totalMark,
              obtainedMark,

              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        });

        await batch.commit();
      }

      /* ---------------------------------------------------
         Recalculate Current Mark

         currentMark =
           attendanceMark +
           offlineExamMark +
           onlineExamMark

         calculateCurrentMark imports db internally.

         Do not update point here.
      --------------------------------------------------- */

      const recalculationResults = await runWithConcurrency(
        entries,
        ({ student }) =>
          calculateCurrentMark({
            studentDocumentId: student.documentId,
          }),
      );

      const failedRecalculations = recalculationResults.filter(
        (result) => result.status === "rejected",
      );

      /* ---------------------------------------------------
         Success Messages
      --------------------------------------------------- */

      toast.success(`${entries.length} জন শিক্ষার্থীর নম্বর সংরক্ষণ হয়েছে।`);

      if (failedRecalculations.length > 0) {
        console.error(
          "currentMark recalculation failures:",
          failedRecalculations,
        );

        toast.error(
          `${failedRecalculations.length} জন শিক্ষার্থীর currentMark আপডেট হয়নি।`,
        );
      } else {
        toast.success("সব শিক্ষার্থীর currentMark সফলভাবে আপডেট হয়েছে।");
      }

      // Clear only after successful mark saving.
      setMarks({});
    } catch (error) {
      console.error("Save exam marks error:", error);

      toast.error(
        error.message || "নম্বর সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="min-h-screen bg-base-200/50 px-3 py-5 text-base-content sm:px-5 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Header */}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Examination Management
            </p>

            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              পরীক্ষার নম্বর এন্ট্রি
            </h1>

            <p className="mt-1 text-sm text-base-content/60">
              পরীক্ষা নির্বাচন করে শিক্ষার্থীদের প্রাপ্ত নম্বর সংরক্ষণ করুন।
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              loadExams();
              loadStudents();
            }}
            disabled={loadingExams || loadingStudents || saving}
          >
            ↻ রিফ্রেশ
          </button>
          <Link to="/manage-exam-mark" className="btn btn-error">
            {" "}
            মার্ক সম্পাদনা{" "}
          </Link>
        </div>

        {/* Filters */}

        <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h2 className="font-bold">পরীক্ষার তথ্য</h2>

            <p className="mt-1 text-xs text-base-content/60">
              প্রথমে বিভাগ, এরপর শ্রেণি/ব্যাচ এবং পরীক্ষা নির্বাচন করুন।
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Department */}

            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">বিভাগ</span>

              <select
                className="select select-bordered w-full"
                value={departmentId}
                onChange={(event) => handleDepartmentChange(event.target.value)}
                disabled={saving}
              >
                <option value="">বিভাগ নির্বাচন করুন</option>

                {departmentList.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Class / Batch */}

            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">
                {isCare ? "ব্যাচ" : "শ্রেণি"}
              </span>

              <select
                className="select select-bordered w-full"
                value={classId}
                onChange={(event) => handleClassChange(event.target.value)}
                disabled={!departmentId || saving}
              >
                <option value="">
                  {isCare ? "ব্যাচ নির্বাচন করুন" : "শ্রেণি নির্বাচন করুন"}
                </option>

                {availableClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Exam */}

            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">পরীক্ষা</span>

              <select
                className="select select-bordered w-full"
                value={examId}
                onChange={(event) => handleExamChange(event.target.value)}
                disabled={!classId || loadingExams || saving}
              >
                <option value="">
                  {loadingExams
                    ? "পরীক্ষা লোড হচ্ছে..."
                    : "পরীক্ষা নির্বাচন করুন"}
                </option>

                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.examType || "পরীক্ষা"} — {formatDate(exam.examDate)} —{" "}
                    {exam.totalMark} নম্বর
                  </option>
                ))}
              </select>
            </label>
          </div>

          {departmentId && classId && !loadingExams && exams.length === 0 && (
            <div className="alert mt-4 border border-warning/20 bg-warning/10 text-sm">
              <span>
                এই {isCare ? "ব্যাচে" : "শ্রেণিতে"} কোনো পরীক্ষা পাওয়া যায়নি।
                AddSyllabus.jsx-এ আগে পরীক্ষা তৈরি করুন।
              </span>
            </div>
          )}
        </section>

        {/* Selected Exam Summary */}

        <AnimatePresence>
          {selectedExam && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-content shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm opacity-80">নির্বাচিত পরীক্ষা</p>

                  <h2 className="mt-1 text-xl font-bold">
                    {selectedExam.examType || "পরীক্ষা"}
                  </h2>

                  <p className="mt-1 text-sm opacity-80">
                    {selectedDepartment?.name} ·{" "}
                    {selectedExam.className || selectedClass?.name}
                  </p>

                  <p className="mt-1 text-xs opacity-80">
                    পরীক্ষার তারিখ: {formatDate(selectedExam.examDate)}
                    {selectedExam.examTime
                      ? ` · সময়: ${selectedExam.examTime}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-xl bg-black/10 px-5 py-3 sm:min-w-36 sm:text-center">
                  <p className="text-xs opacity-80">পূর্ণমান</p>

                  <p className="text-3xl font-extrabold">{totalMark}</p>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Students and Marks */}

        {selectedExam && (
          <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
            {/* List Header */}

            <div className="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-bold">শিক্ষার্থীদের প্রাপ্ত নম্বর</h2>

                <p className="mt-1 text-xs text-base-content/60">
                  নম্বর না লিখলে সেই শিক্ষার্থীর জন্য কোনো নম্বর সংরক্ষণ হবে না।
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="badge badge-primary badge-outline">
                  মোট {students.length} জন
                </span>

                <span className="badge badge-success badge-outline">
                  এন্ট্রি {enteredCount} জন
                </span>
              </div>
            </div>

            {/* Loading */}

            {loadingStudents ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="skeleton h-14 w-full" />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-base-200 text-2xl">
                  ∅
                </div>

                <h3 className="mt-3 font-semibold">
                  কোনো শিক্ষার্থী পাওয়া যায়নি
                </h3>

                <p className="mt-1 text-sm text-base-content/60">
                  নির্বাচিত বিভাগ ও শ্রেণি/ব্যাচের অনুমোদিত শিক্ষার্থী নেই।
                </p>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                {/* Student Table */}

                <div className="overflow-x-auto">
                  <table className="table table-sm sm:table-md">
                    <thead>
                      <tr className="bg-base-200/70 text-base-content/70">
                        <th className="w-14">ক্রম</th>

                        <th>শিক্ষার্থীর নাম</th>

                        <th>Student ID</th>

                        <th className="w-44">
                          প্রাপ্ত নম্বর
                          <span className="ml-1 font-normal">
                            / {totalMark}
                          </span>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {students.map((student, index) => {
                        const studentId = String(
                          student.studentId || student.documentId,
                        );

                        const value = marks[studentId] ?? "";

                        const invalid =
                          value !== "" &&
                          (!Number.isFinite(Number(value)) ||
                            Number(value) < 0 ||
                            Number(value) > totalMark);

                        return (
                          <tr
                            key={student.documentId}
                            className="hover:bg-base-200/50"
                          >
                            <td className="text-base-content/50">
                              {index + 1}
                            </td>

                            <td>
                              <div className="font-medium">
                                {student.name || "নাম নেই"}
                              </div>

                              {student.roll && (
                                <div className="mt-0.5 text-xs text-base-content/50">
                                  রোল: {student.roll}
                                </div>
                              )}
                            </td>

                            <td>
                              <span className="font-mono text-xs sm:text-sm">
                                {student.studentId || student.documentId}
                              </span>
                            </td>

                            <td>
                              <input
                                type="number"
                                name="obtainedMark"
                                aria-label={`${student.name || "শিক্ষার্থী"}-এর প্রাপ্ত নম্বর`}
                                min="0"
                                max={totalMark}
                                step="any"
                                inputMode="decimal"
                                placeholder="০"
                                value={value}
                                onChange={(event) =>
                                  handleMarkChange(
                                    studentId,
                                    event.target.value,
                                  )
                                }
                                className={`input input-bordered input-sm w-full max-w-32 ${
                                  invalid ? "input-error" : ""
                                }`}
                                disabled={saving}
                              />

                              {invalid && (
                                <p className="mt-1 text-xs text-error">
                                  ০–{totalMark}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Save Footer */}

                <div className="flex flex-col gap-3 border-t border-base-300 bg-base-200/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <p className="text-xs text-base-content/60">
                    {enteredCount} জনের নম্বর দেওয়া হয়েছে। সর্বোচ্চ নম্বর{" "}
                    {totalMark}।
                  </p>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      saving ||
                      loadingStudents ||
                      students.length === 0 ||
                      enteredCount === 0
                    }
                  >
                    {saving ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        সংরক্ষণ হচ্ছে...
                      </>
                    ) : (
                      `নম্বর সংরক্ষণ (${enteredCount})`
                    )}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* No Exam Selected */}

        {!selectedExam && departmentId && classId && (
          <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 px-4 py-10 text-center">
            <p className="font-medium">একটি পরীক্ষা নির্বাচন করুন</p>

            <p className="mt-1 text-sm text-base-content/60">
              পরীক্ষার পূর্ণমান ও শিক্ষার্থীদের নম্বর এন্ট্রি ফর্ম এখানে দেখানো
              হবে।
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
