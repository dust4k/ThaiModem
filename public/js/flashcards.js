/**
 * @param {string} text
 */
export function normalizeAnswer(text) {
  return text
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
function shuffle(items) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {{ loadWords: () => import("./models.js").SavedWord[], onExit: () => void }} options
 */
export function initFlashcards(options) {
  const progress = document.getElementById("flashcard-progress");
  const pos = document.getElementById("flashcard-pos");
  const prompt = document.getElementById("flashcard-prompt");
  const input = document.getElementById("flashcard-input");
  const feedback = document.getElementById("flashcard-feedback");
  const card = document.getElementById("flashcard-card");
  const summary = document.getElementById("flashcard-summary");
  const scoreEl = document.getElementById("flashcard-score");
  const checkBtn = document.getElementById("flashcard-check");
  const nextBtn = document.getElementById("flashcard-next");
  const againBtn = document.getElementById("flashcard-again");
  const exitBtn = document.getElementById("flashcard-exit");

  /** @type {import("./models.js").SavedWord[]} */
  let deck = [];
  let index = 0;
  let correct = 0;
  let checked = false;

  function showCardView() {
    card?.classList.remove("hidden");
    summary?.classList.add("hidden");
    checkBtn?.classList.remove("hidden");
    nextBtn?.classList.add("hidden");
    againBtn?.classList.add("hidden");
  }

  function showSummaryView() {
    card?.classList.add("hidden");
    summary?.classList.remove("hidden");
    checkBtn?.classList.add("hidden");
    nextBtn?.classList.add("hidden");
    againBtn?.classList.remove("hidden");
    if (scoreEl) {
      scoreEl.textContent = `${correct} / ${deck.length} correct`;
    }
    if (progress) {
      progress.textContent = "Session complete";
    }
  }

  function renderCard() {
    checked = false;
    showCardView();

    const word = deck[index];
    if (!word) {
      return;
    }

    if (progress) {
      progress.textContent = `${index + 1} / ${deck.length}`;
    }
    if (pos) {
      pos.textContent = word.part_of_speech || "";
      pos.classList.toggle("hidden", !word.part_of_speech);
    }
    if (prompt) {
      prompt.textContent = word.meaning;
    }
    if (input) {
      input.value = "";
      input.disabled = false;
      input.focus();
    }
    if (feedback) {
      feedback.textContent = "";
      feedback.className = "flashcard-feedback hidden";
    }
    if (checkBtn) {
      checkBtn.disabled = false;
    }
  }

  function checkAnswer() {
    if (checked || !deck.length) {
      return;
    }

    const word = deck[index];
    if (!word || !(input instanceof HTMLInputElement)) {
      return;
    }

    const userAnswer = normalizeAnswer(input.value);
    if (!userAnswer) {
      return;
    }

    checked = true;
    const isCorrect = userAnswer === normalizeAnswer(word.original_word);
    if (isCorrect) {
      correct += 1;
    }

    input.disabled = true;
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.classList.add("hidden");
    }
    if (nextBtn) {
      nextBtn.classList.remove("hidden");
    }
    if (feedback) {
      feedback.classList.remove("hidden");
      if (isCorrect) {
        feedback.className = "flashcard-feedback is-correct";
        feedback.textContent = "Correct!";
      } else {
        feedback.className = "flashcard-feedback is-wrong";
        feedback.innerHTML = `Correct answer: <strong>${escapeHtml(word.original_word)}</strong><br><span class="flashcard-romanization">${escapeHtml(word.romanization)}</span>`;
      }
    }
  }

  function nextCard() {
    if (!checked) {
      return;
    }

    index += 1;
    if (index >= deck.length) {
      showSummaryView();
      return;
    }
    renderCard();
  }

  function startSession() {
    deck = shuffle(options.loadWords());
    index = 0;
    correct = 0;
    checked = false;

    if (!deck.length) {
      return false;
    }

    renderCard();
    return true;
  }

  function exitSession() {
    deck = [];
    index = 0;
    correct = 0;
    checked = false;
    options.onExit();
  }

  checkBtn?.addEventListener("click", checkAnswer);
  nextBtn?.addEventListener("click", nextCard);
  againBtn?.addEventListener("click", startSession);
  exitBtn?.addEventListener("click", exitSession);

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (checked) {
      nextCard();
    } else {
      checkAnswer();
    }
  });

  return { startSession, exitSession };
}
