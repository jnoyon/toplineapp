// src/pages/MonthlyReport.jsx

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../assets/firebase/firebase.init";
import { departmentList } from "../config/departments";
import toast from "react-hot-toast";

export default function MonthlyReport() {
  const [departmentId, setDepartmentId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const department = departmentList.find(
    (d) => Number(d.id) === Number(departmentId),
  );

  const isCare = department?.type === "batch";

  const classes = department?.classes || [];

  useEffect(() => {
    if (!departmentId) {
      setStudents([]);
      return;
    }

    const loadStudents = async () => {
      setLoading(true);

      try {
        const snapshot = await getDocs(collection(db, "students"));

        const filtered = snapshot.docs
          .map((doc) => ({ ...doc.data(), docId: doc.id }))
          .filter(
            (student) =>
              student.approved === true &&
              Number(student.departmentId) === Number(departmentId),
          );

        setStudents(filtered);
      } catch (error) {
        console.error(error);
        toast.error("শিক্ষার্থীদের তথ্য লোড করা যায়নি");
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [departmentId]);

  const filteredStudents = useMemo(() => {
    if (!classId) return [];

    return students
      .filter(
        (student) =>
          String(isCare ? student.batchId : student.classId) ===
          String(classId),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "bn"));
  }, [students, classId, isCare]);

  const selectedStudent = filteredStudents.find(
    (student) => student.studentId === studentId,
  );

  useEffect(() => {
    setClassId("");
    setStudentId("");
    setAttendance([]);
    setResults([]);
  }, [departmentId]);

  useEffect(() => {
    setStudentId("");
    setAttendance([]);
    setResults([]);
  }, [classId]);

  const handlePrint = () => {
    if (!selectedStudent) {
      toast.error("প্রথমে একজন শিক্ষার্থী নির্বাচন করুন");
      return;
    }

    window.print();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <h1 className="text-2xl font-bold">মাসিক শিক্ষার্থী রিপোর্ট</h1>

      <div className="grid gap-4 rounded-xl border bg-base-100 p-4 sm:grid-cols-3 print:hidden">
        <label className="form-control">
          <span className="label-text mb-2">ডিপার্টমেন্ট</span>
          <select
            className="select select-bordered"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">নির্বাচন করুন</option>
            {departmentList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-2">{isCare ? "ব্যাচ" : "শ্রেণি"}</span>
          <select
            className="select select-bordered"
            value={classId}
            disabled={!departmentId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">নির্বাচন করুন</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-2">শিক্ষার্থী</span>
          <select
            className="select select-bordered"
            value={studentId}
            disabled={!classId || loading}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">
              {loading ? "লোড হচ্ছে..." : "শিক্ষার্থী নির্বাচন করুন"}
            </option>
            {filteredStudents.map((student) => (
              <option key={student.docId} value={student.studentId}>
                {student.name} ({student.studentId})
              </option>
            ))}
          </select>
          {classId && !loading && filteredStudents.length === 0 && (
            <span className="mt-1 text-sm text-error">
              এই শ্রেণি/ব্যাচে অনুমোদিত শিক্ষার্থী পাওয়া যায়নি।
            </span>
          )}
        </label>

        <button
          className="btn btn-primary sm:col-span-3"
          disabled={!selectedStudent}
          onClick={handlePrint}
        >
          রিপোর্ট প্রিন্ট করুন
        </button>
      </div>

      {selectedStudent && (
        <article className="report-page border border-base-300 bg-white p-6 text-black sm:p-10">
          <header className="mb-6 border-b-2 border-black pb-4 text-center">
            <h2 className="text-2xl font-bold">টপলাইন</h2>
            <p>{department?.name}</p>
            <h3 className="mt-2 text-lg font-bold">মাসিক শিক্ষার্থী রিপোর্ট</h3>
          </header>

          <section className="grid grid-cols-2 gap-3 text-sm">
            <p>
              <b>নাম:</b> {selectedStudent.name}
            </p>
            <p>
              <b>স্টুডেন্ট আইডি:</b> {selectedStudent.studentId}
            </p>
            <p>
              <b>শ্রেণি/ব্যাচ:</b>{" "}
              {isCare ? selectedStudent.batchName : selectedStudent.className}
            </p>
            <p>
              <b>বর্তমান পয়েন্ট:</b> {selectedStudent.currentMark ?? 0}
            </p>
          </section>

          <h3 className="mb-2 mt-7 font-bold">উপস্থিতি</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-black p-2">বিবরণ</th>
                <th className="border border-black p-2">তথ্য</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-2">উপস্থিতি</td>
                <td className="border border-black p-2">—</td>
              </tr>
            </tbody>
          </table>

          <h3 className="mb-2 mt-7 font-bold">পরীক্ষার ফলাফল</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {[
                  "পরীক্ষার নাম",
                  "তারিখ",
                  "পূর্ণমান",
                  "প্রাপ্ত নম্বর",
                  "সর্বোচ্চ নম্বর",
                ].map((heading) => (
                  <th key={heading} className="border border-black p-2">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="border border-black p-3 text-center">
                  ফলাফলের তথ্য সংযুক্ত করা হয়নি
                </td>
              </tr>
            </tbody>
          </table>

          <footer className="mt-20 flex justify-end">
            <div className="w-48 border-t border-black pt-2 text-center text-sm">
              কর্তৃপক্ষ
              <br />
              টপলাইন কেয়ার
            </div>
          </footer>
        </article>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          body * { visibility: hidden; }
          .report-page, .report-page * { visibility: visible; }
          .report-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            border: none;
            font-size: 11pt;
          }
        }
      `}</style>
    </div>
  );
}
