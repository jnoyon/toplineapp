import { Navigate, useNavigate, useOutletContext } from "react-router";
import {
  MdPeople,
  MdSchool,
  MdFactCheck,
  MdMenuBook,
  MdAssessment,
  MdCampaign,
  MdSettings,
  MdArrowOutward,
  MdShield,
  MdVerified,
  MdDashboard,
  MdPerson,
  MdEmail,
} from "react-icons/md";
import { getUserRole } from "../config/permissions";

const roleNames = {
  admin: "অ্যাডমিন",
  departmenthead: "বিভাগীয় প্রধান",
  teacher: "শিক্ষক",
  student: "শিক্ষার্থী",
};

const dashboardMenus = [
  {
    title: "সকল শিক্ষার্থী",
    subtitle: "শিক্ষার্থীদের তথ্য পরিচালনা",
    path: "/students",
    icon: MdPeople,
    color: "text-blue-500",
    background: "bg-blue-500/10",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "শিক্ষক যুক্ত করুন",
    subtitle: "শিক্ষক ও কর্মীদের তথ্য",
    path: "/admin/teachers",
    icon: MdSchool,
    color: "text-violet-500",
    background: "bg-violet-500/10",
    roles: ["admin", "departmenthead"],
  },
  {
    title: "উপস্থিতি দিন",
    subtitle: "উপস্থিতির তথ্য পরিচালনা",
    path: "/add-attendance",
    icon: MdFactCheck,
    color: "text-emerald-500",
    background: "bg-emerald-500/10",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "পাঠ পরিকল্পনা",
    subtitle: "ক্লাস ও পাঠের পরিকল্পনা",
    path: "/lesson-plans",
    icon: MdMenuBook,
    color: "text-amber-500",
    background: "bg-amber-500/10",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "অনলাইন এক্সাম",
    subtitle: "পরীক্ষা ও মূল্যায়ন পরিচালনা",
    path: "/create-exam",
    icon: MdAssessment,
    color: "text-cyan-500",
    background: "bg-cyan-500/10",
    roles: ["admin", "departmenthead"],
  },
  {
    title: "নোটিশ",
    subtitle: "নোটিশ ও ঘোষণা পরিচালনা",
    path: "/noticeboard",
    icon: MdCampaign,
    color: "text-pink-500",
    background: "bg-pink-500/10",
    roles: ["admin", "departmenthead", "teacher"],
  },
  {
    title: "ব্যাচ ম্যানেজমেন্ট",
    subtitle: "সকল ব্যাচ পরিচালনা",
    path: "/admin/batch-management",
    icon: MdCampaign,
    color: "text-rose-500",
    background: "bg-rose-500/10",
    roles: ["admin"],
  },
  {
    title: "সিলেবাস যুক্ত করুন",
    subtitle: "পরীক্ষার সিলেবাস পরিচালনা",
    path: "/add-syllabus",
    icon: MdSettings,
    color: "text-slate-500",
    background: "bg-slate-500/10",
    roles: ["admin"],
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const outletContext = useOutletContext();
  const user = outletContext?.user;

  if (!user) return <Navigate to="/login" replace />;

  const role = getUserRole(user);

  if (!role) return <Navigate to="/login" replace />;

  const menus = dashboardMenus.filter((item) => item.roles.includes(role));

  const name = user.name || user.displayName || "ব্যবহারকারী";
  const email = user.email || "";
  const photo =
    user.photoURL || user.photoUrl || user.photo || user.image || "";
  const isActive = user.isActive !== false;

  return (
    <main className="min-h-screen bg-base-200/50 px-4 py-6 text-base-content transition-colors duration-300 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Profile card */}
        <section className="profile-enter relative mb-8 overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-secondary/10 blur-3xl" />

          <div className="relative p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                {/* Profile image */}
                <div className="relative shrink-0">
                  <div className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-2xl bg-primary/10 text-3xl font-black text-primary ring-1 ring-primary/20 sm:h-24 sm:w-24">
                    {photo ? (
                      <img
                        src={photo}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      name.trim().charAt(0).toUpperCase() || "U"
                    )}
                  </div>

                  <span
                    className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-base-100 ${
                      isActive ? "bg-success" : "bg-error"
                    }`}
                    title={isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
                  />
                </div>

                {/* Profile information */}
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">
                      TOPLINE EDUCATION
                    </span>
                    <MdVerified className="text-primary" size={17} />
                  </div>

                  <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
                    {name}
                  </h1>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                      <MdShield size={15} />
                      {roleNames[role] || "ব্যবহারকারী"}
                    </span>

                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-base-content/60">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isActive ? "bg-success" : "bg-error"
                        }`}
                      />
                      {isActive ? "অ্যাকাউন্ট সক্রিয়" : "অ্যাকাউন্ট নিষ্ক্রিয়"}
                    </span>
                  </div>

                  {email && (
                    <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-base-content/55">
                      <MdEmail className="shrink-0" />
                      <span className="truncate">{email}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Dashboard summary */}
              <div className="flex items-center gap-3 rounded-2xl border border-base-300 bg-base-200/70 p-4 sm:min-w-48">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-content shadow-lg shadow-primary/20">
                  <MdDashboard size={25} />
                </div>

                <div>
                  <p className="text-xs font-medium text-base-content/55">
                    আপনার ড্যাশবোর্ড
                  </p>
                  <p className="mt-0.5 text-xl font-black">
                    {menus.length}টি বিভাগ
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 border-t border-base-300 pt-4 text-sm text-base-content/65">
              <MdPerson className="mt-0.5 shrink-0 text-primary" size={19} />
              <p>
                স্বাগতম,{" "}
                <span className="font-bold text-base-content">{name}</span>।
                আপনার প্রয়োজনীয় কাজ এখান থেকেই পরিচালনা করুন।
              </p>
            </div>
          </div>

          <div className="h-1 w-full bg-gradient-to-r from-primary via-secondary to-transparent" />
        </section>

        {/* Menu heading */}
        <section className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              QUICK ACCESS
            </p>
            <h2 className="text-xl font-black sm:text-2xl">আপনার মেনু</h2>
            <p className="mt-1 text-sm text-base-content/60">
              প্রয়োজনীয় বিভাগ নির্বাচন করে কাজ শুরু করুন।
            </p>
          </div>

          <span className="hidden items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-2 text-xs font-semibold text-base-content/60 sm:inline-flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            {menus.length}টি বিভাগ
          </span>
        </section>

        {/* Menu cards */}
        {menus.length > 0 ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {menus.map((menu, index) => {
              const Icon = menu.icon;

              return (
                <button
                  key={menu.path}
                  type="button"
                  onClick={() => navigate(menu.path)}
                  style={{ animationDelay: `${index * 55}ms` }}
                  className="dashboard-card group relative flex min-h-44 flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 p-5 text-left shadow-sm transition duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-200 sm:p-6"
                >
                  <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-300 group-hover:scale-x-100" />

                  <div className="flex items-start justify-between">
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-xl ${menu.background} ${menu.color} transition duration-300 group-hover:rotate-[-5deg] group-hover:scale-110`}
                    >
                      <Icon size={25} />
                    </span>

                    <span className="grid h-9 w-9 place-items-center rounded-full bg-base-200 text-base-content/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-primary group-hover:text-primary-content">
                      <MdArrowOutward size={19} />
                    </span>
                  </div>

                  <div className="mt-auto pt-6">
                    <h3 className="text-base font-extrabold">{menu.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-base-content/60">
                      {menu.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="rounded-2xl border border-base-300 bg-base-100 px-6 py-12 text-center">
            <MdShield className="mx-auto mb-3 text-4xl text-primary" />
            <h3 className="font-bold">কোনো মেনু পাওয়া যায়নি</h3>
            <p className="mt-1 text-sm text-base-content/60">
              আপনার Role অনুযায়ী কোনো মেনু নির্ধারণ করা হয়নি।
            </p>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-10 border-t border-base-300 py-5 text-center text-xs font-medium tracking-wide text-base-content/45">
          <span className="font-extrabold text-base-content">TOPLINE</span>{" "}
          EDUCATION
          <span className="mx-2 text-primary">•</span>
          LEARN · GROW · SUCCEED
        </footer>
      </div>

      <style>{`
        @keyframes dashboard-enter {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .profile-enter {
          animation: dashboard-enter 0.45s ease-out both;
        }

        .dashboard-card {
          animation: dashboard-enter 0.45s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .profile-enter,
          .dashboard-card {
            animation: none;
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
