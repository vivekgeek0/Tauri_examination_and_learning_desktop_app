// ============================================================================
// api.js — Tauri command wrappers. Every backend call goes through here so
// the screens don't depend on @tauri-apps/api directly.
// ============================================================================

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export async function getDashboardStatistics() {
  return invoke("get_dashboard_statistics");
}

export async function previewCsvImport(content, filename) {
  return invoke("preview_csv_import", { content, filename });
}

export async function confirmCsvImport(content, filename, skipDuplicates) {
  return invoke("confirm_csv_import", { content, filename, skipDuplicates });
}

export async function getQuestionSets() {
  return invoke("get_question_sets");
}

export async function deleteQuestionSet(setId) {
  return invoke("delete_question_set", { setId });
}

export async function getQuestionCount() {
  return invoke("get_question_count");
}

export async function getQuestionsPaginated(page, pageSize) {
  return invoke("get_questions_paginated", { page, pageSize });
}

export async function searchQuestions(needle, page, pageSize) {
  return invoke("search_questions", { needle, page, pageSize });
}

export async function getQuestionById(id) {
  return invoke("get_question_by_id", { id });
}

export async function updateQuestion(question) {
  return invoke("update_question", { question });
}

export async function deleteQuestion(id) {
  return invoke("delete_question", { id });
}

export async function getExamSetting() {
  return invoke("get_exam_setting");
}

export async function saveExamSetting(key, value) {
  return invoke("save_exam_setting", { key, value });
}

export async function saveExamSettingsBulk(settings) {
  return invoke("save_exam_settings_bulk", { settings });
}

export async function startExam(mode) {
  return invoke("start_exam", { mode });
}

export async function startCustomExam(questionIds, mode) {
  return invoke("start_custom_exam", { questionIds, mode });
}

export async function startExamWithSet(setId, mode) {
  return invoke("start_exam_with_set", { setId, mode });
}

export async function parseCsvFull(content) {
  return invoke("parse_csv_full", { content });
}

export async function getWrongAnsweredQuestions() {
  return invoke("get_wrong_answered_questions");
}

export async function getExamQuestions(attemptId) {
  return invoke("get_exam_questions", { attemptId });
}

export async function saveExamAnswer(attemptId, questionId, selectedOptionText) {
  return invoke("save_exam_answer", { attemptId, questionId, selectedOptionText });
}

export async function clearExamAnswer(attemptId, questionId) {
  return invoke("clear_exam_answer", { attemptId, questionId });
}

export async function markQuestionForReview(attemptId, questionId, marked) {
  return invoke("mark_question_for_review", { attemptId, questionId, marked });
}

export async function getActiveExam() {
  return invoke("get_active_exam");
}

export async function submitExam(attemptId) {
  return invoke("submit_exam", { attemptId });
}

export async function abandonExam(attemptId) {
  return invoke("abandon_exam", { attemptId });
}

export async function getExamResult(attemptId) {
  return invoke("get_exam_result", { attemptId });
}

export async function getExamHistory(limit) {
  return invoke("get_exam_history", { limit });
}

export async function getExamReview(attemptId) {
  return invoke("get_exam_review", { attemptId });
}

export async function getPerformanceStatistics() {
  return invoke("get_performance_statistics");
}

// ---- File helpers (dialog + fs plugins) ----

export async function pickCsvFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "CSV / Text", extensions: ["csv", "txt", "tsv"] }],
  });
  if (!selected) return null;
  return { path: selected, content: await readTextFile(selected) };
}

/// Shows a save dialog and writes text content to the chosen path.
/// Returns the path if saved, or null if the user cancelled.
export async function saveTextFile(defaultName, content) {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "All files", extensions: ["*"] }],
  });
  if (!path) return null;
  await writeTextFile(path, content);
  return path;
}
