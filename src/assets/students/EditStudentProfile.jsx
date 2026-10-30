import { useEffect, useState } from "react";
import { useParams } from "react-router";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import toast from "react-hot-toast";

import { db } from "../firebase/firebase.init";

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

const initialForm = {
  name: "",
  phone: "",
  villageId: "",
  villageName: "",
  fatherName: "",
  motherName: "",
  dateOfBirth: "",
  religion: "",
  roll: "",
};

const religionOptions = ["ইসলাম", "হিন্দু", "বৌদ্ধ", "খ্রিস্টান", "অন্যান্য"];

export default function EditStudentProfile({ studentId: studentIdProp } = {}) {
  const { studentId: routeStudentId } = useParams();
  const studentId = studentIdProp || routeStudentId;

  const [student, setStudent] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [villages, setVillages] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);

  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");

  // Load student and villages
  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!studentId) {
        setStudent(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [studentSnap, villageSnap] = await Promise.all([
          getDoc(doc(db, "students", studentId)),
          getDocs(collection(db, "villages")),
        ]);

        if (!active) return;

        if (!studentSnap.exists()) {
          setStudent(null);
          toast.error("শিক্ষার্থীর তথ্য পাওয়া যায়নি।");
          return;
        }

        const data = studentSnap.data();

        setStudent(data);

        setForm({
          name: data.name || "",
          phone: data.phone || data.phoneNormalized || "",
          villageId: data.villageId || "",
          villageName: data.villageName || "",
          fatherName: data.fatherName || "",
          motherName: data.motherName || "",
          dateOfBirth: data.dateOfBirth || "",
          religion: data.religion || "",
          roll: data.roll == null ? "" : String(data.roll),
        });

        setPreview(
          data.photoURL || data.photoUrl || data.photo || data.image || "",
        );

        const villageList = villageSnap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), "bn"),
          );

        setVillages(villageList);
      } catch (error) {
        console.error("Load student error:", error);

        if (active) {
          toast.error("তথ্য লোড করা যায়নি।");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [studentId]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleVillageChange(event) {
    const villageId = event.target.value;

    const selectedVillage = villages.find(
      (village) => village.id === villageId,
    );

    setForm((previous) => ({
      ...previous,
      villageId,
      villageName: selectedVillage?.name || "",
    }));
  }

  // Resize and crop image to 200 × 200
  async function resizeImage(file) {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("ছবিটি পড়া যায়নি।"));
        image.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("ছবি প্রসেস করা যাচ্ছে না।");
      }

      const size = Math.min(image.width, image.height);
      const sx = (image.width - size) / 2;
      const sy = (image.height - size) / 2;

      context.drawImage(image, sx, sy, size, size, 0, 0, 200, 200);

      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("ছবি রিসাইজ করা যায়নি।")),
          "image/jpeg",
          0.9,
        );
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function handlePhotoSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("অনুগ্রহ করে একটি ছবি নির্বাচন করুন।");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("ছবির সাইজ সর্বোচ্চ ৫ MB হতে পারবে।");
      return;
    }

    if (preview) {
      toast.error("নতুন ছবি দিতে হলে আগে আগের ছবিটি মুছুন।");
      return;
    }

    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  // Delete previous photo
  async function handleDeletePhoto() {
    if (deletingImage || saving || uploading) return;

    if (!preview) {
      setPhoto(null);
      return;
    }

    if (!window.confirm("আপনি কি বর্তমান প্রোফাইল ছবিটি মুছতে চান?")) {
      return;
    }

    setDeletingImage(true);

    try {
      if (photo) {
        URL.revokeObjectURL(preview);
        setPhoto(null);
        setPreview("");
        toast.success("নির্বাচিত ছবি সরানো হয়েছে।");
        return;
      }

      const deleteURL = student?.photoDeleteURL;

      if (!deleteURL) {
        toast.error("ছবি মুছে ফেলার লিংক পাওয়া যায়নি।");
        return;
      }

      const response = await fetch(deleteURL);

      if (!response.ok) {
        throw new Error("ImageBB ছবি মুছতে পারেনি।");
      }

      await updateDoc(doc(db, "students", studentId), {
        photoURL: "",
        photoDeleteURL: "",
        updatedAt: serverTimestamp(),
      });

      setStudent((previous) => ({
        ...previous,
        photoURL: "",
        photoDeleteURL: "",
      }));

      setPreview("");
      setPhoto(null);

      toast.success("প্রোফাইল ছবি মুছে ফেলা হয়েছে।");
    } catch (error) {
      console.error("Delete photo error:", error);
      toast.error("ছবি মুছতে সমস্যা হয়েছে।");
    } finally {
      setDeletingImage(false);
    }
  }

  // Upload photo
  async function uploadPhoto() {
    if (!photo) return null;

    if (!IMGBB_API_KEY) {
      throw new Error("VITE_IMGBB_API_KEY .env ফাইলে সেট করা নেই।");
    }

    setUploading(true);

    try {
      const resizedBlob = await resizeImage(photo);
      const body = new FormData();

      body.append("image", resizedBlob, "student-profile.jpg");

      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
        {
          method: "POST",
          body,
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "ছবি আপলোড করা যায়নি।");
      }

      return {
        photoURL: result.data.url,
        photoDeleteURL: result.data.delete_url,
      };
    } finally {
      setUploading(false);
    }
  }

  // Save profile
  async function handleSubmit(event) {
    event.preventDefault();

    if (!studentId || !student) {
      toast.error("শিক্ষার্থীর তথ্য পাওয়া যায়নি।");
      return;
    }

    if (saving || uploading || deletingImage) return;

    const name = form.name.trim();
    const phone = form.phone.replace(/\s+/g, "");

    if (!name) {
      toast.error("শিক্ষার্থীর নাম লিখুন।");
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      toast.error("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।");
      return;
    }

    setSaving(true);

    try {
      let photoData = {};

      if (photo) {
        photoData = (await uploadPhoto()) || {};
      }

      const updatedData = {
        name,
        phone,
        phoneNormalized: phone,

        villageId: form.villageId,
        villageName: form.villageName,

        fatherName: form.fatherName.trim(),
        motherName: form.motherName.trim(),
        dateOfBirth: form.dateOfBirth,
        religion: form.religion,
        roll: form.roll.trim(),

        ...photoData,

        updatedAt: serverTimestamp(),
      };

      // Only profile fields are updated.
      // approved, isActive, pin, currentMark, batchId etc. remain unchanged.
      await updateDoc(doc(db, "students", studentId), updatedData);

      setStudent((previous) => ({
        ...previous,
        ...updatedData,
      }));

      if (photoData.photoURL) {
        setPreview(photoData.photoURL);
        setPhoto(null);
      }

      toast.success("প্রোফাইল সফলভাবে আপডেট হয়েছে।");
    } catch (error) {
      console.error("Update profile error:", error);
      toast.error(error.message || "প্রোফাইল আপডেট করা যায়নি।");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || uploading || deletingImage;

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/60">
            শিক্ষার্থীর তথ্য লোড হচ্ছে...
          </p>
        </div>
      </div>
    );
  }

  if (!studentId || !student) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="alert alert-warning">
          শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি।
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-8">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-base-content">
            প্রোফাইল সম্পাদনা
          </h1>
          <p className="mt-2 text-sm leading-6 text-base-content/60">
            শিক্ষার্থীর ব্যক্তিগত তথ্য যোগ বা পরিবর্তন করুন।
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Profile Photo */}
          <div className="mb-8 flex flex-col items-center rounded-2xl border border-base-300 bg-base-200/30 p-6">
            <div className="relative">
              <div className="h-[200px] w-[200px] overflow-hidden rounded-full border-4 border-base-100 bg-base-200 shadow-md">
                {preview ? (
                  <img
                    src={preview}
                    alt="Student profile"
                    width={200}
                    height={200}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-base-content/40">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-20 w-20"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0A17.9 17.9 0 0 1 12 21.75c-2.7 0-5.25-.6-7.5-1.65Z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {(uploading || deletingImage) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/60 text-white">
                  <span className="loading loading-spinner loading-lg" />
                  <span className="mt-3 text-sm font-medium">
                    {uploading
                      ? "ছবি আপলোড হচ্ছে..."
                      : "ছবি মুছে ফেলা হচ্ছে..."}
                  </span>
                </div>
              )}
            </div>

            <p className="mt-4 text-sm font-medium">প্রোফাইল ছবি</p>
            <p className="mt-1 text-xs text-base-content/60">
              200 × 200 px · সর্বোচ্চ 5 MB
            </p>

            {preview && !photo ? (
              <button
                type="button"
                onClick={handleDeletePhoto}
                disabled={busy}
                className="btn btn-outline btn-error btn-sm mt-4"
              >
                আগের ছবি মুছুন
              </button>
            ) : (
              <label
                className={`btn btn-primary btn-sm mt-4 ${
                  busy ? "pointer-events-none opacity-50" : ""
                }`}
              >
                ছবি নির্বাচন করুন
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy || Boolean(preview)}
                  onChange={handlePhotoSelect}
                />
              </label>
            )}

            {photo && (
              <div className="mt-3 text-center">
                <p className="text-sm text-success">
                  নতুন ছবি নির্বাচিত হয়েছে।
                </p>
                <p className="mt-1 text-xs text-base-content/60">
                  প্রোফাইল সেভ করলে ছবিটি আপলোড হবে।
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs mt-1"
                  disabled={busy}
                  onClick={() => {
                    URL.revokeObjectURL(preview);
                    setPhoto(null);
                    setPreview("");
                  }}
                >
                  নির্বাচিত ছবি বাতিল করুন
                </button>
              </div>
            )}
          </div>

          {/* Personal Information */}
          <div className="mb-5">
            <h2 className="text-lg font-semibold">ব্যক্তিগত তথ্য</h2>
            <p className="mt-1 text-xs text-base-content/60">
              প্রয়োজন অনুযায়ী তথ্য পরিবর্তন করুন।
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            {/* Name */}
            <div className="form-control">
              <label htmlFor="name" className="label">
                <span className="label-text font-medium">শিক্ষার্থীর নাম</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder="শিক্ষার্থীর নাম লিখুন"
                className="input input-bordered w-full"
                disabled={busy}
                required
              />
            </div>

            {/* Phone */}
            <div className="form-control">
              <label htmlFor="phone" className="label">
                <span className="label-text font-medium">মোবাইল নম্বর</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={form.phone}
                onChange={handleChange}
                placeholder="01XXXXXXXXX"
                className="input input-bordered w-full"
                disabled={busy}
                required
              />
            </div>

            {/* Village */}
            <div className="form-control sm:col-span-2">
              <label htmlFor="villageId" className="label">
                <span className="label-text font-medium">গ্রাম</span>
              </label>
              <select
                id="villageId"
                value={form.villageId}
                onChange={handleVillageChange}
                className="select select-bordered w-full"
                disabled={busy}
              >
                <option value="">গ্রাম নির্বাচন করুন</option>
                {villages.map((village) => (
                  <option key={village.id} value={village.id}>
                    {village.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Father's Name */}
            <div className="form-control">
              <label htmlFor="fatherName" className="label">
                <span className="label-text font-medium">বাবার নাম</span>
              </label>
              <input
                id="fatherName"
                name="fatherName"
                type="text"
                value={form.fatherName}
                onChange={handleChange}
                placeholder="বাবার নাম লিখুন"
                className="input input-bordered w-full"
                disabled={busy}
              />
            </div>

            {/* Mother's Name */}
            <div className="form-control">
              <label htmlFor="motherName" className="label">
                <span className="label-text font-medium">মায়ের নাম</span>
              </label>
              <input
                id="motherName"
                name="motherName"
                type="text"
                value={form.motherName}
                onChange={handleChange}
                placeholder="মায়ের নাম লিখুন"
                className="input input-bordered w-full"
                disabled={busy}
              />
            </div>

            {/* Date of Birth */}
            <div className="form-control">
              <label htmlFor="dateOfBirth" className="label">
                <span className="label-text font-medium">জন্মতারিখ</span>
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={handleChange}
                className="input input-bordered w-full"
                disabled={busy}
              />
            </div>

            {/* Religion */}
            <div className="form-control">
              <label htmlFor="religion" className="label">
                <span className="label-text font-medium">ধর্ম</span>
              </label>
              <select
                id="religion"
                name="religion"
                value={form.religion}
                onChange={handleChange}
                className="select select-bordered w-full"
                disabled={busy}
              >
                <option value="">ধর্ম নির্বাচন করুন</option>
                {religionOptions.map((religion) => (
                  <option key={religion} value={religion}>
                    {religion}
                  </option>
                ))}
              </select>
            </div>

            {/* Roll */}
            <div className="form-control sm:col-span-2">
              <label htmlFor="roll" className="label">
                <span className="label-text font-medium">রোল নম্বর</span>
              </label>
              <input
                id="roll"
                name="roll"
                type="text"
                inputMode="numeric"
                value={form.roll}
                onChange={handleChange}
                placeholder="রোল নম্বর লিখুন"
                className="input input-bordered w-full"
                disabled={busy}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={busy}
              className="btn btn-ghost"
            >
              ফিরে যান
            </button>

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary min-w-44"
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  সেভ হচ্ছে...
                </>
              ) : (
                "প্রোফাইল সেভ করুন"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
