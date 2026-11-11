import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { FaPlus, FaTrash } from "react-icons/fa";

import { db } from "../../assets/firebase/firebase.init";
import { departmentList } from "../../config/departments";
import { isAdmin as hasAdminPermission } from "../../config/permissions";
import { calculateCurrentMark } from "../../utils/calculateCurrentMark";

/* =========================
   Helpers
========================= */

const normalize = (value) => String(value ?? "").trim();

const sameId = (a, b) => normalize(a) === normalize(b);

const getStudentClass = (student) =>
  normalize(student?.batchId || student?.classId);

const getStudentClassName = (student) =>
  student?.batchName || student?.className || "—";

const getExamClasses = (exam) =>
  [
    ...(exam.selectedClasses || []),
    ...(exam.classes || []),
    ...(exam.selectedClassIds || []),
  ]
    .map((item) =>
      typeof item === "object"
        ? normalize(item.id ?? item.classId ?? item.batchId ?? item.value)
        : normalize(item),
    )
    .filter(Boolean);

const getExamTitle = (exam) =>
  exam?.title || exam?.examName || exam?.name || exam?.examType || "পরীক্ষা";

const firstNumber = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;

    const number = Number(value);

    if (Number.isFinite(number)) return number;
  }

  return null;
};

const getScore = (result) =>
  firstNumber(
    result.obtainedMark,
    result.score,
    result.totalObtainedMark,
    result.marksObtained,
    result.marks,
    result.correctCount,
    result.correctAnswers,
  ) ?? 0;

const getTotal = (result) =>
  firstNumber(
    result.totalMark,
    result.totalMarks,
    result.maxMark,
    result.fullMark,
    result.fullMarks,
    result.questionsCount,
    result.totalQuestions,
  ) ?? 0;

const formatNumber = (value) =>
  Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);

const getPercent = (obtained, total) =>
  Number(total) > 0 ? (Number(obtained) / Number(total)) * 100 : null;

const formatPercent = (percent) =>
  percent === null ? "—" : `${percent.toFixed(1)}%`;

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/* =========================
   Component
========================= */

export default function ExamResults() {
  const [isAdmin, setIsAdmin] = useState(false);

  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);

  const [departmentId, setDepartmentId] = useState("");
  const [classId, setClassId] = useState("");
  const [examType, setExamType] = useState("");
  const [examId, setExamId] = useState("");
  const [search, setSearch] = useState("");
  const [showAbsent, setShowAbsent] = useState(true);

  const [loading, setLoading] = useState(true);
  const [examsLoading, setExamsLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);

  const [updatingResultId, setUpdatingResultId] = useState("");
  const [deletingResultId, setDeletingResultId] = useState("");

  /* =========================
     Admin permission
  ========================= */

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(hasAdminPermission(user?.email));
    });

    return unsubscribe;
  }, []);

  /* =========================
     Recalculate currentMark
  ========================= */

  const recalculateStudentMark = useCallback(async (studentDocumentId) => {
    const id = normalize(studentDocumentId);

    if (!id) {
      console.warn(
        "Cannot recalculate currentMark: studentDocumentId is missing.",
      );

      return false;
    }

    try {
      await calculateCurrentMark({
        studentDocumentId: id,
      });

      return true;
    } catch (error) {
      console.error("Recalculate currentMark error:", error);

      return false;
    }
  }, []);

  /* =========================
     Load students
  ========================= */

  useEffect(() => {
    let mounted = true;

    async function loadStudents() {
      try {
        const snapshot = await getDocs(collection(db, "students"));

        const list = snapshot.docs.map((item) => ({
          ...item.data(),
          documentId: item.id,
        }));

        if (mounted) {
          setStudents(list);
        }
      } catch (error) {
        console.error("Load students error:", error);
        toast.error("শিক্ষার্থীদের তথ্য লোড করা যায়নি।");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadStudents();

    return () => {
      mounted = false;
    };
  }, []);

  /* =========================
     Class / Batch options
  ========================= */

  const classOptions = useMemo(() => {
    const map = new Map();

    students.forEach((student) => {
      if (departmentId && !sameId(student.departmentId, departmentId)) {
        return;
      }

      const id = getStudentClass(student);

      if (id && !map.has(id)) {
        map.set(id, getStudentClassName(student));
      }
    });

    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, departmentId]);

  /* =========================
     Load exams
  ========================= */

  useEffect(() => {
    let mounted = true;

    async function loadExams() {
      setExams([]);
      setExamId("");
      setResults([]);

      if (!examType || !departmentId) return;

      setExamsLoading(true);

      try {
        const isOnline = examType === "online";

        const snapshot = await getDocs(
          collection(db, isOnline ? "onlineExams" : "syllabuses"),
        );

        const list = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((exam) => {
            if (!sameId(exam.departmentId, departmentId)) {
              return false;
            }

            if (!classId) return true;

            if (!isOnline) {
              return sameId(exam.classId, classId);
            }

            const selected = getExamClasses(exam);

            return selected.length === 0 || selected.includes(classId);
          })
          .sort((a, b) =>
            normalize(b.examDate || b.createdAt?.seconds).localeCompare(
              normalize(a.examDate || a.createdAt?.seconds),
            ),
          );

        if (mounted) {
          setExams(list);
        }
      } catch (error) {
        console.error("Load exam list error:", error);
        toast.error("পরীক্ষার তালিকা লোড করা যায়নি।");
      } finally {
        if (mounted) {
          setExamsLoading(false);
        }
      }
    }

    loadExams();

    return () => {
      mounted = false;
    };
  }, [examType, departmentId, classId]);

  /* =========================
     Load results
  ========================= */

  useEffect(() => {
    let mounted = true;

    async function loadResults() {
      setResults([]);

      if (!examId || !examType) return;

      setResultLoading(true);

      try {
        const collectionName =
          examType === "online" ? "examResults" : "examMarks";

        const snapshot = await getDocs(
          query(collection(db, collectionName), where("examId", "==", examId)),
        );

        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        if (mounted) {
          setResults(list);
        }
      } catch (error) {
        console.error("Load exam results error:", error);
        toast.error("ফলাফল লোড করা যায়নি।");
      } finally {
        if (mounted) {
          setResultLoading(false);
        }
      }
    }

    loadResults();

    return () => {
      mounted = false;
    };
  }, [examId, examType]);

  /* =========================
     Increase mark
  ========================= */

  async function handleIncreaseMark(row) {
    if (!isAdmin || !row?.id || !examType) return;

    const originalResult = results.find((item) => item.id === row.id);

    if (!originalResult) {
      toast.error("ফলাফলের তথ্য পাওয়া যায়নি।");
      return;
    }

    const scoreFields = [
      "obtainedMark",
      "score",
      "totalObtainedMark",
      "marksObtained",
      "marks",
      "correctCount",
      "correctAnswers",
    ];

    const fieldToUpdate =
      scoreFields.find(
        (field) =>
          originalResult[field] !== undefined &&
          originalResult[field] !== null &&
          originalResult[field] !== "",
      ) || "obtainedMark";

    const currentScore = Number(originalResult[fieldToUpdate] ?? 0);

    if (!Number.isFinite(currentScore)) {
      toast.error("বর্তমান নম্বর সঠিক নয়।");
      return;
    }

    const collectionName = examType === "online" ? "examResults" : "examMarks";

    setUpdatingResultId(row.id);

    try {
      // 1. Update the result document.
      await updateDoc(doc(db, collectionName, row.id), {
        [fieldToUpdate]: currentScore + 1,
      });

      // 2. Update local result state.
      setResults((previous) =>
        previous.map((item) =>
          item.id === row.id
            ? {
                ...item,
                [fieldToUpdate]: currentScore + 1,
              }
            : item,
        ),
      );

      // 3. Recalculate student's combined currentMark.
      const recalculated = await recalculateStudentMark(row.studentDocumentId);

      if (recalculated) {
        toast.success(
          `${row.name}-এর নম্বর ১ বাড়ানো হয়েছে এবং Current Mark আপডেট হয়েছে।`,
        );
      } else {
        toast.success(`${row.name}-এর নম্বর ১ বাড়ানো হয়েছে।`);

        toast.error(
          "Current Mark আপডেট করা যায়নি। শিক্ষার্থীর রেকর্ড যাচাই করুন।",
        );
      }
    } catch (error) {
      console.error("Increase result mark error:", error);
      toast.error("নম্বর বাড়ানো যায়নি।");
    } finally {
      setUpdatingResultId("");
    }
  }

  /* =========================
     Delete result
  ========================= */

  async function handleDeleteResult(row) {
    if (!isAdmin || !row?.id || !examType) return;

    const confirmation = await Swal.fire({
      title: "ফলাফল মুছে ফেলবেন?",
      text: `${row.name}-এর ${formatNumber(row.score)} নম্বরের ফলাফল স্থায়ীভাবে মুছে যাবে।`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, মুছে ফেলুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
    });

    if (!confirmation.isConfirmed) return;

    const collectionName = examType === "online" ? "examResults" : "examMarks";

    setDeletingResultId(row.id);

    try {
      // 1. Delete the selected result document.
      await deleteDoc(doc(db, collectionName, row.id));

      // 2. Update local state.
      setResults((previous) => previous.filter((item) => item.id !== row.id));

      // 3. Recalculate currentMark after deletion.
      const recalculated = await recalculateStudentMark(row.studentDocumentId);

      if (recalculated) {
        toast.success("ফলাফল মুছে ফেলা হয়েছে এবং Current Mark আপডেট হয়েছে।");
      } else {
        toast.success("ফলাফল মুছে ফেলা হয়েছে।");

        toast.error(
          "Current Mark আপডেট করা যায়নি। শিক্ষার্থীর রেকর্ড যাচাই করুন।",
        );
      }
    } catch (error) {
      console.error("Delete exam result error:", error);
      toast.error("ফলাফল মুছে ফেলা যায়নি।");
    } finally {
      setDeletingResultId("");
    }
  }

  const selectedExam = exams.find((exam) => exam.id === examId);

  /* =========================
     Student roster
  ========================= */

  const roster = useMemo(() => {
    if (!selectedExam) return [];

    const examClassIds =
      examType === "online"
        ? getExamClasses(selectedExam)
        : [normalize(selectedExam.classId)].filter(Boolean);

    return students.filter((student) => {
      if (!sameId(student.departmentId, departmentId)) {
        return false;
      }

      const studentClass = getStudentClass(student);

      if (classId) {
        return studentClass === classId;
      }

      return examClassIds.length === 0 || examClassIds.includes(studentClass);
    });
  }, [students, selectedExam, examType, departmentId, classId]);

  /* =========================
     Join results with students
  ========================= */

  const { rows, absent } = useMemo(() => {
    const byDocumentId = new Map();
    const byStudentId = new Map();

    students.forEach((student) => {
      byDocumentId.set(normalize(student.documentId), student);

      if (student.studentId) {
        byStudentId.set(normalize(student.studentId), student);
      }
    });

    const rosterIds = new Set(
      roster.map((student) => normalize(student.documentId)),
    );

    const findStudent = (result) =>
      byDocumentId.get(normalize(result.studentDocumentId)) ||
      byStudentId.get(normalize(result.studentId)) ||
      byStudentId.get(normalize(result.studentUid));

    const joined = results
      .map((result) => ({
        result,
        student: findStudent(result),
      }))
      .filter(({ result, student }) => {
        if (student) {
          return rosterIds.has(normalize(student.documentId));
        }

        if (
          result.departmentId != null &&
          !sameId(result.departmentId, departmentId)
        ) {
          return false;
        }

        const resultClass = normalize(result.batchId || result.classId);

        return !classId || !resultClass || resultClass === classId;
      })
      .map(({ result, student }) => {
        const score = getScore(result);
        const total = getTotal(result);

        return {
          id: result.id,

          // Keep the real Firestore student document ID.
          // It is required by calculateCurrentMark().
          studentDocumentId:
            normalize(result.studentDocumentId) ||
            normalize(student?.documentId),

          name:
            result.studentName ||
            student?.name ||
            result.name ||
            "নাম পাওয়া যায়নি",

          studentId: result.studentId || student?.studentId || "",

          className: student ? getStudentClassName(student) : "—",

          score,
          total,
          percent: getPercent(score, total),
        };
      })
      .sort((a, b) => b.score - a.score);

    // Students with equal scores share the same rank.
    const ranked = joined.map((row) => {
      const firstSame = joined.findIndex((item) => item.score === row.score);

      return {
        ...row,
        rank: firstSame + 1,
      };
    });

    const submittedIds = new Set(
      ranked.map((row) => normalize(row.studentDocumentId)).filter(Boolean),
    );

    const absentList = roster
      .filter(
        (student) =>
          student.isActive !== false &&
          student.approved !== false &&
          !submittedIds.has(normalize(student.documentId)),
      )
      .map((student) => ({
        id: student.documentId,
        name: student.name || "নাম পাওয়া যায়নি",
        studentId: student.studentId || "",
        className: getStudentClassName(student),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      rows: ranked,
      absent: absentList,
    };
  }, [results, students, roster, departmentId, classId]);

  /* =========================
     Search
  ========================= */

  const term = search.trim().toLowerCase();

  const matches = (item) =>
    !term ||
    item.name.toLowerCase().includes(term) ||
    normalize(item.studentId).toLowerCase().includes(term);

  const visibleRows = rows.filter(matches);

  const visibleAbsent = showAbsent ? absent.filter(matches) : [];

  /* =========================
     Summary
  ========================= */

  const stats = useMemo(() => {
    if (!rows.length) return null;

    const scores = rows.map((row) => row.score);

    const sum = scores.reduce((acc, value) => acc + value, 0);

    return {
      average: sum / rows.length,
      highest: Math.max(...scores),
      lowest: Math.min(...scores),
      total: rows.find((row) => row.total)?.total ?? 0,
    };
  }, [rows]);

  /* =========================
     CSV export
  ========================= */

  function exportCsv() {
    if (!rows.length && !absent.length) return;

    const header = [
      "অবস্থান",
      "নাম",
      "আইডি",
      "ব্যাচ",
      "প্রাপ্ত নম্বর",
      "পূর্ণমান",
      "শতকরা",
    ];

    const lines = [
      header.map(csvCell).join(","),

      ...rows.map((row) =>
        [
          row.rank,
          row.name,
          row.studentId,
          row.className,
          formatNumber(row.score),
          row.total ? formatNumber(row.total) : "",
          row.percent === null ? "" : row.percent.toFixed(1),
        ]
          .map(csvCell)
          .join(","),
      ),

      ...absent.map((item) =>
        ["অনুপস্থিত", item.name, item.studentId, item.className, "", "", ""]
          .map(csvCell)
          .join(","),
      ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${getExamTitle(selectedExam)}-results.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  /* =========================
     Loading
  ========================= */

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  /* =========================
     Render
  ========================= */

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section>
        <h1 className="text-2xl font-extrabold sm:text-3xl">পরীক্ষার ফলাফল</h1>

        <p className="mt-2 text-sm text-base-content/60">
          বিভাগ, ব্যাচ ও পরীক্ষা নির্বাচন করে সবার ফলাফল দেখো।
        </p>
      </section>

      {/* Filters */}
      <section className="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">বিভাগ</span>

          <select
            className="select select-bordered w-full"
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setClassId("");
            }}
          >
            <option value="">নির্বাচন করুন</option>

            {departmentList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">ব্যাচ / শ্রেণি</span>

          <select
            className="select select-bordered w-full"
            value={classId}
            disabled={!departmentId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">সব ব্যাচ</option>

            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">পরীক্ষার ধরন</span>

          <select
            className="select select-bordered w-full"
            value={examType}
            onChange={(event) => setExamType(event.target.value)}
          >
            <option value="">নির্বাচন করুন</option>
            <option value="online">অনলাইন পরীক্ষা</option>
            <option value="offline">অফলাইন পরীক্ষা</option>
          </select>
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">পরীক্ষা</span>

          <select
            className="select select-bordered w-full"
            value={examId}
            disabled={!examType || !departmentId || exams.length === 0}
            onChange={(event) => setExamId(event.target.value)}
          >
            <option value="">
              {!departmentId || !examType
                ? "আগে বিভাগ ও ধরন নির্বাচন করুন"
                : examsLoading
                  ? "লোড হচ্ছে..."
                  : exams.length
                    ? "পরীক্ষা নির্বাচন করুন"
                    : "কোনো পরীক্ষা পাওয়া যায়নি"}
            </option>

            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {getExamTitle(exam)}
                {exam.examDate ? ` — ${exam.examDate}` : ""}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!selectedExam && (
        <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 px-5 py-12 text-center">
          <h2 className="font-bold">ফলাফল দেখতে পরীক্ষা নির্বাচন করুন</h2>

          <p className="mt-2 text-sm text-base-content/60">
            বিভাগ ও পরীক্ষার ধরন বেছে নিলে পরীক্ষার তালিকা আসবে।
          </p>
        </div>
      )}

      {selectedExam && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-sm font-medium text-primary">
              {examType === "online" ? "অনলাইন পরীক্ষা" : "অফলাইন পরীক্ষা"}
            </p>

            <h2 className="mt-1 text-xl font-bold">
              {getExamTitle(selectedExam)}
            </h2>

            {selectedExam.examDate && (
              <p className="mt-2 text-sm text-base-content/60">
                পরীক্ষার তারিখ: {selectedExam.examDate}
              </p>
            )}
          </div>

          {resultLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm text-base-content/60">অংশগ্রহণ</p>

                  <p className="mt-1 text-2xl font-extrabold text-primary">
                    {rows.length}
                    <span className="text-base font-medium text-base-content/50">
                      {" "}
                      / {roster.length}
                    </span>
                  </p>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm text-base-content/60">অনুপস্থিত</p>

                  <p className="mt-1 text-2xl font-extrabold">
                    {absent.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm text-base-content/60">গড় নম্বর</p>

                  <p className="mt-1 text-2xl font-extrabold">
                    {stats ? formatNumber(stats.average) : "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm text-base-content/60">সর্বোচ্চ</p>

                  <p className="mt-1 text-2xl font-extrabold text-success">
                    {stats ? formatNumber(stats.highest) : "—"}
                  </p>
                </div>

                <div className="col-span-2 rounded-2xl border border-base-300 bg-base-100 p-4 lg:col-span-1">
                  <p className="text-sm text-base-content/60">সর্বনিম্ন</p>

                  <p className="mt-1 text-2xl font-extrabold text-error">
                    {stats ? formatNumber(stats.lowest) : "—"}
                  </p>
                </div>
              </div>

              {/* Results table */}
              <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 border-b border-base-300 p-4">
                  <h3 className="mr-auto font-bold">ফলাফলের তালিকা</h3>

                  <input
                    type="search"
                    className="input input-bordered input-sm w-full sm:w-56"
                    placeholder="নাম বা আইডি দিয়ে খোঁজো"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />

                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={showAbsent}
                      onChange={(event) => setShowAbsent(event.target.checked)}
                    />
                    অনুপস্থিত দেখাও
                  </label>

                  <button
                    type="button"
                    className="btn btn-outline btn-primary btn-sm"
                    onClick={exportCsv}
                    disabled={!rows.length && !absent.length}
                  >
                    CSV ডাউনলোড
                  </button>
                </div>

                {visibleRows.length === 0 && visibleAbsent.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="font-semibold">ফলাফল পাওয়া যায়নি</p>

                    <p className="mt-2 text-sm text-base-content/60">
                      {term
                        ? "এই নামে বা আইডিতে কোনো শিক্ষার্থী নেই।"
                        : "এই পরীক্ষার নম্বর এখনো প্রকাশ করা হয়নি অথবা কোনো ফলাফল জমা হয়নি।"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra">
                      <thead>
                        <tr>
                          <th>অবস্থান</th>
                          <th>শিক্ষার্থী</th>
                          <th>আইডি</th>
                          <th>ব্যাচ</th>
                          <th>প্রাপ্ত নম্বর</th>
                          <th>শতকরা</th>
                          {isAdmin && <th className="text-center">অ্যাকশন</th>}
                        </tr>
                      </thead>

                      <tbody>
                        {visibleRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <span className="badge badge-primary badge-outline">
                                {row.rank}
                              </span>
                            </td>

                            <td className="font-medium">{row.name}</td>

                            <td>{row.studentId || "—"}</td>

                            <td>{row.className}</td>

                            <td>
                              <span className="font-bold">
                                {formatNumber(row.score)}
                              </span>

                              <span className="text-base-content/50">
                                {" "}
                                / {row.total ? formatNumber(row.total) : "—"}
                              </span>
                            </td>

                            <td>{formatPercent(row.percent)}</td>

                            {isAdmin && (
                              <td>
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-success btn-xs sm:btn-sm"
                                    title="১ নম্বর বাড়ান"
                                    aria-label={`${row.name}-এর নম্বর ১ বাড়ান`}
                                    onClick={() => handleIncreaseMark(row)}
                                    disabled={
                                      updatingResultId === row.id ||
                                      deletingResultId === row.id
                                    }
                                  >
                                    {updatingResultId === row.id ? (
                                      <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                      <FaPlus />
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-error btn-xs sm:btn-sm"
                                    title="ফলাফল মুছুন"
                                    aria-label={`${row.name}-এর ফলাফল মুছুন`}
                                    onClick={() => handleDeleteResult(row)}
                                    disabled={
                                      deletingResultId === row.id ||
                                      updatingResultId === row.id
                                    }
                                  >
                                    {deletingResultId === row.id ? (
                                      <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                      <FaTrash />
                                    )}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}

                        {visibleAbsent.map((item) => (
                          <tr key={`absent-${item.id}`} className="opacity-70">
                            <td>
                              <span className="badge badge-warning badge-outline">
                                অনুপস্থিত
                              </span>
                            </td>

                            <td className="font-medium">{item.name}</td>

                            <td>{item.studentId || "—"}</td>

                            <td>{item.className}</td>

                            <td>—</td>

                            <td>—</td>

                            {isAdmin && <td />}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
