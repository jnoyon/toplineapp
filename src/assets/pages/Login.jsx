import { useEffect, useState } from "react";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit,
} from "firebase/firestore";

import { Navigate, useNavigate, useOutletContext } from "react-router";

import toast from "react-hot-toast";

import {
  MdPerson,
  MdLock,
  MdVisibility,
  MdVisibilityOff,
  MdArrowForward,
  MdMenuBook,
  MdShield,
} from "react-icons/md";

import { auth, db } from "../firebase/firebase.init";
import { getUserRole } from "../../config/permissions";

/* =========================================================
   Configuration
========================================================= */

const MAX_ATTEMPTS = 3;
const LOCKOUT_TIME = 60 * 60 * 1000;

const THEME_KEY = "topline-theme";
const STUDENT_SESSION_KEY = "studentSession";

const STAFF_ROLES = ["admin", "teacher", "departmenthead", "exam-controller"];

const ROLES = [
  { value: "student", label: "শিক্ষার্থী" },
  { value: "teacher", label: "শিক্ষক" },
  { value: "admin", label: "অ্যাডমিন" },
];

/* =========================================================
   Helpers
========================================================= */

const normalizeStudentId = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s/g, "");

const normalizeEmail = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getLockKey = (identifier) =>
  `topline-login-lock-${normalizeEmail(identifier)}`;

const getLockData = (identifier) => {
  try {
    const data = JSON.parse(
      localStorage.getItem(getLockKey(identifier)) || "{}",
    );

    return {
      attempts: Number(data.attempts) || 0,
      lockedUntil: Number(data.lockedUntil) || 0,
    };
  } catch {
    return {
      attempts: 0,
      lockedUntil: 0,
    };
  }
};

const recordFailedAttempt = (identifier) => {
  const previous = getLockData(identifier);
  const attempts = previous.attempts + 1;

  const data = {
    attempts,
    lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_TIME : 0,
  };

  localStorage.setItem(getLockKey(identifier), JSON.stringify(data));

  return data;
};

const isLocked = (identifier) => {
  const data = getLockData(identifier);

  if (data.lockedUntil > Date.now()) {
    return true;
  }

  if (data.lockedUntil && data.lockedUntil <= Date.now()) {
    localStorage.removeItem(getLockKey(identifier));
  }

  return false;
};

const clearLoginAttempts = (identifier) => {
  localStorage.removeItem(getLockKey(identifier));
};

const isInactive = (value) =>
  value === false ||
  value === 0 ||
  ["false", "0", "inactive", "disabled", "blocked", "suspended"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );

const isAccountInactive = (profile) => {
  if (!profile) return false;

  return (
    isInactive(profile.isActive) ||
    isInactive(profile.active) ||
    isInactive(profile.enabled) ||
    profile.accountAccess === false
  );
};

const readTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

/* =========================================================
   Existing Session Redirect
========================================================= */

function ExistingSessionRedirect() {
  const { user } = useOutletContext() || {};

  let studentSession = null;

  try {
    studentSession = JSON.parse(
      localStorage.getItem(STUDENT_SESSION_KEY) || "null",
    );
  } catch {
    studentSession = null;
  }

  if (
    studentSession?.role === "student" &&
    studentSession?.studentId &&
    studentSession?.documentId
  ) {
    return <Navigate to="/portal" replace />;
  }

  if (user) {
    const role = getUserRole(user);

    if (role === "student") {
      return <Navigate to="/portal" replace />;
    }

    if (STAFF_ROLES.includes(role)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return null;
}

/* =========================================================
   Login Component
========================================================= */

export default function Login() {
  const navigate = useNavigate();

  const outletContext = useOutletContext() || {};
  const { user } = outletContext;

  /* Form state */

  const [selectedRole, setSelectedRole] = useState("student");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  /* Theme state */

  const [theme, setTheme] = useState(readTheme);

  const isDark = theme === "dark";

  /* =======================================================
     Sync Theme With Header
  ======================================================= */

  useEffect(() => {
    const syncTheme = (event) => {
      const nextTheme =
        event?.detail === "dark" || event?.detail === "light"
          ? event.detail
          : readTheme();

      setTheme(nextTheme);
    };

    window.addEventListener("topline-theme-change", syncTheme);
    window.addEventListener("storage", syncTheme);

    return () => {
      window.removeEventListener("topline-theme-change", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  /* =======================================================
     Login Lockout State
  ======================================================= */

  const cleanIdentifier =
    selectedRole === "student"
      ? normalizeStudentId(identifier)
      : normalizeEmail(identifier);

  const lockData = getLockData(cleanIdentifier);

  const locked = isLocked(cleanIdentifier);

  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - lockData.attempts);

  /* =======================================================
     Password Reset
  ======================================================= */

  const handlePasswordReset = async () => {
    const email = normalizeEmail(identifier);

    if (selectedRole === "student") {
      toast.error("শিক্ষার্থীরা Student ID ও PIN দিয়ে লগইন করবে।");
      return;
    }

    if (!isValidEmail(email)) {
      toast.error("প্রথমে সঠিক ইমেইল লিখুন।");
      return;
    }

    try {
      setResetLoading(true);

      await sendPasswordResetEmail(auth, email);

      toast.success("পাসওয়ার্ড রিসেটের নির্দেশনা ইমেইলে পাঠানো হয়েছে।");
    } catch (error) {
      console.error("Password reset error:", error);

      const messages = {
        "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি.",

        "auth/invalid-email": "ইমেইল ঠিকানা সঠিক নয়।",

        "auth/too-many-requests":
          "অনেকবার চেষ্টা করেছেন। পরে আবার চেষ্টা করুন।",
      };

      toast.error(messages[error.code] || "পাসওয়ার্ড রিসেট করা যায়নি।");
    } finally {
      setResetLoading(false);
    }
  };

  /* =======================================================
     Student Login
  ======================================================= */

  const handleStudentLogin = async () => {
    const studentId = normalizeStudentId(identifier);
    const enteredPin = String(password).trim();

    if (!/^\d{5}$/.test(studentId)) {
      toast.error("সঠিক ৫ সংখ্যার Student ID লিখুন।");
      return;
    }

    if (!enteredPin) {
      toast.error("আপনার PIN লিখুন।");
      return;
    }

    try {
      setLoading(true);

      const studentQuery = query(
        collection(db, "students"),
        where("studentId", "==", studentId),
        limit(1),
      );

      const studentSnapshot = await getDocs(studentQuery);

      if (studentSnapshot.empty) {
        toast.error("Student ID অথবা PIN সঠিক নয়।");
        return;
      }

      const studentDoc = studentSnapshot.docs[0];
      const student = studentDoc.data();

      const savedPin = String(
        student.pin ?? student.password ?? student.studentPassword ?? "",
      ).trim();

      if (!savedPin || savedPin !== enteredPin) {
        toast.error("Student ID অথবা PIN সঠিক নয়.");
        return;
      }

      if (student.approved !== true) {
        toast.error("আপনার অ্যাকাউন্ট এখনো অনুমোদিত হয়নি।");
        return;
      }

      if (isAccountInactive(student)) {
        toast.error("আপনার অ্যাকাউন্ট নিষ্ক্রিয় রয়েছে।");
        return;
      }

      const session = {
        role: "student",
        documentId: studentDoc.id,
        studentId: String(student.studentId || studentId),

        name: student.name || "",

        departmentId: student.departmentId ?? "",
        departmentName: student.departmentName || "",

        classId: student.classId ?? "",
        className: student.className || "",

        batchId: student.batchId ?? "",
        batchName: student.batchName || "",

        isCR: student.isCR === true,

        loginAt: Date.now(),
      };

      // Save the student session.
      // Do not remove this session after saving it.
      localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));

      clearLoginAttempts(studentId);

      window.dispatchEvent(new Event("topline-session-change"));

      toast.success("লগইন সফল হয়েছে!");

      navigate("/portal", { replace: true });
    } catch (error) {
      console.error("Student login error:", error);

      if (error.code === "permission-denied") {
        toast.error(
          "শিক্ষার্থী তথ্য দেখার অনুমতি নেই। Admin-এর সঙ্গে যোগাযোগ করুন।",
        );
      } else {
        toast.error("লগইন করা যায়নি। আবার চেষ্টা করুন।");
      }
    } finally {
      setLoading(false);
    }
  };

  /* =======================================================
     Staff Login
  ======================================================= */

  const handleStaffLogin = async () => {
    const email = normalizeEmail(identifier);

    if (!isValidEmail(email)) {
      toast.error("সঠিক ইমেইল লিখুন।");
      return;
    }

    if (!password) {
      toast.error("পাসওয়ার্ড লিখুন।");
      return;
    }

    try {
      setLoading(true);

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );

      const firebaseUser = credential.user;

      /*
       * Admin:
       * permissions.js-এ তালিকাভুক্ত email হলে
       * Firestore profile ছাড়াই Dashboard-এ প্রবেশ করতে পারবে।
       */

      const emailBasedRole = getUserRole({
        email: firebaseUser.email,
        uid: firebaseUser.uid,
      });

      if (emailBasedRole === "admin") {
        clearLoginAttempts(email);

        toast.success("Admin লগইন সফল হয়েছে!");

        navigate("/dashboard", { replace: true });
        return;
      }

      /*
       * Non-admin staff:
       * Firestore users/{uid} profile প্রয়োজন।
       */

      const profileRef = doc(db, "users", firebaseUser.uid);

      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        await signOut(auth);

        toast.error(
          "আপনার ব্যবহারকারীর প্রোফাইল পাওয়া যায়নি। Admin-এর সঙ্গে যোগাযোগ করুন।",
        );

        return;
      }

      const profile = profileSnap.data();

      if (isAccountInactive(profile)) {
        await signOut(auth);

        toast.error("আপনার অ্যাকাউন্ট নিষ্ক্রিয় রয়েছে.");
        return;
      }

      const actualRole = getUserRole({
        ...profile,
        email: firebaseUser.email,
        uid: firebaseUser.uid,
      });

      if (!STAFF_ROLES.includes(actualRole)) {
        await signOut(auth);

        toast.error("আপনার অ্যাকাউন্টের ভূমিকা নির্ধারণ করা যায়নি।");

        return;
      }

      if (actualRole !== selectedRole) {
        await signOut(auth);

        toast.error("আপনার নির্বাচিত ভূমিকা সঠিক নয়।");

        return;
      }

      clearLoginAttempts(email);

      toast.success("লগইন সফল হয়েছে!");

      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Staff login error:", error);

      const messages = {
        "auth/invalid-credential": "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।",

        "auth/invalid-email": "ইমেইল ঠিকানা সঠিক নয়।",

        "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।",

        "auth/wrong-password": "পাসওয়ার্ড সঠিক নয়।",

        "auth/too-many-requests":
          "অনেকবার চেষ্টা করেছেন। কিছুক্ষণ পরে আবার চেষ্টা করুন।",

        "auth/network-request-failed": "ইন্টারনেট সংযোগ পরীক্ষা করুন।",
      };

      if (error.code === "permission-denied") {
        toast.error("Firestore permission denied হয়েছে।");
      } else {
        toast.error(
          messages[error.code] || "লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /* =======================================================
     Submit
  ======================================================= */

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading || resetLoading) return;

    const currentIdentifier =
      selectedRole === "student"
        ? normalizeStudentId(identifier)
        : normalizeEmail(identifier);

    if (!currentIdentifier) {
      toast.error(
        selectedRole === "student" ? "Student ID লিখুন।" : "ইমেইল লিখুন।",
      );

      return;
    }

    if (isLocked(currentIdentifier)) {
      const data = getLockData(currentIdentifier);

      const minutes = Math.ceil((data.lockedUntil - Date.now()) / 60000);

      toast.error(
        `অনেকবার ভুল চেষ্টা করেছেন। ${Math.max(
          1,
          minutes,
        )} মিনিট পরে চেষ্টা করুন।`,
      );

      return;
    }

    if (!password.trim()) {
      toast.error(
        selectedRole === "student" ? "PIN লিখুন।" : "পাসওয়ার্ড লিখুন।",
      );

      return;
    }

    if (selectedRole === "student") {
      await handleStudentLogin();
    } else {
      await handleStaffLogin();
    }
  };

  /* =======================================================
     Styling Helpers
  ======================================================= */

  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const inputClasses = [
    "input input-bordered w-full pl-10 transition-colors",
    isDark
      ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#e74c3c]"
      : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-[#e74c3c]",
  ].join(" ");

  /* =======================================================
     UI
  ======================================================= */

  return (
    <>
      <ExistingSessionRedirect />

      <main
        className={[
          "flex min-h-screen items-center justify-center",
          "px-4 py-8 transition-colors duration-200",
          isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800",
        ].join(" ")}
      >
        <div className="w-full max-w-md">
          {/* Login Card */}

          <section
            className={[
              "overflow-hidden rounded-3xl border shadow-xl",
              isDark
                ? "border-slate-800 bg-slate-900"
                : "border-slate-200 bg-white",
            ].join(" ")}
          >
            {/* Brand Header */}

            <div className="bg-[#2c3e50] px-7 py-8 text-center text-white">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                <MdMenuBook size={34} aria-hidden="true" />
              </div>

              <h1 className="text-2xl font-bold">টপলাইন শিক্ষা</h1>

              <p className="mt-2 text-sm text-slate-200">
                শিক্ষা ব্যবস্থাপনা প্যানেল
              </p>

              <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-[#e74c3c]" />
            </div>

            {/* Form Content */}

            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold">লগইন করুন</h2>

                <p className={`mt-1 text-sm ${mutedText}`}>
                  আপনার অ্যাকাউন্টের তথ্য দিয়ে প্রবেশ করুন।
                </p>
              </div>

              {/* Role Selector */}

              <div className="mb-6 grid grid-cols-3 gap-2">
                {ROLES.map((role) => {
                  const active = selectedRole === role.value;

                  return (
                    <button
                      key={role.value}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setSelectedRole(role.value);
                        setIdentifier("");
                        setPassword("");
                        setShowPassword(false);
                      }}
                      className={[
                        "rounded-xl border px-2 py-3",
                        "text-sm font-semibold transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        active
                          ? "border-[#e74c3c] bg-[#e74c3c]/10 text-[#e74c3c]"
                          : isDark
                            ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>

              {/* Login Form */}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Student ID / Email */}

                <div>
                  <label
                    htmlFor="identifier"
                    className="mb-2 block text-sm font-semibold"
                  >
                    {selectedRole === "student" ? "Student ID" : "ইমেইল ঠিকানা"}
                  </label>

                  <div className="relative">
                    <MdPerson
                      size={20}
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedText}`}
                    />

                    <input
                      id="identifier"
                      type={selectedRole === "student" ? "text" : "email"}
                      autoComplete={
                        selectedRole === "student" ? "username" : "email"
                      }
                      inputMode={
                        selectedRole === "student" ? "numeric" : "email"
                      }
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      placeholder={
                        selectedRole === "student"
                          ? "যেমন: 32001"
                          : "name@example.com"
                      }
                      disabled={loading}
                      className={inputClasses}
                    />
                  </div>
                </div>

                {/* Password / PIN */}

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor="password" className="text-sm font-semibold">
                      {selectedRole === "student" ? "PIN" : "পাসওয়ার্ড"}
                    </label>

                    {selectedRole !== "student" && (
                      <button
                        type="button"
                        onClick={handlePasswordReset}
                        disabled={resetLoading || loading}
                        className="text-xs font-semibold text-[#e74c3c] hover:underline disabled:opacity-50"
                      >
                        {resetLoading
                          ? "পাঠানো হচ্ছে..."
                          : "পাসওয়ার্ড ভুলে গেছেন?"}
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <MdLock
                      size={20}
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedText}`}
                    />

                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={
                        selectedRole === "student"
                          ? "আপনার PIN লিখুন"
                          : "আপনার পাসওয়ার্ড লিখুন"
                      }
                      disabled={loading}
                      className={`${inputClasses} pr-12`}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className={[
                        "absolute right-3 top-1/2",
                        "-translate-y-1/2 transition-colors",
                        isDark
                          ? "text-slate-400 hover:text-slate-200"
                          : "text-slate-500 hover:text-slate-800",
                      ].join(" ")}
                      aria-label={
                        showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"
                      }
                    >
                      {showPassword ? (
                        <MdVisibilityOff size={21} aria-hidden="true" />
                      ) : (
                        <MdVisibility size={21} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Lockout Message */}

                {locked && (
                  <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    অনেকবার ভুল চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।
                  </div>
                )}

                {!locked && lockData.attempts > 0 && remainingAttempts > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    বাকি চেষ্টা: {remainingAttempts}
                  </p>
                )}

                {/* Submit Button */}

                <button
                  type="submit"
                  disabled={loading || resetLoading || locked}
                  className={[
                    "btn w-full border-0",
                    "bg-[#e74c3c] text-white",
                    "hover:bg-[#cf3f30]",
                    "disabled:bg-slate-400",
                  ].join(" ")}
                >
                  {loading ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />
                      যাচাই করা হচ্ছে...
                    </>
                  ) : (
                    <>
                      লগইন করুন
                      <MdArrowForward size={20} aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              {/* Security Message */}

              <div
                className={[
                  "mt-6 flex items-start gap-3 rounded-xl p-4 text-sm",
                  isDark
                    ? "bg-slate-800 text-slate-300"
                    : "bg-slate-50 text-slate-600",
                ].join(" ")}
              >
                <MdShield
                  size={22}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[#e74c3c]"
                />

                <p>
                  আপনার অ্যাকাউন্টের তথ্য নিরাপদে রাখুন। অন্য কারও সঙ্গে
                  পাসওয়ার্ড বা PIN শেয়ার করবেন না।
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
