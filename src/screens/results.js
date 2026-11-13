// ============================================================================
// results.js — post-exam result screen with review answers.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";
import { createQuestionCard, renderMathIn, normalizeQuestion } from "../lib/question-card.js";
import { exportResultsCSV, exportToPDF, reviewToPDFBody } from "../lib/export.js";

let currentResult = null;
let currentReview = [];

export function render(params) {
  return `
    <div id="results-container">
      <div class="qa-header-strip">
        <div class="qa-title-block">
          <h1>Exam Result</h1>
          <p id="results-subtitle">Loading…</p>
        </div>
        <div class="qa-strip-actions">
          <button id="results-export-csv">Export CSV</button>
          <button id="results-export-pdf">Export PDF</button>
          <button id="results-retake" class="primary">Retake</button>
          <button id="results-home">Home</button>
        </div>
      </div>

      <div id="results-summary" class="results-summary hidden">
        <h2 class="results-title">&#127942; Results Summary</h2>
        <p class="results-subtitle" id="results-summary-subtitle"></p>
        <div class="results-percentage">
          <div class="percentage-value" id="results-percentage-value">0%</div>
          <div class="percentage-label">Accuracy / Score</div>
          <div class="results-grade" id="results-grade"></div>
        </div>
        <div class="results-grid">
          <div class="result-card total"><span class="result-icon">&#128203;</span><div class="result-value" id="r-total">0</div><div class="result-label">Total Questions</div></div>
          <div class="result-card answered"><span class="result-icon">&#9997;</span><div class="result-value" id="r-answered">0</div><div class="result-label">Answered</div></div>
          <div class="result-card correct"><span class="result-icon">&#9989;</span><div class="result-value" id="r-correct">0</div><div class="result-label">Correct</div></div>
          <div class="result-card wrong"><span class="result-icon">&#10060;</span><div class="result-value" id="r-wrong">0</div><div class="result-label">Wrong</div></div>
          <div class="result-card unanswered"><span class="result-icon">&#8987;</span><div class="result-value" id="r-unanswered">0</div><div class="result-label">Unanswered</div></div>
          <div class="result-card time"><span class="result-icon">&#9201;</span><div class="result-value" id="r-time">00:00</div><div class="result-label">Duration</div></div>
        </div>
        <div class="results-actions">
          <button class="btn-result btn-result-primary" id="results-review">&#128065; Review Answers</button>
          <button class="btn-result btn-result-secondary" id="results-history">&#128202; View History</button>
        </div>
      </div>

      <section id="review-section" style="display: none;">
        <h2 class="section-divider" style="margin-top: 30px;"><span>Review</span><span class="section-badge" id="review-count">0 questions</span></h2>
        <main id="review-questions"></main>
      </section>
    </div>
  `;
}

export async function mount(params) {
  const attemptId = params?.attemptId;
  if (!attemptId) {
    document.getElementById("results-subtitle").textContent = "No attempt selected.";
    return;
  }

  document.getElementById("results-retake").addEventListener("click", async () => {
    const { navigateTo } = await import("../navigation.js");
    navigateTo("exam", { fresh: true });
  });
  document.getElementById("results-home").addEventListener("click", async () => {
    const { navigateTo } = await import("../navigation.js");
    navigateTo("dashboard");
  });
  document.getElementById("results-review").addEventListener("click", () => {
    document.getElementById("review-section").style.display = "";
    document.getElementById("review-section").scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("results-history").addEventListener("click", async () => {
    const { navigateTo } = await import("../navigation.js");
    navigateTo("history");
  });
  document.getElementById("results-export-csv").addEventListener("click", async () => {
    if (!currentReview || currentReview.length === 0) {
      toast("No review data to export yet.", "error");
      return;
    }
    try {
      const path = await exportResultsCSV(currentReview, currentResult, `exam_result_${attemptId}.csv`);
      if (path) toast(`Exported to ${path}`, "success");
    } catch (e) {
      toast("Export failed: " + e, "error");
    }
  });
  document.getElementById("results-export-pdf").addEventListener("click", () => {
    if (!currentReview || currentReview.length === 0) {
      toast("No review data to export yet.", "error");
      return;
    }
    const body = reviewToPDFBody(currentReview, currentResult);
    exportToPDF("Exam Result Review", body);
    toast("Print dialog opened — use 'Save as PDF'.", "success");
  });

  try {
    const r = await api.getExamResult(attemptId);
    currentResult = r;
    renderSummary(r);
    const review = await api.getExamReview(attemptId);
    currentReview = review;
    renderReview(review);
  } catch (e) {
    toast("Failed to load result: " + e, "error");
  }
}

function renderSummary(r) {
  document.getElementById("results-subtitle").textContent =
    `Attempt #${r.id} • ${r.mode} • ${r.started_at}`;
  document.getElementById("results-summary").classList.remove("hidden");

  const answered = r.correct_count + r.wrong_count;
  document.getElementById("r-total").textContent = r.total_questions;
  document.getElementById("r-answered").textContent = answered;
  document.getElementById("r-correct").textContent = r.correct_count;
  document.getElementById("r-wrong").textContent = r.wrong_count;
  document.getElementById("r-unanswered").textContent = r.unanswered_count;
  document.getElementById("r-time").textContent = formatDuration(r.duration_seconds);

  const pctEl = document.getElementById("results-percentage-value");
  pctEl.textContent = r.percentage.toFixed(1) + "%";
  pctEl.classList.remove("grade-excellent", "grade-good", "grade-average", "grade-poor");
  let grade = "";
  if (r.percentage >= 90) { pctEl.classList.add("grade-excellent"); grade = "Excellent!"; }
  else if (r.percentage >= 70) { pctEl.classList.add("grade-good"); grade = "Good job!"; }
  else if (r.percentage >= 50) { pctEl.classList.add("grade-average"); grade = "Average — keep practising."; }
  else { pctEl.classList.add("grade-poor"); grade = "Needs more practice."; }
  document.getElementById("results-grade").textContent = grade;
  document.getElementById("results-summary-subtitle").textContent =
    `Obtained ${r.obtained_marks.toFixed(2)} / ${r.total_marks.toFixed(2)} marks • accuracy ${r.accuracy.toFixed(1)}%`;
}

function renderReview(review) {
  const main = document.getElementById("review-questions");
  document.getElementById("review-count").textContent = `${review.length} questions`;
  main.innerHTML = "";
  review.forEach((row) => {
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
    // Show a small banner describing the user's choice.
    const banner = document.createElement("div");
    banner.className = "review-banner";
    if (row.response_status !== "answered" || !row.selected_answer) {
      banner.innerHTML = `<strong>You did not answer this question.</strong> Marks awarded: ${row.marks_awarded.toFixed(2)}.`;
    } else {
      banner.innerHTML =
        `<strong>Your answer:</strong> ${row.selected_answer} — ` +
        (row.is_correct ? '<span style="color: #28a745; font-weight: 700;">Correct</span>' : '<span style="color: #dc3545; font-weight: 700;">Wrong</span>') +
        ` &nbsp;•&nbsp; Marks: ${row.marks_awarded.toFixed(2)}`;
    }
    card.insertBefore(banner, card.firstChild);
    main.appendChild(card);
  });
  renderMathIn(main);
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
