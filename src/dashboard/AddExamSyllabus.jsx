import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Swal from "sweetalert2";
import toast from "react-hot-toast";

import { departmentList } from "../config/departments";
import { isAdmin } from "../config/permissions";
import { app, auth } from "../assets/firebase/firebase.init";

const db = getFirestore(app);

const examTypes = [
  "সাপ্তাহিক পরীক্ষা",
  "মাসিক মূল্যায়ণ পরীক্ষা",
  "সেমিস্টার পরীক্ষা",
  "মডেল টেস্ট পরীক্ষা",
];

const initialForm = {
  departmentId: "",
  classId: "",
  classType: "classes",
  examType: "",
  examDate: "",
  examTime: "",
  totalMark: "",
};

const normalizeId = (value) => String(value ?? "").trim();

const sameId = (a, b) => {
  const left = normalizeId(a);
  const right = normalizeId(b);

  if (left === right) return true;

  if (left && right && /^\d+$/.test(left) && /^\d+$/.test(right)) {
    return Number(left) === Number(right);
  }

  return false;
};

const getItemName = (item = {}) =>
  item.name ||
  item.className ||
  item.batchName ||
  item.englishName ||
  item.title ||
  "Unnamed";

const getSubjectName = (subject = {}) =>
  subject.subjectName || subject.name || subject.title || "বিষয়";

const formatDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }
  return "";
};

const getDepartment = (departmentId) =>
  departmentList.find((department) => sameId(department.id, departmentId));

const getClassType = (department) =>
  department?.type === "batch" ? "batches" : "classes";

export default function AddSyllabus() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const [subjects, setSubjects] = useState([]);
  const [syllabuses, setSyllabuses] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [syllabusTexts, setSyllabusTexts] = useState({});
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  const isAdminUser = isAdmin(user?.email);

  const departments = useMemo(
    () =>
      departmentList.filter(
        (department) => isAdminUser || department.key !== "care",
      ),
    [isAdminUser],
  );

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [subjectSnapshot, syllabusSnapshot] = await Promise.all([
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "syllabuses")),
      ]);

      setSubjects(
        subjectSnapshot.docs
          .map((item) => ({ ...item.data(), id: item.id }))
          .filter((item) => item.isActive !== false),
      );

      setSyllabuses(
        syllabusSnapshot.docs
          .map((item) => ({ ...item.data(), id: item.id }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          }),
      );
    } catch (error) {
      console.error("Load syllabus data error:", error);
      toast.error("তথ্য লোড করা যায়নি। Firestore Rules পরীক্ষা করুন।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    loadData();
  }, [authLoading, user, loadData]);

  const selectedDepartment = departments.find((department) =>
    sameId(department.id, form.departmentId),
  );

  // Both classes and Care batches come from departments.js.
  const classes = useMemo(() => {
    if (!selectedDepartment) return [];

    const sourceCollection = getClassType(selectedDepartment);

    return (selectedDepartment.classes || []).map((item) => ({
      ...item,
      id: normalizeId(item.id),
      departmentId: normalizeId(selectedDepartment.id),
      departmentName: selectedDepartment.name,
      sourceCollection,
    }));
  }, [selectedDepartment]);

  const selectedClass = classes.find(
    (item) =>
      normalizeId(item.id) === normalizeId(form.classId) &&
      item.sourceCollection === form.classType,
  );

  // Match subjects by departmentId and classId only.
  // Existing Care subjects may have classType: "classes" even though
  // the Care batch selector uses "batches" internally.
  const filteredSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) =>
          sameId(subject.departmentId, form.departmentId) &&
          normalizeId(subject.classId) === normalizeId(form.classId),
      ),
    [subjects, form.departmentId, form.classId],
  );

  const visibleSyllabuses = useMemo(
    () =>
      syllabuses.filter((item) => {
        const department = getDepartment(item.departmentId);
        return isAdminUser || department?.key !== "care";
      }),
    [syllabuses, isAdminUser],
  );

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function handleDepartmentChange(event) {
    const departmentId = event.target.value;
    const department = departments.find((item) =>
      sameId(item.id, departmentId),
    );

    setForm({
      ...initialForm,
      departmentId,
      classType: getClassType(department),
    });
    setSyllabusTexts({});
    setEditingId("");
  }

  function handleClassChange(event) {
    setForm((previous) => ({
      ...previous,
      classId: event.target.value,
    }));
    setSyllabusTexts({});
  }

  function resetForm() {
    setForm(initialForm);
    setSyllabusTexts({});
    setEditingId("");
  }

  function startEdit(item) {
    const department = getDepartment(item.departmentId);

    if (department?.key === "care" && !isAdminUser) {
      toast.error("TopLine Care শুধু Admin ব্যবহার করতে পারবেন।");
      return;
    }

    const classType = item.classType || getClassType(department);

    setForm({
      departmentId: normalizeId(item.departmentId),
      classId: normalizeId(item.classId),
      classType,
      examType: item.examType || "",
      examDate: formatDate(item.examDate),
      examTime: item.examTime || "",
      totalMark: String(item.totalMark ?? ""),
    });

    setSyllabusTexts(
      Object.fromEntries(
        (item.subjects || []).map((subject) => [
          normalizeId(subject.subjectId),
          subject.syllabus || "",
        ]),
      ),
    );

    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("সিলেবাস সম্পাদনার জন্য ফর্মে আনা হয়েছে।", { icon: "✏️" });
  }

  async function handleDelete(item) {
    const result = await Swal.fire({
      title: "সিলেবাস মুছে ফেলবেন?",
      html: `<div style="text-align:left"><p>${item.departmentName || ""}</p><p>${item.className || ""}</p><p>${item.examType || ""}</p></div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, মুছে ফেলুন",
      cancelButtonText: "বাতিল",
      reverseButtons: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
    });

    if (!result.isConfirmed) return;

    setDeletingId(item.id);

    try {
      await deleteDoc(doc(db, "syllabuses", item.id));
      setSyllabuses((previous) =>
        previous.filter((entry) => entry.id !== item.id),
      );

      if (editingId === item.id) resetForm();

      toast.success("সিলেবাস মুছে ফেলা হয়েছে।");
    } catch (error) {
      console.error("Delete syllabus error:", error);
      toast.error(
        error.code === "permission-denied"
          ? "মুছে ফেলার অনুমতি নেই। Firestore Rules পরীক্ষা করুন।"
          : "সিলেবাস মুছে ফেলা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setDeletingId("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user) {
      toast.error("প্রথমে লগইন করুন।");
      return;
    }

    if (!form.departmentId || !selectedDepartment) {
      toast.error("Department নির্বাচন করুন।");
      return;
    }

    if (selectedDepartment.key === "care" && !isAdmin(user.email)) {
      toast.error("TopLine Care শুধু Admin ব্যবহার করতে পারবেন।");
      return;
    }

    if (!selectedClass) {
      toast.error("Class/Batch নির্বাচন করুন।");
      return;
    }

    if (!form.examType || !form.examDate || !form.examTime) {
      toast.error("পরীক্ষার ধরন, তারিখ ও সময় পূরণ করুন।");
      return;
    }

    const totalMark = Number(form.totalMark);

    if (!Number.isFinite(totalMark) || totalMark <= 0) {
      toast.error("সঠিক মোট নম্বর লিখুন।");
      return;
    }

    const syllabus = filteredSubjects
      .filter((subject) => syllabusTexts[subject.id]?.trim())
      .map((subject) => ({
        subjectId: subject.id,
        subjectName: getSubjectName(subject),
        syllabus: syllabusTexts[subject.id].trim(),
      }));

    if (syllabus.length === 0) {
      toast.error("কমপক্ষে একটি বিষয়ের সিলেবাস লিখুন।");
      return;
    }

    setSaving(true);

    const payload = {
      departmentId: normalizeId(selectedDepartment.id),
      departmentName: selectedDepartment.name,
      classId: normalizeId(selectedClass.id),
      className: getItemName(selectedClass),
      classType: form.classType,
      examType: form.examType,
      examDate: form.examDate,
      examTime: form.examTime,
      totalMark,
      subjects: syllabus,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "syllabuses", editingId), payload);
        toast.success("সিলেবাস সফলভাবে আপডেট হয়েছে।");
      } else {
        await addDoc(collection(db, "syllabuses"), {
          ...payload,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
        toast.success("সিলেবাস সফলভাবে সংরক্ষণ হয়েছে।");
      }

      resetForm();
      await loadData();
    } catch (error) {
      console.error("Save syllabus error:", error);
      toast.error(
        error.code === "permission-denied"
          ? "Firestore permission নেই। Security Rules পরীক্ষা করুন।"
          : "সিলেবাস সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || (loading && syllabuses.length === 0)) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="alert alert-warning mx-auto mt-8 max-w-xl">
        এই পেজ ব্যবহার করতে প্রথমে Login করুন।
      </div>
    );
  }

  if (!user.email) {
    return (
      <div className="alert alert-error mx-auto mt-8 max-w-xl">
        আপনার অ্যাকাউন্টে ইমেইল পাওয়া যায়নি।
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-7 p-4 sm:p-6">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-800 to-red-900 p-6 text-white shadow-xl sm:p-8">
        <p className="text-sm font-semibold tracking-[0.18em] text-white/65">
          TOPLINE · ACADEMIC MANAGEMENT
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {editingId ? "Edit Syllabus" : "Add Syllabus"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              পরীক্ষার তথ্য নির্ধারণ করুন, বিষয়ভিত্তিক সিলেবাস লিখুন এবং পরে
              প্রয়োজন হলে সম্পাদনা বা মুছে ফেলুন।
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              className="btn btn-sm border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={resetForm}
              disabled={saving}
            >
              সম্পাদনা বাতিল
            </button>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-5">
            <div>
              <h2 className="text-lg font-bold text-base-content">
                01. Academic Information
              </h2>
              <p className="mt-1 text-sm text-base-content/60">
                প্রথমে বিভাগ এবং Class/Batch নির্বাচন করুন।
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-2 font-semibold">
                  Department *
                </span>
                <select
                  className="select select-bordered w-full"
                  value={form.departmentId}
                  onChange={handleDepartmentChange}
                  required
                >
                  <option value="">বিভাগ নির্বাচন করুন</option>
                  {departments.map((department) => (
                    <option key={department.id} value={String(department.id)}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-control">
                <span className="label-text mb-2 font-semibold">
                  Class / Batch *
                </span>
                <select
                  className="select select-bordered w-full"
                  value={form.classId}
                  onChange={handleClassChange}
                  disabled={!form.departmentId || classes.length === 0}
                  required
                >
                  <option value="">Class/Batch নির্বাচন করুন</option>
                  {classes.map((item) => (
                    <option
                      key={`${item.sourceCollection}-${item.id}`}
                      value={String(item.id)}
                    >
                      {getItemName(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.departmentId && classes.length === 0 && (
              <div className="alert alert-warning text-sm">
                এই বিভাগে কোনো Class/Batch পাওয়া যায়নি।
              </div>
            )}
          </div>
        </section>

        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-5">
            <div>
              <h2 className="text-lg font-bold text-base-content">
                02. Exam Information
              </h2>
              <p className="mt-1 text-sm text-base-content/60">
                পরীক্ষার ধরন, তারিখ, সময় এবং মোট নম্বর নির্ধারণ করুন।
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-control sm:col-span-2">
                <span className="label-text mb-2 font-semibold">
                  পরীক্ষার ধরন *
                </span>
                <select
                  name="examType"
                  className="select select-bordered w-full"
                  value={form.examType}
                  onChange={handleChange}
                  required
                >
                  <option value="">পরীক্ষার ধরন নির্বাচন করুন</option>
                  {examTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-control">
                <span className="label-text mb-2 font-semibold">
                  পরীক্ষার তারিখ *
                </span>
                <input
                  type="date"
                  name="examDate"
                  className="input input-bordered w-full"
                  value={form.examDate}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="form-control">
                <span className="label-text mb-2 font-semibold">
                  পরীক্ষার সময় *
                </span>
                <input
                  type="time"
                  name="examTime"
                  className="input input-bordered w-full"
                  value={form.examTime}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="form-control sm:col-span-2">
                <span className="label-text mb-2 font-semibold">
                  মোট নম্বর *
                </span>
                <input
                  type="number"
                  name="totalMark"
                  min="1"
                  step="any"
                  className="input input-bordered w-full"
                  placeholder="যেমন: 100"
                  value={form.totalMark}
                  onChange={handleChange}
                  required
                />
              </label>
            </div>
          </div>
        </section>

        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-base-content">
                  03. Subject-wise Syllabus
                </h2>
                <p className="mt-1 text-sm text-base-content/60">
                  প্রতিটি বিষয়ের সিলেবাস আলাদাভাবে লিখুন।
                </p>
              </div>
              <span className="badge badge-primary badge-outline">
                {filteredSubjects.length} Subjects
              </span>
            </div>

            {!form.departmentId || !form.classId ? (
              <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center">
                <p className="font-medium text-base-content">
                  Department এবং Class/Batch নির্বাচন করুন
                </p>
                <p className="mt-2 text-sm text-base-content/60">
                  এরপর সংশ্লিষ্ট বিষয়গুলোর তালিকা এখানে দেখা যাবে।
                </p>
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className="alert alert-warning">
                এই Class/Batch-এর কোনো Subject পাওয়া যায়নি। আগে Subject যোগ
                করুন।
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSubjects.map((subject, index) => (
                  <div
                    key={subject.id}
                    className="rounded-2xl border border-base-300 bg-base-200/40 p-4 sm:p-5"
                  >
                    <label className="form-control">
                      <span className="mb-3 flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                          {index + 1}
                        </span>
                        <span className="font-bold text-base-content">
                          {getSubjectName(subject)}
                        </span>
                      </span>
                      <textarea
                        className="textarea textarea-bordered min-h-32 w-full bg-base-100 leading-7"
                        placeholder={`${getSubjectName(subject)}-এর সিলেবাস লিখুন...`}
                        value={syllabusTexts[subject.id] || ""}
                        onChange={(event) =>
                          setSyllabusTexts((previous) => ({
                            ...previous,
                            [subject.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-3 rounded-2xl border border-base-300 bg-base-100/95 p-3 shadow-lg backdrop-blur">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={resetForm}
            disabled={saving}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn btn-primary min-w-40"
            disabled={
              saving ||
              !form.departmentId ||
              !form.classId ||
              filteredSubjects.length === 0
            }
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                {editingId ? "Updating..." : "Saving..."}
              </>
            ) : editingId ? (
              "Update Syllabus"
            ) : (
              "Save Syllabus"
            )}
          </button>
        </div>
      </form>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-base-content">
              Saved Syllabuses
            </h2>
            <p className="mt-1 text-sm text-base-content/60">
              সংরক্ষিত সিলেবাস সম্পাদনা অথবা মুছে ফেলতে পারবেন।
            </p>
          </div>
          <span className="badge badge-lg badge-outline">
            {visibleSyllabuses.length} Records
          </span>
        </div>

        {visibleSyllabuses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center text-base-content/60">
            এখনো কোনো সিলেবাস সংরক্ষণ করা হয়নি।
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleSyllabuses.map((item) => (
              <article
                key={item.id}
                className="card border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="card-body gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-base-content">
                        {item.examType || "পরীক্ষা"}
                      </h3>
                      <p className="mt-1 text-sm text-base-content/65">
                        {item.departmentName} · {item.className}
                      </p>
                    </div>
                    <span className="badge badge-primary badge-outline shrink-0">
                      {item.totalMark} নম্বর
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-base-200/60 p-3 text-sm">
                    <div>
                      <p className="text-base-content/55">তারিখ</p>
                      <p className="mt-1 font-semibold text-base-content">
                        {item.examDate || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-base-content/55">সময়</p>
                      <p className="mt-1 font-semibold text-base-content">
                        {item.examTime || "—"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-semibold text-base-content">
                      বিষয়সমূহ ({item.subjects?.length || 0})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(item.subjects || [])
                        .slice(0, 5)
                        .map((subject, index) => (
                          <span
                            key={
                              subject.subjectId ||
                              `${subject.subjectName}-${index}`
                            }
                            className="badge badge-ghost"
                          >
                            {getSubjectName(subject)}
                          </span>
                        ))}
                      {(item.subjects?.length || 0) > 5 && (
                        <span className="badge badge-ghost">
                          +{item.subjects.length - 5}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline btn-primary"
                      onClick={() => startEdit(item)}
                      disabled={Boolean(deletingId)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline btn-error"
                      onClick={() => handleDelete(item)}
                      disabled={Boolean(deletingId)}
                    >
                      {deletingId === item.id ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        "Delete"
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
