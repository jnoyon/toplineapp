import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import toast from "react-hot-toast";
import { auth, db } from "../firebase/firebase.init";

const SUPERADMIN_EMAIL = "jihadur51@gmail.com";

export default function AddVillage() {
  const [villageName, setVillageName] = useState("");
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.email?.toLowerCase() !== SUPERADMIN_EMAIL) {
        setIsSuperadmin(false);
        setVillages([]);
        setLoading(false);
        return;
      }

      setIsSuperadmin(true);

      try {
        const snapshot = await getDocs(collection(db, "villages"));

        const villageList = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...document.data(),
          }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || "", "bn"));

        setVillages(villageList);
      } catch (error) {
        console.error("Village loading error:", error);
        toast.error("গ্রামের তালিকা লোড করা যায়নি।");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isSuperadmin) {
      toast.error("শুধু Superadmin এই কাজটি করতে পারবেন।");
      return;
    }

    const name = villageName.trim();

    if (!name) {
      toast.error("গ্রামের নাম লিখুন।");
      return;
    }

    setSaving(true);

    try {
      // একই নামের গ্রাম আগে থেকে আছে কি না পরীক্ষা
      const villageQuery = query(
        collection(db, "villages"),
        where("name", "==", name),
      );

      const existingVillages = await getDocs(villageQuery);

      if (!existingVillages.empty) {
        toast.error("এই গ্রামের নাম আগে থেকেই যুক্ত করা আছে।");
        return;
      }

      const docRef = await addDoc(collection(db, "villages"), {
        name,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
      });

      setVillages((previous) =>
        [...previous, { id: docRef.id, name }].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", "bn"),
        ),
      );

      setVillageName("");
      toast.success("গ্রামের নাম সফলভাবে যুক্ত হয়েছে।");
    } catch (error) {
      console.error("Village save error:", error);
      toast.error("গ্রামের নাম সংরক্ষণ করা যায়নি।");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (!isSuperadmin) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-xl font-bold text-red-700">Access Denied</h2>
        <p className="mt-2 text-sm text-red-600">
          এই পেজটি শুধুমাত্র Superadmin ব্যবহার করতে পারবেন।
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      {/* Page Heading */}
      <div>
        <h1 className="text-2xl font-bold text-base-content sm:text-3xl">
          গ্রামের নাম যুক্ত করুন
        </h1>
        <p className="mt-2 text-sm text-base-content/60">
          শিক্ষার্থীদের ঠিকানা ব্যবস্থাপনার জন্য গ্রামের তালিকা তৈরি করুন।
        </p>
      </div>

      {/* Add Village Form */}
      <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-7">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="villageName"
              className="mb-2 block text-sm font-semibold text-base-content"
            >
              গ্রামের নাম <span className="text-error">*</span>
            </label>

            <input
              id="villageName"
              type="text"
              value={villageName}
              onChange={(e) => setVillageName(e.target.value)}
              placeholder="যেমন: বিরুনিয়া"
              className="input input-bordered w-full"
              maxLength={100}
              required
              autoComplete="off"
              disabled={saving}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={saving || !villageName.trim()}
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                সংরক্ষণ হচ্ছে...
              </>
            ) : (
              "গ্রামের নাম সংরক্ষণ করুন"
            )}
          </button>
        </form>
      </div>

      {/* Village List */}
      <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
          <h2 className="font-bold text-base-content">গ্রামের তালিকা</h2>

          <span className="badge badge-primary">মোট {villages.length}টি</span>
        </div>

        {villages.length === 0 ? (
          <div className="p-8 text-center text-sm text-base-content/60">
            এখনো কোনো গ্রামের নাম যুক্ত করা হয়নি।
          </div>
        ) : (
          <div className="divide-y divide-base-300">
            {villages.map((village, index) => (
              <div
                key={village.id}
                className="flex items-center gap-4 px-5 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-200 text-sm font-semibold">
                  {index + 1}
                </span>

                <span className="font-medium text-base-content">
                  {village.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
