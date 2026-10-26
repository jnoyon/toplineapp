const ADMIN_EMAILS = ["jihadur51@gmail.com"];
const DEPARTMENT_HEAD_EMAILS = [];
const EXAM_CONTROLLER_EMAILS = [];

const normalizeEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

const includesEmail = (email, list) =>
  list.some((item) => normalizeEmail(item) === normalizeEmail(email));

export function isAdmin(email) {
  return includesEmail(email, ADMIN_EMAILS);
}

export function isDepartmentHead(email) {
  return includesEmail(email, DEPARTMENT_HEAD_EMAILS);
}

export function isExamController(email) {
  return includesEmail(email, EXAM_CONTROLLER_EMAILS);
}

export function getUserRole(user) {
  if (!user) return "";

  const email = normalizeEmail(user.email);

  if (isAdmin(email)) return "admin";
  if (isDepartmentHead(email)) return "departmenthead";
  if (isExamController(email)) return "exam-controller";

  const role = String(user.role ?? "")
    .trim()
    .toLowerCase();

  return [
    "admin",
    "teacher",
    "student",
    "departmenthead",
    "exam-controller",
  ].includes(role)
    ? role
    : "";
}
