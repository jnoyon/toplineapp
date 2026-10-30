import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { doc, increment, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";

import { verbs } from "./data/verbs";
import { db } from "../firebase/firebase.init";

const START_DATE = "2026-10-28";
const DAILY_COUNT = 5;
const EXAM_SECONDS = 60;
const SESSION_KEY = "studentSession";
const cardClass = "rounded-2xl border border-base-300 bg-base-100 shadow-sm";
const buttonClass = "btn btn-primary min-h-12 w-full rounded-xl font-semibold";

function getSetInfo() {
  const totalSets = Math.ceil(verbs.length / DAILY_COUNT);
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

function getSession() {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getStorageKey(studentId, setKey) {
  return `topline-verbs-result-${studentId}_${setKey}`;
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
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()]/g, "")
    .replace(/\s+/g, " ");
}

function getForms(verb) {
  return {
    v1: String(verb?.forms?.v1 ?? "").trim(),
    v2: String(verb?.forms?.v2 ?? "").trim(),
    v3: String(verb?.forms?.v3 ?? "").trim(),
  };
}

function isCorrectForm(answer, correct) {
  const accepted = String(correct ?? "")
    .split("/")
    .map(normalizeAnswer);
  return accepted.includes(normalizeAnswer(answer));
}

export default function TodaysVerbs() {
  const navigate = useNavigate();
  const [student] = useState(getSession);
  const [phase, setPhase] = useState("loading");
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({ v1: "", v2: "", v3: "" });
  const [seconds, setSeconds] = useState(EXAM_SECONDS);
  const [saving, setSaving] = useState(false);
  const submittedRef = useRef(false);

  const studentId = String(student?.documentId ?? student?.studentId ?? "");
  const setInfo = useMemo(() => getSetInfo(), []);
  const storageKey = useMemo(
    () =>
      studentId && setInfo ? getStorageKey(studentId, setInfo.setKey) : "",
    [studentId, setInfo],
  );
  const todayVerbs = useMemo(() => {
    if (!setInfo) return [];
    const startIndex = (setInfo.setNumber - 1) * DAILY_COUNT;
    return verbs.slice(startIndex, startIndex + DAILY_COUNT).filter((verb) => {
      const forms = getForms(verb);
      return verb?.word && forms.v1 && forms.v2 && forms.v3;
    });
  }, [setInfo]);

  const finishExam = useCallback(
    async (expired = false) => {
      if (submittedRef.current || !storageKey || !studentId || !exam) return;

      const saved = readSavedExam(storageKey);
      if (saved?.status === "submitted" || saved?.status === "expired") {
        submittedRef.current = true;
        setExam(saved);
        setPhase("result");
        return;
      }
      if (saved?.status !== "in-progress") return;

      const didExpire = expired || Date.now() >= saved.expiresAt;
      submittedRef.current = true;
      setSaving(true);

      const submittedAnswers = didExpire ? { v1: "", v2: "", v3: "" } : answers;
      const correctForms = saved.correctForms;
      const correct =
        !didExpire &&
        ["v1", "v2", "v3"].every((key) =>
          isCorrectForm(submittedAnswers[key], correctForms[key]),
        );

      const result = {
        ...saved,
        status: didExpire ? "expired" : "submitted",
        submittedAnswers,
        mark: correct ? 1 : 0,
        submittedAt: new Date().toISOString(),
      };

      // Save locally first so refreshes cannot restart a completed exam.
      localStorage.setItem(storageKey, JSON.stringify(result));
      setExam(result);
      setPhase("result");

      try {
        if (correct) {
          await updateDoc(doc(db, "students", studentId), {
            point: increment(1),
          });
          toast.success("সবগুলো উত্তর সঠিক! ১ পয়েন্ট পেয়েছ।");
        } else if (didExpire) {
          toast.error("সময় শেষ হয়েছে।");
        } else {
          toast("সবগুলো Form সঠিক হয়নি।");
        }
      } catch (error) {
        console.error("Verb point update failed:", error);
        toast.error(
          correct
            ? "উত্তর সঠিক, কিন্তু পয়েন্ট আপডেট হয়নি। Admin-কে জানাও।"
            : "পরীক্ষার তথ্য আপডেট করতে সমস্যা হয়েছে।",
        );
      } finally {
        setSaving(false);
      }
    },
    [answers, exam, studentId, storageKey],
  );

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
          submittedAnswers: { v1: "", v2: "", v3: "" },
          mark: 0,
          submittedAt: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(expired));
        submittedRef.current = true;
        setExam(expired);
        setPhase("result");
      } else {
        submittedRef.current = false;
        setExam(saved);
        setAnswers({ v1: "", v2: "", v3: "" });
        setSeconds(
          Math.max(0, Math.ceil((saved.expiresAt - Date.now()) / 1000)),
        );
        setPhase("exam");
      }
      return;
    }

    submittedRef.current = false;
    setExam(null);
    setAnswers({ v1: "", v2: "", v3: "" });
    setPhase("study");
  }, [studentId, student?.role, storageKey, setInfo]);

  useEffect(() => {
    if (phase !== "exam" || !exam?.expiresAt) return;
    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((exam.expiresAt - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (remaining <= 0) void finishExam(true);
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [phase, exam?.expiresAt, finishExam]);

  function startExam() {
    if (!storageKey || !todayVerbs.length) {
      toast.error("আজকের Verb তালিকা পাওয়া যায়নি।");
      return;
    }

    const previous = readSavedExam(storageKey);
    if (previous) {
      setExam(previous);
      if (
        previous.status === "in-progress" &&
        previous.expiresAt > Date.now()
      ) {
        submittedRef.current = false;
        setSeconds(
          Math.max(0, Math.ceil((previous.expiresAt - Date.now()) / 1000)),
        );
        setPhase("exam");
      } else if (previous.status === "in-progress") {
        const expired = {
          ...previous,
          status: "expired",
          submittedAnswers: { v1: "", v2: "", v3: "" },
          mark: 0,
          submittedAt: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(expired));
        submittedRef.current = true;
        setExam(expired);
        setPhase("result");
      } else {
        submittedRef.current = true;
        setPhase("result");
      }
      return;
    }

    const question = shuffle(todayVerbs)[0];
    const correctForms = getForms(question);
    const newExam = {
      status: "in-progress",
      questionId: question.id,
      questionWord: question.word,
      pronunciation: question.pronunciation ?? "",
      meaning: question.meaning ?? "",
      correctForms,
      expiresAt: Date.now() + EXAM_SECONDS * 1000,
      mark: 0,
    };

    submittedRef.current = false;
    localStorage.setItem(storageKey, JSON.stringify(newExam));
    setExam(newExam);
    setAnswers({ v1: "", v2: "", v3: "" });
    setSeconds(EXAM_SECONDS);
    setPhase("exam");
  }

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-base-200 p-4 text-base-content">
        <div className={`${cardClass} mx-auto mt-8 max-w-lg p-6`}>
          <span className="loading loading-spinner loading-md" />
          <p className="mt-3 text-sm text-base-content/60">
            Verb Conjugation লোড হচ্ছে...
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
            Verb Conjugation ব্যবহার করতে শিক্ষার্থী হিসেবে লগইন করো।
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
              Daily Verb Conjugation
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
                  <h2 className="font-bold">আজকের Verb-গুলো</h2>
                  <p className="mt-1 text-xs text-base-content/55">
                    পরীক্ষার আগে V1, V2 ও V3 দেখে অনুশীলন করো।
                  </p>
                </div>
                <span className="badge badge-primary badge-outline shrink-0">
                  {todayVerbs.length}টি Verb
                </span>
              </div>
              <div className="mt-4 divide-y divide-base-300">
                {todayVerbs.map((verb, index) => (
                  <div
                    key={verb.id ?? `${verb.word}-${index}`}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold">
                          {verb.word}{" "}
                          <span className="ml-1 text-xs font-normal text-base-content/50">
                            {verb.pronunciation}
                          </span>
                        </p>
                        <p className="mt-0.5 text-sm text-base-content/65">
                          অর্থ: {verb.meaning}
                        </p>
                      </div>
                      <span className="text-xs tabular-nums text-base-content/35">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-lg bg-base-200 p-2">
                        <p className="text-[10px] text-base-content/50">V1</p>
                        <p className="break-words font-semibold">
                          {verb.forms.v1}
                        </p>
                      </div>
                      <div className="rounded-lg bg-base-200 p-2">
                        <p className="text-[10px] text-base-content/50">V2</p>
                        <p className="break-words font-semibold">
                          {verb.forms.v2}
                        </p>
                      </div>
                      <div className="rounded-lg bg-base-200 p-2">
                        <p className="text-[10px] text-base-content/50">V3</p>
                        <p className="break-words font-semibold">
                          {verb.forms.v3}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className={`${cardClass} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">লিখিত পরীক্ষা (১টি প্রশ্ন)</h2>
                  <p className="mt-1 text-xs text-base-content/55">
                    একটি Verb-এর V1, V2 ও V3 লিখতে হবে।
                  </p>
                </div>
                <div className="rounded-xl bg-primary/10 px-3 py-2 text-right">
                  <p className="text-lg font-extrabold text-primary">
                    {EXAM_SECONDS} সেকেন্ড
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
                পরীক্ষা শুরু হলে তালিকা আর দেখা যাবে না। প্রতি সেটে একবারই
                পরীক্ষা দেওয়া যাবে।
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
                className={`font-mono text-lg font-bold tabular-nums ${seconds <= 10 ? "text-error" : "text-primary"}`}
              >
                00:{String(seconds).padStart(2, "0")}
              </span>
            </div>
            <div className="my-7 text-center">
              <p className="text-xs font-medium text-base-content/50">
                নিচের Verb-টির তিনটি form লেখো
              </p>
              <h2 className="mt-3 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
                {exam.questionWord}
              </h2>
              {exam.pronunciation && (
                <p className="mt-1 text-sm text-base-content/55">
                  {exam.pronunciation}
                </p>
              )}
              <p className="mt-2 text-sm text-base-content/65">
                অর্থ: {exam.meaning}
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void finishExam(false);
              }}
              className="space-y-4"
            >
              {[
                { key: "v1", label: "V1 — Base Form" },
                { key: "v2", label: "V2 — Past Form" },
                { key: "v3", label: "V3 — Past Participle" },
              ].map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="mb-1.5 block text-sm font-semibold">
                    {label}
                  </span>
                  <input
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="input input-bordered h-12 w-full rounded-xl bg-base-100 text-base-content focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={`${label} লিখো`}
                    value={answers[key]}
                    onChange={(event) =>
                      setAnswers((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                    disabled={saving || seconds <= 0}
                  />
                </label>
              ))}
              <button
                type="submit"
                disabled={
                  saving ||
                  !answers.v1.trim() ||
                  !answers.v2.trim() ||
                  !answers.v3.trim() ||
                  seconds <= 0
                }
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
              ১ পয়েন্ট পেতে তিনটি form-ই সঠিক হতে হবে।
            </p>
          </section>
        )}

        {phase === "result" && exam && (
          <section className={`${cardClass} p-5 sm:p-7`}>
            <div className="text-center">
              <div
                className={`mx-auto flex h-14 w-20 items-center justify-center rounded-2xl text-2xl font-extrabold ${exam.mark === 1 ? "bg-success/10 text-success" : "bg-base-200 text-base-content/60"}`}
              >
                {exam.mark === 1 ? "1/1" : "0/1"}
              </div>
              <h2 className="mt-4 text-xl font-extrabold">
                {exam.status === "expired"
                  ? "সময় শেষ"
                  : exam.mark === 1
                    ? "সবগুলো উত্তর সঠিক"
                    : "পরীক্ষা সম্পন্ন"}
              </h2>
              <p className="mt-1 text-sm text-base-content/55">
                {exam.mark === 1
                  ? "তুমি ১ পয়েন্ট পেয়েছ।"
                  : "এই পরীক্ষায় কোনো পয়েন্ট পাওয়া যায়নি।"}
              </p>
            </div>
            <div className="mt-6 rounded-xl border border-base-300 bg-base-200/50 p-4">
              <p className="text-xs text-base-content/50">Verb</p>
              <p className="mt-1 text-lg font-bold">
                {exam.questionWord}{" "}
                <span className="text-sm font-normal text-base-content/60">
                  — {exam.meaning}
                </span>
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {["v1", "v2", "v3"].map((key) => {
                const isCorrect =
                  exam.status !== "expired" &&
                  isCorrectForm(
                    exam.submittedAnswers?.[key],
                    exam.correctForms[key],
                  );
                return (
                  <div
                    key={key}
                    className={`rounded-xl border p-3 ${isCorrect ? "border-success/30 bg-success/5" : "border-base-300 bg-base-200/50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-base-content/55">
                        {key.toUpperCase()}
                      </span>
                      {exam.status !== "expired" && (
                        <span
                          className={`text-xs ${isCorrect ? "text-success" : "text-error"}`}
                        >
                          {isCorrect ? "সঠিক" : "ভুল"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words font-semibold">
                      সঠিক উত্তর: {exam.correctForms[key]}
                    </p>
                    {exam.status !== "expired" && (
                      <p className="mt-1 break-words text-sm text-base-content/65">
                        তোমার উত্তর:{" "}
                        {exam.submittedAnswers?.[key] ||
                          "কোনো উত্তর দেওয়া হয়নি"}
                      </p>
                    )}
                  </div>
                );
              })}
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
