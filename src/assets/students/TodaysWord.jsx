import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { doc, increment, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";

import { db } from "../firebase/firebase.init";
import vocabulary from "./data/modifierWords";

const START_DATE = "2026-11-11";
const DAILY_COUNT = 10;
const EXAM_SECONDS = 30;
const SESSION_KEY = "studentSession";

const cardClass =
  "rounded-2xl border border-base-300/80 bg-base-100 shadow-sm transition-shadow duration-200 hover:shadow-md";

const buttonClass = "btn btn-primary min-h-12 w-full rounded-xl font-semibold";

function getStudentSession() {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getSetInfo() {
  const totalSets = Math.ceil(vocabulary.length / DAILY_COUNT);

  if (!totalSets) return null;

  const [year, month, day] = START_DATE.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);

  const now = new Date();
  const current = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const elapsed = Math.max(0, Math.floor((current - start) / 86400000));

  const setNumber = (elapsed % totalSets) + 1;
  const cycle = Math.floor(elapsed / totalSets);

  return {
    setNumber,
    totalSets,
    setKey: `${START_DATE.replaceAll("-", "")}_count${DAILY_COUNT}_set${setNumber}_cycle${cycle}`,
  };
}

function getWordMeaning(word) {
  return String(
    word?.meaning ?? word?.bangla ?? word?.bengali ?? word?.bn ?? "",
  ).trim();
}

function getWordEnglish(word) {
  return String(word?.word ?? word?.english ?? word?.en ?? "").trim();
}

function getSentence(word) {
  return String(
    word?.sentence ?? word?.example ?? word?.exampleSentence ?? "",
  ).trim();
}

function getSentenceMeaning(word) {
  return String(
    word?.sentenceMeaning ?? word?.exampleMeaning ?? word?.sentenceBangla ?? "",
  ).trim();
}

function getPronunciation(word) {
  return String(word?.pronunciation ?? word?.pronounce ?? "").trim();
}

function getPartOfSpeech(word) {
  return String(word?.partOfSpeech ?? word?.pos ?? "").trim();
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()]/g, "")
    .replace(/\s+/g, " ");
}

function getStorageKey(studentId, setKey) {
  return `topline-todays-word-${studentId}_${setKey}`;
}

function readSavedExam(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }

  return result;
}

export default function TodaysWord() {
  const navigate = useNavigate();

  const [student] = useState(getStudentSession);

  const [phase, setPhase] = useState("loading");
  const [search, setSearch] = useState("");
  const [exam, setExam] = useState(null);
  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(EXAM_SECONDS);
  const [saving, setSaving] = useState(false);

  const submittedRef = useRef(false);
  const answerRef = useRef("");

  const studentId = String(student?.documentId ?? student?.studentId ?? "");

  const setInfo = useMemo(() => getSetInfo(), []);

  const storageKey = useMemo(
    () =>
      studentId && setInfo ? getStorageKey(studentId, setInfo.setKey) : "",
    [studentId, setInfo],
  );

  const todayWords = useMemo(() => {
    if (!setInfo) return [];

    const startIndex = (setInfo.setNumber - 1) * DAILY_COUNT;

    return vocabulary
      .slice(startIndex, startIndex + DAILY_COUNT)
      .filter((word) => getWordMeaning(word) && getWordEnglish(word));
  }, [setInfo]);

  const filteredWords = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return todayWords;

    return todayWords.filter((word) => {
      const searchableText = [
        getWordEnglish(word),
        getWordMeaning(word),
        getSentence(word),
        getSentenceMeaning(word),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [todayWords, search]);

  const progress = setInfo?.totalSets
    ? (setInfo.setNumber / setInfo.totalSets) * 100
    : 0;

  // Submit exam and update point.
  const finishExam = useCallback(
    async (expired = false) => {
      if (submittedRef.current || !storageKey || !studentId || !exam) {
        return;
      }

      const saved = readSavedExam(storageKey);

      if (saved?.status === "submitted" || saved?.status === "expired") {
        submittedRef.current = true;
        setExam(saved);
        setPhase("result");
        return;
      }

      if (saved?.status !== "in-progress") return;

      const timeExpired = Date.now() >= saved.expiresAt;
      const didExpire = expired || timeExpired;

      submittedRef.current = true;
      setSaving(true);

      const currentAnswer = answerRef.current.trim();

      const correct =
        !didExpire &&
        normalizeAnswer(currentAnswer) === normalizeAnswer(saved.correctAnswer);

      const result = {
        ...saved,
        status: didExpire ? "expired" : "submitted",
        submittedAnswer: didExpire ? "" : currentAnswer,
        mark: correct ? 1 : 0,
        submittedAt: new Date().toISOString(),
      };

      // Save result first to prevent duplicate submissions.
      localStorage.setItem(storageKey, JSON.stringify(result));

      setExam(result);
      setPhase("result");

      try {
        if (correct) {
          await updateDoc(doc(db, "students", studentId), {
            point: increment(1),
          });

          toast.success("সঠিক উত্তর! ১ পয়েন্ট পেয়েছ।");
        } else if (didExpire) {
          toast.error("সময় শেষ হয়েছে।");
        } else {
          toast("উত্তর সঠিক হয়নি।");
        }
      } catch (error) {
        console.error("Today's Word point update failed:", error);

        toast.error(
          correct
            ? "উত্তর সঠিক, কিন্তু পয়েন্ট আপডেট হয়নি। Admin-কে জানাও।"
            : "পরীক্ষার ফলাফল আপডেট করতে সমস্যা হয়েছে।",
        );
      } finally {
        setSaving(false);
      }
    },
    [exam, studentId, storageKey],
  );

  // Restore saved exam state.
  useEffect(() => {
    if (!studentId || student?.role !== "student" || !setInfo || !storageKey) {
      setPhase("invalid-session");
      return;
    }

    const saved = readSavedExam(storageKey);

    if (saved?.status === "submitted" || saved?.status === "expired") {
      submittedRef.current = true;
      setExam(saved);
      setPhase("result");
      return;
    }

    if (saved?.status === "in-progress") {
      if (saved.expiresAt <= Date.now()) {
        const expired = {
          ...saved,
          status: "expired",
          submittedAnswer: "",
          mark: 0,
          submittedAt: new Date().toISOString(),
        };

        localStorage.setItem(storageKey, JSON.stringify(expired));

        submittedRef.current = true;
        setExam(expired);
        setPhase("result");
        return;
      }

      submittedRef.current = false;
      setExam(saved);
      setAnswer("");
      answerRef.current = "";

      setSeconds(Math.max(0, Math.ceil((saved.expiresAt - Date.now()) / 1000)));

      setPhase("exam");
      return;
    }

    submittedRef.current = false;
    setExam(null);
    setAnswer("");
    answerRef.current = "";
    setPhase("study");
  }, [studentId, student?.role, storageKey, setInfo]);

  // Countdown timer.
  useEffect(() => {
    if (phase !== "exam" || !exam?.expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((exam.expiresAt - Date.now()) / 1000),
      );

      setSeconds(remaining);

      if (remaining <= 0) {
        void finishExam(true);
      }
    };

    updateTimer();

    const timer = window.setInterval(updateTimer, 250);

    return () => window.clearInterval(timer);
  }, [phase, exam?.expiresAt, finishExam]);

  function startExam() {
    if (!storageKey || !todayWords.length) {
      toast.error("আজকের শব্দের তালিকা পাওয়া যায়নি।");
      return;
    }

    const previous = readSavedExam(storageKey);

    if (previous) {
      setExam(previous);

      if (previous.status === "in-progress") {
        if (previous.expiresAt <= Date.now()) {
          const expired = {
            ...previous,
            status: "expired",
            submittedAnswer: "",
            mark: 0,
            submittedAt: new Date().toISOString(),
          };

          localStorage.setItem(storageKey, JSON.stringify(expired));

          submittedRef.current = true;
          setExam(expired);
          setPhase("result");
        } else {
          submittedRef.current = false;

          setSeconds(
            Math.max(0, Math.ceil((previous.expiresAt - Date.now()) / 1000)),
          );

          setPhase("exam");
        }
      } else {
        submittedRef.current = true;
        setPhase("result");
      }

      return;
    }

    // Only the word is used in the question, not the sentence.
    const question = shuffle(todayWords)[0];

    const newExam = {
      status: "in-progress",
      questionBangla: getWordMeaning(question),
      correctAnswer: getWordEnglish(question),
      expiresAt: Date.now() + EXAM_SECONDS * 1000,
      mark: 0,
    };

    submittedRef.current = false;
    answerRef.current = "";

    localStorage.setItem(storageKey, JSON.stringify(newExam));

    setExam(newExam);
    setAnswer("");
    setSeconds(EXAM_SECONDS);
    setPhase("exam");
  }

  // Loading screen.
  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-base-200 p-4 text-base-content">
        <div className={`${cardClass} mx-auto mt-8 max-w-lg p-6`}>
          <span className="loading loading-spinner loading-md text-primary" />
          <p className="mt-3 text-sm text-base-content/60">
            Today's Word লোড হচ্ছে...
          </p>
        </div>
      </main>
    );
  }

  // Invalid session.
  if (phase === "invalid-session") {
    return (
      <main className="min-h-screen bg-base-200 p-4 text-base-content">
        <div className={`${cardClass} mx-auto mt-8 max-w-md p-6`}>
          <h1 className="text-lg font-bold">শিক্ষার্থী লগইন প্রয়োজন</h1>

          <p className="mt-2 text-sm text-base-content/65">
            Today's Word ব্যবহার করতে শিক্ষার্থী হিসেবে লগইন করুন।
          </p>

          <Link to="/login" className={`${buttonClass} mt-5`}>
            লগইন করুন
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-200 px-3 py-5 text-base-content sm:px-5 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <header className="relative overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 p-5 shadow-sm sm:p-7">
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-secondary/10 blur-3xl" />

          <div className="relative">
            <button
              type="button"
              onClick={() => navigate("/portal", { replace: true })}
              className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-base-content/55 transition hover:text-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m15 19-7-7 7-7"
                />
              </svg>
              পোর্টালে ফিরে যান
            </button>

            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  DAILY LEARNING
                </div>

                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  Today's Word
                </h1>

                <p className="mt-2 max-w-md text-sm leading-6 text-base-content/55">
                  প্রতিদিন নতুন ইংরেজি শব্দ শিখুন, উদাহরণ বাক্য পড়ুন এবং নিজের
                  Vocabulary আরও সমৃদ্ধ করুন।
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-base-300 bg-base-200/70 p-3 sm:min-w-36 sm:flex-col sm:gap-1 sm:p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.7}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>

                <div className="sm:text-center">
                  <p className="text-2xl font-black text-primary">
                    {todayWords.length}
                  </p>
                  <p className="text-xs font-medium text-base-content/50">
                    Today's Words
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-base-300 pt-5">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-base-content/60">
                  Vocabulary Progress
                </span>

                <span className="font-bold text-primary">
                  Set {setInfo?.setNumber} / {setInfo?.totalSets}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-base-300">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Study Phase */}
        {phase === "study" && (
          <>
            <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex h-12 items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-4 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 shrink-0 text-base-content/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m20 20-4-4"
                  />
                </svg>

                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="শব্দ বা অর্থ দিয়ে খুঁজুন..."
                  className="h-full w-full bg-transparent text-sm outline-none placeholder:text-base-content/35"
                />
              </label>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm sm:justify-center">
                <span className="text-xs font-medium text-base-content/55">
                  মোট শব্দ
                </span>
                <span className="text-lg font-extrabold text-primary">
                  {filteredWords.length}
                </span>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight">
                    আজকের শব্দসমূহ
                  </h2>
                  <p className="mt-1 text-xs text-base-content/50">
                    শব্দের অর্থ ও উদাহরণ বাক্য ভালোভাবে পড়ুন।
                  </p>
                </div>

                <span className="badge badge-primary badge-outline">
                  Set {setInfo?.setNumber}
                </span>
              </div>

              {filteredWords.length === 0 ? (
                <div className={`${cardClass} px-5 py-12 text-center`}>
                  <h3 className="font-bold">কোনো শব্দ পাওয়া যায়নি</h3>
                  <p className="mt-2 text-sm text-base-content/50">
                    অন্য কোনো শব্দ দিয়ে অনুসন্ধান করুন।
                  </p>

                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="btn btn-primary btn-sm mt-4 rounded-lg"
                  >
                    অনুসন্ধান মুছুন
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredWords.map((word, index) => {
                    const sentence = getSentence(word);
                    const sentenceMeaning = getSentenceMeaning(word);

                    return (
                      <article
                        key={`${getWordEnglish(word)}-${index}`}
                        className={`${cardClass} overflow-hidden`}
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">
                              {String(todayWords.indexOf(word) + 1).padStart(
                                2,
                                "0",
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="break-words text-xl font-extrabold tracking-tight sm:text-2xl">
                                  {getWordEnglish(word)}
                                </h3>

                                {getPartOfSpeech(word) && (
                                  <span className="badge badge-ghost badge-sm font-semibold">
                                    {getPartOfSpeech(word)}
                                  </span>
                                )}
                              </div>

                              {getPronunciation(word) && (
                                <p className="mt-1 text-xs font-medium text-base-content/45">
                                  / {getPronunciation(word)} /
                                </p>
                              )}

                              <p className="mt-2 text-sm font-semibold text-primary">
                                {getWordMeaning(word) || "অর্থ দেওয়া হয়নি"}
                              </p>
                            </div>
                          </div>

                          {sentence && (
                            <div className="mt-5 rounded-xl border border-base-300 bg-base-200/60 p-4">
                              <div className="mb-2 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/45">
                                  Example Sentence
                                </p>
                              </div>

                              <p className="text-sm font-semibold leading-7 text-base-content sm:text-base">
                                {sentence}
                              </p>

                              {sentenceMeaning && (
                                <>
                                  <div className="my-3 border-t border-base-300" />

                                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/40">
                                    বাংলা অনুবাদ
                                  </p>

                                  <p className="mt-2 text-sm leading-7 text-base-content/70">
                                    {sentenceMeaning}
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Exam Start */}
            <section className={`${cardClass} p-5 sm:p-6`}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <span className="badge badge-primary badge-outline">
                    Daily Test
                  </span>

                  <h2 className="mt-3 text-lg font-extrabold">
                    আজকের লিখিত পরীক্ষা
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-base-content/55">
                    বাংলা অর্থ দেখে সঠিক ইংরেজি শব্দটি লিখতে হবে।
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3 sm:flex-col sm:gap-0 sm:text-center">
                  <span className="text-2xl font-black text-primary">30s</span>
                  <span className="text-xs font-medium text-base-content/55">
                    সময়
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-base-300 bg-base-200/50 p-3">
                  <p className="text-xs text-base-content/50">প্রশ্ন</p>
                  <p className="mt-1 font-bold">১টি শব্দ</p>
                </div>

                <div className="rounded-xl border border-base-300 bg-base-200/50 p-3">
                  <p className="text-xs text-base-content/50">সঠিক উত্তরে</p>
                  <p className="mt-1 font-bold text-success">১ পয়েন্ট</p>
                </div>
              </div>

              <button
                type="button"
                onClick={startExam}
                className={`${buttonClass} mt-4`}
              >
                পরীক্ষা শুরু করুন
              </button>

              <p className="mt-3 text-center text-[11px] leading-5 text-base-content/45">
                প্রতি সেটে একবার পরীক্ষা দেওয়া যাবে। পরীক্ষা শুরু হলে শব্দের
                তালিকা আর দেখা যাবে না।
              </p>
            </section>
          </>
        )}

        {/* Exam Phase */}
        {phase === "exam" && exam && (
          <section className={`${cardClass} p-5 sm:p-7`}>
            <div className="flex items-center justify-between gap-3">
              <span className="badge badge-primary badge-outline">
                লিখিত পরীক্ষা
              </span>

              <span
                className={`font-mono text-lg font-bold tabular-nums ${
                  seconds <= 10 ? "text-error" : "text-primary"
                }`}
              >
                00:{String(seconds).padStart(2, "0")}
              </span>
            </div>

            <div className="my-8 text-center">
              <p className="text-xs font-medium text-base-content/50">
                নিচের বাংলা অর্থটির ইংরেজি শব্দ লেখো
              </p>

              <h2 className="mt-4 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
                {exam.questionBangla}
              </h2>

              <p className="mt-3 text-sm text-base-content/50">
                English word only
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void finishExam(false);
              }}
              className="space-y-4"
            >
              <input
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="input input-bordered h-14 w-full rounded-xl bg-base-100 text-center text-lg font-semibold text-base-content placeholder:text-base-content/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Type the English word..."
                value={answer}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  answerRef.current = event.target.value;
                }}
                disabled={saving || seconds <= 0}
              />

              <button
                type="submit"
                disabled={saving || !answer.trim() || seconds <= 0}
                className={buttonClass}
              >
                {saving ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  "উত্তর জমা দিন"
                )}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-base-content/45">
              উত্তর জমা দিলে পরীক্ষা শেষ হবে।
            </p>
          </section>
        )}

        {/* Result Phase */}
        {phase === "result" && exam && (
          <section className={`${cardClass} p-5 sm:p-7`}>
            <div className="text-center">
              <div
                className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-black ${
                  exam.mark === 1
                    ? "bg-success/10 text-success"
                    : "bg-base-200 text-base-content/60"
                }`}
              >
                {exam.mark === 1 ? "1/1" : "0/1"}
              </div>

              <h2 className="mt-4 text-xl font-extrabold">
                {exam.status === "expired"
                  ? "সময় শেষ"
                  : exam.mark === 1
                    ? "সঠিক উত্তর"
                    : "পরীক্ষা সম্পন্ন"}
              </h2>

              <p className="mt-1 text-sm text-base-content/55">
                {exam.mark === 1
                  ? "অভিনন্দন! তুমি ১ পয়েন্ট পেয়েছ।"
                  : "এই পরীক্ষায় কোনো পয়েন্ট পাওয়া যায়নি।"}
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-base-300 bg-base-200/50 p-4">
                <p className="text-xs text-base-content/50">বাংলা অর্থ</p>
                <p className="mt-1 font-bold">{exam.questionBangla}</p>
              </div>

              <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                <p className="text-xs text-base-content/50">সঠিক ইংরেজি শব্দ</p>
                <p className="mt-1 break-words text-lg font-bold text-success">
                  {exam.correctAnswer}
                </p>
              </div>

              {exam.status !== "expired" && (
                <div className="rounded-xl border border-base-300 bg-base-200/50 p-4">
                  <p className="text-xs text-base-content/50">তোমার উত্তর</p>
                  <p className="mt-1 break-words font-semibold">
                    {exam.submittedAnswer || "কোনো উত্তর দেওয়া হয়নি"}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate("/portal", { replace: true })}
              className={`${buttonClass} mt-5`}
            >
              পোর্টালে ফিরে যান
            </button>

            <p className="mt-3 text-center text-[11px] leading-5 text-base-content/45">
              এই সেটের পরীক্ষা সম্পন্ন হয়েছে। একই সেটে আবার পরীক্ষা দেওয়া যাবে
              না।
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
