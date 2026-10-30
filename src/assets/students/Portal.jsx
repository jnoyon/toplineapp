import { useCallback, useEffect, useMemo, useState } from "react";
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
  FiMapPin,
  FiPhone,
  FiAward,
  FiLogOut,
} from "react-icons/fi";

import { RiDiamondFill } from "react-icons/ri";

import { db } from "../firebase/firebase.init";
import { programs } from "./data/Programs";

import LoadingScreen from "../components/LoadingScreen";
import VocabularyWidget from "../components/widget/VocabularyWidget";
import VerbWidget from "../components/widget/VerbWidget";
import Leaderboard from "../components/Leaderboard";

const SESSION_KEY = "studentSession";
const THEME_KEY = "topline-theme";

const icons = {
  book: FiBookOpen,
  exam: FiFileText,
  chart: FiBarChart2,
  task: FiClipboard,
  user: FiUser,
};

/* Helpers */

function getStudentSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));

    if (
      session?.role !== "student" ||
      !session?.documentId ||
      session?.studentId == null
    ) {
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
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

function getProgram(student) {
  const departmentId = String(student?.departmentId ?? "").replace(/^0+/, "");

  const department = String(
    student?.departmentName || student?.department || "",
  ).toLowerCase();

  if (departmentId === "3" || department.includes("care")) return "care";
  if (departmentId === "1" || department.includes("academy")) return "academy";
  if (departmentId === "2" || department.includes("coaching"))
    return "coaching";

  return null;
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

  return value == null || value === "" ? null : value;
}

function getStudentPoint(student) {
  return student?.point1 ?? student?.point ?? student?.points ?? 0;
}

function getClassName(student) {
  return (
    student?.batchName ||
    student?.className ||
    student?.classNumber ||
    student?.class ||
    student?.batch ||
    "—"
  );
}

function isStudentActive(student) {
  const status = student?.isActive ?? student?.active ?? true;

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

function Icon({ name, size = 20, className = "" }) {
  const Component = icons[name] || FiBookOpen;

  return <Component size={size} className={className} aria-hidden="true" />;
}

/* Status Screen */

function StatusScreen({ type = "pending", student, onLogin }) {
  const pending = type === "pending";

  return (
    <main className="relative flex min-h-[75vh] items-center justify-center overflow-hidden bg-[#F5F7FA] px-4 py-8 dark:bg-slate-950">
      <div
        className={`pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full blur-3xl ${
          pending ? "bg-amber-400/10" : "bg-red-400/10"
        }`}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
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

          <h1 className="mt-4 text-2xl font-black text-[#2C3E50] dark:text-white">
            {pending ? "নিবন্ধন সফল হয়েছে!" : "আপনার অ্যাকাউন্টটি সক্রিয় নয়"}
          </h1>

          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
            {pending
              ? `${getStudentName(student)}, আপনার অ্যাকাউন্টটি টপলাইন-এর পক্ষ থেকে অনুমোদনের অপেক্ষায় রয়েছে।`
              : "আপনার শিক্ষার্থী অ্যাকাউন্টটি বর্তমানে নিষ্ক্রিয় রয়েছে।"}
          </p>

          {student && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#2C3E50] shadow-sm dark:bg-slate-900 dark:text-white">
                <FiHash size={19} />
              </div>

              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Student ID
                </p>
                <p className="text-sm font-bold text-[#2C3E50] dark:text-white">
                  {student.studentId || "—"}
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
            <p className="mt-5 text-xs text-slate-400">
              অনুমোদন হলে আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে আপডেট হবে।
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/* Error Screen */

function ErrorScreen({ onRetry }) {
  return (
    <main className="flex min-h-[65vh] items-center justify-center bg-[#F5F7FA] px-4 dark:bg-slate-950">
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

/* Reusable Stat */

function ProfileStat({ icon: IconComponent, label, value, accent = false }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/70">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          accent
            ? "bg-red-50 text-[#E74C3C] dark:bg-red-950/40 dark:text-red-400"
            : "bg-slate-100 text-[#2C3E50] dark:bg-slate-700 dark:text-slate-200"
        }`}
      >
        <IconComponent size={17} />
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="truncate text-sm font-extrabold text-[#2C3E50] dark:text-white">
          {value ?? "—"}
        </p>
      </div>
    </div>
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

  /* Theme */

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

  /* Realtime Student */

  useEffect(() => {
    const session = getStudentSession();

    if (!session) {
      setLoading(false);
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);
    setLoadError(false);
    setInactive(false);
    setApprovalPending(false);

    const unsubscribe = onSnapshot(
      doc(db, "students", session.documentId),

      (snapshot) => {
        if (!snapshot.exists()) {
          localStorage.removeItem(SESSION_KEY);
          setStudent(null);
          setLoading(false);
          toast.error("শিক্ষার্থীর তথ্য পাওয়া যায়নি।");
          navigate("/login", { replace: true });
          return;
        }

        const data = {
          ...snapshot.data(),
          documentId: snapshot.id,
        };

        if (String(data.studentId ?? "") !== String(session.studentId)) {
          localStorage.removeItem(SESSION_KEY);
          setStudent(null);
          setLoading(false);
          toast.error("সেশন যাচাই করা যায়নি। আবার লগইন করুন।");
          navigate("/login", { replace: true });
          return;
        }

        if (!isStudentActive(data)) {
          localStorage.removeItem(SESSION_KEY);
          setStudent(null);
          setInactive(true);
          setApprovalPending(false);
          setLoading(false);
          return;
        }

        if (data.approved !== true) {
          setStudent(data);
          setApprovalPending(true);
          setInactive(false);
          setLoading(false);
          return;
        }

        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            ...session,
            documentId: snapshot.id,
            studentId: String(data.studentId),
            name: getStudentName(data),
            departmentId: data.departmentId ?? null,
            departmentName: data.departmentName ?? "",
            classId: data.classId ?? "",
            className: data.className ?? "",
            batchId: data.batchId ?? "",
            batchName: data.batchName ?? "",
            isCR: data.isCR === true,
            role: "student",
          }),
        );

        setStudent(data);
        setApprovalPending(false);
        setInactive(false);
        setLoadError(false);
        setLoading(false);
      },

      (error) => {
        console.error("Portal listener error:", error);
        setLoadError(true);
        setLoading(false);

        toast.error("তথ্য লোড করা যায়নি।");
      },
    );

    return unsubscribe;
  }, [navigate, retryKey]);

  const retryLoading = useCallback(() => {
    setLoadError(false);
    setRetryKey((key) => key + 1);
  }, []);

  /* Derived Data */

  const profile = useMemo(() => {
    if (!student) return null;

    const programKey = getProgram(student);

    return {
      name: getStudentName(student),
      photo: getStudentPhoto(student),
      program: programKey ? programs[programKey] : null,
      currentMark: getCurrentMark(student),
      point: getStudentPoint(student),
      className: getClassName(student),
      studentId: student.studentId || "—",
      department: student.departmentName || "—",
      batch: student.batchName || student.className || "—",
      village: student.villageName || "—",
      phone: student.phone || student.phoneNormalized || "—",
      roll: student.roll || student.rollNumber || "—",
      isCR: student.isCR === true,
      documentId: student.documentId,
    };
  }, [student]);

  /* Screens */

  if (loading) return <LoadingScreen />;

  if (inactive) {
    return (
      <StatusScreen
        type="inactive"
        onLogin={() => navigate("/login", { replace: true })}
      />
    );
  }

  if (loadError) return <ErrorScreen onRetry={retryLoading} />;

  if (approvalPending && student) {
    return <StatusScreen type="pending" student={student} />;
  }

  if (!student || !profile) return <LoadingScreen />;

  const studentRouteId = encodeURIComponent(
    String(profile.documentId || profile.studentId),
  );

  const quickLinks = profile.program?.links ?? [
    {
      label: "ফলাফল",
      description: "পরীক্ষার ফলাফল দেখুন",
      href: "/student-exam-result",
      icon: "chart",
    },
    {
      label: "আমার প্রোফাইল",
      description: "ব্যক্তিগত তথ্য দেখুন",
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
        {/* Premium Profile Card */}

        <section className="relative isolate overflow-hidden rounded-[26px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100 shadow-lg shadow-slate-900/[0.04] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[35px] border-[#2C3E50]/[0.035] dark:border-white/[0.035]" />

          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#E74C3C]/10 blur-3xl" />

          <div className="relative p-4 sm:p-6 lg:p-7">
            {/* Header */}

            {/* Main Profile */}

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
              {/* Photo */}

              <div className="relative mx-auto shrink-0 sm:mx-0">
                <div className="rounded-[23px] bg-gradient-to-br from-[#2C3E50] via-slate-400 to-[#E74C3C] p-[2px] shadow-lg">
                  {profile.photo ? (
                    <img
                      src={profile.photo}
                      alt={profile.name}
                      loading="eager"
                      referrerPolicy="no-referrer"
                      className="h-28 w-28 rounded-[21px] bg-slate-100 object-cover dark:bg-slate-800 sm:h-32 sm:w-32"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-[21px] bg-slate-100 text-[#2C3E50] dark:bg-slate-800 dark:text-white sm:h-32 sm:w-32">
                      <FiUser size={48} />
                    </div>
                  )}
                </div>

                {profile.isCR && (
                  <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-emerald-500 text-[9px] font-black text-white shadow-md dark:border-slate-900">
                    CR
                  </span>
                )}
              </div>

              {/* Identity */}

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="break-words text-2xl font-black tracking-tight text-[#243442] dark:text-white sm:text-3xl">
                  {profile.name}
                </h1>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="rounded-lg bg-[#2C3E50]/[0.07] px-2.5 py-1 text-xs font-bold text-[#2C3E50] dark:bg-white/10 dark:text-slate-200">
                    ID: {profile.studentId}
                  </span>

                  <span className="rounded-lg bg-[#E74C3C]/10 px-2.5 py-1 text-xs font-bold text-[#E74C3C]">
                    {profile.department}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400 sm:justify-start">
                  <span className="inline-flex items-center gap-1.5">
                    <FiBookOpen size={14} className="text-[#E74C3C]" />
                    {profile.batch}
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <FiMapPin size={14} className="text-[#E74C3C]" />
                    {profile.village}
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <FiPhone size={14} className="text-[#E74C3C]" />
                    {profile.phone}
                  </span>
                </div>

                {/* Actions */}

                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => navigate(`/student/${studentRouteId}`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-[#2C3E50] shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                  >
                    <FiUser size={15} />
                    প্রোফাইল
                    <FiArrowUpRight size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/edit-student/${studentRouteId}`)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#E74C3C] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-red-900/10 transition hover:bg-[#d94335] active:scale-[0.98]"
                  >
                    <FiEdit2 size={14} />
                    প্রোফাইল এডিট
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}

            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <ProfileStat
                icon={FiAward}
                label="প্রাপ্ত নম্বর"
                value={profile.currentMark ?? "—"}
                accent
              />

              <ProfileStat
                icon={RiDiamondFill}
                label="পয়েন্ট"
                value={profile.point}
              />

              <ProfileStat
                icon={FiClipboard}
                label="রোল নম্বর"
                value={profile.roll}
              />

              <ProfileStat
                icon={FiHash}
                label="শিক্ষার্থী আইডি"
                value={profile.studentId}
              />
            </div>
          </div>
        </section>

        {/* Widgets */}

        <div>
          <VocabularyWidget />
          <VerbWidget />
        </div>

        {/* Leaderboard */}

        <Leaderboard for={student.batchName} />

        {/* CR Attendance */}

        {profile.isCR && (
          <section className="mt-5">
            <Link
              to="/add-attendance"
              className="group flex items-center justify-between rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-sm transition hover:shadow-md dark:border-emerald-900/60 dark:from-emerald-950/30 dark:to-slate-900"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                  <FiClipboard size={21} />
                </div>

                <div>
                  <h3 className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
                    উপস্থিতি যুক্ত করুন
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    ব্যাচের শিক্ষার্থীদের উপস্থিতি পরিচালনা করুন
                  </p>
                </div>
              </div>

              <FiChevronRight className="text-emerald-600 transition group-hover:translate-x-1" />
            </Link>
          </section>
        )}

        {/* Quick Links */}

        <section className="mt-7">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {quickLinks.map((item, index) => (
              <button
                key={`${item.href}-${item.label}`}
                type="button"
                onClick={() => handleNavigation(item)}
                style={{ animationDelay: `${index * 45}ms` }}
                className="group relative flex min-h-[145px] animate-[fadeInUp_.4s_ease-out_both] flex-col overflow-hidden rounded-2xl border border-base-300/70 bg-base-100 p-3.5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 active:scale-[0.98] sm:min-h-[160px] sm:p-5"
              >
                {/* Decorative background */}
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/[0.04] transition-transform duration-500 group-hover:scale-150 group-hover:bg-primary/[0.08]" />

                <div className="relative flex w-full items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-200 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-content group-hover:shadow-lg group-hover:shadow-primary/20 sm:h-12 sm:w-12">
                    <Icon name={item.icon} size={21} />
                  </div>

                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-base-content/30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:bg-primary/10 group-hover:text-primary">
                    <FiChevronRight size={18} />
                  </span>
                </div>

                <div className="relative mt-auto pt-5">
                  <h3 className="text-sm font-bold leading-5 text-base-content transition-colors group-hover:text-primary sm:text-base">
                    {item.label}
                  </h3>

                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-base-content/55 sm:text-xs">
                    {item.description}
                  </p>
                </div>

                {/* Bottom accent */}
                <div className="absolute bottom-0 left-0 h-[3px] w-0 rounded-full bg-primary transition-all duration-300 group-hover:w-full" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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
