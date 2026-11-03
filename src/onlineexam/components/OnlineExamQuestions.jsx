import { useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  FiPlus,
  FiTrash2,
  FiCheckCircle,
  FiUploadCloud,
  FiDownload,
  FiAlertCircle,
} from "react-icons/fi";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#E74C3C] focus:ring-2 focus:ring-[#E74C3C]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

// ডাউনলোডযোগ্য নমুনা ফাইল
const SAMPLE_JSON = [
  {
    question: "বাংলাদেশের রাজধানী কোনটি?",
    options: ["ঢাকা", "চট্টগ্রাম", "খুলনা", "রাজশাহী"],
    correctAnswer: 0,
    explanation: "ঢাকা বাংলাদেশের রাজধানী।",
  },
  {
    question: "২ + ২ = কত?",
    options: ["৩", "৪", "৫", "৬"],
    correctAnswer: "B",
    explanation: "",
  },
];

/**
 * JSON থেকে প্রশ্ন যাচাই ও রূপান্তর।
 *
 * গ্রহণযোগ্য কাঠামো:
 *   [ {...}, {...} ]            অথবা
 *   { "questions": [ {...} ] }
 *
 * correctAnswer হতে পারে:
 *   - ০ থেকে শুরু করা সংখ্যা (0 = প্রথম অপশন)
 *   - অক্ষর: "A", "B", "C" ...
 *   - সঠিক অপশনের হুবহু লেখা
 * (`answer` নামেও গ্রহণ করা হয়)
 */
function parseQuestions(raw) {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.questions)
      ? raw.questions
      : null;

  if (!list) {
    return {
      questions: [],
      errors: [
        'ফাইলটি প্রশ্নের একটি তালিকা (array) অথবা { "questions": [...] } আকারে হতে হবে।',
      ],
    };
  }

  if (list.length === 0) {
    return { questions: [], errors: ["ফাইলে কোনো প্রশ্ন পাওয়া যায়নি।"] };
  }

  const questions = [];
  const errors = [];

  list.forEach((item, i) => {
    const n = i + 1;
    const problems = [];

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`প্রশ্ন ${n}: সঠিক অবজেক্ট নয়।`);
      return;
    }

    const text = String(item.question ?? "").trim();
    if (!text) problems.push("প্রশ্নের লেখা নেই");

    const rawOptions = item.options;
    let options = [];

    if (!Array.isArray(rawOptions)) {
      problems.push("options একটি তালিকা হতে হবে");
    } else {
      options = rawOptions.map((option) => String(option ?? "").trim());

      if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
        problems.push(
          `অপশন ${MIN_OPTIONS} থেকে ${MAX_OPTIONS}টির মধ্যে হতে হবে (পাওয়া গেছে ${options.length}টি)`,
        );
      } else if (options.some((option) => !option)) {
        problems.push("কোনো অপশন ফাঁকা");
      }
    }

    // সঠিক উত্তরের index নির্ণয়
    let correctIndex = -1;
    const answer = item.correctAnswer ?? item.answer;

    if (options.length >= MIN_OPTIONS) {
      if (typeof answer === "number" && Number.isInteger(answer)) {
        correctIndex = answer;
      } else if (typeof answer === "string" && answer.trim()) {
        const value = answer.trim();

        if (/^[A-Fa-f]$/.test(value)) {
          correctIndex = value.toUpperCase().charCodeAt(0) - 65;
        } else if (/^\d+$/.test(value)) {
          correctIndex = Number(value);
        } else {
          correctIndex = options.findIndex(
            (option) => option.toLowerCase() === value.toLowerCase(),
          );
        }
      }

      if (correctIndex < 0 || correctIndex >= options.length) {
        problems.push(
          "correctAnswer সঠিক নয় (০ থেকে শুরু করা সংখ্যা, A/B/C/D অথবা অপশনের হুবহু লেখা দিন)",
        );
      }
    }

    if (problems.length > 0) {
      errors.push(`প্রশ্ন ${n}: ${problems.join("; ")}।`);
      return;
    }

    questions.push({
      id: crypto.randomUUID(),
      question: text,
      options,
      correctAnswer: correctIndex,
      explanation: String(item.explanation ?? "").trim(),
    });
  });

  return { questions, errors };
}

export default function OnlineExamQuestions({ questions, setQuestions }) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadedFileName, setUploadedFileName] = useState("");

  function addQuestion() {
    setQuestions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        question: "",
        options: ["", "", "", ""],
        correctAnswer: 0,
        explanation: "",
      },
    ]);
  }

  function updateQuestion(id, field, value) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === id ? { ...question, [field]: value } : question,
      ),
    );
  }

  function updateOption(id, index, value) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === id
          ? {
              ...question,
              options: question.options.map((option, optionIndex) =>
                optionIndex === index ? value : option,
              ),
            }
          : question,
      ),
    );
  }

  function removeQuestion(id) {
    setQuestions((current) => current.filter((question) => question.id !== id));
  }

  function clearAllQuestions() {
    if (!window.confirm("সব প্রশ্ন মুছে ফেলতে চান?")) return;

    setQuestions([]);
    setUploadErrors([]);
    setUploadedFileName("");
  }

  async function handleFile(file) {
    if (!file) return;

    setUploadErrors([]);

    if (!file.name.toLowerCase().endsWith(".json")) {
      setUploadErrors(["শুধু .json ফাইল আপলোড করা যাবে।"]);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadErrors(["ফাইলের আকার সর্বোচ্চ ২ MB হতে পারবে।"]);
      return;
    }

    let raw;

    try {
      raw = JSON.parse(await file.text());
    } catch {
      setUploadErrors([
        "JSON ফাইলটি পড়া যায়নি। কমা, ব্র্যাকেট ও উদ্ধৃতি চিহ্ন ঠিক আছে কি না দেখুন।",
      ]);
      return;
    }

    const { questions: parsed, errors } = parseQuestions(raw);

    // একটি প্রশ্নেও ভুল থাকলে কিছুই যোগ হবে না,
    // যাতে অসম্পূর্ণ প্রশ্নসেট তৈরি না হয়।
    if (errors.length > 0) {
      setUploadErrors(errors);
      toast.error("ফাইলে ভুল পাওয়া গেছে। ভুলগুলো ঠিক করে আবার আপলোড করুন।");
      return;
    }

    setQuestions((current) => [...current, ...parsed]);
    setUploadedFileName(file.name);
    toast.success(
      `${parsed.length}টি প্রশ্ন যোগ হয়েছে। এখন সম্পাদনা করতে পারবেন।`,
    );
  }

  function handleInputChange(event) {
    handleFile(event.target.files?.[0]);

    // একই ফাইল আবার বেছে নেওয়ার সুযোগ রাখতে
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  function downloadSample() {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "questions-sample.json";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#2C3E50] dark:text-white">
            পরীক্ষার প্রশ্ন
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            JSON ফাইল থেকে প্রশ্ন আপলোড করুন, অথবা নিজে একটি একটি করে যোগ করুন।
          </p>
        </div>

        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {questions.length}টি প্রশ্ন
        </span>
      </div>

      {/* JSON আপলোড */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`mb-5 rounded-xl border-2 border-dashed p-5 text-center transition ${
          dragging
            ? "border-[#E74C3C] bg-red-50/60 dark:bg-slate-800"
            : "border-slate-300 dark:border-slate-700"
        }`}
      >
        <FiUploadCloud
          className="mx-auto text-slate-400"
          size={30}
          aria-hidden="true"
        />

        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          JSON ফাইল এখানে ছেড়ে দিন
        </p>

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          অথবা নিচের বোতাম দিয়ে ফাইল বেছে নিন (সর্বোচ্চ ২ MB)
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E74C3C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d54232]"
          >
            <FiUploadCloud size={16} />
            JSON ফাইল আপলোড করুন
          </button>

          <button
            type="button"
            onClick={downloadSample}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FiDownload size={16} />
            নমুনা ফাইল নামান
          </button>
        </div>

        {uploadedFileName && uploadErrors.length === 0 && (
          <p className="mt-3 text-xs text-emerald-600">
            সর্বশেষ আপলোড: {uploadedFileName}
          </p>
        )}
      </div>

      {uploadErrors.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <FiAlertCircle size={16} />
            আপলোড করা যায়নি — কোনো প্রশ্ন যোগ হয়নি
          </p>

          <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-red-700 dark:text-red-400">
            {uploadErrors.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {questions.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={clearAllQuestions}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <FiTrash2 size={15} />
            সব প্রশ্ন মুছুন
          </button>
        </div>
      )}

      <div className="space-y-5">
        {questions.map((question, index) => (
          <article
            key={question.id}
            className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-bold text-slate-700 dark:text-slate-200">
                প্রশ্ন {index + 1}
              </h3>

              <button
                type="button"
                onClick={() => removeQuestion(question.id)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <FiTrash2 size={15} />
                মুছুন
              </button>
            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              প্রশ্নের বিবরণ
            </label>

            <textarea
              rows={3}
              value={question.question}
              onChange={(event) =>
                updateQuestion(question.id, "question", event.target.value)
              }
              placeholder="প্রশ্ন লিখুন..."
              className={inputClass}
            />

            <div className="mt-4">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                অপশনগুলো
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <div
                    key={optionIndex}
                    className={`flex items-center gap-2 rounded-xl border p-2 ${
                      question.correctAnswer === optionIndex
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      checked={question.correctAnswer === optionIndex}
                      onChange={() =>
                        updateQuestion(
                          question.id,
                          "correctAnswer",
                          optionIndex,
                        )
                      }
                      aria-label={`অপশন ${optionIndex + 1} সঠিক উত্তর হিসেবে নির্বাচন করুন`}
                      className="radio radio-success radio-sm shrink-0"
                    />

                    <input
                      type="text"
                      value={option}
                      onChange={(event) =>
                        updateOption(
                          question.id,
                          optionIndex,
                          event.target.value,
                        )
                      }
                      placeholder={`অপশন ${optionIndex + 1}`}
                      className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-slate-800 outline-none dark:text-white"
                    />

                    {question.correctAnswer === optionIndex && (
                      <FiCheckCircle
                        className="shrink-0 text-emerald-600"
                        size={17}
                      />
                    )}
                  </div>
                ))}
              </div>

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                প্রতিটি প্রশ্নের একটি সঠিক উত্তর নির্বাচন করুন।
              </p>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                ব্যাখ্যা (ঐচ্ছিক)
              </label>

              <textarea
                rows={2}
                value={question.explanation}
                onChange={(event) =>
                  updateQuestion(question.id, "explanation", event.target.value)
                }
                placeholder="উত্তরের ব্যাখ্যা লিখুন..."
                className={inputClass}
              />
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 font-semibold text-[#2C3E50] transition hover:border-[#E74C3C] hover:bg-red-50/50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800 sm:w-auto"
      >
        <FiPlus size={18} />
        নতুন প্রশ্ন যোগ করুন
      </button>
    </section>
  );
}
