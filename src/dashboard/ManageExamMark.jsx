import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { app } from "../assets/firebase/firebase.init";
import { departmentList } from "../config/departments";

import toast from "react-hot-toast";
import Swal from "sweetalert2";

const db = getFirestore(app);

const normalizeId = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const normalizeDepartmentId = (value) => {
  const normalized = normalizeId(value);

  if (!normalized) return "";

  return !Number.isNaN(Number(normalized))
    ? String(Number(normalized))
    : normalized;
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

const getErrorMessage = (error) => {
  if (error?.code === "permission-denied") {
    return "এই কাজের অনুমতি নেই। Firestore Rules যাচাই করুন।";
  }

  return "কাজটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।";
};

export default function ManageExamMark() {
  const [departmentId, setDepartmentId] = useState("");
  const [classId, setClassId] = useState("");
  const [examId, setExamId] = useState("");
  const [search, setSearch] = useState("");

  const [exams, setExams] = useState([]);
  const [examMarks, setExamMarks] = useState([]);

  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editingId, setEditingId] = useState("");
  const [editingMark, setEditingMark] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState("");

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

  // Load exams using the same department/class filters as AddExamMark.
  const loadExams = useCallback(async () => {
    if (!departmentId || !classId) {
      setExams([]);
      setExamId("");
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

          const examClassId = normalizeId(exam.classId || exam.batchId);

          // Match department and class/batch.
          // Do not filter by classType.
          return sameDepartment && examClassId === normalizeId(classId);
        })
        .sort((a, b) =>
          String(b.examDate || "").localeCompare(String(a.examDate || "")),
        );

      setExams(filteredExams);

      // Reset the selected exam only if it no longer exists.
      setExamId((currentId) =>
        filteredExams.some((exam) => exam.id === currentId) ? currentId : "",
      );
    } catch (error) {
      console.error("Load syllabus exams error:", error);
      toast.error(getErrorMessage(error));
      setExams([]);
      setExamId("");
    } finally {
      setLoadingExams(false);
    }
  }, [departmentId, classId]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Load marks for the selected exam.
  const loadMarks = useCallback(async () => {
    if (!examId) {
      setExamMarks([]);
      return;
    }

    setLoadingMarks(true);

    try {
      const snapshot = await getDocs(collection(db, "examMarks"));

      const filteredMarks = snapshot.docs
        .map((markDoc) => ({
          id: markDoc.id,
          ...markDoc.data(),
        }))
        .filter((mark) => mark.examId === examId)
        .sort((a, b) =>
          String(a.studentId || "").localeCompare(
            String(b.studentId || ""),
            undefined,
            { numeric: true },
          ),
        );

      setExamMarks(filteredMarks);
    } catch (error) {
      console.error("Load exam marks error:", error);
      toast.error(getErrorMessage(error));
      setExamMarks([]);
    } finally {
      setLoadingMarks(false);
    }
  }, [examId]);

  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  const handleDepartmentChange = (value) => {
    setDepartmentId(value);
    setClassId("");
    setExamId("");
    setSearch("");
    setExamMarks([]);
    setEditingId("");
  };

  const handleClassChange = (value) => {
    setClassId(value);
    setExamId("");
    setSearch("");
    setExamMarks([]);
    setEditingId("");
  };

  const handleExamChange = (value) => {
    setExamId(value);
    setSearch("");
    setEditingId("");
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await loadExams();

      if (examId) {
        await loadMarks();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const filteredMarks = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return examMarks;

    return examMarks.filter((mark) => {
      const name = String(mark.studentName || "").toLowerCase();
      const studentId = String(mark.studentId || "").toLowerCase();

      return name.includes(query) || studentId.includes(query);
    });
  }, [examMarks, search]);

  const enteredTotal = useMemo(
    () =>
      examMarks.reduce(
        (sum, mark) => sum + (Number(mark.obtainedMark) || 0),
        0,
      ),
    [examMarks],
  );

  const averageMark = examMarks.length ? enteredTotal / examMarks.length : 0;

  const startEditing = (mark) => {
    setEditingId(mark.id);
    setEditingMark(String(mark.obtainedMark ?? ""));
  };

  const cancelEditing = () => {
    setEditingId("");
    setEditingMark("");
  };

  const handleUpdateMark = async (mark) => {
    if (!selectedExam) {
      toast.error("পরীক্ষা নির্বাচন করুন।");
      return;
    }

    if (String(editingMark).trim() === "") {
      toast.error("প্রাপ্ত নম্বর লিখুন।");
      return;
    }

    const value = Number(editingMark);

    if (!Number.isFinite(value) || value < 0 || value > totalMark) {
      toast.error(`প্রাপ্ত নম্বর ০ থেকে ${totalMark}-এর মধ্যে হতে হবে।`);
      return;
    }

    setSavingEdit(true);

    try {
      await updateDoc(doc(db, "examMarks", mark.id), {
        obtainedMark: value,
        totalMark,
        updatedAt: serverTimestamp(),
      });

      setExamMarks((previous) =>
        previous.map((item) =>
          item.id === mark.id
            ? {
                ...item,
                obtainedMark: value,
                totalMark,
              }
            : item,
        ),
      );

      toast.success("প্রাপ্ত নম্বর আপডেট হয়েছে।");
      cancelEditing();
    } catch (error) {
      console.error("Update exam mark error:", error);
      toast.error(getErrorMessage(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMark = async (mark) => {
    const result = await Swal.fire({
      title: "নম্বর মুছে ফেলবেন?",
      text: `${mark.studentName || "এই শিক্ষার্থী"}-এর পরীক্ষার নম্বর মুছে যাবে।`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, মুছুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: "#dc2626",
      reverseButtons: true,
      background:
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "#1d232a"
          : "#ffffff",
      color:
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "#a6adbb"
          : "#1f2937",
    });

    if (!result.isConfirmed) return;

    setDeletingId(mark.id);

    try {
      await deleteDoc(doc(db, "examMarks", mark.id));

      setExamMarks((previous) =>
        previous.filter((item) => item.id !== mark.id),
      );

      if (editingId === mark.id) {
        cancelEditing();
      }

      toast.success("নম্বরের রেকর্ড মুছে ফেলা হয়েছে।");
    } catch (error) {
      console.error("Delete exam mark error:", error);
      toast.error(getErrorMessage(error));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="min-h-screen bg-base-200/50 px-3 py-5 text-base-content sm:px-5 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Examination Management
            </p>

            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              পরীক্ষার নম্বর ব্যবস্থাপনা
            </h1>

            <p className="mt-1 text-sm text-base-content/60">
              শিক্ষার্থীদের নম্বর দেখুন, সম্পাদনা করুন অথবা মুছে ফেলুন।
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleRefresh}
            disabled={refreshing || loadingExams || loadingMarks}
          >
            {refreshing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span aria-hidden="true">↻</span>
            )}
            রিফ্রেশ
          </button>
        </div>

        {/* Filters */}
        <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h2 className="font-bold">পরীক্ষা নির্বাচন</h2>
            <p className="mt-1 text-xs text-base-content/60">
              বিভাগ, শ্রেণি/ব্যাচ ও পরীক্ষা নির্বাচন করে নম্বর দেখুন।
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">বিভাগ</span>

              <select
                className="select select-bordered w-full"
                value={departmentId}
                onChange={(event) => handleDepartmentChange(event.target.value)}
              >
                <option value="">বিভাগ নির্বাচন করুন</option>

                {departmentList.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">
                {isCare ? "ব্যাচ" : "শ্রেণি"}
              </span>

              <select
                className="select select-bordered w-full"
                value={classId}
                onChange={(event) => handleClassChange(event.target.value)}
                disabled={!departmentId}
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

            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">পরীক্ষা</span>

              <select
                className="select select-bordered w-full"
                value={examId}
                onChange={(event) => handleExamChange(event.target.value)}
                disabled={!classId || loadingExams}
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
              </span>
            </div>
          )}
        </section>

        {/* Selected exam summary */}
        {selectedExam && (
          <section className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-content shadow-sm">
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

              <div className="grid grid-cols-2 gap-2 sm:min-w-64">
                <div className="rounded-xl bg-black/10 p-3">
                  <p className="text-xs opacity-80">পূর্ণমান</p>
                  <p className="mt-1 text-2xl font-extrabold">{totalMark}</p>
                </div>

                <div className="rounded-xl bg-black/10 p-3">
                  <p className="text-xs opacity-80">রেকর্ড</p>
                  <p className="mt-1 text-2xl font-extrabold">
                    {examMarks.length}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Statistics */}
        {selectedExam && examMarks.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <p className="text-xs text-base-content/60">
                সর্বোচ্চ প্রাপ্ত নম্বর
              </p>

              <p className="mt-1 text-2xl font-bold text-success">
                {Math.max(
                  ...examMarks.map((mark) => Number(mark.obtainedMark) || 0),
                )}
              </p>
            </div>

            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <p className="text-xs text-base-content/60">গড় নম্বর</p>

              <p className="mt-1 text-2xl font-bold text-primary">
                {averageMark.toLocaleString("bn-BD", {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            <div className="col-span-2 rounded-xl border border-base-300 bg-base-100 p-4 lg:col-span-1">
              <p className="text-xs text-base-content/60">মোট প্রাপ্ত নম্বর</p>

              <p className="mt-1 text-2xl font-bold">
                {enteredTotal.toLocaleString("bn-BD")}
              </p>
            </div>
          </div>
        )}

        {/* Marks table */}
        {selectedExam && (
          <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-bold">শিক্ষার্থীদের নম্বর</h2>
                <p className="mt-1 text-xs text-base-content/60">
                  পূর্ণমান {totalMark}। সম্পাদনা করতে Edit বাটনে ক্লিক করুন।
                </p>
              </div>

              <label className="input input-bordered input-sm flex w-full items-center gap-2 sm:max-w-xs">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4 opacity-50"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>

                <input
                  type="search"
                  placeholder="নাম বা Student ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="grow"
                />
              </label>
            </div>

            {loadingMarks ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="skeleton h-14 w-full" />
                ))}
              </div>
            ) : examMarks.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-base-200 text-2xl">
                  ∅
                </div>

                <h3 className="mt-3 font-semibold">কোনো নম্বরের রেকর্ড নেই</h3>

                <p className="mt-1 text-sm text-base-content/60">
                  AddExamMark.jsx থেকে এই পরীক্ষার নম্বর সংরক্ষণ করুন।
                </p>
              </div>
            ) : filteredMarks.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-base-content/60">
                আপনার অনুসন্ধানের সঙ্গে মিলে এমন কোনো শিক্ষার্থী নেই।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm sm:table-md">
                  <thead>
                    <tr className="bg-base-200/70 text-base-content/70">
                      <th className="w-14">ক্রম</th>
                      <th>শিক্ষার্থীর নাম</th>
                      <th>Student ID</th>
                      <th>প্রাপ্ত নম্বর</th>
                      <th>ফলাফল</th>
                      <th className="text-right">অ্যাকশন</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredMarks.map((mark, index) => {
                      const obtainedMark = Number(mark.obtainedMark) || 0;
                      const percentage =
                        totalMark > 0 ? (obtainedMark / totalMark) * 100 : 0;

                      const isEditing = editingId === mark.id;
                      const isDeleting = deletingId === mark.id;

                      return (
                        <tr key={mark.id} className="hover:bg-base-200/50">
                          <td className="text-base-content/50">{index + 1}</td>

                          <td>
                            <div className="font-medium">
                              {mark.studentName || "নাম নেই"}
                            </div>
                          </td>

                          <td>
                            <span className="font-mono text-xs sm:text-sm">
                              {mark.studentId || "—"}
                            </span>
                          </td>

                          <td>
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={totalMark}
                                  step="any"
                                  inputMode="decimal"
                                  value={editingMark}
                                  onChange={(event) =>
                                    setEditingMark(event.target.value)
                                  }
                                  className="input input-bordered input-sm w-24"
                                  aria-label="প্রাপ্ত নম্বর সম্পাদনা"
                                  disabled={savingEdit}
                                  autoFocus
                                />

                                <span className="text-xs text-base-content/50">
                                  / {totalMark}
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="font-bold">
                                  {obtainedMark.toLocaleString("bn-BD")}
                                </span>

                                <span className="ml-1 text-xs text-base-content/50">
                                  / {totalMark}
                                </span>
                              </div>
                            )}
                          </td>

                          <td>
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`badge badge-sm ${
                                  percentage >= 80
                                    ? "badge-success"
                                    : percentage >= 40
                                      ? "badge-info"
                                      : "badge-error"
                                }`}
                              >
                                {percentage.toLocaleString("bn-BD", {
                                  maximumFractionDigits: 1,
                                })}
                                %
                              </span>

                              <progress
                                className={`progress w-20 ${
                                  percentage >= 80
                                    ? "progress-success"
                                    : percentage >= 40
                                      ? "progress-info"
                                      : "progress-error"
                                }`}
                                value={Math.min(100, Math.max(0, percentage))}
                                max="100"
                              />
                            </div>
                          </td>

                          <td>
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-xs sm:btn-sm"
                                    onClick={() => handleUpdateMark(mark)}
                                    disabled={savingEdit || isDeleting}
                                  >
                                    {savingEdit ? (
                                      <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                      "সেভ"
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs sm:btn-sm"
                                    onClick={cancelEditing}
                                    disabled={savingEdit}
                                  >
                                    বাতিল
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-primary btn-xs sm:btn-sm"
                                    onClick={() => startEditing(mark)}
                                    disabled={isDeleting || savingEdit}
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-outline btn-error btn-xs sm:btn-sm"
                                    onClick={() => handleDeleteMark(mark)}
                                    disabled={isDeleting || savingEdit}
                                  >
                                    {isDeleting ? (
                                      <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                      "Delete"
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {examMarks.length > 0 && (
              <div className="border-t border-base-300 bg-base-200/40 px-4 py-3 text-xs text-base-content/60 sm:px-5">
                {filteredMarks.length} / {examMarks.length}টি রেকর্ড দেখানো
                হচ্ছে।
              </div>
            )}
          </section>
        )}

        {!selectedExam && (
          <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 px-4 py-12 text-center">
            <h3 className="font-semibold">একটি পরীক্ষা নির্বাচন করুন</h3>

            <p className="mt-1 text-sm text-base-content/60">
              নির্বাচিত পরীক্ষার সংরক্ষিত নম্বর এখানে দেখা যাবে।
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
