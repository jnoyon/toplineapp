import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  MdArrowForward,
  MdMenuBook,
  MdCheckCircle,
  MdSchedule,
  MdLock,
} from "react-icons/md";
import { verbs } from "../../students/data/verbs";

const SESSION_KEY = "studentSession";
const START_DATE = "2026-10-28";
const DAILY_COUNT = 10;

function getSetInfo() {
  if (!verbs.length || DAILY_COUNT < 1) return null;

  const totalSets = Math.ceil(verbs.length / DAILY_COUNT);
  const [year, month, day] = START_DATE.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsed = Math.max(0, Math.floor((today - start) / 86400000));
  const setNumber = (elapsed % totalSets) + 1;
  const cycle = Math.floor(elapsed / totalSets);

  return {
    setNumber,
    setKey: `${START_DATE.replaceAll("-", "")}_count${DAILY_COUNT}_set${setNumber}_cycle${cycle}`,
  };
}

function readExam(studentId, setKey) {
  try {
    const raw = localStorage.getItem(
      `topline-verbs-result-${studentId}_${setKey}`,
    );
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Unable to read verb result:", error);
    return null;
  }
}

export default function VerbWidget() {
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    try {
      const rawSession = localStorage.getItem(SESSION_KEY);
      if (!rawSession) return;

      const session = JSON.parse(rawSession);
      if (session?.role !== "student" || !session?.documentId) return;

      setLoggedIn(true);
      const setInfo = getSetInfo();
      if (!setInfo) {
        setError(true);
        return;
      }

      const result = readExam(String(session.documentId), setInfo.setKey);
      setExam(
        result
          ? { ...result, setNumber: setInfo.setNumber }
          : {
              status: "not-started",
              mark: 0,
              setNumber: setInfo.setNumber,
            },
      );
    } catch (err) {
      console.error("VerbWidget:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const status = exam?.status;
  let statusContent = (
    <p className="mt-1 flex items-center gap-1 text-xs text-base-content/60 sm:text-sm">
      <MdSchedule size={16} /> আজকের Verb Conjugation পরীক্ষা এখনো দেওয়া হয়নি।
    </p>
  );
  let buttonText = "দেখুন";
  let buttonClass = "btn btn-secondary btn-sm shrink-0";
  let Icon = MdArrowForward;

  if (!loggedIn && !loading) {
    statusContent = (
      <p className="mt-1 text-xs text-warning sm:text-sm">
        Verb Conjugation পরীক্ষার জন্য শিক্ষার্থী হিসেবে লগইন করুন।
      </p>
    );
    buttonText = "লগইন করুন";
  } else if (loading) {
    statusContent = (
      <p className="mt-1 text-xs text-base-content/60 sm:text-sm">
        পরীক্ষার তথ্য লোড হচ্ছে...
      </p>
    );
    buttonText = "লোড হচ্ছে";
  } else if (error) {
    statusContent = (
      <p className="mt-1 text-xs text-error sm:text-sm">
        পরীক্ষার তথ্য লোড করা যায়নি।
      </p>
    );
    buttonText = "আবার চেষ্টা করুন";
  } else if (status === "in-progress") {
    statusContent = (
      <p className="mt-1 flex items-center gap-1 text-xs text-info sm:text-sm">
        <MdSchedule size={16} /> পরীক্ষা অসম্পূর্ণ। বাকি সময়ের মধ্যে উত্তর দিন।
      </p>
    );
    buttonText = "পরীক্ষা চালিয়ে যান";
  } else if (status === "submitted") {
    statusContent = (
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs sm:text-sm">
        <MdCheckCircle size={16} className="text-success" />
        <span className="text-base-content/70">আজকের প্রাপ্ত পয়েন্ট:</span>
        <span className="font-bold text-success">
          {Number(exam?.mark) || 0}
        </span>
      </p>
    );
    buttonText = "ফলাফল দেখুন";
    buttonClass = "btn btn-success btn-sm shrink-0";
    Icon = MdCheckCircle;
  } else if (status === "expired") {
    statusContent = (
      <p className="mt-1 flex items-center gap-1 text-xs text-warning sm:text-sm">
        <MdLock size={16} /> সময় শেষ হয়েছে। প্রাপ্ত পয়েন্ট: ০
      </p>
    );
    buttonText = "ফলাফল দেখুন";
    buttonClass = "btn btn-warning btn-sm shrink-0";
    Icon = MdLock;
  }

  return (
    <section className="my-4 flex items-center justify-between gap-3 rounded-2xl border border-base-300 bg-base-100 p-4 text-base-content shadow-sm transition-colors sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
          <MdMenuBook size={25} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold">
            আজকের Conjugation of Verb{" "}
            {!loading && !error && loggedIn && exam?.setNumber && (
              <span className="badge badge-secondary ml-1">
                সেট {exam.setNumber}
              </span>
            )}
          </h3>
          {statusContent}
        </div>
      </div>
      <Link
        to={loggedIn ? "/todays-verbs" : "/login"}
        className={buttonClass}
        aria-disabled={loading}
        onClick={(event) => {
          if (loading) event.preventDefault();
        }}
      >
        <span>{buttonText}</span>
        <Icon size={17} />
      </Link>
    </section>
  );
}
