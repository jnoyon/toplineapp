import { FiBookOpen } from "react-icons/fi";

export default function LoadingScreen() {
  return (
    <main className="flex min-h-[65vh] items-center justify-center bg-[#F5F7FA] px-4 transition-colors duration-300 dark:bg-slate-950">
      <div className="text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <span className="absolute inset-0 animate-spin rounded-2xl border-2 border-transparent border-t-[#E74C3C]" />
          <FiBookOpen size={25} className="text-[#2C3E50] dark:text-white" />
        </div>

        <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
          পোর্টাল প্রস্তুত হচ্ছে...
        </p>
      </div>
    </main>
  );
}
