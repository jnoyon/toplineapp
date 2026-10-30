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
} from "react-icons/md";
import { verbs } from "../../students/data/verbs";

const PAGE_SIZE = 24;
const STORAGE_KEY = "verbs-learning-center";

const initialPreferences = {
  learnedIds: [],
  difficulty: "all",
  type: "all",
};

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .trim();

const difficultyLabels = {
  easy: "সহজ",
  medium: "মাঝারি",
  hard: "কঠিন",
};

const difficultyStyles = {
  easy: "badge-success",
  medium: "badge-warning",
  hard: "badge-error",
};

// Regular verbs form V2 with "-ed". Everything else is irregular.
const getVerbType = (verb) => {
  const firstV2 = String(verb?.forms?.v2 ?? "").split("/")[0];
  return /ed$/i.test(firstV2) ? "regular" : "irregular";
};

const typeLabels = {
  regular: "Regular",
  irregular: "Irregular",
};

const typeStyles = {
  regular: "badge-info",
  irregular: "badge-secondary",
};

const formConfig = [
  {
    key: "v1",
    pronunciationKey: "v1Pronunciation",
    label: "V1",
    caption: "Present",
    box: "border-primary/30 bg-primary/10 hover:bg-primary/20",
    text: "text-primary",
  },
  {
    key: "v2",
    pronunciationKey: "v2Pronunciation",
    label: "V2",
    caption: "Past",
    box: "border-secondary/30 bg-secondary/10 hover:bg-secondary/20",
    text: "text-secondary",
  },
  {
    key: "v3",
    pronunciationKey: "v3Pronunciation",
    label: "V3",
    caption: "Past Participle",
    box: "border-accent/30 bg-accent/10 hover:bg-accent/20",
    text: "text-accent",
  },
];

function readPreferences() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return initialPreferences;

    const parsed = JSON.parse(saved);

    return {
      learnedIds: Array.isArray(parsed.learnedIds) ? parsed.learnedIds : [],
      difficulty: ["all", "easy", "medium", "hard"].includes(parsed.difficulty)
        ? parsed.difficulty
        : "all",
      type: ["all", "regular", "irregular"].includes(parsed.type)
        ? parsed.type
        : "all",
    };
  } catch {
    return initialPreferences;
  }
}

export default function Verbs() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);

  // Practice mode hides V2 and V3 until the learner taps them.
  const [practiceMode, setPracticeMode] = useState(false);
  const [revealed, setRevealed] = useState({});

  // Which card / form is currently being spoken.
  const [speaking, setSpeaking] = useState({ id: null, form: null });

  const topRef = useRef(null);
  const isFirstRender = useRef(true);

  const learnedIds = preferences.learnedIds;
  const difficulty = preferences.difficulty;
  const verbType = preferences.type;

  // Persist learning progress and filter preferences.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Could not save verb preferences:", error);
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
  const filteredVerbs = useMemo(() => {
    const query = normalize(search);

    return verbs.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.word,
          item.pronunciation,
          item.meaning,
          item.forms?.v1,
          item.forms?.v2,
          item.forms?.v3,
          item.forms?.v1Pronunciation,
          item.forms?.v2Pronunciation,
          item.forms?.v3Pronunciation,
        ].some((value) => normalize(value).includes(query));

      const matchesDifficulty =
        difficulty === "all" || normalize(item.difficulty) === difficulty;

      const matchesType = verbType === "all" || getVerbType(item) === verbType;

      const isLearned = learnedSet.has(String(item.id));

      const matchesTab =
        activeTab === "all"
          ? true
          : activeTab === "learned"
            ? isLearned
            : !isLearned;

      return matchesSearch && matchesDifficulty && matchesType && matchesTab;
    });
  }, [search, difficulty, verbType, activeTab, learnedSet]);

  // Return to the first page when search or filters change.
  useEffect(() => {
    setPage(1);
  }, [search, difficulty, verbType, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredVerbs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleVerbs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredVerbs.slice(start, start + PAGE_SIZE);
  }, [filteredVerbs, currentPage]);

  // Scroll to the top of the list on page change (not on first load).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage]);

  const totalVerbs = verbs.length;

  const learnedCount = learnedIds.filter((id) =>
    verbs.some((item) => String(item.id) === String(id)),
  ).length;

  const progress = totalVerbs
    ? Math.round((learnedCount / totalVerbs) * 100)
    : 0;

  const irregularCount = useMemo(
    () => verbs.filter((item) => getVerbType(item) === "irregular").length,
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

  const speak = useCallback((text, { onEnd, cancel = true } = {}) => {
    if (!("speechSynthesis" in window)) {
      alert("আপনার ব্রাউজার টেক্সট-টু-স্পিচ সমর্থন করে না।");
      return;
    }

    if (cancel) window.speechSynthesis.cancel();

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

  // Speaks V1, V2 and V3 one after another.
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
    practiceMode && formKey !== "v1" && !revealed[`${item.id}-${formKey}`];

  const revealForm = (item, formKey) => {
    setRevealed((previous) => ({
      ...previous,
      [`${item.id}-${formKey}`]: true,
    }));
  };

  const revealCard = (item) => {
    setRevealed((previous) => ({
      ...previous,
      [`${item.id}-v2`]: true,
      [`${item.id}-v3`]: true,
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

  const changeDifficulty = (value) => {
    setPreferences((previous) => ({ ...previous, difficulty: value }));
  };

  const changeType = (value) => {
    setPreferences((previous) => ({ ...previous, type: value }));
  };

  const clearFilters = () => {
    setSearch("");
    setActiveTab("all");
    setPreferences((previous) => ({
      ...previous,
      difficulty: "all",
      type: "all",
    }));
  };

  const startItem = filteredVerbs.length
    ? (currentPage - 1) * PAGE_SIZE + 1
    : 0;

  const endItem = Math.min(currentPage * PAGE_SIZE, filteredVerbs.length);

  const tabs = [
    { key: "all", label: "সকল ক্রিয়া", active: "text-primary" },
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
                {totalVerbs}টি গুরুত্বপূর্ণ ইংরেজি Verb
              </h1>

              <p className="mt-2 text-sm text-base-content/60">
                V1, V2 ও V3 — উচ্চারণসহ শিখুন, শুনুন এবং নিজেকে যাচাই করুন
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-80">
              <div className="rounded-xl bg-primary/10 p-4">
                <p className="text-xs text-base-content/60">মোট Verb</p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {totalVerbs}
                </p>
              </div>

              <div className="rounded-xl bg-success/10 p-4">
                <p className="text-xs text-base-content/60">শেখা হয়েছে</p>
                <p className="mt-1 text-2xl font-bold text-success">
                  {learnedCount}
                </p>
              </div>

              <div className="rounded-xl bg-secondary/10 p-4">
                <p className="text-xs text-base-content/60">Irregular</p>
                <p className="mt-1 text-2xl font-bold text-secondary">
                  {irregularCount}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_170px_170px] sm:gap-4">
            <label className="flex h-12 min-w-0 items-center gap-3 rounded-xl border border-base-300 bg-base-200/40 px-3 transition-colors focus-within:border-primary focus-within:bg-base-100 focus-within:ring-2 focus-within:ring-primary/15 sm:px-4">
              <MdSearch size={22} className="shrink-0 text-base-content/50" />

              <input
                type="search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/45 sm:text-base"
                placeholder="Verb, অর্থ বা V1/V2/V3 খুঁজুন..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Verb খুঁজুন"
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
              value={difficulty}
              onChange={(event) => changeDifficulty(event.target.value)}
              aria-label="কঠিনতার স্তর নির্বাচন করুন"
            >
              <option value="all">সব স্তর</option>
              <option value="easy">সহজ</option>
              <option value="medium">মাঝারি</option>
              <option value="hard">কঠিন</option>
            </select>

            <select
              className="select h-12 min-h-0 w-full rounded-xl border-base-300 bg-base-200/40 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={verbType}
              onChange={(event) => changeType(event.target.value)}
              aria-label="Verb ধরন নির্বাচন করুন"
            >
              <option value="all">সব ধরন</option>
              <option value="regular">Regular</option>
              <option value="irregular">Irregular</option>
            </select>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Verb শেখার অবস্থা"
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
              V2 ও V3 লুকানো আছে। নিজে মনে করার চেষ্টা করুন, তারপর ট্যাপ করে
              উত্তর মিলিয়ে নিন।
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
            / <strong>{filteredVerbs.length}</strong>টি Verb
          </p>

          <p>প্রতি পেজে {PAGE_SIZE}টি</p>
        </div>

        {/* Verb list */}
        {visibleVerbs.length > 0 ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleVerbs.map((item) => {
              const isLearned = learnedSet.has(String(item.id));
              const level = normalize(item.difficulty);
              const type = getVerbType(item);
              const cardSpeaking = speaking.id === item.id;
              const hasHidden =
                practiceMode &&
                (isFormHidden(item, "v2") || isFormHidden(item, "v3"));

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

                          {item.difficulty && (
                            <span
                              className={`badge badge-sm ${
                                difficultyStyles[level] || "badge-ghost"
                              }`}
                            >
                              {difficultyLabels[level] || item.difficulty}
                            </span>
                          )}

                          <span
                            className={`badge badge-sm badge-outline ${typeStyles[type]}`}
                          >
                            {typeLabels[type]}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-base-content/60">
                          {item.pronunciation}
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
                        aria-label={`${item.word} এর V1, V2, V3 শুনুন`}
                        title="V1 → V2 → V3 শুনুন"
                      >
                        <MdPlayCircle size={24} />
                      </button>
                    </div>

                    {/* Meaning */}
                    <div className="rounded-lg bg-base-200/70 p-3">
                      <p className="text-sm leading-6">{item.meaning}</p>
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
                            className={`group relative flex min-h-24 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2.5 text-center transition-all active:scale-95 ${
                              form.box
                            } ${isSpeakingForm ? "ring-2 ring-current " + form.text : ""}`}
                            aria-label={
                              hidden
                                ? `${form.label} দেখতে ট্যাপ করুন`
                                : `${form.label}: ${item.forms[form.key]} শুনুন`
                            }
                          >
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wide ${form.text}`}
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

                                <span className="break-words text-[11px] leading-tight text-base-content/60">
                                  {item.forms[form.pronunciationKey]}
                                </span>

                                <MdVolumeUp
                                  size={14}
                                  className={`mt-0.5 ${form.text} ${
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

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 border-t border-base-200 pt-3">
                      <span className="text-xs text-base-content/50">
                        Verb #{String(item.id).replace("verb-", "")}
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
              কোনো Verb পাওয়া যায়নি
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
        {filteredVerbs.length > PAGE_SIZE && (
          <nav
            className="flex flex-wrap items-center justify-center gap-2 py-3"
            aria-label="Verb pagination"
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
