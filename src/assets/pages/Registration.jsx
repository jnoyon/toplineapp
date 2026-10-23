import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import toast from "react-hot-toast";

import { db } from "../firebase/firebase.init";
import { AnimatePresence, motion } from "framer-motion";
import { departmentList } from "../../config/departments";

const initialForm = {
  name: "",
  phone: "",
  villageId: "",
  departmentId: "",
  classId: "",
  batchId: "",
  gender: "",
};

const inputClass =
  "input input-bordered w-full rounded-xl bg-base-100 text-base-content transition-all duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

function getName(item) {
  return (
    item?.name ||
    item?.className ||
    item?.batchName ||
    item?.villageName ||
    item?.departmentName ||
    item?.title ||
    ""
  );
}

function getItemId(item, field) {
  return String(item?.[field] ?? item?.id ?? item?.docId ?? "");
}

function generatePin() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10000).padStart(4, "0");
}

export default function Registration() {
  const [form, setForm] = useState(initialForm);
  const [villages, setVillages] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [showPin, setShowPin] = useState(true);

  // Departments from local configuration.
  const departments = useMemo(
    () =>
      departmentList.map((department) => ({
        ...department,
        id: String(department.id).padStart(2, "0"),
        docId: String(department.id).padStart(2, "0"),
      })),
    [],
  );

  // Classes from local configuration.
  const classes = useMemo(
    () =>
      departmentList.flatMap((department) =>
        department.type === "batch"
          ? []
          : (department.classes || []).map((item) => ({
              ...item,
              classId: String(item.id),
              departmentId: String(department.id).padStart(2, "0"),
              docId: `${department.id}-${item.id}`,
            })),
      ),
    [],
  );

  // Batches from local configuration.
  const batches = useMemo(
    () =>
      departmentList.flatMap((department) =>
        department.type === "batch"
          ? (department.classes || []).map((item) => ({
              ...item,
              batchId: String(item.id),
              departmentId: String(department.id).padStart(2, "0"),
              docId: `${department.id}-${item.id}`,
            }))
          : [],
      ),
    [],
  );

  // Only villages are loaded from Firestore.
  useEffect(() => {
    let active = true;

    async function loadVillages() {
      try {
        const snapshot = await getDocs(collection(db, "villages"));

        if (!active) return;

        setVillages(
          snapshot.docs
            .map((item) => ({
              ...item.data(),
              docId: item.id,
            }))
            .filter((item) => item.isActive !== false),
        );
      } catch (error) {
        console.error("Village loading error:", error);
        toast.error("গ্রামের তথ্য লোড করা যায়নি।");
      } finally {
        if (active) setLoadingData(false);
      }
    }

    loadVillages();

    return () => {
      active = false;
    };
  }, []);

  const selectedDepartment = departments.find(
    (item) => item.id === form.departmentId,
  );

  const isToplineCare = selectedDepartment?.type === "batch";

  const departmentClasses = useMemo(
    () => classes.filter((item) => item.departmentId === form.departmentId),
    [classes, form.departmentId],
  );

  const departmentBatches = useMemo(
    () => batches.filter((item) => item.departmentId === form.departmentId),
    [batches, form.departmentId],
  );

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => {
      if (name === "departmentId") {
        return {
          ...previous,
          departmentId: value,
          classId: "",
          batchId: "",
          gender: "",
        };
      }

      return {
        ...previous,
        [name]: value,
      };
    });
  }

  function validateForm() {
    if (!form.name.trim()) {
      toast.error("শিক্ষার্থীর নাম লিখুন।");
      return false;
    }

    if (!/^[0-9+\-\s]{8,20}$/.test(form.phone.trim())) {
      toast.error("সঠিক মোবাইল নম্বর লিখুন।");
      return false;
    }

    if (!form.villageId) {
      toast.error("গ্রাম বা এলাকা নির্বাচন করুন।");
      return false;
    }

    if (!form.departmentId || !selectedDepartment) {
      toast.error("বিভাগ নির্বাচন করুন।");
      return false;
    }

    if (!form.gender) {
      toast.error("লিঙ্গ নির্বাচন করুন।");
      return false;
    }

    if (isToplineCare && !form.batchId) {
      toast.error("Batch নির্বাচন করুন।");
      return false;
    }

    if (!isToplineCare && !form.classId) {
      toast.error("শ্রেণি নির্বাচন করুন।");
      return false;
    }

    return true;
  }

  // ID format: department + gender + 3-digit serial.
  // Examples: 11001, 12001, 21001, 22001, 31001, 32001.
  async function createUniqueStudentId(departmentId, gender) {
    const genderNumber = gender === "male" ? "1" : "2";
    const prefix = `${Number(departmentId)}${genderNumber}`;

    for (let serial = 1; serial <= 999; serial++) {
      const studentId = `${prefix}${String(serial).padStart(3, "0")}`;
      const idRef = doc(db, "studentIds", studentId);
      const existing = await getDoc(idRef);

      if (existing.exists()) continue;

      try {
        await setDoc(idRef, {
          studentId,
          createdAt: serverTimestamp(),
        });

        return studentId;
      } catch (error) {
        if (error.code === "permission-denied") {
          const checkAgain = await getDoc(idRef);

          if (checkAgain.exists()) continue;
        }

        throw error;
      }
    }

    throw new Error("আর কোনো Student ID পাওয়া যাচ্ছে না।");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting || loadingData || !validateForm()) return;

    const selectedVillage = villages.find(
      (item) => getItemId(item, "villageId") === form.villageId,
    );

    const selectedClass = departmentClasses.find(
      (item) => item.classId === form.classId,
    );

    const selectedBatch = departmentBatches.find(
      (item) => item.batchId === form.batchId,
    );

    if (!selectedVillage) {
      toast.error("নির্বাচিত গ্রাম পাওয়া যায়নি।");
      return;
    }

    if (isToplineCare && !selectedBatch) {
      toast.error("নির্বাচিত Batch পাওয়া যায়নি।");
      return;
    }

    if (!isToplineCare && !selectedClass) {
      toast.error("নির্বাচিত শ্রেণি পাওয়া যায়নি।");
      return;
    }

    setSubmitting(true);

    try {
      const studentId = await createUniqueStudentId(
        form.departmentId,
        form.gender,
      );

      const pin = generatePin();

      const studentData = {
        studentId,
        pin,
        name: form.name.trim(),
        phone: form.phone.trim(),
        departmentId: Number(form.departmentId),
        departmentName: getName(selectedDepartment),
        gender: form.gender,
        villageId: form.villageId,
        villageName: getName(selectedVillage),
        classId: isToplineCare ? "" : form.classId,
        className: isToplineCare ? "" : getName(selectedClass),
        batchId: isToplineCare ? form.batchId : "",
        batchName: isToplineCare ? getName(selectedBatch) : "",
        approved: false,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "students", studentId), studentData);

      setCredentials({
        name: studentData.name,
        studentId,
        pin,
        departmentName: studentData.departmentName,
      });

      setShowPin(true);
      setForm(initialForm);

      toast.success("নিবন্ধনের আবেদন সফলভাবে জমা হয়েছে!");
    } catch (error) {
      console.error("Registration error:", error);
      toast.error(error.message || "নিবন্ধন করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;

    const text = [
      "TopLine Education",
      `Name: ${credentials.name}`,
      `Student ID: ${credentials.studentId}`,
      `PIN: ${credentials.pin}`,
      `Department: ${credentials.departmentName}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Student ID ও PIN কপি হয়েছে!");
    } catch {
      toast.error("কপি করা যায়নি।");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-base-200 px-3 py-6 text-base-content sm:px-5 sm:py-10">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -left-24 top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="relative mx-auto w-full max-w-lg"
      >
        <div className="overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl shadow-base-content/5">
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-secondary px-6 py-7 text-primary-content">
            <motion.div
              animate={{ rotate: [0, 8, -8, 0], y: [0, -5, 0] }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute -right-3 -top-5 select-none text-[120px] opacity-10"
            >
              🎓
            </motion.div>

            <div className="relative flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: -8, scale: 1.06 }}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/15 text-3xl shadow-lg backdrop-blur"
              >
                🎓
              </motion.div>

              <div>
                <div className="mb-1 text-xs font-semibold tracking-widest text-white/75">
                  TOPLINE EDUCATION
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  শিক্ষার্থী নিবন্ধন
                </h1>
                <p className="mt-1 text-sm text-white/75">
                  নতুন যাত্রা শুরু হোক আজ থেকেই!
                </p>
              </div>
            </div>

            <div className="relative mt-5 flex items-center gap-2 text-xs text-white/80">
              <span>🔒</span>
              <span>নিবন্ধনের পর Admin-এর অনুমোদন প্রয়োজন</span>
            </div>
          </div>

          <div className="p-5 sm:p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <motion.label
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.05 }}
                className="form-control block"
              >
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span>👤</span>
                  শিক্ষার্থীর নাম <span className="text-error">*</span>
                </span>
                <input
                  className={inputClass}
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="আপনার পূর্ণ নাম"
                  maxLength={100}
                  autoComplete="name"
                  required
                />
              </motion.label>

              {/* Phone */}
              <label className="form-control block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span>📱</span>
                  মোবাইল নম্বর <span className="text-error">*</span>
                </span>
                <input
                  className={inputClass}
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="01XXXXXXXXX"
                  maxLength={20}
                  autoComplete="tel"
                  required
                />
              </label>

              {/* Village */}
              <label className="form-control block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span>📍</span>
                  গ্রাম / এলাকা <span className="text-error">*</span>
                </span>
                <select
                  className={inputClass}
                  name="villageId"
                  value={form.villageId}
                  onChange={handleChange}
                  disabled={loadingData || villages.length === 0}
                  required
                >
                  <option value="">
                    {loadingData
                      ? "গ্রামের তথ্য লোড হচ্ছে..."
                      : villages.length
                        ? "গ্রাম নির্বাচন করুন"
                        : "কোনো গ্রাম পাওয়া যায়নি"}
                  </option>

                  {villages.map((item) => (
                    <option
                      key={item.docId}
                      value={getItemId(item, "villageId")}
                    >
                      {getName(item)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Department */}
              <label className="form-control block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span>🏫</span>
                  বিভাগ <span className="text-error">*</span>
                </span>
                <select
                  className={inputClass}
                  name="departmentId"
                  value={form.departmentId}
                  onChange={handleChange}
                  required
                >
                  <option value="">আপনার বিভাগ নির্বাচন করুন</option>

                  {departments.map((item) => (
                    <option key={item.docId} value={item.id}>
                      {getName(item)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Class / Batch */}
              <AnimatePresence mode="wait">
                {form.departmentId && (
                  <motion.div
                    key={form.departmentId}
                    initial={{ opacity: 0, height: 0, y: 8 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <label className="form-control block">
                      <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                        <span>{isToplineCare ? "👥" : "📚"}</span>
                        {isToplineCare ? "আপনার Batch" : "আপনার শ্রেণি"}
                        <span className="text-error">*</span>
                      </span>

                      <select
                        className={inputClass}
                        name={isToplineCare ? "batchId" : "classId"}
                        value={isToplineCare ? form.batchId : form.classId}
                        onChange={handleChange}
                        required
                      >
                        <option value="">
                          {isToplineCare
                            ? "Batch নির্বাচন করুন"
                            : "শ্রেণি নির্বাচন করুন"}
                        </option>

                        {(isToplineCare
                          ? departmentBatches
                          : departmentClasses
                        ).map((item) => (
                          <option
                            key={item.docId}
                            value={isToplineCare ? item.batchId : item.classId}
                          >
                            {getName(item)}
                          </option>
                        ))}
                      </select>

                      <AnimatePresence>
                        {(isToplineCare ? form.batchId : form.classId) && (
                          <motion.p
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-2 flex items-center gap-1.5 text-xs text-success"
                          >
                            <span>✓</span>
                            {isToplineCare
                              ? "Batch নির্বাচন সম্পন্ন"
                              : "শ্রেণি নির্বাচন সম্পন্ন"}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Gender */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">
                  শিক্ষার্থীর লিঙ্গ <span className="text-error">*</span>
                </legend>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "male", label: "ছেলে", emoji: "👦" },
                    { value: "female", label: "মেয়ে", emoji: "👧" },
                  ].map((option) => (
                    <motion.label
                      key={option.value}
                      whileTap={{ scale: 0.98 }}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all duration-200 ${
                        form.gender === option.value
                          ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                          : "border-base-300 hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        className="radio radio-primary radio-sm"
                        name="gender"
                        value={option.value}
                        checked={form.gender === option.value}
                        onChange={handleChange}
                        disabled={!form.departmentId}
                        required
                      />
                      <span className="text-xl">{option.emoji}</span>
                      <span className="text-sm font-semibold">
                        {option.label}
                      </span>
                    </motion.label>
                  ))}
                </div>
              </fieldset>

              {/* Submit */}
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={
                  submitting ||
                  loadingData ||
                  departments.length === 0 ||
                  villages.length === 0
                }
                className="btn btn-primary mt-2 w-full rounded-xl text-base shadow-lg shadow-primary/20"
              >
                {submitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    আবেদন জমা হচ্ছে...
                  </>
                ) : (
                  <>
                    নিবন্ধন করুন
                    <span className="text-lg">→</span>
                  </>
                )}
              </motion.button>

              <p className="text-center text-xs leading-5 text-base-content/55">
                আপনার তথ্য যাচাই করে Admin নিবন্ধন অনুমোদন করবেন।
              </p>
            </form>
          </div>
        </div>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-5 text-center text-xs text-base-content/50"
        >
          <p>© {new Date().getFullYear()} TopLine Education</p>
          <p className="mt-1">Developed by Jihadur Rahman Noyon</p>
        </motion.footer>
      </motion.div>

      {/* Success modal */}
      <AnimatePresence>
        {credentials && (
          <motion.div
            className="modal modal-open z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 25, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 23 }}
              className="modal-box max-h-[90vh] rounded-3xl bg-base-100 text-base-content shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setCredentials(null)}
                className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3"
                aria-label="বন্ধ করুন"
              >
                ✕
              </button>

              <motion.div
                initial={{ scale: 0.5, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", delay: 0.1 }}
                className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-success/10 text-4xl"
              >
                ✓
              </motion.div>

              <h2 className="text-center text-2xl font-extrabold">
                আবেদন সফল হয়েছে!
              </h2>

              <p className="mt-2 text-center text-sm leading-6 text-base-content/65">
                অভিনন্দন, {credentials.name}! আপনার নিবন্ধনের আবেদন জমা হয়েছে।
                Admin অনুমোদন না করা পর্যন্ত লগইন করতে পারবেন না।
              </p>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-base-300 bg-base-200/60 p-4">
                  <p className="text-xs font-semibold tracking-widest text-base-content/55">
                    STUDENT ID
                  </p>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="break-all font-mono text-2xl font-extrabold tracking-widest">
                      {credentials.studentId}
                    </p>
                    <span className="text-2xl">🎓</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-200/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-widest text-base-content/55">
                      YOUR PIN
                    </p>

                    <button
                      type="button"
                      onClick={() => setShowPin((previous) => !previous)}
                      className="btn btn-ghost btn-xs gap-1"
                    >
                      <span>{showPin ? "◉" : "◎"}</span>
                      {showPin ? "লুকান" : "দেখুন"}
                    </button>
                  </div>

                  <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">
                    {showPin ? credentials.pin : "••••"}
                  </p>
                </div>

                <div className="rounded-xl bg-primary/5 px-4 py-3">
                  <p className="text-xs text-base-content/55">বিভাগ</p>
                  <p className="mt-1 font-semibold">
                    {credentials.departmentName}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={copyCredentials}
                  className="btn btn-primary flex-1 rounded-xl"
                >
                  <span>▣</span>
                  ID ও PIN কপি করুন
                </button>

                <button
                  type="button"
                  onClick={() => setCredentials(null)}
                  className="btn btn-ghost rounded-xl"
                >
                  বন্ধ করুন
                </button>
              </div>

              <p className="mt-4 text-center text-xs text-base-content/45">
                ID ও PIN নিরাপদে সংরক্ষণ করুন।
              </p>
            </motion.div>

            <button
              type="button"
              aria-label="মডাল বন্ধ করুন"
              className="modal-backdrop cursor-default"
              onClick={() => setCredentials(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
