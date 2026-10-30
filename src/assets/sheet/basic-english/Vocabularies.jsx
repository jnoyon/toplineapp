import { useEffect, useMemo, useState } from "react";
import {
  MdAutoStories,
  MdVolumeUp,
  MdSearch,
  MdRestartAlt,
  MdChevronLeft,
  MdChevronRight,
} from "react-icons/md";

import { FaTimesCircle } from "react-icons/fa";
import { wordMeanings } from "../../students/data/wordMeanings";
import { BookmarkIcon } from "lucide-react";

const PAGE_SIZE = 50;
const STORAGE_KEY = "vocabulary-learning-center";

const initialPreferences = {
  learnedIds: [],
  difficulty: "all",
};

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .trim();

const getDifficulty = (level) => {
  const normalized = normalize(level);

  if (normalized === "easy") return "easy";
  if (normalized === "medium") return "medium";
  if (normalized === "hard") return "hard";

  return normalized;
};

const difficultyLabels = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const difficultyStyles = {
  easy: "badge-success",
  medium: "badge-warning",
  hard: "badge-error",
};

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
    };
  } catch {
    return initialPreferences;
  }
}

export default function Vocabularies() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);

  const learnedIds = preferences.learnedIds;
  const difficulty = preferences.difficulty;

  // Persist learning progress and difficulty preference.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Could not save vocabulary preferences:", error);
    }
  }, [preferences]);

  const learnedSet = useMemo(
    () => new Set(learnedIds.map(String)),
    [learnedIds],
  );

  // Search the complete dataset, not just the current page.
  const filteredWords = useMemo(() => {
    const query = normalize(search);

    return wordMeanings.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.word,
          item.pronunciation,
          item.partOfSpeech,
          item.meaning,
          item.level,
        ].some((value) => normalize(value).includes(query));

      const matchesDifficulty =
        difficulty === "all" || getDifficulty(item.level) === difficulty;

      const isLearned = learnedSet.has(String(item.id));

      const matchesTab = activeTab === "learned" ? isLearned : !isLearned;

      return matchesSearch && matchesDifficulty && matchesTab;
    });
  }, [search, difficulty, activeTab, learnedSet]);

  // Return to the first page when search or filters change.
  useEffect(() => {
    setPage(1);
  }, [search, difficulty, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredWords.length / PAGE_SIZE));

  const currentPage = Math.min(page, totalPages);

  const visibleWords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return filteredWords.slice(start, start + PAGE_SIZE);
  }, [filteredWords, currentPage]);

  const learnedCount = learnedIds.filter((id) =>
    wordMeanings.some((item) => String(item.id) === String(id)),
  ).length;

  const totalWords = wordMeanings.length;

  const progress = totalWords
    ? Math.round((learnedCount / totalWords) * 100)
    : 0;

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

  const speakWord = (word) => {
    if (!("speechSynthesis" in window)) {
      alert("Your browser does not support text-to-speech.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.8;

    window.speechSynthesis.speak(utterance);
  };

  const resetProgress = () => {
    const confirmed = window.confirm(
      "Are you sure you want to reset all your vocabulary learning progress?",
    );

    if (!confirmed) return;

    setPreferences({
      learnedIds: [],
      difficulty,
    });
  };

  const changeDifficulty = (value) => {
    setPreferences((previous) => ({
      ...previous,
      difficulty: value,
    }));
  };

  const startItem = filteredWords.length
    ? (currentPage - 1) * PAGE_SIZE + 1
    : 0;

  const endItem = Math.min(currentPage * PAGE_SIZE, filteredWords.length);

  return (
    <main className="min-h-screen bg-base-200/50 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <section className="rounded-2xl bg-base-100 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                ৯৯৫টি সবচেয়ে কমন ইংরেজি শব্দ
              </h1>

              <p className="mt-2 text-sm text-base-content/60">
                এই শব্দগুলো শেখার পর ইংরেজি শেখা আপনার জন্য সহজ হয়ে যাবে
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-64">
              <div className="rounded-xl bg-primary/10 p-4">
                <p className="text-xs text-base-content/60">মোট শব্দ</p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {totalWords} টি
                </p>
              </div>

              <div className="rounded-xl bg-success/10 p-4">
                <p className="text-xs text-base-content/60">শেখা হয়েছে</p>
                <p className="mt-1 text-2xl font-bold text-success">
                  {learnedCount} টি
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
          {/* Search and Difficulty */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:gap-4">
            <label className="flex h-12 min-w-0 items-center gap-3 rounded-xl border border-base-300 bg-base-200/40 px-3 transition-colors focus-within:border-primary focus-within:bg-base-100 focus-within:ring-2 focus-within:ring-primary/15 sm:h-13 sm:px-4">
              <MdSearch size={22} className="shrink-0 text-base-content/50" />

              <input
                type="search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/45 sm:text-base"
                placeholder="শব্দার্থ খুঁজুন..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="শব্দার্থ খুঁজুন"
              />

              {search && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-base-content/60 transition-colors hover:bg-base-300 hover:text-base-content"
                  onClick={() => setSearch("")}
                  aria-label="অনুসন্ধান মুছুন"
                >
                  মুছুন
                </button>
              )}
            </label>

            <select
              className="select h-12 min-h-0 w-full rounded-xl border-base-300 bg-base-200/40 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 sm:h-13"
              value={difficulty}
              onChange={(event) => changeDifficulty(event.target.value)}
              aria-label="কঠিনতার স্তর নির্বাচন করুন"
            >
              <option value="all">সব স্তর</option>
              <option value="easy">সহজ</option>
              <option value="medium">মাঝারি</option>
              <option value="hard">কঠিন</option>
            </select>
          </div>

          {/* Tabs and Reset */}
          <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:items-center sm:justify-between">
            {/* Responsive segmented tabs */}
            <div
              role="tablist"
              aria-label="শব্দের শেখার অবস্থা"
              className="grid w-full grid-cols-3 gap-1 rounded-xl border border-base-300/70 bg-base-200/70 p-1 sm:w-auto sm:min-w-[360px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "all"}
                className={`min-w-0 rounded-lg px-1.5 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
                  activeTab === "all"
                    ? "bg-base-100 text-primary shadow-sm ring-1 ring-base-300/60"
                    : "text-base-content/60 hover:bg-base-100/60 hover:text-base-content"
                }`}
                onClick={() => setActiveTab("all")}
              >
                সকল শব্দ
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "unlearned"}
                className={`min-w-0 rounded-lg px-1.5 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
                  activeTab === "unlearned"
                    ? "bg-base-100 text-primary shadow-sm ring-1 ring-base-300/60"
                    : "text-base-content/60 hover:bg-base-100/60 hover:text-base-content"
                }`}
                onClick={() => setActiveTab("unlearned")}
              >
                শেখা বাকি
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "learned"}
                className={`min-w-0 rounded-lg px-1.5 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
                  activeTab === "learned"
                    ? "bg-base-100 text-success shadow-sm ring-1 ring-base-300/60"
                    : "text-base-content/60 hover:bg-base-100/60 hover:text-base-content"
                }`}
                onClick={() => setActiveTab("learned")}
              >
                শেখা হয়েছে
              </button>
            </div>

            {/* Reset progress */}
            <button
              type="button"
              className="btn btn-ghost btn-sm min-h-10 w-full gap-2 rounded-xl text-error hover:bg-error/10 sm:w-auto"
              onClick={resetProgress}
              disabled={learnedCount === 0}
            >
              <MdRestartAlt size={18} />
              শেখার অগ্রগতি রিসেট
            </button>
          </div>
        </section>

        {/* Results summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-base-content/60">
          <p>
            Showing{" "}
            <strong>
              {startItem}–{endItem}
            </strong>{" "}
            of <strong>{filteredWords.length}</strong> matching words
          </p>

          <p>{PAGE_SIZE} words per page</p>
        </div>

        {/* Vocabulary list */}
        {visibleWords.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleWords.map((item, index) => {
              const isLearned = learnedSet.has(String(item.id));
              const level = getDifficulty(item.level);

              return (
                <article
                  key={item.id}
                  className={`card border bg-base-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    isLearned ? "border-success/40" : "border-base-300"
                  }`}
                >
                  <div className="card-body gap-3 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-xl font-bold">
                            {item.word}
                          </h2>

                          {item.level && (
                            <span
                              className={`badge badge-sm ${
                                difficultyStyles[level] || "badge-ghost"
                              }`}
                            >
                              {difficultyLabels[level] || item.level}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-base-content/60">
                          {item.pronunciation}
                          {item.partOfSpeech && (
                            <span className="ml-2 italic">
                              {item.partOfSpeech}
                            </span>
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="btn btn-circle btn-ghost btn-sm text-primary"
                        onClick={() => speakWord(item.word)}
                        aria-label={`Listen to ${item.word}`}
                        title="Listen to pronunciation"
                      >
                        <MdVolumeUp size={22} />
                      </button>
                    </div>

                    <div className="min-h-12 rounded-lg bg-base-200/70 p-3">
                      <p className="text-sm leading-6">{item.meaning}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-base-200 pt-3">
                      <span className="text-xs text-base-content/50">
                        Word #{item.id}
                      </span>

                      <button
                        type="button"
                        className={`btn btn-sm gap-1 rounded-lg ${
                          isLearned
                            ? "btn-error text-white"
                            : "btn-success text-white"
                        }`}
                        onClick={() => toggleLearned(item.id)}
                      >
                        {isLearned ? (
                          <FaTimesCircle size={17} />
                        ) : (
                          <BookmarkIcon size={17} />
                        )}

                        {isLearned ? "বাদ দিন" : "শেখা হয়েছে"}
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

            <h2 className="mt-4 text-lg font-semibold">No vocabulary found</h2>

            <p className="mt-2 text-sm text-base-content/60">
              Try another search term or change the selected filters.
            </p>

            <button
              type="button"
              className="btn btn-primary btn-sm mt-4"
              onClick={() => {
                setSearch("");
                setActiveTab("all");
                changeDifficulty("all");
              }}
            >
              Clear all filters
            </button>
          </section>
        )}

        {/* Pagination */}
        {filteredWords.length > PAGE_SIZE && (
          <nav
            className="flex flex-wrap items-center justify-center gap-2 py-3"
            aria-label="Vocabulary pagination"
          >
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              disabled={currentPage === 1}
              onClick={() => setPage((previous) => previous - 1)}
            >
              <MdChevronLeft size={20} />
              Previous
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
              Next
              <MdChevronRight size={20} />
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
