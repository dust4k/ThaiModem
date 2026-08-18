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
