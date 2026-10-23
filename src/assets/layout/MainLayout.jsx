import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase/firebase.init";
import Header from "../components/shared/Header";
import Footer from "../components/shared/Footer";

export default function MainLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        const userData = userSnap.exists() ? userSnap.data() : {};

        setUser({
          ...userData,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          role:
            typeof userData.role === "string"
              ? userData.role.trim().toLowerCase()
              : "",
        });
      } catch (error) {
        console.error("User profile error:", error);

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          role: "",
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />

      <main className="flex-1">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : (
          <Outlet context={{ user }} />
        )}
      </main>

      <Footer />
    </div>
  );
}
