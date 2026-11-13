// ============================================================================
// wrong.js — "Wrong Answered" screen. Shows every question the user has ever
// answered wrong across all completed exams, with options, correct answer and
// explanation. Supports selecting questions and exporting to CSV, PDF (print)
// or DOC.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";
import { createQuestionCard, renderMathIn, normalizeQuestion } from "../lib/question-card.js";
import { exportQuestionsCSV, exportQuestionsDOC, exportToPDF, questionsToPDFBody } from "../lib/export.js";

let allWrong = [];
let selectedIds = new Set();
let viewMode = "card";

export function render() {
  return `
    <section class="panel">
      <h1>Wrong Answered Questions</h1>
      <p class="panel-sub" id="wrong-count">Loading…</p>
      <div class="form-row">
        <div class="form-field">
          <label for="wrong-search">Filter by keyword</label>
          <input id="wrong-search" type="text" placeholder="Filter questions…" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-app secondary" id="wrong-toggle-view">Switch to Table View</button>
        <button class="btn-app secondary" id="wrong-select-all">Select All</button>
        <button class="btn-app secondary" id="wrong-clear-sel">Clear Selection</button>
        <span id="wrong-sel-count" style="align-self: center; font-weight: 600; color: var(--muted-text);">0 selected</span>
      </div>
      <div class="btn-row" id="wrong-export-row" style="display: none;">
        <button class="btn-app primary" id="wrong-export-csv">Export Selected as CSV</button>
        <button class="btn-app primary" id="wrong-export-pdf">Export Selected as PDF</button>
        <button class="btn-app primary" id="wrong-export-doc">Export Selected as DOC</button>
        <button class="btn-app secondary" id="wrong-export-all-csv">Export ALL as CSV</button>
        <button class="btn-app secondary" id="wrong-export-all-pdf">Export ALL as PDF</button>
      </div>
    </section>

    <section id="wrong-list"></section>
  `;
}

export async function mount() {
  document.getElementById("wrong-search").addEventListener("input", applyFilter);
  document.getElementById("wrong-toggle-view").addEventListener("click", () => {
    viewMode = viewMode === "card" ? "table" : "card";
    document.getElementById("wrong-toggle-view").textContent =
      viewMode === "card" ? "Switch to Table View" : "Switch to Card View";
    renderList();
  });
  document.getElementById("wrong-select-all").addEventListener("click", () => {
    allWrong.forEach((q) => selectedIds.add(q.id));
    renderList();
    updateSelectionBar();
  });
  document.getElementById("wrong-clear-sel").addEventListener("click", () => {
    selectedIds.clear();
    renderList();
    updateSelectionBar();
  });

  // Export buttons
  document.getElementById("wrong-export-csv").addEventListener("click", () => doExport("csv", true));
  document.getElementById("wrong-export-pdf").addEventListener("click", () => doExport("pdf", true));
  document.getElementById("wrong-export-doc").addEventListener("click", () => doExport("doc", true));
  document.getElementById("wrong-export-all-csv").addEventListener("click", () => doExport("csv", false));
  document.getElementById("wrong-export-all-pdf").addEventListener("click", () => doExport("pdf", false));

  try {
    allWrong = await api.getWrongAnsweredQuestions();
    document.getElementById("wrong-count").textContent =
      `${allWrong.length} question${allWrong.length === 1 ? "" : "s"} you have answered wrong at least once.`;
    renderList();
  } catch (e) {
    document.getElementById("wrong-list").innerHTML =
      `<div class="empty-state"><div class="emoji">&#9888;</div>Failed to load: ${e}</div>`;
  }
}

function getFiltered() {
  const needle = (document.getElementById("wrong-search")?.value || "").toLowerCase().trim();
  if (!needle) return allWrong;
  return allWrong.filter((q) => {
    return (
      q.question.toLowerCase().includes(needle) ||
      q.option_1.toLowerCase().includes(needle) ||
      q.option_2.toLowerCase().includes(needle) ||
      q.option_3.toLowerCase().includes(needle) ||
      q.option_4.toLowerCase().includes(needle) ||
      q.right_option.toLowerCase().includes(needle) ||
      (q.explanation || "").toLowerCase().includes(needle)
    );
  });
}

function applyFilter() {
  renderList();
}

function renderList() {
  const list = document.getElementById("wrong-list");
  const filtered = getFiltered();

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="empty-state"><div class="emoji">&#127881;</div>No wrong-answered questions found. Either you have not taken any exams yet, or you answered everything correctly!</div>';
    return;
  }

  if (viewMode === "table") {
    renderTable(filtered, list);
  } else {
    renderCards(filtered, list);
  }
  updateSelectionBar();
}

function renderCards(filtered, list) {
  list.innerHTML = "";
  const wrap = document.createElement("div");
  filtered.forEach((row, idx) => {
    const q = normalizeQuestion({
      id: row.id,
      question: row.question,
      option_1: row.option_1,
      option_2: row.option_2,
      option_3: row.option_3,
      option_4: row.option_4,
      right_option: row.right_option,
      explanation: row.explanation,
    });
    q.index = idx + 1;
    const card = createQuestionCard(q, { interactive: false });
    // Force-show the answer block so the explanation is always visible.
    card.querySelector(".answer-block").classList.add("show");

    // Add wrong-answer meta banner + selection checkbox.
    const banner = document.createElement("div");
    banner.className = "review-banner";
    banner.innerHTML =
      `<strong>Wrong ${row.wrong_count} time${row.wrong_count === 1 ? "" : "s"}</strong>` +
      (row.last_wrong_answer ? ` &nbsp;•&nbsp; Last wrong answer: ${escapeHtml(row.last_wrong_answer)}` : "");
    card.insertBefore(banner, card.firstChild);

    const footer = document.createElement("div");
    footer.className = "btn-row";
    footer.style.marginTop = "14px";
    footer.innerHTML =
      `<label class="checkbox-row"><input type="checkbox" data-sel="${row.id}" ${selectedIds.has(row.id) ? "checked" : ""} /> Select for export</label>`;
    footer.querySelector('[data-sel]').addEventListener("change", (e) => {
      const id = parseInt(e.target.getAttribute("data-sel"), 10);
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectionBar();
    });
    card.appendChild(footer);
    wrap.appendChild(card);
  });
  list.appendChild(wrap);
  renderMathIn(list);
}

function renderTable(filtered, list) {
  list.innerHTML = `
    <div class="table-wrap">
      <table class="app-table">
        <thead>
          <tr>
            <th style="width: 40px;"><input type="checkbox" id="wrong-toggle-page" /></th>
            <th style="width: 50px;">ID</th>
            <th style="width: 60px;">Wrong</th>
            <th>Question</th>
            <th>Right Option</th>
            <th>Last Wrong Answer</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (q) => `
            <tr>
              <td><input type="checkbox" class="wrong-row-sel" data-sel="${q.id}" ${selectedIds.has(q.id) ? "checked" : ""} /></td>
              <td class="num">${q.id}</td>
              <td class="num">${q.wrong_count}</td>
              <td class="wrap">${escapeHtml(q.question.slice(0, 80))}${q.question.length > 80 ? "…" : ""}</td>
              <td>${escapeHtml(q.right_option)}</td>
              <td class="wrap">${escapeHtml(q.last_wrong_answer || "—")}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  list.querySelectorAll(".wrong-row-sel").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = parseInt(e.target.getAttribute("data-sel"), 10);
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectionBar();
    });
  });
  const togglePage = document.getElementById("wrong-toggle-page");
  if (togglePage) {
    togglePage.addEventListener("change", (e) => {
      filtered.forEach((q) => {
        if (e.target.checked) selectedIds.add(q.id);
        else selectedIds.delete(q.id);
      });
      renderList();
      updateSelectionBar();
    });
  }
}

function updateSelectionBar() {
  const count = document.getElementById("wrong-sel-count");
  const exportRow = document.getElementById("wrong-export-row");
  count.textContent = `${selectedIds.size} selected`;
  exportRow.style.display = selectedIds.size > 0 ? "" : "none";
}

async function doExport(format, selectedOnly) {
  const source = selectedOnly
    ? allWrong.filter((q) => selectedIds.has(q.id))
    : allWrong;
  if (source.length === 0) {
    toast("No questions to export.", "error");
    return;
  }
  try {
    if (format === "csv") {
      const path = await exportQuestionsCSV(source, `wrong_answered_${Date.now()}.csv`);
      if (path) toast(`Exported ${source.length} questions to ${path}`, "success");
    } else if (format === "pdf") {
      const body = questionsToPDFBody(source, "Wrong Answered Questions");
      exportToPDF("Wrong Answered Questions", body);
      toast("Print dialog opened — use 'Save as PDF'.", "success");
    } else if (format === "doc") {
      const path = await exportQuestionsDOC(source, "Wrong Answered Questions", `wrong_answered_${Date.now()}.doc`);
      if (path) toast(`Exported ${source.length} questions to ${path}`, "success");
    }
  } catch (e) {
    toast("Export failed: " + e, "error");
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
