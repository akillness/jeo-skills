/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure equation source-format adapters shared by the Docs editor and DOCX
 * exporter. LaTeX remains the sole semantic source stored on equation nodes.
 *
 * Word's UnicodeMath linear format (LaTeX ⇄ UnicodeMath, both directions
 * verified) lives in lib/unicode-math; this module keeps the plain-text input
 * mode and the legacy UnicodeMath-like spelling the DOCX exporter re-exports.
 */

/** LaTeX control words emitted by import/editor and understood by Word linear. */
export const LATEX_TO_UNICODE: Readonly<Record<string, string>> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  varepsilon: "ε",
  epsilon: "ϵ",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  varphi: "φ",
  phi: "ϕ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "⋅",
  ast: "∗",
  circ: "∘",
  bullet: "∙",
  oplus: "⊕",
  ominus: "⊖",
  otimes: "⊗",
  odot: "⊙",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  cong: "≅",
  simeq: "≃",
  sim: "∼",
  propto: "∝",
  ll: "≪",
  gg: "≫",
  prec: "≺",
  succ: "≻",
  in: "∈",
  notin: "∉",
  ni: "∋",
  subset: "⊂",
  supset: "⊃",
  subseteq: "⊆",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  setminus: "∖",
  emptyset: "∅",
  varnothing: "∅",
  wedge: "∧",
  vee: "∨",
  neg: "¬",
  forall: "∀",
  exists: "∃",
  nexists: "∄",
  perp: "⊥",
  parallel: "∥",
  vdash: "⊢",
  models: "⊨",
  sqcup: "⊔",
  sqcap: "⊓",
  sum: "∑",
  prod: "∏",
  coprod: "∐",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  bigwedge: "⋀",
  bigvee: "⋁",
  bigcap: "⋂",
  bigcup: "⋃",
  bigodot: "⨀",
  bigoplus: "⨁",
  bigotimes: "⨂",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  mapsto: "↦",
  hookrightarrow: "↪",
  rightharpoonup: "⇀",
  uparrow: "↑",
  downarrow: "↓",
  longrightarrow: "⟶",
  Longrightarrow: "⟹",
  nearrow: "↗",
  searrow: "↘",
  partial: "∂",
  nabla: "∇",
  infty: "∞",
  hbar: "ℏ",
  ell: "ℓ",
  wp: "℘",
  Re: "ℜ",
  Im: "ℑ",
  aleph: "ℵ",
  angle: "∠",
  triangle: "△",
  square: "□",
  blacksquare: "∎",
  dots: "…",
  cdots: "⋯",
  vdots: "⋮",
  ddots: "⋱",
  langle: "〈",
  rangle: "〉",
  Vert: "‖",
  lfloor: "⌊",
  rfloor: "⌋",
  lceil: "⌈",
  rceil: "⌉",
  dagger: "†",
  ddagger: "‡",
  star: "★",
  checkmark: "✓",
  lim: "lim",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  sec: "sec",
  csc: "csc",
  exp: "exp",
  log: "log",
  ln: "ln",
  det: "det",
  dim: "dim",
  ker: "ker",
  arg: "arg",
  gcd: "gcd",
  min: "min",
  max: "max",
  sup: "sup",
  inf: "inf",
  backslash: "\\",
  "%": "%",
  "&": "&",
  "#": "#",
  $: "$",
  _: "_",
  "{": "{",
  "}": "}",
};

function readBalancedGroup(
  source: string,
  openIndex: number,
): { body: string; end: number } | null {
  if (source[openIndex] !== "{") return null;
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(openIndex + 1, index),
          end: index + 1,
        };
      }
    }
  }
  return null;
}

function rewriteLatexGroups(
  source: string,
  command: string,
  rewrite: (first: string, second: string | null) => string,
  binary: boolean,
): string {
  let output = source;
  for (let guard = 0; guard < 50; guard += 1) {
    const start = output.indexOf(`\\${command}{`);
    if (start === -1) break;
    const firstOpen = start + command.length + 1;
    const first = readBalancedGroup(output, firstOpen);
    if (!first) break;
    let second: { body: string; end: number } | null = null;
    if (binary && output[first.end] === "{") {
      second = readBalancedGroup(output, first.end);
    }
    const end = second ? second.end : first.end;
    output =
      output.slice(0, start) +
      rewrite(first.body, second ? second.body : null) +
      output.slice(end);
  }
  return output;
}

/**
 * Existing DOCX-export translation. Keep output byte semantics stable: this
 * function is moved out of docx-export, not rewritten for the Ribbon.
 */
export function latexToWordLinear(latex: string): string {
  let output = latex;
  for (let pass = 0; pass < 8; pass += 1) {
    const before = output;
    output = rewriteLatexGroups(
      output,
      "frac",
      (first, second) => `(${first})/(${second ?? ""})`,
      true,
    );
    output = rewriteLatexGroups(
      output,
      "sqrt",
      (value) => `√(${value})`,
      false,
    );
    output = rewriteLatexGroups(output, "text", (value) => `"${value}"`, false);
    output = rewriteLatexGroups(output, "mathrm", (value) => value, false);
    output = rewriteLatexGroups(output, "mathbf", (value) => value, false);
    output = rewriteLatexGroups(output, "boldsymbol", (value) => value, false);
    output = rewriteLatexGroups(output, "mathbb", (value) => value, false);
    output = rewriteLatexGroups(output, "mathcal", (value) => value, false);
    output = rewriteLatexGroups(output, "mathfrak", (value) => value, false);
    output = rewriteLatexGroups(output, "mathsf", (value) => value, false);
    output = rewriteLatexGroups(output, "mathtt", (value) => value, false);
    output = rewriteLatexGroups(
      output,
      "overline",
      (value) => `¯(${value})`,
      false,
    );
    output = rewriteLatexGroups(
      output,
      "underline",
      (value) => `▁(${value})`,
      false,
    );
    output = rewriteLatexGroups(
      output,
      "boxed",
      (value) => `▭(${value})`,
      false,
    );
    output = rewriteLatexGroups(output, "vec", (value) => `(${value})⃗`, false);
    output = rewriteLatexGroups(output, "hat", (value) => `(${value})̂`, false);
    output = rewriteLatexGroups(output, "bar", (value) => `(${value})̄`, false);
    output = rewriteLatexGroups(
      output,
      "tilde",
      (value) => `(${value})̃`,
      false,
    );
    output = rewriteLatexGroups(output, "dot", (value) => `(${value})̇`, false);
    output = rewriteLatexGroups(output, "ddot", (value) => `(${value})̈`, false);
    output = rewriteLatexGroups(
      output,
      "operatorname",
      (value) => value,
      false,
    );
    if (output === before) break;
  }
  output = output
    .replace(/\\left\s*\\?/g, "")
    .replace(/\\right\s*\\?/g, "")
    .replace(/\\begin\{[a-z]+\*?\}/gi, "")
    .replace(/\\end\{[a-z]+\*?\}/gi, "")
    .replace(/\\\\/g, "; ")
    .replace(/\\limits/g, "")
    .replace(/\\,|\\;|\\:|\\!/g, " ")
    .replace(/&/g, " ");
  output = output.replace(
    /\\([A-Za-z]+|[%&#$_{}\\])/g,
    (full, word: string) => LATEX_TO_UNICODE[word] ?? word,
  );
  output = output
    .replace(/_\{([^{}]*)\}/g, "_($1)")
    .replace(/\^\{([^{}]*)\}/g, "^($1)");
  output = output.replace(/[{}]/g, "");
  return output.replace(/[ \t]+/g, " ").trim();
}

/** Plain-text input is represented canonically as one LaTeX \text group. */
export function equationTextToLatex(text: string): string | null {
  if (/[\u0000-\u001f\u007f\\{}]/.test(text)) return null;
  return text === "" ? "" : `\\text{${text}}`;
}

/** Resolve a formula that can be edited losslessly as plain equation text. */
export function latexToEquationText(latex: string): string | null {
  if (latex === "") return "";
  const textMatch = /^\\text\{([^\\{}]*)\}$/.exec(latex);
  if (textMatch) return textMatch[1];
  return /[\\{}^_$=+*/<>]/.test(latex) ? null : latex;
}
