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
    title: "লিডারবোর্ড",
    subtitle: "সেরা শিক্ষার্থীসমূহ",
    path: "/admin/top",
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
    title: "পরীক্ষার ফলাফল দিন",
    subtitle: "মার্ক যুক্ত করুন",
    path: "/add-exam-mark",
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
    path: "/manage-exams",
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
  {
    title: "পরীক্ষার ফলাফল দেখুন",
    subtitle: "Online Exam",
    path: "/admin/online-exam-results",
    icon: MdSettings,
    color: "text-slate-500",
    background: "bg-slate-500/10",
    roles: ["admin"],
  },
  {
    title: "রিপোর্ট প্রিন্ট",
    subtitle: "মাসিক মূল্যায়ণ রিপোর্ট",
    path: "/monthly-report",
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
        {/* Menu cards */}
        {menus.length > 0 ? (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
