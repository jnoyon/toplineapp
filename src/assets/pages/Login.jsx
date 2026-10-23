import { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";

import { auth, db } from "../firebase/firebase.init";

const LOCKOUT_TIME = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const SUPERADMIN_EMAIL = "jihadur51@gmail.com";

const roles = [
  { value: "student", label: "শিক্ষার্থী" },
  { value: "teacher", label: "শিক্ষক" },
  { value: "admin", label: "অ্যাডমিন" },
];

function getLockKey(role, identifier) {
  return `topline-login-${role}-${identifier.trim().toLowerCase()}`;
}

function getLockData(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));

    if (!data || !Array.isArray(data.failures)) {
      return { failures: [], lockedUntil: 0 };
    }

    const now = Date.now();

    if (data.lockedUntil > now) {
      return data;
    }

    return {
      failures: data.failures.filter(
        (timestamp) => now - timestamp < LOCKOUT_TIME,
      ),
      lockedUntil: 0,
    };
  } catch {
    return { failures: [], lockedUntil: 0 };
  }
}

export default function Login() {
  const navigate = useNavigate();

  const [role, setRole] = useState("student");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const isStudent = role === "student";

  function handleFormReset() {
    setRole("student");
    setIdentifier("");
    setPassword("");
    setShowPassword(false);
  }

  function recordFailedAttempt(lockKey) {
    const currentData = getLockData(lockKey);
    const failures = [...currentData.failures, Date.now()];

    if (failures.length >= MAX_ATTEMPTS) {
      localStorage.setItem(
        lockKey,
        JSON.stringify({
          failures,
          lockedUntil: Date.now() + LOCKOUT_TIME,
        }),
      );

      toast.error("৩ বার লগইন ব্যর্থ হয়েছে। এক ঘণ্টা পরে আবার চেষ্টা করুন।");

      return;
    }

    localStorage.setItem(
      lockKey,
      JSON.stringify({
        failures,
        lockedUntil: 0,
      }),
    );

    toast.error(
      `লগইন ব্যর্থ হয়েছে। আরও ${
        MAX_ATTEMPTS - failures.length
      } বার চেষ্টা করতে পারবেন।`,
    );
  }

  async function handlePasswordReset() {
    if (isStudent) {
      toast.error("পাসওয়ার্ড রিসেটের জন্য Admin-এর সঙ্গে যোগাযোগ করুন।");
      return;
    }

    const email = identifier.trim();

    if (!email) {
      toast.error("প্রথমে আপনার ইমেইল ঠিকানা লিখুন।");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("সঠিক ইমেইল ঠিকানা লিখুন।");
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);

      toast.success(
        "যদি এই ইমেইলে অ্যাকাউন্ট থাকে, তাহলে পাসওয়ার্ড রিসেটের নির্দেশনা পাঠানো হয়েছে।",
      );
    } catch (error) {
      console.error("Password reset error:", error);

      if (error.code === "auth/too-many-requests") {
        toast.error("অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
      } else {
        toast.error(
          "পাসওয়ার্ড রিসেট করা যায়নি। ইমেইল ও Firebase সেটিংস যাচাই করুন।",
        );
      }
    } finally {
      setResetLoading(false);
    }
  }

  // =========================
  // STUDENT LOGIN
  // =========================

  async function handleStudentLogin(studentId, studentPassword) {
    const lockKey = getLockKey("student", studentId);
    const lockData = getLockData(lockKey);
    const now = Date.now();

    if (lockData.lockedUntil > now) {
      const minutes = Math.ceil((lockData.lockedUntil - now) / 60000);

      toast.error(`লগইন সাময়িকভাবে বন্ধ। ${minutes} মিনিট পরে চেষ্টা করুন।`);

      return;
    }

    setLoading(true);

    try {
      // প্রথমে String Student ID দিয়ে খোঁজা
      let studentQuery = query(
        collection(db, "students"),
        where("studentId", "==", studentId),
        limit(1),
      );

      let snapshot = await getDocs(studentQuery);

      // Student ID Number হিসেবে সংরক্ষিত থাকলে সেটিও পরীক্ষা
      if (snapshot.empty && /^\d+$/.test(studentId)) {
        studentQuery = query(
          collection(db, "students"),
          where("studentId", "==", Number(studentId)),
          limit(1),
        );

        snapshot = await getDocs(studentQuery);
      }

      if (snapshot.empty) {
        recordFailedAttempt(lockKey);
        return;
      }

      const studentDoc = snapshot.docs[0];
      const student = studentDoc.data();

      // Password field যাচাই
      const savedPassword =
        student.password ?? student.pin ?? student.studentPassword;

      if (
        savedPassword === undefined ||
        String(savedPassword) !== studentPassword
      ) {
        recordFailedAttempt(lockKey);
        return;
      }

      // নিষ্ক্রিয় শিক্ষার্থী লগইন করতে পারবে না
      const isActive =
        student.isActive ?? student.active ?? student.enabled ?? true;

      if (isActive === false || isActive === "false" || isActive === 0) {
        toast.error(
          "আপনার অ্যাকাউন্টটি নিষ্ক্রিয়। Admin-এর সঙ্গে যোগাযোগ করুন।",
        );

        return;
      }

      // সফল লগইনের পর ব্যর্থ চেষ্টার হিসাব মুছে ফেলা
      localStorage.removeItem(lockKey);

      // শিক্ষার্থীর Session তৈরি
      const studentSession = {
        documentId: studentDoc.id,
        studentId: String(student.studentId ?? studentId),
        name: student.name ?? student.studentName ?? "",
        departmentId: student.departmentId ?? null,
        role: "student",
      };

      sessionStorage.setItem("studentSession", JSON.stringify(studentSession));

      toast.success("শিক্ষার্থী লগইন সফল হয়েছে!");

      // শিক্ষার্থীকে Student Portal-এ পাঠানো
      navigate("/portal", { replace: true });
    } catch (error) {
      console.error("Student login error:", error);

      if (error.code === "permission-denied") {
        toast.error(
          "Firestore Permission Denied: students collection-এর Rules পরীক্ষা করুন।",
        );
      } else {
        toast.error(`লগইন করা যায়নি: ${error.code || error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // FORM SUBMIT
  // =========================

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier || !password) {
      toast.error("Student ID/ইমেইল ও Password লিখুন।");
      return;
    }

    // Student Login
    if (isStudent) {
      if (!/^\d+$/.test(cleanIdentifier)) {
        toast.error("সঠিক Student ID লিখুন।");
        return;
      }

      await handleStudentLogin(cleanIdentifier, password);
      return;
    }

    // Teacher / Admin Login
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanIdentifier)) {
      toast.error("সঠিক ইমেইল ঠিকানা লিখুন।");
      return;
    }

    const lockKey = getLockKey(role, cleanIdentifier);
    const lockData = getLockData(lockKey);
    const now = Date.now();

    if (lockData.lockedUntil > now) {
      const minutes = Math.ceil((lockData.lockedUntil - now) / 60000);

      toast.error(`লগইন সাময়িকভাবে বন্ধ। ${minutes} মিনিট পরে চেষ্টা করুন।`);

      return;
    }

    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        cleanIdentifier,
        password,
      );

      const user = credential.user;

      localStorage.removeItem(lockKey);

      if (user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
        toast.success("সুপারঅ্যাডমিন লগইন সফল হয়েছে!");

        navigate("/dashboard", { replace: true });
        return;
      }

      toast.success("লগইন সফল হয়েছে!");

      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Staff login error:", error);

      if (error.code === "auth/too-many-requests") {
        toast.error("অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
      } else {
        recordFailedAttempt(lockKey);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-base-200 px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl">
        <div className="h-1.5 bg-[#E57373]" />

        <div className="p-6 sm:p-8">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2C3E50] text-2xl font-bold text-white shadow-md">
              T
            </div>

            <h1 className="text-2xl font-bold text-[#2C3E50]">
              টপলাইন এডুকেশন
            </h1>

            <p className="mt-2 text-sm text-base-content/60">
              আপনার অ্যাকাউন্টে লগইন করুন
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role */}
            <div>
              <label
                htmlFor="role"
                className="mb-2 block text-sm font-semibold"
              >
                আপনি কে?
              </label>

              <select
                id="role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setIdentifier("");
                  setPassword("");
                  setShowPassword(false);
                }}
                disabled={loading || resetLoading}
                className="select select-bordered w-full rounded-xl focus:border-[#2C3E50] focus:outline-none"
              >
                {roles.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Student ID / Email */}
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-semibold"
              >
                {isStudent ? "Student ID" : "ইমেইল"}
              </label>

              <input
                id="identifier"
                type={isStudent ? "text" : "email"}
                inputMode={isStudent ? "numeric" : "email"}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={
                  isStudent
                    ? "আপনার Student ID লিখুন"
                    : "আপনার ইমেইল ঠিকানা লিখুন"
                }
                autoComplete="username"
                disabled={loading || resetLoading}
                required
                className="input input-bordered w-full rounded-xl focus:border-[#2C3E50] focus:outline-none"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold"
              >
                পাসওয়ার্ড
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="আপনার পাসওয়ার্ড লিখুন"
                  autoComplete="current-password"
                  disabled={loading || resetLoading}
                  required
                  className="input input-bordered w-full rounded-xl pr-20 focus:border-[#2C3E50] focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  disabled={loading || resetLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#2C3E50] hover:text-[#E57373]"
                >
                  {showPassword ? "লুকান" : "দেখুন"}
                </button>
              </div>

              {/* Forgot Password */}
              <div className="mt-3 text-right">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={loading || resetLoading}
                  className="text-sm font-medium text-[#2C3E50] transition-colors hover:text-[#E57373] disabled:opacity-50"
                >
                  {resetLoading ? "অপেক্ষা করুন..." : "পাসওয়ার্ড ভুলে গেছেন?"}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || resetLoading}
              className="btn w-full rounded-xl border-0 bg-[#2C3E50] text-white hover:bg-[#243442] disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  যাচাই হচ্ছে...
                </>
              ) : (
                "লগইন করুন"
              )}
            </button>

            {/* Reset Form */}
            <button
              type="button"
              onClick={handleFormReset}
              disabled={loading || resetLoading}
              className="btn btn-outline w-full rounded-xl border-[#E57373] bg-transparent text-[#C65B5B] hover:border-[#E57373] hover:bg-[#E57373] hover:text-white"
            >
              ফর্ম রিসেট করুন
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
