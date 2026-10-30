import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  MdArrowForward,
  MdMenuBook,
  MdCheckCircle,
  MdSchedule,
  MdLock,
} from "react-icons/md";

import { wordMeanings } from "../../students/data/wordMeanings";

const SESSION_KEY = "studentSession";
const START_DATE = "2026-10-27";
const DAILY_COUNT = 10;

/* =========================================================
   Helpers
========================================================= */

function getTodayDate() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getSetInfo() {
  const totalWords = wordMeanings.length;

  if (!totalWords || DAILY_COUNT < 1) {
    return null;
  }

  const totalSets = Math.ceil(totalWords / DAILY_COUNT);

  const [year, month, day] = START_DATE.split("-").map(Number);
  const startDate = new Date(year, month - 1, day);
  const today = new Date();

  const startUTC = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );

  const todayUTC = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const elapsedDays = Math.max(0, Math.floor((todayUTC - startUTC) / 86400000));

  const setNumber = (elapsedDays % totalSets) + 1;
  const cycleNumber = Math.floor(elapsedDays / totalSets);

  const setKey = [
    START_DATE.replaceAll("-", ""),
    `count${DAILY_COUNT}`,
    `set${setNumber}`,
    `cycle${cycleNumber}`,
  ].join("_");

  return {
    setNumber,
    cycleNumber,
    setKey,
  };
}

/**
 * Vocabulary exam state is stored in localStorage.
 * No Firestore vocabulary collections are used.
 */
function getStoredExam(studentId, setKey) {
  try {
    const storageKey = `topline-vocabulary-result-${studentId}_${setKey}`;
    const storedResult = localStorage.getItem(storageKey);

    return storedResult ? JSON.parse(storedResult) : null;
  } catch (error) {
    console.error("Unable to read vocabulary result:", error);
    throw error;
  }
}

/* =========================================================
   Component
========================================================= */

export default function VocabularyWidget() {
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_KEY);

      if (!sessionString) {
        setLoggedIn(false);
        return;
      }

      const session = JSON.parse(sessionString);

      if (session?.role !== "student" || !session?.documentId) {
        setLoggedIn(false);
        return;
      }

      setLoggedIn(true);

      const setInfo = getSetInfo();

      if (!setInfo) {
        setError(true);
        return;
      }

      const result = getStoredExam(String(session.documentId), setInfo.setKey);

      if (result) {
        setExam({
          ...result,
          setNumber: setInfo.setNumber,
        });
      } else {
        setExam({
          status: "not-started",
          mark: 0,
          setNumber: setInfo.setNumber,
        });
      }
    } catch (error) {
      console.error("VocabularyWidget:", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const status = exam?.status;

  let statusContent = (
    <p className="mt-1 flex items-center gap-1 text-xs text-base-content/60 sm:text-sm">
      <MdSchedule size={16} />
      আজকের পরীক্ষা এখনো দেওয়া হয়নি।
    </p>
  );

  let buttonText = "দেখুন";
  let buttonClass = "btn btn-primary btn-sm shrink-0";
  let Icon = MdArrowForward;

  if (!loggedIn && !loading) {
    statusContent = (
      <p className="mt-1 text-xs text-warning sm:text-sm">
        Vocabulary পরীক্ষার জন্য শিক্ষার্থী হিসেবে লগইন করুন।
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
        <MdSchedule size={16} />
        পরীক্ষা অসম্পূর্ণ। বাকি সময়ের মধ্যে উত্তর দিন।
      </p>
    );

    buttonText = "পরীক্ষা চালিয়ে যান";
  } else if (status === "submitted") {
    const point = Number(exam?.mark) || 0;

    statusContent = (
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs sm:text-sm">
        <MdCheckCircle size={16} className="text-success" />
        <span className="text-base-content/70">আজকের প্রাপ্ত পয়েন্ট:</span>
        <span className="font-bold text-success">{point}</span>
      </p>
    );

    buttonText = "ফলাফল দেখুন";
    buttonClass = "btn btn-success btn-sm shrink-0";
    Icon = MdCheckCircle;
  } else if (status === "expired") {
    statusContent = (
      <p className="mt-1 flex items-center gap-1 text-xs text-warning sm:text-sm">
        <MdLock size={16} />
        সময় শেষ হয়েছে। প্রাপ্ত পয়েন্ট: ০
      </p>
    );

    buttonText = "ফলাফল দেখুন";
    buttonClass = "btn btn-warning btn-sm shrink-0";
    Icon = MdLock;
  }

  return (
    <section className="my-4 flex items-center justify-between gap-3 rounded-2xl border border-base-300 bg-base-100 p-4 text-base-content shadow-sm transition-colors sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MdMenuBook size={25} />
        </div>

        <div className="min-w-0">
          <h3 className="font-bold">
            আজকের ভোকাবুলারি{" "}
            {!loading && !error && loggedIn && exam?.setNumber && (
              <span className="badge badge-primary ml-1">
                সেট {exam.setNumber}
              </span>
            )}{" "}
          </h3>

          {statusContent}
        </div>
      </div>

      <Link
        to={loggedIn ? "/todays-vocabulary" : "/login"}
        className={buttonClass}
        aria-disabled={loading}
        onClick={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
      >
        <span>{buttonText}</span>
        <Icon size={17} />
      </Link>
    </section>
  );
}
