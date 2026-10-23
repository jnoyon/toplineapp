import { useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router";

import {
  MdDashboard,
  MdSecurity,
  MdArrowForward,
  MdWavingHand,
  MdAutoAwesome,
  MdSchool,
  MdPeople,
  MdFactCheck,
  MdMenuBook,
  MdAssessment,
  MdSettings,
  MdCampaign,
} from "react-icons/md";

import { getUserRole } from "../config/permissions";

// Role names
const roleNames = {
  admin: "অ্যাডমিন",
  departmenthead: "বিভাগীয় প্রধান",
  teacher: "শিক্ষক",
  student: "শিক্ষার্থী",
};

// Dashboard menus
const dashboardMenus = [
  {
    title: "ড্যাশবোর্ড",
    subtitle: "প্রতিষ্ঠানের সারসংক্ষেপ",
    path: "/dashboard",
    icon: MdDashboard,
    color: "#2C3E50",
    lightColor: "#E8EEF3",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "শিক্ষার্থী",
    subtitle: "শিক্ষার্থীদের তথ্য পরিচালনা",
    path: "/students",
    icon: MdPeople,
    color: "#2563EB",
    lightColor: "#DBEAFE",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "শিক্ষক",
    subtitle: "শিক্ষক ও কর্মীদের তথ্য",
    path: "/teachers",
    icon: MdSchool,
    color: "#7C3AED",
    lightColor: "#EDE9FE",
    roles: ["admin", "departmenthead"],
  },
  {
    title: "উপস্থিতি",
    subtitle: "উপস্থিতির তথ্য পরিচালনা",
    path: "/attendance",
    icon: MdFactCheck,
    color: "#059669",
    lightColor: "#D1FAE5",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "পাঠ পরিকল্পনা",
    subtitle: "ক্লাস ও পাঠের পরিকল্পনা",
    path: "/lesson-plans",
    icon: MdMenuBook,
    color: "#D97706",
    lightColor: "#FEF3C7",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "রিপোর্ট",
    subtitle: "প্রতিষ্ঠানের বিভিন্ন রিপোর্ট",
    path: "/reports",
    icon: MdAssessment,
    color: "#0891B2",
    lightColor: "#CFFAFE",
    roles: ["admin", "departmenthead"],
  },
  {
    title: "নোটিশ",
    subtitle: "নোটিশ ও ঘোষণা পরিচালনা",
    path: "/notices",
    icon: MdCampaign,
    color: "#DB2777",
    lightColor: "#FCE7F3",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "সেটিংস",
    subtitle: "সিস্টেম সেটিংস পরিচালনা",
    path: "/settings",
    icon: MdSettings,
    color: "#64748B",
    lightColor: "#F1F5F9",
    roles: ["admin"],
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const outletContext = useOutletContext();
  const user = outletContext?.user;

  const [hoveredMenu, setHoveredMenu] = useState(null);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = getUserRole(user);

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  const visibleMenus = dashboardMenus.filter((menu) =>
    menu.roles.includes(role),
  );

  const roleName = roleNames[role] || "ব্যবহারকারী";
  const displayName = user.name || user.displayName || "ব্যবহারকারী";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F5F7FB] px-4 py-6 text-[#2C3E50] sm:px-6 lg:px-8">
      {/* Background */}
      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 animate-[float_9s_ease-in-out_infinite] rounded-full bg-[#E74C3C]/10 blur-3xl" />

      <div className="pointer-events-none absolute -left-24 top-[450px] h-72 w-72 animate-[float_11s_ease-in-out_infinite] rounded-full bg-blue-300/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl">
        {/* Welcome */}
        <section className="relative isolate mb-8 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#2C3E50] via-[#34495E] to-[#1C2833] p-6 text-white shadow-xl sm:p-9 lg:p-11">
          <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-64 w-64 animate-[float_8s_ease-in-out_infinite] rounded-full border-[35px] border-white/[0.06]" />

          <div className="pointer-events-none absolute right-28 top-16 -z-10 h-24 w-24 animate-pulse rounded-full bg-[#E74C3C]/20 blur-2xl" />

          <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-md">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E74C3C] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#E74C3C]" />
                </span>

                <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/90">
                  TopLine Education
                </span>

                <MdAutoAwesome className="text-[#F9C74F]" />
              </div>

              <h1 className="animate-[fadeInUp_0.7s_ease-out_both] text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                স্বাগতম,{" "}
                <span className="bg-gradient-to-r from-white via-[#FFD5CF] to-[#E74C3C] bg-clip-text text-transparent">
                  {displayName}!
                </span>
                <MdWavingHand className="ml-2 inline-block origin-bottom-right animate-[wave_1.8s_ease-in-out_infinite] text-[#F9C74F]" />
              </h1>

              <p className="mt-4 max-w-lg text-sm leading-7 text-white/70 sm:text-base">
                আপনার শিক্ষা প্রতিষ্ঠানের প্রয়োজনীয় কাজগুলো একটি জায়গা থেকেই
                সহজে পরিচালনা করুন।
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold backdrop-blur-sm">
                  <MdSecurity className="text-[#F9C74F]" size={20} />
                  {roleName}
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm text-white/80 backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Account Active
                </span>
              </div>
            </div>

            <div className="hidden shrink-0 items-center justify-center md:flex">
              <div className="relative flex h-44 w-44 animate-[float_6s_ease-in-out_infinite] items-center justify-center rounded-[36px] border border-white/15 bg-white/[0.07] shadow-2xl backdrop-blur-md lg:h-52 lg:w-52">
                <div className="absolute inset-3 rounded-[28px] border border-dashed border-white/20" />

                <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#E74C3C] to-[#C0392B] shadow-xl shadow-[#E74C3C]/30 lg:h-28 lg:w-28">
                  <MdDashboard className="text-5xl text-white lg:text-6xl" />
                </div>

                <div className="absolute -right-3 top-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F9C74F] text-[#2C3E50] shadow-lg">
                  <MdAutoAwesome size={25} />
                </div>

                <div className="absolute -bottom-3 -left-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#E74C3C] shadow-lg">
                  <MdSchool size={25} />
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[#E74C3C] via-[#F9C74F] to-transparent" />
        </section>

        {/* Menu heading */}
        <section className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-7 w-1.5 rounded-full bg-[#E74C3C]" />

              <h2 className="text-xl font-extrabold sm:text-2xl">আপনার মেনু</h2>
            </div>

            <p className="ml-3.5 text-sm text-slate-500">
              প্রয়োজনীয় বিভাগ নির্বাচন করে কাজ শুরু করুন।
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
            <MdDashboard className="text-[#E74C3C]" size={18} />
            {visibleMenus.length} টি মেনু উপলব্ধ
          </div>
        </section>

        {/* Menu cards */}
        {visibleMenus.length > 0 ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleMenus.map((menu, index) => {
              const Icon = menu.icon;
              const isHovered = hoveredMenu === menu.path;

              return (
                <button
                  key={menu.path}
                  type="button"
                  onClick={() => navigate(menu.path)}
                  onMouseEnter={() => setHoveredMenu(menu.path)}
                  onMouseLeave={() => setHoveredMenu(null)}
                  onFocus={() => setHoveredMenu(menu.path)}
                  onBlur={() => setHoveredMenu(null)}
                  style={{
                    "--menu-color": menu.color,
                    "--menu-light": menu.lightColor,
                    animationDelay: `${index * 80}ms`,
                  }}
                  className="group relative flex min-h-[190px] animate-[fadeInUp_0.55s_ease-out_both] flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-transparent hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E74C3C] focus-visible:ring-offset-2 sm:p-6"
                >
                  {/* Hover background */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(145deg, white 35%, ${menu.lightColor} 150%)`,
                    }}
                  />

                  {/* Top accent */}
                  <div
                    className="absolute left-0 top-0 h-1 w-full origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                    style={{ backgroundColor: menu.color }}
                  />

                  {/* Decorative circle */}
                  <div
                    className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-40 transition-all duration-500 group-hover:scale-150 group-hover:opacity-70"
                    style={{ backgroundColor: menu.lightColor }}
                  />

                  <div className="relative z-10 flex w-full items-start justify-between">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-[18px] text-3xl transition-all duration-300 group-hover:rotate-[-6deg] group-hover:scale-110"
                      style={{
                        backgroundColor: menu.lightColor,
                        color: menu.color,
                        boxShadow: isHovered
                          ? `0 8px 24px ${menu.color}22`
                          : "none",
                      }}
                    >
                      <Icon />
                    </div>

                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                      style={{
                        backgroundColor: isHovered ? menu.color : "#F1F5F9",
                        color: isHovered ? "#FFFFFF" : "#64748B",
                      }}
                    >
                      <MdArrowForward size={20} />
                    </span>
                  </div>

                  <div className="relative z-10 mt-auto pt-7">
                    <h3 className="text-lg font-extrabold text-[#2C3E50]">
                      {menu.title}
                    </h3>

                    <p className="mt-1.5 text-sm text-slate-500">
                      {menu.subtitle}
                    </p>
                  </div>

                  <div
                    className="absolute bottom-0 left-0 h-[3px] w-0 transition-all duration-500 group-hover:w-full"
                    style={{ backgroundColor: menu.color }}
                  />
                </button>
              );
            })}
          </section>
        ) : (
          <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FDEAE7] text-3xl text-[#E74C3C]">
              <MdSecurity />
            </div>

            <h3 className="text-lg font-bold text-[#2C3E50]">
              কোনো মেনু পাওয়া যায়নি
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              আপনার Role অনুযায়ী কোনো মেনু নির্ধারণ করা হয়নি।
            </p>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-10 border-t border-slate-200 py-5 text-center">
          <p className="text-xs font-medium tracking-wide text-slate-400">
            <span className="text-[#2C3E50]">TOPLINE</span> EDUCATION
            <span className="mx-2 text-[#E74C3C]">•</span>
            LEARN · GROW · SUCCEED
          </p>
        </footer>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-14px);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes wave {
          0%, 100% {
            transform: rotate(0deg);
          }

          20% {
            transform: rotate(18deg);
          }

          40% {
            transform: rotate(-8deg);
          }

          60% {
            transform: rotate(15deg);
          }

          80% {
            transform: rotate(-4deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
