import { useState } from "react";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";

export default function GrammarTopic({ data }) {
  const [activeRule, setActiveRule] = useState(0);

  if (!data) return null;

  const rules = data.rules || [];

  const handleNext = () => {
    setActiveRule((prev) => Math.min(prev + 1, rules.length - 1));
  };

  const handlePrevious = () => {
    setActiveRule((prev) => Math.max(prev - 1, 0));
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 pb-8">
      {/* Topic Header */}
      <header className="rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-5">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          {data.title}
        </h1>

        {data.description && (
          <p className="mt-2 text-sm leading-6 text-base-content/65">
            {data.description}
          </p>
        )}
      </header>

      {/* Rules */}
      {rules.length > 0 && (
        <section className="space-y-2">
          {rules.map((rule, index) => {
            const isActive = activeRule === index;

            return (
              <article
                key={rule.id || index}
                className={`overflow-hidden rounded-xl border transition-colors duration-200 ${
                  isActive
                    ? "border-primary/40 bg-base-100"
                    : "border-base-300 bg-base-100"
                }`}
              >
                {/* Rule Heading */}
                <button
                  type="button"
                  onClick={() => setActiveRule(isActive ? -1 : index)}
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-left sm:px-4"
                  aria-expanded={isActive}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                      isActive
                        ? "bg-primary text-primary-content"
                        : "bg-base-200 text-base-content/60"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="min-w-0 flex-1 text-sm font-bold">
                    {rule.title}
                  </span>

                  <FiChevronDown
                    size={18}
                    className={`shrink-0 text-base-content/50 transition-transform duration-200 ${
                      isActive ? "rotate-180 text-primary" : ""
                    }`}
                  />
                </button>

                {/* Rule Content */}
                {isActive && (
                  <div className="space-y-4 border-t border-base-300 p-3 sm:p-4">
                    {/* Description */}
                    {rule.description && (
                      <p className="text-sm leading-7 text-base-content/70">
                        {rule.description}
                      </p>
                    )}

                    {/* Formula */}
                    {rule.formula && (
                      <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary/60">
                          Formula
                        </p>

                        <p className="break-words text-sm font-extrabold leading-6 text-primary">
                          {rule.formula}
                        </p>
                      </div>
                    )}

                    {/* Examples */}
                    {rule.examples?.length > 0 && (
                      <div className="space-y-2">
                        {rule.examples.map((example, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-base-300 bg-base-200/40 p-3"
                          >
                            <p className="text-sm font-bold leading-6">
                              <span className="mr-2 text-xs font-bold text-primary">
                                {i + 1}.
                              </span>
                              {example.sentence}
                            </p>

                            {example.meaning && (
                              <p className="mt-2 border-t border-base-300/70 pt-2 text-xs leading-6 text-base-content/65">
                                {example.meaning}
                              </p>
                            )}

                            {example.explanation && (
                              <p className="mt-2 text-xs leading-6 text-primary/80">
                                {example.explanation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Navigation */}
                    {rules.length > 1 && (
                      <div className="flex items-center justify-between border-t border-base-300 pt-3">
                        <button
                          type="button"
                          onClick={handlePrevious}
                          disabled={index === 0}
                          className="flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-base-content/60 transition hover:bg-base-200 disabled:opacity-30"
                        >
                          <FiChevronLeft size={16} />
                          Previous
                        </button>

                        <span className="text-xs font-semibold text-base-content/45">
                          {index + 1} / {rules.length}
                        </span>

                        <button
                          type="button"
                          onClick={handleNext}
                          disabled={index === rules.length - 1}
                          className="flex min-h-10 items-center gap-1 rounded-lg bg-primary/10 px-3 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-30"
                        >
                          Next
                          <FiChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
