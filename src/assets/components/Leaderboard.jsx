import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "../firebase/firebase.init";

const getPhoto = (student) =>
  student.photoURL || student.photoUrl || student.photo || student.image || "";

const getName = (student) =>
  student.name || student.studentName || "শিক্ষার্থী";

const getNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const Leaderboard = ({ for: groupName }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchLeaderboard = async () => {
      if (!groupName) {
        setStudents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);

      try {
        const studentsRef = collection(db, "students");

        const [batchSnapshot, classSnapshot] = await Promise.all([
          getDocs(query(studentsRef, where("batchName", "==", groupName))),
          getDocs(query(studentsRef, where("className", "==", groupName))),
        ]);

        if (!isMounted) return;

        const uniqueStudents = new Map();

        [...batchSnapshot.docs, ...classSnapshot.docs].forEach((studentDoc) => {
          const student = studentDoc.data();

          if (student.approved === false) return;

          uniqueStudents.set(studentDoc.id, {
            ...student,
            id: studentDoc.id,
            currentMark: getNumber(student.currentMark),
            point: getNumber(student.point),
          });
        });

        const rankedStudents = [...uniqueStudents.values()]
          .sort((a, b) => {
            // প্রথমে currentMark, সমান হলে point বেশি যার সে এগিয়ে।
            if (b.currentMark !== a.currentMark) {
              return b.currentMark - a.currentMark;
            }

            if (b.point !== a.point) {
              return b.point - a.point;
            }

            // মার্ক ও পয়েন্ট দুটোই সমান হলে নাম অনুযায়ী স্থিতিশীল ক্রম।
            return getName(a).localeCompare(getName(b), "bn");
          })
          .slice(0, 3);

        setStudents(rankedStudents);
      } catch (err) {
        console.error("Leaderboard loading failed:", err);

        if (isMounted) {
          setError(true);
          setStudents([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [groupName]);

  const rankStyles = [
    {
      label: "১ম স্থান",
      card: "border-amber-400/60 bg-amber-400/10",
      badge: "bg-amber-400 text-amber-950",
      mark: "text-amber-500",
      avatar: "h-[68px] w-[68px] sm:h-20 sm:w-20",
    },
    {
      label: "২য় স্থান",
      card: "border-base-300 bg-base-200/60",
      badge: "bg-base-300 text-base-content",
      mark: "text-base-content",
      avatar: "h-14 w-14 sm:h-[68px] sm:w-[68px]",
    },
    {
      label: "৩য় স্থান",
      card: "border-orange-500/30 bg-orange-500/5",
      badge: "bg-orange-500/15 text-orange-600",
      mark: "text-orange-500",
      avatar: "h-14 w-14 sm:h-[68px] sm:w-[68px]",
    },
  ];

  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="skeleton h-10 w-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="skeleton h-36 rounded-xl sm:h-44 sm:rounded-2xl"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-base-300 bg-base-100 p-6 text-center sm:rounded-3xl">
        <p className="font-semibold text-base-content">
          লিডারবোর্ড লোড করা যায়নি।
        </p>
        <p className="mt-1 text-sm text-base-content/60">
          কিছুক্ষণ পর আবার চেষ্টা করুন।
        </p>
      </section>
    );
  }

  return (
    <section className="relative mb-5 isolate overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-md shadow-base-content/5 sm:rounded-3xl sm:shadow-lg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-16 -z-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-base-300/70 p-4 sm:gap-3 sm:p-6">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold tracking-tight text-base-content sm:text-xl">
            এগিয়ে রয়েছে যারা
          </h2>

          <p className="mt-1 truncate text-xs text-base-content/60 sm:text-sm">
            {groupName}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-600 sm:px-3 sm:py-1.5 sm:text-xs">
          TOP 3
        </span>
      </div>

      {students.length === 0 ? (
        <div className="px-4 py-10 text-center sm:px-6 sm:py-12">
          <h3 className="font-bold text-base-content">এখনো কোনো স্কোর নেই</h3>
          <p className="mt-2 text-sm text-base-content/60">
            শিক্ষার্থীদের মার্ক যোগ হলে এখানে দেখা যাবে।
          </p>
        </div>
      ) : (
        <>
          {/* First place in the center */}
          <div className="grid grid-cols-3 items-end gap-1.5 px-3 pb-4 pt-7 sm:gap-4 sm:px-6 sm:pb-6 sm:pt-8">
            {[1, 0, 2].map((studentIndex) => {
              const student = students[studentIndex];

              if (!student) {
                return (
                  <div key={`empty-${studentIndex}`} className="min-w-0" />
                );
              }

              const style = rankStyles[studentIndex];

              return (
                <div
                  key={student.id}
                  className={`relative flex min-w-0 flex-col items-center rounded-xl border px-1 pb-3 pt-4 text-center transition-transform duration-200 hover:-translate-y-1 sm:rounded-2xl sm:px-3 sm:pb-5 sm:pt-5 ${style.card} ${
                    studentIndex === 0
                      ? "min-h-[176px] sm:min-h-[225px]"
                      : "min-h-[156px] sm:min-h-[195px]"
                  }`}
                >
                  <span className="absolute -top-2.5 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-base-100 px-2 py-1 text-[9px] font-bold text-base-content/70 shadow-sm sm:text-xs">
                    {style.label}
                  </span>

                  <div className="relative mt-1">
                    <div
                      className={`overflow-hidden rounded-full border-2 border-base-100 bg-base-200 ring-2 ${
                        studentIndex === 0
                          ? "ring-amber-400"
                          : studentIndex === 1
                            ? "ring-base-300"
                            : "ring-orange-500/50"
                      } ${style.avatar}`}
                    >
                      {getPhoto(student) ? (
                        <img
                          src={getPhoto(student)}
                          alt={getName(student)}
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-xl font-bold text-base-content/50 sm:text-2xl">
                          {getName(student).charAt(0)}
                        </div>
                      )}
                    </div>
                  </div>

                  <p
                    className="mt-3 w-full truncate px-0.5 text-[11px] font-bold text-base-content sm:mt-4 sm:px-1 sm:text-sm"
                    title={getName(student)}
                  >
                    {getName(student)}
                  </p>

                  <p
                    className={`mt-1 text-lg font-black tabular-nums sm:mt-2 sm:text-2xl ${style.mark}`}
                  >
                    {student.currentMark}
                    <span className="ml-1 text-[9px] font-medium text-base-content/50 sm:text-xs">
                      মার্ক
                    </span>
                  </p>

                  <p className="mt-1 truncate text-[9px] text-base-content/60 sm:text-xs">
                    পয়েন্ট: {student.point}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-xl bg-base-200/60 p-3 sm:mx-6 sm:mb-6 sm:rounded-2xl sm:p-4">
            <div className="min-w-0">
              <p className="mt-1 text-[10px] leading-relaxed text-base-content/60 sm:text-xs">
                মার্ক সমান হলে পয়েন্ট দিয়ে অবস্থান নির্ধারণ করা হয়।
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default Leaderboard;
