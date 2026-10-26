import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

import { db } from "../../assets/firebase/firebase.init";
import { departmentList } from "../../config/departments";

const normalize = (value) => String(value ?? "").trim();

const sameId = (a, b) => normalize(a) === normalize(b);

const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem("studentSession") || "null");
  } catch {
    return null;
  }
};

const getExamClasses = (exam) =>
  [
    ...(exam.selectedClasses || []),
    ...(exam.classes || []),
    ...(exam.selectedClassIds || []),
  ]
    .map((item) =>
      typeof item === "object"
        ? normalize(item.id ?? item.classId ?? item.batchId ?? item.value)
        : normalize(item),
    )
    .filter(Boolean);

const getStudentClass = (student) =>
  normalize(student?.batchId || student?.classId);

const getStudentName = (item) =>
  item.studentName || item.name || "নাম পাওয়া যায়নি";

const getScore = (result) =>
  result.obtainedMark ??
  result.score ??
  result.totalObtainedMark ??
  result.marksObtained ??
  result.correctCount ??
  0;

const getTotal = (result) =>
  result.totalMark ??
  result.totalMarks ??
  result.maxMark ??
  result.fullMark ??
  result.questionsCount ??
  0;

const getPercentage = (obtained, total) =>
  Number(total) > 0
    ? `${((Number(obtained) / Number(total)) * 100).toFixed(1)}%`
    : "—";

export default function StudentExamResults() {
  const session = useMemo(getSession, []);

  const [student, setStudent] = useState(null);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);

  const [examType, setExamType] = useState("");
  const [examId, setExamId] = useState("");

  const [loading, setLoading] = useState(true);
  const [resultLoading, setResultLoading] = useState(false);

  const department = useMemo(
    () => departmentList.find((item) => sameId(item.id, student?.departmentId)),
    [student],
  );

  const classId = getStudentClass(student);

  const className = student?.batchName || student?.className || "শ্রেণি/ব্যাচ";

  // Load student profile and classmates.
  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (
        session?.role !== "student" ||
        !session?.documentId ||
        !session?.studentId
      ) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "students", session.documentId));

        if (!snapshot.exists()) {
          throw new Error("শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি।");
        }

        const data = { ...snapshot.data(), documentId: snapshot.id };

        if (data.isActive === false || data.approved === false) {
          throw new Error("আপনার অ্যাকাউন্ট সক্রিয় নয়।");
        }

        if (!mounted) return;

        setStudent(data);

        const studentSnapshot = await getDocs(collection(db, "students"));

        const classmates = studentSnapshot.docs
          .map((item) => ({
            ...item.data(),
            documentId: item.id,
          }))
          .filter((item) => {
            const sameDepartment = sameId(item.departmentId, data.departmentId);

            const sameClass = sameId(
              getStudentClass(item),
              getStudentClass(data),
            );

            return (
              sameDepartment &&
              sameClass &&
              item.approved !== false &&
              item.isActive !== false
            );
          });

        if (mounted) setStudents(classmates);
      } catch (error) {
        console.error("Student results profile error:", error);
        if (mounted) toast.error(error.message || "তথ্য লোড করা যায়নি।");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session]);

  // Load exams for the student's department and class/batch.
  useEffect(() => {
    let mounted = true;

    async function loadExams() {
      setExams([]);
      setExamId("");
      setResults([]);

      if (!student || !examType) return;

      try {
        const isOnline = examType === "online";

        const snapshot = await getDocs(
          collection(db, isOnline ? "onlineExams" : "syllabuses"),
        );

        const list = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((exam) => {
            if (!sameId(exam.departmentId, student.departmentId)) {
              return false;
            }

            if (!isOnline) {
              // Offline exam: syllabus classId also stores Care batchId.
              return sameId(exam.classId, classId);
            }

            const selectedClasses = getExamClasses(exam);

            return (
              selectedClasses.length === 0 || selectedClasses.includes(classId)
            );
          })
          .sort((a, b) =>
            normalize(b.examDate || b.createdAt?.seconds).localeCompare(
              normalize(a.examDate || a.createdAt?.seconds),
            ),
          );

        if (mounted) setExams(list);
      } catch (error) {
        console.error("Load exam list error:", error);
        toast.error("পরীক্ষার তালিকা লোড করা যায়নি।");
      }
    }

    loadExams();

    return () => {
      mounted = false;
    };
  }, [student, examType, classId]);

  // Load selected exam's marks/results.
  useEffect(() => {
    let mounted = true;

    async function loadResults() {
      setResults([]);

      if (!examId || !examType || !student) return;

      setResultLoading(true);

      try {
        const collectionName =
          examType === "online" ? "examResults" : "examMarks";

        const snapshot = await getDocs(
          query(collection(db, collectionName), where("examId", "==", examId)),
        );

        const studentIds = new Set(
          students.map((item) => normalize(item.studentId)),
        );

        const documentIds = new Set(
          students.map((item) => normalize(item.documentId)),
        );

        const ownStudentId = normalize(student.studentId);
        const ownDocumentId = normalize(student.documentId);

        const list = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((result) => {
            const resultStudentId = normalize(result.studentId);
            const resultDocumentId = normalize(result.studentDocumentId);

            // Always include the logged-in student's own result.
            const isOwn =
              resultStudentId === ownStudentId ||
              resultDocumentId === ownDocumentId ||
              normalize(result.studentUid) === ownStudentId;

            if (isOwn) return true;

            // Include classmates' results.
            const isClassmate =
              studentIds.has(resultStudentId) ||
              documentIds.has(resultDocumentId) ||
              studentIds.has(normalize(result.studentUid));

            if (!isClassmate) return false;

            // Protect against accidentally mixing departments/classes.
            if (
              result.departmentId != null &&
              !sameId(result.departmentId, student.departmentId)
            ) {
              return false;
            }

            const resultClass = normalize(result.batchId || result.classId);

            return !resultClass || resultClass === classId;
          })
          .map((result) => {
            const rosterStudent = students.find(
              (item) =>
                sameId(item.studentId, result.studentId) ||
                sameId(item.documentId, result.studentDocumentId) ||
                sameId(item.studentId, result.studentUid),
            );

            return {
              ...result,
              studentName:
                result.studentName ||
                rosterStudent?.name ||
                (sameId(result.studentId, ownStudentId)
                  ? student.name
                  : "শিক্ষার্থী"),
              studentId: result.studentId || rosterStudent?.studentId || "",
              isOwn:
                sameId(result.studentId, ownStudentId) ||
                sameId(result.studentDocumentId, ownDocumentId) ||
                sameId(result.studentUid, ownStudentId),
            };
          })
          .sort((a, b) => {
            if (a.isOwn) return -1;
            if (b.isOwn) return 1;
            return getScore(b) - getScore(a);
          });

        if (mounted) setResults(list);
      } catch (error) {
        console.error("Load exam results error:", error);
        toast.error("ফলাফল লোড করা যায়নি।");
      } finally {
        if (mounted) setResultLoading(false);
      }
    }

    loadResults();

    return () => {
      mounted = false;
    };
  }, [examId, examType, student, students, classId]);

  const selectedExam = exams.find((exam) => exam.id === examId);

  const myResult = results.find((result) => result.isOwn);

  const totalStudents = results.length;

  const rank =
    myResult && totalStudents
      ? results.findIndex((result) => result.isOwn) + 1
      : null;

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-base-300 bg-base-100 p-8 text-center">
          <h2 className="text-xl font-bold">লগইন প্রয়োজন</h2>
          <p className="mt-2 text-sm text-base-content/60">
            ফলাফল দেখতে শিক্ষার্থী অ্যাকাউন্ট দিয়ে লগইন করুন।
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          পরীক্ষার ফলাফল
        </h1>
        <p className="mt-2 text-sm text-base-content/60">
          {student.name} · {department?.name || student.departmentName} ·{" "}
          {className}
        </p>
      </section>

      <section className="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-2 sm:p-5">
        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">পরীক্ষার ধরন</span>
          <select
            className="select select-bordered w-full"
            value={examType}
            onChange={(event) => {
              setExamType(event.target.value);
              setExamId("");
            }}
          >
            <option value="">নির্বাচন করুন</option>
            <option value="online">অনলাইন পরীক্ষা</option>
            <option value="offline">অফলাইন পরীক্ষা</option>
          </select>
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">
            পরীক্ষা নির্বাচন
          </span>
          <select
            className="select select-bordered w-full"
            value={examId}
            disabled={!examType || exams.length === 0}
            onChange={(event) => setExamId(event.target.value)}
          >
            <option value="">
              {!examType
                ? "আগে পরীক্ষার ধরন নির্বাচন করুন"
                : exams.length
                  ? "পরীক্ষা নির্বাচন করুন"
                  : "কোনো পরীক্ষা পাওয়া যায়নি"}
            </option>

            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.title ||
                  exam.examName ||
                  exam.name ||
                  exam.examType ||
                  "পরীক্ষা"}
                {exam.examDate ? ` — ${exam.examDate}` : ""}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedExam && (
        <motion.section
          key={examId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-sm font-medium text-primary">
              {examType === "online" ? "অনলাইন পরীক্ষা" : "অফলাইন পরীক্ষা"}
            </p>
            <h2 className="mt-1 text-xl font-bold">
              {selectedExam.title ||
                selectedExam.examName ||
                selectedExam.name ||
                selectedExam.examType}
            </h2>

            {selectedExam.examDate && (
              <p className="mt-2 text-sm text-base-content/60">
                পরীক্ষার তারিখ: {selectedExam.examDate}
              </p>
            )}
          </div>

          {resultLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm text-base-content/60">প্রাপ্ত নম্বর</p>
                  <p className="mt-1 text-2xl font-extrabold text-primary">
                    {myResult
                      ? `${getScore(myResult)} / ${getTotal(myResult) || "—"}`
                      : "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm text-base-content/60">শতকরা নম্বর</p>
                  <p className="mt-1 text-2xl font-extrabold">
                    {myResult
                      ? getPercentage(getScore(myResult), getTotal(myResult))
                      : "—"}
                  </p>
                </div>

                <div className="col-span-2 rounded-2xl border border-base-300 bg-base-100 p-4 sm:col-span-1">
                  <p className="text-sm text-base-content/60">অবস্থান</p>
                  <p className="mt-1 text-2xl font-extrabold">
                    {rank ? `${rank} / ${totalStudents}` : "—"}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 p-4">
                  <h3 className="font-bold">ফলাফলের তালিকা</h3>
                  <span className="badge badge-primary badge-outline">
                    {results.length} জনের ফলাফল
                  </span>
                </div>

                {results.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="font-semibold">ফলাফল পাওয়া যায়নি</p>
                    <p className="mt-2 text-sm text-base-content/60">
                      এই পরীক্ষার নম্বর এখনো প্রকাশ করা হয়নি অথবা কোনো ফলাফল জমা
                      হয়নি।
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra">
                      <thead>
                        <tr>
                          <th>অবস্থান</th>
                          <th>শিক্ষার্থী</th>
                          <th>আইডি</th>
                          <th>প্রাপ্ত নম্বর</th>
                          <th>শতকরা</th>
                        </tr>
                      </thead>

                      <tbody>
                        {results.map((result, index) => (
                          <tr
                            key={result.id}
                            className={result.isOwn ? "font-semibold" : ""}
                          >
                            <td>
                              <span
                                className={`badge ${
                                  result.isOwn ? "badge-primary" : "badge-ghost"
                                }`}
                              >
                                {index + 1}
                              </span>
                            </td>

                            <td>
                              <div className="flex items-center gap-2">
                                {result.isOwn && (
                                  <span className="h-2 w-2 rounded-full bg-primary" />
                                )}
                                {getStudentName(result)}
                                {result.isOwn && (
                                  <span className="text-xs text-primary">
                                    (তুমি)
                                  </span>
                                )}
                              </div>
                            </td>

                            <td>{result.studentId || "—"}</td>

                            <td>
                              <span className="font-bold">
                                {getScore(result)}
                              </span>
                              <span className="text-base-content/50">
                                {" "}
                                / {getTotal(result) || "—"}
                              </span>
                            </td>

                            <td>
                              {getPercentage(
                                getScore(result),
                                getTotal(result),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.section>
      )}

      {!selectedExam && (
        <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 px-5 py-12 text-center">
          <h2 className="mt-3 font-bold">ফলাফল দেখতে পরীক্ষা নির্বাচন করুন</h2>
          <p className="mt-2 text-sm text-base-content/60">
            পরীক্ষার ধরন ও পরীক্ষার নাম নির্বাচন করলে তোমার এবং সহপাঠীদের ফলাফল
            এখানে দেখা যাবে।
          </p>
        </div>
      )}
    </main>
  );
}
