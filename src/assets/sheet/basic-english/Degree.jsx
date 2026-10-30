import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdAutoStories,
  MdVolumeUp,
  MdSearch,
  MdRestartAlt,
  MdChevronLeft,
  MdChevronRight,
  MdBookmark,
  MdBookmarkBorder,
  MdPlayCircle,
  MdVisibility,
  MdVisibilityOff,
  MdQuiz,
  MdClose,
  MdLightbulbOutline,
} from "react-icons/md";
import { degrees } from "../../students/data/degree";

const PAGE_SIZE = 24;
const STORAGE_KEY = "degree-learning-center";

const initialPreferences = {
  learnedIds: [],
  type: "all",
};

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .trim();

const typeLabels = {
  "er-est": "-er / -est",
  "more-most": "more / most",
};

const typeStyles = {
  "er-est": "badge-info",
  "more-most": "badge-secondary",
};

const VOWELS = "aeiou";

// Explains how the comparative is formed, in Bangla.
function getRuleHint(item) {
  const positive = normalize(item.forms.positive);
  const comparative = normalize(item.forms.comparative.split("/")[0]);

  if (item.type === "more-most") {
    return "বড় শব্দ (২+ সিলেবল): আগে more / most বসে";
  }

  if (comparative === `${positive}r`) {
    return "e দিয়ে শেষ: শুধু r / st যোগ হয়";
  }

  if (positive.endsWith("y") && comparative === `${positive.slice(0, -1)}ier`) {
    return "y দিয়ে শেষ: y বদলে i হয়ে ier / iest";
  }

  const last = positive.slice(-1);
  const beforeLast = positive.slice(-2, -1);

  if (
    comparative === `${positive}${last}er` &&
    !VOWELS.includes(last) &&
    VOWELS.includes(beforeLast)
  ) {
    return `শেষ অক্ষর (${last}) দ্বিত্ব হয়ে ${last}${last}er / ${last}${last}est`;
  }

  if (comparative === `${positive}er`) {
    return "সরাসরি er / est যোগ হয়";
  }

  return "";
}

const formConfig = [
  {
    key: "positive",
    label: "Positive",
    caption: "সাধারণ",
    bars: 1,
    box: "border-primary/30 bg-primary/10 hover:bg-primary/20",
    text: "text-primary",
    bar: "bg-primary",
  },
  {
    key: "comparative",
    label: "Comparative",
    caption: "তুলনামূলক",
    bars: 2,
    box: "border-secondary/30 bg-secondary/10 hover:bg-secondary/20",
    text: "text-secondary",
    bar: "bg-secondary",
  },
  {
    key: "superlative",
    label: "Superlative",
    caption: "সর্বোচ্চ",
    bars: 3,
    box: "border-accent/30 bg-accent/10 hover:bg-accent/20",
    text: "text-accent",
    bar: "bg-accent",
  },
];

// Small ascending bars that show the level of the degree.
function DegreeBars({ count, className }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {[1, 2, 3].map((level) => (
        <span
          key={level}
          className={`w-1 rounded-sm ${
            level <= count ? className : "bg-base-content/15"
          }`}
          style={{ height: `${level * 33}%` }}
        />
      ))}
    </span>
  );
}

function readPreferences() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return initialPreferences;

    const parsed = JSON.parse(saved);

    return {
      learnedIds: Array.isArray(parsed.learnedIds) ? parsed.learnedIds : [],
      type: ["all", "er-est", "more-most"].includes(parsed.type)
        ? parsed.type
        : "all",
    };
  } catch {
    return initialPreferences;
  }
}

export default function Degree() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);

  // Practice mode hides Comparative and Superlative until tapped.
  const [practiceMode, setPracticeMode] = useState(false);
  const [revealed, setRevealed] = useState({});

  // Which card / form is currently being spoken.
  const [speaking, setSpeaking] = useState({ id: null, form: null });

  const topRef = useRef(null);
  const isFirstRender = useRef(true);

  const learnedIds = preferences.learnedIds;
  const ruleType = preferences.type;

  // Persist learning progress and filter preference.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Could not save degree preferences:", error);
    }
  }, [preferences]);

  // Stop any speech when leaving the page.
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const learnedSet = useMemo(
    () => new Set(learnedIds.map(String)),
    [learnedIds],
  );

  // Search the complete dataset, not just the current page.
  const filteredDegrees = useMemo(() => {
    const query = normalize(search);

    return degrees.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.word,
          item.meaning,
          item.forms?.positive,
          item.forms?.comparative,
          item.forms?.superlative,
        ].some((value) => normalize(value).includes(query));

      const matchesType = ruleType === "all" || item.type === ruleType;

      const isLearned = learnedSet.has(String(item.id));

      const matchesTab =
        activeTab === "all"
          ? true
          : activeTab === "learned"
            ? isLearned
            : !isLearned;

      return matchesSearch && matchesType && matchesTab;
    });
  }, [search, ruleType, activeTab, learnedSet]);

  // Return to the first page when search or filters change.
  useEffect(() => {
    setPage(1);
  }, [search, ruleType, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredDegrees.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleDegrees = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredDegrees.slice(start, start + PAGE_SIZE);
  }, [filteredDegrees, currentPage]);

  // Scroll to the top of the list on page change (not on first load).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage]);

  const totalWords = degrees.length;

  const learnedCount = learnedIds.filter((id) =>
    degrees.some((item) => String(item.id) === String(id)),
  ).length;

  const progress = totalWords
    ? Math.round((learnedCount / totalWords) * 100)
    : 0;

  const moreMostCount = useMemo(
    () => degrees.filter((item) => item.type === "more-most").length,
    [],
  );

  const toggleLearned = (id) => {
    const idString = String(id);

    setPreferences((previous) => {
      const alreadyLearned = previous.learnedIds.some(
        (savedId) => String(savedId) === idString,
      );

      return {
        ...previous,
        learnedIds: alreadyLearned
          ? previous.learnedIds.filter(
              (savedId) => String(savedId) !== idString,
            )
          : [...previous.learnedIds, id],
      };
    });
  };

  /* ---------------- Speech ---------------- */

  const speak = useCallback((text, { onEnd } = {}) => {
    if (!("speechSynthesis" in window)) {
      alert("আপনার ব্রাউজার টেক্সট-টু-স্পিচ সমর্থন করে না।");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      String(text).replaceAll("/", ", "),
    );
    utterance.lang = "en-US";
    utterance.rate = 0.8;

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  const speakForm = (item, form) => {
    setSpeaking({ id: item.id, form: form.key });

    speak(item.forms[form.key], {
      onEnd: () => setSpeaking({ id: null, form: null }),
    });
  };

  // Speaks Positive, Comparative and Superlative one after another.
  const speakAllForms = (item) => {
    if (!("speechSynthesis" in window)) {
      alert("আপনার ব্রাউজার টেক্সট-টু-স্পিচ সমর্থন করে না।");
      return;
    }

    window.speechSynthesis.cancel();

    formConfig.forEach((form, index) => {
      const utterance = new SpeechSynthesisUtterance(
        String(item.forms[form.key]).replaceAll("/", ", "),
      );
      utterance.lang = "en-US";
      utterance.rate = 0.8;

      utterance.onstart = () => setSpeaking({ id: item.id, form: form.key });

      if (index === formConfig.length - 1) {
        utterance.onend = () => setSpeaking({ id: null, form: null });
        utterance.onerror = () => setSpeaking({ id: null, form: null });
      }

      window.speechSynthesis.speak(utterance);
    });
  };

  /* ---------------- Practice mode ---------------- */

  const isFormHidden = (item, formKey) =>
    practiceMode &&
    formKey !== "positive" &&
    !revealed[`${item.id}-${formKey}`];

  const revealForm = (item, formKey) => {
    setRevealed((previous) => ({
      ...previous,
      [`${item.id}-${formKey}`]: true,
    }));
  };

  const revealCard = (item) => {
    setRevealed((previous) => ({
      ...previous,
      [`${item.id}-comparative`]: true,
      [`${item.id}-superlative`]: true,
    }));
  };

  const togglePractice = () => {
    setPracticeMode((previous) => !previous);
    setRevealed({});
  };

  /* ---------------- Misc handlers ---------------- */

  const resetProgress = () => {
    const confirmed = window.confirm(
      "আপনি কি নিশ্চিত যে সম্পূর্ণ শেখার অগ্রগতি রিসেট করতে চান?",
    );

    if (!confirmed) return;

    setPreferences((previous) => ({
      ...previous,
      learnedIds: [],
    }));
  };

  const changeType = (value) => {
    setPreferences((previous) => ({ ...previous, type: value }));
  };

  const clearFilters = () => {
    setSearch("");
    setActiveTab("all");
    changeType("all");
  };

  const startItem = filteredDegrees.length
    ? (currentPage - 1) * PAGE_SIZE + 1
    : 0;

  const endItem = Math.min(currentPage * PAGE_SIZE, filteredDegrees.length);

  const tabs = [
    { key: "all", label: "সকল শব্দ", active: "text-primary" },
    { key: "unlearned", label: "শেখা বাকি", active: "text-primary" },
    { key: "learned", label: "শেখা হয়েছে", active: "text-success" },
  ];

  return (
    <main className="min-h-screen bg-base-200/50 px-3 py-5 sm:px-6 sm:py-8">
      <div ref={topRef} className="mx-auto max-w-7xl scroll-mt-4 space-y-6">
        {/* Header */}
        <section className="rounded-2xl bg-base-100 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Degree of Adjectives
              </h1>

              <p className="mt-2 text-sm text-base-content/60">
                Positive, Comparative ও Superlative — শুনুন, নিয়ম বুঝুন এবং
                নিজেকে যাচাই করুন
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-80">
              <div className="rounded-xl bg-primary/10 p-4">
                <p className="text-xs text-base-content/60">মোট শব্দ</p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {totalWords}
                </p>
              </div>

              <div className="rounded-xl bg-success/10 p-4">
                <p className="text-xs text-base-content/60">শেখা হয়েছে</p>
                <p className="mt-1 text-2xl font-bold text-success">
                  {learnedCount}
                </p>
              </div>

              <div className="rounded-xl bg-secondary/10 p-4">
                <p className="text-xs text-base-content/60">more/most</p>
                <p className="mt-1 text-2xl font-bold text-secondary">
                  {moreMostCount}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">আপনার শেখার প্রোগ্রেস</span>
              <span className="font-semibold">{progress}%</span>
            </div>

            <progress
              className="progress progress-primary h-2 w-full"
              value={progress}
              max="100"
            />
          </div>
        </section>

        {/* Search and filters */}
        <section className="rounded-2xl border border-base-300/60 bg-base-100 p-3 shadow-sm sm:rounded-3xl sm:p-5 lg:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:gap-4">
            <label className="flex h-12 min-w-0 items-center gap-3 rounded-xl border border-base-300 bg-base-200/40 px-3 transition-colors focus-within:border-primary focus-within:bg-base-100 focus-within:ring-2 focus-within:ring-primary/15 sm:px-4">
              <MdSearch size={22} className="shrink-0 text-base-content/50" />

              <input
                type="search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/45 sm:text-base"
                placeholder="শব্দ, অর্থ বা যেকোনো ডিগ্রি খুঁজুন..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="শব্দ খুঁজুন"
              />

              {search && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1 text-base-content/60 transition-colors hover:bg-base-300 hover:text-base-content"
                  onClick={() => setSearch("")}
                  aria-label="অনুসন্ধান মুছুন"
                >
                  <MdClose size={18} />
                </button>
              )}
            </label>

            <select
              className="select h-12 min-h-0 w-full rounded-xl border-base-300 bg-base-200/40 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={ruleType}
              onChange={(event) => changeType(event.target.value)}
              aria-label="গঠনের নিয়ম নির্বাচন করুন"
            >
              <option value="all">সব নিয়ম</option>
              <option value="er-est">-er / -est</option>
              <option value="more-most">more / most</option>
            </select>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs */}
            <div
              role="tablist"
              aria-label="শব্দ শেখার অবস্থা"
              className="grid w-full grid-cols-3 gap-1 rounded-xl border border-base-300/70 bg-base-200/70 p-1 lg:w-auto lg:min-w-[360px]"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`min-w-0 rounded-lg px-1.5 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
                    activeTab === tab.key
                      ? `bg-base-100 ${tab.active} shadow-sm ring-1 ring-base-300/60`
                      : "text-base-content/60 hover:bg-base-100/60 hover:text-base-content"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {/* Practice mode */}
              <button
                type="button"
                className={`btn btn-sm min-h-10 gap-2 rounded-xl ${
                  practiceMode ? "btn-primary" : "btn-outline btn-primary"
                }`}
                onClick={togglePractice}
                aria-pressed={practiceMode}
              >
                <MdQuiz size={18} />
                {practiceMode ? "প্র্যাকটিস মোড চালু" : "প্র্যাকটিস মোড"}
              </button>

              {/* Reset progress */}
              <button
                type="button"
                className="btn btn-ghost btn-sm min-h-10 gap-2 rounded-xl text-error hover:bg-error/10"
                onClick={resetProgress}
                disabled={learnedCount === 0}
              >
                <MdRestartAlt size={18} />
                অগ্রগতি রিসেট
              </button>
            </div>
          </div>

          {practiceMode && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary/10 px-3 py-2.5 text-xs text-base-content/70 sm:text-sm">
              <MdVisibilityOff
                size={18}
                className="mt-0.5 shrink-0 text-primary"
              />
              Comparative ও Superlative লুকানো আছে। নিজে মনে করার চেষ্টা করুন,
              তারপর ট্যাপ করে উত্তর মিলিয়ে নিন।
            </p>
          )}
        </section>

        {/* Results summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-base-content/60">
          <p>
            দেখানো হচ্ছে{" "}
            <strong>
              {startItem}–{endItem}
            </strong>{" "}
            / <strong>{filteredDegrees.length}</strong>টি শব্দ
          </p>

          <p>প্রতি পেজে {PAGE_SIZE}টি</p>
        </div>

        {/* Degree list */}
        {visibleDegrees.length > 0 ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDegrees.map((item) => {
              const isLearned = learnedSet.has(String(item.id));
              const cardSpeaking = speaking.id === item.id;
              const hasHidden =
                practiceMode &&
                (isFormHidden(item, "comparative") ||
                  isFormHidden(item, "superlative"));
              const hint = getRuleHint(item);

              return (
                <article
                  key={item.id}
                  className={`card border bg-base-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    isLearned ? "border-success/40" : "border-base-300"
                  }`}
                >
                  <div className="card-body gap-3 p-4 sm:p-5">
                    {/* Title */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-xl font-bold">
                            {item.word}
                          </h2>

                          <span
                            className={`badge badge-sm badge-outline ${
                              typeStyles[item.type] || "badge-ghost"
                            }`}
                          >
                            {typeLabels[item.type] || item.type}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-base-content/70">
                          {item.meaning}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={`btn btn-circle btn-sm shrink-0 ${
                          cardSpeaking
                            ? "btn-primary animate-pulse"
                            : "btn-ghost text-primary"
                        }`}
                        onClick={() => speakAllForms(item)}
                        aria-label={`${item.word} এর তিনটি ডিগ্রি শুনুন`}
                        title="Positive → Comparative → Superlative শুনুন"
                      >
                        <MdPlayCircle size={24} />
                      </button>
                    </div>

                    {/* Forms */}
                    <div className="grid grid-cols-3 gap-2">
                      {formConfig.map((form) => {
                        const hidden = isFormHidden(item, form.key);
                        const isSpeakingForm =
                          speaking.id === item.id && speaking.form === form.key;

                        return (
                          <button
                            key={form.key}
                            type="button"
                            onClick={() =>
                              hidden
                                ? revealForm(item, form.key)
                                : speakForm(item, form)
                            }
                            className={`group relative flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition-all active:scale-95 ${
                              form.box
                            } ${isSpeakingForm ? "ring-2 ring-current " + form.text : ""}`}
                            aria-label={
                              hidden
                                ? `${form.label} দেখতে ট্যাপ করুন`
                                : `${form.label}: ${item.forms[form.key]} শুনুন`
                            }
                          >
                            <DegreeBars
                              count={form.bars}
                              className={form.bar}
                            />

                            <span
                              className={`text-[9px] font-bold uppercase tracking-wide sm:text-[10px] ${form.text}`}
                            >
                              {form.label}
                            </span>

                            {hidden ? (
                              <>
                                <span className="text-2xl font-bold text-base-content/30">
                                  ???
                                </span>
                                <span className="text-[10px] text-base-content/50">
                                  ট্যাপ করুন
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="break-words text-sm font-bold leading-tight sm:text-base">
                                  {item.forms[form.key]}
                                </span>

                                <MdVolumeUp
                                  size={14}
                                  className={`${form.text} ${
                                    isSpeakingForm
                                      ? "animate-pulse"
                                      : "opacity-60 group-hover:opacity-100"
                                  }`}
                                />
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {hasHidden && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs gap-1 self-center text-primary"
                        onClick={() => revealCard(item)}
                      >
                        <MdVisibility size={15} />
                        উত্তর দেখুন
                      </button>
                    )}

                    {/* Rule hint */}
                    {hint && !practiceMode && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-base-200/70 px-3 py-2 text-xs leading-5 text-base-content/70">
                        <MdLightbulbOutline
                          size={16}
                          className="mt-0.5 shrink-0 text-warning"
                        />
                        {hint}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 border-t border-base-200 pt-3">
                      <span className="text-xs text-base-content/50">
                        Word #{String(item.id).replace("degree-", "")}
                      </span>

                      <button
                        type="button"
                        className={`btn btn-sm gap-1 rounded-lg text-white ${
                          isLearned ? "btn-error" : "btn-success"
                        }`}
                        onClick={() => toggleLearned(item.id)}
                      >
                        {isLearned ? (
                          <MdBookmark size={17} />
                        ) : (
                          <MdBookmarkBorder size={17} />
                        )}

                        {isLearned ? "বাদ দিন" : "শেখা হয়েছে"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-2xl bg-base-100 px-4 py-16 text-center shadow-sm">
            <MdAutoStories size={44} className="mx-auto text-base-content/30" />

            <h2 className="mt-4 text-lg font-semibold">
              কোনো শব্দ পাওয়া যায়নি
            </h2>

            <p className="mt-2 text-sm text-base-content/60">
              অন্য শব্দ দিয়ে খুঁজুন অথবা ফিল্টার পরিবর্তন করুন।
            </p>

            <button
              type="button"
              className="btn btn-primary btn-sm mt-4"
              onClick={clearFilters}
            >
              সব ফিল্টার মুছুন
            </button>
          </section>
        )}

        {/* Pagination */}
        {filteredDegrees.length > PAGE_SIZE && (
          <nav
            className="flex flex-wrap items-center justify-center gap-2 py-3"
            aria-label="Degree pagination"
          >
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              disabled={currentPage === 1}
              onClick={() => setPage((previous) => previous - 1)}
            >
              <MdChevronLeft size={20} />
              আগের
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .filter(
                (pageNumber) =>
                  pageNumber === 1 ||
                  pageNumber === totalPages ||
                  Math.abs(pageNumber - currentPage) <= 2,
              )
              .reduce((result, pageNumber, index, pages) => {
                if (index > 0 && pageNumber - pages[index - 1] > 1) {
                  result.push("ellipsis-" + pageNumber);
                }

                result.push(pageNumber);
                return result;
              }, [])
              .map((pageNumber) =>
                typeof pageNumber === "string" ? (
                  <span key={pageNumber} className="px-1 opacity-50">
                    …
                  </span>
                ) : (
                  <button
                    key={pageNumber}
                    type="button"
                    className={`btn btn-sm ${
                      currentPage === pageNumber ? "btn-primary" : "btn-outline"
                    }`}
                    aria-current={
                      currentPage === pageNumber ? "page" : undefined
                    }
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}

            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              disabled={currentPage === totalPages}
              onClick={() => setPage((previous) => previous + 1)}
            >
              পরের
              <MdChevronRight size={20} />
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
