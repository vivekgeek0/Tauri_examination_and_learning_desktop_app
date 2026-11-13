// ============================================================================
// import.js — CSV import preview + confirm flow. Reads the file via the
// Tauri dialog+fs plugins, sends the text to the Rust backend for parsing,
// then asks the user to confirm before writing to SQLite.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";

export function render() {
  return `
    <section class="panel">
      <h1>Import CSV</h1>
      <p class="panel-sub">
        Pick a CSV file with the header:
        <code>question, option_1, option_2, option_3, option_4, right_option, explanation</code>.
        The supplied sample uses pipe-delimited fields; both delimiters are auto-detected.
      </p>
      <div class="btn-row">
        <button class="btn-app primary" id="pick-csv">Pick CSV file…</button>
      </div>
      <div id="preview-area" style="margin-top: 18px;"></div>
    </section>

    <section class="panel">
      <h1>Imported sets</h1>
      <p class="panel-sub">Each CSV import is recorded as a set. Deleting a set does not delete the questions.</p>
      <div id="sets-area"></div>
    </section>
  `;
}

export async function mount() {
  document.getElementById("pick-csv").addEventListener("click", pickCsv);
  await loadSets();
}

async function pickCsv() {
  try {
    const result = await api.pickCsvFile();
    if (!result) return;
    const filename = result.path.split(/[\\/]/).pop();
    const preview = await api.previewCsvImport(result.content, filename);
    renderPreview(preview, result.content);
  } catch (e) {
    toast("Pick failed: " + e, "error");
  }
}

function renderPreview(p, content) {
  const area = document.getElementById("preview-area");
  area.innerHTML = `
    <div class="panel" style="border-color: var(--accent-blue);">
      <h1>Preview — ${escapeHtml(p.filename)}</h1>
      <p class="panel-sub">Delimiter: <code>${p.delimiter === "\t" ? "TAB" : p.delimiter}</code></p>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${p.total_records}</div><div class="stat-label">Total Records</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#28a745">${p.valid_records}</div><div class="stat-label">Valid</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#dc3545">${p.invalid_records}</div><div class="stat-label">Invalid</div></div>
      </div>
      ${p.errors.length ? `<h3 style="margin: 14px 0 6px;">First errors</h3><ul style="margin: 0 0 0 18px; color: var(--muted-text); font-size: 0.88rem;">${p.errors.slice(0, 10).map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
      ${p.first_valid.length ? `<h3 style="margin: 14px 0 6px;">First valid rows</h3><div class="table-wrap"><table class="app-table"><thead><tr><th>#</th><th>Question</th><th>Right option</th></tr></thead><tbody>${p.first_valid.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.question.slice(0, 80))}</td><td>${escapeHtml(r.right_option)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="form-row" style="margin-top: 14px;">
        <div class="form-field">
          <label for="skip-dup">Duplicate handling</label>
          <select id="skip-dup">
            <option value="true">Skip duplicates already in the bank</option>
            <option value="false">Import all (allow duplicates)</option>
          </select>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-app primary" id="confirm-import">Confirm import</button>
        <button class="btn-app secondary" id="cancel-import">Cancel</button>
      </div>
    </div>`;
  document.getElementById("cancel-import").addEventListener("click", () => {
    area.innerHTML = "";
  });
  document.getElementById("confirm-import").addEventListener("click", async () => {
    const skip = document.getElementById("skip-dup").value === "true";
    try {
      const out = await api.confirmCsvImport(content, p.filename, skip);
      toast(`Imported ${out.inserted} question(s), skipped ${out.skipped_duplicates} duplicate(s).`, "success");
      area.innerHTML = "";
      await loadSets();
    } catch (e) {
      toast("Import failed: " + e, "error");
    }
  });
}

async function loadSets() {
  const area = document.getElementById("sets-area");
  try {
    const sets = await api.getQuestionSets();
    if (sets.length === 0) {
      area.innerHTML = '<div class="empty-state"><div class="emoji">&#128193;</div>No sets imported yet.</div>';
      return;
    }
    area.innerHTML = `
      <div class="table-wrap">
        <table class="app-table">
          <thead><tr><th>ID</th><th>Set name</th><th>Questions</th><th>Imported at</th><th>Actions</th></tr></thead>
          <tbody>
            ${sets
              .map(
                (s) =>
                  `<tr><td>${s.id}</td><td>${escapeHtml(s.set_name)}</td><td class="num">${s.imported_question_count}</td><td>${escapeHtml(s.created_at)}</td><td><button class="btn-app primary" data-exam="${s.id}">Start Exam</button> <button class="btn-app success" data-practice="${s.id}">Practice</button> <button class="btn-app danger" data-del="${s.id}">Delete set</button></td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
    area.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-del"), 10);
        if (!confirm("Delete this set? The questions themselves stay in the bank.")) return;
        try {
          await api.deleteQuestionSet(id);
          toast("Set deleted.", "success");
          await loadSets();
        } catch (e) {
          toast("Delete failed: " + e, "error");
        }
      });
    });
    // Wire "Start Exam" buttons — starts a timed exam with only this set's questions.
    area.querySelectorAll("[data-exam]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-exam"), 10);
        try {
          const started = await api.startExamWithSet(id, "exam");
          toast(`Exam started with set #${id}.`, "success");
          const { navigateTo } = await import("../navigation.js");
          navigateTo("exam", { attemptId: started.attempt_id });
        } catch (e) {
          toast("Failed to start: " + e, "error");
        }
      });
    });
    // Wire "Practice" buttons — starts a practice session with this set's questions.
    area.querySelectorAll("[data-practice]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-practice"), 10);
        try {
          const started = await api.startExamWithSet(id, "practice");
          toast(`Practice started with set #${id}.`, "success");
          const { navigateTo } = await import("../navigation.js");
          navigateTo("practice", { attemptId: started.attempt_id });
        } catch (e) {
          toast("Failed to start: " + e, "error");
        }
      });
    });
  } catch (e) {
    area.innerHTML = `<div class="empty-state"><div class="emoji">&#9888;</div>Failed to load sets: ${e}</div>`;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
