// ============================================================================
// exam.js — Timed Exam Mode. Same visual design as Practice Mode (preserved
// original question cards) but:
//   - Countdown timer based on the saved duration.
//   - No immediate correct/incorrect feedback.
//   - Answer palette on the right for navigation.
//   - Submit Exam button (manual or auto).
//   - Backend computes the final result.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";
import { createQuestionCard, renderMathIn, normalizeQuestion } from "../lib/question-card.js";

let attemptId = null;
let questions = [];
let endsAtMs = 0;
let timerInterval = null;
let currentQuestionOrder = 1;

export function render() {
  return `
    <div class="qa-header-strip">
      <div class="qa-title-block">
        <h1>Exam Mode</h1>
        <p id="exam-subtitle">Starting…</p>
      </div>
      <div class="qa-strip-actions">
        <span class="live-timer" id="exam-timer"><span class="timer-icon">&#9201;</span><span id="exam-timer-display">--:--</span></span>
        <button id="exam-submit" class="primary">Submit Exam</button>
        <button id="exam-abandon" class="danger">Abandon</button>
      </div>
    </div>

    <div class="exam-shell">
      <main id="exam-questions"></main>
      <aside class="exam-palette" id="exam-palette">
        <h3>Question palette</h3>
        <div class="palette-grid" id="palette-grid"></div>
        <div class="palette-legend">
          <span><span class="legend-swatch answered"></span> Answered</span>
          <span><span class="legend-swatch not_answered"></span> Not answered</span>
          <span><span class="legend-swatch marked"></span> Marked</span>
        </div>
        <div style="margin-top: 14px;">
          <button class="btn-app secondary" id="palette-mark" style="width: 100%;">Mark / Unmark current</button>
        </div>
      </aside>
    </div>
  `;
}

export async function mount(params) {
  document.getElementById("exam-submit").addEventListener("click", () => submitExam(false));
  document.getElementById("exam-abandon").addEventListener("click", async () => {
    if (!confirm("Abandon this exam? It will be marked as abandoned in history.")) return;
    if (attemptId) {
      try { await api.abandonExam(attemptId); } catch (_) {}
    }
    stopTimer();
    const { navigateTo } = await import("../navigation.js");
    navigateTo("dashboard");
  });
  document.getElementById("palette-mark").addEventListener("click", async () => {
    if (!attemptId || !currentQuestionOrder) return;
    const row = questions.find((q) => q.question_order === currentQuestionOrder);
    if (!row) return;
    const newMarked = !row.is_marked_review;
    row.is_marked_review = newMarked ? 1 : 0;
    try {
      await api.markQuestionForReview(attemptId, row.question_id, newMarked);
    } catch (e) {
      toast("Could not mark: " + e, "error");
    }
    renderPalette();
  });

  try {
    let active = null;
    try { active = await api.getActiveExam(); } catch (_) {}
    if (active && active.mode === "exam") {
      attemptId = active.id;
      questions = await api.getExamQuestions(attemptId);
      // Restore end time.
      if (active.ends_at) {
        endsAtMs = new Date(active.ends_at).getTime();
      }
    } else {
      const started = await api.startExam("exam");
      attemptId = started.attempt_id;
      questions = started.questions;
      if (started.ends_at) endsAtMs = new Date(started.ends_at).getTime();
    }

    document.getElementById("exam-subtitle").textContent =
      `Exam session #${attemptId} • ${questions.length} questions • answers are saved automatically.`;

    renderQuestions();
    renderPalette();
    startTimer();
  } catch (e) {
    document.getElementById("exam-questions").innerHTML =
      `<div class="empty-state"><div class="emoji">&#9888;</div>Could not start exam: ${e}</div>`;
  }
}

function renderQuestions() {
  const container = document.getElementById("exam-questions");
  container.innerHTML = "";
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
    q.index = row.question_order;

    // In EXAM mode the card is interactive (you can pick an option) but the
    // Check button reveals nothing — we just persist the answer.
    const card = createQuestionCard(q, {
      interactive: true,
      onAnswer: async (question, selectedText, _isCorrect) => {
        // NOTE: _isCorrect is intentionally ignored here — exam mode hides
        // correctness from the user. We persist the answer text only.
        try {
          await api.saveExamAnswer(attemptId, question.id, selectedText);
          const r = questions.find((qr) => qr.question_id === question.id);
          if (r) {
            r.selected_answer = selectedText;
            r.response_status = "answered";
          }
          renderPalette();
          toast("Answer saved.", "success");
        } catch (e) {
          toast("Save failed: " + e, "error");
        }
      },
    });

    // Override the check-button behaviour: in exam mode clicking "Check Answer"
    // just saves the choice and clears the selection visual without revealing
    // the correct answer or the explanation.
    const checkBtn = card.querySelector(".check-btn");
    if (checkBtn) {
      checkBtn.textContent = "Save answer";
      // Strip the original click listener by cloning the node.
      const fresh = checkBtn.cloneNode(false);
      fresh.textContent = "Save answer";
      fresh.addEventListener("click", async () => {
        const selected = card.querySelector(".option-item.selected");
        if (!selected) {
          const o = checkBtn.textContent;
          fresh.textContent = "Please select an option first";
          setTimeout(() => (fresh.textContent = "Save answer"), 1500);
          return;
        }
        const letter = selected.getAttribute("data-letter");
        const opt = q.options.find((o) => o.letter === letter);
        try {
          await api.saveExamAnswer(attemptId, q.id, opt.text);
          const r = questions.find((qr) => qr.question_id === q.id);
          if (r) {
            r.selected_answer = opt.text;
            r.response_status = "answered";
          }
          // Visually mark as answered (greyed) WITHOUT revealing correctness.
          card.classList.add("answered");
          card.querySelectorAll(".option-item").forEach((o) => {
            o.classList.remove("selected");
            if (o.getAttribute("data-letter") === letter) o.classList.add("correct");
            // We add "correct" only to show "answered" styling. The actual
            // correctness is NOT shown to the user — the answer block stays
            // hidden in exam mode.
          });
          fresh.textContent = "Saved";
          fresh.disabled = true;
          renderPalette();
          toast("Answer saved.", "success");
        } catch (e) {
          toast("Save failed: " + e, "error");
        }
      });
      checkBtn.replaceWith(fresh);
    }

    // If the answer was previously saved (resumed exam), restore the visual.
    if (row.response_status === "answered" && row.selected_answer) {
      card.classList.add("answered");
      const letter = q.options.find((o) => o.text === row.selected_answer)?.letter;
      card.querySelectorAll(".option-item").forEach((o) => {
        if (o.getAttribute("data-letter") === letter) o.classList.add("correct");
        o.setAttribute("aria-checked", "false");
      });
      const btn = card.querySelector(".check-btn");
      if (btn) {
        btn.textContent = "Saved";
        btn.disabled = true;
      }
    }

    // Hide the answer block entirely in exam mode.
    const ab = card.querySelector(".answer-block");
    if (ab) ab.style.display = "none";

    // Click anywhere on the card to set current.
    card.addEventListener("click", () => {
      currentQuestionOrder = row.question_order;
      renderPalette();
    });

    container.appendChild(card);
  });
  renderMathIn(container);
}

function renderPalette() {
  const grid = document.getElementById("palette-grid");
  grid.innerHTML = "";
  questions.forEach((row) => {
    const cell = document.createElement("div");
    cell.className = "palette-cell";
    if (row.response_status === "answered") cell.classList.add("answered");
    else cell.classList.add("not_answered");
    if (row.is_marked_review) cell.classList.add("marked");
    if (row.question_order === currentQuestionOrder) cell.classList.add("active");
    cell.textContent = row.question_order;
    cell.addEventListener("click", () => {
      currentQuestionOrder = row.question_order;
      const card = document.getElementById("question-idx-" + row.question_order);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      renderPalette();
    });
    grid.appendChild(cell);
  });
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function updateTimerDisplay() {
  const el = document.getElementById("exam-timer-display");
  if (!el) return;
  if (!endsAtMs) {
    el.textContent = "untimed";
    return;
  }
  const remaining = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n) => String(n).padStart(2, "0");
  el.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  if (remaining <= 0) {
    stopTimer();
    toast("Time is up — submitting automatically.", "error");
    submitExam(true);
  }
}

async function submitExam(auto) {
  if (!attemptId) return;
  if (!auto && !confirm("Submit this exam? You will not be able to change answers.")) return;
  stopTimer();
  try {
    const result = await api.submitExam(attemptId);
    toast(`Exam submitted. Score: ${result.obtained_marks.toFixed(2)} / ${result.total_marks.toFixed(2)} (${result.percentage.toFixed(1)}%)`, "success");
    const { navigateTo } = await import("../navigation.js");
    navigateTo("results", { attemptId });
  } catch (e) {
    toast("Submit failed: " + e, "error");
  }
}
