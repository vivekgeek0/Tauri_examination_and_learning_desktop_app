// ============================================================================
// question-bank.js — paginated, searchable question listing with edit/delete,
// a card/table view toggle, and the ability to select specific questions to
// start a custom exam.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";
import { createQuestionCard, renderMathIn, normalizeQuestion } from "../lib/question-card.js";

const PAGE_SIZE = 20;
let currentPage = 1;
let currentNeedle = "";
let totalPages = 1;
let totalCount = 0;
let viewMode = "card"; // "card" | "table"
let selectedIds = new Set();

export function render() {
  return `
    <section class="panel">
      <h1>Question Bank</h1>
      <p class="panel-sub" id="qb-count">Loading…</p>
      <div class="form-row">
        <div class="form-field">
          <label for="qb-search">Search question text, options or explanation</label>
          <input id="qb-search" type="text" placeholder="e.g. boolean, sql, html…" />
          <span class="hint">Press Enter to search. Empty query lists all.</span>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-app primary" id="qb-search-btn">Search</button>
        <button class="btn-app secondary" id="qb-clear-btn">Clear</button>
        <button class="btn-app secondary" id="qb-toggle-view">Switch to Table View</button>
        <button class="btn-app success" id="qb-import-btn">Import CSV</button>
      </div>
      <div id="qb-selection-bar" class="btn-row" style="margin-top: 12px; display: none;">
        <button class="btn-app secondary" id="qb-select-all">Select All (Current Page)</button>
        <button class="btn-app secondary" id="qb-clear-sel">Clear Selection</button>
        <span id="qb-sel-count" style="align-self: center; font-weight: 600; color: var(--muted-text);">0 selected</span>
        <button class="btn-app primary" id="qb-start-exam-selected">Start Exam with Selected</button>
        <button class="btn-app success" id="qb-start-practice-selected">Practice with Selected</button>
      </div>
    </section>

    <section id="qb-list"></section>

    <div class="pagination" id="qb-pagination"></div>

    <div id="qb-editor"></div>
  `;
}

export async function mount() {
  document.getElementById("qb-search-btn").addEventListener("click", () => {
    currentNeedle = document.getElementById("qb-search").value.trim();
    currentPage = 1;
    loadPage();
  });
  document.getElementById("qb-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("qb-search-btn").click();
  });
  document.getElementById("qb-clear-btn").addEventListener("click", () => {
    document.getElementById("qb-search").value = "";
    currentNeedle = "";
    currentPage = 1;
    loadPage();
  });
  document.getElementById("qb-toggle-view").addEventListener("click", () => {
    viewMode = viewMode === "card" ? "table" : "card";
    document.getElementById("qb-toggle-view").textContent =
      viewMode === "card" ? "Switch to Table View" : "Switch to Card View";
    loadPage();
  });
  document.getElementById("qb-import-btn").addEventListener("click", () => {
    import("../navigation.js").then((m) => m.navigateTo("import"));
  });
  document.getElementById("qb-select-all").addEventListener("click", selectAllOnPage);
  document.getElementById("qb-clear-sel").addEventListener("click", () => {
    selectedIds.clear();
    updateSelectionBar();
    refreshCheckboxes();
  });
  document.getElementById("qb-start-exam-selected").addEventListener("click", () => startWithSelected("exam"));
  document.getElementById("qb-start-practice-selected").addEventListener("click", () => startWithSelected("practice"));
  await loadPage();
}

async function loadPage() {
  const list = document.getElementById("qb-list");
  list.innerHTML = '<div class="empty-state"><div class="emoji">&#8987;</div>Loading questions…</div>';
  try {
    let rows;
    if (currentNeedle) {
      const [r, total] = await api.searchQuestions(currentNeedle, currentPage, PAGE_SIZE);
      rows = r;
      totalCount = total;
    } else {
      rows = await api.getQuestionsPaginated(currentPage, PAGE_SIZE);
      totalCount = await api.getQuestionCount();
    }
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    document.getElementById("qb-count").textContent =
      (currentNeedle ? `Search "${currentNeedle}" — ` : "") +
      `${totalCount} question${totalCount === 1 ? "" : "s"} • page ${currentPage}/${totalPages}`;

    if (rows.length === 0) {
      list.innerHTML =
        '<div class="empty-state"><div class="emoji">&#128193;</div>No questions yet. Click <strong>Import CSV</strong> to load some.</div>';
      renderPagination();
      return;
    }

    if (viewMode === "table") {
      await renderTable(rows, list);
    } else {
      await renderCards(rows, list);
    }
    updateSelectionBar();
    renderPagination();
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">&#9888;</div>Failed to load: ${e}</div>`;
  }
}

async function renderCards(rows, list) {
  list.innerHTML = "";
  const wrap = document.createElement("div");
  for (const r of rows) {
    const full = await api.getQuestionById(r.id);
    if (!full) continue;
    const q = normalizeQuestion(full);
    const card = createQuestionCard(q, { interactive: false });
    // Reveal the answer block by default in the bank.
    card.querySelector(".answer-block").classList.add("show");

    // Add a footer with checkbox + edit/delete.
    const footer = document.createElement("div");
    footer.className = "btn-row";
    footer.style.marginTop = "14px";
    footer.innerHTML =
      `<label class="checkbox-row"><input type="checkbox" data-sel="${r.id}" ${selectedIds.has(r.id) ? "checked" : ""} /> Select for exam</label>` +
      `<button class="btn-app secondary" data-edit="${r.id}">Edit</button>` +
      `<button class="btn-app danger" data-del="${r.id}">Delete</button>`;
    footer.querySelector('[data-sel]').addEventListener("change", (e) => {
      const id = parseInt(e.target.getAttribute("data-sel"), 10);
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectionBar();
    });
    footer.querySelector('[data-edit]').addEventListener("click", () => openEditor(r.id));
    footer.querySelector('[data-del]').addEventListener("click", async () => {
      if (!confirm("Delete this question? This cannot be undone.")) return;
      try {
        await api.deleteQuestion(r.id);
        toast("Question deleted.", "success");
        loadPage();
      } catch (e) {
        toast("Delete failed: " + e, "error");
      }
    });
    card.appendChild(footer);
    wrap.appendChild(card);
  }
  list.appendChild(wrap);
  renderMathIn(list);
}

async function renderTable(rows, list) {
  // Fetch full data for all rows on this page.
  const fullRows = [];
  for (const r of rows) {
    const full = await api.getQuestionById(r.id);
    if (full) fullRows.push(full);
  }

  list.innerHTML = `
    <div class="table-wrap">
      <table class="app-table" id="qb-table">
        <thead>
          <tr>
            <th style="width: 40px;"><input type="checkbox" id="qb-toggle-page" /></th>
            <th style="width: 50px;">ID</th>
            <th>Question</th>
            <th>Right Option</th>
            <th>Explanation</th>
            <th style="width: 120px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${fullRows
            .map(
              (q) => `
            <tr data-qid="${q.id}">
              <td><input type="checkbox" class="qb-row-sel" data-sel="${q.id}" ${selectedIds.has(q.id) ? "checked" : ""} /></td>
              <td class="num">${q.id}</td>
              <td class="wrap">${escapeHtml(q.question.slice(0, 100))}${q.question.length > 100 ? "…" : ""}</td>
              <td>${escapeHtml(q.right_option)}</td>
              <td class="wrap">${escapeHtml((q.explanation || "").slice(0, 120))}${(q.explanation || "").length > 120 ? "…" : ""}</td>
              <td>
                <button class="btn-app secondary" data-edit="${q.id}">Edit</button>
                <button class="btn-app danger" data-del="${q.id}">Del</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  // Wire row checkboxes.
  list.querySelectorAll(".qb-row-sel").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = parseInt(e.target.getAttribute("data-sel"), 10);
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectionBar();
    });
  });
  // Toggle all on page.
  const togglePage = document.getElementById("qb-toggle-page");
  if (togglePage) {
    togglePage.checked = [...fullRows.map((r) => r.id)].every((id) => selectedIds.has(id));
    togglePage.addEventListener("change", (e) => {
      fullRows.forEach((r) => {
        if (e.target.checked) selectedIds.add(r.id);
        else selectedIds.delete(r.id);
      });
      refreshCheckboxes();
      updateSelectionBar();
    });
  }
  // Edit/delete in table.
  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEditor(parseInt(btn.getAttribute("data-edit"), 10)));
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-del"), 10);
      if (!confirm("Delete this question? This cannot be undone.")) return;
      try {
        await api.deleteQuestion(id);
        toast("Question deleted.", "success");
        loadPage();
      } catch (e) {
        toast("Delete failed: " + e, "error");
      }
    });
  });
}

function selectAllOnPage() {
  // Select all rows currently visible.
  document.querySelectorAll("[data-sel]").forEach((cb) => {
    const id = parseInt(cb.getAttribute("data-sel"), 10);
    selectedIds.add(id);
    cb.checked = true;
  });
  updateSelectionBar();
}

function refreshCheckboxes() {
  document.querySelectorAll("[data-sel]").forEach((cb) => {
    const id = parseInt(cb.getAttribute("data-sel"), 10);
    cb.checked = selectedIds.has(id);
  });
}

function updateSelectionBar() {
  const bar = document.getElementById("qb-selection-bar");
  const count = document.getElementById("qb-sel-count");
  if (selectedIds.size > 0) {
    bar.style.display = "";
    count.textContent = `${selectedIds.size} selected`;
  } else {
    bar.style.display = "none";
  }
}

async function startWithSelected(mode) {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) {
    toast("Select at least one question first.", "error");
    return;
  }
  try {
    const started = await api.startCustomExam(ids, mode);
    toast(`Started ${mode} with ${ids.length} question(s).`, "success");
    const { navigateTo } = await import("../navigation.js");
    navigateTo(mode, { attemptId: started.attempt_id });
  } catch (e) {
    toast("Failed to start: " + e, "error");
  }
}

function renderPagination() {
  const el = document.getElementById("qb-pagination");
  if (totalPages <= 1) {
    el.innerHTML = "";
    return;
  }
  const parts = [];
  parts.push(`<button class="btn-app secondary" data-pg="prev" ${currentPage === 1 ? "disabled" : ""}>Prev</button>`);
  parts.push(`<span>Page ${currentPage} / ${totalPages}</span>`);
  parts.push(`<button class="btn-app secondary" data-pg="next" ${currentPage === totalPages ? "disabled" : ""}>Next</button>`);
  el.innerHTML = parts.join("");
  el.querySelector('[data-pg="prev"]')?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; loadPage(); }
  });
  el.querySelector('[data-pg="next"]')?.addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; loadPage(); }
  });
}

async function openEditor(id) {
  const editor = document.getElementById("qb-editor");
  try {
    const q = await api.getQuestionById(id);
    if (!q) return;
    editor.innerHTML = `
      <div class="panel" style="border-color: var(--accent-blue);">
        <h1>Edit question #${q.id}</h1>
        <div class="form-field" style="margin-bottom: 10px;">
          <label>Question</label>
          <textarea id="ed-q" rows="3">${escapeAttr(q.question)}</textarea>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Option 1</label><input id="ed-o1" value="${escapeAttr(q.option_1)}" /></div>
          <div class="form-field"><label>Option 2</label><input id="ed-o2" value="${escapeAttr(q.option_2)}" /></div>
          <div class="form-field"><label>Option 3</label><input id="ed-o3" value="${escapeAttr(q.option_3)}" /></div>
          <div class="form-field"><label>Option 4</label><input id="ed-o4" value="${escapeAttr(q.option_4)}" /></div>
        </div>
        <div class="form-field" style="margin-bottom: 10px;">
          <label>Right option (must match one of the four option texts)</label>
          <input id="ed-right" value="${escapeAttr(q.right_option)}" />
        </div>
        <div class="form-field" style="margin-bottom: 10px;">
          <label>Explanation</label>
          <textarea id="ed-expl" rows="6">${escapeAttr(q.explanation)}</textarea>
        </div>
        <div class="btn-row">
          <button class="btn-app primary" id="ed-save">Save changes</button>
          <button class="btn-app secondary" id="ed-cancel">Cancel</button>
        </div>
      </div>`;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("ed-cancel").addEventListener("click", () => {
      editor.innerHTML = "";
    });
    document.getElementById("ed-save").addEventListener("click", async () => {
      const updated = {
        id: q.id,
        question: document.getElementById("ed-q").value,
        option_1: document.getElementById("ed-o1").value,
        option_2: document.getElementById("ed-o2").value,
        option_3: document.getElementById("ed-o3").value,
        option_4: document.getElementById("ed-o4").value,
        right_option: document.getElementById("ed-right").value,
        explanation: document.getElementById("ed-expl").value,
      };
      try {
        await api.updateQuestion(updated);
        toast("Saved.", "success");
        editor.innerHTML = "";
        loadPage();
      } catch (e) {
        toast("Save failed: " + e, "error");
      }
    });
  } catch (e) {
    toast("Open editor failed: " + e, "error");
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
