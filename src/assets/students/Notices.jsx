import { useEffect, useMemo, useState } from "react";

import { collection, onSnapshot } from "firebase/firestore";

import toast from "react-hot-toast";

import {
  MdCampaign,
  MdClose,
  MdEvent,
  MdLink,
  MdOutlineGroups,
  MdVisibility,
} from "react-icons/md";

import { departmentList } from "../../config/departments";
import { db } from "../firebase/firebase.init";

const NOTICE_TYPES = {
  notice: "সাধারণ নোটিশ",
  exam: "পরীক্ষা",
  result: "পরীক্ষার ফলাফল",
  routine: "রুটিন",
  other: "অন্যান্য",
};

const TARGET_TYPES = {
  all: "সবার জন্য",
  department: "বিভাগ",
  class: "শ্রেণি / ব্যাচ",
};

const getDate = (timestamp) => {
  if (!timestamp) return null;

  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  if (typeof timestamp === "string") {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const formatDate = (timestamp) => {
  const date = getDate(timestamp);

  if (!date) return "তারিখ নেই";

  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getSafeUrl = (value) => {
  if (!value) return "";

  try {
    const url = new URL(value);

    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

// শিক্ষার্থীর বিভাগ শনাক্ত করা
const getStudentDepartment = (student) => {
  if (!student) return null;

  return (
    departmentList.find(
      (department) => String(department.id) === String(student.departmentId),
    ) ||
    departmentList.find(
      (department) => department.name === student.departmentName,
    ) ||
    null
  );
};

// শিক্ষার্থীর শ্রেণি/ব্যাচের নাম শনাক্ত করা
const getStudentClassName = (student, department) => {
  if (!student) return "";

  const studentClassId = student.classId;

  const departmentClass = department?.classes?.find(
    (classItem) => String(classItem.id) === String(studentClassId),
  );

  return (
    student.className ||
    student.batchName ||
    student.class ||
    student.batch ||
    departmentClass?.name ||
    ""
  );
};

// Draft, unpublished ও hidden নোটিশ দেখানো হবে না।
const isPublishedNotice = (notice) => {
  if (notice.isPublished === false) return false;

  if (["draft", "unpublished", "hidden"].includes(notice.status)) {
    return false;
  }

  return notice.isPublished === true || notice.status === "published";
};

// শিক্ষার্থীর বিভাগ ও শ্রেণি/ব্যাচ অনুযায়ী নোটিশ বাছাই
const isNoticeVisibleToStudent = (notice, departmentName, className) => {
  if (!isPublishedNotice(notice)) return false;

  // শিক্ষকদের জন্য নির্ধারিত নোটিশ শিক্ষার্থীদের জন্য নয়।
  if (notice.targetType === "teachers") return false;

  // পুরোনো নোটিশে targetType না থাকলে সবার জন্য ধরা হবে।
  const targetType = notice.targetType || "all";

  if (targetType === "all") return true;

  if (targetType === "department") {
    return Boolean(departmentName) && notice.departmentName === departmentName;
  }

  if (targetType === "class") {
    return (
      Boolean(departmentName) &&
      Boolean(className) &&
      notice.departmentName === departmentName &&
      notice.className === className
    );
  }

  return false;
};

export default function Notices({ student }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);

  const department = useMemo(() => getStudentDepartment(student), [student]);

  const departmentName = department?.name || student?.departmentName || "";

  const className = useMemo(
    () => getStudentClassName(student, department),
    [student, department],
  );

  // Firestore live subscription
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "notices"),
      (snapshot) => {
        const noticeList = snapshot.docs.map((noticeDoc) => ({
          id: noticeDoc.id,
          ...noticeDoc.data(),
        }));

        setNotices(noticeList);
        setLoading(false);
        setLoadError(false);
      },
      (error) => {
        console.error("Student notices error:", error);
        setLoading(false);
        setLoadError(true);
        toast.error("নোটিশ লোড করা যায়নি।");
      },
    );

    return () => unsubscribe();
  }, []);

  const visibleNotices = useMemo(() => {
    return notices
      .filter((notice) =>
        isNoticeVisibleToStudent(notice, departmentName, className),
      )
      .sort((a, b) => {
        const dateA = getDate(a.publishedAt || a.createdAt)?.getTime() || 0;
        const dateB = getDate(b.publishedAt || b.createdAt)?.getTime() || 0;

        return dateB - dateA;
      });
  }, [notices, departmentName, className]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MdCampaign size={25} />
          </div>

          <div>
            <h2 className="text-xl font-bold">নোটিশ বোর্ড</h2>
            <p className="text-xs text-base-content/60">
              আপনার জন্য প্রকাশিত নোটিশ
            </p>
          </div>
        </div>

        {!loading && !loadError && (
          <span className="badge badge-primary badge-outline">
            {visibleNotices.length}টি
          </span>
        )}
      </div>

      {/* Student department and class */}
      {(departmentName || className) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/70">
          <MdOutlineGroups size={17} />

          {departmentName && (
            <span className="badge badge-outline">{departmentName}</span>
          )}

          {className && (
            <span className="badge badge-outline">{className}</span>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-base-300 bg-base-100">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="rounded-xl border border-error/30 bg-base-100 p-6 text-center">
          <p className="font-semibold text-error">নোটিশ লোড করা যায়নি।</p>
          <p className="mt-1 text-sm text-base-content/60">
            কিছুক্ষণ পর আবার চেষ্টা করুন।
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && visibleNotices.length === 0 && (
        <div className="rounded-xl border border-dashed border-base-300 bg-base-100 px-4 py-10 text-center">
          <MdCampaign size={38} className="mx-auto text-base-content/30" />

          <h3 className="mt-2 font-semibold">বর্তমানে কোনো নোটিশ নেই</h3>

          <p className="mt-1 text-sm text-base-content/60">
            নতুন নোটিশ প্রকাশিত হলে এখানে দেখতে পাবেন।
          </p>
        </div>
      )}

      {/* Notice list */}
      {!loading && !loadError && visibleNotices.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleNotices.map((notice) => (
            <article
              key={notice.id}
              className="card border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="card-body gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MdCampaign size={23} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-bold leading-6">
                      {notice.title || "নোটিশ"}
                    </h3>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="badge badge-primary badge-outline badge-sm">
                        {NOTICE_TYPES[notice.type] || "অন্যান্য"}
                      </span>

                      <span className="badge badge-success badge-outline badge-sm">
                        প্রকাশিত
                      </span>
                    </div>
                  </div>
                </div>

                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-base-content/70">
                  {(notice.message || "").length > 150
                    ? `${notice.message.slice(0, 150)}…`
                    : notice.message || "বিস্তারিত নেই।"}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-200 pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-base-content/60">
                    <MdEvent size={16} />
                    {formatDate(notice.publishedAt || notice.createdAt)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setSelectedNotice(notice)}
                    className="btn btn-primary btn-sm gap-1.5"
                  >
                    <MdVisibility size={18} />
                    View
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* DaisyUI Modal */}
      {selectedNotice && (
        <div
          className="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-notice-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedNotice(null);
            }
          }}
        >
          <div className="modal-box relative max-h-[85vh] max-w-2xl overflow-y-auto p-0">
            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-base-300 bg-base-100 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MdCampaign size={23} />
                </div>

                <div className="min-w-0">
                  <h3
                    id="student-notice-title"
                    className="break-words font-bold leading-6"
                  >
                    {selectedNotice.title || "নোটিশ"}
                  </h3>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="badge badge-primary badge-outline badge-sm">
                      {NOTICE_TYPES[selectedNotice.type] || "অন্যান্য"}
                    </span>

                    <span className="badge badge-success badge-outline badge-sm">
                      প্রকাশিত
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedNotice(null)}
                className="btn btn-ghost btn-circle btn-sm shrink-0"
                aria-label="নোটিশ বন্ধ করুন"
              >
                <MdClose size={21} />
              </button>
            </div>

            {/* Modal content */}
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge badge-outline">
                  {TARGET_TYPES[selectedNotice.targetType] || "সবার জন্য"}
                </span>

                {selectedNotice.departmentName && (
                  <span className="badge badge-outline">
                    {selectedNotice.departmentName}
                  </span>
                )}

                {selectedNotice.className && (
                  <span className="badge badge-outline">
                    {selectedNotice.className}
                  </span>
                )}
              </div>

              <div className="whitespace-pre-wrap break-words text-sm leading-8 text-base-content/85">
                {selectedNotice.message || "বিস্তারিত নেই।"}
              </div>

              <div className="flex items-center gap-2 border-t border-base-200 pt-3 text-xs text-base-content/60">
                <MdEvent size={17} />
                প্রকাশিত:{" "}
                {formatDate(
                  selectedNotice.publishedAt || selectedNotice.createdAt,
                )}
              </div>

              {getSafeUrl(selectedNotice.link) && (
                <a
                  href={getSafeUrl(selectedNotice.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-outline btn-sm w-full gap-2 sm:w-auto"
                >
                  <MdLink size={18} />
                  লিংক খুলুন
                </a>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end border-t border-base-300 p-4">
              <button
                type="button"
                onClick={() => setSelectedNotice(null)}
                className="btn btn-primary btn-sm"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
