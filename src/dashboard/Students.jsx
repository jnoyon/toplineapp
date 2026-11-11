import { useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import Swal from "sweetalert2";

import toast from "react-hot-toast";

import { auth, db } from "../assets/firebase/firebase.init";

import {
  getUserRole,
  isAdmin,
  isDepartmentHead,
  isExamController,
} from "../config/permissions";

import { departments } from "../config/departments";

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

// --------------------------------------------------

// Helpers

// --------------------------------------------------

const normalize = (value) =>
  String(value ?? "")
    .trim()

    .toLowerCase()

    .replace(/\s+/g, " ");

const getInitials = (name) =>
  String(name || "?")
    .trim()

    .slice(0, 2)

    .toUpperCase();

const getPhoto = (student) =>
  student?.photoURL ||
  student?.photoUrl ||
  student?.imageUrl ||
  student?.photo ||
  student?.image ||
  student?.profileImage ||
  "";

const getPhone = (student) =>
  String(
    student?.phone || student?.mobile || student?.guardianPhone || "",
  ).trim();

const getFatherName = (student) =>
  student?.fatherName || student?.father || student?.fathersName || "";

const isCareStudent = (student) =>
  normalize(student.departmentName).includes("কেয়ার") ||
  normalize(student.departmentName).includes("care");

const isStudentActive = (student) => student?.approved === true;

const getDepartmentPermissions = (profile) => {
  const permissions = [
    ...(profile?.departmentIds || []),

    ...(profile?.departments || []).map((item) =>
      typeof item === "object"
        ? (item.departmentId ?? item.id ?? item.name)
        : item,
    ),
  ];

  if (profile?.departmentId) {
    permissions.push(profile.departmentId);
  }

  if (profile?.departmentName) {
    permissions.push(profile.departmentName);
  }

  if (profile?.departmentHeadOf) {
    permissions.push(...profile.departmentHeadOf);
  }

  return permissions.map(normalize);
};

const hasDepartmentPermission = (department, permissions) => {
  if (!department) return false;

  return (
    permissions.includes(normalize(department.name)) ||
    permissions.includes(normalize(department.id))
  );
};

const initialForm = {
  fatherName: "",

  motherName: "",

  dateOfBirth: "",

  religion: "",

  roll: "",
};

// --------------------------------------------------

// Reusable Components

// --------------------------------------------------

function Loading() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3">
      <span className="loading loading-spinner loading-lg text-primary" />

      <p className="text-sm text-base-content/60">
        শিক্ষার্থীদের তথ্য লোড হচ্ছে...
      </p>
    </div>
  );
}

function StudentAvatar({ student }) {
  const [imageError, setImageError] = useState(false);

  const photo = getPhoto(student);

  useEffect(() => {
    setImageError(false);
  }, [photo]);

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 font-bold text-primary ring-1 ring-primary/10">
      {photo && !imageError ? (
        <img
          src={photo}
          alt={student.name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        getInitials(student.name)
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-base-content/50">{label}</p>

      <p className="mt-0.5 truncate text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

// --------------------------------------------------

// Main Component

// --------------------------------------------------

export default function Students() {
  const navigate = useNavigate();

  // Authentication

  const [profile, setProfile] = useState(null);

  const [role, setRole] = useState("");

  // Department

  const [departmentsList, setDepartmentsList] = useState([]);

  const [departmentPermissions, setDepartmentPermissions] = useState([]);

  // Students

  const [students, setStudents] = useState([]);

  // Filters

  const [departmentName, setDepartmentName] = useState("");

  const [classBatchName, setClassBatchName] = useState("");

  const [search, setSearch] = useState("");

  // Loading

  const [loading, setLoading] = useState(true);

  const [updatingId, setUpdatingId] = useState("");
  const [markUpdatingId, setMarkUpdatingId] = useState("");

  // Edit Profile

  const [editingStudent, setEditingStudent] = useState(null);

  const [editForm, setEditForm] = useState(initialForm);

  const [editPhoto, setEditPhoto] = useState(null);

  const [editPreview, setEditPreview] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [deletingPhoto, setDeletingPhoto] = useState(false);

  // --------------------------------------------------

  // Permissions.js Compatibility

  // --------------------------------------------------

  const isAdminUser = role === "admin";

  const isDepartmentHeadUser = role === "departmenthead";

  const isTeacher = role === "teacher";

  const isExamControllerUser = role === "exam-controller";

  const canViewStudents = isAdminUser || isDepartmentHeadUser || isTeacher;

  const canManageStudents = isAdminUser || isDepartmentHeadUser;
  const profileBusy = savingProfile || uploadingPhoto || deletingPhoto;

  // --------------------------------------------------

  // Authentication & Initial Data

  // --------------------------------------------------

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setLoading(true);

      if (!user) {
        setProfile(null);

        setRole("");

        setStudents([]);

        setDepartmentsList([]);

        setDepartmentPermissions([]);

        setLoading(false);

        return;
      }

      try {
        // Admin-এর জন্য Firestore profile বাধ্যতামূলক নয়।

        // permissions.js-এর email allowlist থেকেই Admin নির্ধারিত হবে।

        const admin = isAdmin(user.email);

        const departmentHead = isDepartmentHead(user.email);

        const examController = isExamController(user.email);

        let userProfile = {};

        if (!admin) {
          const profileSnapshot = await getDoc(doc(db, "users", user.uid));

          userProfile = profileSnapshot.exists() ? profileSnapshot.data() : {};
        }

        const currentUser = {
          ...userProfile,

          email: user.email,
        };

        const userRole = getUserRole(currentUser);

        const finalRole = admin
          ? "admin"
          : departmentHead
            ? "departmenthead"
            : examController
              ? "exam-controller"
              : userRole;

        // Account access check

        const disabled =
          userProfile.accountAccess === false || userProfile.isActive === false;

        if (!admin && disabled) {
          if (!active) return;

          setProfile(userProfile);

          setRole("");

          setStudents([]);

          setDepartmentsList([]);

          setLoading(false);

          toast.error("আপনার অ্যাকাউন্ট নিষ্ক্রিয়।");

          return;
        }

        if (!["admin", "departmenthead", "teacher"].includes(finalRole)) {
          if (!active) return;

          setProfile(userProfile);

          setRole(finalRole);

          setStudents([]);

          setDepartmentsList([]);

          setLoading(false);

          return;
        }

        const permissions = getDepartmentPermissions(userProfile);

        const configuredDepartments = Object.values(departments);

        const allowedDepartments = admin
          ? configuredDepartments
          : configuredDepartments.filter((department) =>
              hasDepartmentPermission(department, permissions),
            );

        if (!admin && allowedDepartments.length === 0) {
          if (!active) return;

          setProfile(userProfile);

          setRole(finalRole);

          setStudents([]);

          setDepartmentsList([]);

          setLoading(false);

          toast.error("আপনার কোনো বিভাগে অনুমতি নেই।");

          return;
        }

        // Students

        const studentSnapshot = await getDocs(collection(db, "students"));

        const allStudents = studentSnapshot.docs.map((item) => ({
          ...item.data(),

          id: item.id,
        }));

        const allowedDepartmentNames = new Set(
          allowedDepartments.map((item) => normalize(item.name)),
        );

        const allowedStudents = admin
          ? allStudents
          : allStudents.filter((student) =>
              allowedDepartmentNames.has(normalize(student.departmentName)),
            );

        if (!active) return;

        setProfile(userProfile);

        setRole(finalRole);

        setDepartmentPermissions(permissions);

        setDepartmentsList(allowedDepartments);

        setStudents(allowedStudents);

        // একটিমাত্র বিভাগ অনুমোদিত হলে সেটি স্বয়ংক্রিয়ভাবে select হবে।

        setDepartmentName(
          !admin && allowedDepartments.length === 1
            ? allowedDepartments[0].name
            : "",
        );

        setClassBatchName("");
      } catch (error) {
        console.error("Students loading error:", error);

        toast.error("শিক্ষার্থীদের তথ্য লোড করা যায়নি।");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;

      unsubscribe();
    };
  }, []);

  // --------------------------------------------------

  // Department & Batch

  // --------------------------------------------------

  const selectedDepartment = useMemo(
    () =>
      departmentsList.find(
        (item) => normalize(item.name) === normalize(departmentName),
      ),

    [departmentsList, departmentName],
  );

  const classBatchOptions = useMemo(
    () => selectedDepartment?.classes || [],

    [selectedDepartment],
  );

  const selectedBatch = useMemo(() => {
    if (!selectedDepartment || selectedDepartment.type !== "batch") {
      return null;
    }

    const batch = classBatchOptions.find(
      (item) => normalize(item.name) === normalize(classBatchName),
    );

    if (!batch) return null;

    return {
      id: batch.id || batch.batchId,

      name: batch.name,
    };
  }, [selectedDepartment, classBatchOptions, classBatchName]);

  // --------------------------------------------------

  // Student Filtering

  // --------------------------------------------------

  const filteredStudents = useMemo(() => {
    const keyword = normalize(search);

    return students.filter((student) => {
      const matchesDepartment =
        !departmentName ||
        normalize(student.departmentName) === normalize(departmentName);

      const matchesClass =
        !classBatchName ||
        normalize(student.className) === normalize(classBatchName) ||
        normalize(student.batchName) === normalize(classBatchName);

      const searchable = [
        student.name,

        student.studentName,

        student.studentId,

        student.phone,

        student.mobile,

        getFatherName(student),

        student.villageName,

        student.className,

        student.batchName,

        student.departmentName,
      ]

        .map(normalize)

        .join(" ");

      return (
        matchesDepartment &&
        matchesClass &&
        (!keyword || searchable.includes(keyword))
      );
    });
  }, [students, departmentName, classBatchName, search]);

  const activeCount = filteredStudents.filter(isStudentActive).length;

  // --------------------------------------------------
  // Individual Student Mark Management (TopLine Care)
  // --------------------------------------------------

  async function handleIndividualMarkAction(student, mode = "add") {
    if (!isAdminUser || !isCareStudent(student)) {
      toast.error(
        "শুধু Admin TopLine Care শিক্ষার্থীর মার্ক পরিবর্তন করতে পারবেন।",
      );
      return;
    }
    if (markUpdatingId) return;

    let amount = 0;
    if (mode === "add") {
      const inputResult = await Swal.fire({
        title: "ব্যক্তিগত মার্ক যোগ করুন",
        input: "number",
        inputLabel: `${student.name || "শিক্ষার্থী"}-এর সঙ্গে কত মার্ক যোগ করবেন?`,
        inputPlaceholder: "যেমন: 2",
        inputAttributes: { min: 1, step: 1 },
        showCancelButton: true,
        confirmButtonText: "মার্ক যোগ করুন",
        cancelButtonText: "বাতিল",
        inputValidator: (value) => {
          if (!value || !Number.isInteger(Number(value)) || Number(value) < 1) {
            return "সঠিক ধনাত্মক পূর্ণসংখ্যা লিখুন।";
          }
        },
      });
      if (!inputResult.isConfirmed) return;
      amount = Number(inputResult.value);
    }

    const currentMark = Number(student.currentMark) || 0;
    const nextMark = mode === "reset" ? 0 : currentMark + amount;
    const confirmation = await Swal.fire({
      title:
        mode === "reset"
          ? "এই শিক্ষার্থীর মার্ক Reset করবেন?"
          : "মার্ক যোগ নিশ্চিত করুন",
      html: `<div style="font-size:14px;line-height:1.8">
        <b>${student.name || "শিক্ষার্থী"}</b><br/>
        বর্তমান মার্ক: <b>${currentMark}</b><br/>
        ${mode === "reset" ? "নতুন মার্ক হবে ০।" : `যোগ হবে: <b>${amount}</b><br/>নতুন মার্ক: <b>${nextMark}</b>`}
        <br/><span style="color:#dc2626">শুধু এই শিক্ষার্থীর মার্ক পরিবর্তন হবে।</span>
      </div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText:
        mode === "reset" ? "হ্যাঁ, Reset করুন" : "হ্যাঁ, যোগ করুন",
      cancelButtonText: "বাতিল",
      confirmButtonColor: mode === "reset" ? "#dc2626" : "#2563eb",
      reverseButtons: true,
    });
    if (!confirmation.isConfirmed) return;

    setMarkUpdatingId(student.id);
    const loadingToast = toast.loading("মার্ক আপডেট হচ্ছে...");
    try {
      const markUpdate = {
        currentMark: mode === "reset" ? 0 : increment(amount),
        currentMarkUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "",
      };
      if (student.batchId)
        markUpdate.currentMarkPeriod = `care:${student.batchId}`;

      await updateDoc(doc(db, "students", student.id), markUpdate);
      setStudents((previous) =>
        previous.map((item) =>
          item.id !== student.id
            ? item
            : {
                ...item,
                currentMark: nextMark,
                ...(student.batchId
                  ? { currentMarkPeriod: `care:${student.batchId}` }
                  : {}),
              },
        ),
      );

      toast.dismiss(loadingToast);
      await Swal.fire({
        title: "সফল হয়েছে!",
        text: `${student.name || "শিক্ষার্থী"}-এর বর্তমান মার্ক ${nextMark}।`,
        icon: "success",
        confirmButtonText: "ঠিক আছে",
      });
    } catch (error) {
      console.error("Individual mark update error:", error);
      toast.dismiss(loadingToast);
      toast.error("মার্ক আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setMarkUpdatingId("");
    }
  }

  // --------------------------------------------------

  // Student Active / Inactive

  // --------------------------------------------------

  async function handleToggleStatus(student) {
    if (!canManageStudents || updatingId) return;

    const currentlyActive = isStudentActive(student);

    const newStatus = !currentlyActive;

    const result = await Swal.fire({
      title: newStatus
        ? "শিক্ষার্থী সক্রিয় করবেন?"
        : "শিক্ষার্থী নিষ্ক্রিয় করবেন?",

      text: student.name,

      icon: "question",

      showCancelButton: true,

      confirmButtonText: "নিশ্চিত করুন",

      cancelButtonText: "বাতিল",

      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setUpdatingId(student.id);

    try {
      await updateDoc(doc(db, "students", student.id), {
        approved: newStatus,

        updatedAt: serverTimestamp(),

        updatedBy: auth.currentUser?.uid || "",
      });

      setStudents((previous) =>
        previous.map((item) =>
          item.id === student.id
            ? {
                ...item,

                approved: newStatus,
              }
            : item,
        ),
      );

      toast.success("Status আপডেট হয়েছে।");
    } catch (error) {
      console.error(error);

      toast.error("Status পরিবর্তন করা যায়নি।");
    } finally {
      setUpdatingId("");
    }
  }

  // --------------------------------------------------

  // Make CR

  // --------------------------------------------------

  async function handleMakeCR(student) {
    if (!canManageStudents || !isCareStudent(student) || updatingId) {
      return;
    }

    const result = await Swal.fire({
      title: "Make CR?",

      text: `${student.name}-কে CR নির্বাচন করবেন?`,

      icon: "question",

      showCancelButton: true,

      confirmButtonText: "হ্যাঁ",

      cancelButtonText: "বাতিল",
    });

    if (!result.isConfirmed) return;

    setUpdatingId(student.id);

    try {
      await updateDoc(doc(db, "students", student.id), {
        isCR: true,

        updatedAt: serverTimestamp(),

        updatedBy: auth.currentUser?.uid || "",
      });

      setStudents((previous) =>
        previous.map((item) =>
          item.id === student.id ? { ...item, isCR: true } : item,
        ),
      );

      toast.success("CR নির্বাচন করা হয়েছে।");
    } catch (error) {
      console.error(error);

      toast.error("CR নির্বাচন করা যায়নি।");
    } finally {
      setUpdatingId("");
    }
  }

  // --------------------------------------------------

  // Edit Profile

  // --------------------------------------------------

  function openEditProfile(student) {
    if (!canManageStudents) return;

    const department = departmentsList.find(
      (item) => normalize(item.name) === normalize(student.departmentName),
    );

    if (
      !isAdminUser &&
      !hasDepartmentPermission(department, departmentPermissions)
    ) {
      toast.error("এই শিক্ষার্থীর তথ্য সম্পাদনার অনুমতি নেই।");

      return;
    }

    setEditingStudent(student);

    setEditForm({
      fatherName: getFatherName(student),

      motherName: student.motherName || student.mother || "",

      dateOfBirth: student.dateOfBirth || "",

      religion: student.religion || "",

      roll: String(student.roll ?? ""),
    });

    setEditPhoto(null);

    setEditPreview(getPhoto(student));
  }

  function closeEditProfile() {
    if (profileBusy) return;

    if (editPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editPreview);
    }

    setEditingStudent(null);

    setEditForm(initialForm);

    setEditPhoto(null);

    setEditPreview("");
  }

  function handleEditChange(event) {
    const { name, value } = event.target;

    setEditForm((previous) => ({
      ...previous,

      [name]: value,
    }));
  }

  function handleEditPhotoSelect(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("শুধু ছবি নির্বাচন করুন।");

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("ছবি সর্বোচ্চ ৫ MB হতে পারবে।");

      return;
    }

    if (editPreview) {
      toast.error("আগের ছবি মুছে নতুন ছবি নির্বাচন করুন।");

      return;
    }

    setEditPhoto(file);

    setEditPreview(URL.createObjectURL(file));
  }

  // --------------------------------------------------

  // Image Resize

  // --------------------------------------------------

  async function resizeImage(file) {
    const url = URL.createObjectURL(file);

    const image = new Image();

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;

        image.onerror = reject;

        image.src = url;
      });

      const canvas = document.createElement("canvas");

      canvas.width = 200;

      canvas.height = 200;

      const size = Math.min(image.width, image.height);

      const context = canvas.getContext("2d");

      context.drawImage(
        image,

        (image.width - size) / 2,

        (image.height - size) / 2,

        size,

        size,

        0,

        0,

        200,

        200,
      );

      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("ছবি Resize করা যায়নি।")),

          "image/jpeg",

          0.9,
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // --------------------------------------------------

  // Image Upload

  // --------------------------------------------------

  async function uploadEditPhoto() {
    if (!editPhoto) return {};

    if (!IMGBB_API_KEY) {
      throw new Error("ImageBB API key পাওয়া যায়নি।");
    }

    setUploadingPhoto(true);

    try {
      const blob = await resizeImage(editPhoto);

      const body = new FormData();

      body.append("image", blob, "student-profile.jpg");

      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,

        {
          method: "POST",

          body,
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("ছবি আপলোড করা যায়নি।");
      }

      return {
        photoURL: result.data.url,

        photoDeleteURL: result.data.delete_url,
      };
    } finally {
      setUploadingPhoto(false);
    }
  }

  // --------------------------------------------------

  // Delete Photo

  // --------------------------------------------------

  async function handleDeleteEditPhoto() {
    if (!editingStudent || profileBusy || !editPreview) {
      return;
    }

    const result = await Swal.fire({
      title: "ছবি মুছবেন?",

      text: "আগের ছবিটি মুছে যাবে।",

      icon: "warning",

      showCancelButton: true,

      confirmButtonText: "হ্যাঁ, মুছুন",

      cancelButtonText: "বাতিল",
    });

    if (!result.isConfirmed) return;

    setDeletingPhoto(true);

    try {
      // নতুন ছবি নির্বাচন করে থাকলে শুধু preview বাতিল হবে।

      if (editPhoto) {
        URL.revokeObjectURL(editPreview);

        setEditPhoto(null);

        setEditPreview("");

        return;
      }

      const deleteURL = editingStudent.photoDeleteURL;

      if (!deleteURL) {
        throw new Error("ImageBB Delete URL পাওয়া যায়নি।");
      }

      const response = await fetch(deleteURL);

      if (!response.ok) {
        throw new Error("ছবি মুছে ফেলা যায়নি।");
      }

      const cleared = {
        photoURL: "",

        photoUrl: "",

        imageUrl: "",

        photo: "",

        image: "",

        profileImage: "",

        photoDeleteURL: "",

        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "students", editingStudent.id), cleared);

      setStudents((previous) =>
        previous.map((item) =>
          item.id === editingStudent.id ? { ...item, ...cleared } : item,
        ),
      );

      setEditingStudent((previous) => ({
        ...previous,

        ...cleared,
      }));

      setEditPreview("");
    } catch (error) {
      console.error(error);

      toast.error(error.message || "ছবি মুছতে সমস্যা হয়েছে।");
    } finally {
      setDeletingPhoto(false);
    }
  }

  // --------------------------------------------------

  // Save Profile

  // --------------------------------------------------

  async function handleSaveProfile(event) {
    event.preventDefault();

    if (!editingStudent || profileBusy) return;

    setSavingProfile(true);

    try {
      const photoData = await uploadEditPhoto();

      const updatedData = {
        fatherName: editForm.fatherName.trim(),

        motherName: editForm.motherName.trim(),

        dateOfBirth: editForm.dateOfBirth,

        religion: editForm.religion,

        roll: editForm.roll.trim(),

        ...photoData,

        updatedAt: serverTimestamp(),

        updatedBy: auth.currentUser?.uid || "",
      };

      await updateDoc(doc(db, "students", editingStudent.id), updatedData);

      setStudents((previous) =>
        previous.map((item) =>
          item.id === editingStudent.id ? { ...item, ...updatedData } : item,
        ),
      );

      toast.success("প্রোফাইল আপডেট হয়েছে।");

      closeEditProfile();
    } catch (error) {
      console.error(error);

      toast.error(error.message || "প্রোফাইল আপডেট করা যায়নি।");
    } finally {
      setSavingProfile(false);
    }
  }

  // --------------------------------------------------

  // Access Control

  // --------------------------------------------------

  if (loading) return <Loading />;

  if (!auth.currentUser || !canViewStudents) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-base-300 bg-base-100 p-8 text-center">
        <h2 className="text-lg font-bold">Access Denied</h2>

        <p className="mt-2 text-sm text-base-content/60">
          শিক্ষার্থীদের তালিকা দেখার অনুমতি নেই।
        </p>
      </div>
    );
  }

  // --------------------------------------------------

  // UI

  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-base-200/50 px-3 py-5 text-base-content sm:px-5">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header & Filters */}

        <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-6 w-6"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-3a4 4 0 0 1 0 8m4 5v-2a4 4 0 0 0-3-3.87" />
                </svg>
              </div>

              <div>
                <h1 className="text-lg font-bold">শিক্ষার্থী ব্যবস্থাপনা</h1>

                <p className="text-xs text-base-content/50">
                  মোট {filteredStudents.length} জন শিক্ষার্থী
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="rounded-xl bg-success/10 px-3 py-2">
                <p className="text-[10px] text-base-content/60">Active</p>

                <p className="text-lg font-bold text-success">{activeCount}</p>
              </div>

              <div className="rounded-xl bg-error/10 px-3 py-2">
                <p className="text-[10px] text-base-content/60">Inactive</p>

                <p className="text-lg font-bold text-error">
                  {filteredStudents.length - activeCount}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="mb-1.5 text-xs font-semibold text-base-content/60">
                বিভাগ
              </span>

              <select
                className="select select-bordered select-sm w-full"
                value={departmentName}
                disabled={!isAdminUser && departmentsList.length === 1}
                onChange={(event) => {
                  setDepartmentName(event.target.value);

                  setClassBatchName("");
                }}
              >
                <option value="">সব অনুমোদিত বিভাগ</option>

                {departmentsList.map((item) => (
                  <option key={item.id || item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="mb-1.5 text-xs font-semibold text-base-content/60">
                শ্রেণি / ব্যাচ
              </span>

              <select
                className="select select-bordered select-sm w-full"
                value={classBatchName}
                disabled={!departmentName}
                onChange={(event) => setClassBatchName(event.target.value)}
              >
                <option value="">সব শ্রেণি / ব্যাচ</option>

                {classBatchOptions.map((item) => (
                  <option key={item.id || item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="mb-1.5 text-xs font-semibold text-base-content/60">
                শিক্ষার্থী খুঁজুন
              </span>

              <input
                type="search"
                placeholder="নাম, ID, ফোন..."
                className="input input-bordered input-sm w-full"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
        </section>

        {/* Student List */}

        {filteredStudents.length === 0 ? (
          <div className="rounded-2xl border border-base-300 bg-base-100 p-12 text-center">
            <h2 className="font-bold">কোনো শিক্ষার্থী পাওয়া যায়নি</h2>

            <p className="mt-1 text-xs text-base-content/50">
              সার্চ অথবা ফিল্টার পরিবর্তন করে দেখুন।
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => {
              const active = isStudentActive(student);

              const phone = getPhone(student);

              const studentRouteId = student.studentId || student.id;

              const careStudent = isCareStudent(student);

              return (
                <article
                  key={student.id}
                  className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/30 hover:shadow-md"
                >
                  {/* Student Header */}

                  <div className="flex items-start gap-3 p-4">
                    <StudentAvatar student={student} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-bold">
                            {student.name ||
                              student.studentName ||
                              "নাম দেওয়া হয়নি"}
                          </h2>

                          <p className="mt-1 font-mono text-xs text-primary">
                            ID: {studentRouteId}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`badge badge-sm ${
                              active ? "badge-success" : "badge-error"
                            }`}
                          >
                            {active ? "Active" : "Inactive"}
                          </span>

                          {student.isCR && (
                            <span className="badge badge-primary badge-sm">
                              CR
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {student.departmentName && (
                          <span className="badge badge-ghost badge-xs">
                            {student.departmentName}
                          </span>
                        )}

                        {student.className && (
                          <span className="badge badge-ghost badge-xs">
                            {student.className}
                          </span>
                        )}

                        {student.batchName && (
                          <span className="badge badge-outline badge-xs">
                            {student.batchName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Student Information */}

                  <div className="grid grid-cols-2 gap-3 border-t border-base-300 px-4 py-3">
                    <Info label="পিতার নাম" value={getFatherName(student)} />

                    <Info label="মোবাইল" value={phone} />
                  </div>

                  {canManageStudents && student.pin && (
                    <div className="border-t border-base-300 px-4 py-2">
                      <Info label="PIN" value={student.pin} />
                    </div>
                  )}

                  {/* Main Actions */}

                  {careStudent && (
                    <div className="flex items-center justify-between border-t border-base-300 bg-base-200/50 px-4 py-2">
                      <span className="text-xs text-base-content/60">
                        বর্তমান মার্ক
                      </span>
                      <span className="badge badge-primary badge-lg">
                        {Number(student.currentMark) || 0}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 border-t border-base-300 p-3">
                    {phone ? (
                      <a
                        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                        className="btn btn-outline btn-success btn-xs flex-1"
                      >
                        Call
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="btn btn-outline btn-xs flex-1"
                      >
                        No phone
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => navigate(`/student/${studentRouteId}`)}
                      className="btn btn-primary btn-xs flex-1"
                    >
                      View Profile →
                    </button>
                  </div>

                  {/* Management Actions */}

                  {canManageStudents && (
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      <button
                        type="button"
                        onClick={() => openEditProfile(student)}
                        className="btn btn-outline btn-primary btn-xs"
                      >
                        Edit Profile
                      </button>

                      {isAdminUser && careStudent && (
                        <>
                          <button
                            type="button"
                            disabled={markUpdatingId === student.id}
                            onClick={() =>
                              handleIndividualMarkAction(student, "add")
                            }
                            className="btn btn-primary btn-xs"
                          >
                            {markUpdatingId === student.id
                              ? "Updating..."
                              : "+ মার্ক যোগ"}
                          </button>
                          <button
                            type="button"
                            disabled={
                              markUpdatingId === student.id ||
                              !(Number(student.currentMark) > 0)
                            }
                            onClick={() =>
                              handleIndividualMarkAction(student, "reset")
                            }
                            className="btn btn-outline btn-error btn-xs"
                          >
                            মার্ক Reset
                          </button>
                        </>
                      )}

                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-base-300 text-xs">
                        <input
                          type="checkbox"
                          className="toggle toggle-success toggle-xs"
                          checked={active}
                          disabled={updatingId === student.id}
                          onChange={() => handleToggleStatus(student)}
                        />

                        {updatingId === student.id
                          ? "Processing"
                          : active
                            ? "Active"
                            : "Inactive"}
                      </label>

                      {careStudent && !student.isCR && (
                        <button
                          type="button"
                          disabled={Boolean(updatingId)}
                          onClick={() => handleMakeCR(student)}
                          className="btn btn-outline btn-secondary btn-xs col-span-2"
                        >
                          Make CR
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {/* --------------------------------------------------*

          Edit Profile Modal

*      -------------------------------------------------- */}

      {editingStudent && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditProfile();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="my-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
          >
            {/* Modal Header */}

            <div className="flex items-center justify-between border-b border-base-300 p-4">
              <div>
                <h2 className="font-bold">Edit Student Profile</h2>

                <p className="mt-1 text-xs text-base-content/50">
                  {editingStudent.name} · {editingStudent.studentId}
                </p>
              </div>

              <button
                type="button"
                disabled={profileBusy}
                onClick={closeEditProfile}
                className="btn btn-circle btn-ghost btn-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="max-h-[75vh] space-y-5 overflow-y-auto p-4">
                {/* Profile Photo */}

                <div className="flex flex-col items-center rounded-2xl border border-base-300 bg-base-200/30 p-5">
                  <div className="h-36 w-36 overflow-hidden rounded-full border-4 border-base-100 bg-base-200 shadow-md">
                    {editPreview ? (
                      <img
                        src={editPreview}
                        alt="Student"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl font-bold text-primary">
                        {getInitials(editingStudent.name)}
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-base-content/50">
                    200 × 200 · সর্বোচ্চ 5 MB
                  </p>

                  {editPreview && !editPhoto ? (
                    <button
                      type="button"
                      disabled={profileBusy}
                      onClick={handleDeleteEditPhoto}
                      className="btn btn-outline btn-error btn-xs mt-3"
                    >
                      {deletingPhoto ? "Deleting..." : "Delete Photo"}
                    </button>
                  ) : (
                    <label className="btn btn-primary btn-xs mt-3">
                      Select Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={profileBusy || Boolean(editPreview)}
                        onChange={handleEditPhotoSelect}
                      />
                    </label>
                  )}

                  {editPhoto && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs mt-2"
                      disabled={profileBusy}
                      onClick={() => {
                        URL.revokeObjectURL(editPreview);

                        setEditPhoto(null);

                        setEditPreview("");
                      }}
                    >
                      Cancel New Photo
                    </button>
                  )}
                </div>

                {/* Profile Fields */}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ["fatherName", "বাবার নাম", "text"],

                    ["motherName", "মায়ের নাম", "text"],

                    ["dateOfBirth", "জন্মতারিখ", "date"],

                    ["roll", "রোল নম্বর", "text"],
                  ].map(([name, label, type]) => (
                    <label key={name} className="form-control">
                      <span className="mb-1.5 text-xs font-medium">
                        {label}
                      </span>

                      <input
                        type={type}
                        name={name}
                        value={editForm[name]}
                        onChange={handleEditChange}
                        className="input input-bordered input-sm"
                        disabled={profileBusy}
                      />
                    </label>
                  ))}

                  <label className="form-control sm:col-span-2">
                    <span className="mb-1.5 text-xs font-medium">ধর্ম</span>

                    <select
                      name="religion"
                      value={editForm.religion}
                      onChange={handleEditChange}
                      className="select select-bordered select-sm"
                      disabled={profileBusy}
                    >
                      <option value="">ধর্ম নির্বাচন করুন</option>

                      {[
                        "ইসলাম",

                        "হিন্দু",

                        "বৌদ্ধ",

                        "খ্রিস্টান",

                        "অন্যান্য",
                      ].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="text-xs text-base-content/50">সব তথ্য ঐচ্ছিক।</p>
              </div>

              {/* Modal Footer */}

              <div className="flex flex-col-reverse justify-end gap-2 border-t border-base-300 p-4 sm:flex-row">
                <button
                  type="button"
                  onClick={closeEditProfile}
                  disabled={profileBusy}
                  className="btn btn-ghost btn-sm"
                >
                  বাতিল
                </button>

                <button
                  type="submit"
                  disabled={profileBusy}
                  className="btn btn-primary btn-sm"
                >
                  {profileBusy ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      সেভ হচ্ছে...
                    </>
                  ) : (
                    "প্রোফাইল সেভ করুন"
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
