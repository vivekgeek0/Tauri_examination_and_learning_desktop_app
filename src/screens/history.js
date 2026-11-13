// ============================================================================
// history.js — list of completed attempts + performance statistics.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";

export function render() {
  return `
    <section class="panel">
      <h1>Performance Statistics</h1>
      <p class="panel-sub">Aggregated from all completed attempts.</p>
      <div id="perf-stats" class="stat-grid"></div>
    </section>

    <section class="panel">
      <h1>Exam History</h1>
      <p class="panel-sub">Click any row to open the full result and review answers.</p>
      <div id="history-table"></div>
    </section>
  `;
}

export async function mount() {
  try {
    const stats = await api.getPerformanceStatistics();
    renderStats(stats);
  } catch (e) {
    toast("Failed to load stats: " + e, "error");
  }
  try {
    const rows = await api.getExamHistory(200);
    renderTable(rows);
  } catch (e) {
    toast("Failed to load history: " + e, "error");
  }
}

function renderStats(s) {
  const el = document.getElementById("perf-stats");
  el.innerHTML = `
    <div class="stat-card"><div class="stat-value">${s.total_exams}</div><div class="stat-label">Exams Taken</div></div>
    <div class="stat-card"><div class="stat-value">${s.best_percentage.toFixed(1)}%</div><div class="stat-label">Best Score</div></div>
    <div class="stat-card"><div class="stat-value">${s.average_percentage.toFixed(1)}%</div><div class="stat-label">Average Score</div></div>
    <div class="stat-card"><div class="stat-value">${s.best_accuracy.toFixed(1)}%</div><div class="stat-label">Best Accuracy</div></div>
    <div class="stat-card"><div class="stat-value">${s.average_accuracy.toFixed(1)}%</div><div class="stat-label">Average Accuracy</div></div>
    <div class="stat-card"><div class="stat-value">${s.total_correct}/${s.total_questions_attempted}</div><div class="stat-label">Correct / Attempted</div></div>
  `;
}

function renderTable(rows) {
  const el = document.getElementById("history-table");
  if (rows.length === 0) {
    el.innerHTML =
      '<div class="empty-state"><div class="emoji">&#128218;</div>No completed exams yet. Start one from the dashboard!</div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table class="app-table">
        <thead>
          <tr>
            <th>#</th><th>Mode</th><th>Source</th><th>Started</th><th>Duration</th>
            <th>Questions</th><th>Correct</th><th>Wrong</th><th>Unanswered</th>
            <th>Score</th><th>Accuracy</th><th>%</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${r.id}</td>
              <td>${escapeHtml(r.mode)}</td>
              <td>${escapeHtml(r.source_label)}</td>
              <td>${escapeHtml(r.started_at)}</td>
              <td class="num">${formatDuration(r.duration_seconds)}</td>
              <td class="num">${r.total_questions}</td>
              <td class="num" style="color:#28a745">${r.correct_count}</td>
              <td class="num" style="color:#dc3545">${r.wrong_count}</td>
              <td class="num">${r.unanswered_count}</td>
              <td class="num">${r.obtained_marks.toFixed(2)} / ${r.total_marks.toFixed(2)}</td>
              <td class="num">${r.accuracy.toFixed(1)}%</td>
              <td class="num"><strong>${r.percentage.toFixed(1)}%</strong></td>
              <td><button class="btn-app secondary" data-open="${r.id}">Open</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  el.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-open"), 10);
      const { navigateTo } = await import("../navigation.js");
      navigateTo("results", { attemptId: id });
    });
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}
