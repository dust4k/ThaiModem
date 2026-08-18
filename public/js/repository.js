import { makeSavedWord, normalizeWord, createId } from "./models.js";
import { initFlashcards } from "./flashcards.js";

const STORAGE_KEY = "savedWords";

/**
 * @param {import("./models.js").WordBreakdownItem} word
 */
export function wordKey(word) {
  return word.original_word.trim().toLowerCase();
}

/**
 * @returns {import("./models.js").SavedWord[]}
 */
export function loadSavedWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => {
        const word = normalizeWord(item);
        return {
          id: typeof item.id === "string" ? item.id : createId(),
          original_word: word.original_word,
          romanization: word.romanization,
          meaning: word.meaning,
          part_of_speech: word.part_of_speech,
          savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
        };
      })
      .filter((item) => item.original_word.trim());
  } catch {
    return [];
  }
}

/**
 * @param {import("./models.js").SavedWord[]} words
 */
function persist(words) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "Storage full — remove some saved words"
        : "Could not save words on this device";
    throw new Error(message);
  }
}

/**
 * @param {import("./models.js").WordBreakdownItem[]} items
 * @returns {{ saved: number, skipped: number }}
 */
export function saveWords(items) {
  const existing = loadSavedWords();
  const keys = new Set(existing.map(wordKey));
  let saved = 0;
  let skipped = 0;

  for (const item of items) {
    const key = wordKey(item);
    if (!key) {
      continue;
    }
    if (keys.has(key)) {
      skipped += 1;
      continue;
    }
    existing.push(makeSavedWord(item));
    keys.add(key);
    saved += 1;
  }

  if (saved > 0) {
    persist(existing);
  }

  return { saved, skipped };
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function removeWord(id) {
  const existing = loadSavedWords();
  const next = existing.filter((word) => word.id !== id);
  if (next.length === existing.length) {
    return false;
  }
  persist(next);
  return true;
}

export function savedWordCount() {
  return loadSavedWords().length;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderRepoList(words) {
  const list = document.getElementById("repository-list");
  const count = document.getElementById("repository-count");
  const practiceBtn = document.getElementById("repository-practice");
  if (!list || !count) {
    return;
  }

  count.textContent = String(words.length);

  if (practiceBtn) {
    practiceBtn.classList.toggle("hidden", words.length === 0);
  }

  if (!words.length) {
    list.innerHTML =
      '<p class="repo-empty">No saved words yet. Check words in a translation and tap Remember.</p>';
    return;
  }

  list.innerHTML = words
    .map(
      (word) => `
    <div class="repo-row" data-id="${escapeHtml(word.id)}">
      <div class="breakdown-content">
        <div class="breakdown-original">${escapeHtml(word.original_word)}</div>
        <div class="breakdown-meta">
          <span>${escapeHtml(word.romanization)}</span>
          <span class="pos">${escapeHtml(word.part_of_speech)}</span>
          <span>${escapeHtml(word.meaning)}</span>
        </div>
      </div>
      <button type="button" class="repo-remove bar-btn" data-id="${escapeHtml(word.id)}">Remove</button>
    </div>`
    )
    .join("");
}

function updateSavedBadge() {
  const badge = document.getElementById("saved-count");
  if (!badge) {
    return;
  }
  const count = savedWordCount();
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove("hidden");
  } else {
    badge.textContent = "";
    badge.classList.add("hidden");
  }
}

/**
 * @param {{ onChange?: () => void }} [options]
 */
export function initRepository(options = {}) {
  const modal = document.getElementById("repository-modal");
  const openBtn = document.getElementById("saved-btn");
  const closeBtn = document.getElementById("repository-close");
  const practiceBtn = document.getElementById("repository-practice");
  const list = document.getElementById("repository-list");
  const listView = document.getElementById("repository-list-view");
  const practiceView = document.getElementById("repository-practice-view");

  function showListView() {
    listView?.classList.remove("hidden");
    practiceView?.classList.add("hidden");
  }

  function showPracticeView() {
    listView?.classList.add("hidden");
    practiceView?.classList.remove("hidden");
  }

  const flashcards = initFlashcards({
    loadWords: loadSavedWords,
    onExit: showListView,
  });

  function refresh() {
    renderRepoList(loadSavedWords());
    updateSavedBadge();
    options.onChange?.();
  }

  function open() {
    showListView();
    flashcards.exitSession();
    refresh();
    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  }

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", () => modal.close());
  practiceBtn?.addEventListener("click", () => {
    if (flashcards.startSession()) {
      showPracticeView();
    }
  });

  list?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest(".repo-remove");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const id = button.dataset.id;
    if (!id) {
      return;
    }
    removeWord(id);
    refresh();
  });

  updateSavedBadge();

  return { open, refresh, updateSavedBadge };
}
