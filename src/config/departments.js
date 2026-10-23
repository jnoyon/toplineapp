// src/config/departments.js

export const departments = {
  ACADEMY: {
    id: 1,
    name: "টপলাইন একাডেমি",
    key: "academy",
    type: "school",
    classes: [
      { id: "play", name: "প্লে" },
      { id: "nursery", name: "নার্সারি" },
      { id: "one", name: "প্রথম শ্রেণি" },
      { id: "two", name: "দ্বিতীয় শ্রেণি" },
      { id: "three", name: "তৃতীয় শ্রেণি" },
      { id: "four", name: "চতুর্থ শ্রেণি" },
      { id: "five", name: "পঞ্চম শ্রেণি" },
    ],
  },

  COACHING: {
    id: 2,
    name: "টপলাইন মডেল কোচিং",
    key: "coaching",
    type: "coaching",
    classes: [
      { id: "six", name: "ষষ্ঠ শ্রেণি" },
      { id: "seven", name: "সপ্তম শ্রেণি" },
      { id: "eight", name: "অষ্টম শ্রেণি" },
      { id: "nine", name: "নবম শ্রেণি" },
      { id: "ten", name: "দশম শ্রেণি" },
    ],
  },

  CARE: {
    id: 3,
    name: "টপলাইন কেয়ার",
    key: "care",
    type: "batch",
    classes: [
      { id: "batch1", name: "ব্যাচ ১" },
      { id: "batch2", name: "ব্যাচ ২" },
    ],
  },
};

// Department list
export const departmentList = Object.values(departments);

// Department verification
export const isAcademy = (id) => Number(id) === departments.ACADEMY.id;

export const isCoaching = (id) => Number(id) === departments.COACHING.id;

export const isCare = (id) => Number(id) === departments.CARE.id;

// Subject list
export const subjectList = [
  // Add subjects here when needed
];
