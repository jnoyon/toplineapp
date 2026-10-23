import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useOutletContext } from "react-router";
import toast from "react-hot-toast";
import { db } from "../../firebase/firebase.init";
import { isAdmin } from "../../../config/permissions";

const CARE_DEPARTMENT_ID = "3";
const MONTHLY_CLASS_TARGET = 20;
const MINIMUM_CLASSES_TO_CLOSE = 5;

const normalizeId = (value) => {
  const text = String(value ?? "").trim();

  if (!text) return "";

  return /^\d+$/.test(text) ? String(Number(text)) : text;
};

const todayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00`);

  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getMonthEnd = (startDate) => {
  const date = new Date(`${startDate}T12:00:00`);

  date.setMonth(date.getMonth() + 1);
  date.setDate(0);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getMonthDocumentId = (batchId, monthNumber) =>
  `${batchId}_month_${monthNumber}`;

export default function BatchMonthlyManagement() {
  const outletContext = useOutletContext();
  const user = outletContext?.user ?? null;

  const [batches, setBatches] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [monthRecords, setMonthRecords] = useState([]);

  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [initialStartDate, setInitialStartDate] = useState(todayString());

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const hasAdminAccess = isAdmin(user?.email);

  useEffect(() => {
    if (!hasAdminAccess) {
      setLoading(false);
      return;
    }

    loadData();
  }, [hasAdminAccess]);

  async function loadData() {
    setLoading(true);

    try {
      const [classSnapshot, sessionSnapshot, monthSnapshot] = await Promise.all(
        [
          getDocs(collection(db, "classes")),
          getDocs(collection(db, "attendanceSessions")),
          getDocs(collection(db, "batchMonthStates")),
        ],
      );

      const batchList = classSnapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((item) => {
          const departmentId = normalizeId(item.departmentId);

          return (
            departmentId === CARE_DEPARTMENT_ID &&
            item.type === "batch" &&
            item.isActive !== false
          );
        })
        .sort((a, b) =>
          String(a.className ?? "").localeCompare(String(b.className ?? "")),
        );

      setBatches(batchList);

      setSessions(
        sessionSnapshot.docs.map((item) => ({
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

      setSelectedBatchId((previous) => {
        if (batchList.some((batch) => batch.id === previous)) {
          return previous;
        }

        return batchList[0]?.id ?? "";
      });
    } catch (error) {
      console.error("Batch monthly management error:", error);

      toast.error("তথ্য লোড করা যায়নি। Firestore Security Rules পরীক্ষা করুন।");
    } finally {
      setLoading(false);
    }
  }

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);

  const selectedMonthRecords = useMemo(() => {
    return monthRecords
      .filter((item) => item.batchId === selectedBatchId)
      .sort((a, b) => Number(a.monthNumber ?? 0) - Number(b.monthNumber ?? 0));
  }, [monthRecords, selectedBatchId]);

  const activeMonth = selectedMonthRecords.find(
    (item) => item.status === "active",
  );

  const latestMonth = selectedMonthRecords.at(-1);

  const completedClasses = useMemo(() => {
    if (!activeMonth) return 0;

    const uniqueSessionIds = new Set();

    sessions.forEach((session) => {
      const sameBatch = String(session.classId ?? "") === selectedBatchId;

      const sameDepartment =
        normalizeId(session.departmentId) === CARE_DEPARTMENT_ID;

      const insidePeriod =
        String(session.date ?? "") >= activeMonth.startDate &&
        String(session.date ?? "") <= activeMonth.endDate;

      if (sameBatch && sameDepartment && insidePeriod) {
        uniqueSessionIds.add(session.id);
      }
    });

    return uniqueSessionIds.size;
  }, [activeMonth, sessions, selectedBatchId]);

  async function startFirstMonth() {
    if (!selectedBatchId || !initialStartDate) {
      toast.error("ব্যাচ ও শুরুর তারিখ নির্বাচন করুন।");
      return;
    }

    if (latestMonth) {
      toast.error("এই ব্যাচের মাসের রেকর্ড ইতিমধ্যে রয়েছে।");
      return;
    }

    const confirmed = await Swal.fire({
      title: "প্রথম মাস শুরু করবেন?",
      text: `শুরুর তারিখ: ${initialStartDate}`,
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

      await setDoc(monthRef, {
        departmentId: CARE_DEPARTMENT_ID,
        batchId: selectedBatchId,
        batchName: selectedBatch?.className ?? "",
        monthNumber: 1,
        startDate: initialStartDate,
        endDate: getMonthEnd(initialStartDate),
        status: "active",
        plannedClasses: MONTHLY_CLASS_TARGET,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "",
      });

      toast.success("প্রথম মাস শুরু হয়েছে।");
      await loadData();
    } catch (error) {
      console.error("Start first month error:", error);
      toast.error("মাস শুরু করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  async function closeCurrentMonth() {
    if (!activeMonth) return;

    if (completedClasses < MINIMUM_CLASSES_TO_CLOSE) {
      toast.error(
        `মাস বন্ধ করতে কমপক্ষে ${MINIMUM_CLASSES_TO_CLOSE}টি ক্লাসের উপস্থিতি জমা দিতে হবে।`,
      );
      return;
    }

    const cancelledClasses = Math.max(
      0,
      MONTHLY_CLASS_TARGET - completedClasses,
    );

    const confirmation = await Swal.fire({
      title: "মাস বন্ধ করবেন?",
      html: `
        <div style="text-align:left">
          <p>ব্যাচ: <strong>${selectedBatch?.className ?? ""}</strong></p>
          <p>মাস: <strong>${activeMonth.monthNumber}</strong></p>
          <p>সম্পন্ন ক্লাস: <strong>${completedClasses}</strong></p>
          <p>বাতিল হওয়া বাকি ক্লাস: <strong>${cancelledClasses}</strong></p>
          <p style="color:#dc2626;margin-top:12px">
            মাস বন্ধ করার পর এই মাসে নতুন উপস্থিতি যোগ করা বন্ধ করতে হবে।
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
      const monthRef = doc(db, "batchMonthStates", activeMonth.id);

      await updateDoc(monthRef, {
        status: "closed",
        closedDate: todayString(),
        completedClasses,
        cancelledClasses,
        closedAt: serverTimestamp(),
        closedBy: user?.uid ?? "",
      });

      toast.success("মাস সফলভাবে বন্ধ হয়েছে।");
      await loadData();
    } catch (error) {
      console.error("Close month error:", error);
      toast.error("মাস বন্ধ করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  async function startNextMonth() {
    if (!latestMonth || latestMonth.status !== "closed") {
      toast.error("আগের মাস বন্ধ করার পর নতুন মাস শুরু করুন।");
      return;
    }

    const nextMonthNumber = Number(latestMonth.monthNumber) + 1;
    const nextStartDate = addDays(latestMonth.closedDate, 1);

    const confirmation = await Swal.fire({
      title: "পরের মাস শুরু করবেন?",
      html: `
        <p>মাস: <strong>${nextMonthNumber}</strong></p>
        <p>শুরুর তারিখ: <strong>${nextStartDate}</strong></p>
        <p style="margin-top:10px">নতুন মাসের ক্লাসের হিসাব শূন্য থেকে শুরু হবে।</p>
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

      await setDoc(monthRef, {
        departmentId: CARE_DEPARTMENT_ID,
        batchId: selectedBatchId,
        batchName: selectedBatch?.className ?? "",
        monthNumber: nextMonthNumber,
        startDate: nextStartDate,
        endDate: getMonthEnd(nextStartDate),
        status: "active",
        plannedClasses: MONTHLY_CLASS_TARGET,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "",
      });

      toast.success(`মাস ${nextMonthNumber} শুরু হয়েছে।`);
      await loadData();
    } catch (error) {
      console.error("Start next month error:", error);
      toast.error("পরের মাস শুরু করা যায়নি।");
    } finally {
      setProcessing(false);
    }
  }

  if (!hasAdminAccess) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="alert alert-error">
          এই পেজটি ব্যবহারের অনুমতি আপনার নেই।
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-semibold text-[#E57373]">TOPLINE CARE</p>

          <h1 className="mt-2 text-2xl font-bold text-[#2C3E50] sm:text-3xl">
            Batch Monthly Management
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            ব্যাচের মাসিক ক্লাস, উপস্থিতি ও মাস বন্ধের হিসাব পরিচালনা করুন।
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">
            ব্যাচ নির্বাচন করুন
          </label>

          <select
            className="select select-bordered w-full"
            value={selectedBatchId}
            onChange={(event) => setSelectedBatchId(event.target.value)}
          >
            {batches.length === 0 && (
              <option value="">কোনো সক্রিয় ব্যাচ পাওয়া যায়নি</option>
            )}

            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.className || batch.name || batch.id}
              </option>
            ))}
          </select>
        </section>

        {!selectedBatch ? (
          <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
            প্রথমে TopLine Care-এর একটি সক্রিয় ব্যাচ তৈরি করুন।
          </div>
        ) : !latestMonth ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold text-[#2C3E50]">
              প্রথম মাস শুরু করুন
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              এই ব্যাচের মাসিক হিসাব এখনো শুরু হয়নি।
            </p>

            <label className="mb-2 mt-5 block text-sm font-semibold">
              ব্যাচের প্রথম মাসের শুরুর তারিখ
            </label>

            <input
              type="date"
              className="input input-bordered w-full"
              value={initialStartDate}
              onChange={(event) => setInitialStartDate(event.target.value)}
            />

            <button
              type="button"
              onClick={startFirstMonth}
              disabled={processing}
              className="btn mt-5 w-full bg-[#2C3E50] text-white hover:bg-[#1f2d3a] sm:w-auto"
            >
              {processing ? "অপেক্ষা করুন..." : "প্রথম মাস শুরু করুন"}
            </button>
          </section>
        ) : (
          <>
            <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">নির্বাচিত ব্যাচ</p>
                  <h2 className="mt-1 text-xl font-bold text-[#2C3E50]">
                    {selectedBatch.className || selectedBatch.name}
                  </h2>
                </div>

                <span
                  className={`badge ${
                    activeMonth ? "badge-success" : "badge-neutral"
                  } badge-lg`}
                >
                  {activeMonth ? "মাস চালু আছে" : "মাস বন্ধ"}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-gray-500">বর্তমান মাস</p>
                  <p className="mt-1 text-2xl font-bold text-[#2C3E50]">
                    {activeMonth
                      ? `মাস ${activeMonth.monthNumber}`
                      : `মাস ${latestMonth.monthNumber}`}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-gray-500">সম্পন্ন ক্লাস</p>
                  <p className="mt-1 text-2xl font-bold text-[#2C3E50]">
                    {activeMonth
                      ? completedClasses
                      : (latestMonth.completedClasses ?? 0)}
                    <span className="text-base font-medium text-gray-400">
                      {" "}
                      / {MONTHLY_CLASS_TARGET}
                    </span>
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-gray-500">বাকি লক্ষ্য</p>
                  <p className="mt-1 text-2xl font-bold text-[#2C3E50]">
                    {activeMonth
                      ? Math.max(0, MONTHLY_CLASS_TARGET - completedClasses)
                      : (latestMonth.cancelledClasses ?? 0)}
                  </p>
                </div>
              </div>

              {activeMonth && (
                <>
                  <div className="mt-6 h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[#E57373] transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (completedClasses / MONTHLY_CLASS_TARGET) * 100,
                        )}%`,
                      }}
                    />
                  </div>

                  <p className="mt-2 text-sm text-gray-500">
                    {activeMonth.startDate} থেকে {activeMonth.endDate}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    কমপক্ষে {MINIMUM_CLASSES_TO_CLOSE}টি ক্লাসের উপস্থিতি জমা
                    হলে মাস বন্ধ করা যাবে।
                  </p>

                  <button
                    type="button"
                    onClick={closeCurrentMonth}
                    disabled={
                      processing || completedClasses < MINIMUM_CLASSES_TO_CLOSE
                    }
                    className="btn btn-error mt-5 w-full text-white sm:w-auto"
                  >
                    {processing ? "অপেক্ষা করুন..." : "Month Close"}
                  </button>
                </>
              )}

              {!activeMonth && (
                <>
                  <p className="mt-5 text-sm text-gray-500">
                    আগের মাস বন্ধ হয়েছে। নতুন মাস শুরু না করা পর্যন্ত নতুন মাসের
                    হিসাব চালু হবে না।
                  </p>

                  <button
                    type="button"
                    onClick={startNextMonth}
                    disabled={processing}
                    className="btn mt-5 w-full bg-[#2C3E50] text-white hover:bg-[#1f2d3a] sm:w-auto"
                  >
                    {processing ? "অপেক্ষা করুন..." : "Start Next Month"}
                  </button>
                </>
              )}
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
              <h2 className="mb-4 text-lg font-bold text-[#2C3E50]">
                মাসের ইতিহাস
              </h2>

              {selectedMonthRecords.length === 0 ? (
                <p className="text-sm text-gray-500">
                  কোনো মাসের ইতিহাস পাওয়া যায়নি।
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-zebra">
                    <thead>
                      <tr>
                        <th>মাস</th>
                        <th>শুরু</th>
                        <th>সম্পন্ন ক্লাস</th>
                        <th>বাতিল ক্লাস</th>
                        <th>অবস্থা</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedMonthRecords.map((month) => (
                        <tr key={month.id}>
                          <td>মাস {month.monthNumber}</td>
                          <td>{month.startDate}</td>
                          <td>
                            {month.status === "closed"
                              ? (month.completedClasses ?? 0)
                              : month.monthNumber === activeMonth?.monthNumber
                                ? completedClasses
                                : 0}
                          </td>
                          <td>
                            {month.status === "closed"
                              ? (month.cancelledClasses ?? 0)
                              : "—"}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                month.status === "closed"
                                  ? "badge-neutral"
                                  : "badge-success"
                              }`}
                            >
                              {month.status === "closed" ? "বন্ধ" : "চালু"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
