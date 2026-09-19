// AI Concept & Card Extractor (100% Offline Rule-based NLP + AI API fallback)

export interface GeneratedCard {
  front: string;
  back: string;
  kind: "basic" | "cloze" | "choice";
  choices?: string[];
  tags?: string[];
  description?: string;
}

/**
 * Extract study flashcards from Markdown or plain text offline
 */
export function extractCardsFromText(text: string): GeneratedCard[] {
  if (!text || !text.trim()) return [];

  const cards: GeneratedCard[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // 1. Definition patterns ("Term: Definition", "Term - Definition", "Term – Definition")
  const defRegex = /^([A-Z0-9][\w\s-]{2,40})\s*[:\-–]\s*(.+)$/i;

  // 2. Bold term patterns ("**Term**: Definition")
  const boldRegex = /^\*\*([^*]+)\*\*\s*[:\-–]?\s*(.+)$/i;

  // 3. Question patterns ("Q: ... A: ...")
  const qaRegex = /^(?:Q|Question):\s*(.+?)\s*(?:A|Answer):\s*(.+)$/i;

  for (const line of lines) {
    // Check QA
    const qaMatch = line.match(qaRegex);
    if (qaMatch) {
      cards.push({
        front: qaMatch[1].trim(),
        back: qaMatch[2].trim(),
        kind: "basic",
        tags: ["ai-extracted", "qa"],
      });
      continue;
    }

    // Check Bold
    const boldMatch = line.match(boldRegex);
    if (boldMatch && boldMatch[2].length > 5) {
      const term = boldMatch[1].trim();
      const def = boldMatch[2].trim();
      cards.push({
        front: `What is ${term}?`,
        back: def,
        kind: "basic",
        tags: ["ai-extracted", "definition"],
      });

      // Also create a Cloze card if appropriate
      cards.push({
        front: `In study OS context, {{c1::${term}}} is defined as: ${def}`,
        back: term,
        kind: "cloze",
        tags: ["ai-extracted", "cloze"],
      });
      continue;
    }

    // Check Def
    const defMatch = line.match(defRegex);
    if (defMatch && defMatch[2].length > 10 && !line.startsWith("#")) {
      const term = defMatch[1].trim();
      const def = defMatch[2].trim();
      cards.push({
        front: `Define ${term}`,
        back: def,
        kind: "basic",
        tags: ["ai-extracted"],
      });
    }
  }

  // 4. Multiple choice distractor generator
  const allTerms = cards.map((c) => c.back).filter((b) => b.length < 40);
  cards.forEach((c) => {
    if (c.kind === "basic" && c.back.length < 40 && allTerms.length >= 3) {
      const distractors = allTerms.filter((t) => t !== c.back).slice(0, 3);
      if (distractors.length === 3) {
        c.kind = "choice";
        c.choices = [c.back, ...distractors].sort(() => Math.random() - 0.5);
      }
    }
  });

  return cards;
}
