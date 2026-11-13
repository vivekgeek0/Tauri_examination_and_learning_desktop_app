// ============================================================================
// dashboard.js — home screen / dashboard. Shows main action buttons and
// statistics pulled from SQLite via the Rust backend.
// ============================================================================

import { navigateTo } from "../navigation.js";
import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";

export function render() {
  return `
    <section class="dashboard-hero">
      <h1>Exam Practice Studio</h1>
      <p>Offline desktop exam practice with question bank, timed exams and permanent result history.</p>
    </section>

    <div class="action-grid">
      <button class="action-card primary" data-go="exam">
        <span class="action-icon">&#9654;</span>
        <span class="action-title">Start Exam</span>
        <span class="action-desc">Begin a timed exam using your saved settings.</span>
      </button>
      <button class="action-card" data-go="practice">
        <span class="action-icon">&#128221;</span>
        <span class="action-title">Practice Mode</span>
        <span class="action-desc">Browse questions, check answers instantly, see explanations.</span>
      </button>
      <button class="action-card" data-go="question-bank">
        <span class="action-icon">&#128218;</span>
        <span class="action-title">Question Bank</span>
        <span class="action-desc">Search, view, edit and delete imported questions.</span>
      </button>
      <button class="action-card" data-go="import">
        <span class="action-icon">&#128229;</span>
        <span class="action-title">Import CSV</span>
        <span class="action-desc">Import a CSV question file with the standard 7-column format.</span>
      </button>
      <button class="action-card" data-go="settings">
        <span class="action-icon">&#9881;</span>
        <span class="action-title">Exam Settings</span>
        <span class="action-desc">Number of questions, duration, marking scheme, sources.</span>
      </button>
      <button class="action-card" data-go="history">
        <span class="action-icon">&#128202;</span>
        <span class="action-title">Results &amp; History</span>
        <span class="action-desc">Review past attempts and performance statistics.</span>
      </button>
      <button class="action-card" data-go="wrong">
        <span class="action-icon">&#10060;</span>
        <span class="action-title">Wrong Answered</span>
        <span class="action-desc">Questions you got wrong across all exams, with export.</span>
      </button>
      <button class="action-card" data-go="temp-test">
        <span class="action-icon">&#9889;</span>
        <span class="action-title">Temporary Test</span>
        <span class="action-desc">Import CSV, take a test, see result — nothing saved.</span>
      </button>
    </div>

    <div class="panel">
      <h1>Dashboard statistics</h1>
      <p class="panel-sub">All numbers come from the local SQLite database.</p>
      <div id="dashboard-stats" class="stat-grid">
        <div class="stat-card"><div class="stat-value" id="stat-questions">—</div><div class="stat-label">Questions</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-sets">—</div><div class="stat-label">Imported Sets</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-exams">—</div><div class="stat-label">Exams Taken</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-best">—</div><div class="stat-label">Best %</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-avg">—</div><div class="stat-label">Average %</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-acc">—</div><div class="stat-label">Average Accuracy</div></div>
      </div>
    </div>

    <div id="active-exam-banner"></div>
  `;
}

export async function mount() {
  // Wire up action cards.
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = el.getAttribute("data-go");
      if (target === "exam") navigateTo("exam", { fresh: true });
      else if (target === "practice") navigateTo("practice", { fresh: true });
      else navigateTo(target);
    });
  });

  // Load statistics.
  try {
    const stats = await api.getDashboardStatistics();
    document.getElementById("stat-questions").textContent = stats.total_questions;
    document.getElementById("stat-sets").textContent = stats.total_sets;
    document.getElementById("stat-exams").textContent = stats.total_exams;
    document.getElementById("stat-best").textContent = stats.best_percentage.toFixed(1) + "%";
    document.getElementById("stat-avg").textContent = stats.average_percentage.toFixed(1) + "%";
    document.getElementById("stat-acc").textContent = stats.average_accuracy.toFixed(1) + "%";
  } catch (e) {
    toast("Failed to load statistics: " + e, "error");
  }

  // Active-exam recovery banner.
  try {
    const active = await api.getActiveExam();
    if (active) {
      const banner = document.getElementById("active-exam-banner");
      banner.innerHTML = `
        <div class="panel" style="border-color: var(--accent-blue);">
          <h1>Unfinished exam in progress</h1>
          <p class="panel-sub">An exam (id #${active.id}, mode ${active.mode}) was started on ${active.started_at} but never submitted.</p>
          <div class="btn-row">
            <button class="btn-app primary" id="resume-active">Resume exam</button>
            <button class="btn-app danger" id="abandon-active">Abandon exam</button>
          </div>
        </div>`;
      document.getElementById("resume-active").addEventListener("click", () => {
        if (active.mode === "practice") navigateTo("practice", { attemptId: active.id });
        else navigateTo("exam", { attemptId: active.id });
      });
      document.getElementById("abandon-active").addEventListener("click", async () => {
        try {
          await api.abandonExam(active.id);
          toast("Exam abandoned.", "success");
          mount();
        } catch (e) {
          toast("Failed to abandon: " + e, "error");
        }
      });
    }
  } catch (e) {
    // ignore — fresh install has no active exam
  }
}
