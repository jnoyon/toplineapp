import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import toast from "react-hot-toast";

import {
  MdMenu,
  MdLightMode,
  MdDarkMode,
  MdPerson,
  MdKeyboardArrowDown,
  MdLogout,
  MdAccountCircle,
  MdNotifications,
  MdClose,
  MdCampaign,
  MdQuiz,
  MdAssessment,
  MdEventNote,
  MdInfoOutline,
  MdOpenInNew,
  MdDoneAll,
} from "react-icons/md";

import { auth, db } from "../../firebase/firebase.init";

const SESSION_KEY = "studentSession";
const THEME_KEY = "topline-theme";
const READ_NOTIFICATIONS_KEY = "topline-read-notifications";

const DEPARTMENTS = {
  1: "টপলাইন একাডেমি",
  "01": "টপলাইন একাডেমি",
  2: "টপলাইন মডেল কোচিং",
  "02": "টপলাইন মডেল কোচিং",
  3: "টপলাইন কেয়ার",
  "03": "টপলাইন কেয়ার",
};

const ROLE_NAMES = {
  admin: "অ্যাডমিন",
  teacher: "শিক্ষক",
  departmenthead: "বিভাগীয় প্রধান",
  "exam-controller": "পরীক্ষা নিয়ন্ত্রক",
  student: "শিক্ষার্থী",
};

const NOTIFICATION_ICONS = {
  notice: MdCampaign,
  exam: MdQuiz,
  result: MdAssessment,
  routine: MdEventNote,
  info: MdInfoOutline,
};

function readStudentSession() {
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

function readReadNotifications() {
  try {
    const value = JSON.parse(
      localStorage.getItem(READ_NOTIFICATIONS_KEY) || "[]",
    );

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function getTimestamp(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  if (value?.seconds) return value.seconds * 1000;

  return 0;
}

function formatDate(value) {
  const timestamp = getTimestamp(value);
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function getNotificationType(notification) {
  const value = String(
    notification.type ?? notification.category ?? "notice",
  ).toLowerCase();

  if (value.includes("exam")) return "exam";
  if (value.includes("result") || value.includes("mark")) return "result";
  if (value.includes("routine") || value.includes("schedule")) return "routine";
  if (value.includes("notice") || value.includes("announcement"))
    return "notice";

  return "info";
}

function getNotificationLink(notification, type) {
  if (notification.link || notification.href) {
    return notification.link || notification.href;
  }

  if (type === "exam") return "/exam-list";
  if (type === "result") return "/student-exam-result";

  return "/noticeboard";
}

export default function Header({ user = null, onMenuClick, onProfileClick }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [studentSession, setStudentSession] = useState(readStudentSession);

  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || "light",
  );

  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(readReadNotifications);

  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);

  const currentUser = user || studentSession;

  const role = String(currentUser?.role ?? "")
    .trim()
    .toLowerCase();

  const isStudent = role === "student" || (!user && Boolean(studentSession));

  const email = currentUser?.email ?? "";

  const displayName = isStudent
    ? studentSession?.name || currentUser?.name || "শিক্ষার্থী"
    : currentUser?.displayName ||
      currentUser?.name ||
      currentUser?.fullName ||
      email ||
      "ব্যবহারকারী";

  const departmentId = String(
    studentSession?.departmentId ?? currentUser?.departmentId ?? "",
  );

  const brandName = isStudent
    ? DEPARTMENTS[departmentId] || "টপলাইন"
    : "টপলাইন এডুকেশন";

  const roleName = ROLE_NAMES[role] || "ব্যবহারকারী";

  /* Student session synchronization */

  useEffect(() => {
    const syncSession = () => setStudentSession(readStudentSession());

    window.addEventListener("storage", syncSession);
    window.addEventListener("topline-session-change", syncSession);

    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("topline-session-change", syncSession);
    };
  }, []);

  /* Theme */

  useEffect(() => {
    const nextTheme = theme === "dark" ? "dark" : "light";
    const root = document.documentElement;

    root.classList.toggle("dark", nextTheme === "dark");
    root.setAttribute("data-theme", nextTheme);
    root.style.colorScheme = nextTheme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const nextTheme = previous === "dark" ? "light" : "dark";

      localStorage.setItem(THEME_KEY, nextTheme);

      window.dispatchEvent(
        new CustomEvent("topline-theme-change", {
          detail: nextTheme,
        }),
      );

      return nextTheme;
    });
  }, []);

  /* Realtime notifications */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "notices"),
      (snapshot) => {
        const items = snapshot.docs
          .map((noticeDoc) => {
            const data = noticeDoc.data();
            const type = getNotificationType(data);

            return {
              id: noticeDoc.id,
              ...data,
              type,
              href: getNotificationLink(data, type),
            };
          })
          .filter((item) => {
            return !(
              item.isPublished === false ||
              item.published === false ||
              item.isDraft === true ||
              item.status === "draft" ||
              item.hidden === true
            );
          })
          .sort(
            (a, b) =>
              getTimestamp(b.createdAt || b.date || b.timestamp) -
              getTimestamp(a.createdAt || a.date || a.timestamp),
          )
          .slice(0, 30);

        setNotifications(items);
      },
      (error) => {
        console.error("Notification listener error:", error);
      },
    );

    return unsubscribe;
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.includes(item.id)).length,
    [notifications, readIds],
  );

  const saveReadIds = useCallback((ids) => {
    const uniqueIds = [...new Set(ids)];

    setReadIds(uniqueIds);
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(uniqueIds));
  }, []);

  const markAllRead = useCallback(() => {
    saveReadIds([...readIds, ...notifications.map((item) => item.id)]);
  }, [notifications, readIds, saveReadIds]);

  const handleNotificationClick = useCallback(
    (item) => {
      if (!readIds.includes(item.id)) {
        saveReadIds([...readIds, item.id]);
      }

      setNotificationOpen(false);

      if (
        item.href?.startsWith("http://") ||
        item.href?.startsWith("https://")
      ) {
        window.open(item.href, "_blank", "noopener,noreferrer");
        return;
      }

      navigate(item.href || "/noticeboard");
    },
    [navigate, readIds, saveReadIds],
  );

  /* Close dropdowns */

  useEffect(() => {
    setNotificationOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target)
      ) {
        setNotificationOpen(false);
      }

      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setNotificationOpen(false);
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /* Logout */

  const handleLogout = async () => {
    setUserMenuOpen(false);
    setNotificationOpen(false);

    localStorage.removeItem(SESSION_KEY);
    setStudentSession(null);

    try {
      if (auth.currentUser) {
        await signOut(auth);
      }

      toast.success("সফলভাবে লগআউট হয়েছে।");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("লগআউট সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      navigate("/login", { replace: true });
    }
  };

  /* Brand navigation */

  const handleBrandClick = () => {
    if (isStudent) {
      navigate("/portal");
    } else if (user) {
      navigate("/dashboard");
    } else {
      navigate("/");
    }
  };

  /* Profile navigation */

  const handleProfileClick = () => {
    setUserMenuOpen(false);

    if (onProfileClick) {
      onProfileClick();
      return;
    }

    if (isStudent) {
      const studentId = studentSession?.documentId || studentSession?.studentId;

      if (studentId) {
        navigate(`/student/${encodeURIComponent(String(studentId))}`);
      }

      return;
    }

    navigate("/dashboard");
  };

  return (
    <header className="relative z-[100] w-full border-b border-slate-200/80 bg-white/95 text-slate-800 shadow-[0_4px_20px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-colors dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-100">
      <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-2 px-3 sm:px-5 lg:px-6">
        {/* Brand */}

        <div className="flex min-w-0 items-center gap-2.5">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="মেনু খুলুন"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-[#2C3E50] active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <MdMenu size={23} />
            </button>
          )}

          <button
            type="button"
            onClick={handleBrandClick}
            className="group flex min-w-0 items-center gap-2.5 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#34495E] to-[#172B3C] text-white shadow-lg shadow-slate-900/15 transition-transform duration-200 group-hover:scale-105">
              <MdAccountCircle size={25} />
            </span>

            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-tight text-[#2C3E50] dark:text-white sm:text-base">
                {brandName}
              </span>

              <span className="hidden text-[10px] font-semibold tracking-[0.16em] text-slate-400 sm:block">
                EDUCATION MANAGEMENT
              </span>
            </span>
          </button>
        </div>

        {/* Right actions */}

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Theme button */}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "লাইট মোড চালু করুন" : "ডার্ক মোড চালু করুন"
            }
            title={theme === "dark" ? "লাইট মোড" : "ডার্ক মোড"}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all duration-200 hover:bg-amber-50 hover:text-amber-500 active:scale-95 dark:text-amber-300 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? (
              <MdLightMode size={22} />
            ) : (
              <MdDarkMode size={22} />
            )}
          </button>

          {/* User menu */}

          {currentUser ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen((open) => !open);
                  setNotificationOpen(false);
                }}
                aria-label="ব্যবহারকারীর মেনু"
                aria-expanded={userMenuOpen}
                className={`flex max-w-[190px] items-center gap-2 rounded-2xl border px-2 py-1.5 transition-all duration-200 active:scale-[0.98] sm:max-w-[230px] ${
                  userMenuOpen
                    ? "border-slate-300 bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#34495E] to-[#172B3C] text-white shadow-sm">
                  {currentUser.photoURL || currentUser.photoUrl ? (
                    <img
                      src={currentUser.photoURL || currentUser.photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <MdPerson size={23} />
                  )}
                </span>

                <span className="hidden min-w-0 text-left sm:block">
                  <span className="block max-w-[135px] truncate text-xs font-extrabold text-slate-800 dark:text-white">
                    {displayName}
                  </span>

                  <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {roleName}
                  </span>
                </span>

                <MdKeyboardArrowDown
                  size={19}
                  className={`hidden shrink-0 text-slate-400 transition-transform duration-200 sm:block ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Profile dropdown */}

              {userMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] z-[120] w-[min(290px,calc(100vw-24px))] origin-top-right animate-[dropdownIn_180ms_ease-out] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.20)] dark:border-slate-700 dark:bg-slate-900">
                  {/* Profile information */}

                  <div className="relative overflow-hidden bg-gradient-to-br from-[#2C3E50] via-[#263B50] to-[#172B3C] px-5 py-5 text-white">
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[18px] border-white/5" />

                    <div className="relative flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-white shadow-inner">
                        {currentUser.photoURL || currentUser.photoUrl ? (
                          <img
                            src={currentUser.photoURL || currentUser.photoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <MdPerson size={28} />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">
                          {displayName}
                        </p>

                        <p className="mt-1 truncate text-[11px] text-white/65">
                          {isStudent
                            ? `Student ID: ${studentSession?.studentId ?? "—"}`
                            : email || roleName}
                        </p>
                      </div>
                    </div>

                    <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold text-white/90">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {roleName}
                    </span>
                  </div>

                  {/* Menu items */}

                  <div className="space-y-1 p-2">
                    <button
                      type="button"
                      onClick={handleProfileClick}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-100 hover:text-[#2C3E50] dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700">
                        <MdPerson size={20} />
                      </span>
                      আমার প্রোফাইল
                    </button>

                    {!isStudent && (
                      <Link
                        to="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-100 hover:text-[#2C3E50] dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700">
                          <MdAccountCircle size={20} />
                        </span>
                        ড্যাশবোর্ড
                      </Link>
                    )}

                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-red-600 transition-all duration-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors group-hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:group-hover:bg-red-950/70">
                        <MdLogout size={20} />
                      </span>
                      লগআউট
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-xl bg-gradient-to-r from-[#34495E] to-[#243442] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 sm:text-sm"
            >
              লগইন
            </button>
          )}

          {/* Notifications */}

          {currentUser && (
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => {
                  setNotificationOpen((open) => !open);
                  setUserMenuOpen(false);
                }}
                aria-label="নোটিফিকেশন"
                aria-expanded={notificationOpen}
                className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 active:scale-95 ${
                  notificationOpen
                    ? "bg-slate-100 text-[#2C3E50] dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <MdNotifications size={23} />

                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white ring-2 ring-white dark:ring-slate-950">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}

              {notificationOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] z-[120] w-[min(370px,calc(100vw-24px))] origin-top-right animate-[dropdownIn_180ms_ease-out] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.20)] dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 dark:text-white">
                        নোটিফিকেশন
                      </h3>

                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {unreadCount > 0
                          ? `${unreadCount}টি নতুন নোটিফিকেশন`
                          : "সব নোটিফিকেশন দেখা হয়েছে"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          title="সব পড়া হয়েছে হিসেবে চিহ্নিত করুন"
                          aria-label="সব নোটিফিকেশন পড়া হয়েছে হিসেবে চিহ্নিত করুন"
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30"
                        >
                          <MdDoneAll size={20} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setNotificationOpen(false)}
                        aria-label="বন্ধ করুন"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
                      >
                        <MdClose size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[min(65vh,460px)] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-5 py-12 text-center">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                          <MdNotifications size={28} />
                        </span>

                        <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          কোনো নোটিফিকেশন নেই
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          নতুন নোটিশ এলে এখানে দেখা যাবে।
                        </p>
                      </div>
                    ) : (
                      notifications.map((item) => {
                        const NotificationIcon =
                          NOTIFICATION_ICONS[item.type] || MdInfoOutline;

                        const isRead = readIds.includes(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70 ${
                              isRead ? "" : "bg-blue-50/60 dark:bg-blue-950/20"
                            }`}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#2C3E50] dark:bg-slate-800 dark:text-slate-200">
                              <NotificationIcon size={21} />
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className="line-clamp-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                  {item.title || item.name || "নতুন নোটিশ"}
                                </span>

                                {!isRead && (
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                                )}
                              </span>

                              {(item.message ||
                                item.description ||
                                item.body) && (
                                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                                  {item.message ||
                                    item.description ||
                                    item.body}
                                </span>
                              )}

                              <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                                <span>
                                  {formatDate(
                                    item.createdAt ||
                                      item.date ||
                                      item.timestamp,
                                  )}
                                </span>

                                <MdOpenInNew size={14} />
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dropdown animation */}

      <style>
        {`
          @keyframes dropdownIn {
            from {
              opacity: 0;
              transform: translateY(-6px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
    </header>
  );
}
