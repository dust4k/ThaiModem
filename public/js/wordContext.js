/**
 * @param {object} params
 * @param {string} params.word
 * @param {string} params.meaning
 * @param {string} params.part_of_speech
 * @param {string} params.romanization
 * @param {string} params.model
 * @param {string} params.apiKey
 * @returns {Promise<{ sentence_thai: string, romanization: string, meaning: string }>}
 */
export async function generateWordContext({
  word,
  meaning,
  part_of_speech,
  romanization,
  model,
  apiKey,
}) {
  let response;
  try {
    response = await fetch("/api/word-context", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ word, meaning, part_of_speech, romanization, model }),
    });
  } catch {
    throw new Error("Network error. Check your connection.");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  if (!payload.sentence_thai) {
    throw new Error("Unexpected response format");
  }
  return payload;
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
