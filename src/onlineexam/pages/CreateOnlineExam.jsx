import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import toast from "react-hot-toast";

import { auth, db } from "../../assets/firebase/firebase.init";
import OnlineExamQuestions from "../components/OnlineExamQuestions";
import { departmentList } from "../../config/departments";

const SUBJECTS = {
  ICT: "তথ্য ও যোগাযোগ প্রযুক্তি",
  BANGLA: "বাংলা",
  ENGLISH: "ইংরেজি",
  MATHEMATICS: "গণিত",
  SCIENCE: "বিজ্ঞান",
};

/**
 * Firestore Timestamp, JavaScript Date অথবা date string
 * থেকে JavaScript Date তৈরি করে।
 */
const toDate = (value) => {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * পরীক্ষার সময়সূচি অনুযায়ী পরীক্ষা বর্তমানে চালু কি না।
 *
 * status false হলে পরীক্ষা বন্ধ থাকবে।
 * startTime থেকে পরীক্ষা চালু হবে।
 * finishTime-এ পৌঁছালে পরীক্ষা বন্ধ হবে।
 *
 * এই ফাংশন ManageOnlineExams এবং পরীক্ষায় প্রবেশের
 * পেজেও ব্যবহার করতে হবে।
 */
export const isExamAvailableNow = (exam, now = new Date()) => {
  if (!exam || exam.status === false) {
    return false;
  }

  const start = toDate(exam.startTime);
  const finish = toDate(exam.finishTime);

  if (!start || !finish) {
    return false;
  }

  return now >= start && now < finish;
};

const CreateOnlineExam = () => {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [syllabus, setSyllabus] = useState("");

  // বিভাগ
  const [departmentId, setDepartmentId] = useState("");

  // নির্বাচিত শ্রেণি বা ব্যাচের ID
  const [selectedClasses, setSelectedClasses] = useState([]);

  // পরীক্ষার সময়
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [durationSeconds, setDurationSeconds] = useState(0);

  // পরীক্ষা শুরু ও শেষ হওয়ার তারিখ-সময়
  const [startTime, setStartTime] = useState("");
  const [finishTime, setFinishTime] = useState("");

  // Admin চাইলে পরীক্ষাটি সম্পূর্ণ বন্ধ রাখতে পারবেন।
  // চালু থাকলেও নির্ধারিত সময়ের বাইরে পরীক্ষা দেওয়া যাবে না।
  const [status, setStatus] = useState(true);

  const [requestedCount, setRequestedCount] = useState(10);
  const [questions, setQuestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // নির্বাচিত বিভাগের সম্পূর্ণ তথ্য
  const selectedDepartment =
    departmentList.find(
      (department) => String(department.id) === String(departmentId),
    ) || null;

  // নির্বাচিত বিভাগের শ্রেণি বা ব্যাচ
  const availableClasses = selectedDepartment?.classes || [];

  const handleDepartmentChange = (event) => {
    setDepartmentId(event.target.value);

    // বিভাগ পরিবর্তন হলে আগের বিভাগের শ্রেণি/ব্যাচ বাদ যাবে।
    setSelectedClasses([]);
  };

  const handleClassChange = (classId) => {
    setSelectedClasses((previous) =>
      previous.includes(classId)
        ? previous.filter((id) => id !== classId)
        : [...previous, classId],
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const currentUser = auth.currentUser;

    if (!currentUser) {
      toast.error("পরীক্ষা তৈরি করতে প্রথমে লগইন করুন।");
      return;
    }

    if (!title.trim()) {
      toast.error("পরীক্ষার নাম লিখুন।");
      return;
    }

    if (!subject || !SUBJECTS[subject]) {
      toast.error("একটি বিষয় নির্বাচন করুন।");
      return;
    }

    if (!selectedDepartment) {
      toast.error("একটি বিভাগ নির্বাচন করুন।");
      return;
    }

    if (selectedClasses.length === 0) {
      toast.error("অন্তত একটি শ্রেণি বা ব্যাচ নির্বাচন করুন।");
      return;
    }

    if (
      !Number.isInteger(Number(durationMinutes)) ||
      Number(durationMinutes) < 0
    ) {
      toast.error("পরীক্ষার সময় সঠিকভাবে দিন।");
      return;
    }

    if (
      !Number.isInteger(Number(durationSeconds)) ||
      Number(durationSeconds) < 0 ||
      Number(durationSeconds) > 59
    ) {
      toast.error("সেকেন্ড ০ থেকে ৫৯-এর মধ্যে হতে হবে।");
      return;
    }

    if (Number(durationMinutes) === 0 && Number(durationSeconds) === 0) {
      toast.error("পরীক্ষার সময় শূন্য হতে পারবে না।");
      return;
    }

    if (
      !Number.isInteger(Number(requestedCount)) ||
      Number(requestedCount) < 1
    ) {
      toast.error("নির্ধারিত প্রশ্নসংখ্যা অন্তত ১ হতে হবে।");
      return;
    }

    if (questions.length === 0) {
      toast.error("অন্তত একটি প্রশ্ন তৈরি করুন।");
      return;
    }

    // স্বয়ংক্রিয় সময়সূচির জন্য শুরুর ও শেষের সময় আবশ্যক।
    if (!startTime || !finishTime) {
      toast.error("পরীক্ষার শুরুর ও শেষের তারিখ-সময় নির্ধারণ করুন।");
      return;
    }

    const startDate = new Date(startTime);
    const finishDate = new Date(finishTime);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(finishDate.getTime())
    ) {
      toast.error("পরীক্ষার তারিখ ও সময় সঠিক নয়।");
      return;
    }

    if (finishDate <= startDate) {
      toast.error("পরীক্ষা শেষ হওয়ার সময় শুরুর সময়ের পরে হতে হবে।");
      return;
    }

    const invalidQuestion = questions.some((question) => {
      const questionText = question.question?.trim();
      const options = question.options;

      return (
        !questionText ||
        !Array.isArray(options) ||
        options.length < 2 ||
        options.some((option) => !String(option ?? "").trim()) ||
        !Number.isInteger(Number(question.correctAnswer)) ||
        Number(question.correctAnswer) < 0 ||
        Number(question.correctAnswer) >= options.length
      );
    });

    if (invalidQuestion) {
      toast.error("প্রতিটি প্রশ্নের লেখা, সব অপশন এবং সঠিক উত্তর যাচাই করুন।");
      return;
    }

    setSubmitting(true);

    try {
      // নির্বাচিত শ্রেণি/ব্যাচের ID ও নাম একসঙ্গে সংরক্ষণ।
      const classesToSave = availableClasses
        .filter((item) => selectedClasses.includes(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
        }));

      const examData = {
        title: title.trim(),

        subject,
        subjectName: SUBJECTS[subject],
        syllabus: syllabus.trim(),

        // বিভাগ সংক্রান্ত তথ্য
        departmentId: selectedDepartment.id,
        departmentKey: selectedDepartment.key,
        departmentName: selectedDepartment.name,
        departmentType: selectedDepartment.type,

        // নির্বাচিত শ্রেণি বা ব্যাচ
        selectedClasses,
        classes: classesToSave,

        // পুরোনো পরীক্ষার তালিকার সঙ্গে সামঞ্জস্যের জন্য
        // participants-এ বিভাগের key রাখা হয়েছে।
        participants: [selectedDepartment.key],

        durationMinutes: Number(durationMinutes),
        durationSeconds: Number(durationSeconds),

        startTime: startDate,
        finishTime: finishDate,

        // এটি admin-এর enable/disable নিয়ন্ত্রণ।
        // সময়সূচি অনুযায়ী চালু কি না তা
        // isExamAvailableNow() দিয়ে নির্ধারণ করতে হবে।
        status: Boolean(status),

        questionCount: Number(requestedCount),
        totalQuestions: questions.length,

        questions: questions.map(({ id, ...question }) => ({
          ...question,
          options: [...question.options],
          correctAnswer: Number(question.correctAnswer),
        })),

        requiresPublicDetails: false,

        // পরীক্ষার নির্মাতার Firebase UID
        createdBy: currentUser.uid,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "onlineExams"), examData);

      toast.success("অনলাইন পরীক্ষা সফলভাবে তৈরি হয়েছে!");

      // ফর্ম রিসেট
      setTitle("");
      setSubject("");
      setSyllabus("");
      setDepartmentId("");
      setSelectedClasses([]);

      setDurationMinutes(30);
      setDurationSeconds(0);

      setStartTime("");
      setFinishTime("");

      setStatus(true);
      setRequestedCount(10);
      setQuestions([]);
    } catch (error) {
      console.error("Create online exam error:", error);

      toast.error("পরীক্ষা তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-base-content md:text-3xl">
          অনলাইন পরীক্ষা তৈরি করুন
        </h1>

        <p className="mt-2 text-sm text-base-content/70">
          বিভাগ, শ্রেণি বা ব্যাচ, সময়সূচি এবং প্রশ্ন নির্ধারণ করুন।
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* সাধারণ তথ্য */}
        <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold">পরীক্ষার সাধারণ তথ্য</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="exam-title" className="label">
                <span className="label-text font-medium">পরীক্ষার নাম *</span>
              </label>

              <input
                id="exam-title"
                type="text"
                className="input input-bordered w-full"
                placeholder="যেমন: সংখ্যা পদ্ধতি MCQ পরীক্ষা"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="exam-subject" className="label">
                <span className="label-text font-medium">বিষয় *</span>
              </label>

              <select
                id="exam-subject"
                className="select select-bordered w-full"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
              >
                <option value="">বিষয় নির্বাচন করুন</option>

                {Object.entries(SUBJECTS).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="question-count" className="label">
                <span className="label-text font-medium">
                  নির্ধারিত প্রশ্নসংখ্যা *
                </span>
              </label>

              <input
                id="question-count"
                type="number"
                min="1"
                className="input input-bordered w-full"
                value={requestedCount}
                onChange={(event) => setRequestedCount(event.target.value)}
                required
              />

              <p className="mt-1 text-xs text-base-content/60">
                এখানে নির্ধারিত সংখ্যা এবং যোগ করা প্রশ্নের সংখ্যা আলাদাভাবে
                সংরক্ষণ করা হবে।
              </p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="exam-syllabus" className="label">
                <span className="label-text font-medium">পরীক্ষার সিলেবাস</span>
              </label>

              <textarea
                id="exam-syllabus"
                className="textarea textarea-bordered min-h-24 w-full"
                placeholder="কোন কোন অধ্যায় বা বিষয় থেকে পরীক্ষা হবে?"
                value={syllabus}
                onChange={(event) => setSyllabus(event.target.value)}
              />
            </div>
          </div>
        </section>

        {/* বিভাগ নির্বাচন */}
        <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold">বিভাগ নির্বাচন করুন</h2>

          <label htmlFor="department" className="label">
            <span className="label-text font-medium">বিভাগ *</span>
          </label>

          <select
            id="department"
            className="select select-bordered w-full"
            value={departmentId}
            onChange={handleDepartmentChange}
            required
          >
            <option value="">বিভাগ নির্বাচন করুন</option>

            {departmentList.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>

          {selectedDepartment && (
            <div className="mt-4 rounded-lg bg-base-200 p-4">
              <p className="font-medium">
                নির্বাচিত বিভাগ: {selectedDepartment.name}
              </p>

              <p className="mt-1 text-sm text-base-content/70">
                এখন এই বিভাগের শ্রেণি বা ব্যাচ নির্বাচন করুন।
              </p>
            </div>
          )}
        </section>

        {/* বিভাগ নির্বাচন করার পর শ্রেণি/ব্যাচ দেখাবে */}
        {selectedDepartment && (
          <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm md:p-6">
            <h2 className="mb-2 text-lg font-semibold">
              শ্রেণি / ব্যাচ নির্বাচন করুন *
            </h2>

            <p className="mb-4 text-sm text-base-content/70">
              {selectedDepartment.name} বিভাগের যেসব শ্রেণি বা ব্যাচ পরীক্ষা
              দিতে পারবে, সেগুলো নির্বাচন করুন।
            </p>

            {availableClasses.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {availableClasses.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 transition-colors hover:bg-base-200"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary"
                      checked={selectedClasses.includes(item.id)}
                      onChange={() => handleClassChange(item.id)}
                    />

                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="alert alert-warning">
                এই বিভাগের জন্য কোনো শ্রেণি বা ব্যাচ পাওয়া যায়নি।
              </div>
            )}

            <p className="mt-4 text-sm text-base-content/70">
              নির্বাচিত: {selectedClasses.length}টি
            </p>
          </section>
        )}

        {/* সময় ও সময়সূচি */}
        <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm md:p-6">
          <h2 className="mb-2 text-lg font-semibold">সময় ও সময়সূচি</h2>

          <p className="mb-4 text-sm text-base-content/70">
            নির্ধারিত শুরুর সময় থেকে পরীক্ষা চালু হবে এবং শেষের সময়ে
            স্বয়ংক্রিয়ভাবে বন্ধ বলে গণ্য হবে।
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="duration-minutes" className="label">
                <span className="label-text font-medium">
                  পরীক্ষার সময় (মিনিট) *
                </span>
              </label>

              <input
                id="duration-minutes"
                type="number"
                min="0"
                className="input input-bordered w-full"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="duration-seconds" className="label">
                <span className="label-text font-medium">
                  অতিরিক্ত সময় (সেকেন্ড)
                </span>
              </label>

              <input
                id="duration-seconds"
                type="number"
                min="0"
                max="59"
                className="input input-bordered w-full"
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="start-time" className="label">
                <span className="label-text font-medium">
                  পরীক্ষা শুরুর তারিখ ও সময় *
                </span>
              </label>

              <input
                id="start-time"
                type="datetime-local"
                className="input input-bordered w-full"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="finish-time" className="label">
                <span className="label-text font-medium">
                  পরীক্ষা শেষের তারিখ ও সময় *
                </span>
              </label>

              <input
                id="finish-time"
                type="datetime-local"
                className="input input-bordered w-full"
                value={finishTime}
                onChange={(event) => setFinishTime(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="alert alert-info mt-4 text-sm">
            <span>
              শুরুর সময়ের আগে পরীক্ষা দেওয়া যাবে না। শেষের সময়ের পরেও পরীক্ষা
              দেওয়া যাবে না—তবে পরীক্ষার তালিকা ও পরীক্ষা দেওয়ার পেজে সময়সূচির
              যাচাই যুক্ত থাকতে হবে।
            </span>
          </div>
        </section>

        {/* পরীক্ষা চালু/বন্ধ */}
        <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold">পরীক্ষার নিয়ন্ত্রণ</h2>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-base-300 p-4">
            <div>
              <p className="font-medium">পরীক্ষা চালু রাখুন</p>

              <p className="mt-1 text-sm text-base-content/60">
                বন্ধ করলে নির্ধারিত সময়ের মধ্যেও পরীক্ষা দেওয়া যাবে না।
              </p>
            </div>

            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={status}
              onChange={(event) => setStatus(event.target.checked)}
            />
          </label>
        </section>

        {/* প্রশ্ন */}
        <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm md:p-6">
          <h2 className="mb-2 text-lg font-semibold">পরীক্ষার প্রশ্ন</h2>

          <p className="mb-4 text-sm text-base-content/70">
            প্রশ্ন যোগ করুন এবং প্রতিটি প্রশ্নের সঠিক উত্তর নির্বাচন করুন।
          </p>

          <OnlineExamQuestions
            questions={questions}
            setQuestions={setQuestions}
          />

          <div className="mt-4 rounded-lg bg-base-200 p-3 text-sm">
            যোগ করা প্রশ্ন: <strong>{questions.length}</strong>
          </div>
        </section>

        {/* তৈরি করুন */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary w-full sm:w-auto"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                পরীক্ষা তৈরি হচ্ছে...
              </>
            ) : (
              "পরীক্ষা তৈরি করুন"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateOnlineExam;
