import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";

import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "../assets/firebase/firebase.init";
import { getUserRole } from "../config/permissions";

const STUDENT_SESSION_KEY = "studentSession";

const INACTIVE_VALUES = [
  false,
  0,
  "false",
  "0",
  "inactive",
  "disabled",
  "blocked",
  "suspended",
];

const STAFF_ROLES = ["admin", "teacher", "departmenthead", "exam-controller"];

function isInactive(value) {
  return INACTIVE_VALUES.includes(
    typeof value === "string" ? value.trim().toLowerCase() : value,
  );
}

function isAccountInactive(profile) {
  if (!profile) return false;

  return (
    isInactive(profile.isActive) ||
    isInactive(profile.active) ||
    isInactive(profile.enabled) ||
    profile.accountAccess === false
  );
}

function clearStudentSession() {
  localStorage.removeItem(STUDENT_SESSION_KEY);
  localStorage.removeItem(STUDENT_SESSION_KEY);
}

function readStudentSession() {
  try {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY);

    if (!raw) return null;

    const session = JSON.parse(raw);

    if (
      session?.role !== "student" ||
      !session?.studentId ||
      !session?.documentId
    ) {
      clearStudentSession();
      return null;
    }

    return session;
  } catch {
    clearStudentSession();
    return null;
  }
}

/**
 * Non-admin staff profile:
 * 1. users/{uid}
 * 2. users collection where uid == Firebase Auth UID
 */
async function getStaffProfile(firebaseUser) {
  const directSnapshot = await getDoc(doc(db, "users", firebaseUser.uid));

  if (directSnapshot.exists()) {
    return {
      ...directSnapshot.data(),
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      profileDocumentId: directSnapshot.id,
    };
  }

  const profileQuery = query(
    collection(db, "users"),
    where("uid", "==", firebaseUser.uid),
    limit(1),
  );

  const querySnapshot = await getDocs(profileQuery);

  if (querySnapshot.empty) return null;

  const profileDoc = querySnapshot.docs[0];

  return {
    ...profileDoc.data(),
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    profileDocumentId: profileDoc.id,
  };
}

/**
 * Student session is verified against the current Firestore record.
 */
async function verifyStudentSession(session) {
  if (!session?.documentId || !session?.studentId) {
    return null;
  }

  const studentRef = doc(db, "students", session.documentId);
  const studentSnapshot = await getDoc(studentRef);

  if (!studentSnapshot.exists()) {
    clearStudentSession();
    return null;
  }

  const student = studentSnapshot.data();

  const savedStudentId = String(student.studentId ?? "").trim();
  const requestedStudentId = String(session.studentId).trim();

  if (savedStudentId !== requestedStudentId) {
    clearStudentSession();
    return null;
  }

  if (student.approved !== true || isAccountInactive(student)) {
    clearStudentSession();
    return null;
  }

  const verifiedSession = {
    ...session,
    documentId: studentSnapshot.id,
    studentId: savedStudentId,
    name: student.name ?? student.studentName ?? "",
    departmentId: student.departmentId ?? null,
    departmentName: student.departmentName ?? "",
    classId: student.classId ?? "",
    className: student.className ?? "",
    batchId: student.batchId ?? "",
    batchName: student.batchName ?? "",
    isCR: student.isCR === true,
    role: "student",
  };

  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(verifiedSession));

  return verifiedSession;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-base-200 px-4 text-base-content">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-base-300 bg-base-100 px-8 py-10 shadow-lg">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-sm font-medium">
          আপনার অ্যাকাউন্ট যাচাই করা হচ্ছে...
        </p>
      </div>
    </main>
  );
}

function ErrorScreen({ message, onRetry, onLogin }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-base-200 px-4 text-base-content">
      <section className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-6 text-center shadow-lg sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error/10 text-2xl text-error">
          !
        </div>

        <h1 className="text-xl font-bold">অ্যাকাউন্ট যাচাই করা যায়নি</h1>

        <p className="mt-3 text-sm leading-6 text-base-content/70">{message}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="btn btn-primary flex-1"
          >
            আবার চেষ্টা করুন
          </button>

          <button
            type="button"
            onClick={onLogin}
            className="btn btn-outline flex-1"
          >
            লগইন পেজ
          </button>
        </div>
      </section>
    </main>
  );
}

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const location = useLocation();

  const [status, setStatus] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function updateState(nextStatus, user = null, role = "") {
      if (cancelled) return;

      setStatus(nextStatus);
      setCurrentUser(user);
      setCurrentRole(role);
    }

    async function verifyFirebaseUser(firebaseUser) {
      try {
        // --------------------------------------------
        // Student login: Firebase Auth is not used.
        // --------------------------------------------
        if (!firebaseUser) {
          const session = readStudentSession();

          if (!session) {
            updateState("unauthenticated");
            return;
          }

          const student = await verifyStudentSession(session);

          if (cancelled) return;

          if (!student) {
            updateState("unauthenticated");
            return;
          }

          updateState("authenticated", student, "student");
          return;
        }

        // --------------------------------------------
        // Determine role from permissions.js first.
        // Admin does not need a Firestore profile.
        // --------------------------------------------
        const emailBasedRole = getUserRole({
          email: firebaseUser.email,
          uid: firebaseUser.uid,
        });

        if (emailBasedRole === "admin") {
          const adminUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || "Admin",
            role: "admin",
          };

          updateState("authenticated", adminUser, "admin");
          return;
        }

        // --------------------------------------------
        // Non-admin staff must have a Firestore profile.
        // --------------------------------------------
        const profile = await getStaffProfile(firebaseUser);

        if (cancelled) return;

        if (!profile) {
          await signOut(auth);

          if (cancelled) return;

          updateState("unauthenticated");
          return;
        }

        if (isAccountInactive(profile)) {
          await signOut(auth);

          if (cancelled) return;

          updateState("unauthenticated");
          return;
        }

        const role = getUserRole({
          ...profile,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        });

        if (!STAFF_ROLES.includes(role) || role === "admin") {
          await signOut(auth);

          if (cancelled) return;

          updateState("unauthorized");
          return;
        }

        const staffUser = {
          ...profile,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName:
            firebaseUser.displayName ||
            profile.name ||
            profile.displayName ||
            "",
          role,
        };

        updateState("authenticated", staffUser, role);
      } catch (error) {
        console.error("ProtectedRoute verification error:", error);

        if (cancelled) return;

        setErrorMessage(
          error.code === "permission-denied" ||
            error.code === "firestore/permission-denied"
            ? "Firestore Rules ব্যবহারকারীর তথ্য পড়তে দিচ্ছে না। Rules ও অনুমতি যাচাই করুন।"
            : "ইন্টারনেট সংযোগ অথবা Firebase-এর কারণে অ্যাকাউন্ট যাচাই করা যায়নি।",
        );

        updateState("error");
      }
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        verifyFirebaseUser(firebaseUser);
      },
      (error) => {
        console.error("Firebase Auth listener error:", error);

        if (cancelled) return;

        setErrorMessage(
          "Firebase Authentication থেকে অ্যাকাউন্টের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।",
        );

        updateState("error");
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [retryKey]);

  function retryVerification() {
    setErrorMessage("");
    setStatus("loading");
    setRetryKey((previous) => previous + 1);
  }

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "error") {
    return (
      <ErrorScreen
        message={errorMessage}
        onRetry={retryVerification}
        onLogin={() => {
          clearStudentSession();
          window.location.assign("/login");
        }}
      />
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "unauthorized") {
    return <Navigate to="/unauthorized" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(currentRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet context={{ user: currentUser }} />;
}
