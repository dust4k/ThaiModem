import { detectDirection, labelsFor, labelsForNeutral } from "./models.js";
import { GrokTranslatorService } from "./grokTranslator.js";
import { getApiKey, getModel, initSettings } from "./settings.js";
import { initRepository, saveWords } from "./repository.js";

const els = {
  banner: document.getElementById("banner"),
  inputText: document.getElementById("input-text"),
  inputLanguage: document.getElementById("input-language"),
  outputLanguage: document.getElementById("output-language"),
  submitBtn: document.getElementById("submit-btn"),
  clearBtn: document.getElementById("clear-btn"),
  empty: document.getElementById("output-empty"),
  loading: document.getElementById("output-loading"),
  result: document.getElementById("output-result"),
};

let bannerTimer = 0;
/** @type {import("./models.js").TranslationResult | null} */
let lastResult = null;

const settings = initSettings();
const repository = initRepository();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showBanner(message, { openSettings = false, tone = "warn" } = {}) {
  els.banner.textContent = message;
  els.banner.classList.remove("hidden", "banner-success", "banner-warn");
  els.banner.classList.add(tone === "success" ? "banner-success" : "banner-warn");
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => hideBanner(), 4000);
  if (openSettings) {
    settings.open();
  }
}

function hideBanner() {
  els.banner.classList.add("hidden");
}

els.banner.addEventListener("click", hideBanner);

function applyDirectionLabels() {
  const text = els.inputText.value.trim();
  const labels = text ? labelsFor(detectDirection(text)) : labelsForNeutral();
  els.inputLanguage.textContent = labels.input;
  els.outputLanguage.textContent = labels.output;
  els.inputText.placeholder = labels.placeholder;
}

function setLoading(isLoading) {
  els.submitBtn.disabled = isLoading;
  els.inputText.disabled = isLoading;
  els.loading.classList.toggle("hidden", !isLoading);
  if (isLoading) {
    els.empty.classList.add("hidden");
    els.result.classList.add("hidden");
  }
}

function renderResult(result) {
  lastResult = result;

  const note = result.cultural_or_grammar_note
    ? `<p class="note">${escapeHtml(result.cultural_or_grammar_note)}</p>`
    : "";

  const words = result.word_breakdown
    .map(
      (word, index) => `
      <label class="breakdown-row breakdown-selectable">
        <input type="checkbox" class="word-select" data-index="${index}" />
        <div class="breakdown-content">
          <div class="breakdown-original">${escapeHtml(word.original_word)}</div>
          <div class="breakdown-meta">
            <span>${escapeHtml(word.romanization)}</span>
            <span class="pos">${escapeHtml(word.part_of_speech)}</span>
            <span>${escapeHtml(word.meaning)}</span>
          </div>
        </div>
      </label>`
    )
    .join("");

  const breakdown = result.word_breakdown.length
    ? `<details class="card" open>
        <summary>Word breakdown (${result.word_breakdown.length})</summary>
        ${words}
        <div class="breakdown-actions">
          <button type="button" class="bar-btn bar-btn-primary remember-btn">Remember</button>
        </div>
      </details>`
    : "";

  const corrections = result.corrections.length
    ? `<details class="card" open>
        <summary>Corrections &amp; natural phrasing (${result.corrections.length})</summary>
        ${result.corrections
          .map(
            (item) => `
          <div class="correction-item">
            <p class="issue">${escapeHtml(item.issue)}</p>
            <p class="suggestion">${escapeHtml(item.suggestion)}</p>
            <p class="explanation">${escapeHtml(item.explanation)}</p>
          </div>`
          )
          .join("")}
      </details>`
    : "";

  els.result.innerHTML = `
    <article>
      <p class="primary-text">${escapeHtml(result.translated_text)}</p>
      <p class="romanization">${escapeHtml(result.romanized_text)}</p>
    </article>
    ${note}
    ${breakdown}
    ${corrections}
  `;
  els.empty.classList.add("hidden");
  els.loading.classList.add("hidden");
  els.result.classList.remove("hidden");

  const rememberBtn = els.result.querySelector(".remember-btn");
  rememberBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    rememberSelectedWords();
  });
}

function rememberSelectedWords() {
  if (!lastResult?.word_breakdown.length) {
    showBanner("No words to remember");
    return;
  }

  const checked = [...els.result.querySelectorAll(".word-select:checked")];
  if (!checked.length) {
    showBanner("Select words to remember");
    return;
  }

  const selected = checked
    .map((input) => {
      const index = Number(input.dataset.index);
      return lastResult.word_breakdown[index];
    })
    .filter(Boolean);

  let saved = 0;
  let skipped = 0;
  try {
    ({ saved, skipped } = saveWords(selected));
  } catch (error) {
    showBanner(error instanceof Error ? error.message : "Could not save words");
    return;
  }

  if (saved === 0 && skipped > 0) {
    showBanner("Already in your saved words");
    return;
  }

  if (saved === 0) {
    showBanner("Select words to remember");
    return;
  }

  checked.forEach((input) => {
    input.checked = false;
  });

  repository.updateSavedBadge();

  if (skipped > 0) {
    showBanner(`Saved ${saved} word${saved === 1 ? "" : "s"} (${skipped} already saved)`, {
      tone: "success",
    });
  } else {
    showBanner(`Saved ${saved} word${saved === 1 ? "" : "s"}`, { tone: "success" });
  }
}

function showEmpty() {
  lastResult = null;
  els.result.innerHTML = "";
  els.result.classList.add("hidden");
  els.loading.classList.add("hidden");
  els.empty.classList.remove("hidden");
}

async function submit() {
  const text = els.inputText.value.trim();
  if (!text) {
    showBanner("Enter text to translate");
    els.inputText.focus();
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    showBanner("Add your xAI API key in Settings", { openSettings: true });
    return;
  }

  setLoading(true);
  try {
    const result = await GrokTranslatorService.translate({
      text,
      direction: detectDirection(text),
      model: getModel(),
      apiKey,
    });
    renderResult(result);
  } catch (error) {
    showEmpty();
    showBanner(error instanceof Error ? error.message : "Translation failed");
  } finally {
    setLoading(false);
  }
}

function clearAll() {
  els.inputText.value = "";
  GrokTranslatorService.clear();
  hideBanner();
  showEmpty();
  applyDirectionLabels();
  els.inputText.focus();
}

els.submitBtn.addEventListener("click", submit);
els.clearBtn.addEventListener("click", clearAll);
els.inputText.addEventListener("input", applyDirectionLabels);
els.inputText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submit();
  }
});

applyDirectionLabels();

if ((window.isSecureContext || location.hostname === "localhost") && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
