import { normalizeResult } from "./models.js";

/**
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.direction
 * @param {string} params.model
 * @param {string} params.apiKey
 */
export async function translate({ text, direction, model, apiKey }) {
  let response;
  try {
    response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ text, direction, model }),
    });
  } catch {
    throw new Error("Network error. Is the ThaiModem server running?");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  if (!payload.translated_text) {
    throw new Error("Unexpected response format");
  }
  return normalizeResult(payload);
}

/**
 * @param {Response} response
 */
async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Unexpected response format");
  }
}

export const GrokTranslatorService = {
  isTranslating: false,
  lastResult: null,
  errorMessage: null,

  async translate(params) {
    this.isTranslating = true;
    this.errorMessage = null;
    try {
      this.lastResult = await translate(params);
      return this.lastResult;
    } catch (error) {
      this.lastResult = null;
      this.errorMessage = error instanceof Error ? error.message : "Translation failed";
      throw error;
    } finally {
      this.isTranslating = false;
    }
  },

  clear() {
    this.isTranslating = false;
    this.lastResult = null;
    this.errorMessage = null;
  },
};
