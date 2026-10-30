import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";

function ShieldIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function LockIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="16" height="11" x="4" y="11" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function HomeIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v12h14V9" />
      <path d="M9 21v-8h6v8" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function ArrowRightIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function CheckShieldIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-base-200 px-4 py-12 text-base-content">
      {/* Animated Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          animate={{ x: [0, 35, 0], y: [0, -25, 0] }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-error/10 blur-3xl"
        />

        <motion.div
          animate={{ x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
        />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Main Card */}
      <motion.section
        initial={{ opacity: 0, y: 35, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full max-w-2xl"
      >
        <div className="overflow-hidden rounded-[2rem] border border-base-300 bg-base-100/90 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          {/* Top Accent */}
          <div className="h-1.5 bg-gradient-to-r from-primary via-error to-primary" />

          <div className="px-6 py-10 text-center sm:px-12 sm:py-14">
            {/* Security Icon */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{
                delay: 0.2,
                type: "spring",
                stiffness: 180,
                damping: 12,
              }}
              className="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center"
            >
              <motion.div
                animate={{
                  scale: [1, 1.12, 1],
                  opacity: [0.3, 0.1, 0.3],
                }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-error/20"
              />

              <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-error/20 bg-error/10 text-error shadow-lg shadow-error/10">
                <ShieldIcon className="h-12 w-12" />
              </div>

              <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-base-100 bg-error text-error-content">
                <LockIcon className="h-3.5 w-3.5" />
              </span>
            </motion.div>

            {/* Status Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-5 flex justify-center"
            >
              <span className="badge badge-error badge-outline gap-2 px-4 py-3 font-semibold tracking-widest">
                <span className="h-2 w-2 animate-pulse rounded-full bg-error" />
                ACCESS DENIED
              </span>
            </motion.div>

            {/* Heading */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h1 className="mb-2 text-7xl font-black tracking-tighter text-base-content sm:text-8xl">
                403<span className="text-error">.</span>
              </h1>

              <h2 className="mb-4 text-2xl font-bold sm:text-3xl">
                এই পথটি আপনার জন্য নয়!
              </h2>

              <p className="mx-auto max-w-md text-sm leading-7 text-base-content/65 sm:text-base">
                দুঃখিত! এই পেজটি দেখার জন্য আপনার প্রয়োজনীয় অনুমতি নেই। আপনার
                অ্যাকাউন্টের অ্যাক্সেস লেভেল অথবা লগইন করা অ্যাকাউন্ট পরীক্ষা
                করে দেখুন।
              </p>
            </motion.div>

            {/* Information Panel */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 rounded-2xl border border-base-300 bg-base-200/70 p-4 text-left sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-success/10 p-2.5 text-success">
                  <CheckShieldIcon className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="font-bold">আপনার অ্যাকাউন্ট সুরক্ষিত আছে</h3>

                  <p className="mt-1 text-sm leading-6 text-base-content/60">
                    নিরাপত্তার স্বার্থে এই পেজের অ্যাক্সেস সীমাবদ্ধ রাখা হয়েছে।
                    প্রয়োজন হলে প্রতিষ্ঠানের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
            >
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="btn btn-outline gap-2 rounded-xl px-6"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                আগের পেজে ফিরুন
              </button>

              <Link
                to="/"
                className="btn btn-primary gap-2 rounded-xl px-6 shadow-lg shadow-primary/20"
              >
                <HomeIcon className="h-4 w-4" />
                হোম পেজ
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Footer */}
            <div className="mt-10 border-t border-base-300 pt-6">
              <p className="text-xs font-medium tracking-wide text-base-content/40">
                TOPLINE EDUCATION
                <span className="mx-2">·</span>
                SECURE ACCESS SYSTEM
              </p>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -right-3 top-16 -z-10 hidden h-16 w-16 rounded-2xl border border-primary/20 bg-primary/10 sm:block"
        />

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-3 left-10 -z-10 hidden h-12 w-12 rounded-xl border border-error/20 bg-error/10 sm:block"
        />
      </motion.section>
    </main>
  );
}
