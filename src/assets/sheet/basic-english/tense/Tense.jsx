import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdSchool,
  MdQuiz,
  MdVolumeUp,
  MdLightbulbOutline,
  MdCheckCircle,
  MdCancel,
  MdArrowForward,
  MdShuffle,
  MdLocalFireDepartment,
  MdRestartAlt,
  MdExpandMore,
} from "react-icons/md";

/* =========================================================
   Static data
========================================================= */

const STORAGE_KEY = "tense-learning-center";

const TIMES = [
  {
    key: "present",
    label: "Present",
    bn: "বর্তমান কাল",
    badge: "badge-primary",
    text: "text-primary",
    soft: "border-primary/30 bg-primary/10 hover:bg-primary/20",
    solid: "border-primary bg-primary text-primary-content shadow-md",
    dot: "bg-primary",
  },
  {
    key: "past",
    label: "Past",
    bn: "অতীত কাল",
    badge: "badge-secondary",
    text: "text-secondary",
    soft: "border-secondary/30 bg-secondary/10 hover:bg-secondary/20",
    solid: "border-secondary bg-secondary text-secondary-content shadow-md",
    dot: "bg-secondary",
  },
  {
    key: "future",
    label: "Future",
    bn: "ভবিষ্যৎ কাল",
    badge: "badge-accent",
    text: "text-accent",
    soft: "border-accent/30 bg-accent/10 hover:bg-accent/20",
    solid: "border-accent bg-accent text-accent-content shadow-md",
    dot: "bg-accent",
  },
];

const TYPES = [
  { key: "indefinite", label: "Indefinite", short: "Indefinite", bn: "সাধারণ" },
  { key: "continuous", label: "Continuous", short: "Continuous", bn: "চলমান" },
  { key: "perfect", label: "Perfect", short: "Perfect", bn: "সম্পন্ন" },
  {
    key: "perfectContinuous",
    label: "Perfect Continuous",
    short: "Perf. Cont.",
    bn: "সময় ধরে চলমান",
  },
];

const CHIP_STYLES = {
  sub: "border-primary/40 bg-primary/10 text-primary",
  aux: "border-warning/60 bg-warning/20 text-base-content",
  verb: "border-success/40 bg-success/10 text-success",
  obj: "border-base-300 bg-base-200 text-base-content",
  time: "border-info/40 bg-info/10 text-info",
};

const f = (text, kind) => ({ text, kind });

const TENSES = {
  "present-indefinite": {
    name: "Present Indefinite",
    usage:
      "যে কাজগুলো তুমি নিয়মিত করো কিংবা যা বর্তমান সত্য, সেগুলো Present Indefinite Tense। Subject এরপর Verb এর Present Form বসিয়ে দিলেই হয়ে যায়।",
    formula: [
      f("Sub", "sub"),
      f("Verb এর Present Form", "verb"),
      f("Obj", "obj"),
    ],
    notes: [
      "Present Indefinite এ Subject 3rd Person Singular হলে verb এর শেষে s/es যুক্ত হয়।",
      "Verb এর শেষে o/ch/sh/x/z থাকলে es যুক্ত হয়।",
    ],
    examples: [
      { bn: "আমি ভাত খাই", en: "I eat rice." },
      { bn: "আমি একজন শিক্ষার্থী", en: "I am a student." },
      { bn: "সে একটি বই পড়ে", en: "He reads a book." },
    ],
  },
  "present-continuous": {
    name: "Present Continuous",
    usage:
      "বর্তমানে যে কাজগুলো চলমান সেগুলো Present Continuous Tense। Subject এর পর am/is/are এবং verb এর শেষে ing যোগ করলেই হয়।",
    formula: [
      f("Sub", "sub"),
      f("am/is/are", "aux"),
      f("Verb + ing", "verb"),
      f("Obj", "obj"),
    ],
    notes: [
      "Sub Singular হলে is ও Plural হলে are বসে। শুধুমাত্র I এর ক্ষেত্রে am বসে।",
      "কিছু Verb এ ing যোগ করলে শেষ অক্ষর দ্বিত্ব হয়: run → running, sit → sitting, begin → beginning, stop → stopping।",
    ],
    examples: [
      { bn: "আমি ভাত খাচ্ছি", en: "I am eating rice." },
      {
        bn: "একটি পাখি আকাশে উড়ছে",
        en: "A bird is flying in the sky.",
      },
      { bn: "তারা গান গাচ্ছে", en: "They are singing a song." },
    ],
  },
  "present-perfect": {
    name: "Present Perfect",
    usage:
      "কোনো কাজ মাত্র শেষ হয়েছে বোঝালে Present Perfect Tense হয়। Subject এরপর have/has এবং Verb এর Past Participle (V3) বসে।",
    formula: [
      f("Sub", "sub"),
      f("have/has", "aux"),
      f("Verb এর V3", "verb"),
      f("Obj", "obj"),
    ],
    notes: [
      "Subject 3rd Person Singular এ has এবং অন্যান্য Subject এ have বসে।",
    ],
    examples: [
      { bn: "আমি ভাত খেয়েছি", en: "I have eaten rice." },
      {
        bn: "একটি পাখি আকাশে উড়েছে",
        en: "A bird has flown in the sky.",
      },
      { bn: "তারা গান গেয়েছে", en: "They have sung a song." },
    ],
  },
  "present-perfectContinuous": {
    name: "Present Perfect Continuous",
    usage:
      "কোনো কাজ কিছু সময় ধরে চলছে বোঝালে Present Perfect Continuous Tense হয়।",
    formula: [
      f("Sub", "sub"),
      f("have been/has been", "aux"),
      f("Verb + ing", "verb"),
      f("Obj", "obj"),
      f("since/for + সময়", "time"),
    ],
    notes: ["নির্দিষ্ট সময়ে since এবং অনির্দিষ্ট সময়ে (সময়কালে) for বসে।"],
    examples: [
      {
        bn: "আমি সকাল থেকে পড়ছি",
        en: "I have been reading since morning.",
      },
      {
        bn: "সে ৫ বছর যাবৎ স্কুলে পড়ছে",
        en: "He has been studying at school for 5 years.",
      },
      {
        bn: "আমি ২০ মিনিট যাবৎ এই বইটি পড়ছি",
        en: "I have been reading this book for 20 minutes.",
      },
    ],
  },
  "past-indefinite": {
    name: "Past Indefinite",
    usage:
      "যে কাজগুলো অতীতে করা হয়েছিল সেগুলো Past Indefinite Tense। Subject এরপর Verb এর Past Form (V2) বসালেই হয়।",
    formula: [f("Sub", "sub"), f("Verb এর V2", "verb"), f("Obj", "obj")],
    notes: ["am/is/are এর Past Form হলো was/were।"],
    examples: [
      { bn: "আমি ভাত খেয়েছিলাম", en: "I ate rice." },
      { bn: "আমি একজন শিক্ষার্থী ছিলাম", en: "I was a student." },
      { bn: "আমি ঢাকা গিয়েছিলাম", en: "I went to Dhaka." },
    ],
  },
  "past-continuous": {
    name: "Past Continuous",
    usage:
      "অতীতে যে কাজগুলো চলমান ছিল সেগুলো Past Continuous Tense। Subject এর পর was/were এবং verb এর শেষে ing যোগ হয়।",
    formula: [
      f("Sub", "sub"),
      f("was/were", "aux"),
      f("Verb + ing", "verb"),
      f("Obj", "obj"),
    ],
    notes: ["Subject Singular হলে was এবং Plural হলে were বসে।"],
    examples: [
      { bn: "আমি ভাত খাচ্ছিলাম", en: "I was eating rice." },
      {
        bn: "একটি পাখি আকাশে উড়ছিল",
        en: "A bird was flying in the sky.",
      },
      { bn: "তারা গান গাচ্ছিল", en: "They were singing a song." },
    ],
  },
  "past-perfect": {
    name: "Past Perfect",
    usage:
      "অতীতের দুটি ঘটনার মধ্যে যেটি আগে ঘটেছে সেটি Past Perfect, আর যেটি পরে ঘটেছে সেটি Past Indefinite। Subject এরপর had এবং Verb এর V3 বসে।",
    formula: [
      f("Sub", "sub"),
      f("had", "aux"),
      f("Verb এর V3", "verb"),
      f("Obj", "obj"),
    ],
    notes: [
      "আগের কাজ → Past Perfect (had + V3), পরের কাজ → Past Indefinite (V2)।",
    ],
    examples: [
      { bn: "আমি ভাত খেয়েছিলাম", en: "I had eaten rice." },
      {
        bn: "আমি যখন স্টেশনে পৌঁছালাম, ট্রেন ছেড়ে দিয়েছিল",
        en: "When I reached the station, the train had left.",
      },
      {
        bn: "তার মা আসার আগে সে হোমওয়ার্ক শেষ করেছিল",
        en: "She had finished her homework before her mother came.",
      },
      {
        bn: "ডাক্তার আসার আগেই রোগী মারা গিয়েছিল",
        en: "The patient had died before the doctor arrived.",
      },
    ],
  },
  "past-perfectContinuous": {
    name: "Past Perfect Continuous",
    usage:
      "অতীতে কোনো কাজ কিছু সময় ধরে চলছিল বোঝালে Past Perfect Continuous Tense হয়।",
    formula: [
      f("Sub", "sub"),
      f("had been", "aux"),
      f("Verb + ing", "verb"),
      f("Obj", "obj"),
      f("since/for + সময়", "time"),
    ],
    notes: ["সব Subject এর ক্ষেত্রেই had been বসে।"],
    examples: [
      {
        bn: "আমি দুই ঘণ্টা যাবৎ ভাত খাচ্ছিলাম",
        en: "I had been eating rice for two hours.",
      },
    ],
  },
  "future-indefinite": {
    name: "Future Indefinite",
    usage:
      "যে কাজগুলো ভবিষ্যতে করবে সেগুলো Future Indefinite Tense। Subject এরপর shall/will এবং Verb এর Present Form বসে।",
    formula: [
      f("Sub", "sub"),
      f("shall/will", "aux"),
      f("Verb এর Present Form", "verb"),
      f("Obj", "obj"),
    ],
    notes: [
      "shall/will হলো Modal Auxiliary। Modal Auxiliary এর পর সবসময় Verb এর base form বসে।",
    ],
    examples: [
      { bn: "আমি ভাত খাবো", en: "I shall eat rice." },
      { bn: "আমি ডাক্তার হবো", en: "I shall be a doctor." },
    ],
  },
  "future-continuous": {
    name: "Future Continuous",
    usage:
      "ভবিষ্যতে কোনো কাজ চলতে থাকবে বোঝালে Future Continuous Tense হয়। Subject এর পর shall be/will be এবং verb এর শেষে ing যোগ হয়।",
    formula: [
      f("Sub", "sub"),
      f("shall be/will be", "aux"),
      f("Verb + ing", "verb"),
      f("Obj", "obj"),
    ],
    notes: [
      "shall/will এর পর am/is/are এর বদলে be বসে, কারণ am/is/are এর base form হলো be।",
    ],
    examples: [{ bn: "আমি ভাত খেতে থাকবো", en: "I shall be eating rice." }],
  },
  "future-perfect": {
    name: "Future Perfect",
    usage:
      "ভবিষ্যতে কোনো কাজ শেষ হবে বোঝালে Future Perfect Tense হয়। Subject এরপর shall have/will have এবং Verb এর V3 বসে।",
    formula: [
      f("Sub", "sub"),
      f("shall have/will have", "aux"),
      f("Verb এর V3", "verb"),
      f("Obj", "obj"),
    ],
    notes: [],
    examples: [
      { bn: "আমি সেখানে গিয়ে থাকবো", en: "I shall have gone there." },
    ],
  },
  "future-perfectContinuous": {
    name: "Future Perfect Continuous",
    usage:
      "ভবিষ্যতে কোনো কাজ সময় ধরে চলতে থাকবে বোঝালে Future Perfect Continuous Tense হয়।",
    formula: [
      f("Sub", "sub"),
      f("shall have been/will have been", "aux"),
      f("Verb + ing", "verb"),
      f("Obj", "obj"),
      f("for/since + সময়", "time"),
    ],
    notes: [],
    examples: [
      {
        bn: "আমি ৪ মিনিট যাবৎ ভাত খেতে থাকবো",
        en: "I shall have been eating rice for 4 minutes.",
      },
    ],
  },
};

const TENSE_KEYS = TIMES.flatMap((time) =>
  TYPES.map((type) => `${time.key}-${type.key}`),
);

const getTenseMeta = (key) => {
  const [timeKey, typeKey] = key.split("-");

  return {
    time: TIMES.find((item) => item.key === timeKey),
    type: TYPES.find((item) => item.key === typeKey),
    ...TENSES[key],
  };
};

// Used to generate quiz sentences.
const SUBJECTS = [
  { label: "I", key: "I", third: false, first: true },
  { label: "You", key: "You", third: false, first: false },
  { label: "He", key: "He", third: true, first: false },
  { label: "She", key: "She", third: true, first: false },
  { label: "It", key: "It", third: true, first: false },
  { label: "We", key: "We", third: false, first: true },
  { label: "They", key: "They", third: false, first: false },
  { label: "Rafi", key: "Rafi", third: true, first: false },
  { label: "A bird", key: "A bird", third: true, first: false },
  {
    label: "Rafi and Zaman",
    key: "Rafi and Zaman",
    third: false,
    first: false,
  },
];

// "read" is left out because "I read" is the same in present and past.
const VERBS = [
  {
    key: "eat",
    s: "eats",
    v2: "ate",
    v3: "eaten",
    ing: "eating",
    object: "rice",
  },
  {
    key: "go",
    s: "goes",
    v2: "went",
    v3: "gone",
    ing: "going",
    object: "to school",
  },
  {
    key: "write",
    s: "writes",
    v2: "wrote",
    v3: "written",
    ing: "writing",
    object: "a letter",
  },
  {
    key: "play",
    s: "plays",
    v2: "played",
    v3: "played",
    ing: "playing",
    object: "football",
  },
  {
    key: "run",
    s: "runs",
    v2: "ran",
    v3: "run",
    ing: "running",
    object: "in the park",
  },
  {
    key: "study",
    s: "studies",
    v2: "studied",
    v3: "studied",
    ing: "studying",
    object: "English",
  },
  {
    key: "see",
    s: "sees",
    v2: "saw",
    v3: "seen",
    ing: "seeing",
    object: "a movie",
  },
  {
    key: "sit",
    s: "sits",
    v2: "sat",
    v3: "sat",
    ing: "sitting",
    object: "on the chair",
  },
  {
    key: "sing",
    s: "sings",
    v2: "sang",
    v3: "sung",
    ing: "singing",
    object: "a song",
  },
  {
    key: "fly",
    s: "flies",
    v2: "flew",
    v3: "flown",
    ing: "flying",
    object: "in the sky",
  },
  {
    key: "make",
    s: "makes",
    v2: "made",
    v3: "made",
    ing: "making",
    object: "a kite",
  },
];

const TIME_PHRASES = [
  "for 2 hours",
  "for 20 minutes",
  "for 5 years",
  "since morning",
  "since 5 o'clock",
];

/* =========================================================
   Sentence generator (for the quiz)
========================================================= */

function buildSentences(subject, verb, object, timePhrase) {
  const be = subject.key === "I" ? "am" : subject.third ? "is" : "are";
  const was = subject.key === "I" || subject.third ? "was" : "were";
  const have = subject.third ? "has" : "have";
  const will = subject.first ? "shall" : "will";

  const sub = f(subject.label, "sub");
  const obj = object.trim() ? f(object.trim(), "obj") : null;
  const time = timePhrase ? f(timePhrase, "time") : null;

  const make = (aux, verbForm, withTime = false) => [
    sub,
    ...(aux ? [f(aux, "aux")] : []),
    f(verbForm, "verb"),
    ...(obj ? [obj] : []),
    ...(withTime && time ? [time] : []),
  ];

  return {
    "present-indefinite": make("", subject.third ? verb.s : verb.key),
    "present-continuous": make(be, verb.ing),
    "present-perfect": make(have, verb.v3),
    "present-perfectContinuous": make(`${have} been`, verb.ing, true),

    "past-indefinite": make("", verb.v2),
    "past-continuous": make(was, verb.ing),
    "past-perfect": make("had", verb.v3),
    "past-perfectContinuous": make("had been", verb.ing, true),

    "future-indefinite": make(will, verb.key),
    "future-continuous": make(`${will} be`, verb.ing),
    "future-perfect": make(`${will} have`, verb.v3),
    "future-perfectContinuous": make(`${will} have been`, verb.ing, true),
  };
}

const partsToSentence = (parts) => {
  const text = parts
    .map((part) => part.text)
    .filter(Boolean)
    .join(" ");

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function makeQuestion(previousKey) {
  const key = pick(TENSE_KEYS.filter((item) => item !== previousKey));
  const subject = pick(SUBJECTS);
  const verb = pick(VERBS);
  const timePhrase = pick(TIME_PHRASES);

  const parts = buildSentences(subject, verb, verb.object, timePhrase)[key];

  return { key, parts, sentence: partsToSentence(parts) };
}

/* =========================================================
   Storage / speech
========================================================= */

function readBestStreak() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Number(saved.bestStreak) || 0;
  } catch {
    return 0;
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    alert("আপনার ব্রাউজার টেক্সট-টু-স্পিচ সমর্থন করে না।");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.85;

  window.speechSynthesis.speak(utterance);
}

/* =========================================================
   Small components
========================================================= */

function Chips({ parts }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {parts.map((part, index) => (
        <span
          key={`${part.text}-${index}`}
          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold sm:text-sm ${
            CHIP_STYLES[part.kind]
          }`}
        >
          {part.text}
        </span>
      ))}
    </div>
  );
}

function SpeakButton({ text }) {
  return (
    <button
      type="button"
      className="btn btn-circle btn-ghost btn-sm shrink-0 text-primary"
      onClick={() => speak(text)}
      aria-label={`${text} শুনুন`}
      title="শুনুন"
    >
      <MdVolumeUp size={20} />
    </button>
  );
}

// Compact 4-column row of the four tense types for one time.
function TenseRow({ time, onPick, isActive, getState, disabled = false }) {
  return (
    <div>
      <h3
        className={`mb-1 flex items-center gap-1.5 text-xs font-bold sm:text-sm ${time.text}`}
      >
        <span className={`h-2 w-2 rounded-full ${time.dot}`} />
        {time.label}
        <span className="font-medium text-base-content/50">· {time.bn}</span>
      </h3>

      <div className="grid grid-cols-4 gap-1 sm:gap-2">
        {TYPES.map((type) => {
          const key = `${time.key}-${type.key}`;
          const state = getState ? getState(key) : null;

          let style = isActive?.(key) ? time.solid : time.soft;

          if (state === "correct") {
            style = "border-success bg-success text-success-content shadow-md";
          } else if (state === "wrong") {
            style = "border-error bg-error text-error-content";
          } else if (state === "dim") {
            style = "border-base-300 bg-base-200/60 text-base-content/40";
          }

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(key)}
              aria-pressed={isActive?.(key)}
              className={`flex min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-2 text-center transition-all active:scale-95 sm:py-3 ${style}`}
            >
              <span className="block max-w-full text-[10.5px] font-bold leading-tight sm:text-sm">
                <span className="sm:hidden">{type.short}</span>
                <span className="hidden sm:inline">{type.label}</span>
              </span>

              <span className="mt-0.5 hidden text-[10px] opacity-70 sm:block">
                {type.bn}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Main component
========================================================= */

export default function Tense() {
  const [tab, setTab] = useState("learn");
  const [selectedKey, setSelectedKey] = useState("present-indefinite");

  // Quiz
  const [question, setQuestion] = useState(() => makeQuestion(null));
  const [answer, setAnswer] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [bestStreak, setBestStreak] = useState(readBestStreak);

  const detailRef = useRef(null);
  const feedbackRef = useRef(null);

  const selected = getTenseMeta(selectedKey);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestStreak }));
    } catch (error) {
      console.error("Could not save tense progress:", error);
    }
  }, [bestStreak]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Scroll to the explanation after a quiz answer.
  useEffect(() => {
    if (!answer) return;

    const timer = setTimeout(() => {
      feedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [answer]);

  // Select a tense and scroll to its explanation.
  const selectTense = (key) => {
    setSelectedKey(key);

    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  /* ---------- Quiz ---------- */

  const checkAnswer = useCallback(
    (key) => {
      if (answer) return;

      const isCorrect = key === question.key;

      setAnswer({ key, isCorrect });

      setScore((previous) => {
        const streak = isCorrect ? previous.streak + 1 : 0;

        setBestStreak((best) => Math.max(best, streak));

        return {
          correct: previous.correct + (isCorrect ? 1 : 0),
          total: previous.total + 1,
          streak,
        };
      });
    },
    [answer, question.key],
  );

  const nextQuestion = () => {
    setQuestion((previous) => makeQuestion(previous.key));
    setAnswer(null);
    setShowHint(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetQuiz = () => {
    setScore({ correct: 0, total: 0, streak: 0 });
    setAnswer(null);
    setShowHint(false);
    setQuestion((previous) => makeQuestion(previous.key));
  };

  const questionMeta = getTenseMeta(question.key);
  const accuracy = score.total
    ? Math.round((score.correct / score.total) * 100)
    : 0;

  const quizState = (key) => {
    if (!answer) return null;
    if (key === question.key) return "correct";
    if (key === answer.key) return "wrong";
    return "dim";
  };

  const tabs = [
    { key: "learn", label: "জানুন", icon: MdSchool },
    { key: "quiz", label: "কুইজ", icon: MdQuiz },
  ];

  return (
    <main className="min-h-screen bg-base-200/50 px-2 py-3 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-3 sm:space-y-5">
        {/* Header */}
        <section className="rounded-xl bg-base-100 p-3 shadow-sm sm:rounded-2xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-3xl">
                Tense — ১২টি কাল
              </h1>

              <p className="mt-0.5 text-[11px] leading-snug text-base-content/60 sm:text-sm">
                ৩টি সময় × ৪টি প্রকার = ১২টি Tense
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Tense সেকশন"
              className="grid shrink-0 grid-cols-2 gap-0.5 rounded-lg border border-base-300/70 bg-base-200/70 p-0.5"
            >
              {tabs.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.key}
                    onClick={() => setTab(item.key)}
                    className={`flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:py-2 sm:text-sm ${
                      tab === item.key
                        ? "bg-base-100 text-primary shadow-sm ring-1 ring-base-300/60"
                        : "text-base-content/60 hover:text-base-content"
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= LEARN ================= */}
        {tab === "learn" && (
          <>
            {/* Tense map */}
            <section className="space-y-2.5 rounded-xl border border-base-300/60 bg-base-100 p-2.5 shadow-sm sm:space-y-4 sm:rounded-2xl sm:p-5">
              {TIMES.map((time) => (
                <TenseRow
                  key={time.key}
                  time={time}
                  onPick={selectTense}
                  isActive={(key) => key === selectedKey}
                />
              ))}
            </section>

            {/* Selected tense */}
            <section
              ref={detailRef}
              className="scroll-mt-2 rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-sm sm:rounded-2xl sm:p-6"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`badge badge-sm ${selected.time.badge}`}>
                  {selected.time.bn}
                </span>

                <h2 className="text-base font-bold sm:text-2xl">
                  {selected.name}
                </h2>
              </div>

              <p className="mt-2 text-[13px] leading-6 text-base-content/80 sm:text-sm sm:leading-7">
                {selected.usage}
              </p>

              {/* Formula */}
              <div className="mt-3 rounded-lg bg-base-200/70 p-2.5">
                <p className="mb-1.5 text-[11px] font-bold text-base-content/60">
                  গঠন
                </p>

                <div className="flex flex-wrap items-center gap-1">
                  {selected.formula.map((part, index) => (
                    <span key={`${part.text}-${index}`} className="contents">
                      {index > 0 && (
                        <span className="text-xs font-bold text-base-content/40">
                          +
                        </span>
                      )}

                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold sm:text-sm ${
                          CHIP_STYLES[part.kind]
                        }`}
                      >
                        {part.text}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Examples */}
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-bold sm:text-sm">উদাহরণ</p>

                <div className="space-y-1.5">
                  {selected.examples.map((example) => (
                    <div
                      key={example.en}
                      className="flex items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-100 py-1.5 pl-2.5 pr-1"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] text-base-content/60 sm:text-sm">
                          {example.bn}
                        </p>

                        <p className="break-words text-[13px] font-semibold leading-snug sm:text-base">
                          {example.en}
                        </p>
                      </div>

                      <SpeakButton text={example.en} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selected.notes.length > 0 && (
                <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
                  <p className="mb-1 flex items-center gap-1 text-xs font-bold sm:text-sm">
                    <MdLightbulbOutline size={16} className="text-warning" />
                    মনে রাখতে হবে
                  </p>

                  <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-5 sm:text-sm sm:leading-6">
                    {selected.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Rules */}
            <section className="space-y-1.5 rounded-xl border border-base-300/60 bg-base-100 p-2.5 shadow-sm sm:rounded-2xl sm:p-5">
              <h2 className="px-0.5 text-sm font-bold">দরকারি নিয়ম</h2>

              {[
                {
                  title: "Verb এ s/es যুক্ত করার নিয়ম",
                  body: (
                    <ul className="list-disc space-y-1 pl-4">
                      <li>
                        শুধু Present Indefinite এ 3rd Person Singular Subject
                        হলে s/es বসে।
                      </li>
                      <li>
                        o/ch/sh/x/z দিয়ে শেষ হলে es: go → goes, watch →
                        watches, wash → washes, fix → fixes
                      </li>
                      <li>
                        Consonant + y দিয়ে শেষ হলে y বদলে ies: study → studies
                      </li>
                      <li>বাকি Verb এ s: eat → eats, play → plays</li>
                    </ul>
                  ),
                },
                {
                  title: "ing যোগ করার সময় শেষ অক্ষর দ্বিত্ব",
                  body: (
                    <p className="leading-6">
                      control → controlling, begin → beginning, run → running,
                      sit → sitting, plan → planning, swim → swimming, stop →
                      stopping, get → getting, refer → referring, forget →
                      forgetting
                    </p>
                  ),
                },
                {
                  title: "am/is/are, was/were, have/has",
                  body: (
                    <ul className="list-disc space-y-1 pl-4">
                      <li>I এর সাথে am; Singular এ is; Plural ও You এ are।</li>
                      <li>Past এ Singular (I সহ) was; Plural ও You এ were।</li>
                      <li>
                        3rd Person Singular এ has; অন্যান্য Subject এ have।
                      </li>
                      <li>Past Tense এ have/has এর জায়গায় had বসে।</li>
                    </ul>
                  ),
                },
                {
                  title: "shall/will এর পর be কেন?",
                  body: (
                    <p className="leading-6">
                      shall/will হলো Modal Auxiliary। Modal Auxiliary এর পর
                      সবসময় Verb এর base form বসে। am/is/are এর base form হলো
                      be, তাই shall/will এর পর am/is/are এর বদলে be হয়।
                    </p>
                  ),
                },
                {
                  title: "সংক্ষেপে মনে রাখুন",
                  body: (
                    <ul className="list-disc space-y-1 pl-4">
                      <li>Indefinite → সাধারণ বা নিয়মিত কাজ</li>
                      <li>Continuous → চলমান কাজ</li>
                      <li>
                        Perfect → শেষ হওয়া কাজের প্রভাব বর্তমানে বা অন্য সময়ে
                      </li>
                      <li>Perfect Continuous → সময় ধরে চলমান কাজ</li>
                    </ul>
                  ),
                },
              ].map((rule) => (
                <details
                  key={rule.title}
                  className="group rounded-lg border border-base-300 bg-base-100"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-semibold sm:text-sm">
                    {rule.title}
                    <MdExpandMore
                      size={20}
                      className="shrink-0 transition-transform group-open:rotate-180"
                    />
                  </summary>

                  <div className="border-t border-base-200 px-3 py-2.5 text-[12.5px] sm:text-sm">
                    {rule.body}
                  </div>
                </details>
              ))}
            </section>
          </>
        )}

        {/* ================= QUIZ ================= */}
        {tab === "quiz" && (
          <>
            {/* Score */}
            <section className="grid grid-cols-4 gap-1.5 sm:gap-3">
              {[
                ["সঠিক", `${score.correct}/${score.total}`, "text-success"],
                ["হার", `${accuracy}%`, "text-primary"],
                ["স্ট্রিক", score.streak, "text-warning"],
                ["সেরা", bestStreak, "text-secondary"],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  className="rounded-lg border border-base-300 bg-base-100 px-2 py-1.5 text-center sm:p-4 sm:text-left"
                >
                  <p className="text-[10px] text-base-content/60 sm:text-xs">
                    {label}
                  </p>

                  <p
                    className={`flex items-center justify-center gap-0.5 text-base font-extrabold sm:justify-start sm:text-2xl ${color}`}
                  >
                    {label === "স্ট্রিক" && score.streak > 1 && (
                      <MdLocalFireDepartment size={16} />
                    )}
                    {value}
                  </p>
                </div>
              ))}
            </section>

            {/* Question */}
            <section className="rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-sm sm:rounded-2xl sm:p-6">
              <p className="text-xs font-semibold text-base-content/60 sm:text-sm">
                এই বাক্যটি কোন Tense?
              </p>

              <div className="mt-1.5 flex items-start justify-between gap-2">
                <p className="break-words text-xl font-bold leading-snug sm:text-3xl">
                  {question.sentence}
                </p>

                <SpeakButton text={question.sentence} />
              </div>

              {!answer && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {showHint ? (
                    <p className="inline-flex items-center gap-1 rounded-md bg-warning/20 px-2 py-1 text-xs sm:text-sm">
                      <MdLightbulbOutline size={16} className="text-warning" />
                      এটি <strong>{questionMeta.time.label}</strong> Tense
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs gap-1 px-1 text-warning"
                      onClick={() => setShowHint(true)}
                    >
                      <MdLightbulbOutline size={15} />
                      সংকেত
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs gap-1 px-1"
                    onClick={nextQuestion}
                  >
                    <MdShuffle size={15} />
                    অন্য প্রশ্ন
                  </button>
                </div>
              )}

              {/* Options */}
              <div className="mt-3 space-y-2.5 sm:space-y-4">
                {TIMES.map((time) => (
                  <TenseRow
                    key={time.key}
                    time={time}
                    onPick={checkAnswer}
                    getState={quizState}
                    disabled={Boolean(answer)}
                  />
                ))}
              </div>

              {/* Feedback */}
              {answer && (
                <div
                  ref={feedbackRef}
                  className={`mt-4 scroll-mb-4 rounded-lg border p-3 ${
                    answer.isCorrect
                      ? "border-success/40 bg-success/10"
                      : "border-error/40 bg-error/10"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    {answer.isCorrect ? (
                      <>
                        <MdCheckCircle className="text-success" size={20} />
                        সঠিক উত্তর!
                      </>
                    ) : (
                      <>
                        <MdCancel className="text-error" size={20} />
                        ভুল হয়েছে
                      </>
                    )}
                  </p>

                  <p className="mt-1.5 text-[13px] sm:text-sm">
                    সঠিক উত্তর: <strong>{questionMeta.name}</strong> (
                    {questionMeta.type.bn})
                  </p>

                  <div className="mt-2">
                    <Chips parts={question.parts} />
                  </div>

                  <p className="mt-2 text-[12.5px] leading-5 text-base-content/70 sm:text-sm">
                    গঠন:{" "}
                    {questionMeta.formula.map((part) => part.text).join(" + ")}
                  </p>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-3 w-full gap-2 sm:w-auto"
                    onClick={nextQuestion}
                  >
                    পরের প্রশ্ন
                    <MdArrowForward size={18} />
                  </button>
                </div>
              )}
            </section>

            <div className="flex justify-center">
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1 text-error hover:bg-error/10"
                onClick={resetQuiz}
                disabled={score.total === 0}
              >
                <MdRestartAlt size={16} />
                স্কোর রিসেট
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
