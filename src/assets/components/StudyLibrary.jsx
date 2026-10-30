import { useEffect, useMemo, useState } from "react";

import {
  MdAutoStories,
  MdCheckCircle,
  MdRadioButtonUnchecked,
  MdSearch,
  MdExpandMore,
  MdExpandLess,
  MdRestartAlt,
  MdSchool,
  MdArrowBack,
  MdArrowForward,
  MdClose,
  MdLightbulb,
  MdMenuBook,
} from "react-icons/md";

/* =========================================================
   Constants
========================================================= */

const DEFAULT_STORAGE_KEY = "topline-study-library";
const ITEMS_PER_PAGE = 12;

const DIFFICULTIES = [
  { value: "all", label: "সব লেভেল" },
  { value: "easy", label: "সহজ" },
  { value: "medium", label: "মাঝারি" },
  { value: "hard", label: "কঠিন" },
];

const DIFFICULTY_LABELS = {
  easy: "সহজ",
  medium: "মাঝারি",
  hard: "কঠিন",
};

const DIFFICULTY_STYLES = {
  easy: "border-success/20 bg-success/10 text-success",
  medium: "border-warning/20 bg-warning/10 text-warning",
  hard: "border-error/20 bg-error/10 text-error",
};

/* =========================================================
   LocalStorage Helpers
========================================================= */

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);

    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("StudyLibrary: LocalStorage save failed", error);
  }
}

/* =========================================================
   Data Normalization
========================================================= */

function normalizeDifficulty(value) {
  const normalized = String(value ?? "medium")
    .trim()
    .toLowerCase();

  const aliases = {
    easy: "easy",
    সহজ: "easy",

    medium: "medium",
    moderate: "medium",
    মাঝারি: "medium",

    hard: "hard",
    difficult: "hard",
    কঠিন: "hard",
  };

  return aliases[normalized] || "medium";
}

function normalizeItem(item, index) {
  const word = String(
    item.word ??
      item.english ??
      item.title ??
      item.question ??
      `Item ${index + 1}`,
  );

  const meaning =
    item.meaning ?? item.bangla ?? item.translation ?? item.banglaMeaning ?? "";

  const examples = Array.isArray(item.examples)
    ? item.examples
    : item.example
      ? [item.example]
      : [];

  const synonyms = Array.isArray(item.synonyms)
    ? item.synonyms
    : item.synonyms
      ? [item.synonyms]
      : [];

  const antonyms = Array.isArray(item.antonyms)
    ? item.antonyms
    : item.antonyms
      ? [item.antonyms]
      : [];

  return {
    ...item,

    id: String(item.id ?? `item-${index + 1}`),

    word,
    meaning,

    definition: item.definition ?? item.description ?? "",
    rule: item.rule ?? "",
    details: item.details ?? "",

    difficulty: normalizeDifficulty(item.difficulty),

    examples,
    synonyms,
    antonyms,

    forms: item.forms ?? null,
  };
}

/* =========================================================
   Search Helper
========================================================= */

function getSearchableText(item) {
  return JSON.stringify(item).toLowerCase();
}

/* =========================================================
   Reusable Detail Section
========================================================= */

function DetailSection({ title, children }) {
  if (
    children == null ||
    children === "" ||
    (Array.isArray(children) && children.length === 0)
  ) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/50">
        {title}
      </h4>

      {children}
    </section>
  );
}

/* =========================================================
   Example Renderer
========================================================= */

function ExampleCard({ example }) {
  if (typeof example === "string") {
    return (
      <div className="rounded-xl border border-base-300/70 bg-base-200/60 p-3">
        <p className="text-sm leading-6">{example}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-base-300/70 bg-base-200/60 p-3">
      {example.english && (
        <p className="text-sm font-semibold leading-6">{example.english}</p>
      )}

      {example.bangla && (
        <p className="mt-1 text-sm leading-6 text-base-content/60">
          {example.bangla}
        </p>
      )}

      {example.note && (
        <p className="mt-2 border-t border-base-300 pt-2 text-xs leading-5 text-base-content/50">
          {example.note}
        </p>
      )}
    </div>
  );
}

/* =========================================================
   Main Component
========================================================= */

export default function StudyLibrary({
  data = [],
  title = "শব্দার্থ",
  subtitle = "নতুন কিছু শিখুন, নিয়মিত রিভিশন দিন।",
  storageKey = DEFAULT_STORAGE_KEY,
}) {
  const progressKey = `${storageKey}:completed`;
  const preferencesKey = `${storageKey}:preferences`;

  /* -------------------------------------------------------
     Initial persisted state
  ------------------------------------------------------- */

  const [completedIds, setCompletedIds] = useState(() => {
    const saved = readStorage(progressKey, []);

    return Array.isArray(saved) ? saved.map(String) : [];
  });

  const [preferences, setPreferences] = useState(() => {
    const saved = readStorage(preferencesKey, {});

    return {
      activeTab: saved.activeTab === "learned" ? "learned" : "learn",
      search: typeof saved.search === "string" ? saved.search : "",
      difficulty: DIFFICULTIES.some((item) => item.value === saved.difficulty)
        ? saved.difficulty
        : "all",
    };
  });

  const [expandedIds, setExpandedIds] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { activeTab, search, difficulty } = preferences;

  /* -------------------------------------------------------
     Update preference helper
  ------------------------------------------------------- */

  function updatePreference(key, value) {
    setPreferences((previous) => ({
      ...previous,
      [key]: value,
    }));

    setCurrentPage(1);
  }

  /* -------------------------------------------------------
     Persist state
  ------------------------------------------------------- */

  useEffect(() => {
    writeStorage(progressKey, completedIds);
  }, [progressKey, completedIds]);

  useEffect(() => {
    writeStorage(preferencesKey, preferences);
  }, [preferencesKey, preferences]);

  /* -------------------------------------------------------
     Normalize incoming JSON
  ------------------------------------------------------- */

  const items = useMemo(() => {
    if (!Array.isArray(data)) return [];

    return data.map(normalizeItem);
  }, [data]);

  const completedSet = useMemo(() => new Set(completedIds), [completedIds]);

  /* -------------------------------------------------------
     Progress statistics
  ------------------------------------------------------- */

  const totalCount = items.length;

  const learnedCount = useMemo(
    () => items.filter((item) => completedSet.has(item.id)).length,
    [items, completedSet],
  );

  const remainingCount = totalCount - learnedCount;

  const progressPercentage =
    totalCount > 0 ? Math.round((learnedCount / totalCount) * 100) : 0;

  /* -------------------------------------------------------
     Search and difficulty filter
  ------------------------------------------------------- */

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const completed = completedSet.has(item.id);

      if (activeTab === "learn" && completed) {
        return false;
      }

      if (activeTab === "learned" && !completed) {
        return false;
      }

      if (difficulty !== "all" && item.difficulty !== difficulty) {
        return false;
      }

      if (search.trim()) {
        const searchableText = getSearchableText(item);

        if (!searchableText.includes(search.trim().toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [items, completedSet, activeTab, difficulty, search]);

  /* -------------------------------------------------------
     Pagination
  ------------------------------------------------------- */

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

  const safeCurrentPage = Math.min(currentPage, Math.max(totalPages, 1));

  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;

  const paginatedItems = filteredItems.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  /* -------------------------------------------------------
     Actions
  ------------------------------------------------------- */

  function toggleCompleted(id) {
    setCompletedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((itemId) => itemId !== id);
      }

      return [...previous, id];
    });

    setExpandedIds((previous) => previous.filter((itemId) => itemId !== id));
  }

  function toggleExpanded(id) {
    setExpandedIds((previous) =>
      previous.includes(id)
        ? previous.filter((itemId) => itemId !== id)
        : [...previous, id],
    );
  }

  function resetFilters() {
    setPreferences((previous) => ({
      ...previous,
      search: "",
      difficulty: "all",
    }));

    setCurrentPage(1);
  }

  function resetProgress() {
    const confirmed = window.confirm("এই বিষয়ের শেখার অগ্রগতি মুছে ফেলতে চান?");

    if (!confirmed) return;

    setCompletedIds([]);
    setExpandedIds([]);
    setCurrentPage(1);

    setPreferences((previous) => ({
      ...previous,
      activeTab: "learn",
    }));
  }

  function goToPage(page) {
    const nextPage = Math.max(1, Math.min(page, totalPages));

    setCurrentPage(nextPage);

    document.getElementById("study-library-results")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  /* -------------------------------------------------------
     Pagination numbers
  ------------------------------------------------------- */

  const visiblePages = useMemo(() => {
    const pages = [];
    const maxVisible = 5;

    let start = Math.max(1, safeCurrentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);

    start = Math.max(1, end - maxVisible + 1);

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [safeCurrentPage, totalPages]);

  /* =======================================================
     Render
  ======================================================= */

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 pb-10 sm:px-6 sm:py-6">
      {/* =================================================
          Premium Header
      ================================================= */}

      <section className="relative isolate overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

        <div className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-52 w-52 rounded-full bg-secondary/10 blur-3xl" />

        <div className="p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20 sm:h-16 sm:w-16">
                <MdAutoStories size={32} />
              </div>

              <div className="min-w-0 pt-1">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  STUDY & REVISE
                </p>

                <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">
                  {title}
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/60 sm:text-base">
                  {subtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetProgress}
              className="btn btn-ghost btn-sm self-start rounded-xl text-base-content/60 hover:text-error"
              title="অগ্রগতি রিসেট করুন"
            >
              <MdRestartAlt size={19} />
              অগ্রগতি রিসেট
            </button>
          </div>

          {/* Progress overview */}

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-base-300/70 bg-base-200/50 p-4">
              <div className="flex items-center gap-2 text-base-content/50">
                <MdMenuBook size={19} />

                <span className="text-xs font-medium sm:text-sm">
                  মোট আইটেম
                </span>
              </div>

              <p className="mt-2 text-2xl font-bold sm:text-3xl">
                {totalCount}
              </p>
            </div>

            <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
              <div className="flex items-center gap-2 text-success">
                <MdCheckCircle size={19} />

                <span className="text-xs font-medium sm:text-sm">শিখেছেন</span>
              </div>

              <p className="mt-2 text-2xl font-bold text-success sm:text-3xl">
                {learnedCount}
              </p>
            </div>

            <div className="col-span-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:col-span-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-primary">
                  <MdSchool size={19} />

                  <span className="text-xs font-medium sm:text-sm">
                    শেখার অগ্রগতি
                  </span>
                </div>

                <span className="text-lg font-bold text-primary">
                  {progressPercentage}%
                </span>
              </div>

              <progress
                className="progress progress-primary mt-3 w-full"
                value={progressPercentage}
                max="100"
              />

              <p className="mt-2 text-xs text-base-content/50">
                আরও {remainingCount}টি শেখা বাকি
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================
          Tabs
      ================================================= */}

      <section className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-base-300 bg-base-200/60 p-1.5">
          <button
            type="button"
            onClick={() => updatePreference("activeTab", "learn")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all ${
              activeTab === "learn"
                ? "bg-base-100 text-primary shadow-sm ring-1 ring-base-300/70"
                : "text-base-content/60 hover:bg-base-100/50"
            }`}
          >
            <MdRadioButtonUnchecked size={20} />

            <span>শিখতে হবে</span>

            <span className="badge badge-sm border-0 bg-base-200">
              {remainingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => updatePreference("activeTab", "learned")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all ${
              activeTab === "learned"
                ? "bg-base-100 text-success shadow-sm ring-1 ring-base-300/70"
                : "text-base-content/60 hover:bg-base-100/50"
            }`}
          >
            <MdCheckCircle size={20} />

            <span>শিখেছি</span>

            <span className="badge badge-sm border-0 bg-base-200">
              {learnedCount}
            </span>
          </button>
        </div>

        {/* =================================================
            Search and difficulty filter
        ================================================= */}

        <section className="rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="input input-bordered flex min-h-12 flex-1 items-center gap-3 rounded-xl bg-base-100">
              <MdSearch size={22} className="shrink-0 text-base-content/40" />

              <input
                type="search"
                className="grow"
                placeholder="শব্দ, অর্থ, নিয়ম বা উদাহরণ খুঁজুন..."
                value={search}
                onChange={(event) =>
                  updatePreference("search", event.target.value)
                }
              />

              {search && (
                <button
                  type="button"
                  onClick={() => updatePreference("search", "")}
                  className="btn btn-ghost btn-circle btn-xs"
                  aria-label="সার্চ মুছুন"
                >
                  <MdClose size={17} />
                </button>
              )}
            </label>

            <select
              className="select select-bordered min-h-12 w-full rounded-xl bg-base-100 sm:w-44"
              value={difficulty}
              onChange={(event) =>
                updatePreference("difficulty", event.target.value)
              }
              aria-label="কঠিনতার লেভেল"
            >
              {DIFFICULTIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {(search || difficulty !== "all") && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-3">
              <p className="text-xs text-base-content/50">
                ফিল্টার অনুযায়ী {filteredItems.length}টি আইটেম পাওয়া গেছে।
              </p>

              <button
                type="button"
                onClick={resetFilters}
                className="btn btn-ghost btn-xs rounded-lg"
              >
                <MdRestartAlt size={16} />
                ফিল্টার রিসেট
              </button>
            </div>
          )}
        </section>

        {/* =================================================
            Results Header
        ================================================= */}

        <div id="study-library-results" className="scroll-mt-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold sm:text-xl">
                {activeTab === "learn" ? "শিখতে হবে" : "শেখা সম্পন্ন"}
              </h2>

              <p className="mt-1 text-sm text-base-content/50">
                {filteredItems.length > 0
                  ? `${startIndex + 1}–${Math.min(
                      startIndex + ITEMS_PER_PAGE,
                      filteredItems.length,
                    )} দেখানো হচ্ছে`
                  : "কোনো আইটেম পাওয়া যায়নি"}
              </p>
            </div>

            <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-semibold text-base-content/60">
              প্রতি পেজে {ITEMS_PER_PAGE}টি
            </span>
          </div>

          {/* =================================================
              Cards
          ================================================= */}

          {paginatedItems.length > 0 ? (
            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paginatedItems.map((item, index) => {
                const isCompleted = completedSet.has(item.id);
                const isExpanded = expandedIds.includes(item.id);

                return (
                  <article
                    key={item.id}
                    className={`group relative overflow-hidden rounded-2xl border bg-base-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                      isCompleted
                        ? "border-success/25"
                        : "border-base-300 hover:border-primary/30"
                    }`}
                  >
                    {/* Top accent */}

                    <div
                      className={`h-1 w-full ${
                        isCompleted ? "bg-success/60" : "bg-primary/50"
                      }`}
                    />

                    <div className="space-y-4 p-4 sm:p-5">
                      {/* Card header */}

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isCompleted
                                ? "bg-success/10 text-success"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {isCompleted ? (
                              <MdCheckCircle size={22} />
                            ) : (
                              <MdMenuBook size={22} />
                            )}
                          </div>

                          <div className="min-w-0 pt-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/40">
                              ITEM{" "}
                              {String(startIndex + index + 1).padStart(2, "0")}
                            </span>

                            <h3 className="mt-1 break-words text-xl font-bold leading-snug tracking-tight sm:text-2xl">
                              {item.word}
                            </h3>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            DIFFICULTY_STYLES[item.difficulty]
                          }`}
                        >
                          {DIFFICULTY_LABELS[item.difficulty]}
                        </span>
                      </div>

                      {/* Meaning */}

                      {item.meaning && (
                        <div className="rounded-xl bg-base-200/60 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-base-content/40">
                            বাংলা অর্থ
                          </p>

                          <p className="mt-1 text-base font-semibold leading-7 text-base-content/85">
                            {item.meaning}
                          </p>
                        </div>
                      )}

                      {/* Short definition */}

                      {item.definition && (
                        <p className="text-sm leading-6 text-base-content/70">
                          {item.definition}
                        </p>
                      )}

                      {/* Quick synonyms */}

                      {item.synonyms.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="mr-1 text-xs text-base-content/40">
                            Synonyms
                          </span>

                          {item.synonyms.slice(0, 3).map((word, i) => (
                            <span
                              key={`${word}-${i}`}
                              className="rounded-lg border border-success/20 bg-success/5 px-2 py-1 text-xs font-medium text-success"
                            >
                              {word}
                            </span>
                          ))}

                          {item.synonyms.length > 3 && (
                            <span className="text-xs text-base-content/40">
                              +{item.synonyms.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Expand details */}

                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.id)}
                        className="flex w-full items-center justify-between rounded-xl border border-base-300 px-3 py-2.5 text-sm font-semibold text-base-content/70 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                        aria-expanded={isExpanded}
                      >
                        <span className="flex items-center gap-2">
                          <MdLightbulb size={18} />

                          {isExpanded
                            ? "বিস্তারিত বন্ধ করুন"
                            : "বিস্তারিত শিখুন"}
                        </span>

                        {isExpanded ? (
                          <MdExpandLess size={20} />
                        ) : (
                          <MdExpandMore size={20} />
                        )}
                      </button>

                      {/* Expanded content */}

                      {isExpanded && (
                        <div className="space-y-5 border-t border-base-300 pt-4">
                          <DetailSection title="নিয়ম">
                            {item.rule && (
                              <p className="whitespace-pre-line text-sm leading-7 text-base-content/80">
                                {item.rule}
                              </p>
                            )}
                          </DetailSection>

                          <DetailSection title="Verb Forms">
                            {item.forms && (
                              <div className="space-y-2">
                                {typeof item.forms === "object" &&
                                !Array.isArray(item.forms) ? (
                                  Object.entries(item.forms).map(
                                    ([key, value]) => (
                                      <div
                                        key={key}
                                        className="flex flex-wrap justify-between gap-2 rounded-xl bg-base-200/60 p-3 text-sm"
                                      >
                                        <span className="text-base-content/50">
                                          {key}
                                        </span>

                                        <span className="font-semibold">
                                          {Array.isArray(value)
                                            ? value.join(", ")
                                            : String(value)}
                                        </span>
                                      </div>
                                    ),
                                  )
                                ) : (
                                  <p className="text-sm leading-6">
                                    {Array.isArray(item.forms)
                                      ? item.forms.join(" · ")
                                      : String(item.forms)}
                                  </p>
                                )}
                              </div>
                            )}
                          </DetailSection>

                          <DetailSection title="Synonyms">
                            <div className="flex flex-wrap gap-2">
                              {item.synonyms.map((word, i) => (
                                <span
                                  key={`${word}-${i}`}
                                  className="rounded-lg border border-success/20 bg-success/5 px-3 py-1.5 text-sm text-success"
                                >
                                  {word}
                                </span>
                              ))}
                            </div>
                          </DetailSection>

                          <DetailSection title="Antonyms">
                            <div className="flex flex-wrap gap-2">
                              {item.antonyms.map((word, i) => (
                                <span
                                  key={`${word}-${i}`}
                                  className="rounded-lg border border-error/20 bg-error/5 px-3 py-1.5 text-sm text-error"
                                >
                                  {word}
                                </span>
                              ))}
                            </div>
                          </DetailSection>

                          <DetailSection title="উদাহরণ">
                            <div className="space-y-2">
                              {item.examples.map((example, i) => (
                                <ExampleCard
                                  key={`${item.id}-example-${i}`}
                                  example={example}
                                />
                              ))}
                            </div>
                          </DetailSection>

                          <DetailSection title="অতিরিক্ত তথ্য">
                            {item.details && (
                              <p className="whitespace-pre-line text-sm leading-7 text-base-content/70">
                                {item.details}
                              </p>
                            )}
                          </DetailSection>
                        </div>
                      )}

                      {/* Completed action */}

                      <div className="border-t border-base-300 pt-3">
                        <button
                          type="button"
                          onClick={() => toggleCompleted(item.id)}
                          className={`btn min-h-11 w-full rounded-xl border-0 transition-all ${
                            isCompleted
                              ? "bg-success/10 text-success hover:bg-success/20"
                              : "btn-primary shadow-sm shadow-primary/10"
                          }`}
                        >
                          {isCompleted ? (
                            <MdCheckCircle size={20} />
                          ) : (
                            <MdRadioButtonUnchecked size={20} />
                          )}

                          {isCompleted
                            ? "শেখা সম্পন্ন হয়েছে"
                            : "শিখেছি হিসেবে চিহ্নিত করুন"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* =================================================
               Empty State
            ================================================= */

            <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 px-5 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-base-200 text-base-content/40">
                <MdMenuBook size={32} />
              </div>

              <h3 className="mt-5 text-lg font-bold">
                {activeTab === "learned"
                  ? "এখনো কোনো আইটেম শেখা সম্পন্ন হয়নি"
                  : "কোনো আইটেম পাওয়া যায়নি"}
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-base-content/50">
                {activeTab === "learned"
                  ? "কোনো আইটেম শেখা সম্পন্ন হিসেবে চিহ্নিত করলে এখানে দেখতে পাবেন।"
                  : "অন্য শব্দ দিয়ে সার্চ করুন অথবা কঠিনতার লেভেল পরিবর্তন করুন।"}
              </p>

              {(search || difficulty !== "all") && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn btn-outline btn-sm mt-5 rounded-xl"
                >
                  <MdRestartAlt size={18} />
                  ফিল্টার রিসেট করুন
                </button>
              )}

              {activeTab === "learn" &&
                totalCount > 0 &&
                remainingCount === 0 && (
                  <button
                    type="button"
                    onClick={() => updatePreference("activeTab", "learned")}
                    className="btn btn-primary mt-5 rounded-xl"
                  >
                    <MdCheckCircle size={19} />
                    শেখা আইটেম দেখুন
                  </button>
                )}
            </div>
          )}

          {/* =================================================
              Pagination
          ================================================= */}

          {totalPages > 1 && (
            <nav
              className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-base-300 bg-base-100 p-4 sm:flex-row"
              aria-label="Study library pagination"
            >
              <p className="text-sm text-base-content/50">
                পেজ{" "}
                <span className="font-bold text-base-content">
                  {safeCurrentPage}
                </span>{" "}
                / {totalPages}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => goToPage(safeCurrentPage - 1)}
                  disabled={safeCurrentPage === 1}
                  className="btn btn-outline btn-sm rounded-xl"
                  aria-label="আগের পেজ"
                >
                  <MdArrowBack size={17} />

                  <span className="hidden sm:inline">আগের</span>
                </button>

                {visiblePages.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => goToPage(page)}
                    aria-current={page === safeCurrentPage ? "page" : undefined}
                    className={`btn btn-sm min-w-9 rounded-xl ${
                      page === safeCurrentPage ? "btn-primary" : "btn-ghost"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => goToPage(safeCurrentPage + 1)}
                  disabled={safeCurrentPage === totalPages}
                  className="btn btn-outline btn-sm rounded-xl"
                  aria-label="পরের পেজ"
                >
                  <span className="hidden sm:inline">পরের</span>

                  <MdArrowForward size={17} />
                </button>
              </div>
            </nav>
          )}
        </div>
      </section>
    </main>
  );
}
