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

const SUPERADMIN_EMAIL = "jihadur51@gmail.com";
const IMGBB_API_KEY = "93ea398f0480de97e39ea40e2cce5b2e";

const initialForm = {
  fatherName: "",
  motherName: "",
  dateOfBirth: "",
  religion: "",
  roll: "",
};

const normalizeId = (value) => {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? String(Number(text)) : text;
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

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

function getDepartmentId(item) {
  return normalizeId(
    item?.departmentId ??
      item?.department?.id ??
      item?.department?.departmentId ??
      item?.id ??
      item?.docId,
  );
}

function getItemId(item) {
  return String(item?.docId ?? item?.id ?? "");
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
  if (email?.toLowerCase() === SUPERADMIN_EMAIL) {
    return "admin";
  }

  const role = normalizeText(profile?.role).replace(/[\s-]+/g, "_");

  if (["admin", "superadmin"].includes(role)) {
    return "admin";
  }

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

function getDepartmentPermissions(profile) {
  const values = [
    ...(Array.isArray(profile?.departmentIds) ? profile.departmentIds : []),

    ...(Array.isArray(profile?.departments)
      ? profile.departments.map((item) =>
          typeof item === "object" ? (item.departmentId ?? item.id) : item,
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

  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function isStudentEnabled(student) {
  return !(
    student?.isActive === false ||
    student?.status === "disabled" ||
    student?.approved === false ||
    student?.status === "pending"
  );
}

function getInitials(name) {
  return String(name || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();
}

function StudentAvatar({ student, large = false }) {
  const [imageError, setImageError] = useState(false);
  const photo = getPhoto(student);

  useEffect(() => {
    setImageError(false);
  }, [photo]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 font-bold text-primary ring-1 ring-primary/10 ${
        large ? "h-[200px] w-[200px] text-4xl" : "h-14 w-14 text-lg"
      }`}
    >
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
      <p className="text-xs text-base-content/50">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value || "—"}</p>
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

export default function Students() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("");
  const [departmentPermissions, setDepartmentPermissions] = useState([]);

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);

  const [departmentId, setDepartmentId] = useState("");
  const [classBatchId, setClassBatchId] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");

  // Edit modal state
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

  // --------------------------------------------
  // Load account, departments, classes, batches,
  // and students.
  // --------------------------------------------

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setLoading(true);

      if (!user) {
        setProfile(null);
        setRole("");
        setDepartmentPermissions([]);
        setDepartments([]);
        setClasses([]);
        setBatches([]);
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

        const allowedDepartments = getDepartmentPermissions(userProfile);

        const accountDisabled =
          userRole !== "admin" &&
          (userProfile.accountAccess === false ||
            userProfile.isActive === false);

        if (
          !["admin", "departmentHead", "teacher"].includes(userRole) ||
          accountDisabled ||
          (userRole !== "admin" && allowedDepartments.length === 0)
        ) {
          setProfile(userProfile);
          setRole(userRole);
          setDepartmentPermissions([]);
          setDepartments([]);
          setClasses([]);
          setBatches([]);
          setStudents([]);
          setLoading(false);
          return;
        }

        const [departmentSnap, classSnap, batchSnap, studentSnap] =
          await Promise.all([
            getDocs(collection(db, "departments")),
            getDocs(collection(db, "classes")),
            getDocs(collection(db, "batches")),
            getDocs(collection(db, "students")),
          ]);

        if (!active) return;

        const departmentData = departmentSnap.docs.map((item) => ({
          ...item.data(),
          docId: item.id,
        }));

        const classData = classSnap.docs.map((item) => ({
          ...item.data(),
          docId: item.id,
        }));

        const batchData = batchSnap.docs.map((item) => ({
          ...item.data(),
          docId: item.id,
        }));

        const studentData = studentSnap.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }));

        const activeDepartments = departmentData.filter(
          (item) => item.isActive !== false,
        );

        // Filter departments using the logged-in user's permissions.
        const allowedDepartmentData =
          userRole === "admin"
            ? activeDepartments
            : activeDepartments.filter((item) =>
                allowedDepartments.includes(getDepartmentId(item)),
              );

        const normalClasses = classData.filter(
          (item) =>
            item.isActive !== false &&
            normalizeText(item.type) !== "batch" &&
            (userRole === "admin" ||
              allowedDepartments.includes(getDepartmentId(item))),
        );

        const classBatches = classData.filter(
          (item) =>
            normalizeText(item.type) === "batch" &&
            (userRole === "admin" ||
              allowedDepartments.includes(getDepartmentId(item))),
        );

        const combinedBatchMap = new Map();

        batchData.forEach((item) => {
          if (
            userRole === "admin" ||
            allowedDepartments.includes(getDepartmentId(item))
          ) {
            combinedBatchMap.set(item.docId, item);
          }
        });

        classBatches.forEach((item) => {
          if (!combinedBatchMap.has(item.docId)) {
            combinedBatchMap.set(item.docId, item);
          }
        });

        // Filter student data locally by department permissions.
        const allowedStudents =
          userRole === "admin"
            ? studentData
            : studentData.filter((student) =>
                allowedDepartments.includes(normalizeId(student.departmentId)),
              );

        setProfile(userProfile);
        setRole(userRole);
        setDepartmentPermissions(allowedDepartments);
        setDepartments(allowedDepartmentData);
        setClasses(normalClasses);

        setBatches(
          [...combinedBatchMap.values()].filter(
            (item) => item.isActive !== false,
          ),
        );

        setStudents(allowedStudents);

        if (userRole !== "admin" && allowedDepartmentData.length === 1) {
          setDepartmentId(getDepartmentId(allowedDepartmentData[0]));
        } else {
          setDepartmentId("");
        }

        setClassBatchId("");
      } catch (error) {
        console.error("Students loading error:", error);
        toast.error("শিক্ষার্থীদের তথ্য লোড করা যায়নি।");

        if (active) {
          setProfile(null);
          setRole("");
          setDepartmentPermissions([]);
          setDepartments([]);
          setClasses([]);
          setBatches([]);
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

  // --------------------------------------------
  // Department, class and batch filters
  // --------------------------------------------

  const filteredClasses = useMemo(() => {
    if (!departmentId) return [];

    return classes.filter(
      (item) => getDepartmentId(item) === normalizeId(departmentId),
    );
  }, [classes, departmentId]);

  const filteredBatches = useMemo(() => {
    if (!departmentId) return [];

    return batches.filter(
      (item) => getDepartmentId(item) === normalizeId(departmentId),
    );
  }, [batches, departmentId]);

  const classBatchOptions = useMemo(() => {
    const options = [
      ...filteredClasses.map((item) => ({
        id: getItemId(item),
        name: getName(item),
        type: "class",
      })),

      ...filteredBatches.map((item) => ({
        id: getItemId(item),
        name: getName(item),
        type: "batch",
      })),
    ];

    const seen = new Set();

    return options.filter((item) => {
      const key = `${item.type}-${item.id}`;

      if (!item.id || seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }, [filteredClasses, filteredBatches]);

  const filteredStudents = useMemo(() => {
    const keyword = normalizeText(search);
    const selectedId = normalizeId(classBatchId);

    return students.filter((student) => {
      const matchesDepartment =
        !departmentId ||
        normalizeId(student.departmentId) === normalizeId(departmentId);

      const matchesClassBatch =
        !selectedId ||
        normalizeId(student.classId) === selectedId ||
        normalizeId(student.batchId) === selectedId;

      const searchableText = [
        student.name,
        student.studentId,
        student.id,
        student.phone,
        student.mobile,
        getFatherName(student),
        getMotherName(student),
        student.villageName,
        student.className,
        student.batchName,
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
  }, [students, departmentId, classBatchId, search]);

  const enabledCount = filteredStudents.filter(isStudentEnabled).length;

  // --------------------------------------------
  // SweetAlert2 status switch
  // --------------------------------------------

  async function handleToggleStatus(student) {
    if (!canManageStudents) {
      toast.error("এই কাজের অনুমতি আপনার নেই।");
      return;
    }

    if (
      !isAdmin &&
      !departmentPermissions.includes(normalizeId(student.departmentId))
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

      await Swal.fire({
        title: "সফল!",
        text: nextEnabled
          ? "শিক্ষার্থী সক্রিয় হয়েছে।"
          : "শিক্ষার্থী নিষ্ক্রিয় হয়েছে।",
        icon: "success",
        confirmButtonText: "ঠিক আছে",
        buttonsStyling: false,
        customClass: {
          popup:
            "rounded-2xl border border-base-300 bg-base-100 text-base-content",
          title: "text-base-content",
          htmlContainer: "text-base-content/70",
          confirmButton: "btn btn-primary",
        },
      });
    } catch (error) {
      console.error("Student status update error:", error);

      Swal.fire({
        title: "ব্যর্থ!",
        text: "শিক্ষার্থীর Status পরিবর্তন করা যায়নি।",
        icon: "error",
        confirmButtonText: "ঠিক আছে",
        buttonsStyling: false,
        customClass: {
          popup:
            "rounded-2xl border border-base-300 bg-base-100 text-base-content",
          title: "text-base-content",
          confirmButton: "btn btn-primary",
        },
      });
    } finally {
      setUpdatingId("");
    }
  }

  // --------------------------------------------
  // Open and close Edit Profile modal
  // --------------------------------------------

  function openEditProfile(student) {
    if (!canManageStudents) {
      toast.error("প্রোফাইল সম্পাদনার অনুমতি আপনার নেই।");
      return;
    }

    if (
      !isAdmin &&
      !departmentPermissions.includes(normalizeId(student.departmentId))
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

    if (editPhoto && editPreview.startsWith("blob:")) {
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

  // --------------------------------------------
  // Image selection and 200 × 200 resize
  // --------------------------------------------

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

  // --------------------------------------------
  // Delete previous ImageBB image
  // --------------------------------------------

  async function handleDeleteEditPhoto() {
    if (!editingStudent || profileBusy) return;

    if (!editPreview) return;

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
      // If this is only a local preview, no remote deletion is needed.
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

      // Clear all known photo URL fields in Firestore.
      await updateDoc(doc(db, "students", editingStudent.id), {
        photoURL: "",
        photoUrl: "",
        imageUrl: "",
        photo: "",
        image: "",
        profileImage: "",
        photoDeleteURL: "",
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "",
      });

      setStudents((previous) =>
        previous.map((item) =>
          item.id === editingStudent.id
            ? {
                ...item,
                photoURL: "",
                photoUrl: "",
                imageUrl: "",
                photo: "",
                image: "",
                profileImage: "",
                photoDeleteURL: "",
              }
            : item,
        ),
      );

      setEditingStudent((previous) => ({
        ...previous,
        photoURL: "",
        photoUrl: "",
        imageUrl: "",
        photo: "",
        image: "",
        profileImage: "",
        photoDeleteURL: "",
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

  // --------------------------------------------
  // Upload new photo to ImageBB
  // --------------------------------------------

  async function uploadEditPhoto() {
    if (!editPhoto) return null;

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

  // --------------------------------------------
  // Save edited profile
  // --------------------------------------------

  async function handleSaveProfile(event) {
    event.preventDefault();

    if (!editingStudent || profileBusy) return;

    if (
      !isAdmin &&
      !departmentPermissions.includes(normalizeId(editingStudent.departmentId))
    ) {
      toast.error("এই শিক্ষার্থী সম্পাদনার অনুমতি নেই।");
      return;
    }

    setSavingProfile(true);

    try {
      let photoData = {};

      if (editPhoto) {
        const uploaded = await uploadEditPhoto();

        if (uploaded) {
          photoData = uploaded;
        }
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

      const updatedStudent = {
        ...editingStudent,
        ...updatedData,
        ...(photoData.photoURL
          ? {
              photoURL: photoData.photoURL,
              photoDeleteURL: photoData.photoDeleteURL,
            }
          : {}),
      };

      setStudents((previous) =>
        previous.map((item) =>
          item.id === editingStudent.id
            ? {
                ...item,
                ...updatedData,
                ...(photoData.photoURL
                  ? {
                      photoURL: photoData.photoURL,
                      photoDeleteURL: photoData.photoDeleteURL,
                    }
                  : {}),
              }
            : item,
        ),
      );

      setEditingStudent(updatedStudent);
      setEditPhoto(null);

      if (photoData.photoURL) {
        setEditPreview(photoData.photoURL);
      }

      toast.success("শিক্ষার্থীর প্রোফাইল আপডেট হয়েছে।");

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

  // --------------------------------------------
  // Loading and access denied
  // --------------------------------------------

  if (loading) {
    return <LoadingSpinner text="শিক্ষার্থীদের তথ্য লোড হচ্ছে..." />;
  }

  if (!auth.currentUser || !hasAccess || !profile) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-base-300 bg-base-100 p-8 text-center text-base-content">
        <h2 className="text-xl font-bold">Access Denied</h2>

        <p className="mt-2 text-sm text-base-content/60">
          শিক্ষার্থীদের তালিকা দেখার অনুমতি নেই।
        </p>
      </div>
    );
  }

  // --------------------------------------------
  // Main UI
  // --------------------------------------------

  return (
    <main className="min-h-screen bg-base-200/50 px-3 py-5 text-base-content sm:px-6 sm:py-7">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header */}

        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-content shadow-lg sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[28px] border-white/10" />

          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-primary-content/70">
                TopLine Education
              </p>

              <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
                Students
              </h1>

              <p className="mt-2 text-sm text-primary-content/75">
                শিক্ষার্থী ব্যবস্থাপনা
              </p>
            </div>

            <div className="flex gap-3">
              <div className="min-w-28 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs text-primary-content/70">
                  মোট শিক্ষার্থী
                </p>

                <p className="mt-1 text-3xl font-extrabold">
                  {filteredStudents.length}
                </p>
              </div>

              <div className="min-w-28 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs text-primary-content/70">সক্রিয়</p>

                <p className="mt-1 text-3xl font-extrabold">{enabledCount}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Filters */}

        <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-2 text-xs font-semibold">
                বিভাগ
              </span>

              <select
                className="select select-bordered w-full bg-base-100"
                value={departmentId}
                disabled={!isAdmin && departments.length === 1}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setClassBatchId("");
                }}
              >
                <option value="">সব অনুমোদিত বিভাগ</option>

                {departments.map((item) => (
                  <option key={item.docId} value={getDepartmentId(item)}>
                    {getName(item)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-2 text-xs font-semibold">
                শ্রেণি / ব্যাচ
              </span>

              <select
                className="select select-bordered w-full bg-base-100"
                value={classBatchId}
                disabled={!departmentId}
                onChange={(event) => setClassBatchId(event.target.value)}
              >
                <option value="">
                  {departmentId ? "সব শ্রেণি / ব্যাচ" : "বিভাগ নির্বাচন করুন"}
                </option>

                {classBatchOptions.map((item) => (
                  <option key={`${item.type}-${item.id}`} value={item.id}>
                    {item.name}
                    {item.type === "batch" ? " (Batch)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-2 text-xs font-semibold">
                শিক্ষার্থী খুঁজুন
              </span>

              <input
                type="search"
                className="input input-bordered w-full bg-base-100"
                placeholder="নাম, ID, ফোন..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {(search || departmentId || classBatchId) && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setDepartmentId(
                    !isAdmin && departments.length === 1
                      ? getDepartmentId(departments[0])
                      : "",
                  );

                  setClassBatchId("");
                  setSearch("");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </section>

        {/* Student cards */}

        {filteredStudents.length === 0 ? (
          <div className="rounded-2xl border border-base-300 bg-base-100 px-5 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-base-200 text-2xl">
              ?
            </div>

            <h2 className="mt-4 font-bold">কোনো শিক্ষার্থী পাওয়া যায়নি</h2>

            <p className="mt-1 text-sm text-base-content/55">
              সার্চ বা ফিল্টার পরিবর্তন করে দেখুন।
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => {
              const enabled = isStudentEnabled(student);
              const phone = getPhone(student);
              const studentRouteId = student.studentId || student.id;

              return (
                <article
                  key={student.id}
                  className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3 p-4">
                    <StudentAvatar student={student} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate font-bold">
                            {student.name || "নাম দেওয়া হয়নি"}
                          </h2>

                          <p className="mt-1 font-mono text-xs text-primary">
                            ID: {studentRouteId}
                          </p>
                        </div>

                        <span
                          className={`badge badge-sm shrink-0 ${
                            enabled ? "badge-success" : "badge-error"
                          }`}
                        >
                          {enabled ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {student.departmentName && (
                          <span className="badge badge-ghost badge-sm">
                            {student.departmentName}
                          </span>
                        )}

                        {student.className && (
                          <span className="badge badge-ghost badge-sm">
                            {student.className}
                          </span>
                        )}

                        {student.batchName && (
                          <span className="badge badge-outline badge-sm">
                            {student.batchName}
                          </span>
                        )}

                        {student.isCare === true && (
                          <span className="badge badge-info badge-sm">
                            Care
                          </span>
                        )}

                        {student.isCoaching === true && (
                          <span className="badge badge-secondary badge-sm">
                            Coaching
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-base-300 px-4 py-3">
                    <Info label="পিতার নাম" value={getFatherName(student)} />

                    <Info label="মোবাইল" value={phone} />
                  </div>

                  {canManageStudents && student.pin && (
                    <div className="border-t border-base-300 px-4 py-2">
                      <p className="text-xs text-base-content/50">
                        PIN:{" "}
                        <span className="font-mono font-semibold">
                          {student.pin}
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Actions */}

                  <div className="flex gap-2 border-t border-base-300 p-3">
                    {phone ? (
                      <a
                        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                        className="btn btn-outline btn-success btn-sm flex-1"
                      >
                        Call
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm flex-1"
                        disabled
                      >
                        No phone
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-primary btn-sm flex-1"
                      onClick={() => navigate(`/student/${studentRouteId}`)}
                    >
                      View Profile →
                    </button>
                  </div>

                  {/* Edit Profile */}

                  {canManageStudents && (
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      <button
                        type="button"
                        className="btn btn-outline btn-primary btn-sm"
                        onClick={() => openEditProfile(student)}
                      >
                        Edit Profile
                      </button>

                      {/* SW2 / SweetAlert2 status confirmation */}

                      <label
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-base-300 px-2 py-2 text-xs font-medium ${
                          enabled ? "text-success" : "text-base-content/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="toggle toggle-success toggle-sm"
                          checked={enabled}
                          disabled={updatingId === student.id}
                          onChange={() => handleToggleStatus(student)}
                          aria-label={`${
                            enabled ? "Disable" : "Enable"
                          } ${student.name || "student"}`}
                        />

                        {updatingId === student.id ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : enabled ? (
                          "Active"
                        ) : (
                          "Inactive"
                        )}
                      </label>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {/* ----------------------------------------
          EDIT PROFILE MODAL
      ----------------------------------------- */}

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
            {/* Modal header */}

            <div className="flex items-start justify-between gap-4 border-b border-base-300 p-5 sm:p-6">
              <div>
                <h2 id="edit-profile-title" className="text-xl font-bold">
                  Edit Student Profile
                </h2>

                <p className="mt-1 text-sm text-base-content/60">
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
              <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5 sm:p-6">
                {/* Photo */}

                <div className="flex flex-col items-center rounded-2xl border border-base-300 bg-base-200/30 p-5">
                  <div className="relative">
                    <div className="h-[200px] w-[200px] overflow-hidden rounded-full border-4 border-base-100 bg-base-200 shadow-md">
                      {editPreview ? (
                        <img
                          src={editPreview}
                          alt="Student profile"
                          width={200}
                          height={200}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-5xl font-bold text-primary">
                          {getInitials(editingStudent.name)}
                        </div>
                      )}
                    </div>

                    {(uploadingPhoto || deletingPhoto) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/60 text-white">
                        <span className="loading loading-spinner loading-lg" />

                        <p className="mt-3 text-xs">
                          {uploadingPhoto
                            ? "ছবি আপলোড হচ্ছে..."
                            : "ছবি মুছে ফেলা হচ্ছে..."}
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-sm text-base-content/60">
                    200 × 200 pixels · সর্বোচ্চ 5 MB
                  </p>

                  {editPreview && !editPhoto ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-error btn-sm mt-4"
                      disabled={profileBusy}
                      onClick={handleDeleteEditPhoto}
                    >
                      {deletingPhoto ? (
                        <>
                          <span className="loading loading-spinner loading-xs" />
                          মুছে ফেলা হচ্ছে...
                        </>
                      ) : (
                        "আগের ছবি মুছুন"
                      )}
                    </button>
                  ) : (
                    <label
                      className={`btn btn-primary btn-sm mt-4 ${
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
                    <div className="mt-3 text-center">
                      <p className="text-sm text-success">
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

                  <p className="mt-3 text-center text-xs text-base-content/50">
                    নতুন ছবি দিতে হলে প্রথমে আগের ছবিটি মুছুন।
                  </p>
                </div>

                {/* Student info (read-only) */}

                <div className="rounded-xl bg-base-200/50 p-4">
                  <p className="text-xs text-base-content/50">
                    শিক্ষার্থীর নাম
                  </p>

                  <p className="mt-1 font-semibold">
                    {editingStudent.name || "—"}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Info
                      label="Care"
                      value={editingStudent.isCare === true ? "Yes" : "No"}
                    />

                    <Info
                      label="Coaching"
                      value={editingStudent.isCoaching === true ? "Yes" : "No"}
                    />
                  </div>
                </div>

                {/* Optional fields */}

                <div>
                  <h3 className="mb-4 font-semibold">
                    অতিরিক্ত ব্যক্তিগত তথ্য
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text mb-2 text-sm font-medium">
                        বাবার নাম
                      </span>

                      <input
                        type="text"
                        name="fatherName"
                        value={editForm.fatherName}
                        onChange={handleEditChange}
                        placeholder="বাবার নাম"
                        className="input input-bordered w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>

                    <label className="form-control">
                      <span className="label-text mb-2 text-sm font-medium">
                        মায়ের নাম
                      </span>

                      <input
                        type="text"
                        name="motherName"
                        value={editForm.motherName}
                        onChange={handleEditChange}
                        placeholder="মায়ের নাম"
                        className="input input-bordered w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>

                    <label className="form-control">
                      <span className="label-text mb-2 text-sm font-medium">
                        জন্মতারিখ
                      </span>

                      <input
                        type="date"
                        name="dateOfBirth"
                        value={editForm.dateOfBirth}
                        onChange={handleEditChange}
                        className="input input-bordered w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>

                    <label className="form-control">
                      <span className="label-text mb-2 text-sm font-medium">
                        ধর্ম
                      </span>

                      <select
                        name="religion"
                        value={editForm.religion}
                        onChange={handleEditChange}
                        className="select select-bordered w-full bg-base-100"
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
                      <span className="label-text mb-2 text-sm font-medium">
                        রোল নম্বর
                      </span>

                      <input
                        type="text"
                        name="roll"
                        inputMode="numeric"
                        value={editForm.roll}
                        onChange={handleEditChange}
                        placeholder="রোল নম্বর"
                        className="input input-bordered w-full bg-base-100"
                        disabled={profileBusy}
                      />
                    </label>
                  </div>

                  <p className="mt-3 text-xs text-base-content/50">
                    সব তথ্য ঐচ্ছিক। কোনো ফিল্ড খালি রাখলেও সেভ করা যাবে।
                  </p>
                </div>
              </div>

              {/* Modal footer */}

              <div className="flex flex-col-reverse gap-3 border-t border-base-300 p-4 sm:flex-row sm:justify-end sm:p-5">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={profileBusy}
                  onClick={closeEditProfile}
                >
                  বাতিল
                </button>

                <button
                  type="submit"
                  className="btn btn-primary min-w-44"
                  disabled={profileBusy}
                >
                  {savingProfile || uploadingPhoto ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />
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
