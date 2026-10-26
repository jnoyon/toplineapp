import { FiPlus, FiTrash2, FiCheckCircle } from "react-icons/fi";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#E74C3C] focus:ring-2 focus:ring-[#E74C3C]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export default function OnlineExamQuestions({ questions, setQuestions }) {
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#2C3E50] dark:text-white">
            পরীক্ষার প্রশ্ন
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            প্রশ্ন, চারটি অপশন এবং সঠিক উত্তর নির্ধারণ করুন।
          </p>
        </div>

        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {questions.length}টি প্রশ্ন
        </span>
      </div>

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
