import { Navigate, Routes, Route } from "react-router";
import { useOutletContext } from "react-router";

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

// Redirect logged-in users to the correct page
function LoginRedirect() {
  const outletContext = useOutletContext();
  const user = outletContext?.user;

  if (!user) {
    return <Login />;
  }

  const role = getUserRole(user);

  if (role === "student") {
    return <Navigate to="/portal" replace />;
  }

  if (["admin", "teacher", "departmenthead"].includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}

export default function Router() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* Public Routes */}
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/reg" element={<Registration />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route path="/student/:studentId" element={<StudentProfile />} />

        <Route
          path="/edit-student/:studentId"
          element={<EditStudentProfile />}
        />

        {/* Shared Dashboard */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/portal" element={<Portal />} />

        {/* Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route
            path="/admin/batch-monthly"
            element={<BatchMonthlyManagement />}
          />

          <Route path="/admin/teachers" element={<AddTeacher />} />

          <Route path="/admin/subjects" element={<Subjects />} />

          <Route path="/admin/villages" element={<AddVillage />} />
        </Route>

        {/* Teacher Routes */}
        <Route element={<ProtectedRoute allowedRoles={["admin", "teacher"]} />}>
          <Route path="/students" element={<Students />} />
          <Route path="/add-attendance" element={<AddAttendance />} />
        </Route>

        {/* Student Routes */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin", "teacher", "student"]} />
          }
        >
          {/* Add student-specific protected routes here */}
        </Route>
      </Route>
    </Routes>
  );
}
