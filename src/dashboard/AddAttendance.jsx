import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import {
  FiCalendar,
  FiCheckCircle,
  FiUsers,
  FiSearch,
  FiSend,
  FiShield,
  FiAlertCircle,
  FiRefreshCw,
  FiUserCheck,
  FiCheck,
  FiX,
} from "react-icons/fi";

import toast from "react-hot-toast";

import { auth, db } from "../assets/firebase/firebase.init";

import { getUserRole, isAdmin, isDepartmentHead } from "../config/permissions";

import { departmentList } from "../config/departments";

import { calculateCurrentMark } from "../utils/calculateCurrentMark";

/* =========================================================
   Constants
========================================================= */

const STUDENT_SESSION_KEY = "studentSession";

/* =========================================================
   Helpers
========================================================= */

const normalizeId = (value) => {
  const id = String(value ?? "").trim();

  return /^\d+$/.test(id) ? String(Number(id)) : id;
};

const getDepartmentId = (item) => normalizeId(item?.id);

const getClassId = (item) => String(item?.id ?? "");

const getLocalDate = () => {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};

const isActiveStudent = (student) =>
  student?.isActive !== false && student?.approved === true;

const isBatchDepartment = (department) => department?.type === "batch";

const getDepartmentIds = (values) => [
  ...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) =>
        typeof item === "object" ? (item.departmentId ?? item.id) : item,
      )
      .map(normalizeId)
      .filter(Boolean),
  ),
];

const getSubmitterName = (record) =>
  record?.takenByName ||
  record?.teacherName ||
  record?.submittedByName ||
  "নাম পাওয়া যায়নি";

const getAttendanceDocId = (date, departmentName, className, studentDocId) =>
  [date, departmentName, className, studentDocId]
    .join("_")
    .replaceAll("/", "_");

const getStudentGroupName = (student, department) =>
  isBatchDepartment(department)
    ? String(student?.batchName ?? "").trim()
    : String(student?.className ?? "").trim();

function readStudentSession() {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

/* =========================================================
   Component
========================================================= */

export default function AddAttendance() {
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [checkingAttendance, setCheckingAttendance] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("");

  const [userDepartments, setUserDepartments] = useState([]);
  const [crStudent, setCrStudent] = useState(null);

  const [authError, setAuthError] = useState("");

  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const [selectedClassId, setSelectedClassId] = useState("");

  const [date, setDate] = useState(getLocalDate());
  const [search, setSearch] = useState("");

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});

  const [existingAttendance, setExistingAttendance] = useState([]);
  const [attendanceCheckError, setAttendanceCheckError] = useState("");

  const isAdminUser = role === "admin";
  const isCR = role === "cr";
  const isTeacher = role === "teacher";
  const isHead = role === "departmenthead";

  const canManageAttendance = isAdminUser || isCR || isTeacher || isHead;

  /* =========================================================
     Allowed Departments
  ========================================================= */

  const allowedDepartments = useMemo(() => {
    if (isAdminUser) {
      return departmentList;
    }

    if (isCR && crStudent) {
      return departmentList.filter(
        (department) =>
          department.type === "batch" &&
          getDepartmentId(department) === normalizeId(crStudent.departmentId),
      );
    }

    return departmentList.filter((department) =>
      userDepartments.includes(getDepartmentId(department)),
    );
  }, [isAdminUser, isCR, crStudent, userDepartments]);

  const selectedDepartment = useMemo(
    () =>
      allowedDepartments.find(
        (department) =>
          getDepartmentId(department) === normalizeId(selectedDepartmentId),
      ) ?? null,
    [allowedDepartments, selectedDepartmentId],
  );

  const availableClasses = useMemo(() => {
    if (!selectedDepartment) {
      return [];
    }

    const classes = selectedDepartment.classes ?? [];

    if (!isCR || !crStudent) {
      return classes;
    }

    // CR can only access their own Care batch.
    return classes.filter((item) => item.id === crStudent.batchId);
  }, [selectedDepartment, isCR, crStudent]);

  const selectedClass = useMemo(
    () =>
      availableClasses.find(
        (item) => getClassId(item) === String(selectedClassId),
      ) ?? null,
    [availableClasses, selectedClassId],
  );

  /* =========================================================
     Authentication

     IMPORTANT:
     Student CR login is stored in localStorage.
     It does not require Firebase Auth.

     Teacher/Admin login uses Firebase Auth.
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      setLoading(true);
      setAuthError("");
      setCurrentUser(user);
      setProfile(null);
      setRole("");
      setUserDepartments([]);
      setCrStudent(null);

      setSelectedDepartmentId("");
      setSelectedClassId("");

      setStudents([]);
      setAttendance({});
      setExistingAttendance([]);
      setAttendanceCheckError("");

      try {
        /* -----------------------------------------------
             1. Check Student Session FIRST

             Student login does not use Firebase Auth.
          ----------------------------------------------- */

        const session = readStudentSession();

        if (session?.documentId) {
          const studentRef = doc(db, "students", session.documentId);

          const snapshot = await getDoc(studentRef);

          if (cancelled) return;

          if (!snapshot.exists()) {
            localStorage.removeItem(STUDENT_SESSION_KEY);

            setAuthError("শিক্ষার্থীর তথ্য পাওয়া যায়নি। আবার লগইন করুন।");

            return;
          }

          const student = {
            docId: snapshot.id,
            ...snapshot.data(),
          };

          const department = departmentList.find(
            (item) =>
              item.type === "batch" &&
              getDepartmentId(item) === normalizeId(student.departmentId),
          );

          const ownBatch = department?.classes?.find(
            (item) => item.id === student.batchId,
          );

          if (
            student.isCR !== true ||
            !isActiveStudent(student) ||
            !department ||
            !ownBatch
          ) {
            console.warn("CR verification failed:", {
              isCR: student.isCR,
              approved: student.approved,
              isActive: student.isActive,
              departmentId: student.departmentId,
              batchId: student.batchId,
              departmentFound: Boolean(department),
              batchFound: Boolean(ownBatch),
            });

            setAuthError(
              "শুধু সক্রিয় ও অনুমোদিত CR নিজের কেয়ার ব্যাচের উপস্থিতি নিতে পারবেন।",
            );

            return;
          }

          setProfile({
            ...student,
            email: "",
          });

          setCrStudent(student);
          setRole("cr");

          setUserDepartments([getDepartmentId(department)]);

          return;
        }

        /* -----------------------------------------------
             2. Firebase Auth required for staff
          ----------------------------------------------- */

        if (!user) {
          setAuthError("উপস্থিতি পরিচালনার জন্য লগইন করুন।");

          return;
        }

        /* -----------------------------------------------
             3. Admin
          ----------------------------------------------- */

        if (isAdmin(user.email) || getUserRole(user) === "admin") {
          setProfile({
            uid: user.uid,
            name: user.displayName || "Admin",
            email: user.email || "",
          });

          setRole("admin");

          setUserDepartments(departmentList.map(getDepartmentId));

          return;
        }

        /* -----------------------------------------------
             4. Teacher / Department Head
          ----------------------------------------------- */

        const teacherSnapshot = await getDocs(
          query(
            collection(db, "teachers"),
            where("uid", "==", user.uid),
            limit(1),
          ),
        );

        if (cancelled) return;

        if (teacherSnapshot.empty) {
          setAuthError(
            "শিক্ষক প্রোফাইল পাওয়া যায়নি। Admin-এর সঙ্গে যোগাযোগ করুন।",
          );

          return;
        }

        const teacherDoc = teacherSnapshot.docs[0];

        const teacher = {
          docId: teacherDoc.id,
          ...teacherDoc.data(),
        };

        if (teacher.isActive !== true) {
          setAuthError("আপনার শিক্ষক অ্যাকাউন্ট সক্রিয় নয়।");

          return;
        }

        if (teacher.accountAccess !== true) {
          setAuthError("আপনার অ্যাকাউন্টে প্রবেশের অনুমতি বন্ধ রয়েছে।");

          return;
        }

        const detectedRole = getUserRole({
          email: user.email,
          role: teacher.role,
        });

        const headIds = getDepartmentIds(teacher.departmentHeadOf);

        const teacherIds = getDepartmentIds(teacher.departments);

        const departmentHead =
          isDepartmentHead(user.email) ||
          headIds.length > 0 ||
          detectedRole === "departmenthead";

        const permittedDepartments = departmentHead
          ? [...new Set([...teacherIds, ...headIds])]
          : teacherIds;

        if (!permittedDepartments.length) {
          setAuthError("আপনার প্রোফাইলে কোনো বিভাগ নির্ধারিত নেই।");

          return;
        }

        setProfile({
          ...teacher,
          uid: user.uid,
          email: user.email || teacher.email || "",
        });

        setRole(
          departmentHead
            ? "departmenthead"
            : detectedRole === "teacher"
              ? "teacher"
              : "",
        );

        setUserDepartments(permittedDepartments);

        if (!departmentHead && detectedRole !== "teacher") {
          setAuthError("আপনার এই পেজ ব্যবহারের অনুমতি নেই।");
        }
      } catch (error) {
        console.error("Attendance authentication error:", error);

        if (!cancelled) {
          setAuthError("অ্যাকাউন্ট যাচাই করা যায়নি। আবার চেষ্টা করুন।");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /* =========================================================
     Initial Department / Batch
  ========================================================= */

  useEffect(() => {
    if (!allowedDepartments.length) {
      setSelectedDepartmentId("");
      setSelectedClassId("");
      return;
    }

    const exists = allowedDepartments.some(
      (department) =>
        getDepartmentId(department) === normalizeId(selectedDepartmentId),
    );

    if (exists) return;

    const department = allowedDepartments[0];

    setSelectedDepartmentId(getDepartmentId(department));

    if (isCR && crStudent) {
      const ownBatch = department.classes?.find(
        (item) => item.id === crStudent.batchId,
      );

      setSelectedClassId(ownBatch ? getClassId(ownBatch) : "");
    } else {
      setSelectedClassId(getClassId(department.classes?.[0]));
    }
  }, [allowedDepartments, selectedDepartmentId, isCR, crStudent]);

  useEffect(() => {
    if (!availableClasses.length) {
      setSelectedClassId("");
      return;
    }

    const exists = availableClasses.some(
      (item) => getClassId(item) === String(selectedClassId),
    );

    if (!exists) {
      setSelectedClassId(getClassId(availableClasses[0]));
    }
  }, [availableClasses, selectedClassId]);

  /* =========================================================
     Load Students
  ========================================================= */

  const loadStudents = useCallback(async () => {
    if (!selectedDepartment || !selectedClass) {
      setStudents([]);
      setAttendance({});
      return;
    }

    setLoadingStudents(true);

    try {
      const snapshot = await getDocs(collection(db, "students"));

      const list = snapshot.docs
        .map((item) => ({
          docId: item.id,
          ...item.data(),
        }))
        .filter(
          (student) =>
            isActiveStudent(student) &&
            normalizeId(student.departmentId) ===
              getDepartmentId(selectedDepartment) &&
            getStudentGroupName(student, selectedDepartment) ===
              selectedClass.name,
        )
        .sort((a, b) =>
          String(a.studentId ?? a.name ?? "").localeCompare(
            String(b.studentId ?? b.name ?? ""),
            "bn",
            { numeric: true },
          ),
        );

      setStudents(list);

      setAttendance((previous) =>
        Object.fromEntries(
          list.map((student) => [
            student.docId,
            previous[student.docId] ?? true,
          ]),
        ),
      );
    } catch (error) {
      console.error("Load students error:", error);

      toast.error("শিক্ষার্থীদের তালিকা লোড করা যায়নি।");

      setStudents([]);
      setAttendance({});
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedDepartment, selectedClass]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  /* =========================================================
     Check Existing Attendance
  ========================================================= */

  const checkExistingAttendance = useCallback(async () => {
    if (!selectedDepartment || !selectedClass || !date) {
      setExistingAttendance([]);
      setAttendanceCheckError("");
      return;
    }

    setCheckingAttendance(true);
    setAttendanceCheckError("");

    try {
      const snapshot = await getDocs(
        query(collection(db, "attendance"), where("date", "==", date)),
      );

      const records = snapshot.docs
        .map((item) => ({
          docId: item.id,
          ...item.data(),
        }))
        .filter(
          (item) =>
            normalizeId(item.departmentId) ===
              getDepartmentId(selectedDepartment) &&
            String(item.classId ?? "") === getClassId(selectedClass),
        );

      setExistingAttendance(records);
    } catch (error) {
      console.error("Check attendance error:", error);

      setExistingAttendance([]);

      setAttendanceCheckError(
        "আগের উপস্থিতি যাচাই করা যায়নি। সংযোগ ও Firestore Rules পরীক্ষা করুন।",
      );
    } finally {
      setCheckingAttendance(false);
    }
  }, [selectedDepartment, selectedClass, date]);

  useEffect(() => {
    checkExistingAttendance();
  }, [checkExistingAttendance]);

  /* =========================================================
     Search / Statistics
  ========================================================= */

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return students;

    return students.filter(
      (student) =>
        String(student.name ?? "")
          .toLowerCase()
          .includes(term) ||
        String(student.studentId ?? "")
          .toLowerCase()
          .includes(term),
    );
  }, [students, search]);

  const presentCount = students.filter(
    (student) => attendance[student.docId] === true,
  ).length;

  const absentCount = students.length - presentCount;

  const alreadyTaken = existingAttendance.length > 0;

  const takenBy = useMemo(() => {
    const record = existingAttendance.find(
      (item) => item.takenByName || item.teacherName,
    );

    return record ? getSubmitterName(record) : "";
  }, [existingAttendance]);

  /* =========================================================
     Selection Handlers
  ========================================================= */

  const handleDepartmentChange = (value) => {
    if (isCR) return;

    setSelectedDepartmentId(value);
    setSelectedClassId("");

    setStudents([]);
    setAttendance({});
    setExistingAttendance([]);
    setAttendanceCheckError("");
    setSearch("");
  };

  const handleClassChange = (value) => {
    if (isCR) return;

    setSelectedClassId(value);

    setStudents([]);
    setAttendance({});
    setExistingAttendance([]);
    setAttendanceCheckError("");
    setSearch("");
  };

  const markAll = (present) => {
    if (alreadyTaken || checkingAttendance) return;

    setAttendance(
      Object.fromEntries(students.map((student) => [student.docId, present])),
    );
  };

  const toggleStudent = (studentDocId) => {
    if (alreadyTaken || checkingAttendance || attendanceCheckError) {
      return;
    }

    setAttendance((previous) => ({
      ...previous,
      [studentDocId]: !previous[studentDocId],
    }));
  };

  /* =========================================================
     Save Attendance + Recalculate Current Mark
  ========================================================= */

  const handleSubmit = async () => {
    if (!canManageAttendance) {
      toast.error("আপনার উপস্থিতি নেওয়ার অনুমতি নেই।");
      return;
    }

    if (!selectedDepartment || !selectedClass || !date) {
      toast.error("বিভাগ, শ্রেণি/ব্যাচ ও তারিখ নির্বাচন করুন।");
      return;
    }

    if (date > getLocalDate()) {
      toast.error("ভবিষ্যতের তারিখে উপস্থিতি নেওয়া যাবে না।");
      return;
    }

    if (!students.length) {
      toast.error("কোনো সক্রিয় শিক্ষার্থী পাওয়া যায়নি।");
      return;
    }

    if (attendanceCheckError) {
      toast.error("আগের উপস্থিতি যাচাই করা যায়নি।");
      return;
    }

    if (checkingAttendance) {
      toast.error("আগের উপস্থিতি যাচাই শেষ হওয়া পর্যন্ত অপেক্ষা করুন।");
      return;
    }

    if (alreadyTaken) {
      toast.error(
        `এই দিনের উপস্থিতি আগেই নেওয়া হয়েছে${takenBy ? `: ${takenBy}` : ""}।`,
      );
      return;
    }

    const departmentName = selectedDepartment.name;
    const className = selectedClass.name;

    const departmentId = getDepartmentId(selectedDepartment);

    const classId = getClassId(selectedClass);

    if (!isAdminUser && !userDepartments.includes(departmentId)) {
      toast.error("এই বিভাগের উপস্থিতি নেওয়ার অনুমতি নেই।");
      return;
    }

    /* -----------------------------------------------
       Re-verify CR's own batch
    ----------------------------------------------- */

    if (isCR) {
      const session = readStudentSession();

      if (
        !crStudent ||
        !session?.documentId ||
        session.documentId !== crStudent.docId ||
        crStudent.isCR !== true ||
        !isActiveStudent(crStudent) ||
        normalizeId(crStudent.departmentId) !== departmentId ||
        crStudent.batchId !== classId ||
        selectedDepartment.type !== "batch"
      ) {
        toast.error(
          "আপনি শুধু নিজের কেয়ার ব্যাচের উপস্থিতি নিতে পারবেন। আবার লগইন করুন।",
        );

        return;
      }
    }

    setSubmitting(true);

    try {
      /* -----------------------------------------------
         Recheck existing attendance
      ----------------------------------------------- */

      const duplicateSnapshot = await getDocs(
        query(collection(db, "attendance"), where("date", "==", date)),
      );

      const duplicateExists = duplicateSnapshot.docs.some((item) => {
        const record = item.data();

        return (
          normalizeId(record.departmentId) === departmentId &&
          String(record.classId ?? "") === classId
        );
      });

      if (duplicateExists) {
        await checkExistingAttendance();

        toast.error("এই দিনের উপস্থিতি ইতিমধ্যে সংরক্ষিত হয়েছে।");

        return;
      }

      /* -----------------------------------------------
         Submitter details
      ----------------------------------------------- */

      const submitterName =
        profile?.name ||
        currentUser?.displayName ||
        currentUser?.email ||
        "নাম পাওয়া যায়নি";

      const submitterUid = currentUser?.uid || crStudent?.docId || "";

      const submitterEmail = currentUser?.email || "";

      const submitterRole = isCR ? "student" : role;

      /* -----------------------------------------------
         Save attendance
      ----------------------------------------------- */

      const batch = writeBatch(db);

      students.forEach((student) => {
        const present = attendance[student.docId] === true;

        const attendanceId = getAttendanceDocId(
          date,
          departmentName,
          className,
          student.docId,
        );

        const attendanceRef = doc(db, "attendance", attendanceId);

        batch.set(attendanceRef, {
          date,

          departmentName,
          className,

          departmentId,
          classId,

          studentDocId: student.docId,
          studentId: String(student.studentId ?? ""),
          studentName: student.name ?? "",

          status: present ? "present" : "absent",
          present,

          ...(isBatchDepartment(selectedDepartment)
            ? {
                batchId: classId,
                batchName: className,
              }
            : {}),

          takenByUid: submitterUid,
          takenByName: submitterName,
          takenByEmail: submitterEmail,
          takenByRole: submitterRole,

          teacherId: submitterUid,
          teacherName: submitterName,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      toast.success("উপস্থিতি সফলভাবে সংরক্ষণ করা হয়েছে।");

      /* -----------------------------------------------
         Recalculate currentMark

         Attendance is already saved. If recalculation
         fails, do not treat attendance as unsaved.
      ----------------------------------------------- */

      const results = await Promise.allSettled(
        students.map((student) =>
          calculateCurrentMark({
            db,
            studentDocumentId: student.docId,
            studentId: String(student.studentId ?? ""),
          }),
        ),
      );

      const failedResults = results.filter(
        (result) => result.status === "rejected",
      );

      if (failedResults.length > 0) {
        console.error("currentMark recalculation failures:", failedResults);

        toast.error(
          `${failedResults.length} জন শিক্ষার্থীর currentMark আপডেট হয়নি।`,
        );
      } else {
        toast.success("সব শিক্ষার্থীর currentMark আপডেট হয়েছে।");
      }

      await checkExistingAttendance();
    } catch (error) {
      console.error("Submit attendance error:", error);

      toast.error(
        error.message || "উপস্থিতি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* =========================================================
     Loading
  ========================================================= */

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary" />

          <p className="mt-3 text-sm text-base-content/60">
            অ্যাকাউন্ট যাচাই হচ্ছে...
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     Access Denied
  ========================================================= */

  if (authError || !canManageAttendance) {
    return (
      <div className="mx-auto mt-8 max-w-md px-4">
        <div className="rounded-2xl border border-error/20 bg-base-100 p-6 text-center shadow-sm">
          <FiShield className="mx-auto mb-3 text-4xl text-error" />

          <h2 className="text-lg font-bold">প্রবেশের অনুমতি নেই</h2>

          <p className="mt-2 text-sm text-base-content/65">
            {authError || "এই পেজ ব্যবহারের জন্য অনুমোদিত অ্যাকাউন্ট প্রয়োজন।"}
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 sm:py-6">
      {/* Header */}
      <section className="mb-5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-content shadow-md sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs opacity-80">
              <FiCheckCircle />
              TopLine Education
            </p>

            <h1 className="text-xl font-extrabold sm:text-2xl">
              শিক্ষার্থীদের উপস্থিতি
            </h1>

            <p className="mt-1 text-sm opacity-80">
              উপস্থিতি নিন, যাচাই করুন এবং সংরক্ষণ করুন।
            </p>
          </div>

          <FiUserCheck className="text-3xl" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-3 py-1.5">
            {isAdminUser
              ? "Admin"
              : isCR
                ? "Class Representative"
                : isHead
                  ? "Department Head"
                  : "Teacher"}
          </span>

          <span className="max-w-full truncate rounded-full bg-white/15 px-3 py-1.5">
            {profile?.name || currentUser?.displayName || currentUser?.email}
          </span>
        </div>
      </section>

      {/* Attendance Information */}
      <section className="mb-4 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <FiCalendar className="text-primary" />
          উপস্থিতির তথ্য
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="form-control min-w-0">
            <span className="label-text mb-1.5 text-sm font-medium">বিভাগ</span>

            <select
              className="select select-bordered w-full"
              value={selectedDepartmentId}
              disabled={isCR || submitting}
              onChange={(event) => handleDepartmentChange(event.target.value)}
            >
              {allowedDepartments.map((item) => (
                <option
                  key={getDepartmentId(item)}
                  value={getDepartmentId(item)}
                >
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control min-w-0">
            <span className="label-text mb-1.5 text-sm font-medium">
              শ্রেণি / ব্যাচ
            </span>

            <select
              className="select select-bordered w-full"
              value={selectedClassId}
              disabled={isCR || submitting}
              onChange={(event) => handleClassChange(event.target.value)}
            >
              {availableClasses.map((item) => (
                <option key={getClassId(item)} value={getClassId(item)}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control min-w-0">
            <span className="label-text mb-1.5 text-sm font-medium">তারিখ</span>

            <input
              type="date"
              className="input input-bordered w-full"
              value={date}
              max={getLocalDate()}
              disabled={submitting}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>

        {isCR && (
          <div className="alert mt-3 border border-info/20 bg-info/10 py-2 text-sm">
            <FiShield className="shrink-0 text-info" />

            <span>
              নিজের ব্যাচ: <strong>{crStudent?.batchName}</strong>
            </span>
          </div>
        )}
      </section>

      {/* Attendance Status */}
      {checkingAttendance && (
        <div className="alert mb-4 border border-info/20 bg-info/10 text-sm">
          <span className="loading loading-spinner loading-sm" />
          আগের উপস্থিতি যাচাই হচ্ছে...
        </div>
      )}

      {attendanceCheckError && (
        <div className="alert mb-4 border border-error/30 bg-error/10 text-sm">
          <FiAlertCircle className="shrink-0 text-error" />

          <span>{attendanceCheckError}</span>

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={checkExistingAttendance}
            disabled={checkingAttendance}
          >
            আবার চেষ্টা
          </button>
        </div>
      )}

      {!checkingAttendance && alreadyTaken && (
        <div className="alert mb-4 border border-warning/30 bg-warning/10 text-sm">
          <FiAlertCircle className="shrink-0 text-warning" />

          <div>
            <p className="font-bold">এই দিনের উপস্থিতি আগেই নেওয়া হয়েছে।</p>

            <p className="mt-1 text-xs opacity-80">
              গ্রহণকারী: {takenBy || getSubmitterName(existingAttendance[0])}
            </p>

            <p className="mt-1 text-xs opacity-80">
              রেকর্ড: {existingAttendance.length} জন
            </p>
          </div>
        </div>
      )}

      {/* Statistics */}
      <section className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["মোট শিক্ষার্থী", students.length, "text-base-content"],
          ["উপস্থিত", presentCount, "text-success"],
          ["অনুপস্থিত", absentCount, "text-error"],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="rounded-xl border border-base-300 bg-base-100 p-3 sm:p-4"
          >
            <p className="text-xs text-base-content/60">{label}</p>

            <p className={`mt-1 text-xl font-extrabold sm:text-2xl ${color}`}>
              {value}
            </p>
          </div>
        ))}
      </section>

      {/* Student List */}
      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <div className="border-b border-base-300 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold">
                <FiUsers className="text-primary" />
                শিক্ষার্থীদের তালিকা
              </h2>

              <p className="mt-1 text-xs text-base-content/60">
                {selectedDepartment?.name || "বিভাগ নির্বাচন করুন"}

                {selectedClass ? ` · ${selectedClass.name}` : ""}
              </p>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-ghost gap-2"
              onClick={loadStudents}
              disabled={loadingStudents || submitting}
            >
              <FiRefreshCw className={loadingStudents ? "animate-spin" : ""} />
              রিফ্রেশ
            </button>
          </div>

          <label className="input input-bordered mt-4 flex w-full items-center gap-2">
            <FiSearch className="shrink-0 text-base-content/50" />

            <input
              type="search"
              className="grow"
              placeholder="নাম অথবা শিক্ষার্থী আইডি দিয়ে খুঁজুন"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline btn-success"
              onClick={() => markAll(true)}
              disabled={
                !students.length ||
                alreadyTaken ||
                checkingAttendance ||
                Boolean(attendanceCheckError) ||
                submitting
              }
            >
              <FiCheck />
              সবাই উপস্থিত
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline btn-error"
              onClick={() => markAll(false)}
              disabled={
                !students.length ||
                alreadyTaken ||
                checkingAttendance ||
                Boolean(attendanceCheckError) ||
                submitting
              }
            >
              <FiX />
              সবাই অনুপস্থিত
            </button>
          </div>
        </div>

        {loadingStudents ? (
          <div className="grid min-h-48 place-items-center">
            <div className="text-center">
              <span className="loading loading-spinner loading-md text-primary" />

              <p className="mt-3 text-sm text-base-content/60">
                শিক্ষার্থীদের তালিকা লোড হচ্ছে...
              </p>
            </div>
          </div>
        ) : !students.length ? (
          <div className="px-4 py-12 text-center">
            <FiUsers className="mx-auto mb-3 text-3xl text-base-content/30" />

            <p className="font-semibold">কোনো শিক্ষার্থী পাওয়া যায়নি।</p>

            <p className="mt-1 text-xs text-base-content/60">
              বিভাগ, শ্রেণি/ব্যাচ এবং শিক্ষার্থীদের তথ্য যাচাই করুন।
            </p>
          </div>
        ) : !filteredStudents.length ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/60">
            অনুসন্ধানের সঙ্গে মেলে এমন শিক্ষার্থী নেই।
          </p>
        ) : (
          <div className="divide-y divide-base-200">
            {filteredStudents.map((student, index) => {
              const present = attendance[student.docId] === true;

              return (
                <button
                  key={student.docId}
                  type="button"
                  onClick={() => toggleStudent(student.docId)}
                  disabled={
                    alreadyTaken ||
                    checkingAttendance ||
                    Boolean(attendanceCheckError) ||
                    submitting
                  }
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${
                    present
                      ? "hover:bg-success/5"
                      : "bg-error/[0.03] hover:bg-error/5"
                  } disabled:cursor-not-allowed disabled:opacity-75`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-base-200 text-xs font-bold">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {student.name || "নাম নেই"}
                    </span>

                    <span className="mt-0.5 block truncate text-xs text-base-content/60">
                      ID: {student.studentId || student.docId}
                    </span>
                  </span>

                  <span
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${
                      present
                        ? "bg-success/10 text-success"
                        : "bg-error/10 text-error"
                    }`}
                  >
                    {present ? <FiCheck /> : <FiX />}

                    {present ? "উপস্থিত" : "অনুপস্থিত"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Save Attendance */}
        <div className="sticky bottom-0 z-10 border-t border-base-300 bg-base-100/95 p-4 backdrop-blur sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-base-content/65">
              {presentCount} / {students.length} জন উপস্থিত
            </span>

            <span className="font-semibold">
              {students.length
                ? `${Math.round((presentCount / students.length) * 100)}%`
                : "0%"}
            </span>
          </div>

          <progress
            className="progress progress-success mb-4 w-full"
            value={presentCount}
            max={students.length || 1}
          />

          <button
            type="button"
            className="btn btn-primary min-h-12 w-full gap-2"
            onClick={handleSubmit}
            disabled={
              submitting ||
              loadingStudents ||
              checkingAttendance ||
              Boolean(attendanceCheckError) ||
              alreadyTaken ||
              !students.length ||
              !selectedDepartment ||
              !selectedClass
            }
          >
            {submitting ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                উপস্থিতি সংরক্ষণ ও নম্বর আপডেট হচ্ছে...
              </>
            ) : alreadyTaken ? (
              <>
                <FiCheckCircle />
                উপস্থিতি ইতিমধ্যে সংরক্ষিত
              </>
            ) : (
              <>
                <FiSend />
                উপস্থিতি সংরক্ষণ করুন
              </>
            )}
          </button>

          <p className="mt-2 text-center text-xs text-base-content/55">
            গ্রহণকারী:{" "}
            {profile?.name || currentUser?.displayName || currentUser?.email}
          </p>
        </div>
      </section>
    </main>
  );
}
