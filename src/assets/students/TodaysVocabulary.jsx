import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { doc, increment, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";

import { db } from "../firebase/firebase.init";
import { wordMeanings } from "../students/data/wordMeanings";

const START_DATE = "2026-10-27";
const DAILY_COUNT = 10;
const EXAM_SECONDS = 30;
const SESSION_KEY = "studentSession";

const cardClass = "rounded-2xl border border-base-300 bg-base-100 shadow-sm";

const buttonClass = "btn btn-primary min-h-12 w-full rounded-xl font-semibold";

function getSetInfo() {
  const totalSets = Math.ceil(wordMeanings.length / DAILY_COUNT);

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
    setKey: `${START_DATE.replaceAll("-", "")}_count${DAILY_COUNT}_set${setNumber}_cycle${cycle}`,
  };
}

function getBangla(word) {
  return String(
    word?.bangla ??
      word?.bengali ??
      word?.bn ??
      word?.meaning ??
      word?.wordBangla ??
      word?.বাংলা ??
      "",
  ).trim();
}

function getEnglish(word) {
  return String(
    word?.english ??
      word?.en ??
      word?.word ??
      word?.wordEnglish ??
      word?.ইংরেজি ??
      "",
  ).trim();
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()]/g, "")
    .replace(/\s+/g, " ");
}

function getStudentSession() {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getStorageKey(studentId, setKey) {
  return `topline-vocabulary-result-${studentId}_${setKey}`;
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

export default function TodaysVocabulary() {
  const navigate = useNavigate();

  const [student] = useState(getStudentSession);
  const [phase, setPhase] = useState("loading");
  const [exam, setExam] = useState(null);
  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(EXAM_SECONDS);
  const [saving, setSaving] = useState(false);

  // Prevent multiple submissions from timer and form events.
  const submittedRef = useRef(false);

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

    return wordMeanings
      .slice(startIndex, startIndex + DAILY_COUNT)
      .filter((word) => getBangla(word) && getEnglish(word));
  }, [setInfo]);

  const finishExam = useCallback(
    async (expired = false) => {
      if (submittedRef.current || !storageKey || !studentId || !exam) {
        return;
      }

      // Read the latest saved state before submitting.
      const saved = readSavedExam(storageKey);

      if (saved?.status === "submitted" || saved?.status === "expired") {
        submittedRef.current = true;
        setExam(saved);
        setPhase("result");
        return;
      }

      if (saved?.status !== "in-progress") return;

      // Do not accept an answer after the deadline.
      const timeExpired = Date.now() >= saved.expiresAt;
      const didExpire = expired || timeExpired;

      submittedRef.current = true;
      setSaving(true);

      const currentAnswer = answer.trim();

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

      // Persist the result before performing any network operation.
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
        console.error("Vocabulary point update failed:", error);

        toast.error(
          correct
            ? "উত্তর সঠিক, কিন্তু পয়েন্ট আপডেট হয়নি। Admin-কে জানাও।"
            : "পয়েন্ট বা পরীক্ষার তথ্য আপডেট করতে সমস্যা হয়েছে।",
        );
      } finally {
        setSaving(false);
      }
    },
    [answer, exam, studentId, storageKey],
  );

  // Restore exam state once the student and daily set are known.
  useEffect(() => {
    if (!studentId || student?.role !== "student" || !setInfo) {
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
      setSeconds(Math.max(0, Math.ceil((saved.expiresAt - Date.now()) / 1000)));
      setPhase("exam");
      return;
    }

    submittedRef.current = false;
    setExam(null);
    setAnswer("");
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

    const question = shuffle(todayWords)[0];

    const newExam = {
      status: "in-progress",
      questionBangla: getBangla(question),
      correctAnswer: getEnglish(question),
      expiresAt: Date.now() + EXAM_SECONDS * 1000,
      mark: 0,
    };

    submittedRef.current = false;

    localStorage.setItem(storageKey, JSON.stringify(newExam));

    setExam(newExam);
    setAnswer("");
    setSeconds(EXAM_SECONDS);
    setPhase("exam");
  }

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-base-200 p-4 text-base-content">
        <div className={`${cardClass} mx-auto mt-8 max-w-lg p-6`}>
          <span className="loading loading-spinner loading-md" />
          <p className="mt-3 text-sm text-base-content/60">
            Vocabulary লোড হচ্ছে...
          </p>
        </div>
      </main>
    );
  }

  if (phase === "invalid-session") {
    return (
      <main className="min-h-screen bg-base-200 p-4 text-base-content">
        <div className={`${cardClass} mx-auto mt-8 max-w-md p-6`}>
          <h1 className="text-lg font-bold">শিক্ষার্থী লগইন প্রয়োজন</h1>

          <p className="mt-2 text-sm text-base-content/65">
            Vocabulary ব্যবহার করতে শিক্ষার্থী হিসেবে লগইন করো।
          </p>

          <Link to="/login" className={`${buttonClass} mt-5`}>
            লগইন
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-200 px-3 py-4 text-base-content sm:px-5 sm:py-6">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate("/portal", { replace: true })}
              className="text-xs font-medium text-base-content/55 hover:text-primary"
            >
              ← পোর্টাল
            </button>

            <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">
              Daily Vocabulary
            </h1>

            <p className="mt-1 text-xs text-base-content/55">
              সেট {setInfo?.setNumber} · প্রতিদিন ১টি লিখিত পরীক্ষা
            </p>
          </div>

          <div className="shrink-0 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-center">
            <p className="text-[10px] font-medium text-base-content/50">
              মোট পয়েন্ট
            </p>
            <p className="text-lg font-extrabold">১</p>
          </div>
        </header>

        {phase === "study" && (
          <>
            <section className={`${cardClass} p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">আজকের শব্দগুলো</h2>
                  <p className="mt-1 text-xs text-base-content/55">
                    আগে শব্দ ও অর্থ দেখে নাও। তারপর পরীক্ষা শুরু করো।
                  </p>
                </div>

                <span className="badge badge-primary badge-outline shrink-0">
                  {todayWords.length} শব্দ
                </span>
              </div>

              <div className="mt-4 divide-y divide-base-300">
                {todayWords.map((word, index) => (
                  <div
                    key={`${getBangla(word)}-${index}`}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{getBangla(word)}</p>
                      <p className="mt-1 break-words text-sm text-base-content/60">
                        {getEnglish(word)}
                      </p>
                    </div>

                    <span className="text-xs tabular-nums text-base-content/35">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${cardClass} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">লিখিত পরীক্ষা (১টি প্রশ্ন) </h2>
                  <p className="mt-1 text-xs text-base-content/55">
                    বাংলা শব্দ দেখে ইংরেজি লিখতে হবে।
                  </p>
                </div>

                <div className="rounded-xl bg-primary/10 px-3 py-2 text-right">
                  <p className="text-lg font-extrabold text-primary">
                    30 সেকেন্ড
                  </p>
                  <p className="text-[10px] text-base-content/55">সময়</p>
                </div>
              </div>

              <button
                type="button"
                className={`${buttonClass} mt-4`}
                onClick={startExam}
              >
                পরীক্ষা শুরু করো
              </button>

              <p className="mt-3 text-center text-[11px] leading-5 text-base-content/50">
                পরীক্ষা শুরু হলে শব্দের তালিকা আর দেখা যাবে না। প্রতি সেটে
                একবারই পরীক্ষা দেওয়া যাবে।
              </p>
            </section>
          </>
        )}

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
                নিচের বাংলা শব্দটির ইংরেজি লেখো
              </p>

              <h2 className="mt-4 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
                {exam.questionBangla}
              </h2>

              <p className="mt-3 text-sm text-base-content/50">
                English spelling
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
                placeholder="Type your answer..."
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
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
                  "উত্তর জমা দাও"
                )}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-base-content/45">
              উত্তর জমা দিলে পরীক্ষা শেষ হবে।
            </p>
          </section>
        )}

        {phase === "result" && exam && (
          <section className={`${cardClass} p-5 sm:p-7`}>
            <div className="text-center">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold ${
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
                  ? "তুমি ১ পয়েন্ট পেয়েছ।"
                  : "এই পরীক্ষায় কোনো পয়েন্ট পাওয়া যায়নি।"}
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-base-300 bg-base-200/50 p-4">
                <p className="text-xs text-base-content/50">বাংলা শব্দ</p>
                <p className="mt-1 font-bold">{exam.questionBangla}</p>
              </div>

              <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                <p className="text-xs text-base-content/50">
                  সঠিক ইংরেজি উত্তর
                </p>
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
              পোর্টালে ফিরে যাও
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
