import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { doc, onSnapshot } from "firebase/firestore";
import toast from "react-hot-toast";

import {
  FiBookOpen,
  FiFileText,
  FiBarChart2,
  FiClipboard,
  FiUser,
  FiEdit2,
  FiChevronRight,
  FiAlertCircle,
  FiLock,
  FiRefreshCw,
  FiClock,
  FiHash,
  FiArrowUpRight,
} from "react-icons/fi";

import { db } from "../firebase/firebase.init";
import { programs } from "./data/Programs";
import LoadingScreen from "../components/LoadingScreen";

const SESSION_KEY = "studentSession";
const THEME_KEY = "topline-theme";

const icons = {
  book: FiBookOpen,
  exam: FiFileText,
  chart: FiBarChart2,
  task: FiClipboard,
  user: FiUser,
};

function Icon({ name, size = 20, className = "" }) {
  const Component = icons[name] || FiBookOpen;
  return <Component size={size} className={className} aria-hidden="true" />;
}

/* Helpers */

function getStudentSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);

    if (
      session?.role !== "student" ||
      !session?.documentId ||
      session.studentId == null
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function getProgram(student) {
  if (student?.isCare === true) return "care";
  if (student?.isAcademy === true) return "academy";
  if (student?.isCoaching === true) return "coaching";

  const department = String(
    student?.departmentName ?? student?.department ?? "",
  ).toLowerCase();

  if (department.includes("care")) return "care";
  if (department.includes("academy")) return "academy";
  if (department.includes("coaching")) return "coaching";

  const departmentId = String(student?.departmentId ?? "").replace(/^0+/, "");

  if (departmentId === "3") return "care";
  if (departmentId === "1") return "academy";
  if (departmentId === "2") return "coaching";

  return null;
}

function getStudentName(student) {
  return (
    student?.name || student?.studentName || student?.fullName || "শিক্ষার্থী"
  );
}

function getStudentPhoto(student) {
  return (
    student?.photoURL ||
    student?.photoUrl ||
    student?.photo ||
    student?.imageUrl ||
    student?.image ||
    ""
  );
}

function getCurrentMark(student) {
  const value =
    student?.currentMark ??
    student?.currentMarks ??
    student?.totalMark ??
    student?.totalMarks ??
    student?.obtainedMarks ??
    student?.marks;

  if (value && typeof value === "object") {
    return value.obtained ?? value.total ?? value.marks ?? value.score ?? null;
  }

  return value === "" || value == null ? null : value;
}

function getClassName(student) {
  return (
    student?.className ??
    student?.classNumber ??
    student?.class ??
    student?.batchName ??
    student?.batch ??
    "—"
  );
}

function isStudentActive(student) {
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
}

/* Status screen */

function StatusScreen({ type = "pending", student, onLogin }) {
  const pending = type === "pending";

  return (
    <main className="relative flex min-h-[75vh] items-center justify-center overflow-hidden bg-[#F5F7FA] px-4 py-8 transition-colors dark:bg-slate-950">
      <div
        className={`pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full blur-3xl ${
          pending ? "bg-amber-400/10" : "bg-red-400/10"
        }`}
      />

      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
          pending ? "" : ""
        }`}
      >
        <div
          className={`h-1.5 ${
            pending
              ? "bg-gradient-to-r from-amber-400 via-[#E74C3C] to-amber-400"
              : "bg-gradient-to-r from-red-500 via-orange-400 to-red-500"
          }`}
        />

        <div className="p-6 text-center sm:p-8">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
              pending
                ? "bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400"
            }`}
          >
            {pending ? <FiClock size={30} /> : <FiLock size={30} />}
          </div>

          <span
            className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
              pending
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                pending ? "animate-pulse bg-amber-500" : "bg-red-500"
              }`}
            />
            {pending ? "অনুমোদনের অপেক্ষায়" : "অ্যাকাউন্ট নিষ্ক্রিয়"}
          </span>

          <h1 className="mt-4 text-2xl font-black tracking-tight text-[#2C3E50] dark:text-white">
            {pending ? "নিবন্ধন সফল হয়েছে!" : "আপনার অ্যাকাউন্টটি সক্রিয় নয়"}
          </h1>

          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
            {pending
              ? `${getStudentName(student)}, আপনার অ্যাকাউন্টটি টপলাইন-এর পক্ষ থেকে অনুমোদনের অপেক্ষায় রয়েছে।`
              : "আপনার শিক্ষার্থী অ্যাকাউন্টটি বর্তমানে নিষ্ক্রিয় রয়েছে।"}
          </p>

          {student && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2C3E50] shadow-sm dark:bg-slate-900 dark:text-white">
                <FiUser size={19} />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Student ID
                </p>
                <p className="break-all text-sm font-bold text-[#2C3E50] dark:text-white">
                  {student.studentId ?? "—"}
                </p>
              </div>
            </div>
          )}

          {!pending && (
            <button
              type="button"
              onClick={onLogin}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C3E50] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#243442]"
            >
              <FiRefreshCw size={16} />
              লগইন পেজে ফিরে যান
            </button>
          )}

          {pending && (
            <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">
              অনুমোদন হলে আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে আপডেট হবে।
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/* Error screen */

function ErrorScreen({ onRetry }) {
  return (
    <main className="flex min-h-[65vh] items-center justify-center bg-[#F5F7FA] px-4 transition-colors dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-950/30">
          <FiAlertCircle size={27} />
        </div>

        <h2 className="mt-4 text-xl font-black text-[#2C3E50] dark:text-white">
          তথ্য লোড করা যায়নি
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          সাময়িক সমস্যা হয়েছে। আবার চেষ্টা করুন।
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#2C3E50] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#243442]"
        >
          <FiRefreshCw size={16} />
          আবার চেষ্টা করুন
        </button>
      </div>
    </main>
  );
}

/* Main Portal */

export default function Portal() {
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inactive, setInactive] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  /* Theme synchronization */

  useEffect(() => {
    const applyTheme = (value) => {
      const theme = value === "dark" ? "dark" : "light";
      const root = document.documentElement;

      root.classList.toggle("dark", theme === "dark");
      root.setAttribute("data-theme", theme);
      root.style.colorScheme = theme;
    };

    applyTheme(localStorage.getItem(THEME_KEY) || "light");

    const handleThemeChange = (event) => applyTheme(event.detail);
    const handleStorageChange = (event) => {
      if (event.key === THEME_KEY) {
        applyTheme(event.newValue || "light");
      }
    };

    window.addEventListener("topline-theme-change", handleThemeChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("topline-theme-change", handleThemeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  /* Realtime student listener */

  useEffect(() => {
    const session = getStudentSession();

    if (!session) {
      setLoading(false);
      navigate("/login", { replace: true });
      return undefined;
    }

    setLoading(true);
    setLoadError(false);
    setInactive(false);
    setApprovalPending(false);

    const studentRef = doc(db, "students", session.documentId);

    const unsubscribe = onSnapshot(
      studentRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          localStorage.removeItem(SESSION_KEY);
          setStudent(null);
          setLoading(false);
          toast.error("শিক্ষার্থীর তথ্য পাওয়া যায়নি।");
          navigate("/login", { replace: true });
          return;
        }

        const studentData = {
          ...snapshot.data(),
          documentId: snapshot.id,
        };

        if (String(studentData.studentId ?? "") !== String(session.studentId)) {
          localStorage.removeItem(SESSION_KEY);
          setStudent(null);
          setLoading(false);
          toast.error("সেশন যাচাই করা যায়নি। আবার লগইন করুন।");
          navigate("/login", { replace: true });
          return;
        }

        if (!isStudentActive(studentData)) {
          localStorage.removeItem(SESSION_KEY);
          setStudent(null);
          setInactive(true);
          setApprovalPending(false);
          setLoadError(false);
          setLoading(false);
          return;
        }

        if (studentData.approved !== true) {
          setStudent(studentData);
          setApprovalPending(true);
          setInactive(false);
          setLoadError(false);
          setLoading(false);
          return;
        }

        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            ...session,
            documentId: snapshot.id,
            studentId: String(studentData.studentId),
            name: getStudentName(studentData),
            departmentId: studentData.departmentId ?? null,
            departmentName: studentData.departmentName ?? "",
            classId: studentData.classId ?? "",
            className: studentData.className ?? "",
            batchId: studentData.batchId ?? "",
            batchName: studentData.batchName ?? "",
            isCR: studentData.isCR === true,
            role: "student",
          }),
        );

        setStudent(studentData);
        setApprovalPending(false);
        setInactive(false);
        setLoadError(false);
        setLoading(false);
      },
      (error) => {
        console.error("Portal listener error:", error);
        setLoadError(true);
        setLoading(false);
        toast.error(
          "তথ্য লোড করা যায়নি। ইন্টারনেট ও Firestore permission পরীক্ষা করুন।",
        );
      },
    );

    return unsubscribe;
  }, [navigate, retryKey]);

  const retryLoading = useCallback(() => {
    setLoadError(false);
    setRetryKey((key) => key + 1);
  }, []);

  /* State screens */

  if (loading) return <LoadingScreen />;

  if (inactive) {
    return (
      <StatusScreen
        type="inactive"
        onLogin={() => navigate("/login", { replace: true })}
      />
    );
  }

  if (loadError) {
    return <ErrorScreen onRetry={retryLoading} />;
  }

  if (approvalPending && student) {
    return <StatusScreen type="pending" student={student} />;
  }

  if (!student) return <LoadingScreen />;

  /* Student data */

  const programKey = getProgram(student);
  const program = programKey ? programs[programKey] : null;
  const studentName = getStudentName(student);
  const studentPhoto = getStudentPhoto(student);
  const currentMark = getCurrentMark(student);
  const className = getClassName(student);

  const studentRouteId = encodeURIComponent(
    String(student.documentId || student.studentId || ""),
  );

  const quickLinks = program?.links ?? [
    {
      label: "ফলাফল",
      description: "পরীক্ষার ফলাফল দেখুন",
      href: "/student-exam-result",
      icon: "chart",
    },
    {
      label: "আমার প্রোফাইল",
      description: "ব্যক্তিগত তথ্য",
      href: `/student/${studentRouteId}`,
      icon: "user",
    },
  ];

  function handleNavigation(item) {
    if (!item?.href) return;

    if (item.external) {
      window.open(item.href, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(item.href);
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] text-slate-800 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
        {/* Student profile */}

        <section className="group relative isolate overflow-hidden rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-[#FBFCFE] to-[#F0F4F8] text-[#2C3E50] shadow-lg shadow-slate-900/[0.04] transition-colors duration-300 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:text-white dark:shadow-black/20">
          <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-60 w-60 rounded-full border-[34px] border-[#2C3E50]/[0.035] transition-transform duration-700 group-hover:scale-110 dark:border-white/[0.04]" />

          <div className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-48 w-48 rounded-full bg-[#E74C3C]/[0.07] blur-3xl dark:bg-[#E74C3C]/[0.15]" />

          <div className="pointer-events-none absolute right-5 top-5 -z-10 hidden text-[#2C3E50]/[0.045] dark:text-white/[0.045] sm:block">
            <FiBookOpen size={105} />
          </div>

          <div className="relative p-4 sm:p-6">
            <div className="flex items-start gap-3.5 sm:gap-5">
              <div className="relative shrink-0">
                <div className="rounded-[20px] bg-gradient-to-br from-white via-slate-200 to-[#E74C3C] p-[2px] shadow-lg shadow-slate-900/10 dark:from-slate-500 dark:via-slate-700 dark:to-[#E74C3C]">
                  {studentPhoto ? (
                    <img
                      src={studentPhoto}
                      alt={studentName}
                      loading="eager"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                      className="h-[88px] w-[88px] rounded-[18px] bg-slate-100 object-cover dark:bg-slate-800 sm:h-[112px] sm:w-[112px]"
                    />
                  ) : (
                    <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[18px] bg-slate-100 text-[#2C3E50] dark:bg-slate-800 dark:text-white sm:h-[112px] sm:w-[112px]">
                      <FiUser size={43} />
                    </div>
                  )}
                </div>

                {student.isCR === true && (
                  <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-white bg-emerald-500 text-[9px] font-black text-white shadow-md dark:border-slate-900">
                    CR
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <h1 className="break-words text-xl font-black leading-tight tracking-tight text-[#243442] dark:text-white sm:text-2xl">
                  {studentName}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <FiHash size={13} className="text-[#E74C3C]" />
                    {student.studentId ?? "আইডি নেই"}
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <FiBookOpen size={13} className="text-[#E74C3C]" />
                    {className}
                    <span className="text-slate-400 dark:text-slate-500">
                      ·
                    </span>
                    <span>প্রাপ্ত নম্বর {currentMark ?? "—"}</span>
                  </span>

                  {(student.roll || student.rollNumber) && (
                    <span className="inline-flex items-center gap-1.5">
                      <FiClipboard size={13} className="text-[#E74C3C]" />
                      রোল {student.roll ?? student.rollNumber}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/student/${studentRouteId}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#2C3E50] shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                  >
                    <FiUser size={14} />
                    প্রোফাইল
                    <FiArrowUpRight size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/edit-student/${studentRouteId}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#E74C3C] px-3 py-2 text-xs font-bold text-white shadow-sm shadow-red-900/10 transition hover:bg-[#d94335] active:scale-[0.98]"
                  >
                    <FiEdit2 size={13} />
                    এডিট
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Study menu */}

        <section className="mt-6">
          {student.isCR === true && (
            <div className="mb-5 flex items-center gap-3">
              <Link to="/add-attendance" className="btn btn-accent">
                উপস্থিতি যুক্ত করুন
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {quickLinks.map((item, index) => (
              <button
                key={`${item.href}-${item.label}`}
                type="button"
                onClick={() => handleNavigation(item)}
                style={{ animationDelay: `${index * 45}ms` }}
                className="group/card relative flex min-h-[122px] animate-[fadeInUp_.35s_ease-out_both] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E74C3C]/40 hover:shadow-md active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#E74C3C]/50 sm:min-h-[135px] sm:p-4"
              >
                <div className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full bg-[#E74C3C]/[0.045] transition-transform duration-300 group-hover/card:scale-150 dark:bg-[#E74C3C]/[0.08]" />

                <div className="relative flex w-full items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[#2C3E50] transition-colors duration-200 group-hover/card:bg-[#E74C3C] group-hover/card:text-white dark:bg-slate-800 dark:text-slate-100 dark:group-hover/card:bg-[#E74C3C]">
                    <Icon name={item.icon} size={20} />
                  </div>

                  <FiChevronRight
                    size={16}
                    className="mt-1 text-slate-300 transition-all duration-200 group-hover/card:translate-x-0.5 group-hover/card:text-[#E74C3C] dark:text-slate-600"
                  />
                </div>

                <div className="relative mt-auto pt-4">
                  <h3 className="text-sm font-extrabold text-[#2C3E50] dark:text-white">
                    {item.label}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
