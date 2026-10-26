export const toDate = (value) => {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const getExamState = (exam, now = new Date()) => {
  if (exam.status === false) return "disabled";

  const start = toDate(exam.startTime);
  const finish = toDate(exam.finishTime);

  if (!start || !finish) return "invalid";

  if (now < start) return "upcoming";
  if (now >= finish) return "expired";

  return "active";
};

export const getExamDurationMs = (exam) => {
  const minutes = Number(exam.durationMinutes || 0);
  const seconds = Number(exam.durationSeconds || 0);

  return (minutes * 60 + seconds) * 1000;
};

export const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const time = [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");

  return days > 0 ? `${days} দিন ${time}` : time;
};

export const getExamAttemptId = (examId, studentUid) =>
  `${examId}_${studentUid}`;

export const getResultComment = (percentage, departmentName) => {
  if (percentage >= 100) {
    return `১০০% নম্বর! টপলাইন ${departmentName} এর পক্ষ থেকে তোমাকে অভিনন্দন।`;
  }

  if (percentage >= 80) {
    return "আরও ভালো করতে হবে। নিয়মিত অনুশীলন চালিয়ে যাও।";
  }

  if (percentage >= 50) {
    return "মোটামুটি। আরও ভালো ফলের জন্য বেশি পড়তে হবে।";
  }

  return "প্রস্তুতি খারাপ। বিষয়গুলো আবার ভালোভাবে পড়ো এবং অনুশীলন করো।";
};
