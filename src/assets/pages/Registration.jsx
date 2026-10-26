import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router";
import toast from "react-hot-toast";

import { db } from "../firebase/firebase.init";
import { departmentList } from "../../config/departments";

const initialForm = {
  name: "",
  phone: "",
  villageId: "",
  customVillage: "",
  departmentId: "",
  classId: "",
  gender: "",
};

const inputClass =
  "input input-bordered w-full rounded-xl border-base-300 bg-base-100 text-base-content transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const labelClass = "mb-2 block text-sm font-semibold text-base-content";

function normalizePhone(phone) {
  let number = String(phone || "").replace(/\D/g, "");

  if (number.startsWith("00880")) number = number.slice(2);

  if (number.startsWith("880")) {
    number = `0${number.slice(3)}`;
  } else if (number.length === 10 && number.startsWith("1")) {
    number = `0${number}`;
  }

  return number;
}

function generatePin() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10000).padStart(4, "0");
}

export default function Registration() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [villages, setVillages] = useState([]);
  const [customVillage, setCustomVillage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const department = departmentList.find(
    (item) => String(item.id) === form.departmentId,
  );

  const isCare = department?.type === "batch";
  const classes = department?.classes || [];

  useEffect(() => {
    async function loadVillages() {
      try {
        const snapshot = await getDocs(collection(db, "villages"));

        setVillages(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .filter((item) => item.isActive !== false)
            .sort((a, b) =>
              String(a.name || a.villageName || "").localeCompare(
                String(b.name || b.villageName || ""),
                "bn",
              ),
            ),
        );
      } catch (error) {
        console.error("Village loading error:", error);
        toast.error("গ্রামের তথ্য লোড করা যায়নি।");
      } finally {
        setLoading(false);
      }
    }

    loadVillages();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "departmentId" ? { classId: "", gender: "" } : {}),
    }));
  }

  function handleVillageModeChange(useCustomVillage) {
    setCustomVillage(useCustomVillage);

    setForm((previous) => ({
      ...previous,
      villageId: "",
      customVillage: "",
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting || loading) return;

    const name = form.name.trim();
    const phone = normalizePhone(form.phone);
    const villageName = customVillage
      ? form.customVillage.trim()
      : (() => {
          const village = villages.find((item) => item.id === form.villageId);
          return village?.name || village?.villageName || "";
        })();

    if (!name) return toast.error("শিক্ষার্থীর নাম লিখুন।");

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      return toast.error("সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।");
    }

    if (!villageName) {
      return toast.error("গ্রাম বা এলাকার নাম লিখুন অথবা নির্বাচন করুন।");
    }

    if (customVillage && villageName.length > 100) {
      return toast.error("গ্রামের নাম ১০০ অক্ষরের মধ্যে লিখুন।");
    }

    if (!department) {
      return toast.error("বিভাগ নির্বাচন করুন।");
    }

    if (!form.gender) {
      return toast.error("শিক্ষার্থীর লিঙ্গ নির্বাচন করুন।");
    }

    const selectedClass = classes.find((item) => item.id === form.classId);

    if (!selectedClass) {
      return toast.error(
        isCare ? "ব্যাচ নির্বাচন করুন।" : "শ্রেণি নির্বাচন করুন।",
      );
    }

    setSubmitting(true);

    try {
      // Check for an existing phone number.
      const studentsSnapshot = await getDocs(collection(db, "students"));

      const duplicate = studentsSnapshot.docs.some((item) => {
        const student = item.data();

        return (
          normalizePhone(student.phoneNormalized || student.phone || "") ===
          phone
        );
      });

      if (duplicate) {
        toast.error("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে নিবন্ধন করা হয়েছে।");
        return;
      }

      const genderNumber = form.gender === "male" ? "1" : "2";
      const prefix = `${department.id}${genderNumber}`;
      const pin = generatePin();

      let studentId = "";

      // Generate a unique student ID.
      for (let serial = 1; serial <= 999; serial++) {
        const candidate = `${prefix}${String(serial).padStart(3, "0")}`;
        const studentRef = doc(db, "students", candidate);

        const created = await runTransaction(db, async (transaction) => {
          const existing = await transaction.get(studentRef);

          if (existing.exists()) return false;

          transaction.set(studentRef, {
            studentId: candidate,
            name,
            phone: form.phone.trim(),
            phoneNormalized: phone,
            pin,

            departmentId: department.id,
            departmentName: department.name,

            villageId: customVillage ? "" : form.villageId,
            villageName,

            gender: form.gender,

            classId: isCare ? "" : selectedClass.id,
            className: isCare ? "" : selectedClass.name,

            batchId: isCare ? selectedClass.id : "",
            batchName: isCare ? selectedClass.name : "",

            approved: false,
            isCR: false,
            createdAt: serverTimestamp(),
          });

          return true;
        });

        if (created) {
          studentId = candidate;
          break;
        }
      }

      if (!studentId) {
        throw new Error("Student ID তৈরি করা যায়নি।");
      }

      localStorage.setItem(
        "studentSession",
        JSON.stringify({
          documentId: studentId,
          studentId,
          name,
          departmentId: department.id,
          departmentName: department.name,
          role: "student",
        }),
      );

      toast.success("নিবন্ধনের আবেদন সফলভাবে জমা হয়েছে!");
      setForm(initialForm);
      navigate("/portal", { replace: true });
    } catch (error) {
      console.error("Registration error:", error);

      toast.error(
        error.code === "permission-denied"
          ? "নিবন্ধনের অনুমতি নেই। Firestore Rules পরীক্ষা করুন।"
          : "নিবন্ধন করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-base-200 px-4 py-8 text-base-content sm:py-12">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative mx-auto max-w-xl">
        <div className="overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-2xl shadow-base-content/5">
          {/* Header */}
          <header className="relative overflow-hidden bg-gradient-to-br from-primary to-secondary px-6 py-9 text-primary-content sm:px-9 sm:py-11">
            <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full border border-white/15" />
            <div className="pointer-events-none absolute -right-4 -top-8 h-36 w-36 rounded-full border border-white/15" />

            <div className="relative">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] opacity-80">
                TopLine Education
              </p>

              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                শিক্ষার্থী নিবন্ধন
              </h1>

              <p className="mt-3 max-w-sm text-sm leading-6 opacity-85 sm:text-base">
                প্রয়োজনীয় তথ্য দিয়ে আপনার নিবন্ধনের আবেদন সম্পন্ন করুন।
              </p>

              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Admin-এর অনুমোদন প্রয়োজন
              </div>
            </div>
          </header>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-9">
            <label className="block">
              <span className={labelClass}>
                শিক্ষার্থীর পূর্ণ নাম <span className="text-error">*</span>
              </span>

              <input
                className={inputClass}
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="আপনার পূর্ণ নাম লিখুন"
                maxLength={100}
                autoComplete="name"
                required
              />
            </label>

            <label className="block">
              <span className={labelClass}>
                মোবাইল নম্বর <span className="text-error">*</span>
              </span>

              <input
                className={inputClass}
                name="phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="01XXXXXXXXX"
                maxLength={20}
                autoComplete="tel"
                required
              />

              <span className="mt-2 block text-xs text-base-content/55">
                একটি নম্বর দিয়ে একবারই নিবন্ধন করা যাবে।
              </span>
            </label>

            {/* Village */}
            <section className="rounded-2xl border border-base-300 bg-base-200/40 p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-bold">গ্রাম / এলাকার তথ্য</h2>
                <p className="mt-1 text-xs text-base-content/60">
                  তালিকা থেকে নির্বাচন করুন অথবা নতুন নাম লিখুন।
                </p>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-base-300/60 p-1">
                <button
                  type="button"
                  onClick={() => handleVillageModeChange(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    !customVillage
                      ? "bg-base-100 text-primary shadow-sm"
                      : "text-base-content/65 hover:text-base-content"
                  }`}
                >
                  তালিকা থেকে
                </button>

                <button
                  type="button"
                  onClick={() => handleVillageModeChange(true)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    customVillage
                      ? "bg-base-100 text-primary shadow-sm"
                      : "text-base-content/65 hover:text-base-content"
                  }`}
                >
                  নতুন গ্রাম লিখুন
                </button>
              </div>

              {customVillage ? (
                <label className="block">
                  <span className={labelClass}>
                    গ্রামের নাম <span className="text-error">*</span>
                  </span>

                  <input
                    className={inputClass}
                    name="customVillage"
                    value={form.customVillage}
                    onChange={handleChange}
                    placeholder="আপনার গ্রামের নাম লিখুন"
                    maxLength={100}
                    required
                  />

                  <p className="mt-2 text-xs text-base-content/55">
                    আপনার দেওয়া নামটি নিবন্ধনের সঙ্গে সংরক্ষণ করা হবে।
                  </p>
                </label>
              ) : (
                <label className="block">
                  <span className={labelClass}>
                    গ্রাম / এলাকা <span className="text-error">*</span>
                  </span>

                  <select
                    className={inputClass}
                    name="villageId"
                    value={form.villageId}
                    onChange={handleChange}
                    disabled={loading || villages.length === 0}
                    required
                  >
                    <option value="">
                      {loading
                        ? "গ্রামের তথ্য লোড হচ্ছে..."
                        : villages.length
                          ? "গ্রাম বা এলাকা নির্বাচন করুন"
                          : "কোনো গ্রাম পাওয়া যায়নি"}
                    </option>

                    {villages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.villageName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>

            {/* Department */}
            <label className="block">
              <span className={labelClass}>
                প্রতিষ্ঠান / বিভাগ <span className="text-error">*</span>
              </span>

              <select
                className={inputClass}
                name="departmentId"
                value={form.departmentId}
                onChange={handleChange}
                required
              >
                <option value="">বিভাগ নির্বাচন করুন</option>

                {departmentList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Class or batch */}
            {department && (
              <label className="block">
                <span className={labelClass}>
                  {isCare ? "আপনার ব্যাচ" : "আপনার শ্রেণি"}
                  <span className="text-error"> *</span>
                </span>

                <select
                  className={inputClass}
                  name="classId"
                  value={form.classId}
                  onChange={handleChange}
                  required
                >
                  <option value="">
                    {isCare ? "ব্যাচ নির্বাচন করুন" : "শ্রেণি নির্বাচন করুন"}
                  </option>

                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Gender */}
            <fieldset>
              <legend className={`${labelClass} mb-3`}>
                শিক্ষার্থীর লিঙ্গ <span className="text-error">*</span>
              </legend>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "male", label: "ছেলে" },
                  { value: "female", label: "মেয়ে" },
                ].map((item) => {
                  const selected = form.gender === item.value;

                  return (
                    <label
                      key={item.value}
                      className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border p-4 transition ${
                        selected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border-base-300 bg-base-100 hover:border-primary/50"
                      } ${!department ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        className="radio radio-primary radio-sm"
                        name="gender"
                        value={item.value}
                        checked={selected}
                        onChange={handleChange}
                        disabled={!department}
                        required
                      />

                      <span className="text-sm font-semibold">
                        {item.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || loading}
              className="btn btn-primary min-h-12 w-full rounded-xl text-base font-bold shadow-lg shadow-primary/15 transition hover:shadow-primary/25"
            >
              {submitting ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  আবেদন জমা হচ্ছে...
                </>
              ) : (
                "নিবন্ধনের আবেদন করুন →"
              )}
            </button>

            <p className="text-center text-xs leading-6 text-base-content/55">
              আপনার তথ্য যাচাই করে Admin নিবন্ধন অনুমোদন করবেন।
            </p>

            <div className="divider text-xs text-base-content/40">অথবা</div>

            <p className="text-center text-sm text-base-content/70">
              অ্যাকাউন্ট আছে?{" "}
              <Link
                to="/login"
                className="font-bold text-primary hover:underline"
              >
                লগইন করুন
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-base-content/45">
          TopLine Education Management System
        </p>
      </div>
    </main>
  );
}
