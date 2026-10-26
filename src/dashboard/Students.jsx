import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Swal from "sweetalert2";
import toast from "react-hot-toast";

import { auth, db } from "../assets/firebase/firebase.init";
import { departments } from "../config/departments";

const SUPERADMIN_EMAIL = "jihadur51@gmail.com";
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

const initialForm = {
  fatherName: "",
  motherName: "",
  dateOfBirth: "",
  religion: "",
  roll: "",
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeOptionName = normalizeText;

function getName(item) {
  return (
    item?.name ||
    item?.className ||
    item?.batchName ||
    item?.departmentName ||
    item?.title ||
    ""
  );
}

function getPhoto(student) {
  return (
    student?.photoURL ||
    student?.photoUrl ||
    student?.imageUrl ||
    student?.photo ||
    student?.image ||
    student?.profileImage ||
    ""
  );
}

function getFatherName(student) {
  return (
    student?.fatherName ||
    student?.father ||
    student?.fathersName ||
    student?.father_name ||
    ""
  );
}

function getMotherName(student) {
  return (
    student?.motherName ||
    student?.mother ||
    student?.mothersName ||
    student?.mother_name ||
    ""
  );
}

function getPhone(student) {
  return String(
    student?.phone || student?.mobile || student?.guardianPhone || "",
  ).trim();
}

function getRole(profile, email) {
  if (normalizeText(email) === normalizeText(SUPERADMIN_EMAIL)) {
    return "admin";
  }

  const role = normalizeText(profile?.role).replace(/[\s-]+/g, "_");

  if (["admin", "superadmin"].includes(role)) return "admin";

  if (
    [
      "department_head",
      "departmenthead",
      "head",
      "বিভাগীয় প্রধান",
      "বিভাগীয় প্রধান",
    ].includes(role)
  ) {
    return "departmentHead";
  }

  if (["teacher", "শিক্ষক", "শিক্ষিকা"].includes(role)) {
    return "teacher";
  }

  return role;
}

function normalizeId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? String(Number(text)) : text;
}

function getDepartmentPermissions(profile) {
  const values = [
    ...(Array.isArray(profile?.departmentIds) ? profile.departmentIds : []),
    ...(Array.isArray(profile?.departments)
      ? profile.departments.map((item) =>
          typeof item === "object"
            ? (item.departmentId ?? item.id ?? item.name)
            : item,
        )
      : []),
  ];

  if (profile?.departmentId != null) {
    values.push(profile.departmentId);
  }

  if (profile?.department?.id != null) {
    values.push(profile.department.id);
  }

  if (profile?.department?.departmentId != null) {
    values.push(profile.department.departmentId);
  }

  if (profile?.departmentName) {
    values.push(profile.departmentName);
  }

  if (profile?.department?.name) {
    values.push(profile.department.name);
  }

  return [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter(Boolean),
    ),
  ];
}

function isStudentEnabled(student) {
  const inactiveValues = [
    "disabled",
    "pending",
    "inactive",
    "blocked",
    "suspended",
    "false",
    "0",
  ];

  return !(
    student?.isActive === false ||
    student?.isActive === 0 ||
    student?.isActive === "false" ||
    student?.isActive === "0" ||
    student?.active === false ||
    student?.enabled === false ||
    student?.approved === false ||
    inactiveValues.includes(normalizeText(student?.status))
  );
}

function isToplineCareStudent(student) {
  const careName = normalizeText(departments.CARE.name);
  const studentDepartment = normalizeText(
    student?.departmentName ||
      (typeof student?.department === "string" ? student.department : ""),
  );

  return (
    student?.isCare === true ||
    studentDepartment === careName ||
    studentDepartment.includes("টপলাইন কেয়ার") ||
    studentDepartment.includes("টপলাইন কেয়ার") ||
    studentDepartment.includes("care")
  );
}

function getInitials(name) {
  return String(name || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();
}

function StudentAvatar({ student }) {
  const [imageError, setImageError] = useState(false);
  const photo = getPhoto(student);

  useEffect(() => {
    setImageError(false);
  }, [photo]);

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-base font-bold text-primary ring-1 ring-primary/10">
      {photo && !imageError ? (
        <img
          src={photo}
          alt={student?.name || "Student"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        getInitials(student?.name)
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

function LoadingSpinner({ text = "লোড হচ্ছে..." }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3">
      <span className="loading loading-spinner loading-lg text-primary" />
      <p className="text-sm text-base-content/60">{text}</p>
    </div>
  );
}

function hasDepartmentPermission(permissionValues, department) {
  const permissionNames = permissionValues.map(normalizeText);

  return (
    permissionNames.includes(normalizeId(department.id)) ||
    permissionNames.includes(normalizeText(department.name)) ||
    permissionNames.includes(normalizeText(department.key))
  );
}

export default function Students() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("");
  const [departmentPermissions, setDepartmentPermissions] = useState([]);

  const [departmentsList, setDepartmentsList] = useState([]);
  const [students, setStudents] = useState([]);

  const [departmentName, setDepartmentName] = useState("");
  const [classBatchName, setClassBatchName] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");

  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState(initialForm);
  const [editPhoto, setEditPhoto] = useState(null);
  const [editPreview, setEditPreview] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);

  const isAdmin = role === "admin";
  const isDepartmentHead = role === "departmentHead";
  const canManageStudents = isAdmin || isDepartmentHead;
  const hasAccess = canManageStudents || role === "teacher";
  const profileBusy = savingProfile || uploadingPhoto || deletingPhoto;

  // Load profile, departments from config, and students from Firestore.
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setLoading(true);

      if (!user) {
        setProfile(null);
        setRole("");
        setDepartmentPermissions([]);
        setDepartmentsList([]);
        setStudents([]);
        setLoading(false);
        return;
      }

      try {
        const profileSnapshot = await getDoc(doc(db, "users", user.uid));

        if (!active) return;

        const userProfile = profileSnapshot.exists()
          ? profileSnapshot.data()
          : {};

        const userRole = getRole(userProfile, user.email);
        const allowedDepartmentValues = getDepartmentPermissions(userProfile);

        const accountDisabled =
          userRole !== "admin" &&
          (userProfile.accountAccess === false ||
            userProfile.isActive === false);

        if (
          !["admin", "departmentHead", "teacher"].includes(userRole) ||
          accountDisabled ||
          (userRole !== "admin" && allowedDepartmentValues.length === 0)
        ) {
          setProfile(userProfile);
          setRole(userRole);
          setDepartmentPermissions([]);
          setDepartmentsList([]);
          setStudents([]);
          setLoading(false);
          return;
        }

        // Department/class/batch names come from departments.js.
        const configuredDepartments = Object.values(departments);

        const permittedDepartments =
          userRole === "admin"
            ? configuredDepartments
            : configuredDepartments.filter((department) =>
                hasDepartmentPermission(allowedDepartmentValues, department),
              );

        // Only students are loaded from Firestore.
        const studentSnapshot = await getDocs(collection(db, "students"));

        if (!active) return;

        const studentData = studentSnapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }));

        const permittedDepartmentNames = new Set(
          permittedDepartments.map((department) =>
            normalizeOptionName(department.name),
          ),
        );

        const allowedStudents =
          userRole === "admin"
            ? studentData
            : studentData.filter((student) =>
                permittedDepartmentNames.has(
                  normalizeOptionName(student.departmentName),
                ),
              );

        setProfile(userProfile);
        setRole(userRole);
        setDepartmentPermissions(allowedDepartmentValues);
        setDepartmentsList(permittedDepartments);
        setStudents(allowedStudents);

        if (userRole !== "admin" && permittedDepartments.length === 1) {
          setDepartmentName(permittedDepartments[0].name);
        } else {
          setDepartmentName("");
        }

        setClassBatchName("");
      } catch (error) {
        console.error("Students loading error:", error);
        toast.error("শিক্ষার্থীদের তথ্য লোড করা যায়নি।");

        if (active) {
          setProfile(null);
          setRole("");
          setDepartmentPermissions([]);
          setDepartmentsList([]);
          setStudents([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Classes and batches are configured in departments.js.
  const classBatchOptions = useMemo(() => {
    if (!departmentName) return [];

    const selectedDepartment = departmentsList.find(
      (department) =>
        normalizeOptionName(department.name) ===
        normalizeOptionName(departmentName),
    );

    if (!selectedDepartment) return [];

    return (selectedDepartment.classes || []).map((item) => ({
      name: item.name,
      type: selectedDepartment.type === "batch" ? "batch" : "class",
    }));
  }, [departmentsList, departmentName]);

  const filteredStudents = useMemo(() => {
    const keyword = normalizeText(search);
    const selectedDepartment = normalizeOptionName(departmentName);
    const selectedClassBatch = normalizeOptionName(classBatchName);

    return students.filter((student) => {
      // Match department by its name, not departmentId.
      const studentDepartment = normalizeOptionName(
        student.departmentName ||
          (typeof student.department === "string"
            ? student.department
            : student.department?.name),
      );

      const matchesDepartment =
        !selectedDepartment || studentDepartment === selectedDepartment;

      const studentClassName = normalizeOptionName(
        student.className || student.class,
      );

      const studentBatchName = normalizeOptionName(
        student.batchName || student.batch,
      );

      const matchesClassBatch =
        !selectedClassBatch ||
        studentClassName === selectedClassBatch ||
        studentBatchName === selectedClassBatch;

      const searchableText = [
        student.name,
        student.studentId,
        student.phone,
        student.mobile,
        getFatherName(student),
        getMotherName(student),
        student.villageName,
        student.className,
        student.class,
        student.batchName,
        student.batch,
        student.departmentName,
      ]
        .map(normalizeText)
        .join(" ");

      return (
        matchesDepartment &&
        matchesClassBatch &&
        (!keyword || searchableText.includes(keyword))
      );
    });
  }, [students, departmentName, classBatchName, search]);

  const enabledCount = filteredStudents.filter(isStudentEnabled).length;

  async function handleToggleStatus(student) {
    if (!canManageStudents) {
      toast.error("এই কাজের অনুমতি আপনার নেই।");
      return;
    }

    const studentDepartment = departmentsList.find(
      (department) =>
        normalizeOptionName(department.name) ===
        normalizeOptionName(student.departmentName),
    );

    if (
      !isAdmin &&
      (!studentDepartment ||
        !hasDepartmentPermission(departmentPermissions, studentDepartment))
    ) {
      toast.error("এই শিক্ষার্থী পরিচালনার অনুমতি নেই।");
      return;
    }

    if (updatingId) return;

    const nextEnabled = !isStudentEnabled(student);

    const result = await Swal.fire({
      title: nextEnabled
        ? "শিক্ষার্থী সক্রিয় করবেন?"
        : "শিক্ষার্থী নিষ্ক্রিয় করবেন?",
      text: `${student.name || "এই শিক্ষার্থী"}-এর অ্যাকাউন্ট ${
        nextEnabled ? "সক্রিয়" : "নিষ্ক্রিয়"
      } করা হবে।`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: nextEnabled
        ? "হ্যাঁ, সক্রিয় করুন"
        : "হ্যাঁ, নিষ্ক্রিয় করুন",
      cancelButtonText: "বাতিল",
      reverseButtons: true,
      buttonsStyling: false,
      customClass: {
        popup:
          "rounded-2xl border border-base-300 bg-base-100 text-base-content",
        title: "text-base-content",
        htmlContainer: "text-base-content/70",
        confirmButton: "btn btn-primary mx-1",
        cancelButton: "btn btn-ghost mx-1",
      },
    });

    if (!result.isConfirmed) return;

    setUpdatingId(student.id);

    try {
      await updateDoc(doc(db, "students", student.id), {
        isActive: nextEnabled,
        approved: nextEnabled ? true : student.approved === true,
        status: nextEnabled ? "approved" : "disabled",
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "",
      });

      setStudents((previous) =>
        previous.map((item) =>
          item.id === student.id
            ? {
                ...item,
                isActive: nextEnabled,
                approved: nextEnabled ? true : item.approved === true,
                status: nextEnabled ? "approved" : "disabled",
              }
            : item,
        ),
      );

      toast.success(
        nextEnabled
          ? "শিক্ষার্থী সক্রিয় হয়েছে।"
          : "শিক্ষার্থী নিষ্ক্রিয় হয়েছে।",
      );
    } catch (error) {
      console.error("Student status update error:", error);
      toast.error("শিক্ষার্থীর Status পরিবর্তন করা যায়নি।");
    } finally {
      setUpdatingId("");
    }
  }

  async function handleMakeCR(student) {
    if (!canManageStudents) {
      toast.error("এই কাজের অনুমতি আপনার নেই।");
      return;
    }

    if (!isToplineCareStudent(student)) {
      toast.error("শুধু টপলাইন কেয়ারের শিক্ষার্থীকে CR করা যাবে।");
      return;
    }

    const studentDepartment = departmentsList.find(
      (department) =>
        normalizeOptionName(department.name) ===
        normalizeOptionName(student.departmentName),
    );

    if (
      !isAdmin &&
      (!studentDepartment ||
        !hasDepartmentPermission(departmentPermissions, studentDepartment))
    ) {
      toast.error("এই শিক্ষার্থী পরিচালনার অনুমতি নেই।");
      return;
    }

    if (student.isCR === true || updatingId) return;

    const result = await Swal.fire({
      title: "CR নির্বাচন করবেন?",
      text: `${student.name || "এই শিক্ষার্থী"}-কে CR হিসেবে চিহ্নিত করা হবে।`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, Make CR",
      cancelButtonText: "বাতিল",
      reverseButtons: true,
      buttonsStyling: false,
      customClass: {
        popup:
          "rounded-2xl border border-base-300 bg-base-100 text-base-content",
        title: "text-base-content",
        htmlContainer: "text-base-content/70",
        confirmButton: "btn btn-primary mx-1",
        cancelButton: "btn btn-ghost mx-1",
      },
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

      toast.success(`${student.name || "শিক্ষার্থী"} এখন CR।`);
    } catch (error) {
      console.error("Make CR error:", error);
      toast.error("CR হিসেবে চিহ্নিত করা যায়নি।");
    } finally {
      setUpdatingId("");
    }
  }

  function openEditProfile(student) {
    if (!canManageStudents) {
      toast.error("প্রোফাইল সম্পাদনার অনুমতি আপনার নেই।");
      return;
    }

    const studentDepartment = departmentsList.find(
      (department) =>
        normalizeOptionName(department.name) ===
        normalizeOptionName(student.departmentName),
    );

    if (
      !isAdmin &&
      (!studentDepartment ||
        !hasDepartmentPermission(departmentPermissions, studentDepartment))
    ) {
      toast.error("এই শিক্ষার্থী সম্পাদনার অনুমতি নেই।");
      return;
    }

    setEditingStudent(student);

    setEditForm({
      fatherName: getFatherName(student),
      motherName: getMotherName(student),
      dateOfBirth: student.dateOfBirth || "",
      religion: student.religion || "",
      roll: student.roll == null ? "" : String(student.roll),
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
      toast.error("ছবির সাইজ সর্বোচ্চ ৫ MB হতে পারবে।");
      return;
    }

    if (editPreview) {
      toast.error("নতুন ছবি দেওয়ার আগে আগের ছবিটি মুছুন।");
      return;
    }

    setEditPhoto(file);
    setEditPreview(URL.createObjectURL(file));
  }

  async function resizeImage(file) {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("ছবিটি পড়া যায়নি।"));
        image.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("ছবি প্রসেস করা যাচ্ছে না।");
      }

      const size = Math.min(image.width, image.height);
      const sx = (image.width - size) / 2;
      const sy = (image.height - size) / 2;

      context.drawImage(image, sx, sy, size, size, 0, 0, 200, 200);

      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("ছবি রিসাইজ করা যায়নি।"));
            }
          },
          "image/jpeg",
          0.9,
        );
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleDeleteEditPhoto() {
    if (!editingStudent || profileBusy || !editPreview) return;

    const result = await Swal.fire({
      title: "আগের ছবি মুছবেন?",
      text: "ছবি মুছে ফেলার পর নতুন ছবি নির্বাচন করতে পারবেন।",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "হ্যাঁ, মুছুন",
      cancelButtonText: "বাতিল",
      reverseButtons: true,
      buttonsStyling: false,
      customClass: {
        popup:
          "rounded-2xl border border-base-300 bg-base-100 text-base-content",
        title: "text-base-content",
        htmlContainer: "text-base-content/70",
        confirmButton: "btn btn-error mx-1",
        cancelButton: "btn btn-ghost mx-1",
      },
    });

    if (!result.isConfirmed) return;

    setDeletingPhoto(true);

    try {
      if (editPhoto) {
        URL.revokeObjectURL(editPreview);
        setEditPhoto(null);
        setEditPreview("");
        toast.success("নির্বাচিত ছবি সরানো হয়েছে।");
        return;
      }

      const deleteURL = editingStudent.photoDeleteURL;

      if (!deleteURL) {
        throw new Error("ImageBB Delete URL পাওয়া যায়নি।");
      }

      const response = await fetch(deleteURL);

      if (!response.ok) {
        throw new Error("ImageBB ছবি মুছতে পারেনি।");
      }

      const clearedPhotoFields = {
        photoURL: "",
        photoUrl: "",
        imageUrl: "",
        photo: "",
        image: "",
        profileImage: "",
        photoDeleteURL: "",
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "",
      };

      await updateDoc(
        doc(db, "students", editingStudent.id),
        clearedPhotoFields,
      );

      setStudents((previous) =>
        previous.map((item) =>
          item.id === editingStudent.id
            ? { ...item, ...clearedPhotoFields }
            : item,
        ),
      );

      setEditingStudent((previous) => ({
        ...previous,
        ...clearedPhotoFields,
      }));

      setEditPreview("");
      setEditPhoto(null);

      toast.success("আগের ছবি মুছে ফেলা হয়েছে।");
    } catch (error) {
      console.error("Delete profile photo error:", error);
      toast.error(error.message || "ছবি মুছতে সমস্যা হয়েছে।");
    } finally {
      setDeletingPhoto(false);
    }
  }

  async function uploadEditPhoto() {
    if (!editPhoto) return null;

    if (!IMGBB_API_KEY) {
      throw new Error("ImageBB API key পাওয়া যায়নি।");
    }

    setUploadingPhoto(true);

    try {
      const resizedBlob = await resizeImage(editPhoto);
      const body = new FormData();

      body.append("image", resizedBlob, "student-profile.jpg");

      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
        {
          method: "POST",
          body,
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "ছবি আপলোড করা যায়নি।");
      }

      return {
        photoURL: result.data.url,
        photoDeleteURL: result.data.delete_url,
      };
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();

    if (!editingStudent || profileBusy) return;

    const studentDepartment = departmentsList.find(
      (department) =>
        normalizeOptionName(department.name) ===
        normalizeOptionName(editingStudent.departmentName),
    );

    if (
      !isAdmin &&
      (!studentDepartment ||
        !hasDepartmentPermission(departmentPermissions, studentDepartment))
    ) {
      toast.error("এই শিক্ষার্থী সম্পাদনার অনুমতি নেই।");
      return;
    }

    setSavingProfile(true);

    try {
      let photoData = {};

      if (editPhoto) {
        const uploaded = await uploadEditPhoto();
        if (uploaded) photoData = uploaded;
      }

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

      toast.success("শিক্ষার্থীর প্রোফাইল আপডেট হয়েছে।");

      if (editPreview.startsWith("blob:")) {
        URL.revokeObjectURL(editPreview);
      }

      setEditingStudent(null);
      setEditForm(initialForm);
      setEditPhoto(null);
      setEditPreview("");
    } catch (error) {
      console.error("Save student profile error:", error);
      toast.error(error.message || "প্রোফাইল আপডেট করা যায়নি।");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return <LoadingSpinner text="শিক্ষার্থীদের তথ্য লোড হচ্ছে..." />;
  }

  if (!auth.currentUser || !hasAccess || !profile) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-base-300 bg-base-100 p-8 text-center text-base-content">
        <h2 className="text-lg font-bold">Access Denied</h2>
        <p className="mt-2 text-sm text-base-content/60">
          শিক্ষার্থীদের তালিকা দেখার অনুমতি নেই।
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-base-200/50 px-3 py-4 text-base-content sm:px-5">
      <div className="mx-auto max-w-7xl space-y-3">
        <section className="rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-3a4 4 0 0 1 0 8m4 5v-2a4 4 0 0 0-3-3.87"
                  />
                </svg>
              </span>

              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold">শিক্ষার্থী</span>
                <span className="text-xs text-base-content/50">
                  {filteredStudents.length} জন
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-base-200 px-3 py-1.5">
                <span className="text-xs text-base-content/60">সক্রিয় </span>
                <span className="text-sm font-bold text-success">
                  {enabledCount}
                </span>
              </div>

              <div className="rounded-xl bg-base-200 px-3 py-1.5">
                <span className="text-xs text-base-content/60">নিষ্ক্রিয় </span>
                <span className="text-sm font-bold text-error">
                  {filteredStudents.length - enabledCount}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="form-control">
              <span className="mb-1 text-[11px] font-semibold text-base-content/60">
                বিভাগ
              </span>

              <select
                className="select select-bordered select-sm w-full bg-base-100"
                value={departmentName}
                disabled={!isAdmin && departmentsList.length === 1}
                onChange={(event) => {
                  setDepartmentName(event.target.value);
                  setClassBatchName("");
                }}
              >
                <option value="">সব অনুমোদিত বিভাগ</option>

                {departmentsList.map((department) => (
                  <option key={department.name} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="mb-1 text-[11px] font-semibold text-base-content/60">
                শ্রেণি / ব্যাচ
              </span>

              <select
                className="select select-bordered select-sm w-full bg-base-100"
                value={classBatchName}
                disabled={!departmentName}
                onChange={(event) => setClassBatchName(event.target.value)}
              >
                <option value="">
                  {departmentName ? "সব শ্রেণি / ব্যাচ" : "বিভাগ নির্বাচন করুন"}
                </option>

                {classBatchOptions.map((item) => (
                  <option key={`${item.type}-${item.name}`} value={item.name}>
                    {item.name}
                    {item.type === "batch" ? " · Batch" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="mb-1 text-[11px] font-semibold text-base-content/60">
                খুঁজুন
              </span>

              <input
                type="search"
                className="input input-bordered input-sm w-full bg-base-100"
                placeholder="নাম, ID, ফোন..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {(search || departmentName || classBatchName) && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setDepartmentName(
                    !isAdmin && departmentsList.length === 1
                      ? departmentsList[0].name
                      : "",
                  );
                  setClassBatchName("");
                  setSearch("");
                }}
              >
                ফিল্টার রিসেট
              </button>
            </div>
          )}
        </section>

        {filteredStudents.length === 0 ? (
          <div className="rounded-2xl border border-base-300 bg-base-100 px-5 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-base-200">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-6 w-6 text-base-content/50"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m16 16 4 4M8 11h6" />
              </svg>
            </div>

            <h2 className="mt-3 text-sm font-bold">
              কোনো শিক্ষার্থী পাওয়া যায়নি
            </h2>

            <p className="mt-1 text-xs text-base-content/55">
              সার্চ বা ফিল্টার পরিবর্তন করে দেখুন।
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => {
              const enabled = isStudentEnabled(student);
              const phone = getPhone(student);
              const studentRouteId = student.studentId || student.id;
              const careStudent = isToplineCareStudent(student);

              return (
                <article
                  key={student.id}
                  className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition duration-200 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex items-start gap-3 p-3">
                    <StudentAvatar student={student} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-bold">
                            {student.name || "নাম দেওয়া হয়নি"}
                          </h2>

                          <p className="mt-0.5 truncate font-mono text-[11px] text-primary">
                            ID: {studentRouteId}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <span
                            className={`badge badge-xs ${
                              enabled ? "badge-success" : "badge-error"
                            }`}
                          >
                            {enabled ? "Active" : "Inactive"}
                          </span>

                          {student.isCR === true && (
                            <span className="badge badge-primary badge-xs">
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

                        {careStudent && (
                          <span className="badge badge-info badge-xs">
                            Care
                          </span>
                        )}

                        {student.isCoaching === true && (
                          <span className="badge badge-secondary badge-xs">
                            Coaching
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-base-300 px-3 py-2.5">
                    <Info label="পিতার নাম" value={getFatherName(student)} />
                    <Info label="মোবাইল" value={phone} />
                  </div>

                  {canManageStudents && student.pin && (
                    <div className="border-t border-base-300 px-3 py-2">
                      <p className="text-[11px] text-base-content/50">
                        PIN:{" "}
                        <span className="font-mono font-semibold text-base-content">
                          {student.pin}
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 border-t border-base-300 p-2.5">
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
                        className="btn btn-outline btn-xs flex-1"
                        disabled
                      >
                        No phone
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-primary btn-xs flex-1"
                      onClick={() => navigate(`/student/${studentRouteId}`)}
                    >
                      View Profile →
                    </button>
                  </div>

                  {canManageStudents && (
                    <div className="grid grid-cols-2 gap-2 px-2.5 pb-2.5">
                      <button
                        type="button"
                        className="btn btn-outline btn-primary btn-xs"
                        onClick={() => openEditProfile(student)}
                      >
                        Edit Profile
                      </button>

                      <label
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-base-300 px-2 py-1.5 text-xs font-medium ${
                          enabled ? "text-success" : "text-base-content/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="toggle toggle-success toggle-xs"
                          checked={enabled}
                          disabled={updatingId === student.id}
                          onChange={() => handleToggleStatus(student)}
                          aria-label={`${
                            enabled ? "Disable" : "Enable"
                          } ${student.name || "student"}`}
                        />

                        {updatingId === student.id
                          ? "Processing..."
                          : enabled
                            ? "Active"
                            : "Inactive"}
                      </label>

                      {careStudent && student.isCR !== true && (
                        <button
                          type="button"
                          className="btn btn-outline btn-secondary btn-xs col-span-2"
                          disabled={Boolean(updatingId)}
                          onClick={() => handleMakeCR(student)}
                        >
                          {updatingId === student.id ? (
                            <>
                              <span className="loading loading-spinner loading-xs" />
                              Processing...
                            </>
                          ) : (
                            "Make CR"
                          )}
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

      {editingStudent && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditProfile();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="my-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl sm:my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-base-300 p-4 sm:p-5">
              <div>
                <h2 id="edit-profile-title" className="text-lg font-bold">
                  Edit Student Profile
                </h2>

                <p className="mt-1 text-xs text-base-content/60">
                  {editingStudent.name || "Student"} ·{" "}
                  {editingStudent.studentId || editingStudent.id}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditProfile}
                disabled={profileBusy}
                className="btn btn-circle btn-ghost btn-sm"
                aria-label="Close edit profile"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4 sm:p-5">
                <div className="flex flex-col items-center rounded-xl border border-base-300 bg-base-200/30 p-4">
                  <div className="relative">
                    <div className="h-[160px] w-[160px] overflow-hidden rounded-full border-4 border-base-100 bg-base-200 shadow-md">
                      {editPreview ? (
                        <img
                          src={editPreview}
                          alt="Student profile"
                          width={160}
                          height={160}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-primary">
                          {getInitials(editingStudent.name)}
                        </div>
                      )}
                    </div>

                    {(uploadingPhoto || deletingPhoto) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/60 text-white">
                        <span className="loading loading-spinner loading-lg" />
                        <p className="mt-2 text-xs">
                          {uploadingPhoto
                            ? "ছবি আপলোড হচ্ছে..."
                            : "ছবি মুছে ফেলা হচ্ছে..."}
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-base-content/60">
                    200 × 200 pixels · সর্বোচ্চ 5 MB
                  </p>

                  {editPreview && !editPhoto ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-error btn-xs mt-3"
                      disabled={profileBusy}
                      onClick={handleDeleteEditPhoto}
                    >
                      {deletingPhoto ? "মুছে ফেলা হচ্ছে..." : "আগের ছবি মুছুন"}
                    </button>
                  ) : (
                    <label
                      className={`btn btn-primary btn-xs mt-3 ${
                        profileBusy ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      ছবি নির্বাচন করুন
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
                    <div className="mt-2 text-center">
                      <p className="text-xs text-success">
                        নতুন ছবি নির্বাচিত হয়েছে।
                      </p>

                      <button
                        type="button"
                        className="btn btn-ghost btn-xs mt-1"
                        disabled={profileBusy}
                        onClick={() => {
                          URL.revokeObjectURL(editPreview);
                          setEditPhoto(null);
                          setEditPreview("");
                        }}
                      >
                        ছবি বাতিল করুন
                      </button>
                    </div>
                  )}

                  <p className="mt-2 text-center text-[11px] text-base-content/50">
                    নতুন ছবি দিতে হলে প্রথমে আগের ছবিটি মুছুন।
                  </p>
                </div>

                <div className="rounded-xl bg-base-200/50 p-3">
                  <p className="text-[11px] text-base-content/50">
                    শিক্ষার্থীর নাম
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {editingStudent.name || "—"}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Info
                      label="Care"
                      value={
                        isToplineCareStudent(editingStudent) ? "Yes" : "No"
                      }
                    />
                    <Info
                      label="CR"
                      value={editingStudent.isCR === true ? "Yes" : "No"}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    অতিরিক্ত ব্যক্তিগত তথ্য
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text mb-1.5 text-xs font-medium">
                        বাবার নাম
                      </span>
                      <input
                        type="text"
                        name="fatherName"
                        value={editForm.fatherName}
                        onChange={handleEditChange}
                        placeholder="বাবার নাম"
                        className="input input-bordered input-sm w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>

                    <label className="form-control">
                      <span className="label-text mb-1.5 text-xs font-medium">
                        মায়ের নাম
                      </span>
                      <input
                        type="text"
                        name="motherName"
                        value={editForm.motherName}
                        onChange={handleEditChange}
                        placeholder="মায়ের নাম"
                        className="input input-bordered input-sm w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>

                    <label className="form-control">
                      <span className="label-text mb-1.5 text-xs font-medium">
                        জন্মতারিখ
                      </span>
                      <input
                        type="date"
                        name="dateOfBirth"
                        value={editForm.dateOfBirth}
                        onChange={handleEditChange}
                        className="input input-bordered input-sm w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>

                    <label className="form-control">
                      <span className="label-text mb-1.5 text-xs font-medium">
                        ধর্ম
                      </span>
                      <select
                        name="religion"
                        value={editForm.religion}
                        onChange={handleEditChange}
                        className="select select-bordered select-sm w-full bg-base-100"
                        disabled={profileBusy}
                      >
                        <option value="">ধর্ম নির্বাচন করুন</option>
                        {[
                          "ইসলাম",
                          "হিন্দু",
                          "বৌদ্ধ",
                          "খ্রিস্টান",
                          "অন্যান্য",
                        ].map((religion) => (
                          <option key={religion} value={religion}>
                            {religion}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-control sm:col-span-2">
                      <span className="label-text mb-1.5 text-xs font-medium">
                        রোল নম্বর
                      </span>
                      <input
                        type="text"
                        name="roll"
                        inputMode="numeric"
                        value={editForm.roll}
                        onChange={handleEditChange}
                        placeholder="রোল নম্বর"
                        className="input input-bordered input-sm w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>
                  </div>

                  <p className="mt-2 text-[11px] text-base-content/50">
                    সব তথ্য ঐচ্ছিক। কোনো ফিল্ড খালি রাখলেও সেভ করা যাবে।
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-base-300 p-3 sm:flex-row sm:justify-end sm:p-4">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={profileBusy}
                  onClick={closeEditProfile}
                >
                  বাতিল
                </button>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm min-w-36"
                  disabled={profileBusy}
                >
                  {savingProfile || uploadingPhoto ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      {uploadingPhoto ? "ছবি আপলোড হচ্ছে..." : "সেভ হচ্ছে..."}
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
