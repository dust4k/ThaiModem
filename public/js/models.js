/** @typedef {"englishToThai" | "thaiToEnglish"} TranslationDirection */

/**
 * @typedef {object} WordBreakdownItem
 * @property {string} original_word
 * @property {string} romanization
 * @property {string} meaning
 * @property {string} part_of_speech
 */

/**
 * @typedef {object} CorrectionItem
 * @property {string} issue
 * @property {string} suggestion
 * @property {string} explanation
 */

/**
 * @typedef {object} TranslationResult
 * @property {string} translated_text
 * @property {string} romanized_text
 * @property {WordBreakdownItem[]} word_breakdown
 * @property {CorrectionItem[]} corrections
 * @property {string | null} cultural_or_grammar_note
 */

/**
 * @typedef {object} SavedWord
 * @property {string} id
 * @property {string} original_word
 * @property {string} romanization
 * @property {string} meaning
 * @property {string} part_of_speech
 * @property {string} savedAt
 */

export const Direction = Object.freeze({
  englishToThai: "englishToThai",
  thaiToEnglish: "thaiToEnglish",
});

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === "string" ? value : "";
}

/**
 * @param {unknown} raw
 * @returns {WordBreakdownItem}
 */
export function normalizeWord(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    original_word: asString(item.original_word),
    romanization: asString(item.romanization),
    meaning: asString(item.meaning),
    part_of_speech: asString(item.part_of_speech),
  };
}

/**
 * @param {unknown} raw
 * @returns {CorrectionItem}
 */
export function normalizeCorrection(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    issue: asString(item.issue),
    suggestion: asString(item.suggestion),
    explanation: asString(item.explanation),
  };
}

/**
 * @param {unknown} raw
 * @returns {TranslationResult}
 */
export function normalizeResult(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const note = data.cultural_or_grammar_note;
  return {
    translated_text: asString(data.translated_text),
    romanized_text: asString(data.romanized_text),
    word_breakdown: Array.isArray(data.word_breakdown)
      ? data.word_breakdown.map(normalizeWord)
      : [],
    corrections: Array.isArray(data.corrections)
      ? data.corrections.map(normalizeCorrection)
      : [],
    cultural_or_grammar_note: typeof note === "string" && note.trim() ? note : null,
  };
}

/**
 * @param {TranslationDirection} direction
 */
export function labelsFor(direction) {
  if (direction === Direction.thaiToEnglish) {
    return {
      input: "ไทย",
      output: "English",
      placeholder: "พิมพ์ภาษาไทยที่นี่…",
      toggle: "TH → EN",
    };
  }
  return {
    input: "English",
    output: "ไทย",
    placeholder: "Type English here…",
    toggle: "EN → TH",
  };
}

/**
 * @param {TranslationDirection} direction
 * @returns {TranslationDirection}
 */
export function swapDirection(direction) {
  return direction === Direction.englishToThai
    ? Direction.thaiToEnglish
    : Direction.englishToThai;
}

/** @returns {string} */
export function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through when randomUUID is blocked (non-secure HTTP on iPhone).
    }
  }
  return `word-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {WordBreakdownItem} word
 * @returns {SavedWord}
 */
export function makeSavedWord(word) {
  return {
    id: createId(),
    original_word: word.original_word,
    romanization: word.romanization,
    meaning: word.meaning,
    part_of_speech: word.part_of_speech,
    savedAt: new Date().toISOString(),
  };
}
