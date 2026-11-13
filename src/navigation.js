// ============================================================================
// navigation.js — minimal hash-less router. Each screen module exports a
// `render()` function that returns an HTML string and a `mount()` function
// that wires up event handlers after the HTML is in the DOM.
// ============================================================================

import * as dashboardScreen from "./screens/dashboard.js";
import * as questionBankScreen from "./screens/question-bank.js";
import * as importScreen from "./screens/import.js";
import * as settingsScreen from "./screens/settings.js";
import * as practiceScreen from "./screens/practice.js";
import * as examScreen from "./screens/exam.js";
import * as resultsScreen from "./screens/results.js";
import * as historyScreen from "./screens/history.js";
import * as wrongScreen from "./screens/wrong.js";
import * as tempTestScreen from "./screens/temp-test.js";

const SCREENS = {
  dashboard: { ...dashboardScreen, label: "Dashboard" },
  "question-bank": { ...questionBankScreen, label: "Question Bank" },
  import: { ...importScreen, label: "Import CSV" },
  settings: { ...settingsScreen, label: "Exam Settings" },
  practice: { ...practiceScreen, label: "Practice" },
  exam: { ...examScreen, label: "Exam" },
  results: { ...resultsScreen, label: "Results" },
  history: { ...historyScreen, label: "History" },
  wrong: { ...wrongScreen, label: "Wrong Answered" },
  "temp-test": { ...tempTestScreen, label: "Temp Test" },
};

let currentScreen = null;

export function initNavigation() {
  const root = document.getElementById("app-root");
  if (!root) {
    console.error("app-root not found");
    return;
  }
  // The router is controlled programmatically; we don't use the URL bar.
}

export function navigateTo(name, params = {}) {
  const screen = SCREENS[name];
  if (!screen) {
    console.error("unknown screen:", name);
    return;
  }
  currentScreen = name;
  const root = document.getElementById("app-root");
  root.innerHTML = appBarHtml(name) + `<main class="page">${screen.render(params)}</main>`;
  wireAppBar(name);
  screen.mount(params);
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function currentScreenName() {
  return currentScreen;
}

function appBarHtml(active) {
  const items = [
    { id: "dashboard", label: "Home" },
    { id: "question-bank", label: "Bank" },
    { id: "import", label: "Import" },
    { id: "wrong", label: "Wrong" },
    { id: "temp-test", label: "Temp Test" },
    { id: "settings", label: "Settings" },
    { id: "history", label: "History" },
  ];
  const buttons = items
    .map(
      (it) =>
        `<button data-nav="${it.id}" class="${it.id === active ? "active" : ""}">${it.label}</button>`
    )
    .join("");
  return `
    <header class="app-bar" role="banner">
      <div class="brand" data-nav="dashboard">ExamPracticeStudio</div>
      <nav>${buttons}</nav>
      <div class="app-bar-right">
        <button class="btn-app primary" data-action="start-exam">Start Exam</button>
      </div>
    </header>`;
}

function wireAppBar(active) {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = el.getAttribute("data-nav");
      navigateTo(target);
    });
  });
  const startBtn = document.querySelector('[data-action="start-exam"]');
  if (startBtn) {
    startBtn.addEventListener("click", () => navigateTo("exam", { fresh: true }));
  }
}
