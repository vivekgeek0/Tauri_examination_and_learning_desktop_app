// ============================================================================
// practice.js — Practice Mode. Preserves the original HTML interface:
// question cards, four options, Check button, immediate feedback, score bar,
// live timer, search, expand/collapse all, section dividers.
//
// In practice mode we draw questions from the bank using the saved settings
// (number of questions, source). Answers are checked locally in the browser
// and the score is updated live — but every answer is also persisted via the
// backend so it survives a restart.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";
import { createQuestionCard, renderMathIn, normalizeQuestion } from "../lib/question-card.js";

let attemptId = null;
let questions = [];
let correctCount = 0;
let wrongCount = 0;
let answeredCount = 0;
let timerInterval = null;
let timerSeconds = 0;

export function render(params) {
  return `
    <div id="practice-container">
      <div class="qa-header-strip">
        <div class="qa-title-block">
          <h1>Practice Mode</h1>
          <p id="practice-subtitle">Loading questions…</p>
        </div>
        <div class="qa-strip-actions">
          <span class="qa-badge" id="practice-count">— questions</span>
          <span class="live-timer" id="practice-timer"><span class="timer-icon">&#9201;</span><span id="practice-timer-display">00:00</span></span>
          <button id="practice-expand-all">Expand All</button>
          <button id="practice-collapse-all">Collapse All</button>
          <button id="practice-finish" class="primary">Finish &amp; Save</button>
        </div>
      </div>

      <div class="score-display" style="margin-bottom: 18px;">
        <span class="score-text" id="practice-score">Score: 0/0</span>
        <div class="score-bar"><div class="score-fill" id="practice-score-fill"></div></div>
      </div>

      <div class="search-container" style="margin-bottom: 18px;">
        <span class="search-icon">&#128269;</span>
        <input type="text" class="search-input" id="practice-search" placeholder="Search questions and options…" />
        <div class="search-counter" id="practice-search-counter"></div>
      </div>

      <main id="practice-questions"></main>
    </div>
  `;
}

export async function mount(params) {
  document.getElementById("practice-expand-all").addEventListener("click", () => {
    document.querySelectorAll("#practice-questions .answer-block").forEach((b) => b.classList.add("show"));
  });
  document.getElementById("practice-collapse-all").addEventListener("click", () => {
    document.querySelectorAll("#practice-questions .answer-block").forEach((b) => b.classList.remove("show"));
  });
  document.getElementById("practice-finish").addEventListener("click", finishPractice);

  document.getElementById("practice-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    let shown = 0;
    document.querySelectorAll("#practice-questions .question-card").forEach((card) => {
      const t = card.getAttribute("data-search-text") || "";
      if (!q || t.indexOf(q) !== -1) {
        card.classList.remove("hidden");
        shown++;
      } else {
        card.classList.add("hidden");
      }
    });
    document.getElementById("practice-search-counter").textContent = q
      ? `Showing ${shown} of ${questions.length} questions`
      : "";
  });

  try {
    // Reuse existing active practice attempt if there is one.
    let active = null;
    try {
      active = await api.getActiveExam();
    } catch (_) {}

    if (active && active.mode === "practice") {
      attemptId = active.id;
      const rows = await api.getExamQuestions(attemptId);
      questions = rows;
    } else {
      const started = await api.startExam("practice");
      attemptId = started.attempt_id;
      questions = started.questions;
    }

    document.getElementById("practice-count").textContent = `${questions.length} questions`;
    document.getElementById("practice-subtitle").textContent =
      `Practice session #${attemptId} • answers are saved automatically.`;

    renderQuestions();
    startTimer();
    updateScore();
  } catch (e) {
    document.getElementById("practice-questions").innerHTML =
      `<div class="empty-state"><div class="emoji">&#9888;</div>Could not start practice: ${e}</div>`;
  }
}

function renderQuestions() {
  const container = document.getElementById("practice-questions");
  container.innerHTML = "";

  // Section divider per 10 questions (matches original behaviour).
  questions.forEach((row, idx) => {
    const q = normalizeQuestion({
      id: row.question_id,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
    });
    q.index = idx + 1;

    // If the question was already answered before (resumed), reveal it.
    const alreadyAnswered =
      row.response_status === "answered" && row.selected_answer;
    const card = createQuestionCard(q, {
      interactive: !alreadyAnswered,
      reveal: alreadyAnswered,
      preselectedAnswer: alreadyAnswered ? row.selected_answer : null,
      onAnswer: async (question, selectedText, isCorrect) => {
        try {
          await api.saveExamAnswer(attemptId, question.id, selectedText);
        } catch (e) {
          toast("Failed to save answer: " + e, "error");
        }
        answeredCount++;
        if (isCorrect) correctCount++; else wrongCount++;
        updateScore();
        if (answeredCount >= questions.length) {
          toast("All questions answered! Click Finish & Save to record the session.", "success");
        }
      },
    });

    // If already answered, also count it.
    if (alreadyAnswered) {
      answeredCount++;
      if (row.is_correct) correctCount++; else wrongCount++;
    }

    container.appendChild(card);
  });
  renderMathIn(container);
  updateScore();
}

function updateScore() {
  const total = questions.length;
  document.getElementById("practice-score").textContent = `Score: ${correctCount}/${total}`;
  const fill = document.getElementById("practice-score-fill");
  const pct = total > 0 ? (correctCount / total) * 100 : 0;
  fill.style.width = pct + "%";
  fill.classList.remove("low", "mid", "high");
  if (pct < 40) fill.classList.add("low");
  else if (pct < 70) fill.classList.add("mid");
  else fill.classList.add("high");
}

function startTimer() {
  stopTimer();
  timerSeconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function updateTimerDisplay() {
  const el = document.getElementById("practice-timer-display");
  if (!el) return;
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  el.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

async function finishPractice() {
  if (!attemptId) return;
  if (!confirm("Finish this practice session? It will be saved to history.")) return;
  stopTimer();
  try {
    // Submit backend-side so the result is calculated and persisted.
    const result = await api.submitExam(attemptId);
    toast(`Saved. Correct: ${result.correct_count} / ${result.total_questions}.`, "success");
    // Navigate to results.
    const { navigateTo } = await import("../navigation.js");
    navigateTo("results", { attemptId });
  } catch (e) {
    toast("Failed to finish: " + e, "error");
  }
}
