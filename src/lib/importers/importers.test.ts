import { describe, expect, it } from "vitest";
import { parseQuizletText } from "@/lib/importers/quizlet";
import { parseCsvTsvContent, parseMarkdownNoteContent } from "@/lib/importers/csv-md";
import { formatFsrsInterval } from "@/lib/fsrs";

describe("Quizlet & Delimited Text Parser", () => {
  it("parses tab-separated Quizlet lines correctly", () => {
    const text = `React\tA JavaScript library for building user interfaces\nNext.js\tThe React Framework for the Web`;
    const cards = parseQuizletText(text, { delimiter: "\t" });
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toBe("React");
    expect(cards[0].back).toBe("A JavaScript library for building user interfaces");
    expect(cards[1].front).toBe("Next.js");
  });

  it("parses custom dash delimited lines", () => {
    const text = `State - Component data that changes over time\nProps - Properties passed to children`;
    const cards = parseQuizletText(text, { delimiter: "custom-dash" });
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toBe("State");
    expect(cards[0].back).toBe("Component data that changes over time");
  });
});

describe("CSV / TSV & Markdown Importer", () => {
  it("auto-detects headers and parses CSV flashcards", () => {
    const csv = `Front,Back,Description\nVirtual DOM,Lightweight copy of real DOM,Used for diffing\nJSX,Syntax extension for JS,Compiles to React.createElement`;
    const cards = parseCsvTsvContent(csv, "cards.csv");
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toBe("Virtual DOM");
    expect(cards[0].back).toBe("Lightweight copy of real DOM");
    expect(cards[0].description).toBe("Used for diffing");
  });

  it("parses Markdown content into structured note", () => {
    const md = `# React Server Components\n\nServer components run only on the server. #react #nextjs`;
    const note = parseMarkdownNoteContent(md, "rsc-notes.md");
    expect(note.title).toBe("React Server Components");
    expect(note.tags).toContain("react");
    expect(note.tags).toContain("nextjs");
  });
});

describe("FSRS Interval Formatter", () => {
  it("formats fractional days into human readable interval badges", () => {
    expect(formatFsrsInterval(0.007)).toBe("10m");
    expect(formatFsrsInterval(0.25)).toBe("6h");
    expect(formatFsrsInterval(1.5)).toBe("1.5d");
    expect(formatFsrsInterval(4)).toBe("4d");
    expect(formatFsrsInterval(9)).toBe("9d");
    expect(formatFsrsInterval(75)).toBe("2.5mo");
    expect(formatFsrsInterval(400)).toBe("1.1y");
  });
});
