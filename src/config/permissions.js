// src/config/permissions.js

const ADMIN_EMAILS = ["jihadur51@gmail.com"];

const DEPARTMENT_HEAD_EMAILS = [];

const normalizeEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

export function isAdmin(email) {
  const normalizedEmail = normalizeEmail(email);

  return ADMIN_EMAILS.some(
    (adminEmail) => normalizeEmail(adminEmail) === normalizedEmail,
  );
}

export function isDepartmentHead(email) {
  const normalizedEmail = normalizeEmail(email);

  return DEPARTMENT_HEAD_EMAILS.some(
    (headEmail) => normalizeEmail(headEmail) === normalizedEmail,
  );
}

export function getUserRole(user) {
  if (!user) return "";

  const email = normalizeEmail(user.email);

  if (isAdmin(email)) return "admin";

  if (isDepartmentHead(email)) return "departmenthead";

  const role = String(user.role ?? "")
    .trim()
    .toLowerCase();

  if (["teacher", "student"].includes(role)) {
    return role;
  }

  return "";
}
