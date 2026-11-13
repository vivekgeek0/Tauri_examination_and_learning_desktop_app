// ============================================================================
// question-card.js — adapted from the original HTML reference. Renders the
// question card exactly as the reference UI: question number badge, question
// text (with KaTeX), four options, check button (practice only), and the
// answer block with main explanation + per-wrong-option bullets.
//
// The card is the same DOM structure the original standalone JS expected, so
// the original CSS continues to apply unchanged.
// ============================================================================

// Convert a question row coming from the Rust backend into the structure
// expected by the renderer. `right_option` from the CSV is the FULL CORRECT
// ANSWER TEXT, so we find which of the four options it matches.
export function normalizeQuestion(q) {
  const options = [q.option_1, q.option_2, q.option_3, q.option_4];
  const correctLetter = findCorrectLetter(options, q.right_option);
  return {
    id: q.id ?? q.question_id,
    question: q.question,
    options: options.map((text, i) => ({
      letter: String.fromCharCode(97 + i),
      text,
    })),
    rightOption: q.right_option,
    correctLetter,
    explanation: parseExplanation(q.explanation || "", correctLetter || ""),
    index: q.question_order ?? q.id ?? 0,
  };
}

function normalizeText(t) {
  if (!t) return "";
  return String(t)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ");
}

function findCorrectLetter(options, rightOption) {
  const normRight = normalizeText(rightOption);
  if (!normRight) return null;
  for (let i = 0; i < options.length; i++) {
    if (normalizeText(options[i]) === normRight) {
      return String.fromCharCode(97 + i);
    }
  }
  // Fallback: substring match
  for (let i = 0; i < options.length; i++) {
    const n = normalizeText(options[i]);
    if (n && (n.includes(normRight) || normRight.includes(n))) {
      return String.fromCharCode(97 + i);
    }
  }
  return null;
}

function parseExplanation(explanation, correctLetter) {
  if (!explanation || !explanation.trim()) {
    return { main: "No explanation provided.", bullets: [] };
  }
  const bulletStartRegex = /\*\s*\([a-zA-Z]\)/;
  const firstBulletMatch = explanation.match(bulletStartRegex);
  let mainExplanation;
  let bulletsPart = "";
  if (firstBulletMatch && firstBulletMatch.index !== undefined) {
    mainExplanation = explanation.substring(0, firstBulletMatch.index).trim();
    bulletsPart = explanation.substring(firstBulletMatch.index);
  } else {
    mainExplanation = explanation.trim();
  }
  if (!mainExplanation) mainExplanation = "No explanation provided.";
  const bullets = [];
  const bulletSplitRegex = /(\*\s*\([a-zA-Z]\)[\s\S]*?)(?=\*\s*\([a-zA-Z]\)|$)/g;
  let m;
  while ((m = bulletSplitRegex.exec(bulletsPart)) !== null) {
    const bulletText = m[1].trim();
    if (!bulletText) continue;
    const lm = bulletText.match(/^\*\s*\(([a-zA-Z])\)/);
    if (!lm) continue;
    const letter = lm[1].toLowerCase();
    const textAfter = bulletText.substring(lm[0].length).trim();
    if (correctLetter && letter === correctLetter.toLowerCase()) continue;
    bullets.push({ letter, text: textAfter });
  }
  return { main: mainExplanation, bullets };
}

// ---- Math preprocessing (Unicode -> LaTeX) copied from the original ----
function preprocessMathContent(math) {
  const replacements = {
    "\u2227": "\\wedge", "\u2228": "\\vee", "\u2212": "-", "\u2013": "-", "\u2014": "-",
    "\u00d7": "\\times", "\u00f7": "\\div", "\u00b1": "\\pm", "\u2264": "\\leq",
    "\u2265": "\\geq", "\u2260": "\\neq", "\u2192": "\\to", "\u2190": "\\gets",
    "\u2194": "\\leftrightarrow", "\u221e": "\\infty", "\u221a": "\\sqrt",
    "\u2211": "\\sum", "\u222b": "\\int", "\u2202": "\\partial", "\u2207": "\\nabla",
    "\u2208": "\\in", "\u2209": "\\notin", "\u2282": "\\subset", "\u2283": "\\supset",
    "\u222a": "\\cup", "\u2229": "\\cap", "\u2200": "\\forall", "\u2203": "\\exists",
    "\u00ac": "\\neg", "\u21d2": "\\Rightarrow", "\u21d0": "\\Leftarrow",
    "\u21d4": "\\Leftrightarrow", "\u00b7": "\\cdot", "\u2026": "\\ldots",
    "\u22c8": "\\cdots", "\u22ee": "\\vdots", "\u22f1": "\\ddots",
    "\u03b1": "\\alpha", "\u03b2": "\\beta", "\u03b3": "\\gamma", "\u03b4": "\\delta",
    "\u03b5": "\\epsilon", "\u03b6": "\\zeta", "\u03b7": "\\eta", "\u03b8": "\\theta",
    "\u03b9": "\\iota", "\u03ba": "\\kappa", "\u03bb": "\\lambda", "\u03bc": "\\mu",
    "\u03bd": "\\nu", "\u03be": "\\xi", "\u03bf": "o", "\u03c0": "\\pi",
    "\u03c1": "\\rho", "\u03c3": "\\sigma", "\u03c4": "\\tau", "\u03c5": "\\upsilon",
    "\u03c6": "\\phi", "\u03c7": "\\chi", "\u03c8": "\\psi", "\u03c9": "\\omega",
    "\u0391": "A", "\u0392": "B", "\u0393": "\\Gamma", "\u0394": "\\Delta",
    "\u0398": "\\Theta", "\u039b": "\\Lambda", "\u039e": "\\Xi", "\u03a0": "\\Pi",
    "\u03a3": "\\Sigma", "\u03a6": "\\Phi", "\u03a8": "\\Psi", "\u03a9": "\\Omega",
    "\u00b0": "^{\\circ}", "\u2248": "\\approx", "\u2245": "\\cong", "\u223c": "\\sim",
    "\u2261": "\\equiv", "\u221d": "\\propto", "\u25b3": "\\triangle",
  };
  let result = math;
  for (const [u, l] of Object.entries(replacements)) {
    result = result.split(u).join(l);
  }
  return result;
}

export function preprocessMath(text) {
  if (!text) return text;
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "$" && text[i + 1] === "$") {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1) {
        result += "$$" + preprocessMathContent(text.substring(i + 2, end)) + "$$";
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "$") {
      const end = text.indexOf("$", i + 1);
      if (end !== -1 && end > i + 1) {
        result += "$" + preprocessMathContent(text.substring(i + 1, end)) + "$";
        i = end + 1;
        continue;
      }
    }
    result += text[i];
    i++;
  }
  return result;
}

function escapeHtml(t) {
  if (t === null || t === undefined) return "";
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a question-card element.
 *
 * opts:
 *   - interactive: boolean. If true, options are clickable and a Check button
 *     is shown (practice mode). If false, the card is rendered read-only.
 *   - reveal: boolean. If true, the answer block is shown immediately and the
 *     correct/wrong option styling is applied (used in exam review).
 *   - preselectedAnswer: option text the user previously selected.
 *   - onAnswer: callback(question, selectedOptionText) when user checks.
 */
export function createQuestionCard(q, opts = {}) {
  const card = document.createElement("article");
  card.className = "question-card";
  card.id = "question-idx-" + q.index;
  card.setAttribute("data-question-id", q.id);

  const searchText = (
    q.question +
    " " +
    q.options.map((o) => o.text).join(" ") +
    " " +
    q.explanation.main +
    " " +
    q.explanation.bullets.map((b) => b.text).join(" ")
  ).toLowerCase();
  card.setAttribute("data-search-text", searchText);

  // Header
  const header = document.createElement("div");
  header.className = "question-header";
  header.innerHTML =
    '<span class="question-number">Q' + escapeHtml(String(q.index)) + "</span>" +
    '<div class="question-text">' + escapeHtml(preprocessMath(q.question)) + "</div>";
  card.appendChild(header);

  // Options
  const optionsList = document.createElement("div");
  optionsList.className = "options-list";
  optionsList.setAttribute("role", "radiogroup");

  q.options.forEach((opt) => {
    const item = document.createElement("div");
    item.className = "option-item";
    item.setAttribute("data-letter", opt.letter);
    item.setAttribute("data-option-text", opt.text);
    item.setAttribute("data-correct", q.correctLetter === opt.letter ? "true" : "false");
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", "false");
    item.setAttribute("tabindex", "0");
    item.innerHTML =
      '<span class="option-radio" aria-hidden="true"></span>' +
      '<span class="option-label">(' + opt.letter + ")</span>" +
      '<span class="option-text">' + escapeHtml(preprocessMath(opt.text)) + "</span>";

    if (opts.interactive) {
      item.addEventListener("click", () => {
        if (card.classList.contains("answered")) return;
        selectOption(card, opt.letter);
      });
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!card.classList.contains("answered")) selectOption(card, opt.letter);
        }
      });
    }
    optionsList.appendChild(item);
  });
  card.appendChild(optionsList);

  // Check button (practice only)
  if (opts.interactive) {
    const checkBtn = document.createElement("button");
    checkBtn.className = "check-btn";
    checkBtn.textContent = "Check Answer";
    checkBtn.addEventListener("click", () => {
      const selected = card.querySelector(".option-item.selected");
      if (!selected) {
        const original = checkBtn.textContent;
        checkBtn.textContent = "Please select an option first";
        setTimeout(() => (checkBtn.textContent = original), 1800);
        return;
      }
      const selectedLetter = selected.getAttribute("data-letter");
      const selectedOpt = q.options.find((o) => o.letter === selectedLetter);
      const isCorrect = selectedLetter === q.correctLetter;
      markCardAnswered(card, q, selectedLetter, isCorrect);
      if (typeof opts.onAnswer === "function") {
        opts.onAnswer(q, selectedOpt.text, isCorrect);
      }
    });
    card.appendChild(checkBtn);
  }

  // Answer block — created BEFORE the pre-reveal call so markCardAnswered
  // can find it and add the "show" class (which makes the explanation visible).
  const correctOption = q.options.find((o) => o.letter === q.correctLetter);
  const correctText = correctOption ? correctOption.text : q.rightOption || "(correct answer not determined)";
  const correctLetterDisplay = q.correctLetter || "?";

  let answerHtml =
    '<div class="answer-correct">' +
    '<span class="check-icon">\u2713</span>' +
    "<span>Correct Answer: (" + escapeHtml(correctLetterDisplay) + ") " +
    escapeHtml(preprocessMath(correctText)) + "</span></div>";

  if (
    q.explanation.main === "No explanation provided." &&
    q.explanation.bullets.length === 0
  ) {
    answerHtml += '<div class="answer-main no-explanation">No explanation provided.</div>';
  } else {
    answerHtml +=
      '<div class="answer-main">' + escapeHtml(preprocessMath(q.explanation.main)) + "</div>";
  }
  if (q.explanation.bullets.length > 0) {
    answerHtml += '<ul class="answer-wrong-list">';
    q.explanation.bullets.forEach((b) => {
      answerHtml +=
        '<li class="answer-wrong-item">' +
        '<span class="wrong-icon" aria-hidden="true">\u2717</span>' +
        '<div class="wrong-content">' +
        '<span class="wrong-letter">(' + escapeHtml(b.letter) + ")</span>" +
        "<span>" + escapeHtml(preprocessMath(b.text)) + "</span>" +
        "</div></li>";
    });
    answerHtml += "</ul>";
  }

  const answerBlock = document.createElement("div");
  answerBlock.className = "answer-block";
  answerBlock.innerHTML = answerHtml;
  card.appendChild(answerBlock);

  // Pre-reveal mode (review) — now the answer block exists so markCardAnswered
  // can add the "show" class to reveal the explanation. We reveal even when
  // the user didn't answer (preselectedAnswer is null) so the explanation is
  // always visible in review mode.
  if (opts.reveal) {
    const selectedLetter = opts.preselectedAnswer
      ? findCorrectLetter(q.options.map((o) => o.text), opts.preselectedAnswer)
      : null;
    markCardAnswered(card, q, selectedLetter, selectedLetter === q.correctLetter, true);
  }

  return card;
}

function selectOption(card, letter) {
  card.querySelectorAll(".option-item").forEach((o) => {
    o.classList.remove("selected");
    o.setAttribute("aria-checked", "false");
  });
  const sel = card.querySelector('.option-item[data-letter="' + letter + '"]');
  if (sel) {
    sel.classList.add("selected");
    sel.setAttribute("aria-checked", "true");
  }
}

function markCardAnswered(card, q, selectedLetter, isCorrect, forceShow = false) {
  card.classList.add("answered");
  card.querySelectorAll(".option-item").forEach((opt) => {
    const l = opt.getAttribute("data-letter");
    opt.classList.remove("selected");
    opt.setAttribute("aria-checked", "false");
    if (l === q.correctLetter) opt.classList.add("correct");
    else if (selectedLetter && l === selectedLetter) opt.classList.add("wrong");
  });
  const answerBlock = card.querySelector(".answer-block");
  if (answerBlock) answerBlock.classList.add("show");
  const btn = card.querySelector(".check-btn");
  if (btn) {
    btn.textContent = isCorrect
      ? "\u2713 Answered Correctly"
      : "\u2717 Answered - see correct answer";
    btn.disabled = true;
  }
}

export function renderMathIn(root) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      });
    } catch (e) {
      console.warn("KaTeX render error:", e);
    }
  } else {
    setTimeout(() => renderMathIn(root), 150);
  }
}
