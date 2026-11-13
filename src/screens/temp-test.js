// ============================================================================
// temp-test.js — Temporary Test mode. Pick a CSV, parse it (without saving
// anything to the database), take a timed exam or practice session, see the
// result, then everything is discarded. No questions, attempts or results
// are persisted.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";
import { createQuestionCard, renderMathIn, normalizeQuestion } from "../lib/question-card.js";
import { exportResultsCSV, exportToPDF, reviewToPDFBody } from "../lib/export.js";

let tempQuestions = [];   // parsed ParsedRow objects
let mode = "exam";        // "exam" | "practice"
let durationMinutes = 30;
let phase = "setup";      // "setup" | "test" | "result"
let answers = new Map();  // questionId -> selected option text
let timerInterval = null;
let endTimeMs = 0;

export function render(params) {
  if (params?._tempPhase) phase = params._tempPhase;
  if (phase === "setup") return renderSetup();
  if (phase === "test") return renderTest();
  if (phase === "result") return renderResult();
  return renderSetup();
}

export async function mount(params) {
  if (params?._tempPhase) phase = params._tempPhase;
  if (phase === "setup") wireSetup();
  else if (phase === "test") wireTest();
  else if (phase === "result") wireResult();
}

// ---- Phase 1: Setup ----

function renderSetup() {
  return `
    <section class="panel">
      <h1>Temporary Test</h1>
      <p class="panel-sub">
        Pick a CSV file, take a test and see your result. Nothing is saved — no questions,
        no attempts, no results. The database is never touched.
      </p>
      <div class="btn-row">
        <button class="btn-app primary" id="temp-pick">Pick CSV file…</button>
      </div>
      <div id="temp-file-info" style="margin-top: 14px;"></div>

      <div class="form-row" style="margin-top: 18px;">
        <div class="form-field">
          <label for="temp-mode">Mode</label>
          <select id="temp-mode">
            <option value="exam">Exam (timed, no feedback until end)</option>
            <option value="practice">Practice (instant feedback)</option>
          </select>
        </div>
        <div class="form-field">
          <label for="temp-duration">Duration (minutes)</label>
          <input id="temp-duration" type="number" min="0" value="30" />
          <span class="hint">0 = untimed.</span>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-app success" id="temp-start" disabled>Start Test</button>
      </div>
    </section>
  `;
}

async function wireSetup() {
  document.getElementById("temp-pick").addEventListener("click", async () => {
    try {
      const result = await api.pickCsvFile();
      if (!result) return;
      const filename = result.path.split(/[\\/]/).pop();
      const rows = await api.parseCsvFull(result.content);
      tempQuestions = rows;
      document.getElementById("temp-file-info").innerHTML =
        `<div class="review-banner"><strong>${escapeHtml(filename)}</strong> — ${rows.length} valid question(s) parsed.</div>`;
      document.getElementById("temp-start").disabled = rows.length === 0;
      toast(`Parsed ${rows.length} questions.`, "success");
    } catch (e) {
      toast("Failed to parse CSV: " + e, "error");
    }
  });
  document.getElementById("temp-mode").addEventListener("change", (e) => {
    mode = e.target.value;
  });
  document.getElementById("temp-duration").addEventListener("input", (e) => {
    durationMinutes = parseInt(e.target.value, 10) || 0;
  });
  document.getElementById("temp-start").addEventListener("click", () => {
    if (tempQuestions.length === 0) {
      toast("Pick a CSV file first.", "error");
      return;
    }
    answers.clear();
    phase = "test";
    if (mode === "exam" && durationMinutes > 0) {
      endTimeMs = Date.now() + durationMinutes * 60 * 1000;
    } else {
      endTimeMs = 0;
    }
    rerender();
  });
}

// ---- Phase 2: Test ----

function renderTest() {
  const isTimed = mode === "exam" && endTimeMs > 0;
  return `
    <div class="qa-header-strip">
      <div class="qa-title-block">
        <h1>Temporary ${mode === "exam" ? "Exam" : "Practice"}</h1>
        <p>${tempQuestions.length} questions — nothing is saved.</p>
      </div>
      <div class="qa-strip-actions">
        ${isTimed ? `<span class="live-timer" id="temp-timer"><span class="timer-icon">&#9201;</span><span id="temp-timer-display">--:--</span></span>` : ""}
        ${mode === "exam" ? `<button class="primary" id="temp-submit">Submit Test</button>` : ""}
        <button class="danger" id="temp-abort">Abort</button>
      </div>
    </div>
    ${mode === "practice" ? `
      <div class="score-display" style="margin-bottom: 18px;">
        <span class="score-text" id="temp-score">Score: 0/0</span>
        <div class="score-bar"><div class="score-fill" id="temp-score-fill"></div></div>
      </div>
    ` : ""}
    <main id="temp-questions"></main>
  `;
}

async function wireTest() {
  const container = document.getElementById("temp-questions");
  container.innerHTML = "";
  let correctCount = 0;
  let answeredCount = 0;

  tempQuestions.forEach((row, idx) => {
    // Convert ParsedRow to the format normalizeQuestion expects.
    const q = normalizeQuestion({
      id: idx + 1,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
    });
    q.index = idx + 1;

    const card = createQuestionCard(q, {
      interactive: true,
      onAnswer: (question, selectedText, isCorrect) => {
        answers.set(question.id, selectedText);
        if (mode === "practice") {
          answeredCount++;
          if (isCorrect) correctCount++;
          updatePracticeScore(correctCount, answeredCount, tempQuestions.length);
        }
      },
    });

    // In exam mode, hide the answer block (no feedback until submission).
    if (mode === "exam") {
      // Override the check button to just save the answer without revealing.
      const checkBtn = card.querySelector(".check-btn");
      if (checkBtn) {
        const fresh = checkBtn.cloneNode(false);
        fresh.textContent = "Save answer";
        fresh.addEventListener("click", () => {
          const selected = card.querySelector(".option-item.selected");
          if (!selected) {
            fresh.textContent = "Please select an option first";
            setTimeout(() => (fresh.textContent = "Save answer"), 1500);
            return;
          }
          const letter = selected.getAttribute("data-letter");
          const opt = q.options.find((o) => o.letter === letter);
          answers.set(q.id, opt.text);
          card.classList.add("answered");
          card.querySelectorAll(".option-item").forEach((o) => {
            o.classList.remove("selected");
            if (o.getAttribute("data-letter") === letter) o.classList.add("correct");
          });
          const ab = card.querySelector(".answer-block");
          if (ab) ab.style.display = "none";
          fresh.textContent = "Saved";
          fresh.disabled = true;
        });
        checkBtn.replaceWith(fresh);
      }
      // Also hide the answer block.
      const ab = card.querySelector(".answer-block");
      if (ab) ab.style.display = "none";
    }

    container.appendChild(card);
  });
  renderMathIn(container);

  if (mode === "exam") {
    document.getElementById("temp-submit").addEventListener("click", () => submitTest(false));
    document.getElementById("temp-abort").addEventListener("click", () => {
      if (confirm("Abort this temporary test? Nothing will be saved.")) {
        resetToSetup();
      }
    });
    if (endTimeMs > 0) startTimer();
  } else {
    document.getElementById("temp-abort").addEventListener("click", () => {
      if (confirm("Abort this temporary practice? Nothing will be saved.")) {
        resetToSetup();
      }
    });
    updatePracticeScore(0, 0, tempQuestions.length);
  }
}

function updatePracticeScore(correct, answered, total) {
  const el = document.getElementById("temp-score");
  const fill = document.getElementById("temp-score-fill");
  if (!el) return;
  el.textContent = `Score: ${correct}/${total} (${answered} answered)`;
  const pct = total > 0 ? (correct / total) * 100 : 0;
  fill.style.width = pct + "%";
  fill.classList.remove("low", "mid", "high");
  if (pct < 40) fill.classList.add("low");
  else if (pct < 70) fill.classList.add("mid");
  else fill.classList.add("high");
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    updateTimerDisplay();
    if (endTimeMs > 0 && Date.now() >= endTimeMs) {
      stopTimer();
      toast("Time is up — submitting automatically.", "error");
      submitTest(true);
    }
  }, 1000);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function updateTimerDisplay() {
  const el = document.getElementById("temp-timer-display");
  if (!el) return;
  if (endTimeMs === 0) { el.textContent = "untimed"; return; }
  const remaining = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n) => String(n).padStart(2, "0");
  el.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function submitTest(auto) {
  if (!auto && !confirm("Submit this test? You will see the result next.")) return;
  stopTimer();
  phase = "result";
  rerender();
}

// ---- Phase 3: Result ----

function renderResult() {
  // Calculate results in the frontend (no backend involved).
  let correct = 0, wrong = 0, unanswered = 0;
  const reviewData = [];

  tempQuestions.forEach((row, idx) => {
    const q = normalizeQuestion({
      id: idx + 1,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
    });
    const selected = answers.get(idx + 1);
    const isCorrect = selected ? normalizeText(selected) === normalizeText(row.right_option) : false;
    if (!selected) unanswered++;
    else if (isCorrect) correct++;
    else wrong++;

    reviewData.push({
      question_order: idx + 1,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
      selected_answer: selected || null,
      is_correct: isCorrect ? 1 : 0,
      is_marked_review: 0,
      marks_awarded: 0,
      response_status: selected ? "answered" : "not_answered",
    });
  });

  const total = tempQuestions.length;
  const attempted = correct + wrong;
  const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

  return `
    <div class="qa-header-strip">
      <div class="qa-title-block">
        <h1>Temporary Test Result</h1>
        <p>This result is not saved anywhere.</p>
      </div>
      <div class="qa-strip-actions">
        <button class="primary" id="temp-export-csv">Export CSV</button>
        <button id="temp-export-pdf">Export PDF</button>
        <button id="temp-new">New Test</button>
      </div>
    </div>

    <div class="results-summary">
      <h2 class="results-title">&#127942; Results</h2>
      <p class="results-subtitle">${correct} out of ${total} correct in this temporary session.</p>
      <div class="results-percentage">
        <div class="percentage-value">${accuracy.toFixed(1)}%</div>
        <div class="percentage-label">Accuracy</div>
      </div>
      <div class="results-grid">
        <div class="result-card total"><span class="result-icon">&#128203;</span><div class="result-value">${total}</div><div class="result-label">Total</div></div>
        <div class="result-card correct"><span class="result-icon">&#9989;</span><div class="result-value">${correct}</div><div class="result-label">Correct</div></div>
        <div class="result-card wrong"><span class="result-icon">&#10060;</span><div class="result-value">${wrong}</div><div class="result-label">Wrong</div></div>
        <div class="result-card unanswered"><span class="result-icon">&#8987;</span><div class="result-value">${unanswered}</div><div class="result-label">Unanswered</div></div>
      </div>
    </div>

    <section id="temp-review-section">
      <h2 class="section-divider" style="margin-top: 30px;"><span>Review</span><span class="section-badge">${reviewData.length} questions</span></h2>
      <main id="temp-review"></main>
    </section>
  `;
}

async function wireResult() {
  const review = document.getElementById("temp-review");
  if (!review) return;

  // Build review data (re-calculate to avoid closure issues).
  const reviewData = [];
  tempQuestions.forEach((row, idx) => {
    const selected = answers.get(idx + 1);
    const isCorrect = selected ? normalizeText(selected) === normalizeText(row.right_option) : false;
    reviewData.push({
      question_order: idx + 1,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
      selected_answer: selected || null,
      is_correct: isCorrect ? 1 : 0,
      is_marked_review: 0,
      marks_awarded: 0,
      response_status: selected ? "answered" : "not_answered",
    });
  });

  review.innerHTML = "";
  reviewData.forEach((row) => {
    const q = normalizeQuestion({
      id: row.question_order,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
    });
    q.index = row.question_order;
    const card = createQuestionCard(q, {
      interactive: false,
      reveal: true,
      preselectedAnswer: row.selected_answer,
    });
    // Add a banner showing the user's answer.
    const banner = document.createElement("div");
    banner.className = "review-banner";
    if (!row.selected_answer) {
      banner.innerHTML = `<strong>You did not answer this question.</strong>`;
    } else {
      banner.innerHTML =
        `<strong>Your answer:</strong> ${escapeHtml(row.selected_answer)} — ` +
        (row.is_correct
          ? '<span style="color: #28a745; font-weight: 700;">Correct</span>'
          : '<span style="color: #dc3545; font-weight: 700;">Wrong</span>');
    }
    card.insertBefore(banner, card.firstChild);
    review.appendChild(card);
  });
  renderMathIn(review);

  // Wire export buttons.
  document.getElementById("temp-export-csv").addEventListener("click", async () => {
    try {
      const path = await exportResultsCSV(reviewData, null, `temp_test_results_${Date.now()}.csv`);
      if (path) toast(`Exported to ${path}`, "success");
    } catch (e) {
      toast("Export failed: " + e, "error");
    }
  });
  document.getElementById("temp-export-pdf").addEventListener("click", () => {
    const body = reviewToPDFBody(reviewData, null);
    exportToPDF("Temporary Test Results", body);
    toast("Print dialog opened.", "success");
  });
  document.getElementById("temp-new").addEventListener("click", resetToSetup);
}

function resetToSetup() {
  tempQuestions = [];
  answers.clear();
  phase = "setup";
  stopTimer();
  rerender();
}

// Re-render the current screen by asking the router to navigate back to us.
async function rerender() {
  const { navigateTo } = await import("../navigation.js");
  navigateTo("temp-test", { _tempPhase: phase });
}

function normalizeText(t) {
  if (!t) return "";
  return String(t).trim().toLowerCase().replace(/\.+$/, "").replace(/\s+/g, " ");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
