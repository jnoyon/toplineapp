import { useMemo, useState } from "react";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { useNavigate } from "react-router";

import toast from "react-hot-toast";
import { motion } from "framer-motion";

import {
  MdArrowBack,
  MdCampaign,
  MdLink,
  MdOutlineGroups,
  MdSend,
} from "react-icons/md";

import { db, auth } from "../assets/firebase/firebase.init";
import { departmentList } from "../config/departments";

const INITIAL_FORM = {
  title: "",
  message: "",
  type: "notice",
  targetType: "all",
  departmentName: "",
  className: "",
  link: "",
};

const NOTICE_TYPES = [
  { value: "notice", label: "সাধারণ নোটিশ" },
  { value: "exam", label: "পরীক্ষা" },
  { value: "result", label: "পরীক্ষার ফলাফল" },
  { value: "routine", label: "রুটিন" },
  { value: "other", label: "অন্যান্য" },
];

const TARGET_TYPES = [
  { value: "all", label: "সবার জন্য" },
  { value: "teachers", label: "শুধু শিক্ষকদের জন্য" },
  { value: "department", label: "নির্দিষ্ট বিভাগের জন্য" },
  { value: "class", label: "নির্দিষ্ট বিভাগ ও শ্রেণির জন্য" },
];

export default function AddNotice() {
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const selectedDepartment = useMemo(
    () =>
      departmentList.find(
        (department) => department.name === form.departmentName,
      ),
    [form.departmentName],
  );

  const availableClasses = selectedDepartment?.classes ?? [];

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => {
      const updated = {
        ...previous,
        [name]: value,
      };

      if (name === "departmentName") {
        updated.className = "";
      }

      if (name === "targetType") {
        if (value !== "department" && value !== "class") {
          updated.departmentName = "";
          updated.className = "";
        }

        if (value === "department") {
          updated.className = "";
        }
      }

      return updated;
    });
  };

  const validateForm = () => {
    if (!form.title.trim()) {
      toast.error("নোটিশের শিরোনাম লিখুন।");
      return false;
    }

    if (!form.message.trim()) {
      toast.error("নোটিশের বিস্তারিত লিখুন।");
      return false;
    }

    if (
      ["department", "class"].includes(form.targetType) &&
      !form.departmentName
    ) {
      toast.error("একটি বিভাগ নির্বাচন করুন।");
      return false;
    }

    if (form.targetType === "class" && !form.className) {
      toast.error("একটি শ্রেণি নির্বাচন করুন।");
      return false;
    }

    if (form.link.trim()) {
      try {
        const url = new URL(form.link.trim());

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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving || !validateForm()) return;

    setIsSaving(true);

    try {
      const currentUser = auth.currentUser;

      const noticeData = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        targetType: form.targetType,

        departmentName: ["department", "class"].includes(form.targetType)
          ? form.departmentName
          : "",

        className: form.targetType === "class" ? form.className : "",

        link: form.link.trim(),

        isPublished: true,
        status: "published",

        createdBy: currentUser?.uid ?? "",
        createdByEmail: currentUser?.email ?? "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "notices"), noticeData);

      toast.success("নোটিশ সফলভাবে প্রকাশ করা হয়েছে!");

      setForm(INITIAL_FORM);

      navigate("/noticeboard");
    } catch (error) {
      console.error("Notice save error:", error);
      toast.error("নোটিশ প্রকাশ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200/60 px-3 py-5 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-content">
              <MdCampaign size={25} />
            </div>

            <div>
              <h1 className="text-xl font-bold">নতুন নোটিশ</h1>
              <p className="text-sm text-base-content/60">
                নোটিশ তৈরি ও প্রকাশ করুন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm gap-1"
          >
            <MdArrowBack size={18} />
            <span className="hidden sm:inline">ফিরে যান</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4 p-4 sm:p-6">
              {/* Title */}
              <div className="form-control">
                <label htmlFor="title" className="label py-1">
                  <span className="label-text font-semibold">
                    শিরোনাম <span className="text-error">*</span>
                  </span>
                </label>

                <input
                  id="title"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="যেমন: মাসিক পরীক্ষার সময়সূচি"
                  maxLength={150}
                  required
                  className="input input-bordered w-full"
                />
              </div>

              {/* Type */}
              <div className="form-control">
                <label htmlFor="type" className="label py-1">
                  <span className="label-text font-semibold">নোটিশের ধরন</span>
                </label>

                <select
                  id="type"
                  name="type"
                  value={form.type}
                  onChange={handleChange}
                  className="select select-bordered w-full"
                >
                  {NOTICE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div className="form-control">
                <label htmlFor="message" className="label py-1">
                  <span className="label-text font-semibold">
                    বিস্তারিত <span className="text-error">*</span>
                  </span>
                </label>

                <textarea
                  id="message"
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="নোটিশের বিস্তারিত লিখুন..."
                  rows={5}
                  maxLength={10000}
                  required
                  className="textarea textarea-bordered w-full leading-7"
                />
              </div>

              {/* Audience */}
              <div className="rounded-xl border border-base-300 p-3 sm:p-4">
                <h2 className="mb-3 flex items-center gap-2 font-semibold">
                  <MdOutlineGroups size={21} className="text-primary" />
                  নোটিশটি কারা দেখবে?
                </h2>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TARGET_TYPES.map((target) => (
                    <label
                      key={target.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                        form.targetType === target.value
                          ? "border-primary bg-primary/5"
                          : "border-base-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetType"
                        value={target.value}
                        checked={form.targetType === target.value}
                        onChange={handleChange}
                        className="radio radio-primary radio-sm"
                      />

                      <span className="text-sm font-medium">
                        {target.label}
                      </span>
                    </label>
                  ))}
                </div>

                {(form.targetType === "department" ||
                  form.targetType === "class") && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3"
                  >
                    <label htmlFor="departmentName" className="label py-1">
                      <span className="label-text font-semibold">
                        বিভাগ <span className="text-error">*</span>
                      </span>
                    </label>

                    <select
                      id="departmentName"
                      name="departmentName"
                      value={form.departmentName}
                      onChange={handleChange}
                      required
                      className="select select-bordered w-full"
                    >
                      <option value="">বিভাগ নির্বাচন করুন</option>

                      {departmentList.map((department) => (
                        <option key={department.name} value={department.name}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </motion.div>
                )}

                {form.targetType === "class" && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3"
                  >
                    <label htmlFor="className" className="label py-1">
                      <span className="label-text font-semibold">
                        শ্রেণি <span className="text-error">*</span>
                      </span>
                    </label>

                    <select
                      id="className"
                      name="className"
                      value={form.className}
                      onChange={handleChange}
                      required
                      disabled={!form.departmentName}
                      className="select select-bordered w-full"
                    >
                      <option value="">
                        {form.departmentName
                          ? "শ্রেণি নির্বাচন করুন"
                          : "আগে বিভাগ নির্বাচন করুন"}
                      </option>

                      {availableClasses.map((classItem) => (
                        <option key={classItem.name} value={classItem.name}>
                          {classItem.name}
                        </option>
                      ))}
                    </select>
                  </motion.div>
                )}
              </div>

              {/* Optional link */}
              <div className="form-control">
                <label htmlFor="link" className="label py-1">
                  <span className="label-text font-semibold">
                    লিংক{" "}
                    <span className="font-normal text-base-content/50">
                      (ঐচ্ছিক)
                    </span>
                  </span>
                </label>

                <div className="relative">
                  <MdLink
                    size={20}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
                  />

                  <input
                    id="link"
                    name="link"
                    type="url"
                    value={form.link}
                    onChange={handleChange}
                    placeholder="https://example.com"
                    className="input input-bordered w-full pl-10"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end border-t border-base-200 pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary w-full gap-2 sm:w-auto"
                >
                  {isSaving ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />
                      প্রকাশ হচ্ছে...
                    </>
                  ) : (
                    <>
                      <MdSend size={19} />
                      নোটিশ প্রকাশ করুন
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
