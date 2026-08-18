const API_KEY_STORAGE = "xaiApiKey";
const MODEL_STORAGE = "grokModel";
const DEFAULT_MODEL = "grok-4";

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

export function getModel() {
  return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
}

export function saveSettings({ apiKey, model }) {
  localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
  localStorage.setItem(MODEL_STORAGE, model || DEFAULT_MODEL);
}

export function initSettings() {
  const modal = document.getElementById("settings-modal");
  const form = document.getElementById("settings-form");
  const keyInput = document.getElementById("api-key-input");
  const modelSelect = document.getElementById("model-select");
  const openBtn = document.getElementById("settings-btn");
  const cancelBtn = document.getElementById("settings-cancel");

  function fillForm() {
    keyInput.value = getApiKey();
    const current = getModel();
    if (![...modelSelect.options].some((option) => option.value === current)) {
      const extra = document.createElement("option");
      extra.value = current;
      extra.textContent = current;
      modelSelect.append(extra);
    }
    modelSelect.value = current;
  }

  function open() {
    fillForm();
    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
    keyInput.focus();
  }

  openBtn.addEventListener("click", open);
  cancelBtn.addEventListener("click", () => modal.close());

  form.addEventListener("submit", () => {
    saveSettings({
      apiKey: keyInput.value,
      model: modelSelect.value,
    });
  });

  return { open };
}
