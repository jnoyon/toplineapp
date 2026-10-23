export function toBangla(value) {
  const digits = "০১২৩৪৫৬৭৮৯";

  return String(value ?? "").replace(/\d/g, (digit) => digits[Number(digit)]);
}

export function banglaDate(value) {
  if (!value) return "তথ্য নেই";

  let date;

  if (value?.toDate) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "তথ্য নেই";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return toBangla(`${day}/${month}/${year}`);
}
