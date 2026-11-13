// ============================================================================
// settings.js — exam configuration. Saves to SQLite via the backend.
// ============================================================================

import * as api from "../lib/api.js";
import { toast } from "../lib/controls.js";

let availableSets = [];

export function render() {
  return `
    <section class="panel">
      <h1>Exam Settings</h1>
      <p class="panel-sub">Saved in SQLite. Reused by every exam and practice session.</p>

      <div class="form-row">
        <div class="form-field">
          <label for="s-num">Number of questions</label>
          <input id="s-num" type="number" min="1" step="1" />
          <span class="hint">Random unique questions are drawn for each attempt.</span>
        </div>
        <div class="form-field">
          <label for="s-dur">Duration (minutes)</label>
          <input id="s-dur" type="number" min="0" step="1" />
          <span class="hint">0 = untimed (practice-style).</span>
        </div>
        <div class="form-field">
          <label for="s-default-mode">Default mode</label>
          <select id="s-default-mode">
            <option value="exam">Exam (timed, no immediate feedback)</option>
            <option value="practice">Practice (instant feedback)</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="s-correct">Marks per correct answer</label>
          <input id="s-correct" type="number" step="0.25" />
        </div>
        <div class="form-field">
          <label for="s-negative">Negative marks per wrong answer</label>
          <input id="s-negative" type="number" step="0.05" />
          <span class="hint">Use a positive number; it is subtracted automatically.</span>
        </div>
        <div class="form-field">
          <label for="s-unanswered">Marks per unanswered question</label>
          <input id="s-unanswered" type="number" step="0.05" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="s-source">Question source</label>
          <select id="s-source">
            <option value="all">Entire question bank</option>
            <option value="sets">Specific imported sets</option>
          </select>
        </div>
        <div class="form-field">
          <label for="s-repeat">Question repetition</label>
          <select id="s-repeat">
            <option value="allow">Allow previously attempted questions</option>
            <option value="exclude">Exclude previously attempted questions</option>
          </select>
        </div>
      </div>

      <div class="form-field" id="sets-picker-wrap" style="display:none; margin-bottom: 10px;">
        <label>Imported sets</label>
        <div id="sets-picker"></div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="checkbox-row"><input id="s-randq" type="checkbox" /> Randomise question order</label>
        </div>
        <div class="form-field">
          <label class="checkbox-row"><input id="s-rando" type="checkbox" /> Randomise option order within each question</label>
          <span class="hint">Option shuffling happens in the frontend when rendering each card.</span>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-app primary" id="s-save">Save settings</button>
        <button class="btn-app secondary" id="s-reset">Reset to defaults</button>
      </div>
    </section>
  `;
}

export async function mount() {
  // Load available sets so the picker can render.
  try {
    availableSets = await api.getQuestionSets();
  } catch (e) {
    availableSets = [];
  }

  // Load current settings.
  let s;
  try {
    s = await api.getExamSetting();
  } catch (e) {
    toast("Failed to load settings: " + e, "error");
    return;
  }

  document.getElementById("s-num").value = s.num_questions;
  document.getElementById("s-dur").value = s.duration_minutes;
  document.getElementById("s-correct").value = s.marks_per_correct;
  document.getElementById("s-negative").value = s.negative_marks_per_wrong;
  document.getElementById("s-unanswered").value = s.marks_per_unanswered;
  document.getElementById("s-default-mode").value = s.default_mode;
  document.getElementById("s-source").value = s.source_mode;
  document.getElementById("s-repeat").value = s.repeat_policy;
  document.getElementById("s-randq").checked = !!s.random_questions;
  document.getElementById("s-rando").checked = !!s.random_options;

  renderSetsPicker(s.selected_set_ids || []);

  document.getElementById("s-source").addEventListener("change", (e) => {
    document.getElementById("sets-picker-wrap").style.display =
      e.target.value === "sets" ? "" : "none";
  });
  if (s.source_mode === "sets") {
    document.getElementById("sets-picker-wrap").style.display = "";
  }

  document.getElementById("s-save").addEventListener("click", save);
  document.getElementById("s-reset").addEventListener("click", () => {
    if (!confirm("Reset all settings to defaults?")) return;
    document.getElementById("s-num").value = 80;
    document.getElementById("s-dur").value = 60;
    document.getElementById("s-correct").value = 1;
    document.getElementById("s-negative").value = 0.25;
    document.getElementById("s-unanswered").value = 0;
    document.getElementById("s-default-mode").value = "exam";
    document.getElementById("s-source").value = "all";
    document.getElementById("s-repeat").value = "allow";
    document.getElementById("s-randq").checked = true;
    document.getElementById("s-rando").checked = false;
    renderSetsPicker([]);
  });
}

function renderSetsPicker(selected) {
  const wrap = document.getElementById("sets-picker");
  if (availableSets.length === 0) {
    wrap.innerHTML =
      '<div class="empty-state" style="padding: 14px;">No sets imported yet. Import a CSV first.</div>';
    return;
  }
  wrap.innerHTML = availableSets
    .map(
      (s) =>
        `<label class="checkbox-row"><input type="checkbox" value="${s.id}" ${
          selected.includes(s.id) ? "checked" : ""
        } /> ${escapeHtml(s.set_name)} — ${s.imported_question_count} questions</label>`
    )
    .join("<br/>");
}

async function save() {
  const selected = Array.from(
    document.querySelectorAll('#sets-picker input[type="checkbox"]:checked')
  ).map((el) => parseInt(el.value, 10));

  const settings = {
    num_questions: parseInt(document.getElementById("s-num").value, 10) || 0,
    duration_minutes: parseInt(document.getElementById("s-dur").value, 10) || 0,
    marks_per_correct: parseFloat(document.getElementById("s-correct").value) || 0,
    negative_marks_per_wrong: parseFloat(document.getElementById("s-negative").value) || 0,
    marks_per_unanswered: parseFloat(document.getElementById("s-unanswered").value) || 0,
    random_questions: document.getElementById("s-randq").checked,
    random_options: document.getElementById("s-rando").checked,
    source_mode: document.getElementById("s-source").value,
    selected_set_ids: selected,
    default_mode: document.getElementById("s-default-mode").value,
    repeat_policy: document.getElementById("s-repeat").value,
  };
  if (settings.num_questions <= 0) {
    toast("Number of questions must be greater than zero.", "error");
    return;
  }
  if (settings.duration_minutes < 0) {
    toast("Duration cannot be negative.", "error");
    return;
  }
  try {
    await api.saveExamSettingsBulk(settings);
    toast("Settings saved.", "success");
  } catch (e) {
    toast("Save failed: " + e, "error");
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
