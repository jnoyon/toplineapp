import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { useOutletContext } from "react-router";
import toast from "react-hot-toast";

import {
  FiUsers,
  FiCalendar,
  FiCheckCircle,
  FiRefreshCw,
  FiSave,
} from "react-icons/fi";

import { db } from "../../firebase/firebase.init";
import { isAdmin } from "../../../config/permissions";
import { departments } from "../../../config/departments";

const DEFAULT_CLASS_TARGET = 20;
const MINIMUM_CLASSES_TO_CLOSE = 2;
const CARE_DEPARTMENT = departments.CARE;

// Convert English numbers to Bangla
const toBangla = (number) =>
  String(number).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[digit]);

// Get today's date in YYYY-MM-DD format
const todayString = () => {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

// Add days to a date
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

// Normalize names
const normalizeName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

// Generate month document ID
const getMonthDocumentId = (batchId, monthNumber) =>
  `${encodeURIComponent(String(batchId).trim())}_month_${monthNumber}`;

// Department helpers
const getDepartmentId = (record) =>
  String(record?.departmentId ?? record?.departmentID ?? "");

const getDepartmentName = (record) =>
  String(record?.departmentName ?? record?.department ?? "").trim();

// Batch helpers
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

// Attendance date
const getSessionDate = (session) =>
  String(
    session?.date ?? session?.sessionDate ?? session?.attendanceDate ?? "",
  ).slice(0, 10);

// Month name
const getMonthName = (monthNumber) => `মাস ${toBangla(monthNumber)}`;

// Student active status
const isStudentActive = (student) => {
  const status =
    student?.isActive ?? student?.active ?? student?.enabled ?? true;

  if (status === false || status === 0) return false;

  if (typeof status === "string") {
    return ![
      "false",
      "0",
      "inactive",
      "disabled",
      "blocked",
      "suspended",
    ].includes(status.trim().toLowerCase());
  }

  return true;
};

// CARE student check
const isCareStudent = (student) => {
  if (student?.isCare === true) return true;

  const departmentName = normalizeName(
    student?.departmentName ?? student?.department ?? "",
  );

  return (
    departmentName.includes("care") ||
    departmentName.includes(normalizeName(CARE_DEPARTMENT.name)) ||
    getDepartmentId(student) === String(CARE_DEPARTMENT.id)
  );
};

// CARE month check
const isCareMonth = (record) => {
  const departmentId = getDepartmentId(record);

  if (departmentId) {
    return departmentId === String(CARE_DEPARTMENT.id);
  }

  const departmentName = normalizeName(getDepartmentName(record));

  return (
    departmentName === normalizeName(CARE_DEPARTMENT.name) ||
    departmentName.includes("care")
  );
};

export default function BatchMonthlyManagement() {
  const outletContext = useOutletContext();
  const user = outletContext?.user ?? null;

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [monthRecords, setMonthRecords] = useState([]);
  const [students, setStudents] = useState([]);

  const [selectedBatchName, setSelectedBatchName] = useState("");
  const [initialStartDate, setInitialStartDate] = useState(todayString());
  const [targetInput, setTargetInput] = useState(String(DEFAULT_CLASS_TARGET));

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const hasAdminAccess = isAdmin(user?.email);

  const batches = useMemo(() => CARE_DEPARTMENT?.classes ?? [], []);

  // ----------------------------------------
  // Load Firestore data
  // ----------------------------------------

  useEffect(() => {
    if (!hasAdminAccess) {
      setLoading(false);
      return;
    }

    loadData();
  }, [hasAdminAccess]);

  useEffect(() => {
    if (!batches.length) {
      setSelectedBatchName("");
      return;
    }

    setSelectedBatchName((previous) =>
      batches.some(
        (batch) => normalizeName(batch.name) === normalizeName(previous),
      )
        ? previous
        : batches[0].name,
    );
  }, [batches]);

  async function loadData() {
    setLoading(true);

    try {
      const [attendanceSnapshot, monthSnapshot, studentSnapshot] =
        await Promise.all([
          getDocs(
            query(
              collection(db, "attendance"),
              where("departmentName", "==", CARE_DEPARTMENT.name),
            ),
          ),

          getDocs(collection(db, "batchMonthStates")),

          getDocs(collection(db, "students")),
        ]);

      setAttendanceRecords(
        attendanceSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
      );

      setMonthRecords(
        monthSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
      );

      setStudents(
        studentSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
      );
    } catch (error) {
      console.error("Batch monthly management error:", error);

      toast.error("তথ্য লোড করা যায়নি। Firestore permission পরীক্ষা করুন।");
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------
  // Selected batch
  // ----------------------------------------

  const selectedBatch = useMemo(
    () =>
      batches.find(
        (batch) =>
          normalizeName(batch.name) === normalizeName(selectedBatchName),
      ) ?? null,
    [batches, selectedBatchName],
  );

  const selectedBatchId = String(selectedBatch?.id ?? "").trim();

  // ----------------------------------------
  // Selected batch month records
  // ----------------------------------------

  const selectedMonthRecords = useMemo(() => {
    if (!selectedBatch) return [];

    return monthRecords
      .filter((item) => {
        if (!isCareMonth(item)) return false;

        const recordBatchId = getBatchId(item);

        // Prefer batchId; fallback to batchName for older records.
        if (recordBatchId && selectedBatchId) {
          return recordBatchId === selectedBatchId;
        }

        return (
          normalizeName(getBatchName(item)) ===
          normalizeName(selectedBatch.name)
        );
      })
      .sort((a, b) => Number(a.monthNumber ?? 0) - Number(b.monthNumber ?? 0));
  }, [monthRecords, selectedBatch, selectedBatchId]);

  const activeMonth = selectedMonthRecords.find(
    (item) => item.status === "active",
  );

  const latestMonth = selectedMonthRecords.at(-1);

  // ----------------------------------------
  // Active student count
  // ----------------------------------------

  const activeStudentCounts = useMemo(() => {
    const counts = {};

    batches.forEach((batch) => {
      counts[normalizeName(batch.name)] = 0;
    });

    students.forEach((student) => {
      if (!isStudentActive(student) || !isCareStudent(student)) {
        return;
      }

      const studentBatchName = normalizeName(getBatchName(student));

      if (studentBatchName in counts) {
        counts[studentBatchName] += 1;
      }
    });

    return counts;
  }, [students, batches]);

  const activeStudentCount = selectedBatch
    ? (activeStudentCounts[normalizeName(selectedBatch.name)] ?? 0)
    : 0;

  // ----------------------------------------
  // Target input
  // ----------------------------------------

  useEffect(() => {
    const target =
      activeMonth?.plannedClasses ??
      latestMonth?.plannedClasses ??
      DEFAULT_CLASS_TARGET;

    setTargetInput(String(target));
  }, [selectedBatchName, activeMonth?.id, latestMonth?.id]);

  // ----------------------------------------
  // Completed classes calculation
  // ----------------------------------------

  const completedClasses = useMemo(() => {
    if (!activeMonth || !selectedBatch) return 0;

    const uniqueDates = new Set();

    // Active month: count attendance up to today.
    // Closed month: count attendance up to its saved endDate.
    const periodEnd =
      activeMonth.status === "active"
        ? todayString()
        : String(activeMonth.endDate ?? "");

    attendanceRecords.forEach((record) => {
      const sameBatch =
        getBatchId(record) && selectedBatchId
          ? getBatchId(record) === selectedBatchId
          : normalizeName(getBatchName(record)) ===
            normalizeName(selectedBatch.name);

      const sameDepartment =
        getDepartmentId(record) === String(CARE_DEPARTMENT.id) ||
        normalizeName(getDepartmentName(record)) ===
          normalizeName(CARE_DEPARTMENT.name);

      const sessionDate = getSessionDate(record);

      const insidePeriod =
        sessionDate !== "" &&
        sessionDate >= String(activeMonth.startDate ?? "") &&
        sessionDate <= periodEnd;

      if (sameBatch && sameDepartment && insidePeriod) {
        uniqueDates.add(sessionDate);
      }
    });

    return uniqueDates.size;
  }, [activeMonth, attendanceRecords, selectedBatch, selectedBatchId]);

  // ----------------------------------------
  // Validation
  // ----------------------------------------

  function validateTarget() {
    if (!Number.isInteger(Number(targetInput)) || Number(targetInput) < 1) {
      toast.error("মোট ক্লাসের সংখ্যা ১ বা তার বেশি দিন.");
      return false;
    }

    return true;
  }

  function validateBatch() {
    if (!selectedBatch || !selectedBatchId) {
      toast.error(
        "ব্যাচের সঠিক ID পাওয়া যায়নি। departments.js পরীক্ষা করুন।",
      );

      return false;
    }

    return true;
  }

  // ----------------------------------------
  // Month payload
  // ----------------------------------------

  function getMonthPayload(monthNumber, startDate) {
    return {
      departmentId: String(CARE_DEPARTMENT.id),
      departmentName: CARE_DEPARTMENT.name,

      batchId: selectedBatchId,
      batchName: selectedBatch.name,

      monthNumber,

      startDate,

      // IMPORTANT:
      // No automatic end date.
      // It will be saved only when admin closes the month.
      endDate: null,

      status: "active",

      plannedClasses: Number(targetInput),

      createdAt: serverTimestamp(),
      createdBy: user?.uid ?? "",
    };
  }

  // ----------------------------------------
  // Start first month
  // ----------------------------------------

  async function startFirstMonth() {
    if (!validateBatch()) return;

    if (!initialStartDate) {
      toast.error("শুরুর তারিখ নির্বাচন করুন।");
      return;
    }

    if (!validateTarget()) return;

    if (latestMonth) {
      toast.error("এই ব্যাচের মাসের রেকর্ড ইতিমধ্যে রয়েছে।");
      return;
    }

    const confirmed = await Swal.fire({
      title: "প্রথম মাস শুরু করবেন?",
      text: `ব্যাচ: ${selectedBatch.name} | মোট ক্লাস: ${toBangla(targetInput)}`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "শুরু করুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: "#2C3E50",
    });

    if (!confirmed.isConfirmed) return;

    setProcessing(true);

    try {
      const monthRef = doc(
        db,
        "batchMonthStates",
        getMonthDocumentId(selectedBatchId, 1),
      );

      await setDoc(monthRef, getMonthPayload(1, initialStartDate));

      toast.success("প্রথম মাস শুরু হয়েছে।");

      await loadData();
    } catch (error) {
      console.error("Start first month error:", error);

      toast.error("মাস শুরু করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  // ----------------------------------------
  // Save class target
  // ----------------------------------------

  async function saveClassTarget() {
    if (!activeMonth) return;

    if (!validateTarget()) return;

    const confirmed = await Swal.fire({
      title: "মোট ক্লাস পরিবর্তন করবেন?",
      text: `নতুন লক্ষ্য: ${toBangla(targetInput)}টি ক্লাস`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "সংরক্ষণ করুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: "#2C3E50",
    });

    if (!confirmed.isConfirmed) return;

    setProcessing(true);

    try {
      await updateDoc(doc(db, "batchMonthStates", activeMonth.id), {
        plannedClasses: Number(targetInput),

        updatedAt: serverTimestamp(),
        updatedBy: user?.uid ?? "",
      });

      toast.success("মোট ক্লাসের লক্ষ্য আপডেট হয়েছে।");

      await loadData();
    } catch (error) {
      console.error("Update class target error:", error);

      toast.error("লক্ষ্য আপডেট করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  // ----------------------------------------
  // Close current month manually
  // ----------------------------------------

  async function closeCurrentMonth() {
    if (!activeMonth) return;

    if (completedClasses < MINIMUM_CLASSES_TO_CLOSE) {
      toast.error(
        `মাস বন্ধ করতে কমপক্ষে ${toBangla(
          MINIMUM_CLASSES_TO_CLOSE,
        )}টি ক্লাসের উপস্থিতি জমা দিতে হবে।`,
      );

      return;
    }

    const target = Number(activeMonth.plannedClasses) || DEFAULT_CLASS_TARGET;

    const cancelledClasses = Math.max(0, target - completedClasses);

    // Manual closing date
    const closingDate = todayString();

    const confirmation = await Swal.fire({
      title: "মাস বন্ধ করবেন?",

      html: `
        <div style="text-align:left">
          <p>ব্যাচ: <strong>${selectedBatch?.name ?? ""}</strong></p>

          <p>
            মাস:
            <strong>${getMonthName(activeMonth.monthNumber)}</strong>
          </p>

          <p>
            শুরুর তারিখ:
            <strong>${activeMonth.startDate}</strong>
          </p>

          <p>
            শেষের তারিখ:
            <strong>${closingDate}</strong>
          </p>

          <p>
            মোট ক্লাসের লক্ষ্য:
            <strong>${toBangla(target)}</strong>
          </p>

          <p>
            সম্পন্ন ক্লাস:
            <strong>${toBangla(completedClasses)}</strong>
          </p>

          <p>
            বাকি ক্লাস:
            <strong>${toBangla(cancelledClasses)}</strong>
          </p>

          <p style="color:#dc2626;margin-top:12px">
            মাস বন্ধ করার পর এই মাসের হিসাব আর পরিবর্তন করা উচিত নয়।
          </p>
        </div>
      `,

      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, মাস বন্ধ করুন",
      cancelButtonText: "ফিরে যান",
      confirmButtonColor: "#dc2626",
    });

    if (!confirmation.isConfirmed) return;

    setProcessing(true);

    try {
      await updateDoc(doc(db, "batchMonthStates", activeMonth.id), {
        status: "closed",

        // Save endDate only when admin manually closes.
        endDate: closingDate,

        closedDate: closingDate,

        completedClasses,
        cancelledClasses,

        closedAt: serverTimestamp(),
        closedBy: user?.uid ?? "",
      });

      toast.success("মাস সফলভাবে বন্ধ হয়েছে।");

      await loadData();
    } catch (error) {
      console.error("Close month error:", error);

      toast.error("মাস বন্ধ করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  // ----------------------------------------
  // Start next month
  // ----------------------------------------

  async function startNextMonth() {
    if (!validateBatch()) return;

    if (!latestMonth || latestMonth.status !== "closed") {
      toast.error("আগের মাস বন্ধ করার পর নতুন মাস শুরু করুন.");

      return;
    }

    if (!validateTarget()) return;

    const nextMonthNumber = Number(latestMonth.monthNumber) + 1;

    // Next month starts one day after previous closing date.
    const previousEndDate = latestMonth.closedDate || latestMonth.endDate;

    if (!previousEndDate) {
      toast.error("আগের মাসের শেষের তারিখ পাওয়া যায়নি।");

      return;
    }

    const nextStartDate = addDays(previousEndDate, 1);

    const confirmation = await Swal.fire({
      title: "পরের মাস শুরু করবেন?",

      html: `
        <p>ব্যাচ: <strong>${selectedBatch?.name ?? ""}</strong></p>

        <p>
          মাস:
          <strong>${getMonthName(nextMonthNumber)}</strong>
        </p>

        <p>
          মোট ক্লাস:
          <strong>${toBangla(targetInput)}</strong>
        </p>

        <p>
          শুরুর তারিখ:
          <strong>${nextStartDate}</strong>
        </p>
      `,

      icon: "question",
      showCancelButton: true,
      confirmButtonText: "পরের মাস শুরু করুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: "#2C3E50",
    });

    if (!confirmation.isConfirmed) return;

    setProcessing(true);

    try {
      const monthRef = doc(
        db,
        "batchMonthStates",
        getMonthDocumentId(selectedBatchId, nextMonthNumber),
      );

      await setDoc(monthRef, getMonthPayload(nextMonthNumber, nextStartDate));

      toast.success(`${getMonthName(nextMonthNumber)} শুরু হয়েছে।`);

      await loadData();
    } catch (error) {
      console.error("Start next month error:", error);

      toast.error("পরের মাস শুরু করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  // ----------------------------------------
  // Permission check
  // ----------------------------------------

  if (!hasAdminAccess) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="alert alert-error">
          এই পেজটি ব্যবহারের অনুমতি আপনার নেই।
        </div>
      </div>
    );
  }

  // ----------------------------------------
  // Loading
  // ----------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-60 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <span className="loading loading-spinner loading-lg text-[#E57373]" />
      </div>
    );
  }

  // ----------------------------------------
  // UI
  // ----------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Batch selection */}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label
              htmlFor="batch-select"
              className="text-sm font-bold text-slate-700 dark:text-slate-200"
            >
              ব্যাচ
            </label>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <FiUsers size={14} />
              সক্রিয় শিক্ষার্থী: {toBangla(activeStudentCount)}
            </span>
          </div>

          <select
            id="batch-select"
            className="select select-bordered mt-3 w-full border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            value={selectedBatchName}
            onChange={(event) => setSelectedBatchName(event.target.value)}
          >
            {batches.length === 0 && (
              <option value="">কোনো ব্যাচ কনফিগার করা নেই</option>
            )}

            {batches.map((batch) => (
              <option key={batch.id} value={batch.name}>
                {batch.name} (
                {toBangla(activeStudentCounts[normalizeName(batch.name)] ?? 0)}{" "}
                জন)
              </option>
            ))}
          </select>
        </section>

        {/* No batch selected */}

        {!selectedBatch ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            departments.js-এর CARE বিভাগে ব্যাচ যোগ করুন।
          </section>
        ) : !latestMonth ? (
          /* First month setup */

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                <span className="mb-1.5 block">শুরুর তারিখ</span>

                <input
                  type="date"
                  className="input input-bordered w-full bg-white dark:bg-slate-800"
                  value={initialStartDate}
                  onChange={(event) => setInitialStartDate(event.target.value)}
                />
              </label>

              <label className="text-sm font-semibold">
                <span className="mb-1.5 block">মোট ক্লাসের লক্ষ্য</span>

                <input
                  type="number"
                  min="1"
                  step="1"
                  className="input input-bordered w-full bg-white dark:bg-slate-800"
                  value={targetInput}
                  onChange={(event) => setTargetInput(event.target.value)}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={startFirstMonth}
              disabled={processing}
              className="btn mt-4 w-full border-0 bg-[#2C3E50] text-white hover:bg-[#1f2d3a] sm:w-auto"
            >
              {processing ? (
                <FiRefreshCw className="animate-spin" />
              ) : (
                <FiCalendar />
              )}
              প্রথম মাস শুরু করুন
            </button>
          </section>
        ) : (
          <>
            {/* Month overview */}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[#2C3E50] dark:text-white">
                    {selectedBatch.name}
                  </h2>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {getMonthName(
                      activeMonth?.monthNumber ?? latestMonth.monthNumber,
                    )}{" "}
                    · {activeMonth ? "চলমান মাস" : "মাস বন্ধ"}
                  </p>
                </div>

                <span
                  className={`badge ${
                    activeMonth ? "badge-success" : "badge-neutral"
                  } badge-md`}
                >
                  {activeMonth ? "চালু" : "বন্ধ"}
                </span>
              </div>

              {/* Statistics */}

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    সম্পন্ন ক্লাস
                  </p>

                  <p className="mt-1 text-2xl font-black text-[#2C3E50] dark:text-white">
                    {toBangla(
                      activeMonth
                        ? completedClasses
                        : (latestMonth.completedClasses ?? 0),
                    )}

                    <span className="text-sm font-semibold text-slate-400">
                      {" "}
                      /{" "}
                      {toBangla(
                        activeMonth
                          ? (activeMonth.plannedClasses ?? DEFAULT_CLASS_TARGET)
                          : (latestMonth.plannedClasses ??
                              DEFAULT_CLASS_TARGET),
                      )}
                    </span>
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    বাকি ক্লাস
                  </p>

                  <p className="mt-1 text-2xl font-black text-[#2C3E50] dark:text-white">
                    {toBangla(
                      activeMonth
                        ? Math.max(
                            0,
                            (Number(activeMonth.plannedClasses) ||
                              DEFAULT_CLASS_TARGET) - completedClasses,
                          )
                        : (latestMonth.cancelledClasses ?? 0),
                    )}
                  </p>
                </div>

                <div className="col-span-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70 sm:col-span-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    সক্রিয় শিক্ষার্থী
                  </p>

                  <p className="mt-1 flex items-center gap-2 text-2xl font-black text-[#2C3E50] dark:text-white">
                    <FiUsers className="text-[#E57373]" size={20} />

                    {toBangla(activeStudentCount)}
                  </p>
                </div>
              </div>

              {/* Active month controls */}

              {activeMonth && (
                <>
                  <div className="mt-4 flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      মোট ক্লাসের লক্ষ্য
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="input input-bordered input-sm mt-1 w-full bg-white dark:bg-slate-800"
                        value={targetInput}
                        onChange={(event) => setTargetInput(event.target.value)}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={saveClassTarget}
                      disabled={
                        processing ||
                        !Number.isInteger(Number(targetInput)) ||
                        Number(targetInput) < 1 ||
                        Number(targetInput) ===
                          Number(activeMonth.plannedClasses)
                      }
                      className="btn btn-sm border-0 bg-[#2C3E50] text-white hover:bg-[#1f2d3a]"
                    >
                      <FiSave size={15} />
                      সংরক্ষণ
                    </button>
                  </div>

                  {/* Progress bar */}

                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#E57373] to-[#E74C3C] transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (completedClasses /
                            (Number(activeMonth.plannedClasses) ||
                              DEFAULT_CLASS_TARGET)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>

                  {/* Date and progress information */}

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <FiCalendar size={13} />

                      {activeMonth.startDate}

                      {" – "}

                      {activeMonth.endDate || "চলমান"}
                    </span>

                    <span>
                      {toBangla(
                        Math.round(
                          (completedClasses /
                            (Number(activeMonth.plannedClasses) ||
                              DEFAULT_CLASS_TARGET)) *
                            100,
                        ),
                      )}
                      % সম্পন্ন
                    </span>
                  </div>

                  {/* Close month button */}

                  <button
                    type="button"
                    onClick={closeCurrentMonth}
                    disabled={
                      processing || completedClasses < MINIMUM_CLASSES_TO_CLOSE
                    }
                    className="btn btn-error btn-sm mt-4 w-full text-white sm:w-auto"
                  >
                    {processing ? (
                      <FiRefreshCw className="animate-spin" />
                    ) : (
                      <FiCheckCircle size={15} />
                    )}
                    মাস বন্ধ করুন
                  </button>
                </>
              )}

              {/* Next month controls */}

              {!activeMonth && (
                <div className="mt-4">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                    <p>আগের মাস শুরু: {latestMonth.startDate}</p>

                    <p className="mt-1">
                      আগের মাস শেষ:{" "}
                      {latestMonth.endDate ||
                        latestMonth.closedDate ||
                        "তারিখ পাওয়া যায়নি"}
                    </p>
                  </div>

                  <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    পরের মাসের মোট ক্লাসের লক্ষ্য
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="input input-bordered input-sm mt-1 w-full bg-white dark:bg-slate-800"
                      value={targetInput}
                      onChange={(event) => setTargetInput(event.target.value)}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={startNextMonth}
                    disabled={
                      processing ||
                      !Number.isInteger(Number(targetInput)) ||
                      Number(targetInput) < 1
                    }
                    className="btn btn-sm mt-3 w-full border-0 bg-[#2C3E50] text-white hover:bg-[#1f2d3a] sm:w-auto"
                  >
                    {processing ? (
                      <FiRefreshCw className="animate-spin" />
                    ) : (
                      <FiCalendar size={15} />
                    )}
                    পরের মাস শুরু করুন
                  </button>
                </div>
              )}
            </section>

            {/* Month history */}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <h3 className="text-sm font-extrabold text-[#2C3E50] dark:text-white">
                  মাসের ইতিহাস
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 dark:text-slate-400">
                      <th>মাস ও তারিখ</th>

                      <th>মোট ক্লাস</th>

                      <th>সম্পন্ন</th>

                      <th>বাকি</th>

                      <th>অবস্থা</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedMonthRecords.map((month) => {
                      const isCurrentActiveMonth = month.id === activeMonth?.id;

                      const target =
                        Number(month.plannedClasses) || DEFAULT_CLASS_TARGET;

                      const completed =
                        month.status === "closed"
                          ? (month.completedClasses ?? 0)
                          : isCurrentActiveMonth
                            ? completedClasses
                            : 0;

                      return (
                        <tr key={month.id}>
                          <td>
                            <p className="font-semibold">
                              {getMonthName(month.monthNumber)}
                            </p>

                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              {month.startDate}

                              {" – "}

                              {month.endDate || "চলমান"}
                            </p>
                          </td>

                          <td>{toBangla(target)}</td>

                          <td>
                            {month.status === "closed" || isCurrentActiveMonth
                              ? toBangla(completed)
                              : "—"}
                          </td>

                          <td>
                            {month.status === "closed"
                              ? toBangla(month.cancelledClasses ?? 0)
                              : isCurrentActiveMonth
                                ? toBangla(
                                    Math.max(0, target - completedClasses),
                                  )
                                : "—"}
                          </td>

                          <td>
                            <span
                              className={`badge badge-sm ${
                                month.status === "closed"
                                  ? "badge-neutral"
                                  : "badge-success"
                              }`}
                            >
                              {month.status === "closed" ? "বন্ধ" : "চালু"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
