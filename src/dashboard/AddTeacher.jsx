import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import { app, db } from "../assets/firebase/firebase.init";
import { departmentList } from "../config/departments";

const initialForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  address: "",
  departments: [],
  classTeacherOf: [],
  designations: [],
  departmentHeadOf: [],
};

const designationOptions = [
  { value: "exam-controller", label: "পরীক্ষা নিয়ন্ত্রক" },
  { value: "class-teacher", label: "শ্রেণিশিক্ষক" },
];

const styles = {
  section: "rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5",
  label: "mb-1.5 block text-sm font-medium text-base-content",
  input:
    "w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2.5 text-sm text-base-content outline-none transition placeholder:text-base-content/40 focus:border-primary focus:ring-2 focus:ring-primary/20",
  checkboxCard:
    "flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3 transition hover:bg-base-200",
};

function normalizeId(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getDepartmentName(department) {
  return (
    department.englishName ||
    department.name ||
    department.departmentName ||
    department.id
  );
}

function getClassName(classItem) {
  return (
    classItem.name ||
    classItem.className ||
    classItem.englishName ||
    classItem.id
  );
}

function getErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use":
      "এই ইমেইল দিয়ে আগে থেকেই একটি অ্যাকাউন্ট রয়েছে।",
    "auth/invalid-email": "ইমেইল ঠিকানা সঠিক নয়।",
    "auth/weak-password": "পাসওয়ার্ড আরও শক্তিশালী করুন।",
    "auth/operation-not-allowed":
      "Firebase Console-এ Email/Password sign-in চালু করুন।",
    "auth/network-request-failed":
      "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
    "permission-denied": "Firestore-এ অনুমতি নেই। Security Rules পরীক্ষা করুন।",
    unavailable:
      "Firebase সার্ভিসে সংযোগ করা যাচ্ছে না। কিছুক্ষণ পর চেষ্টা করুন।",
  };

  return (
    messages[error?.code] ||
    error?.message ||
    "শিক্ষক যুক্ত করা যায়নি। আবার চেষ্টা করুন।"
  );
}

export default function AddTeacher() {
  const navigate = useNavigate();

  // Departments and classes come from the local configuration file.
  const [departments] = useState(departmentList);

  const [classes] = useState(() =>
    departmentList.flatMap((department) =>
      (department.classes || []).map((classItem) => ({
        ...classItem,
        departmentId: normalizeId(department.id),
        departmentName: getDepartmentName(department),
      })),
    ),
  );

  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nextTeacherId, setNextTeacherId] = useState("600001");

  // Load only the teacher ID counter from Firestore.
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setLoadError(false);

      try {
        const counterSnapshot = await getDoc(doc(db, "counters", "teacherId"));

        if (!mounted) return;

        const lastId = counterSnapshot.exists()
          ? Number(counterSnapshot.data().lastId || 600000)
          : 600000;

        setNextTeacherId(String(lastId + 1));

        console.log("Local departments:", departmentList);
        console.log(
          "Local classes:",
          departmentList.flatMap((department) =>
            (department.classes || []).map((classItem) => ({
              ...classItem,
              departmentId: normalizeId(department.id),
            })),
          ),
        );
      } catch (error) {
        console.error("Load teacher counter error:", error);

        if (mounted) {
          setLoadError(true);
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  // IDs of selected departments.
  const selectedDepartmentKeys = useMemo(() => {
    const keys = new Set();

    form.departments.forEach((selectedId) => {
      const department = departments.find(
        (item) => normalizeId(item.id) === normalizeId(selectedId),
      );

      keys.add(normalizeId(selectedId));

      if (department) {
        if (department.departmentId != null) {
          keys.add(normalizeId(department.departmentId));
        }

        if (department.code != null) {
          keys.add(normalizeId(department.code));
        }
      }
    });

    return keys;
  }, [form.departments, departments]);

  // Show classes belonging to the selected departments.
  const availableClasses = useMemo(() => {
    if (form.departments.length === 0) return [];

    return classes.filter((classItem) =>
      selectedDepartmentKeys.has(normalizeId(classItem.departmentId)),
    );
  }, [classes, form.departments.length, selectedDepartmentKeys]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function toggleSelection(field, value) {
    const selectedValue = normalizeId(value);

    setForm((previous) => {
      const current = previous[field];

      const updated = current.includes(selectedValue)
        ? current.filter((item) => item !== selectedValue)
        : [...current, selectedValue];

      // When department selection changes, remove assignments that
      // no longer belong to the selected departments.
      if (field === "departments") {
        const selectedDepartments = departments.filter((department) =>
          updated.includes(normalizeId(department.id)),
        );

        const allowedDepartmentIds = new Set();

        selectedDepartments.forEach((department) => {
          allowedDepartmentIds.add(normalizeId(department.id));

          if (department.departmentId != null) {
            allowedDepartmentIds.add(normalizeId(department.departmentId));
          }

          if (department.code != null) {
            allowedDepartmentIds.add(normalizeId(department.code));
          }
        });

        const allowedClassIds = new Set(
          classes
            .filter((classItem) =>
              allowedDepartmentIds.has(normalizeId(classItem.departmentId)),
            )
            .map((classItem) => normalizeId(classItem.id)),
        );

        return {
          ...previous,
          departments: updated,

          classTeacherOf: previous.classTeacherOf.filter((id) =>
            allowedClassIds.has(normalizeId(id)),
          ),

          departmentHeadOf: previous.departmentHeadOf.filter((id) =>
            updated.includes(normalizeId(id)),
          ),
        };
      }

      if (field === "designations") {
        return {
          ...previous,
          designations: updated,

          classTeacherOf: updated.includes("class-teacher")
            ? previous.classTeacherOf
            : [],
        };
      }

      return {
        ...previous,
        [field]: updated,
      };
    });
  }

  // Generate a sequential teacher ID transactionally.
  async function generateTeacherId() {
    return runTransaction(db, async (transaction) => {
      const counterRef = doc(db, "counters", "teacherId");
      const counterSnapshot = await transaction.get(counterRef);

      const lastId = counterSnapshot.exists()
        ? Number(counterSnapshot.data().lastId || 600000)
        : 600000;

      const newId = lastId + 1;

      if (newId > 699999) {
        throw new Error("শিক্ষক আইডির সীমা শেষ হয়ে গেছে।");
      }

      transaction.set(counterRef, {
        lastId: newId,
        updatedAt: serverTimestamp(),
      });

      return String(newId);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) return;

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const phone = form.phone.trim();
    const address = form.address.trim();

    if (!name || !email || !password || !phone || !address) {
      toast.error("সব প্রয়োজনীয় তথ্য পূরণ করুন।");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("সঠিক ইমেইল ঠিকানা লিখুন।");
      return;
    }

    if (password.length < 6) {
      toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      toast.error("সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।");
      return;
    }

    if (form.departments.length === 0) {
      toast.error("অন্তত একটি বিভাগ নির্বাচন করুন।");
      return;
    }

    if (
      form.designations.includes("class-teacher") &&
      form.classTeacherOf.length === 0
    ) {
      toast.error("শ্রেণিশিক্ষকের জন্য অন্তত একটি ক্লাস নির্বাচন করুন।");
      return;
    }

    // Ensure all selected departments exist in the local configuration.
    const validDepartmentIds = new Set(
      departments.map((department) => normalizeId(department.id)),
    );

    if (
      !form.departments.every((id) => validDepartmentIds.has(normalizeId(id)))
    ) {
      toast.error("নির্বাচিত বিভাগের তথ্য সঠিক নয়।");
      return;
    }

    // Ensure class assignments belong to the selected departments.
    const validClassIds = new Set(
      availableClasses.map((classItem) => normalizeId(classItem.id)),
    );

    if (
      !form.classTeacherOf.every((id) => validClassIds.has(normalizeId(id)))
    ) {
      toast.error("নির্বাচিত ক্লাসের তথ্য সঠিক নয়।");
      return;
    }

    setSaving(true);

    let secondaryApp;
    let secondaryAuth;
    let createdUser;
    let profileSaved = false;

    try {
      // Create a secondary Firebase app to preserve the Admin session.
      secondaryApp = initializeApp(
        app.options,
        `teacher-creation-${Date.now()}`,
      );

      secondaryAuth = getAuth(secondaryApp);

      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );

      createdUser = credential.user;

      // Reserve the next sequential teacher ID.
      const teacherId = await generateTeacherId();

      const departmentHeadIds = form.departmentHeadOf.filter((id) =>
        form.departments.includes(normalizeId(id)),
      );

      // Save teacher profile.
      await runTransaction(db, async (transaction) => {
        const teacherRef = doc(db, "teachers", teacherId);
        const existingTeacher = await transaction.get(teacherRef);

        if (existingTeacher.exists()) {
          throw new Error("এই শিক্ষক আইডি আগে থেকেই ব্যবহৃত হচ্ছে।");
        }

        transaction.set(teacherRef, {
          teacherId,
          uid: createdUser.uid,
          name,
          email,
          phone,
          address,
          role: "teacher",

          departments: form.departments,

          classTeacherOf: form.designations.includes("class-teacher")
            ? form.classTeacherOf
            : [],

          designations: form.designations,
          departmentHeadOf: departmentHeadIds,

          isActive: true,
          accountAccess: false,

          createdAt: serverTimestamp(),
        });
      });

      profileSaved = true;

      toast.success(`শিক্ষক সফলভাবে যুক্ত হয়েছে। আইডি: ${teacherId}`);

      setForm(initialForm);
      setNextTeacherId(String(Number(teacherId) + 1));

      navigate("/teachers");
    } catch (error) {
      console.error("Add teacher error:", error);

      if (createdUser && !profileSaved) {
        try {
          await deleteUser(createdUser);
        } catch (deleteError) {
          console.error("Authentication account cleanup failed:", deleteError);

          toast.error(
            "শিক্ষকের প্রোফাইল তৈরি হয়নি এবং Auth account মুছতেও ব্যর্থ হয়েছে। Firebase Console পরীক্ষা করুন।",
          );
        }
      }

      toast.error(getErrorMessage(error));
    } finally {
      if (secondaryAuth) {
        try {
          await signOut(secondaryAuth);
        } catch (error) {
          console.warn("Secondary Auth sign-out failed:", error);
        }
      }

      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (error) {
          console.warn("Secondary Firebase app cleanup failed:", error);
        }
      }

      setSaving(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-60 items-center justify-center bg-base-100 text-base-content">
        <span className="loading loading-spinner loading-lg text-primary" />
        <span className="ml-3 text-sm">তথ্য লোড হচ্ছে...</span>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-xl border border-error/30 bg-base-100 p-6 text-center">
          <h2 className="text-lg font-bold text-base-content">
            Teacher ID counter লোড করা যায়নি
          </h2>

          <p className="mt-2 text-sm text-base-content/70">
            Firestore-এর counters/teacherId document এবং Security Rules পরীক্ষা
            করুন। বিভাগ ও ক্লাস local file থেকেই নেওয়া হচ্ছে।
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary mt-4"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 bg-base-100 p-4 text-base-content sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">
          নতুন শিক্ষক যুক্ত করুন
        </h1>

        <p className="mt-1 text-sm text-base-content/60">
          শিক্ষকের তথ্য ও দায়িত্ব নির্ধারণ করুন।
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Personal information */}
        <section className={styles.section}>
          <h2 className="mb-4 text-lg font-semibold">ব্যক্তিগত তথ্য</h2>

          <div className="mb-4 rounded-lg bg-base-200 p-3">
            <p className="text-sm text-base-content/60">
              পরবর্তী সম্ভাব্য Teacher ID
            </p>

            <p className="text-xl font-bold text-secondary">{nextTeacherId}</p>

            <p className="mt-1 text-xs text-base-content/60">
              সংরক্ষণের সময় আইডি নিশ্চিতভাবে নির্ধারণ করা হবে।
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="teacher-name" className={styles.label}>
                শিক্ষকের নাম *
              </label>

              <input
                id="teacher-name"
                name="name"
                value={form.name}
                onChange={handleChange}
                className={styles.input}
                placeholder="শিক্ষকের পূর্ণ নাম"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="teacher-phone" className={styles.label}>
                মোবাইল নম্বর *
              </label>

              <input
                id="teacher-phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                className={styles.input}
                placeholder="01XXXXXXXXX"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={11}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="teacher-address" className={styles.label}>
                ঠিকানা *
              </label>

              <textarea
                id="teacher-address"
                name="address"
                value={form.address}
                onChange={handleChange}
                className={styles.input}
                rows={3}
                placeholder="বর্তমান ঠিকানা"
                autoComplete="street-address"
                required
              />
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section className={styles.section}>
          <h2 className="mb-1 text-lg font-semibold">লগইন তথ্য</h2>

          <p className="mb-4 text-sm text-base-content/60">
            শিক্ষক এই ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করবেন। পাসওয়ার্ড Firestore-এ
            সংরক্ষণ করা হবে না।
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="teacher-email" className={styles.label}>
                ইমেইল *
              </label>

              <input
                id="teacher-email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={styles.input}
                placeholder="teacher@example.com"
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label htmlFor="teacher-password" className={styles.label}>
                প্রাথমিক পাসওয়ার্ড *
              </label>

              <input
                id="teacher-password"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className={styles.input}
                placeholder="কমপক্ষে ৬ অক্ষর"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          </div>
        </section>

        {/* Departments from local file */}
        <section className={styles.section}>
          <h2 className="mb-1 text-lg font-semibold">বিভাগ নির্বাচন</h2>

          <p className="mb-4 text-sm text-base-content/60">
            একজন শিক্ষক একাধিক বিভাগের অধীনে কাজ করতে পারবেন।
          </p>

          {departments.length === 0 ? (
            <p className="rounded-lg bg-warning/10 p-4 text-sm">
              departments.js ফাইলে কোনো বিভাগ পাওয়া যায়নি।
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((department) => {
                const departmentId = normalizeId(department.id);

                return (
                  <label key={department.id} className={styles.checkboxCard}>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={form.departments.includes(departmentId)}
                      onChange={() =>
                        toggleSelection("departments", departmentId)
                      }
                    />

                    <span className="text-sm font-medium">
                      {getDepartmentName(department)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* Designations */}
        <section className={styles.section}>
          <h2 className="mb-1 text-lg font-semibold">পদবি ও দায়িত্ব</h2>

          <p className="mb-4 text-sm text-base-content/60">
            প্রয়োজন অনুযায়ী একাধিক পদবি নির্বাচন করুন।
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {designationOptions.map((designation) => (
              <label key={designation.value} className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary"
                  checked={form.designations.includes(designation.value)}
                  onChange={() =>
                    toggleSelection("designations", designation.value)
                  }
                />

                <span className="text-sm font-medium">{designation.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Class teacher assignment */}
        {form.designations.includes("class-teacher") && (
          <section className={styles.section}>
            <h2 className="mb-1 text-lg font-semibold">
              শ্রেণিশিক্ষকের দায়িত্ব
            </h2>

            <p className="mb-4 text-sm text-base-content/60">
              নির্বাচিত বিভাগগুলোর এক বা একাধিক ক্লাস নির্বাচন করুন।
            </p>

            {form.departments.length === 0 ? (
              <p className="text-sm text-warning">
                প্রথমে অন্তত একটি বিভাগ নির্বাচন করুন।
              </p>
            ) : availableClasses.length === 0 ? (
              <p className="text-sm text-base-content/60">
                নির্বাচিত বিভাগে কোনো ক্লাস নেই। departments.js ফাইলের classes
                array পরীক্ষা করুন।
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {availableClasses.map((classItem) => {
                  const classId = normalizeId(classItem.id);

                  return (
                    <label key={classItem.id} className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={form.classTeacherOf.includes(classId)}
                        onChange={() =>
                          toggleSelection("classTeacherOf", classId)
                        }
                      />

                      <span className="text-sm font-medium">
                        {getClassName(classItem)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {form.classTeacherOf.length > 0 && (
              <p className="mt-3 text-sm font-medium text-primary">
                নির্বাচিত ক্লাস: {form.classTeacherOf.length}টি
              </p>
            )}
          </section>
        )}

        {/* Department head assignment */}
        <section className={styles.section}>
          <h2 className="mb-1 text-lg font-semibold">বিভাগীয় প্রধান</h2>

          <p className="mb-4 text-sm text-base-content/60">
            নির্বাচিত বিভাগের বিভাগীয় প্রধান নির্ধারণ করুন।
          </p>

          {form.departments.length === 0 ? (
            <p className="text-sm text-base-content/60">
              প্রথমে বিভাগ নির্বাচন করুন।
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments
                .filter((department) =>
                  form.departments.includes(normalizeId(department.id)),
                )
                .map((department) => {
                  const departmentId = normalizeId(department.id);

                  return (
                    <label key={department.id} className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={form.departmentHeadOf.includes(departmentId)}
                        onChange={() =>
                          toggleSelection("departmentHeadOf", departmentId)
                        }
                      />

                      <span className="text-sm font-medium">
                        {getDepartmentName(department)}
                      </span>
                    </label>
                  );
                })}
            </div>
          )}
        </section>

        {/* Account settings */}
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <h2 className="font-semibold">অ্যাকাউন্ট সেটিংস</h2>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              অ্যাকাউন্ট অ্যাক্সেস:{" "}
              <span className="font-semibold">বন্ধ (false)</span>
            </p>

            <p>
              সক্রিয় অবস্থা:{" "}
              <span className="font-semibold">সক্রিয় (true)</span>
            </p>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={saving}
            className="btn btn-outline"
          >
            বাতিল
          </button>

          <button
            type="submit"
            disabled={saving || departments.length === 0}
            className="btn btn-primary"
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                শিক্ষক যুক্ত হচ্ছে...
              </>
            ) : (
              "শিক্ষক যুক্ত করুন"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
