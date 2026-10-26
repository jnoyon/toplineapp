import { useEffect, useMemo, useState } from "react";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";

import {
  MdAdd,
  MdCampaign,
  MdCheckCircle,
  MdClose,
  MdDelete,
  MdEdit,
  MdEvent,
  MdFilterAlt,
  MdFilterAltOff,
  MdLink,
  MdOutlineGroups,
  MdOutlineSearch,
  MdSave,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";

import { departmentList } from "../config/departments";
import { db } from "../assets/firebase/firebase.init";

const NOTICE_TYPES = [
  { value: "notice", label: "সাধারণ নোটিশ" },
  { value: "exam", label: "পরীক্ষা" },
  { value: "result", label: "পরীক্ষার ফলাফল" },
  { value: "routine", label: "রুটিন" },
  { value: "other", label: "অন্যান্য" },
];

const TARGET_TYPES = [
  { value: "all", label: "সবার জন্য" },
  { value: "teachers", label: "শুধু শিক্ষক" },
  { value: "department", label: "নির্দিষ্ট বিভাগ" },
  { value: "class", label: "নির্দিষ্ট শ্রেণি" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "সব অবস্থা" },
  { value: "published", label: "প্রকাশিত" },
  { value: "unpublished", label: "প্রকাশিত নয়" },
];

const INITIAL_FILTERS = {
  search: "",
  type: "all",
  targetType: "all",
  departmentName: "",
  className: "",
  status: "all",
};

const INITIAL_EDIT_FORM = {
  title: "",
  message: "",
  type: "notice",
  targetType: "all",
  departmentName: "",
  className: "",
  link: "",
  isPublished: true,
};

const getTypeLabel = (type) =>
  NOTICE_TYPES.find((item) => item.value === type)?.label || "অন্যান্য";

const getTargetLabel = (targetType) =>
  TARGET_TYPES.find((item) => item.value === targetType)?.label || "সবার জন্য";

// পুরোনো Draft নোটিশও এখন অপ্রকাশিত হিসেবে দেখাবে।
const getStatus = (notice) => {
  if (notice.status === "published" || notice.isPublished === true) {
    return "published";
  }

  return "unpublished";
};

const getStatusLabel = (notice) =>
  getStatus(notice) === "published" ? "প্রকাশিত" : "প্রকাশিত নয়";

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

const getClassesByDepartment = (departmentName) => {
  const department = departmentList.find(
    (item) => item.name === departmentName,
  );

  return department?.classes ?? [];
};

export default function Noticeboard() {
  const navigate = useNavigate();

  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const [editingNotice, setEditingNotice] = useState(null);
  const [editForm, setEditForm] = useState(INITIAL_EDIT_FORM);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  // Live Firestore updates
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
        console.error("Noticeboard subscription error:", error);
        setLoading(false);
        setLoadError(true);
        toast.error("নোটিশ লোড করা যায়নি।");
      },
    );

    return () => unsubscribe();
  }, []);

  const filteredNotices = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return notices
      .filter((notice) => {
        const searchableText = [
          notice.title,
          notice.message,
          notice.departmentName,
          notice.className,
          notice.createdByEmail,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (search && !searchableText.includes(search)) return false;

        if (filters.type !== "all" && notice.type !== filters.type) {
          return false;
        }

        if (
          filters.targetType !== "all" &&
          notice.targetType !== filters.targetType
        ) {
          return false;
        }

        if (
          filters.departmentName &&
          notice.departmentName !== filters.departmentName
        ) {
          return false;
        }

        if (filters.className && notice.className !== filters.className) {
          return false;
        }

        if (filters.status !== "all" && getStatus(notice) !== filters.status) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          (getDate(b.createdAt)?.getTime() ?? 0) -
          (getDate(a.createdAt)?.getTime() ?? 0),
      );
  }, [notices, filters]);

  const selectedDepartment = useMemo(
    () =>
      departmentList.find(
        (department) => department.name === filters.departmentName,
      ),
    [filters.departmentName],
  );

  const stats = useMemo(
    () => ({
      total: notices.length,
      published: notices.filter((notice) => getStatus(notice) === "published")
        .length,
      unpublished: notices.filter(
        (notice) => getStatus(notice) === "unpublished",
      ).length,
    }),
    [notices],
  );

  const activeFilterCount = [
    filters.search,
    filters.type !== "all",
    filters.targetType !== "all",
    filters.departmentName,
    filters.className,
    filters.status !== "all",
  ].filter(Boolean).length;

  const handleFilterChange = (event) => {
    const { name, value } = event.target;

    setFilters((previous) => {
      const next = { ...previous, [name]: value };

      if (name === "departmentName") {
        next.className = "";
      }

      return next;
    });
  };

  const resetFilters = () => setFilters(INITIAL_FILTERS);

  const openEditModal = (notice) => {
    setEditingNotice(notice);

    setEditForm({
      title: notice.title ?? "",
      message: notice.message ?? "",
      type: notice.type ?? "notice",
      targetType: notice.targetType ?? "all",
      departmentName: notice.departmentName ?? "",
      className: notice.className ?? "",
      link: notice.link ?? "",
      isPublished: getStatus(notice) === "published",
    });
  };

  const closeEditModal = () => {
    if (saving) return;

    setEditingNotice(null);
    setEditForm(INITIAL_EDIT_FORM);
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;

    setEditForm((previous) => {
      const next = { ...previous, [name]: value };

      if (name === "departmentName") {
        next.className = "";
      }

      if (name === "targetType") {
        if (value === "all" || value === "teachers") {
          next.departmentName = "";
          next.className = "";
        }

        if (value === "department") {
          next.className = "";
        }
      }

      return next;
    });
  };

  const validateEditForm = () => {
    if (!editForm.title.trim()) {
      toast.error("নোটিশের শিরোনাম লিখুন।");
      return false;
    }

    if (!editForm.message.trim()) {
      toast.error("নোটিশের বিস্তারিত লিখুন।");
      return false;
    }

    if (
      ["department", "class"].includes(editForm.targetType) &&
      !editForm.departmentName
    ) {
      toast.error("বিভাগ নির্বাচন করুন।");
      return false;
    }

    if (editForm.targetType === "class" && !editForm.className) {
      toast.error("শ্রেণি নির্বাচন করুন।");
      return false;
    }

    if (editForm.link.trim()) {
      try {
        const url = new URL(editForm.link.trim());

        if (!["http:", "https:"].includes(url.protocol)) {
          toast.error("সঠিক HTTP বা HTTPS লিংক দিন।");
          return false;
        }
      } catch {
        toast.error("সঠিক URL লিখুন।");
        return false;
      }
    }

    return true;
  };

  const handleUpdate = async (event) => {
    event.preventDefault();

    if (!editingNotice || saving || !validateEditForm()) return;

    setSaving(true);

    try {
      const isPublished = editForm.isPublished;

      const updatedData = {
        title: editForm.title.trim(),
        message: editForm.message.trim(),
        type: editForm.type,
        targetType: editForm.targetType,

        departmentName: ["department", "class"].includes(editForm.targetType)
          ? editForm.departmentName
          : "",

        className: editForm.targetType === "class" ? editForm.className : "",
        link: editForm.link.trim(),

        isPublished,
        status: isPublished ? "published" : "unpublished",
        updatedAt: serverTimestamp(),
      };

      if (isPublished && getStatus(editingNotice) !== "published") {
        updatedData.publishedAt = serverTimestamp();
      }

      if (!isPublished) {
        updatedData.publishedAt = null;
      }

      await updateDoc(doc(db, "notices", editingNotice.id), updatedData);

      toast.success("নোটিশ আপডেট করা হয়েছে।");
      setEditingNotice(null);
      setEditForm(INITIAL_EDIT_FORM);
    } catch (error) {
      console.error("Notice update error:", error);
      toast.error("নোটিশ আপডেট করা যায়নি।");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (notice) => {
    if (deletingId) return;

    const confirmed = window.confirm(
      `"${notice.title || "এই নোটিশ"}" স্থায়ীভাবে মুছে ফেলতে চান?`,
    );

    if (!confirmed) return;

    setDeletingId(notice.id);

    try {
      await deleteDoc(doc(db, "notices", notice.id));

      toast.success("নোটিশ মুছে ফেলা হয়েছে।");

      if (editingNotice?.id === notice.id) {
        setEditingNotice(null);
      }
    } catch (error) {
      console.error("Notice delete error:", error);
      toast.error("নোটিশ মুছে ফেলা যায়নি।");
    } finally {
      setDeletingId("");
    }
  };

  const handleTogglePublish = async (notice) => {
    if (togglingId) return;

    const nextPublished = getStatus(notice) !== "published";

    setTogglingId(notice.id);

    try {
      await updateDoc(doc(db, "notices", notice.id), {
        isPublished: nextPublished,
        status: nextPublished ? "published" : "unpublished",
        publishedAt: nextPublished ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });

      toast.success(
        nextPublished
          ? "নোটিশ প্রকাশ করা হয়েছে।"
          : "নোটিশ অপ্রকাশিত করা হয়েছে।",
      );
    } catch (error) {
      console.error("Notice publish toggle error:", error);
      toast.error("প্রকাশের অবস্থা পরিবর্তন করা যায়নি।");
    } finally {
      setTogglingId("");
    }
  };

  return (
    <div className="min-h-screen bg-base-200/50 px-3 py-4 sm:px-5">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-content">
              <MdCampaign size={25} />
            </div>

            <div className="min-w-0">
              <h1 className="text-xl font-bold">নোটিশ বোর্ড</h1>
              <p className="text-xs text-base-content/60">
                নোটিশ পরিচালনা করুন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/add-notice")}
            className="btn btn-primary btn-sm gap-1.5"
          >
            <MdAdd size={19} />
            <span className="hidden sm:inline">নতুন নোটিশ</span>
            <span className="sm:hidden">নতুন</span>
          </button>
        </header>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="মোট নোটিশ"
            value={stats.total}
            icon={<MdCampaign size={21} />}
          />

          <StatCard
            label="প্রকাশিত"
            value={stats.published}
            icon={<MdCheckCircle size={21} />}
          />

          <StatCard
            label="অপ্রকাশিত"
            value={stats.unpublished}
            icon={<MdVisibilityOff size={21} />}
          />
        </div>

        {/* Search and collapsible filters */}
        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-3 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <MdOutlineSearch
                  size={19}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
                />

                <input
                  name="search"
                  value={filters.search}
                  onChange={handleFilterChange}
                  placeholder="নোটিশ খুঁজুন..."
                  aria-label="নোটিশ খুঁজুন"
                  className="input input-bordered input-sm w-full pl-9"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowFilters((previous) => !previous)}
                className={`btn btn-sm gap-1.5 ${
                  showFilters || activeFilterCount
                    ? "btn-primary"
                    : "btn-outline"
                }`}
              >
                <MdFilterAlt size={19} />
                ফিল্টার
                {activeFilterCount > 0 && (
                  <span className="badge badge-sm">{activeFilterCount}</span>
                )}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 gap-3 border-t border-base-200 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                    <FilterSelect
                      label="নোটিশের ধরন"
                      name="type"
                      value={filters.type}
                      onChange={handleFilterChange}
                      options={[
                        { value: "all", label: "সব ধরনের" },
                        ...NOTICE_TYPES,
                      ]}
                    />

                    <FilterSelect
                      label="প্রকাশের অবস্থা"
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      options={STATUS_OPTIONS}
                    />

                    <FilterSelect
                      label="কার জন্য"
                      name="targetType"
                      value={filters.targetType}
                      onChange={handleFilterChange}
                      options={[
                        { value: "all", label: "সব ধরনের" },
                        ...TARGET_TYPES,
                      ]}
                    />

                    <FilterSelect
                      label="বিভাগ"
                      name="departmentName"
                      value={filters.departmentName}
                      onChange={handleFilterChange}
                      options={[
                        { value: "", label: "সব বিভাগ" },
                        ...departmentList.map((department) => ({
                          value: department.name,
                          label: department.name,
                        })),
                      ]}
                    />

                    <FilterSelect
                      label="শ্রেণি"
                      name="className"
                      value={filters.className}
                      onChange={handleFilterChange}
                      disabled={!filters.departmentName}
                      options={[
                        {
                          value: "",
                          label: filters.departmentName
                            ? "সব শ্রেণি"
                            : "আগে বিভাগ নির্বাচন করুন",
                        },
                        ...(selectedDepartment?.classes ?? []).map(
                          (classItem) => ({
                            value: classItem.name,
                            label: classItem.name,
                          }),
                        ),
                      ]}
                    />

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={resetFilters}
                        disabled={activeFilterCount === 0}
                        className="btn btn-ghost btn-sm w-full gap-2"
                      >
                        <MdFilterAltOff size={18} />
                        ফিল্টার রিসেট
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between border-t border-base-200 pt-2 text-xs text-base-content/60">
              <span>{filteredNotices.length}টি নোটিশ পাওয়া গেছে</span>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="link link-hover"
                >
                  সব ফিল্টার সরান
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Notice list */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">সকল নোটিশ</h2>
            <span className="badge badge-outline">
              {filteredNotices.length}
            </span>
          </div>

          {loading && (
            <div className="flex min-h-40 items-center justify-center rounded-xl bg-base-100">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-xl border border-error/30 bg-base-100 p-6 text-center">
              <p className="font-semibold text-error">নোটিশ লোড করা যায়নি।</p>
              <p className="mt-1 text-sm text-base-content/60">
                Firebase connection ও Firestore Security Rules পরীক্ষা করুন।
              </p>
            </div>
          )}

          {!loading && !loadError && filteredNotices.length === 0 && (
            <div className="rounded-xl border border-dashed border-base-300 bg-base-100 px-4 py-10 text-center">
              <MdCampaign size={36} className="mx-auto text-base-content/30" />
              <p className="mt-2 font-semibold">কোনো নোটিশ পাওয়া যায়নি</p>
              <p className="mt-1 text-sm text-base-content/60">
                সার্চ বা ফিল্টার পরিবর্তন করুন।
              </p>
            </div>
          )}

          {!loading && !loadError && filteredNotices.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <AnimatePresence>
                {filteredNotices.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    notice={notice}
                    deleting={deletingId === notice.id}
                    toggling={togglingId === notice.id}
                    onEdit={() => openEditModal(notice)}
                    onDelete={() => handleDelete(notice)}
                    onTogglePublish={() => handleTogglePublish(notice)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editingNotice && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-3 py-5 sm:items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeEditModal();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-notice-title"
              className="my-auto w-full max-w-xl rounded-2xl bg-base-100 shadow-2xl"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <div className="flex items-center justify-between border-b border-base-300 p-4">
                <h2 id="edit-notice-title" className="font-bold">
                  নোটিশ সম্পাদনা
                </h2>

                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={saving}
                  className="btn btn-ghost btn-circle btn-sm"
                  aria-label="বন্ধ করুন"
                >
                  <MdClose size={21} />
                </button>
              </div>

              <form onSubmit={handleUpdate}>
                <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
                  <div className="form-control">
                    <label htmlFor="editTitle" className="label py-1">
                      <span className="label-text">শিরোনাম *</span>
                    </label>
                    <input
                      id="editTitle"
                      name="title"
                      value={editForm.title}
                      onChange={handleEditChange}
                      maxLength={150}
                      required
                      className="input input-bordered input-sm w-full"
                    />
                  </div>

                  <div className="form-control">
                    <label htmlFor="editType" className="label py-1">
                      <span className="label-text">নোটিশের ধরন</span>
                    </label>
                    <select
                      id="editType"
                      name="type"
                      value={editForm.type}
                      onChange={handleEditChange}
                      className="select select-bordered select-sm w-full"
                    >
                      {NOTICE_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-control">
                    <label htmlFor="editMessage" className="label py-1">
                      <span className="label-text">বিস্তারিত *</span>
                    </label>
                    <textarea
                      id="editMessage"
                      name="message"
                      value={editForm.message}
                      onChange={handleEditChange}
                      rows={5}
                      maxLength={10000}
                      required
                      className="textarea textarea-bordered w-full leading-7"
                    />
                  </div>

                  <div className="form-control">
                    <label htmlFor="editTargetType" className="label py-1">
                      <span className="label-text">কার জন্য?</span>
                    </label>
                    <select
                      id="editTargetType"
                      name="targetType"
                      value={editForm.targetType}
                      onChange={handleEditChange}
                      className="select select-bordered select-sm w-full"
                    >
                      {TARGET_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {["department", "class"].includes(editForm.targetType) && (
                    <div className="form-control">
                      <label htmlFor="editDepartment" className="label py-1">
                        <span className="label-text">বিভাগ *</span>
                      </label>
                      <select
                        id="editDepartment"
                        name="departmentName"
                        value={editForm.departmentName}
                        onChange={handleEditChange}
                        required
                        className="select select-bordered select-sm w-full"
                      >
                        <option value="">বিভাগ নির্বাচন করুন</option>
                        {departmentList.map((department) => (
                          <option key={department.name} value={department.name}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {editForm.targetType === "class" && (
                    <div className="form-control">
                      <label htmlFor="editClass" className="label py-1">
                        <span className="label-text">শ্রেণি *</span>
                      </label>
                      <select
                        id="editClass"
                        name="className"
                        value={editForm.className}
                        onChange={handleEditChange}
                        required
                        disabled={!editForm.departmentName}
                        className="select select-bordered select-sm w-full"
                      >
                        <option value="">শ্রেণি নির্বাচন করুন</option>
                        {getClassesByDepartment(editForm.departmentName).map(
                          (classItem) => (
                            <option
                              key={classItem.id ?? classItem.name}
                              value={classItem.name}
                            >
                              {classItem.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  )}

                  <div className="form-control">
                    <label htmlFor="editLink" className="label py-1">
                      <span className="label-text">লিংক (ঐচ্ছিক)</span>
                    </label>
                    <input
                      id="editLink"
                      name="link"
                      type="url"
                      value={editForm.link}
                      onChange={handleEditChange}
                      placeholder="https://example.com"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-base-300 p-3">
                    <div>
                      <p className="text-sm font-semibold">নোটিশ প্রকাশ করুন</p>
                      <p className="text-xs text-base-content/60">
                        বন্ধ করলে নোটিশটি অপ্রকাশিত থাকবে।
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={editForm.isPublished}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          isPublished: event.target.checked,
                        }))
                      }
                      className="toggle toggle-primary toggle-sm"
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-2 border-t border-base-300 p-4">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={saving}
                    className="btn btn-ghost btn-sm"
                  >
                    বাতিল
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary btn-sm gap-2"
                  >
                    {saving ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <MdSave size={18} />
                    )}
                    সংরক্ষণ
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body flex-row items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-base-content/60">{label}</p>
          <p className="text-lg font-bold sm:text-xl">{value}</p>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  name,
  value,
  onChange,
  options,
  disabled = false,
}) {
  return (
    <div className="form-control">
      <label htmlFor={`filter-${name}`} className="label py-1">
        <span className="label-text text-xs">{label}</span>
      </label>
      <select
        id={`filter-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="select select-bordered select-sm w-full"
      >
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NoticeCard({
  notice,
  deleting,
  toggling,
  onEdit,
  onDelete,
  onTogglePublish,
}) {
  const isPublished = getStatus(notice) === "published";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="card min-w-0 border border-base-300 bg-base-100 shadow-sm"
    >
      <div className="card-body gap-3 p-3 sm:p-4">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MdCampaign size={22} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-bold leading-6">
              {notice.title || "শিরোনাম নেই"}
            </h3>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="badge badge-primary badge-outline badge-sm">
                {getTypeLabel(notice.type)}
              </span>

              <span
                className={`badge badge-sm ${
                  isPublished ? "badge-success" : "badge-ghost"
                }`}
              >
                {getStatusLabel(notice)}
              </span>
            </div>
          </div>
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-base-content/75">
          {notice.message || "বিস্তারিত নেই।"}
        </p>

        <div className="rounded-lg bg-base-200/60 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <MdOutlineGroups size={17} className="text-primary" />
            কার জন্য
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="badge badge-outline badge-sm">
              {getTargetLabel(notice.targetType)}
            </span>

            {notice.departmentName && (
              <span className="badge badge-outline badge-sm">
                {notice.departmentName}
              </span>
            )}

            {notice.className && (
              <span className="badge badge-outline badge-sm">
                {notice.className}
              </span>
            )}
          </div>
        </div>

        {notice.link && (
          <a
            href={notice.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1.5 break-all text-xs text-primary hover:underline"
          >
            <MdLink size={17} className="shrink-0" />
            {notice.link}
          </a>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-200 pt-2 text-xs text-base-content/55">
          <span className="flex items-center gap-1">
            <MdEvent size={15} />
            {formatDate(notice.createdAt)}
          </span>

          {notice.updatedAt && (
            <span>আপডেট: {formatDate(notice.updatedAt)}</span>
          )}
        </div>

        <div className="flex gap-2 border-t border-base-200 pt-2">
          <button
            type="button"
            onClick={onEdit}
            className="btn btn-outline btn-sm flex-1 gap-1"
          >
            <MdEdit size={16} />
            Edit
          </button>

          <button
            type="button"
            onClick={onTogglePublish}
            disabled={toggling}
            className={`btn btn-sm flex-1 gap-1 ${
              isPublished ? "btn-ghost" : "btn-success"
            }`}
          >
            {toggling ? (
              <span className="loading loading-spinner loading-xs" />
            ) : isPublished ? (
              <MdVisibilityOff size={16} />
            ) : (
              <MdVisibility size={16} />
            )}
            {isPublished ? "Unpublish" : "Publish"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="btn btn-error btn-outline btn-sm flex-1 gap-1"
          >
            {deleting ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <MdDelete size={16} />
            )}
            Delete
          </button>
        </div>
      </div>
    </motion.article>
  );
}
