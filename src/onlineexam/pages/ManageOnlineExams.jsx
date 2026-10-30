import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import {
  FiBookOpen,
  FiCalendar,
  FiClock,
  FiEdit2,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiUsers,
  FiShield,
} from "react-icons/fi";

import { auth, db } from "../../assets/firebase/firebase.init";
import { isAdmin } from "../../config/permissions";

// Keep aligned with OnlineExam.jsx.
const SUBJECTS = {
  ICT: "তথ্য ও যোগাযোগ প্রযুক্তি",
  BANGLA: "বাংলা",
  ENGLISH: "ইংরেজি",
  MATHEMATICS: "গণিত",
  SCIENCE: "বিজ্ঞান",
};

const PARTICIPANT_LABELS = {
  care: "TopLine Care",
  coaching: "TopLine Model Coaching",
  academy: "TopLine Academy",
  public: "Public",
};

function formatDate(value) {
  if (!value) return "নির্ধারিত নয়";

  try {
    const date = value?.toDate ? value.toDate() : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "নির্ধারিত নয়";
    }

    return new Intl.DateTimeFormat("bn-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "নির্ধারিত নয়";
  }
}

function formatDuration(minutes = 0, seconds = 0) {
  return `${Number(minutes) || 0} মিনিট ${Number(seconds) || 0} সেকেন্ড`;
}

function getCreatorUid(exam) {
  // createdBy is the preferred field.
  // The other fields support older documents if they use these names.
  const creator =
    exam.createdBy ??
    exam.creatorId ??
    exam.createdByUid ??
    exam.createdByUserId;

  if (typeof creator === "string") {
    return creator;
  }

  if (creator && typeof creator === "object") {
    return creator.uid ?? creator.id ?? "";
  }

  return "";
}

function getSubjectName(exam) {
  return (
    exam.subjectName ||
    SUBJECTS[exam.subject] ||
    exam.subject ||
    "বিষয় নির্ধারিত নয়"
  );
}

function getExamTitle(exam) {
  return exam.title || "নামহীন পরীক্ষা";
}

export default function ManageOnlineExams() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [exams, setExams] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState("");
  const [deletingExam, setDeletingExam] = useState("");

  const isCurrentUserAdmin = isAdmin(currentUser?.email);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  const loadExams = useCallback(async () => {
    setLoading(true);

    try {
      let snapshot;

      try {
        const examsQuery = query(
          collection(db, "onlineExams"),
          orderBy("createdAt", "desc"),
        );

        snapshot = await getDocs(examsQuery);
      } catch (queryError) {
        // Fall back if createdAt is missing or the ordered query fails.
        console.warn(
          "Ordered exam query failed. Trying without ordering:",
          queryError,
        );

        snapshot = await getDocs(collection(db, "onlineExams"));
      }

      const loadedExams = snapshot.docs.map((examDoc) => ({
        id: examDoc.id,
        ...examDoc.data(),
      }));

      loadedExams.sort((a, b) => {
        const getTime = (value) => {
          if (!value) return 0;

          if (typeof value.toMillis === "function") {
            return value.toMillis();
          }

          const date = new Date(value);
          return Number.isNaN(date.getTime()) ? 0 : date.getTime();
        };

        return getTime(b.createdAt) - getTime(a.createdAt);
      });

      setExams(loadedExams);
    } catch (error) {
      console.error("Load online exams error:", error);
      toast.error("পরীক্ষাগুলো লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && currentUser) {
      loadExams();
    } else if (!authLoading && !currentUser) {
      setExams([]);
    }
  }, [authLoading, currentUser, loadExams]);

  const filteredExams = useMemo(() => {
    if (!selectedSubject) {
      return [];
    }

    const searchText = search.trim().toLowerCase();

    return exams.filter((exam) => {
      const matchesSubject = exam.subject === selectedSubject;

      const matchesSearch =
        !searchText ||
        String(exam.title ?? "")
          .toLowerCase()
          .includes(searchText) ||
        String(exam.syllabus ?? "")
          .toLowerCase()
          .includes(searchText) ||
        String(exam.subjectName ?? "")
          .toLowerCase()
          .includes(searchText);

      return matchesSubject && matchesSearch;
    });
  }, [exams, selectedSubject, search]);

  function canEditExam(exam) {
    if (!currentUser) return false;

    if (isCurrentUserAdmin) return true;

    const creatorUid = getCreatorUid(exam);

    return Boolean(creatorUid && creatorUid === currentUser.uid);
  }

  async function toggleStatus(exam) {
    if (!canEditExam(exam)) {
      toast.error(
        "শুধু পরীক্ষার Creator অথবা Admin Status পরিবর্তন করতে পারবেন।",
      );
      return;
    }

    const nextStatus = !Boolean(exam.status);

    setChangingStatus(exam.id);

    try {
      await updateDoc(doc(db, "onlineExams", exam.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      setExams((current) =>
        current.map((item) =>
          item.id === exam.id ? { ...item, status: nextStatus } : item,
        ),
      );

      toast.success(nextStatus ? "পরীক্ষা চালু হয়েছে।" : "পরীক্ষা বন্ধ হয়েছে।");
    } catch (error) {
      console.error("Update exam status error:", error);
      toast.error("Status পরিবর্তন করা যায়নি। অনুমতি যাচাই করুন।");
    } finally {
      setChangingStatus("");
    }
  }

  async function deleteExam(exam) {
    // Deleting an exam is strictly admin-only.
    if (!isCurrentUserAdmin) {
      toast.error("শুধু Admin পরীক্ষা মুছে ফেলতে পারবেন।");
      return;
    }

    const result = await Swal.fire({
      title: "পরীক্ষাটি মুছে ফেলবেন?",
      text: `"${getExamTitle(exam)}" স্থায়ীভাবে মুছে যাবে। এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, মুছে ফেলুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    setDeletingExam(exam.id);

    try {
      await Swal.fire({
        title: "মুছে ফেলা হচ্ছে...",
        text: "অনুগ্রহ করে অপেক্ষা করুন।",
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
      });

      await deleteDoc(doc(db, "onlineExams", exam.id));

      setExams((current) => current.filter((item) => item.id !== exam.id));

      await Swal.fire({
        title: "মুছে ফেলা হয়েছে!",
        text: "পরীক্ষাটি সফলভাবে মুছে ফেলা হয়েছে।",
        icon: "success",
        confirmButtonColor: "#2C3E50",
        timer: 1800,
        timerProgressBar: true,
      });
    } catch (error) {
      console.error("Delete online exam error:", error);

      await Swal.fire({
        title: "মুছে ফেলা যায়নি!",
        text: "আপনার Admin permission এবং Firestore Security Rules যাচাই করুন।",
        icon: "error",
        confirmButtonColor: "#2C3E50",
      });
    } finally {
      setDeletingExam("");
    }
  }

  function handleEdit(exam) {
    if (!canEditExam(exam)) {
      toast.error("শুধু পরীক্ষার Creator অথবা Admin সম্পাদনা করতে পারবেন।");
      return;
    }

    navigate(`/edit-online-exam/${exam.id}`);
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <span className="loading loading-spinner loading-lg text-[#E74C3C]" />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <FiShield className="mx-auto mb-3 text-3xl text-red-500" />
          <h1 className="text-xl font-black text-slate-800 dark:text-white">
            Login Required
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            পরীক্ষাগুলো পরিচালনা করতে লগইন করুন।
          </p>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-5 rounded-xl bg-[#2C3E50] px-5 py-2.5 font-bold text-white"
          >
            Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2C3E50] text-white">
              <FiBookOpen size={23} />
            </div>

            <div>
              <h1 className="text-2xl font-black text-[#2C3E50] dark:text-white sm:text-3xl">
                Manage Online Exams
              </h1>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                বিষয় নির্বাচন করে পরীক্ষাগুলো পরিচালনা করুন।
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadExams}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </header>

        {/* Subject selection */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <label
            htmlFor="exam-subject-filter"
            className="mb-2 block text-sm font-bold"
          >
            Select Subject <span className="text-red-500">*</span>
          </label>

          <select
            id="exam-subject-filter"
            value={selectedSubject}
            onChange={(event) => setSelectedSubject(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#E74C3C] dark:border-slate-700 dark:bg-slate-950 sm:max-w-md"
          >
            <option value="">বিষয় নির্বাচন করুন</option>

            {Object.entries(SUBJECTS).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>

          {selectedSubject && (
            <>
              <div className="relative mt-4 sm:max-w-md">
                <FiSearch
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="পরীক্ষার নাম বা সিলেবাস খুঁজুন..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-[#E74C3C] dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {getSubjectName({ subject: selectedSubject })} — মোট{" "}
                {filteredExams.length}টি পরীক্ষা
              </p>
            </>
          )}
        </section>

        {/* Do not show any exam before subject selection */}
        {!selectedSubject ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="flex">
              <Link to="/create-exam" className="btn btn-secondary w-full">
                নতুন পরীক্ষা নিন
              </Link>
            </div>
          </section>
        ) : loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <span className="loading loading-spinner loading-lg text-[#E74C3C]" />
          </div>
        ) : filteredExams.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <FiBookOpen size={38} className="mx-auto mb-3 text-slate-400" />
            <h2 className="font-bold">এই বিষয়ে কোনো পরীক্ষা পাওয়া যায়নি</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              অন্য বিষয় নির্বাচন করুন অথবা নতুন পরীক্ষা তৈরি করুন।
            </p>
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredExams.map((exam) => {
              const isActive = Boolean(exam.status);
              const participants = Array.isArray(exam.participants)
                ? exam.participants
                : [];

              const canEdit = canEditExam(exam);

              const totalQuestions =
                exam.totalQuestions ??
                (Array.isArray(exam.questions) ? exam.questions.length : 0);

              return (
                <article
                  key={exam.id}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  {/* Subject and status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex rounded-lg bg-[#2C3E50]/10 px-2.5 py-1 text-xs font-bold text-[#2C3E50] dark:bg-white/10 dark:text-slate-100">
                        {getSubjectName(exam)}
                      </span>

                      <h2 className="mt-3 break-words text-lg font-black text-[#2C3E50] dark:text-white">
                        {getExamTitle(exam)}
                      </h2>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                        isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                      }`}
                    >
                      {isActive ? "ON" : "OFF"}
                    </span>
                  </div>

                  {/* Exam details */}
                  <div className="mt-4 flex-1 space-y-3 text-sm">
                    <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                      <FiBookOpen className="mt-0.5 shrink-0 text-slate-400" />
                      <p className="min-w-0 whitespace-pre-wrap break-words">
                        {exam.syllabus?.trim() || "সিলেবাস দেওয়া হয়নি"}
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                      <FiClock className="mt-0.5 shrink-0 text-slate-400" />
                      <p>
                        সময়:{" "}
                        {formatDuration(
                          exam.durationMinutes,
                          exam.durationSeconds,
                        )}
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                      <FiCalendar className="mt-0.5 shrink-0 text-slate-400" />

                      <div>
                        <p>শুরু: {formatDate(exam.startTime)}</p>
                        <p className="mt-1">
                          শেষ: {formatDate(exam.finishTime)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                      <FiUsers className="mt-0.5 shrink-0 text-slate-400" />

                      <div className="flex flex-wrap gap-1.5">
                        {participants.length > 0 ? (
                          participants.map((participant) => (
                            <span
                              key={participant}
                              className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
                            >
                              {PARTICIPANT_LABELS[participant] || participant}
                            </span>
                          ))
                        ) : (
                          <span>অংশগ্রহণকারী নির্ধারিত নয়</span>
                        )}
                      </div>
                    </div>

                    <p className="text-slate-500 dark:text-slate-400">
                      দেখানো হবে: {exam.questionCount ?? 0}টি প্রশ্ন · মোট{" "}
                      {totalQuestions}টি
                    </p>

                    {canEdit && (
                      <p className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        <FiShield size={14} />
                        {isCurrentUserAdmin
                          ? "Admin access"
                          : "আপনার তৈরি পরীক্ষা"}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          disabled={
                            changingStatus === exam.id ||
                            deletingExam === exam.id
                          }
                          onClick={() => toggleStatus(exam)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                            isActive
                              ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300"
                          }`}
                        >
                          {isActive ? (
                            <FiToggleRight size={18} />
                          ) : (
                            <FiToggleLeft size={18} />
                          )}

                          {changingStatus === exam.id
                            ? "অপেক্ষা করুন..."
                            : isActive
                              ? "Turn Off"
                              : "Turn On"}
                        </button>

                        <button
                          type="button"
                          disabled={deletingExam === exam.id}
                          onClick={() => handleEdit(exam)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2C3E50] px-2 py-2.5 text-sm font-bold text-white transition hover:bg-[#243442] disabled:opacity-60"
                        >
                          <FiEdit2 size={16} />
                          Edit
                        </button>
                      </>
                    ) : (
                      <div className="col-span-2 rounded-xl bg-slate-100 px-3 py-2.5 text-center text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        শুধু Creator অথবা Admin সম্পাদনা করতে পারবেন।
                      </div>
                    )}

                    {/* Delete is visible only to Admin */}
                    {isCurrentUserAdmin && (
                      <button
                        type="button"
                        disabled={
                          deletingExam === exam.id || changingStatus === exam.id
                        }
                        onClick={() => deleteExam(exam)}
                        className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
                      >
                        <FiTrash2 size={16} />
                        {deletingExam === exam.id
                          ? "মুছে ফেলা হচ্ছে..."
                          : "Delete Exam"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
