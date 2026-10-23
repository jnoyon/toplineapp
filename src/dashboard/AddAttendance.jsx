import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import toast from "react-hot-toast";
import {
  FaCalendarAlt,
  FaCheck,
  FaClipboardCheck,
  FaGraduationCap,
  FaSearch,
  FaUsers,
} from "react-icons/fa";

import { auth, db } from "../assets/firebase/firebase.init";

/* --------------------------------------------------
   Constants
-------------------------------------------------- */

const SUPERADMIN_EMAIL = "jihadur51@gmail.com";
const CARE_DEPARTMENT_ID = "03";

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

const normalizeId = (value) => {
  const id = String(value ?? "").trim();

  return /^\d+$/.test(id) ? String(Number(id)) : id;
};

const getRole = (profile) =>
  String(profile?.role || profile?.userRole || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const isAdminRole = (role) => ["admin", "superadmin"].includes(role);

const isHeadRole = (role) => ["head", "departmenthead"].includes(role);

const getDepartmentKey = (department) =>
  normalizeId(department?.departmentId ?? department?.id);

const getDepartmentIds = (profile) => {
  const values = [];

  if (Array.isArray(profile?.departmentIds)) {
    values.push(...profile.departmentIds);
  }

  if (Array.isArray(profile?.departments)) {
    values.push(
      ...profile.departments.map((item) =>
        typeof item === "object" ? (item.departmentId ?? item.id) : item,
      ),
    );
  }

  if (profile?.departmentId != null) {
    values.push(profile.departmentId);
  }

  if (profile?.department?.departmentId != null) {
    values.push(profile.department.departmentId);
  }

  if (profile?.department?.id != null) {
    values.push(profile.department.id);
  }

  return [...new Set(values.map(normalizeId).filter(Boolean))];
};

const getTeacherName = (profile, user) =>
  profile?.name ||
  profile?.displayName ||
  user?.displayName ||
  user?.email ||
  "Unknown";

const getTeacherId = (profile, user) =>
  String(profile?.teacherId || profile?.id || user?.uid || "");

const getClassName = (item) =>
  item?.className ||
  item?.batchName ||
  item?.name ||
  item?.title ||
  "Unnamed Class";

const getStudentRoll = (student) =>
  student.roll ??
  student.rollNumber ??
  student.studentRoll ??
  student.studentId ??
  student.id;

const compareRolls = (a, b) => {
  const rollA = String(getStudentRoll(a) ?? "");
  const rollB = String(getStudentRoll(b) ?? "");

  return rollA.localeCompare(rollB, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const getToday = () => {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};

const getAttendanceId = (date, classId, studentId) =>
  `${date}_${encodeURIComponent(normalizeId(classId))}_${encodeURIComponent(
    normalizeId(studentId),
  )}`;

const getSessionId = (date, departmentId, classId) =>
  `${date}_${encodeURIComponent(normalizeId(departmentId))}_${encodeURIComponent(
    normalizeId(classId),
  )}`;

const getAssignedTeacherIds = (item) => {
  const values = [
    item.teacherId,
    item.classTeacherId,
    item.assignedTeacherId,
    ...(Array.isArray(item.teacherIds) ? item.teacherIds : []),
    ...(Array.isArray(item.assignedTeacherIds) ? item.assignedTeacherIds : []),
    ...(Array.isArray(item.teachers)
      ? item.teachers.map((teacher) =>
          typeof teacher === "object"
            ? teacher.teacherId || teacher.id || teacher.uid
            : teacher,
        )
      : []),
  ];

  return values.filter(Boolean).map(String);
};

const isTeacherAssigned = (item, profile, user) => {
  const assignedIds = getAssignedTeacherIds(item);

  const currentIds = [user?.uid, profile?.teacherId, profile?.id]
    .filter(Boolean)
    .map(String);

  return currentIds.some((id) => assignedIds.includes(id));
};

/**
 * Checks whether a student document is linked to the logged-in user.
 *
 * Your users and students documents must share at least one supported
 * identifier. Adjust these fields if your existing schema uses different
 * names.
 */
const isLinkedStudent = (student, profile, uid) => {
  const profileStudentIds = [
    profile?.studentDocId,
    profile?.studentId,
    profile?.studentID,
    profile?.student?.studentId,
    profile?.student?.id,
  ]
    .filter(Boolean)
    .map(normalizeId);

  const matchesUid = [
    student.uid,
    student.userId,
    student.authUid,
    student.firebaseUid,
  ]
    .filter(Boolean)
    .some((id) => String(id) === String(uid));

  const matchesStudentId =
    profileStudentIds.includes(normalizeId(student.id)) ||
    profileStudentIds.includes(normalizeId(student.studentId));

  return matchesUid || matchesStudentId;
};

/* --------------------------------------------------
   Stat Card
-------------------------------------------------- */

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-base-content/60">{label}</p>
        <Icon className={color} />
      </div>

      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

/* --------------------------------------------------
   Main Component
-------------------------------------------------- */

export default function AddAttendance() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [crStudent, setCrStudent] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  const [departmentId, setDepartmentId] = useState("");
  const [classId, setClassId] = useState("");

  const [attendance, setAttendance] = useState({});
  const [dressCode, setDressCode] = useState({});
  const [search, setSearch] = useState("");

  const [pageLoading, setPageLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const today = getToday();

  const role = getRole(profile);

  const isSuperAdmin =
    user?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();

  const isAdmin = isSuperAdmin || isAdminRole(role);
  const isTeacher = role === "teacher";
  const isHead = isHeadRole(role);

  const isCR = crStudent?.isCR === true;

  const profileDepartmentIds = useMemo(
    () => getDepartmentIds(profile),
    [profile],
  );

  const canManageAttendance = isAdmin || isTeacher || isHead || isCR;

  /* --------------------------------------------------
     Load user, profile, departments and classes
  -------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (cancelled) return;

      setUser(currentUser);
      setProfile(null);
      setCrStudent(null);
      setDepartments([]);
      setClasses([]);
      setError("");
      setPageLoading(true);

      if (!currentUser) {
        setError("এই পেজ ব্যবহার করতে লগইন করুন।");
        setPageLoading(false);
        return;
      }

      try {
        const profileSnapshot = await getDoc(doc(db, "users", currentUser.uid));

        if (cancelled) return;

        if (!profileSnapshot.exists()) {
          setError("আপনার user profile পাওয়া যায়নি।");
          setPageLoading(false);
          return;
        }

        const userProfile = {
          ...profileSnapshot.data(),
          id: profileSnapshot.id,
        };

        const currentRole = getRole(userProfile);

        const currentIsAdmin =
          currentUser.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() ||
          isAdminRole(currentRole);

        const currentIsTeacher = currentRole === "teacher";
        const currentIsHead = isHeadRole(currentRole);

        let linkedCRStudent = null;

        /*
         * Non-admin, non-teacher and non-head users are checked
         * against the students collection to determine CR status.
         */
        if (!currentIsAdmin && !currentIsTeacher && !currentIsHead) {
          const studentSnapshot = await getDocs(collection(db, "students"));

          if (cancelled) return;

          linkedCRStudent = studentSnapshot.docs
            .map((item) => ({
              ...item.data(),
              id: item.id,
            }))
            .find(
              (student) =>
                student.isCR === true &&
                normalizeId(student.departmentId) === CARE_DEPARTMENT_ID &&
                Boolean(student.batchId) &&
                isLinkedStudent(student, userProfile, currentUser.uid),
            );
        }

        const currentIsCR = linkedCRStudent?.isCR === true;

        if (
          !currentIsAdmin &&
          !currentIsTeacher &&
          !currentIsHead &&
          !currentIsCR
        ) {
          setProfile(userProfile);
          setError(
            "এই পেজ ব্যবহারের অনুমতি শুধু Admin, Teacher, Head ও অনুমোদিত CR-এর রয়েছে।",
          );
          setPageLoading(false);
          return;
        }

        setProfile(userProfile);
        setCrStudent(linkedCRStudent);

        const [departmentSnapshot, classSnapshot] = await Promise.all([
          getDocs(collection(db, "departments")),
          getDocs(collection(db, "classes")),
        ]);

        if (cancelled) return;

        const departmentData = departmentSnapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }));

        const classData = classSnapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }));

        setDepartments(
          departmentData.filter((item) => item.isActive !== false),
        );

        setClasses(classData);

        const allowedIds = getDepartmentIds(userProfile);

        if (!currentIsAdmin && !currentIsCR && !allowedIds.length) {
          setError(
            "আপনার user profile-এ departmentId বা departmentIds নির্ধারিত নেই।",
          );
        }
      } catch (err) {
        console.error("Attendance initialization error:", err);

        if (!cancelled) {
          setError("তথ্য লোড করা যায়নি। Firebase permissions পরীক্ষা করুন।");
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /* --------------------------------------------------
     Departments visible to current user
  -------------------------------------------------- */

  const visibleDepartments = useMemo(() => {
    if (isAdmin) return departments;

    // A CR can only access TopLine Care.
    if (isCR) {
      return departments.filter(
        (department) => getDepartmentKey(department) === CARE_DEPARTMENT_ID,
      );
    }

    return departments.filter((department) => {
      const key = getDepartmentKey(department);
      const documentId = normalizeId(department.id);

      return (
        profileDepartmentIds.includes(key) ||
        profileDepartmentIds.includes(documentId)
      );
    });
  }, [departments, isAdmin, isCR, profileDepartmentIds]);

  const showDepartmentSelect =
    !isCR && (isAdmin || visibleDepartments.length > 1);

  const selectedDepartment = visibleDepartments.find(
    (item) => getDepartmentKey(item) === normalizeId(departmentId),
  );

  const departmentUsesDressCode = normalizeId(departmentId) === "1";

  /* --------------------------------------------------
     Automatically select department and CR batch
  -------------------------------------------------- */

  useEffect(() => {
    if (isCR) {
      setDepartmentId(CARE_DEPARTMENT_ID);
      setClassId(crStudent?.batchId || "");
      return;
    }

    if (isAdmin) return;

    if (visibleDepartments.length === 1) {
      setDepartmentId(getDepartmentKey(visibleDepartments[0]));
    } else if (visibleDepartments.length === 0) {
      setDepartmentId("");
    } else if (
      !visibleDepartments.some(
        (item) => getDepartmentKey(item) === normalizeId(departmentId),
      )
    ) {
      setDepartmentId("");
    }
  }, [isAdmin, isCR, crStudent, visibleDepartments, departmentId]);

  /* --------------------------------------------------
     Filter classes/batches by department and role
  -------------------------------------------------- */

  const availableClasses = useMemo(() => {
    if (!departmentId || !canManageAttendance) return [];

    return classes.filter((item) => {
      const matchesDepartment =
        normalizeId(item.departmentId) === normalizeId(departmentId);

      if (!matchesDepartment || item.isActive === false) {
        return false;
      }

      if (isCR) {
        return (
          normalizeId(item.departmentId) === CARE_DEPARTMENT_ID &&
          item.type === "batch" &&
          normalizeId(item.id) === normalizeId(crStudent?.batchId)
        );
      }

      if (isAdmin) return true;

      if (isTeacher) {
        return isTeacherAssigned(item, profile, user);
      }

      if (isHead) {
        return true;
      }

      return false;
    });
  }, [
    classes,
    departmentId,
    canManageAttendance,
    isAdmin,
    isTeacher,
    isHead,
    isCR,
    crStudent,
    profile,
    user,
  ]);

  /* --------------------------------------------------
     Load students for selected class/batch
  -------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const loadStudents = async () => {
      if (!departmentId || !classId) {
        setStudents([]);
        setAttendance({});
        setDressCode({});
        return;
      }

      setStudentsLoading(true);
      setError("");

      try {
        const selectedClass = availableClasses.find(
          (item) => item.id === classId,
        );

        if (!selectedClass) {
          setStudents([]);
          setError("নির্বাচিত শ্রেণি/ব্যাচ আপনার অনুমোদিত তালিকায় নেই।");
          return;
        }

        const studentSnapshot = await getDocs(collection(db, "students"));

        if (cancelled) return;

        const isBatch = selectedClass.type === "batch";

        const studentData = studentSnapshot.docs
          .map((item) => ({
            ...item.data(),
            id: item.id,
          }))
          .filter((student) => {
            const matchesDepartment =
              normalizeId(student.departmentId) === normalizeId(departmentId);

            const groupValue = isBatch ? student.batchId : student.classId;

            const matchesClass =
              normalizeId(groupValue) === normalizeId(classId);

            const isActive =
              student.isActive !== false && student.status !== "disabled";

            return matchesDepartment && matchesClass && isActive;
          })
          .sort(compareRolls);

        setStudents(studentData);

        setAttendance(
          Object.fromEntries(studentData.map((student) => [student.id, true])),
        );

        setDressCode(
          Object.fromEntries(studentData.map((student) => [student.id, true])),
        );
      } catch (err) {
        console.error("Load students error:", err);

        if (!cancelled) {
          setStudents([]);
          setError(
            "শিক্ষার্থীদের তালিকা লোড করা যায়নি। Firebase permissions পরীক্ষা করুন।",
          );
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false);
        }
      }
    };

    loadStudents();

    return () => {
      cancelled = true;
    };
  }, [departmentId, classId, availableClasses]);

  /* --------------------------------------------------
     Search and counts
  -------------------------------------------------- */

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return students;

    return students.filter((student) => {
      const values = [
        student.name,
        student.studentName,
        student.studentId,
        student.roll,
        student.rollNumber,
      ];

      return values.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      );
    });
  }, [students, search]);

  const presentCount = students.filter(
    (student) => attendance[student.id] !== false,
  ).length;

  const absentCount = students.length - presentCount;

  /* --------------------------------------------------
     Change handlers
  -------------------------------------------------- */

  const handleDepartmentChange = (value) => {
    setDepartmentId(value);
    setClassId("");
    setStudents([]);
    setAttendance({});
    setDressCode({});
    setSearch("");
    setError("");
  };

  const handleClassChange = (value) => {
    if (isCR && normalizeId(value) !== normalizeId(crStudent?.batchId)) {
      toast.error("আপনি শুধু নিজের ব্যাচ নির্বাচন করতে পারবেন।");
      return;
    }

    setClassId(value);
    setSearch("");
    setError("");
  };

  const toggleAllAttendance = (checked) => {
    setAttendance(
      Object.fromEntries(students.map((student) => [student.id, checked])),
    );
  };

  const toggleAllDressCode = (checked) => {
    setDressCode(
      Object.fromEntries(students.map((student) => [student.id, checked])),
    );
  };

  /* --------------------------------------------------
     Submit attendance
  -------------------------------------------------- */

  const handleSubmit = async () => {
    if (submitting) return;

    if (!user || !profile) {
      toast.error("প্রথমে লগইন করুন।");
      return;
    }

    if (!canManageAttendance) {
      toast.error("আপনার উপস্থিতি নেওয়ার অনুমতি নেই।");
      return;
    }

    if (!departmentId || !classId) {
      toast.error("বিভাগ ও শ্রেণি/ব্যাচ নির্বাচন করুন।");
      return;
    }

    if (!students.length) {
      toast.error("এই শ্রেণি/ব্যাচে কোনো শিক্ষার্থী পাওয়া যায়নি।");
      return;
    }

    if (students.length > 450) {
      toast.error("একবারে সর্বোচ্চ ৪৫০ জন শিক্ষার্থীর উপস্থিতি নেওয়া যাবে।");
      return;
    }

    const selectedClass = availableClasses.find((item) => item.id === classId);

    if (!selectedClass) {
      toast.error("এই শ্রেণি/ব্যাচে আপনার অনুমতি নেই।");
      return;
    }

    // CR must never submit attendance for another batch.
    if (
      isCR &&
      (normalizeId(departmentId) !== CARE_DEPARTMENT_ID ||
        selectedClass.type !== "batch" ||
        normalizeId(crStudent?.batchId) !== normalizeId(classId))
    ) {
      toast.error("আপনি শুধু নিজের TopLine Care ব্যাচের উপস্থিতি নিতে পারবেন।");
      return;
    }

    const isCareBatch =
      normalizeId(departmentId) === CARE_DEPARTMENT_ID &&
      selectedClass.type === "batch";

    let activeMonthRecord = null;

    /*
     * Find the active monthly record for TopLine Care batches.
     * The actual active status is checked again inside the transaction.
     */
    if (isCareBatch) {
      try {
        const monthSnapshot = await getDocs(collection(db, "batchMonthStates"));

        const activeMonths = monthSnapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter(
            (month) =>
              normalizeId(month.batchId) === normalizeId(classId) &&
              normalizeId(month.departmentId) === CARE_DEPARTMENT_ID &&
              month.status === "active",
          );

        if (activeMonths.length !== 1) {
          toast.error(
            activeMonths.length === 0
              ? "এই ব্যাচের কোনো মাস চালু নেই। অ্যাডমিনকে মাস শুরু করতে বলুন।"
              : "এই ব্যাচে একাধিক চালু মাস পাওয়া গেছে। অ্যাডমিনের সহায়তা নিন।",
          );
          return;
        }

        activeMonthRecord = activeMonths[0];

        if (
          today < activeMonthRecord.startDate ||
          today > activeMonthRecord.endDate
        ) {
          toast.error("আজকের তারিখ চালু মাসের সময়সীমার বাইরে।");
          return;
        }
      } catch (err) {
        console.error("Load active month error:", err);

        toast.error(
          "মাসের তথ্য যাচাই করা যায়নি। Firebase permissions পরীক্ষা করুন।",
        );
        return;
      }
    }

    const teacherId = getTeacherId(profile, user);
    const teacherName = getTeacherName(profile, user);

    const sessionId = getSessionId(today, departmentId, classId);

    const sessionRef = doc(db, "attendanceSessions", sessionId);

    const attendanceRefs = students.map((student) => {
      const studentIdentifier = student.studentId || student.id;

      return {
        student,
        ref: doc(
          db,
          "attendance",
          getAttendanceId(today, classId, studentIdentifier),
        ),
      };
    });

    setSubmitting(true);

    try {
      await runTransaction(db, async (transaction) => {
        /*
         * Read the session and month before writing anything.
         */
        const sessionSnapshot = await transaction.get(sessionRef);

        if (sessionSnapshot.exists()) {
          const duplicateError = new Error("ATTENDANCE_ALREADY_EXISTS");

          duplicateError.code = "attendance/already-exists";
          throw duplicateError;
        }

        if (isCareBatch && activeMonthRecord) {
          const monthRef = doc(db, "batchMonthStates", activeMonthRecord.id);

          const monthSnapshot = await transaction.get(monthRef);

          if (
            !monthSnapshot.exists() ||
            monthSnapshot.data().status !== "active" ||
            today < monthSnapshot.data().startDate ||
            today > monthSnapshot.data().endDate
          ) {
            throw new Error("BATCH_MONTH_NOT_ACTIVE");
          }
        }

        /*
         * Read every attendance record before writing.
         */
        const recordSnapshots = [];

        for (const item of attendanceRefs) {
          recordSnapshots.push(await transaction.get(item.ref));
        }

        if (recordSnapshots.some((snapshot) => snapshot.exists())) {
          const duplicateError = new Error("ATTENDANCE_ALREADY_EXISTS");

          duplicateError.code = "attendance/already-exists";
          throw duplicateError;
        }

        /*
         * Create one session per date, department and batch/class.
         * This session represents one completed class.
         */
        transaction.set(sessionRef, {
          date: today,
          departmentId: normalizeId(departmentId),
          departmentName:
            selectedDepartment?.name || selectedDepartment?.englishName || "",
          classId,
          className: getClassName(selectedClass),
          teacherId,
          teacherName,
          studentCount: students.length,
          presentCount,
          absentCount,
          ...(isCareBatch && activeMonthRecord
            ? {
                batchMonthStateId: activeMonthRecord.id,
                monthNumber: activeMonthRecord.monthNumber,
              }
            : {}),
          createdAt: serverTimestamp(),
        });

        /*
         * Save each student's attendance.
         */
        attendanceRefs.forEach(({ student, ref }) => {
          transaction.set(ref, {
            studentId: normalizeId(student.studentId || student.id),
            studentName: student.name || student.studentName || "",
            roll: getStudentRoll(student),
            departmentId: normalizeId(departmentId),
            departmentName:
              selectedDepartment?.name || selectedDepartment?.englishName || "",
            classId,
            className: getClassName(selectedClass),
            date: today,
            present: attendance[student.id] !== false,
            ...(departmentUsesDressCode
              ? {
                  dressCode: dressCode[student.id] !== false,
                }
              : {}),
            teacherId,
            teacherName,
            createdAt: serverTimestamp(),
          });
        });
      });

      toast.success(
        `উপস্থিতি সংরক্ষিত হয়েছে। উপস্থিত: ${presentCount}, অনুপস্থিত: ${absentCount}`,
      );
    } catch (err) {
      console.error("Save attendance error:", err);

      if (err.message === "BATCH_MONTH_NOT_ACTIVE") {
        toast.error(
          "এই ব্যাচের মাস বন্ধ হয়েছে বা চালু নেই। উপস্থিতি জমা দেওয়া যাবে না।",
        );
      } else if (
        err.code === "attendance/already-exists" ||
        err.message === "ATTENDANCE_ALREADY_EXISTS"
      ) {
        try {
          const previousSession = await getDoc(sessionRef);

          const previousTeacher = previousSession.exists()
            ? previousSession.data().teacherName || "অন্য একজন শিক্ষক"
            : "অন্য একজন শিক্ষক";

          toast.error(`আজকের উপস্থিতি ${previousTeacher} ইতিমধ্যে নিয়েছেন।`);
        } catch {
          toast.error("আজকের উপস্থিতি ইতিমধ্যে জমা হয়েছে।");
        }
      } else {
        toast.error(
          "উপস্থিতি সংরক্ষণ করা যায়নি। Console ও Firestore rules পরীক্ষা করুন।",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* --------------------------------------------------
     Loading and errors
  -------------------------------------------------- */

  if (pageLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      </main>
    );
  }

  /* --------------------------------------------------
     UI
  -------------------------------------------------- */

  return (
    <main className="min-h-screen bg-base-200/40 px-4 py-6 text-base-content sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">
              Add Attendance
            </h1>

            <p className="mt-1 text-sm text-base-content/60">
              {today} · {getTeacherName(profile, user)}
              {isCR && <span className="ml-2 badge badge-info">CR</span>}
            </p>
          </div>

          <div className="badge badge-primary badge-lg gap-2">
            <FaClipboardCheck />
            উপস্থিতি
          </div>
        </header>

        {error && (
          <div className="alert alert-warning">
            <span>{error}</span>
          </div>
        )}

        <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6">
          <div
            className={`grid grid-cols-1 gap-4 ${
              showDepartmentSelect ? "sm:grid-cols-2" : ""
            }`}
          >
            {showDepartmentSelect && (
              <label className="form-control">
                <span className="label-text mb-2 font-semibold">বিভাগ</span>

                <select
                  className="select select-bordered w-full"
                  value={departmentId}
                  onChange={(event) =>
                    handleDepartmentChange(event.target.value)
                  }
                  disabled={submitting}
                >
                  <option value="">বিভাগ নির্বাচন করুন</option>

                  {visibleDepartments.map((department) => (
                    <option
                      key={department.id}
                      value={getDepartmentKey(department)}
                    >
                      {department.name ||
                        department.englishName ||
                        department.id}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="form-control">
              <span className="label-text mb-2 font-semibold">
                শ্রেণি / ব্যাচ
              </span>

              <select
                className="select select-bordered w-full"
                value={classId}
                onChange={(event) => handleClassChange(event.target.value)}
                disabled={!departmentId || submitting || isCR}
              >
                <option value="">শ্রেণি / ব্যাচ নির্বাচন করুন</option>

                {availableClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getClassName(item)}
                  </option>
                ))}
              </select>

              {isCR && (
                <span className="mt-2 text-xs text-base-content/60">
                  আপনি শুধু নিজের ব্যাচের উপস্থিতি নিতে পারবেন।
                </span>
              )}
            </label>
          </div>
        </section>

        {classId && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label="শিক্ষার্থী"
                value={students.length}
                icon={FaUsers}
                color="text-primary"
              />

              <StatCard
                label="উপস্থিত"
                value={presentCount}
                icon={FaCheck}
                color="text-success"
              />

              <div className="col-span-2 sm:col-span-1">
                <StatCard
                  label="অনুপস্থিত"
                  value={absentCount}
                  icon={FaGraduationCap}
                  color="text-error"
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">
                    {getClassName(
                      availableClasses.find((item) => item.id === classId),
                    )}
                  </h2>

                  <p className="text-sm text-base-content/60">
                    Roll / ID অনুযায়ী সাজানো
                  </p>
                </div>

                <label className="input input-bordered flex items-center gap-2">
                  <FaSearch className="text-base-content/40" />

                  <input
                    type="search"
                    className="grow"
                    placeholder="নাম বা ID খুঁজুন"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={students.length > 0 && absentCount === 0}
                    onChange={(event) =>
                      toggleAllAttendance(event.target.checked)
                    }
                    disabled={studentsLoading || submitting}
                  />
                  সবাই উপস্থিত
                </label>

                {departmentUsesDressCode && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm">Dress Code</span>

                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        const allChecked = students.every(
                          (student) => dressCode[student.id] !== false,
                        );

                        toggleAllDressCode(!allChecked);
                      }}
                      disabled={studentsLoading || submitting}
                    >
                      সবাই পরিবর্তন
                    </button>
                  </div>
                )}
              </div>

              {studentsLoading ? (
                <div className="flex justify-center p-12">
                  <span className="loading loading-spinner loading-lg text-primary" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-10 text-center text-sm text-base-content/60">
                  কোনো শিক্ষার্থী পাওয়া যায়নি।
                  <p className="mt-2 text-xs">
                    students collection-এ departmentId এবং সঠিক classId /
                    batchId আছে কি না পরীক্ষা করুন।
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Roll / ID</th>
                        <th>শিক্ষার্থী</th>
                        <th className="text-center">উপস্থিত</th>

                        {departmentUsesDressCode && (
                          <th className="text-center">Dress Code</th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr key={student.id}>
                          <td className="font-mono text-sm">
                            {getStudentRoll(student) || student.id}
                          </td>

                          <td>
                            <div className="font-semibold">
                              {student.name || student.studentName || "নাম নেই"}

                              {student.isCR === true && (
                                <span className="ml-2 badge badge-info badge-sm">
                                  CR
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-base-content/50">
                              ID: {student.studentId || student.id}
                            </div>
                          </td>

                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-success"
                              checked={attendance[student.id] !== false}
                              onChange={(event) =>
                                setAttendance((previous) => ({
                                  ...previous,
                                  [student.id]: event.target.checked,
                                }))
                              }
                              disabled={submitting}
                            />
                          </td>

                          {departmentUsesDressCode && (
                            <td className="text-center">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-primary"
                                checked={dressCode[student.id] !== false}
                                onChange={(event) =>
                                  setDressCode((previous) => ({
                                    ...previous,
                                    [student.id]: event.target.checked,
                                  }))
                                }
                                disabled={submitting}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-base-content/60">
                  {filteredStudents.length} / {students.length} শিক্ষার্থী
                </p>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    studentsLoading ||
                    students.length === 0 ||
                    !classId
                  }
                >
                  {submitting ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />
                      সংরক্ষণ হচ্ছে...
                    </>
                  ) : (
                    <>
                      <FaCalendarAlt />
                      Add Attendance
                    </>
                  )}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
