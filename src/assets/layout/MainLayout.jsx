import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase/firebase.init";
import Header from "../components/shared/Header";
import Footer from "../components/shared/Footer";
import LoadingScreen from "../components/LoadingScreen";
import { getUserRole } from "../../config/permissions";

const THEME_KEY = "topline-theme";

export default function MainLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Apply and synchronize light/dark theme.
  useEffect(() => {
    const applyTheme = (value) => {
      const theme = value === "dark" ? "dark" : "light";
      const root = document.documentElement;

      root.classList.toggle("dark", theme === "dark");
      root.setAttribute("data-theme", theme);
      root.style.colorScheme = theme;
    };

    applyTheme(localStorage.getItem(THEME_KEY) || "light");

    const handleThemeChange = (event) => {
      applyTheme(event.detail);
    };

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

  // Synchronize application user with Firebase Auth.
  useEffect(() => {
    let active = true;
    let requestId = 0;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const currentRequest = ++requestId;

      if (!active) return;

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Admin is identified by email.
      // No Firestore profile verification is required.
      const emailBasedRole = getUserRole({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
      });

      if (emailBasedRole === "admin") {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || "Admin",
          role: "admin",
          isActive: true,
          accountAccess: true,
          profileError: false,
        });

        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const snapshot = await getDoc(userRef);

        if (!active || currentRequest !== requestId) return;

        if (!snapshot.exists()) {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || "",
            role: "",
            isActive: false,
            accountAccess: false,
            profileError: false,
          });

          return;
        }

        const profile = snapshot.data();

        const role = getUserRole({
          ...profile,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        });

        setUser({
          ...profile,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName:
            profile.displayName ||
            profile.name ||
            firebaseUser.displayName ||
            "",
          role,
          profileError: false,
        });
      } catch (error) {
        console.error("Failed to load user profile:", error);

        if (!active || currentRequest !== requestId) return;

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || "",
          role: "",
          profileError: true,
        });
      } finally {
        if (active && currentRequest === requestId) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F7FA] text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Header user={user} />

      <main className="flex-1">
        {loading ? <LoadingScreen /> : <Outlet context={{ user }} />}
      </main>

      <Footer />
    </div>
  );
}
