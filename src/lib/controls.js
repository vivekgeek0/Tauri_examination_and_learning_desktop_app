// ============================================================================
// controls.js — global floating controls reused from the original HTML:
// dark mode toggle and back-to-top button.
// ============================================================================

export function initGlobalControls() {
  const darkToggle = document.getElementById("dark-mode-toggle");
  const backToTop = document.getElementById("back-to-top");

  if (darkToggle) {
    darkToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      darkToggle.innerHTML = document.body.classList.contains("dark-mode") ? "&#9728;" : "&#9790;";
    });
  }
  if (backToTop) {
    window.addEventListener(
      "scroll",
      () => {
        if (window.pageYOffset > 400) backToTop.classList.add("show");
        else backToTop.classList.remove("show");
      },
      { passive: true }
    );
    backToTop.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" })
    );
  }
}

// ---- Small toast helper used by every screen ----
let toastTimer = null;
export function toast(message, kind = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = "";
  if (kind === "error") el.classList.add("error");
  if (kind === "success") el.classList.add("success");
  // force reflow then add show
  void el.offsetWidth;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
