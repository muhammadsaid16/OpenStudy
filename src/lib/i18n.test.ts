import { describe, it, expect } from "vitest";
import { tFor, humanizeKey, formatString, isTranslationKey } from "./i18n";

describe("i18n Translation Engine", () => {
  it("translates existing keys correctly in English and Arabic", () => {
    expect(tFor("en", "goals.longTerm")).toBe("Long-term");
    expect(tFor("ar", "goals.longTerm")).toBe("طويل المدى");

    expect(tFor("en", "goals.todo")).toBe("Todo");
    expect(tFor("ar", "goals.todo")).toBe("المهام");

    expect(tFor("en", "ui.horizon")).toBe("Horizon");
    expect(tFor("ar", "ui.horizon")).toBe("المدى");

    expect(tFor("en", "ui.repeats")).toBe("Repeats");
    expect(tFor("ar", "ui.repeats")).toBe("التكرار");

    expect(tFor("en", "ui.due_date")).toBe("Due date");
    expect(tFor("ar", "ui.due_date")).toBe("تاريخ الاستحقاق");
  });

  it("translates repeat options", () => {
    expect(tFor("en", "goal.repeat.never")).toBe("Never");
    expect(tFor("ar", "goal.repeat.never")).toBe("أبداً");

    expect(tFor("en", "goal.repeat.daily")).toBe("Daily");
    expect(tFor("ar", "goal.repeat.daily")).toBe("يومياً");

    expect(tFor("en", "goal.repeat.weekly")).toBe("Weekly");
    expect(tFor("ar", "goal.repeat.weekly")).toBe("أسبوعياً");

    expect(tFor("en", "goal.repeat.monthly")).toBe("Monthly");
    expect(tFor("ar", "goal.repeat.monthly")).toBe("شهرياً");
  });

  it("humanizes missing keys containing dots instead of showing raw code", () => {
    expect(humanizeKey("goals.longTerm")).toBe("Long Term");
    expect(humanizeKey("ui.edit_goal")).toBe("Edit Goal");
    expect(humanizeKey("some.deep.nested_custom_prop")).toBe("Nested Custom Prop");
    expect(humanizeKey("kebab-case-title")).toBe("Kebab Case Title");

    // When key is missing from dictionary, tFor should humanize it
    expect(tFor("en", "nonexistent.feature_name")).toBe("Feature Name");
  });

  it("interpolates template variables", () => {
    expect(formatString("Next {n} days", { n: 7 })).toBe("Next 7 days");
    expect(formatString("Hello {name}, you have {count} items", { name: "Alex", count: 3 })).toBe(
      "Hello Alex, you have 3 items"
    );
  });

  it("identifies valid translation keys with isTranslationKey", () => {
    expect(isTranslationKey("ui.horizon")).toBe(true);
    expect(isTranslationKey("goals.todo")).toBe(true);
    expect(isTranslationKey("random.nonexistent.key")).toBe(false);
    expect(isTranslationKey("Just normal text")).toBe(false);
  });
});
