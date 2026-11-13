// ============================================================================
// main.js — application entry. Boots the navigation system, wires global
// floating controls (dark mode, back-to-top), and renders the initial screen.
//
// KaTeX is imported here (not loaded from a CDN) so Vite bundles the CSS, the
// JS and the auto-render extension locally. The app stays fully offline.
// ============================================================================

// KaTeX CSS — Vite extracts this into a single stylesheet at build time.
import "katex/dist/katex.min.css";

// KaTeX JS + auto-render. We attach renderMathInElement to window so the
// question-card module (which mirrors the original standalone HTML) can keep
// calling window.renderMathInElement exactly as before.
import renderMathInElement from "katex/contrib/auto-render";
window.renderMathInElement = renderMathInElement;

import { initNavigation, navigateTo } from "./navigation.js";
import { initGlobalControls } from "./lib/controls.js";

async function boot() {
  initGlobalControls();
  initNavigation();
  // Default landing screen.
  navigateTo("dashboard");
}

document.addEventListener("DOMContentLoaded", boot);
