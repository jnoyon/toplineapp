import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import toast from "react-hot-toast";

import {
  MdMenu,
  MdLightMode,
  MdDarkMode,
  MdPerson,
  MdKeyboardArrowDown,
  MdLogout,
  MdAccountCircle,
} from "react-icons/md";

import { auth } from "../../firebase/firebase.init";

const DEPARTMENTS = {
  "01": "টপলাইন একাডেমি",
  "02": "টপলাইন মডেল কোচিং",
  "03": "টপলাইন কেয়ার",
  1: "টপলাইন একাডেমি",
  2: "টপলাইন মডেল কোচিং",
  3: "টপলাইন কেয়ার",
};

const getStudentSession = () => {
  try {
    const session = sessionStorage.getItem("studentSession");
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

export default function Header({ user = null, onMenuClick, onProfileClick }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [theme, setTheme] = useState(
    () => localStorage.getItem("topline-theme") || "light",
  );

  const [studentSession, setStudentSession] = useState(getStudentSession);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Route পরিবর্তনের পর শিক্ষার্থীর সেশন আবার পরীক্ষা করবে
  useEffect(() => {
    setStudentSession(getStudentSession());
  }, [location.pathname]);

  // Light/Dark theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");

    localStorage.setItem("topline-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  // Firebase user অথবা student session
  const currentUser = user || studentSession;

  const role = String(currentUser?.role || "")
    .trim()
    .toLowerCase();

  const isStudent =
    role === "student" ||
    role === "শিক্ষার্থী" ||
    Boolean(studentSession && !user);

  const departmentId = String(
    currentUser?.departmentId ?? currentUser?.department?.id ?? "",
  );

  const departmentName = DEPARTMENTS[departmentId];

  const brandName =
    isStudent && departmentName ? departmentName : "টপলাইন এডুকেশন";

  const displayName =
    currentUser?.name ||
    currentUser?.studentName ||
    currentUser?.displayName ||
    currentUser?.email ||
    "ব্যবহারকারী";

  const email = String(currentUser?.email || "").toLowerCase();

  const isSuperAdmin = email === "jihadur51@gmail.com";

  const roleName = isSuperAdmin
    ? "সুপারঅ্যাডমিন"
    : isStudent
      ? departmentName || "শিক্ষার্থী"
      : role === "admin"
        ? "অ্যাডমিন"
        : role === "departmenthead"
          ? "বিভাগীয় প্রধান"
          : role === "teacher"
            ? "শিক্ষক"
            : "ব্যবহারকারী";

  const handleBrandClick = () => {
    if (!currentUser) {
      navigate("/");
      return;
    }

    navigate(isStudent ? "/portal" : "/dashboard");
  };

  const handleLoginClick = () => {
    navigate("/login");
  };

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      // শিক্ষার্থীর আলাদা সেশন মুছে ফেলবে
      sessionStorage.removeItem("studentSession");
      setStudentSession(null);

      // Firebase-এ লগইন করা থাকলে সাইন আউট করবে
      if (auth.currentUser) {
        await signOut(auth);
      }

      setUserMenuOpen(false);

      toast.success("লগআউট সফল হয়েছে!");

      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("লগআউট করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="w-full">
      <div className="border-b border-slate-200/80 bg-white/95 text-slate-800 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/95 dark:text-slate-100">
        <div className="mx-auto flex h-[66px] max-w-7xl items-center justify-between gap-2 px-3 sm:h-[72px] sm:px-5 lg:px-8">
          {/* Menu and Brand */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="মেনু খুলুন"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#2C3E50] transition hover:bg-slate-100 active:scale-95 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <MdMenu size={25} />
            </button>

            <button
              type="button"
              onClick={handleBrandClick}
              className="min-w-0 text-left"
              aria-label="হোম"
            >
              <Link
                to="/"
                className="truncate text-[17px] font-extrabold leading-tight tracking-tight text-[#2C3E50] dark:text-slate-100 sm:text-xl"
              >
                {brandName}
              </Link>

              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1 w-5 rounded-full bg-[#E57373]" />
                <span className="h-1 w-2 rounded-full bg-[#2C3E50] dark:bg-slate-400" />
              </div>
            </button>
          </div>

          {/* Theme and User */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "light" ? "ডার্ক মোড চালু করুন" : "লাইট মোড চালু করুন"
              }
              title={theme === "light" ? "Dark Mode" : "Light Mode"}
              className="flex size-10 items-center justify-center rounded-xl text-[#2C3E50] transition hover:bg-slate-100 active:scale-95 dark:text-amber-300 dark:hover:bg-slate-800"
            >
              {theme === "light" ? (
                <MdDarkMode size={22} />
              ) : (
                <MdLightMode size={22} />
              )}
            </button>

            {/* User Menu */}
            <div className="relative">
              {!currentUser ? (
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="flex h-10 items-center gap-2 rounded-xl bg-[#2C3E50] px-3 text-sm font-semibold text-white transition hover:bg-[#243442] active:scale-95"
                >
                  <MdPerson size={20} />
                  লগইন
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((open) => !open)}
                    aria-label="ব্যবহারকারী মেনু"
                    aria-expanded={userMenuOpen}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[#2C3E50] transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:px-3"
                  >
                    <MdPerson size={22} />

                    <span className="hidden max-w-28 truncate text-sm font-semibold sm:inline">
                      {displayName}
                    </span>

                    <MdKeyboardArrowDown
                      size={19}
                      className={`hidden transition-transform sm:block ${
                        userMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {userMenuOpen && (
                    <>
                      {/* Click outside to close */}
                      <button
                        type="button"
                        aria-label="মেনু বন্ধ করুন"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setUserMenuOpen(false)}
                      />

                      <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        {/* User Information */}
                        <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                          <p className="truncate text-sm font-bold text-[#2C3E50] dark:text-white">
                            {displayName}
                          </p>

                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {roleName}
                          </p>
                        </div>

                        {/* Profile */}
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            onProfileClick?.();
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <MdAccountCircle size={20} />
                          আমার প্রোফাইল
                        </button>

                        {/* Logout */}
                        <button
                          type="button"
                          onClick={handleLogout}
                          disabled={loggingOut}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#C45C5C] transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <MdLogout size={20} />

                          {loggingOut ? "লগআউট হচ্ছে..." : "লগআউট"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
