import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import {
  FiBookOpen,
  FiFileText,
  FiBarChart2,
  FiCalendar,
  FiClipboard,
  FiUser,
  FiCheckCircle,
  FiEdit2,
  FiChevronRight,
  FiSun,
  FiMoon,
} from "react-icons/fi";

import { db } from "../firebase/firebase.init";
import MonthlyProgress from "./MonthlyProgress";
import { programs } from "./data/Programs";

const icons = {
  book: FiBookOpen,
  exam: FiFileText,
  chart: FiBarChart2,
  calendar: FiCalendar,
  task: FiClipboard,
  user: FiUser,
  check: FiCheckCircle,
};

function Icon({ name, size = 22, className = "" }) {
  const Component = icons[name] || FiBookOpen;

  return <Component size={size} className={className} aria-hidden="true" />;
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

  const departmentId = String(student?.departmentId ?? "");

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
  return student?.className ?? student?.classNumber ?? student?.class ?? "—";
}

export default function Portal() {
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [theme, setTheme] = useState(
    () => localStorage.getItem("topline-theme") || "light",
  );

  const darkMode = theme === "dark";

  // Keep theme consistent with the Header
  useEffect(() => {
    const applyTheme = (nextTheme) => {
      setTheme(nextTheme === "dark" ? "dark" : "light");
    };

    const handleThemeChange = (event) => {
      applyTheme(event.detail);
    };

    window.addEventListener("topline-theme-change", handleThemeChange);

    return () => {
      window.removeEventListener("topline-theme-change", handleThemeChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", darkMode);

    localStorage.setItem("topline-theme", theme);

    window.dispatchEvent(
      new CustomEvent("topline-theme-change", {
        detail: theme,
      }),
    );
  }, [theme, darkMode]);

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  // Load the logged-in student
  useEffect(() => {
    let cancelled = false;

    async function loadStudent() {
      try {
        const savedSession = sessionStorage.getItem("studentSession");

        if (!savedSession) {
          navigate("/login", { replace: true });
          return;
        }

        const session = JSON.parse(savedSession);

        if (!session?.documentId || session.role !== "student") {
          sessionStorage.removeItem("studentSession");
          navigate("/login", { replace: true });
          return;
        }

        const studentRef = doc(db, "students", session.documentId);
        const snapshot = await getDoc(studentRef);

        if (!snapshot.exists()) {
          sessionStorage.removeItem("studentSession");
          toast.error("শিক্ষার্থীর তথ্য পাওয়া যায়নি। আবার লগইন করুন।");
          navigate("/login", { replace: true });
          return;
        }

        const studentData = {
          ...snapshot.data(),
          documentId: snapshot.id,
        };

        if (
          String(studentData.studentId ?? "") !==
          String(session.studentId ?? "")
        ) {
          sessionStorage.removeItem("studentSession");
          toast.error("সেশন যাচাই করা যায়নি। আবার লগইন করুন।");
          navigate("/login", { replace: true });
          return;
        }

        if (!cancelled) {
          setStudent(studentData);
        }
      } catch (error) {
        console.error("Portal loading error:", error);

        if (!cancelled) {
          toast.error("শিক্ষার্থীর তথ্য লোড করা যায়নি।");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStudent();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-[#E74C3C]" />
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            পোর্টাল প্রস্তুত হচ্ছে...
          </p>
        </div>
      </main>
    );
  }

  if (!student) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#2C3E50] dark:text-white">
            শিক্ষার্থীর তথ্য পাওয়া যায়নি
          </h2>

          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="mt-4 rounded-xl bg-[#2C3E50] px-5 py-3 font-semibold text-white transition hover:bg-[#243442]"
          >
            লগইন করুন
          </button>
        </div>
      </main>
    );
  }

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
      description: "পরীক্ষার ফলাফল",
      href: "/portal/results",
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
    if (item.external) {
      window.open(item.href, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(item.href);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#F5F7FA] text-slate-800 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {/* Student Profile */}
        <section className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#2C3E50] via-[#34495E] to-[#243342] p-5 text-white shadow-xl shadow-[#2C3E50]/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full border-[40px] border-white/[0.06]" />

          <div className="pointer-events-none absolute right-20 top-8 -z-10 hidden text-white/[0.10] sm:block">
            <FiBookOpen size={90} />
          </div>

          <div className="relative mb-5 flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative shrink-0">
                {studentPhoto ? (
                  <img
                    src={studentPhoto}
                    alt={studentName}
                    className="h-20 w-20 rounded-2xl border-2 border-white/30 object-cover shadow-lg sm:h-24 sm:w-24"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-white/20 bg-white/10 sm:h-24 sm:w-24">
                    <FiUser size={42} />
                  </div>
                )}

                <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#2C3E50] bg-[#E74C3C] text-white">
                  <FiCheckCircle size={14} />
                </span>
              </div>

              <div className="min-w-0">
                <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">
                  {studentName}
                </h1>

                <p className="mt-2 text-sm text-white/75">
                  স্টুডেন্ট আইডি: {student.studentId ?? "—"}
                </p>

                <p className="mt-1 text-sm text-white/75">
                  {className}
                  {student.roll || student.rollNumber
                    ? ` · রোল ${student.roll ?? student.rollNumber}`
                    : ""}
                </p>

                <p className="mt-1 text-sm text-white/75">
                  প্রাপ্ত নম্বর:{" "}
                  <span className="font-bold text-white">
                    {currentMark ?? "—"}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:flex-col sm:items-end">
              {/* Light / Dark Mode */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  darkMode ? "লাইট মোড চালু করুন" : "ডার্ক মোড চালু করুন"
                }
                title={darkMode ? "লাইট মোড" : "ডার্ক মোড"}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                {darkMode ? <FiSun size={17} /> : <FiMoon size={17} />}
                {darkMode ? "লাইট মোড" : "ডার্ক মোড"}
              </button>

              <button
                type="button"
                onClick={() => navigate(`/student/${studentRouteId}`)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <FiUser size={17} />
                বিস্তারিত
              </button>

              <button
                type="button"
                onClick={() => navigate(`/edit-student/${studentRouteId}`)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E74C3C] px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#D94335]"
              >
                <FiEdit2 size={17} />
                এডিট করুন
              </button>
            </div>
          </div>

          {/* TopLine Care: compact progress bar */}
          {programKey === "care" && (
            <MonthlyProgress student={student} compact />
          )}
        </section>

        {/* Program Menus */}
        <section className="mt-8">
          <div className="mb-5">
            <h2 className="text-xl font-black text-[#2C3E50] dark:text-white">
              আপনার পড়াশোনা
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              প্রয়োজনীয় বিষয়গুলো এখান থেকে খুলুন।
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {quickLinks.map((item, index) => (
              <button
                key={`${item.href}-${item.label}`}
                type="button"
                onClick={() => handleNavigation(item)}
                style={{ animationDelay: `${index * 60}ms` }}
                className="group relative flex min-h-40 flex-col items-start overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#E74C3C]/40 hover:shadow-xl hover:shadow-[#2C3E50]/5 dark:border-slate-800 dark:bg-slate-900 sm:p-5"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#E74C3C]/[0.04] transition-transform duration-500 group-hover:scale-150" />

                <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#2C3E50] transition-all duration-300 group-hover:bg-[#E74C3C] group-hover:text-white group-hover:shadow-lg group-hover:shadow-[#E74C3C]/20 dark:bg-slate-800 dark:text-slate-100">
                  <Icon name={item.icon} size={24} />
                </div>

                <div className="relative mt-auto flex w-full items-end justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#2C3E50] dark:text-white sm:text-base">
                      {item.label}
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {item.description}
                    </p>
                  </div>

                  <FiChevronRight
                    size={18}
                    className="shrink-0 text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-[#E74C3C]"
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
