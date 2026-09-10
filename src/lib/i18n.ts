"use client";

// ─── UI strings (EN/AR) ─────────────────────────────────────────
// Central dictionary for the primary navigation + shared surfaces.
// Pages use useT(); lang lives in the app store (persisted, sets dir=rtl).
import { useAppStore } from "@/lib/store";

type Dict = Record<string, { en: string; ar: string }>;

const DICT: Dict = {
  // Sidebar / nav groups
  "nav.learn": { en: "Learn", ar: "التعلّم" },
  "nav.library": { en: "Library", ar: "المكتبة" },
  "nav.notes": { en: "Notes", ar: "الملاحظات" },
  "nav.focus": { en: "Focus", ar: "التركيز" },
  "nav.sessions": { en: "Sessions", ar: "الجلسات" },
  "nav.goals": { en: "Goals", ar: "الأهداف" },
  "nav.insights": { en: "Insights", ar: "الإحصائيات" },
  "nav.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "nav.stats": { en: "Stats", ar: "الإحصاءات" },
  "nav.system": { en: "System", ar: "النظام" },
  "nav.settings": { en: "Settings", ar: "الإعدادات" },
  "nav.appearance": { en: "Appearance", ar: "المظهر" },
  "nav.all": { en: "All →", ar: "الكل →" },
  "nav.light": { en: "Light", ar: "فاتح" },
  "nav.dark": { en: "Dark", ar: "داكن" },

  // Library tabs + headings
  "lib.heading": { en: "Library", ar: "المكتبة" },
  "lib.subtitle": { en: "SUBJECTS → TOPICS → DECKS → CARDS — ONE HIERARCHY", ar: "المواد ← المواضيع ← المجموعات ← البطاقات — تسلسل واحد" },
  "lib.tab.subjects": { en: "Subjects", ar: "المواد" },
  "lib.tab.decks": { en: "Decks", ar: "المجموعات" },
  "lib.tab.study": { en: "Study", ar: "المراجعة" },
  "lib.newSubject": { en: "New subject", ar: "مادة جديدة" },
  "lib.newDeck": { en: "New deck", ar: "مجموعة جديدة" },
  "lib.noSubjects": { en: "No subjects yet", ar: "لا مواد بعد" },
  "lib.noDecks": { en: "No decks yet", ar: "لا مجموعات بعد" },
  "lib.manageTopics": { en: "Manage topics", ar: "إدارة المواضيع" },
  "lib.open": { en: "Open", ar: "فتح" },
  "lib.review": { en: "Review", ar: "مراجعة" },
  "lib.cards": { en: "cards", ar: "بطاقة" },
  "lib.practiceMode": { en: "Practice mode — no cards due, showing all cards", ar: "وضع التدريب — لا بطاقات مستحقة الآن، نعرض كل البطاقات" },

  // Study
  "study.showAnswer": { en: "Show answer", ar: "اظهر الإجابة" },
  "study.again": { en: "Again", ar: "مرة أخرى" },
  "study.hard": { en: "Hard", ar: "صعب" },
  "study.easy": { en: "Easy", ar: "سهل" },
  "study.exit": { en: "Exit", ar: "خروج" },

  // Common
  "common.create": { en: "Create", ar: "إنشاء" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.save": { en: "Save", ar: "حفظ" },
  "common.delete": { en: "Delete", ar: "حذف" },
  "common.edit": { en: "Edit", ar: "تعديل" },
  "common.search": { en: "Search", ar: "بحث" },
};

/** Hook: returns t(key) for the current UI language. */
export function useT() {
  const lang = useAppStore((s) => s.lang);
  return (key: keyof typeof DICT | string): string => {
    const entry = DICT[key as string];
    if (!entry) return key as string;
    return entry[lang];
  };
}

/** Non-hook lookup (for constants/module scope). */
export function tFor(lang: "en" | "ar", key: string): string {
  const entry = DICT[key];
  return entry ? entry[lang] : key;
}
