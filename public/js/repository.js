import { makeSavedWord, normalizeWord, createId } from "./models.js";
import { initFlashcards } from "./flashcards.js";
import { getApiKey, getModel } from "./settings.js";
import { generateWordContext } from "./wordContext.js";

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

/**
 * @param {import("./models.js").SavedWord[]} words
 * @param {string | null} selectedId
 */
function renderRepoList(words, selectedId) {
  const list = document.getElementById("repository-list");
  const count = document.getElementById("repository-count");
  const practiceBtn = document.getElementById("repository-practice");
  const contextBtn = document.getElementById("repository-context-btn");
  if (!list || !count) {
    return;
  }

  count.textContent = String(words.length);

  if (practiceBtn) {
    practiceBtn.classList.toggle("hidden", words.length === 0);
  }

  if (contextBtn) {
    contextBtn.classList.toggle("hidden", words.length === 0);
    contextBtn.disabled = !selectedId;
  }

  if (!words.length) {
    list.innerHTML =
      '<p class="repo-empty">No saved words yet. Check words in a translation and tap Remember.</p>';
    return;
  }

  list.innerHTML = words
    .map(
      (word) => `
    <div class="repo-row${word.id === selectedId ? " is-selected" : ""}" data-id="${escapeHtml(word.id)}" role="button" tabindex="0" aria-pressed="${word.id === selectedId ? "true" : "false"}">
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

function hideContextPanel(panel) {
  panel.classList.add("hidden");
  panel.innerHTML = "";
}

function showContextLoading(panel) {
  panel.classList.remove("hidden");
  panel.innerHTML = '<p class="repo-context-loading">Generating example sentence…</p>';
}

function showContextResult(panel, result) {
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <p class="repo-context-sentence">${escapeHtml(result.sentence_thai)}</p>
    <p class="repo-context-romanization">${escapeHtml(result.romanization)}</p>
    <p class="repo-context-meaning">${escapeHtml(result.meaning)}</p>
  `;
}

function showContextError(panel, message) {
  panel.classList.remove("hidden");
  panel.innerHTML = `<p class="repo-context-loading">${escapeHtml(message)}</p>`;
}

/**
 * @param {{ onChange?: () => void, onError?: (message: string, options?: { openSettings?: boolean }) => void }} [options]
 */
export function initRepository(options = {}) {
  const modal = document.getElementById("repository-modal");
  const openBtn = document.getElementById("saved-btn");
  const closeBtn = document.getElementById("repository-close");
  const practiceBtn = document.getElementById("repository-practice");
  const contextBtn = document.getElementById("repository-context-btn");
  const list = document.getElementById("repository-list");
  const contextPanel = document.getElementById("repository-context");
  const listView = document.getElementById("repository-list-view");
  const practiceView = document.getElementById("repository-practice-view");

  /** @type {string | null} */
  let selectedId = null;
  let contextLoading = false;

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

  function selectWord(id) {
    selectedId = selectedId === id ? null : id;
    if (contextPanel) {
      hideContextPanel(contextPanel);
    }
    renderRepoList(loadSavedWords(), selectedId);
  }

  function refresh() {
    const words = loadSavedWords();
    if (selectedId && !words.some((word) => word.id === selectedId)) {
      selectedId = null;
      if (contextPanel) {
        hideContextPanel(contextPanel);
      }
    }
    renderRepoList(words, selectedId);
    updateSavedBadge();
    options.onChange?.();
  }

  function open() {
    showListView();
    flashcards.exitSession();
    selectedId = null;
    contextLoading = false;
    if (contextPanel) {
      hideContextPanel(contextPanel);
    }
    refresh();
    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  }

  async function showContext() {
    if (!selectedId || contextLoading || !contextPanel) {
      return;
    }

    const word = loadSavedWords().find((item) => item.id === selectedId);
    if (!word) {
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      options.onError?.("Add your xAI API key in Settings", { openSettings: true });
      return;
    }

    contextLoading = true;
    if (contextBtn) {
      contextBtn.disabled = true;
    }
    showContextLoading(contextPanel);

    try {
      const result = await generateWordContext({
        word: word.original_word,
        meaning: word.meaning,
        part_of_speech: word.part_of_speech,
        romanization: word.romanization,
        model: getModel(),
        apiKey,
      });
      showContextResult(contextPanel, result);
    } catch (error) {
      showContextError(
        contextPanel,
        error instanceof Error ? error.message : "Could not generate context"
      );
    } finally {
      contextLoading = false;
      if (contextBtn) {
        contextBtn.disabled = !selectedId;
      }
    }
  }

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", () => modal.close());
  practiceBtn?.addEventListener("click", () => {
    if (flashcards.startSession()) {
      showPracticeView();
    }
  });
  contextBtn?.addEventListener("click", showContext);

  list?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const removeBtn = target.closest(".repo-remove");
    if (removeBtn instanceof HTMLButtonElement) {
      const id = removeBtn.dataset.id;
      if (!id) {
        return;
      }
      if (selectedId === id) {
        selectedId = null;
        if (contextPanel) {
          hideContextPanel(contextPanel);
        }
      }
      removeWord(id);
      refresh();
      return;
    }

    const row = target.closest(".repo-row");
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const id = row.dataset.id;
    if (!id) {
      return;
    }
    selectWord(id);
  });

  list?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest(".repo-row");
    if (!(row instanceof HTMLElement) || target.closest(".repo-remove")) {
      return;
    }
    event.preventDefault();
    const id = row.dataset.id;
    if (id) {
      selectWord(id);
    }
  });

  updateSavedBadge();

  return { open, refresh, updateSavedBadge };
}
