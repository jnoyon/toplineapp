import { useEffect, useMemo, useState } from "react";
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
import toast from "react-hot-toast";

import { app, auth } from "../firebase/firebase.init";
import { isAdmin } from "../../config/permissions";
import { departmentList } from "../../config/departments";

const db = getFirestore(app);

const CUSTOM_INSTRUCTOR = "__custom_instructor__";

const initialForm = {
  classId: "",
  classType: "classes",
  name: "",
  instructorMode: "existing",
  instructorId: "",
  customInstructorName: "",
};

const normalizeId = (value) => String(value ?? "").trim();

const getDepartmentId = (department) =>
  normalizeId(department.departmentId ?? department.id);

const getItemName = (item) =>
  item.className ||
  item.batchName ||
  item.name ||
  item.englishName ||
  item.title ||
  "Unnamed";

const getTeacherName = (teacher) =>
  teacher.name ||
  teacher.fullName ||
  teacher.displayName ||
  teacher.teacherName ||
  "Unnamed Teacher";

const isActive = (item) => item.isActive !== false;

function getTeacherKey(teacher) {
  return normalizeId(teacher.uid || teacher.id);
}

function getTeacherDepartmentIds(teacher) {
  const ids = [
    ...(Array.isArray(teacher.departmentIds) ? teacher.departmentIds : []),

    ...(Array.isArray(teacher.departments)
      ? teacher.departments.map((item) =>
          typeof item === "object"
            ? (item.departmentId ?? item.id ?? item.code)
            : item,
        )
      : []),

    ...(teacher.departmentId != null ? [teacher.departmentId] : []),
  ];

  return [...new Set(ids.map(normalizeId).filter(Boolean))];
}

function mergeTeachers(teacherDocuments, userDocuments) {
  const merged = new Map();

  teacherDocuments.forEach((teacher) => {
    const key = normalizeId(teacher.uid || teacher.email || teacher.id);

    merged.set(key, {
      ...teacher,
      uid: teacher.uid || "",
      source: "teachers",
    });
  });

  userDocuments.forEach((user) => {
    if (user.role !== "teacher") return;

    const key = normalizeId(user.uid || user.email || user.id);
    const existing = merged.get(key);

    merged.set(key, {
      ...user,
      ...existing,
      id: existing?.id || user.id,
      uid: existing?.uid || user.uid || user.id,
      name:
        existing?.name ||
        existing?.fullName ||
        user.name ||
        user.fullName ||
        user.displayName ||
        "",
      email: existing?.email || user.email || "",
      departments: existing?.departments ?? user.departments ?? [],
      departmentIds: existing?.departmentIds ?? user.departmentIds ?? [],
      departmentId: existing?.departmentId ?? user.departmentId ?? null,
      teacherId: existing?.teacherId || user.teacherId || "",
      isActive:
        existing?.isActive !== undefined ? existing.isActive : user.isActive,
      source: existing?.source || "users",
    });
  });

  return [...merged.values()].filter(isActive);
}

function getFirebaseErrorMessage(error) {
  const messages = {
    "permission-denied":
      "Firestore permission নেই। Security Rules পরীক্ষা করুন।",
    unavailable: "Firebase-এ সংযোগ করা যাচ্ছে না। আবার চেষ্টা করুন।",
    "auth/network-request-failed": "ইন্টারনেট সংযোগ পরীক্ষা করুন।",
  };

  return (
    messages[error?.code] ||
    error?.message ||
    "একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।"
  );
}

export default function Subjects() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [departmentId, setDepartmentId] = useState("");
  const [form, setForm] = useState(initialForm);

  const [editingId, setEditingId] = useState(null);
  const [editingCollection, setEditingCollection] = useState("subjects");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  // Load departments, classes, batches, teachers and subjects
  useEffect(() => {
    if (authLoading) return;

    if (!isAdmin(user?.email)) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);

      try {
        const [batchSnapshot, teacherSnapshot, userSnapshot, subjectSnapshot] =
          await Promise.all([
            getDocs(collection(db, "batches")),
            getDocs(collection(db, "teachers")),
            getDocs(collection(db, "users")),
            getDocs(collection(db, "subjects")),
          ]);

        if (cancelled) return;

        // Static departments from config
        const departmentData = departmentList;

        // Static classes from departments.js
        const staticClasses = departmentList.flatMap((department) =>
          (department.classes || []).map((classItem) => ({
            ...classItem,
            departmentId: String(department.id),
            departmentName: department.name,
            sourceCollection: "classes",
            isActive: true,
          })),
        );

        // Dynamic batches from Firestore
        const batchData = batchSnapshot.docs
          .map((item) => ({
            ...item.data(),
            id: item.id,
            sourceCollection: "batches",
          }))
          .filter(isActive);

        const teacherDocuments = teacherSnapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }));

        const userDocuments = userSnapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
          uid: item.data().uid || item.id,
        }));

        const teacherData = mergeTeachers(teacherDocuments, userDocuments);

        const subjectData = subjectSnapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
          sourceCollection: "subjects",
        }));

        setDepartments(departmentData);

        setClasses(
          [...staticClasses, ...batchData].sort((a, b) =>
            getItemName(a).localeCompare(getItemName(b), undefined, {
              numeric: true,
              sensitivity: "base",
            }),
          ),
        );

        setTeachers(
          teacherData.sort((a, b) =>
            getTeacherName(a).localeCompare(getTeacherName(b)),
          ),
        );

        setSubjects(subjectData);
      } catch (error) {
        console.error("Load Subjects error:", error);
        toast.error(getFirebaseErrorMessage(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  // Selected department
  const selectedDepartment = useMemo(
    () =>
      departments.find(
        (department) => getDepartmentId(department) === departmentId,
      ) || null,
    [departments, departmentId],
  );

  // Classes and batches for selected department
  const departmentClasses = useMemo(() => {
    if (!departmentId) return [];

    return classes.filter(
      (item) => normalizeId(item.departmentId) === departmentId,
    );
  }, [classes, departmentId]);

  // Teachers assigned to this department, plus unassigned teachers
  const departmentTeachers = useMemo(() => {
    if (!departmentId) return [];

    const assignedTeachers = teachers.filter((teacher) =>
      getTeacherDepartmentIds(teacher).includes(departmentId),
    );

    const unassignedTeachers = teachers.filter(
      (teacher) => getTeacherDepartmentIds(teacher).length === 0,
    );

    return [...assignedTeachers, ...unassignedTeachers];
  }, [teachers, departmentId]);

  // Subjects for a particular class or batch
  function getSubjectsForClass(classItem) {
    return subjects.filter(
      (subject) =>
        normalizeId(subject.departmentId) === departmentId &&
        normalizeId(subject.classId) === normalizeId(classItem.id) &&
        (subject.classType || "classes") ===
          (classItem.sourceCollection || "classes"),
    );
  }

  // Find instructor name
  function getInstructorName(subject) {
    if (subject.instructorName) {
      return subject.instructorName;
    }

    const instructor = teachers.find(
      (teacher) =>
        normalizeId(teacher.id) === normalizeId(subject.instructorId) ||
        normalizeId(teacher.uid) === normalizeId(subject.instructorId),
    );

    return instructor ? getTeacherName(instructor) : "Not assigned";
  }

  // Form handler
  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // Reset form
  function resetForm() {
    setForm(initialForm);
    setEditingId(null);
    setEditingCollection("subjects");
  }

  // Save or update subject
  async function handleSubmit(event) {
    event.preventDefault();

    if (!isAdmin(user?.email)) {
      toast.error("শুধু Admin বিষয় পরিচালনা করতে পারবেন।");
      return;
    }

    if (!selectedDepartment || !departmentId) {
      toast.error("বিভাগ নির্বাচন করুন।");
      return;
    }

    const subjectName = form.name.trim();

    if (!subjectName) {
      toast.error("বিষয়ের নাম লিখুন।");
      return;
    }

    if (!form.classId) {
      toast.error("Class/Batch নির্বাচন করুন।");
      return;
    }

    const classItem = departmentClasses.find(
      (item) =>
        normalizeId(item.id) === normalizeId(form.classId) &&
        (item.sourceCollection || "classes") === form.classType,
    );

    if (!classItem) {
      toast.error("নির্বাচিত Class/Batch পাওয়া যায়নি।");
      return;
    }

    let instructorId = "";
    let instructorName = "";
    let instructorType = "existing";

    if (form.instructorMode === "custom") {
      instructorName = form.customInstructorName.trim();
      instructorType = "custom";

      if (!instructorName) {
        toast.error("Custom Teacher Name লিখুন।");
        return;
      }
    } else {
      if (!form.instructorId) {
        toast.error("Instructor নির্বাচন করুন অথবা Custom Name লিখুন।");
        return;
      }

      const instructor = departmentTeachers.find(
        (teacher) =>
          getTeacherKey(teacher) === normalizeId(form.instructorId) ||
          normalizeId(teacher.id) === normalizeId(form.instructorId),
      );

      if (!instructor) {
        toast.error("নির্বাচিত Instructor পাওয়া যায়নি।");
        return;
      }

      instructorId = getTeacherKey(instructor);
      instructorName = getTeacherName(instructor);
    }

    // Prevent duplicate subjects in the same class or batch
    const duplicate = subjects.some(
      (subject) =>
        normalizeId(subject.departmentId) === departmentId &&
        normalizeId(subject.classId) === normalizeId(classItem.id) &&
        (subject.classType || "classes") ===
          (classItem.sourceCollection || "classes") &&
        subject.name?.trim().toLowerCase() === subjectName.toLowerCase() &&
        !(
          subject.id === editingId &&
          (subject.sourceCollection || "subjects") === editingCollection
        ),
    );

    if (duplicate) {
      toast.error("এই Class/Batch-এ বিষয়টি ইতিমধ্যে রয়েছে।");
      return;
    }

    const payload = {
      name: subjectName,

      departmentId: getDepartmentId(selectedDepartment),
      departmentName: selectedDepartment.name,

      classId: classItem.id,
      className: getItemName(classItem),
      classType: classItem.sourceCollection || "classes",

      instructorId,
      instructorName,
      instructorType,

      isActive: true,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);

    try {
      if (editingId) {
        await updateDoc(doc(db, editingCollection, editingId), payload);

        setSubjects((previous) =>
          previous.map((subject) =>
            subject.id === editingId &&
            (subject.sourceCollection || "subjects") === editingCollection
              ? {
                  ...subject,
                  ...payload,
                  updatedAt: new Date(),
                }
              : subject,
          ),
        );

        toast.success("বিষয় আপডেট হয়েছে।");
      } else {
        const docRef = await addDoc(collection(db, "subjects"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        setSubjects((previous) => [
          ...previous,
          {
            ...payload,
            id: docRef.id,
            sourceCollection: "subjects",
            createdAt: new Date(),
          },
        ]);

        toast.success("বিষয় যোগ হয়েছে।");
      }

      resetForm();
    } catch (error) {
      console.error("Save subject error:", error);
      toast.error(getFirebaseErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  // Edit subject
  function handleEdit(subject) {
    setEditingId(subject.id);
    setEditingCollection(subject.sourceCollection || "subjects");

    setForm({
      classId: normalizeId(subject.classId),
      classType: subject.classType || "classes",
      name: subject.name || "",
      instructorMode:
        subject.instructorType === "custom" ? "custom" : "existing",
      instructorId: subject.instructorId || "",
      customInstructorName:
        subject.instructorType === "custom" ? subject.instructorName || "" : "",
    });

    document
      .getElementById("subject-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Delete subject
  async function handleDelete(subject) {
    if (!isAdmin(user?.email)) {
      toast.error("শুধু Admin বিষয় মুছতে পারবেন।");
      return;
    }

    const confirmed = window.confirm(
      `“${subject.name}” বিষয়টি মুছে ফেলতে চান?`,
    );

    if (!confirmed) return;

    setDeletingId(subject.id);

    try {
      await deleteDoc(
        doc(db, subject.sourceCollection || "subjects", subject.id),
      );

      setSubjects((previous) =>
        previous.filter(
          (item) =>
            !(
              item.id === subject.id &&
              (item.sourceCollection || "subjects") ===
                (subject.sourceCollection || "subjects")
            ),
        ),
      );

      if (
        editingId === subject.id &&
        editingCollection === (subject.sourceCollection || "subjects")
      ) {
        resetForm();
      }

      toast.success("বিষয় মুছে ফেলা হয়েছে।");
    } catch (error) {
      console.error("Delete subject error:", error);
      toast.error(getFirebaseErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  // Loading
  if (authLoading || loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  // Login required
  if (!user?.email) {
    return (
      <div className="alert alert-warning mx-auto mt-8 max-w-xl">
        এই পেজ ব্যবহার করতে Login করুন।
      </div>
    );
  }

  // Admin only
  if (!isAdmin(user.email)) {
    return (
      <div className="alert alert-error mx-auto mt-8 max-w-xl">
        শুধু Admin এই পেজ ব্যবহার করতে পারবেন।
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-base-content sm:text-3xl">
          Subject Management
        </h1>

        <p className="mt-1 text-sm text-base-content/60">
          বিভাগ, Class/Batch, বিষয় এবং Instructor পরিচালনা করুন।
        </p>
      </header>

      {/* Department selector */}
      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <label className="form-control w-full max-w-xl">
            <span className="label-text mb-2 font-semibold">
              Select Department
            </span>

            <select
              className="select select-bordered w-full"
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value);
                resetForm();
              }}
            >
              <option value="">বিভাগ নির্বাচন করুন</option>

              {departments.map((department) => (
                <option key={department.id} value={getDepartmentId(department)}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          {departmentId && (
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="badge badge-lg badge-outline">
                {departmentClasses.length} Class/Batch
              </div>

              <div className="badge badge-lg badge-outline">
                {
                  subjects.filter(
                    (subject) =>
                      normalizeId(subject.departmentId) === departmentId,
                  ).length
                }{" "}
                Subjects
              </div>

              <div className="badge badge-lg badge-outline">
                {departmentTeachers.length} Instructors
              </div>
            </div>
          )}
        </div>
      </section>

      {!departmentId && (
        <div className="rounded-2xl border border-dashed border-base-300 p-10 text-center">
          <h2 className="text-lg font-semibold">Select a Department</h2>

          <p className="mt-2 text-sm text-base-content/60">
            বিষয় পরিচালনা করতে প্রথমে একটি বিভাগ নির্বাচন করুন।
          </p>
        </div>
      )}

      {departmentId && (
        <>
          {/* Add/Edit form */}
          <section
            id="subject-form"
            className="card border border-base-300 bg-base-100 shadow-sm"
          >
            <div className="card-body">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">
                    {editingId ? "Edit Subject" : "Add New Subject"}
                  </h2>

                  <p className="mt-1 text-sm text-base-content/60">
                    {selectedDepartment?.name}
                  </p>
                </div>

                {editingId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={resetForm}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {departmentClasses.length === 0 ? (
                <div className="alert alert-warning">
                  এই বিভাগে কোনো Active Class/Batch পাওয়া যায়নি। আগে Class/Batch
                  তৈরি করুন।
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Class/Batch */}
                    <label className="form-control">
                      <span className="label-text mb-2 font-medium">
                        Class / Batch *
                      </span>

                      <select
                        name="classId"
                        className="select select-bordered w-full"
                        value={form.classId}
                        onChange={(event) => {
                          const selected = departmentClasses.find(
                            (item) =>
                              normalizeId(item.id) === event.target.value,
                          );

                          setForm((previous) => ({
                            ...previous,
                            classId: event.target.value,
                            classType: selected?.sourceCollection || "classes",
                          }));
                        }}
                        required
                      >
                        <option value="">Class/Batch নির্বাচন করুন</option>

                        {departmentClasses.map((item) => (
                          <option
                            key={`${item.sourceCollection}-${item.id}`}
                            value={item.id}
                          >
                            {getItemName(item)}
                            {item.sourceCollection === "batches"
                              ? " (Batch)"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* Subject name */}
                    <label className="form-control">
                      <span className="label-text mb-2 font-medium">
                        Subject Name *
                      </span>

                      <input
                        type="text"
                        name="name"
                        className="input input-bordered w-full"
                        placeholder="যেমন: Mathematics"
                        value={form.name}
                        onChange={handleChange}
                        required
                      />
                    </label>

                    {/* Instructor */}
                    <label className="form-control md:col-span-2">
                      <span className="label-text mb-2 font-medium">
                        Instructor *
                      </span>

                      <select
                        className="select select-bordered w-full"
                        value={
                          form.instructorMode === "custom"
                            ? CUSTOM_INSTRUCTOR
                            : form.instructorId
                        }
                        onChange={(event) => {
                          if (event.target.value === CUSTOM_INSTRUCTOR) {
                            setForm((previous) => ({
                              ...previous,
                              instructorMode: "custom",
                              instructorId: "",
                            }));
                          } else {
                            setForm((previous) => ({
                              ...previous,
                              instructorMode: "existing",
                              instructorId: event.target.value,
                              customInstructorName: "",
                            }));
                          }
                        }}
                        required
                      >
                        <option value="">Instructor নির্বাচন করুন</option>

                        {departmentTeachers.map((teacher) => (
                          <option
                            key={`${teacher.source}-${getTeacherKey(teacher)}`}
                            value={getTeacherKey(teacher)}
                          >
                            {getTeacherName(teacher)}
                            {teacher.teacherId ? ` (${teacher.teacherId})` : ""}
                          </option>
                        ))}

                        <option value={CUSTOM_INSTRUCTOR}>
                          + Custom Teacher Name
                        </option>
                      </select>

                      {departmentTeachers.length === 0 && (
                        <span className="mt-2 text-xs text-base-content/60">
                          কোনো শিক্ষক পাওয়া যায়নি। Custom Teacher Name নির্বাচন
                          করে নাম লিখতে পারবেন।
                        </span>
                      )}
                    </label>

                    {/* Custom instructor name */}
                    {form.instructorMode === "custom" && (
                      <label className="form-control md:col-span-2">
                        <span className="label-text mb-2 font-medium">
                          Custom Teacher Name *
                        </span>

                        <input
                          type="text"
                          name="customInstructorName"
                          className="input input-bordered w-full"
                          placeholder="শিক্ষকের নাম লিখুন"
                          value={form.customInstructorName}
                          onChange={handleChange}
                          required
                        />

                        <span className="mt-2 text-xs text-base-content/60">
                          এই নামটি শুধু বিষয়ের Instructor হিসেবে সংরক্ষিত হবে।
                          এটি নতুন Firebase Authentication account বা Teacher
                          profile তৈরি করবে না।
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="loading loading-spinner loading-sm" />
                          Saving...
                        </>
                      ) : editingId ? (
                        "Update Subject"
                      ) : (
                        "Save Subject"
                      )}
                    </button>

                    {editingId && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={resetForm}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </section>

          {/* Subjects grouped by class or batch */}
          {departmentClasses.map((classItem) => {
            const classSubjects = getSubjectsForClass(classItem);

            return (
              <section
                key={`${classItem.sourceCollection}-${classItem.id}`}
                className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 bg-base-200/60 px-4 py-4 sm:px-6">
                  <div>
                    <h2 className="text-lg font-bold">
                      {getItemName(classItem)}
                    </h2>

                    <p className="mt-1 text-sm text-base-content/60">
                      {classItem.sourceCollection === "batches"
                        ? "Batch"
                        : "Class"}{" "}
                      · {classSubjects.length} Subjects
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setForm({
                        ...initialForm,
                        classId: normalizeId(classItem.id),
                        classType: classItem.sourceCollection || "classes",
                      });

                      setEditingId(null);
                      setEditingCollection("subjects");

                      document.getElementById("subject-form")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                  >
                    + Add Subject
                  </button>
                </div>

                <div className="p-4 sm:p-6">
                  {classSubjects.length === 0 ? (
                    <p className="py-5 text-center text-sm text-base-content/50">
                      এই Class/Batch-এ এখনো কোনো বিষয় যোগ করা হয়নি।
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th>Instructor</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>

                        <tbody>
                          {classSubjects.map((subject) => (
                            <tr key={subject.id}>
                              <td className="font-medium">{subject.name}</td>

                              <td>
                                <div>{getInstructorName(subject)}</div>

                                {subject.instructorType === "custom" && (
                                  <span className="badge badge-ghost badge-sm mt-1">
                                    Custom
                                  </span>
                                )}
                              </td>

                              <td>
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => handleEdit(subject)}
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-error btn-outline btn-sm"
                                    disabled={deletingId === subject.id}
                                    onClick={() => handleDelete(subject)}
                                  >
                                    {deletingId === subject.id ? (
                                      <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                      "Delete"
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
