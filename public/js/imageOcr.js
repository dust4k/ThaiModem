const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * @param {DataTransfer | null | undefined} clipboardData
 * @returns {{ blob: Blob, mimeType: string } | null}
 */
export function readImageFromClipboard(clipboardData) {
  if (!clipboardData?.items?.length) {
    return null;
  }

  for (const item of clipboardData.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        return { blob, mimeType: item.type || blob.type || "image/png" };
      }
    }
  }

  return null;
}

/**
 * @param {Blob} blob
 * @returns {Promise<{ imageBase64: string, mimeType: string }>}
 */
export async function prepareImageForUpload(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process image");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const [, base64 = ""] = dataUrl.split(",", 2);
  if (!base64) {
    throw new Error("Could not process image");
  }

  return { imageBase64: base64, mimeType: "image/jpeg" };
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

/**
 * @param {object} params
 * @param {string} params.imageBase64
 * @param {string} params.mimeType
 * @param {string} params.model
 * @param {string} params.apiKey
 * @returns {Promise<string>}
 */
export async function extractThaiFromImage({ imageBase64, mimeType, model, apiKey }) {
  let response;
  try {
    response = await fetch("/api/ocr-thai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ image: imageBase64, mime_type: mimeType, model }),
    });
  } catch {
    throw new Error("Network error. Is the ThaiModem server running?");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  if (typeof payload.text !== "string") {
    throw new Error("Unexpected response format");
  }
  return payload.text.trim();
}
