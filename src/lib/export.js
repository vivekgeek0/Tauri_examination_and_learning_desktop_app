// ============================================================================
// export.js — utilities for exporting questions and results to CSV, PDF
// (via print) and DOC (HTML with .doc extension).
// ============================================================================

import { saveTextFile } from "./api.js";

// ---- CSV helpers ----

function csvEscape(value) {
  const s = String(value || "");
  if (s.includes("|") || s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/// Exports questions (objects with question, option_1..4, right_option, explanation)
/// as a pipe-delimited CSV matching the import format. Can be re-imported.
export async function exportQuestionsCSV(questions, filename = "questions_export.csv") {
  const header = "question | option_1 | option_2 | option_3 | option_4 | right_option | explanation";
  const lines = questions.map((q) =>
    [q.question, q.option_1, q.option_2, q.option_3, q.option_4, q.right_option, q.explanation || ""]
      .map(csvEscape)
      .join(" | ")
  );
  const csv = header + "\n" + lines.join("\n") + "\n";
  return saveTextFile(filename, csv);
}

/// Exports exam result review data as CSV: one row per question with
/// question text, selected answer, correct answer, is_correct, explanation.
export async function exportResultsCSV(reviewQuestions, result, filename = "exam_results.csv") {
  const header = "order | question | selected_answer | correct_answer | is_correct | explanation";
  const lines = reviewQuestions.map((r, i) => {
    const correct = r.is_correct ? "correct" : r.selected_answer ? "wrong" : "unanswered";
    return [
      r.question_order || i + 1,
      r.question,
      r.selected_answer || "(not answered)",
      r.right_option,
      correct,
      r.explanation || "",
    ].map(csvEscape).join(" | ");
  });
  let summary = "";
  if (result) {
    summary =
      "\n\n--- Summary ---\n" +
      "Total Questions | " + result.total_questions + "\n" +
      "Correct | " + result.correct_count + "\n" +
      "Wrong | " + result.wrong_count + "\n" +
      "Unanswered | " + result.unanswered_count + "\n" +
      "Marks Obtained | " + result.obtained_marks.toFixed(2) + "\n" +
      "Total Marks | " + result.total_marks.toFixed(2) + "\n" +
      "Accuracy | " + result.accuracy.toFixed(2) + "%\n" +
      "Percentage | " + result.percentage.toFixed(2) + "%\n" +
      "Duration | " + result.duration_seconds + "s\n";
  }
  const csv = header + "\n" + lines.join("\n") + summary + "\n";
  return saveTextFile(filename, csv);
}

// ---- PDF via print ----

/// Opens a hidden iframe with the HTML content and triggers the browser's
/// print dialog (which includes a "Save as PDF" option in Tauri's WebView2).
export function exportToPDF(title, bodyHtml) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.6; color: #1a202c; margin: 40px; }
  h1 { font-size: 22px; color: #1e3a5f; border-bottom: 2px solid #2a5f8f; padding-bottom: 6px; }
  h2 { font-size: 16px; color: #1e3a5f; margin-top: 24px; }
  .q-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 12px 0; page-break-inside: avoid; }
  .q-num { background: #1e3a5f; color: #fff; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .q-text { font-weight: 600; margin: 8px 0; }
  .opt { padding: 4px 0; padding-left: 12px; }
  .opt.correct { color: #155724; font-weight: 700; }
  .opt.correct::before { content: "\\2713 "; }
  .ans { background: #f0f7ff; border-left: 4px solid #2a7fbf; padding: 8px 12px; margin-top: 8px; border-radius: 4px; }
  .ans-label { font-weight: 700; color: #1e3a5f; }
  .meta { color: #64748b; font-size: 12px; margin: 4px 0; }
  @media print { body { margin: 15px; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body>
</html>`;

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for content to render, then print.
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 300);
}

/// Builds the HTML body for a list of questions (used by PDF export).
export function questionsToPDFBody(questions, title) {
  let body = "";
  questions.forEach((q, i) => {
    const opts = [q.option_1, q.option_2, q.option_3, q.option_4];
    const correctIdx = opts.findIndex(
      (o) => o.trim().toLowerCase() === (q.right_option || "").trim().toLowerCase()
    );
    body += `<div class="q-card">
      <span class="q-num">Q${i + 1}</span>
      <div class="q-text">${escapeHtml(q.question)}</div>`;
    opts.forEach((opt, idx) => {
      body += `<div class="opt${idx === correctIdx ? " correct" : ""}">(${String.fromCharCode(97 + idx)}) ${escapeHtml(opt)}</div>`;
    });
    body += `<div class="ans"><span class="ans-label">Correct Answer:</span> ${escapeHtml(q.right_option)}</div>`;
    if (q.explanation) {
      body += `<div class="ans"><span class="ans-label">Explanation:</span> ${escapeHtml(q.explanation)}</div>`;
    }
    if (q.last_wrong_answer) {
      body += `<div class="meta">Your last wrong answer: ${escapeHtml(q.last_wrong_answer)} | Wrong count: ${q.wrong_count || 1}</div>`;
    }
    body += `</div>`;
  });
  return body;
}

/// Builds the HTML body for a result review (used by PDF export of results).
export function reviewToPDFBody(reviewQuestions, result) {
  let body = "";
  if (result) {
    body += `<div class="meta">Score: ${result.obtained_marks.toFixed(2)} / ${result.total_marks.toFixed(2)} | Percentage: ${result.percentage.toFixed(1)}% | Accuracy: ${result.accuracy.toFixed(1)}% | Correct: ${result.correct_count} | Wrong: ${result.wrong_count} | Unanswered: ${result.unanswered_count}</div>`;
  }
  reviewQuestions.forEach((r, i) => {
    const opts = [r.option_1, r.option_2, r.option_3, r.option_4];
    const correctIdx = opts.findIndex(
      (o) => o.trim().toLowerCase() === (r.right_option || "").trim().toLowerCase()
    );
    const selectedIdx = r.selected_answer
      ? opts.findIndex(
          (o) => o.trim().toLowerCase() === r.selected_answer.trim().toLowerCase()
        )
      : -1;
    body += `<div class="q-card">
      <span class="q-num">Q${r.question_order || i + 1}</span>
      <div class="q-text">${escapeHtml(r.question)}</div>`;
    opts.forEach((opt, idx) => {
      let cls = "";
      if (idx === correctIdx) cls = " correct";
      if (idx === selectedIdx && idx !== correctIdx) cls = " wrong";
      body += `<div class="opt${cls}">(${String.fromCharCode(97 + idx)}) ${escapeHtml(opt)}`;
      if (idx === selectedIdx) body += " <em>(your answer)</em>";
      body += `</div>`;
    });
    if (r.selected_answer) {
      body += `<div class="meta">Your answer: ${escapeHtml(r.selected_answer)} | ${r.is_correct ? "Correct" : "Wrong"}</div>`;
    } else {
      body += `<div class="meta">Not answered</div>`;
    }
    body += `<div class="ans"><span class="ans-label">Explanation:</span> ${escapeHtml(r.explanation || "No explanation provided.")}</div>`;
    body += `</div>`;
  });
  return body;
}

// ---- DOC export (HTML saved as .doc — Word opens it) ----

export async function exportQuestionsDOC(questions, title, filename = "questions_export.doc") {
  const body = questionsToPDFBody(questions, title);
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Calibri', sans-serif; font-size: 12pt; }
  h1 { color: #1e3a5f; font-size: 18pt; }
  .q-card { border: 1px solid #ccc; padding: 8pt; margin: 8pt 0; }
  .q-num { font-weight: bold; color: #1e3a5f; }
  .opt { margin-left: 12pt; }
  .ans { background: #f0f7ff; padding: 6pt; margin-top: 6pt; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
  return saveTextFile(filename, html);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
