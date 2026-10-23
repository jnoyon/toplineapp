import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useOutletContext } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../assets/firebase/firebase.init";

export default function ProtectedRoute({ allowedRoles = [] }) {
  const location = useLocation();
  const parentContext = useOutletContext();

  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!active) return;

      setUser(currentUser);
      setRole(null);
      setError(false);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnapshot = await getDoc(userRef);

        if (!active) return;

        if (!userSnapshot.exists()) {
          setRole(null);
          return;
        }

        const userData = userSnapshot.data();

        if (userData.isActive === false) {
          setRole(null);
          return;
        }

        const userRole =
          typeof userData.role === "string"
            ? userData.role.trim().toLowerCase()
            : null;

        setRole(userRole);
      } catch (err) {
        console.error("Protected route verification failed:", err);

        if (active) {
          setError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="loading loading-spinner loading-lg text-[#2C3E50]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-[#2C3E50]">
            অ্যাকাউন্ট যাচাই করা যায়নি
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            আপনার অ্যাকাউন্ট যাচাই করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা
            করুন।
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn mt-4 bg-[#2C3E50] text-white hover:bg-[#1e2b38]"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet context={parentContext} />;
}
