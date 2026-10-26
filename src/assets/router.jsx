import { Navigate, Routes, Route, useOutletContext } from "react-router";

import MainLayout from "./layout/MainLayout";
import ProtectedRoute from "../route/ProtectedRoute";

import { getUserRole } from "../config/permissions";

import Login from "./pages/Login";
import Registration from "./pages/Registration";
import Unauthorized from "./pages/Unauthorized";

import Dashboard from "../dashboard/Dashboard";

import AddVillage from "./admin/AddVillage";
import Subjects from "./admin/Subjects";

import AddTeacher from "../dashboard/AddTeacher";
import Students from "../dashboard/Students";
import StudentProfile from "./students/StudentProfile";
import AddAttendance from "../dashboard/AddAttendance";

import BatchMonthlyManagement from "./toplinecare/batch/BatchMonthlyManagement";
import EditStudentProfile from "./students/EditStudentProfile";
import Portal from "./students/Portal";

import CreateOnlineExam from "../onlineexam/pages/CreateOnlineExam";
import ManageOnlineExams from "../onlineexam/pages/ManageOnlineExams";
import EditOnlineExam from "../onlineexam/pages/EditOnlineExam";
import OnlineExamList from "../onlineexam/pages/ExamList";

import AddNotice from "../dashboard/AddNotice";
import Noticeboard from "../dashboard/Noticeboard";
import Notices from "./students/Notices";

import AddSyllabus from "../dashboard/AddExamSyllabus";
import ViewSyllabus from "./students/ViewSyllabus";

import AddExamMark from "../dashboard/AddExamMark";
import ManageExamMark from "../dashboard/ManageExamMark";
import StudentExamResults from "./students/StudentExamResults";

const STUDENT_SESSION_KEY = "studentSession";

const STAFF_ROLES = ["admin", "teacher", "departmenthead"];

// ==========================================
// Read student session safely
// ==========================================
function getStudentSession() {
  try {
    const storedSession = localStorage.getItem(STUDENT_SESSION_KEY);

    if (!storedSession) {
      return null;
    }

    const session = JSON.parse(storedSession);

    if (
      session?.role !== "student" ||
      !session?.studentId ||
      !session?.documentId
    ) {
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    return null;
  }
}

// ==========================================
// Redirect logged-in users
// ==========================================
function LoginRedirect() {
  const outletContext = useOutletContext();
  const user = outletContext?.user;

  // Student authentication uses localStorage.
  const studentSession = getStudentSession();

  if (studentSession) {
    return <Navigate to="/portal" replace />;
  }

  // Staff authentication uses Firebase Auth.
  if (!user) {
    return <Login />;
  }

  const role = getUserRole(user);

  if (role === "student") {
    return <Navigate to="/portal" replace />;
  }

  if (STAFF_ROLES.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}

// ==========================================
// Application routes
// ==========================================
export default function Router() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* Public routes */}
        <Route path="/login" element={<LoginRedirect />} />

        <Route path="/reg" element={<Registration />} />

        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Attendance route — retained from your existing router */}
        <Route path="/add-attendance" element={<AddAttendance />} />

        {/* Student profile routes */}
        <Route path="/student/:studentId" element={<StudentProfile />} />

        <Route
          path="/edit-student/:studentId"
          element={<EditStudentProfile />}
        />

        {/* Admin, Teacher and Department Head dashboard */}
        <Route element={<ProtectedRoute allowedRoles={STAFF_ROLES} />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/dashboard" element={<Dashboard />} />
        </Route>

        {/* Student portal */}
        <Route element={<ProtectedRoute allowedRoles={["student"]} />}>
          <Route path="/portal" element={<Portal />} />
        </Route>

        {/* Online exam management */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin", "exam-controller"]} />
          }
        >
          <Route path="/create-exam" element={<CreateOnlineExam />} />

          <Route path="/manage-exams" element={<ManageOnlineExams />} />

          <Route
            path="/edit-online-exam/:examId"
            element={<EditOnlineExam />}
          />
        </Route>

        {/* Admin routes */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route
            path="/admin/batch-management"
            element={<BatchMonthlyManagement />}
          />

          <Route path="/admin/teachers" element={<AddTeacher />} />

          <Route path="/admin/subjects" element={<Subjects />} />

          <Route path="/admin/villages" element={<AddVillage />} />
        </Route>

        {/* Student management and academic administration */}
        <Route element={<ProtectedRoute allowedRoles={["admin", "teacher"]} />}>
          <Route path="/students" element={<Students />} />

          <Route path="/add-notice" element={<AddNotice />} />

          <Route path="/manage-exam-mark" element={<ManageExamMark />} />

          <Route path="/add-exam-mark" element={<AddExamMark />} />

          <Route path="/noticeboard" element={<Noticeboard />} />

          <Route path="/add-syllabus" element={<AddSyllabus />} />
        </Route>

        {/* Online exam access */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin", "teacher", "student"]} />
          }
        >
          <Route path="/exam-list" element={<OnlineExamList />} />

          <Route path="/view-syllabus" element={<ViewSyllabus />} />

          <Route path="/student-exam-result" element={<StudentExamResults />} />

          <Route path="/notices" element={<Notices />} />
        </Route>
      </Route>
    </Routes>
  );
}
