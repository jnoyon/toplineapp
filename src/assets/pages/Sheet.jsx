import { Link } from "react-router";
import {
  FiBookOpen,
  FiFileText,
  FiArrowUpRight,
  FiClock,
  FiLayers,
} from "react-icons/fi";

// Add new headings and sheets here
const SHEET_SECTIONS = [
  {
    id: "basic-grammar",
    title: "বেসিক গ্রামার",
    subtitle: "ইংরেজি গ্রামারের প্রয়োজনীয় বিষয়গুলো",
    icon: FiBookOpen,
    color: "primary",
    sheets: [
      {
        id: "common-vocabulary",
        title: "কমন ভোকাবুলারি",
        description: "দৈনন্দিন জীবনে ব্যবহৃত গুরুত্বপূর্ণ ইংরেজি শব্দ ও অর্থ।",
        route: "/sheet/vocabulary-list",
      },
      {
        id: "verb-conjugation",
        title: "Conjugation of Verb",
        description: "Verb-এর বিভিন্ন রূপ ও সঠিক ব্যবহার শিখুন।",
        route: "/sheet/verb-list",
      },
      {
        id: "degree-of-comperison",
        title: "Degree of Comperison",
        description: "Positive, Comperative, Superlative",
        route: "/sheet/degree-list",
      },
      {
        id: "tense",
        title: "Tense",
        description: "Present, Past, Future",
        route: "/sheet/tense",
      },
    ],
  },
  //   {
  //     id: "sentence-structure",
  //     title: "Sentence Structure",
  //     subtitle: "বাক্য গঠন ও প্রয়োগ",
  //     icon: FiLayers,
  //     color: "secondary",
  //     sheets: [
  //       {
  //         id: "parts-of-speech",
  //         title: "Parts of Speech",
  //         description: "ইংরেজি বাক্যের প্রতিটি শব্দের শ্রেণি ও ব্যবহার।",
  //         route: "/sheets/parts-of-speech",
  //         duration: "২০ মিনিট",
  //         type: "Grammar",
  //       },
  //       {
  //         id: "tense",
  //         title: "Tense",
  //         description: "১২ প্রকার Tense-এর গঠন, নিয়ম ও উদাহরণ।",
  //         route: "/sheets/tense",
  //         duration: "৩০ মিনিট",
  //         type: "Grammar",
  //       },
  //     ],
  //   },
  //   {
  //     id: "writing",
  //     title: "Writing Practice",
  //     subtitle: "লেখার দক্ষতা বাড়ানোর প্রস্তুতি",
  //     icon: FiFileText,
  //     color: "accent",
  //     sheets: [
  //       {
  //         id: "paragraph",
  //         title: "Paragraph Writing",
  //         description: "গুরুত্বপূর্ণ Paragraph এবং লেখার কৌশল।",
  //         route: "/sheets/paragraph",
  //         duration: "৩০ মিনিট",
  //         type: "Writing",
  //       },
  //     ],
  //   },
];

const colorStyles = {
  primary: {
    icon: "bg-primary/10 text-primary",
    line: "bg-primary",
    hover: "group-hover:border-primary/40",
  },
  secondary: {
    icon: "bg-secondary/10 text-secondary",
    line: "bg-secondary",
    hover: "group-hover:border-secondary/40",
  },
  accent: {
    icon: "bg-accent/10 text-accent",
    line: "bg-accent",
    hover: "group-hover:border-accent/40",
  },
};

function SheetCard({ sheet, color }) {
  const styles = colorStyles[color] || colorStyles.primary;

  return (
    <Link
      to={sheet.route}
      className={`group relative flex min-w-0 flex-col rounded-2xl border border-base-300/70 bg-base-100 p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:p-5 ${styles.hover}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${styles.icon}`}
        >
          <FiFileText size={20} />
        </div>

        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-base-200 text-base-content/50 transition-all group-hover:bg-primary group-hover:text-white">
          <FiArrowUpRight size={16} />
        </span>
      </div>

      <div className="mt-4 flex-1">
        <h3 className="text-sm font-bold leading-6 text-base-content transition-colors group-hover:text-primary sm:text-lg">
          {sheet.title}
        </h3>

        <p className="mt-1.5 text-xs leading-5 text-base-content/55 sm:text-sm sm:leading-6">
          {sheet.description}
        </p>
      </div>
    </Link>
  );
}

function SheetSection({ section }) {
  const SectionIcon = section.icon;
  const styles = colorStyles[section.color] || colorStyles.primary;

  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
          >
            <SectionIcon size={19} />
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-base-content sm:text-lg">
              {section.title}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-base-content/50 sm:text-xs">
              {section.subtitle}
            </p>
          </div>
        </div>

        <span className="shrink-0 rounded-full bg-base-200 px-2.5 py-1 text-[10px] font-semibold text-base-content/60 sm:text-xs">
          {section.sheets.length} টি শিট
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {section.sheets.map((sheet) => (
          <SheetCard key={sheet.id} sheet={sheet} color={section.color} />
        ))}
      </div>
    </section>
  );
}

export default function Sheet() {
  const totalSheets = SHEET_SECTIONS.reduce(
    (total, section) => total + section.sheets.length,
    0,
  );

  return (
    <main className="min-h-screen bg-base-200/40 px-3 py-5 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-7xl space-y-7">
        {/* Compact Summary */}
        <div className="flex items-center justify-between rounded-2xl border border-base-300/70 bg-base-100 px-4 py-3.5 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FiBookOpen size={21} />
            </div>

            <div>
              <h1 className="text-base font-bold text-base-content sm:text-lg">
                Exam Sheets
              </h1>
              <p className="text-xs text-base-content/50">
                পরীক্ষার প্রস্তুতির প্রয়োজনীয় শিট
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xl font-extrabold text-primary">{totalSheets}</p>
            <p className="text-[10px] text-base-content/50 sm:text-xs">
              মোট শিট
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-7">
          {SHEET_SECTIONS.map((section) => (
            <SheetSection key={section.id} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
