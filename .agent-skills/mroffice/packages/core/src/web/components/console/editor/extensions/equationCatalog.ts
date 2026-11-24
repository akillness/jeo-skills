/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure data catalog for the visual equation builder (Insert → Equation in the
 * document toolbar). Mirrors Word / WPS "插入公式" — a template gallery seeding
 * common LaTeX skeletons plus a Greek + operator symbol palette.
 *
 * This module is intentionally framework-free (no React, no TipTap) so the
 * catalog can be unit-tested in isolation. The toolbar maps each entry to an
 * `insertContent` payload for the existing mathBlock / inlineMath nodes (which
 * store a `latex` attribute); the LaTeX strings here are never translated, only
 * the `labelKey` (a `console-notebooks` i18n key) is.
 */

/** Which math node a template seeds when inserted. */
export type EquationTarget = "block" | "inline";

export interface EquationTemplate {
  /** Stable identifier (also the i18n suffix). */
  readonly id: string;
  /** i18n key under the `console-notebooks` namespace for the menu label. */
  readonly labelKey: string;
  /** LaTeX skeleton the user edits after insertion. Not translated. */
  readonly latex: string;
  /** Display block vs inline math node. Defaults to block when omitted. */
  readonly target: EquationTarget;
}

export interface MathSymbol {
  /** Stable identifier (also the i18n suffix). */
  readonly id: string;
  /** i18n key under the `console-notebooks` namespace for the tooltip / label. */
  readonly labelKey: string;
  /** The LaTeX token inserted (rendered as a glyph by KaTeX). Not translated. */
  readonly latex: string;
  /** Human-recognisable palette glyph; avoids exposing raw `\\alpha` syntax. */
  readonly glyph?: string;
}

/** One symbol in the contextual Formula ribbon's Word-style full palette. */
export interface EquationPaletteSymbol {
  /** Stable command identity. Never accept caller-provided LaTeX instead. */
  readonly id: string;
  /** Trusted MathLive insertion source. */
  readonly latex: string;
  /** Cheap, font-backed gallery preview used instead of raster artwork. */
  readonly glyph: string;
  /** Accessible English command name. */
  readonly label: string;
}

export interface EquationSymbolGroup {
  readonly id:
    | "basicMath"
    | "lowercaseGreek"
    | "uppercaseGreek"
    | "letterLike"
    | "commonBinary"
    | "commonRelations"
    | "nary"
    | "advancedBinary"
    | "advancedRelations"
    | "arrows"
    | "negatedRelations"
    | "script"
    | "fraktur"
    | "doubleStruck"
    | "geometry";
  readonly label: string;
  readonly labelZh: string;
  readonly symbols: readonly EquationPaletteSymbol[];
}

/** Word's equation input syntax and display layout are independent axes. */
export type EquationInputMode = "unicode" | "latex" | "text";
export type EquationLayoutMode = "professional" | "linear";

export function normalizeEquationInputMode(value: unknown): EquationInputMode {
  return value === "unicode" || value === "text" ? value : "latex";
}

export function normalizeEquationLayoutMode(
  value: unknown,
): EquationLayoutMode {
  return value === "linear" ? value : "professional";
}

export type EquationStructureId =
  | "fraction"
  | "script"
  | "radical"
  | "integral"
  | "largeOperator"
  | "bracket"
  | "function"
  | "accent"
  | "limitLog"
  | "operator"
  | "matrix";

/**
 * Stable family-qualified identity for one catalog tile. The family prefix is
 * closed while the member suffix is deliberately extensible: Word's galleries
 * grow independently of the command protocol, and callers still have to pass
 * the exact ID through resolveEquationStructureMember() before any mutation.
 */
export type EquationStructureMemberId = `${EquationStructureId}.${string}`;

export interface EquationStructureMember {
  readonly id: EquationStructureMemberId;
  readonly familyId: EquationStructureId;
  /** MathLive insertion source. `#?` is an editable placeholder. */
  readonly latex: string;
  readonly glyph: string;
}

interface EquationStructureMemberSpec {
  readonly suffix: string;
  readonly latex: string;
  /** Kept only as a tiny no-script fallback; production galleries typeset latex. */
  readonly glyph: string;
}

function defineStructureMembers(
  familyId: EquationStructureId,
  specs: readonly EquationStructureMemberSpec[],
): readonly EquationStructureMember[] {
  return specs.map((spec) =>
    Object.freeze({
      id: `${familyId}.${spec.suffix}` as EquationStructureMemberId,
      familyId,
      latex: spec.latex,
      glyph: spec.glyph,
    }),
  );
}

const fractionMembers = defineStructureMembers("fraction", [
  { suffix: "stacked", latex: "\\frac{#?}{#?}", glyph: "⁄" },
  { suffix: "skewed", latex: "{#?}\\!/\\!{#?}", glyph: "∕" },
  { suffix: "linear", latex: "#?/#?", glyph: "/" },
  { suffix: "small", latex: "\\tfrac{#?}{#?}", glyph: "⁄" },
  { suffix: "display", latex: "\\dfrac{#?}{#?}", glyph: "⁄" },
  { suffix: "continued", latex: "\\cfrac{#?}{#?}", glyph: "⁄" },
  { suffix: "binomial", latex: "\\binom{#?}{#?}", glyph: "()" },
  {
    suffix: "derivative",
    latex: "\\frac{d #?}{d #?}",
    glyph: "d⁄d",
  },
  {
    suffix: "partialDerivative",
    latex: "\\frac{\\partial #?}{\\partial #?}",
    glyph: "∂⁄∂",
  },
]);

const scriptMembers = defineStructureMembers("script", [
  { suffix: "subscript", latex: "#@_{#?}", glyph: "ₙ" },
  { suffix: "superscript", latex: "#@^{#?}", glyph: "ⁿ" },
  { suffix: "subSup", latex: "#@_{#?}^{#?}", glyph: "ₙⁿ" },
  { suffix: "prescript", latex: "{}_{#?}^{#?}{#@}", glyph: "ₙⁿ" },
  { suffix: "leftSubscript", latex: "{}_{#?}{#@}", glyph: "ₙ" },
  { suffix: "leftSuperscript", latex: "{}^{#?}{#@}", glyph: "ⁿ" },
  { suffix: "under", latex: "\\underset{#?}{#@}", glyph: "_" },
  { suffix: "over", latex: "\\overset{#?}{#@}", glyph: "¯" },
]);

const radicalMembers = defineStructureMembers("radical", [
  { suffix: "squareRoot", latex: "\\sqrt{#?}", glyph: "√" },
  { suffix: "nthRoot", latex: "\\sqrt[#?]{#?}", glyph: "ⁿ√" },
  { suffix: "cubeRoot", latex: "\\sqrt[3]{#?}", glyph: "∛" },
  { suffix: "fourthRoot", latex: "\\sqrt[4]{#?}", glyph: "∜" },
  {
    suffix: "nested",
    latex: "\\sqrt{#?+\\sqrt{#?}}",
    glyph: "√√",
  },
  {
    suffix: "quotient",
    latex: "\\sqrt{\\frac{#?}{#?}}",
    glyph: "√⁄",
  },
]);

const integralOperators = [
  { suffix: "single", latex: "\\int", glyph: "∫" },
  { suffix: "double", latex: "\\iint", glyph: "∬" },
  { suffix: "triple", latex: "\\iiint", glyph: "∭" },
  { suffix: "contour", latex: "\\oint", glyph: "∮" },
] as const;
const integralMembers = defineStructureMembers("integral", [
  ...integralOperators.flatMap((operator) => [
    {
      suffix: operator.suffix,
      latex: `${operator.latex}_{#?}^{#?}#?`,
      glyph: operator.glyph,
    },
    {
      suffix: `${operator.suffix}Plain`,
      latex: `${operator.latex}#?`,
      glyph: operator.glyph,
    },
    {
      suffix: `${operator.suffix}Lower`,
      latex: `${operator.latex}_{#?}#?`,
      glyph: operator.glyph,
    },
    {
      suffix: `${operator.suffix}Upper`,
      latex: `${operator.latex}^{#?}#?`,
      glyph: operator.glyph,
    },
  ]),
  { suffix: "differentialX", latex: "\\int #?\\,d x", glyph: "dx" },
  { suffix: "differentialY", latex: "\\int #?\\,d y", glyph: "dy" },
  {
    suffix: "differentialTheta",
    latex: "\\int #?\\,d\\theta",
    glyph: "dθ",
  },
  {
    suffix: "surface",
    latex: "\\iint_{#?}#?\\,d S",
    glyph: "dS",
  },
  {
    suffix: "volume",
    latex: "\\iiint_{#?}#?\\,d V",
    glyph: "dV",
  },
]);

const largeOperatorBases = [
  { suffix: "sum", latex: "\\sum", glyph: "∑" },
  { suffix: "product", latex: "\\prod", glyph: "∏" },
  { suffix: "coproduct", latex: "\\coprod", glyph: "∐" },
  { suffix: "union", latex: "\\bigcup", glyph: "⋃" },
  { suffix: "intersection", latex: "\\bigcap", glyph: "⋂" },
  { suffix: "logicalOr", latex: "\\bigvee", glyph: "⋁" },
  { suffix: "logicalAnd", latex: "\\bigwedge", glyph: "⋀" },
  { suffix: "directSum", latex: "\\bigoplus", glyph: "⨁" },
  { suffix: "tensorProduct", latex: "\\bigotimes", glyph: "⨂" },
  { suffix: "multisetUnion", latex: "\\biguplus", glyph: "⨄" },
] as const;
const largeOperatorMembers = defineStructureMembers(
  "largeOperator",
  largeOperatorBases.flatMap((operator) => [
    {
      suffix: operator.suffix,
      latex: `${operator.latex}_{#?}^{#?}#?`,
      glyph: operator.glyph,
    },
    {
      suffix: `${operator.suffix}Plain`,
      latex: `${operator.latex}#?`,
      glyph: operator.glyph,
    },
    {
      suffix: `${operator.suffix}Lower`,
      latex: `${operator.latex}_{#?}#?`,
      glyph: operator.glyph,
    },
    {
      suffix: `${operator.suffix}Upper`,
      latex: `${operator.latex}^{#?}#?`,
      glyph: operator.glyph,
    },
  ]),
);

const bracketMembers = defineStructureMembers("bracket", [
  { suffix: "parentheses", latex: "\\left(#?\\right)", glyph: "()" },
  { suffix: "square", latex: "\\left[#?\\right]", glyph: "[]" },
  { suffix: "braces", latex: "\\left\\{#?\\right\\}", glyph: "{}" },
  { suffix: "angle", latex: "\\left\\langle#?\\right\\rangle", glyph: "⟨⟩" },
  { suffix: "absolute", latex: "\\left|#?\\right|", glyph: "||" },
  { suffix: "norm", latex: "\\left\\lVert#?\\right\\rVert", glyph: "‖‖" },
  { suffix: "floor", latex: "\\left\\lfloor#?\\right\\rfloor", glyph: "⌊⌋" },
  { suffix: "ceiling", latex: "\\left\\lceil#?\\right\\rceil", glyph: "⌈⌉" },
  { suffix: "leftParenthesis", latex: "\\left(#?\\right.", glyph: "(" },
  { suffix: "leftSquare", latex: "\\left[#?\\right.", glyph: "[" },
  { suffix: "leftBrace", latex: "\\left\\{#?\\right.", glyph: "{" },
  { suffix: "leftBar", latex: "\\left|#?\\right.", glyph: "|" },
  { suffix: "rightParenthesis", latex: "\\left.#?\\right)", glyph: ")" },
  { suffix: "rightSquare", latex: "\\left.#?\\right]", glyph: "]" },
  { suffix: "rightBrace", latex: "\\left.#?\\right\\}", glyph: "}" },
  { suffix: "rightBar", latex: "\\left.#?\\right|", glyph: "|" },
  {
    suffix: "parenthesesSeparator",
    latex: "\\left(#?\\middle|#?\\right)",
    glyph: "(|)",
  },
  {
    suffix: "bracesSeparator",
    latex: "\\left\\{#?\\middle|#?\\right\\}",
    glyph: "{|}",
  },
  {
    suffix: "angleSeparator",
    latex: "\\left\\langle#?\\middle|#?\\right\\rangle",
    glyph: "⟨|⟩",
  },
  {
    suffix: "parenthesesStack",
    latex: "\\left(\\begin{matrix}#?\\\\#?\\end{matrix}\\right)",
    glyph: "(⋮)",
  },
  {
    suffix: "squareStack",
    latex: "\\left[\\begin{matrix}#?\\\\#?\\end{matrix}\\right]",
    glyph: "[⋮]",
  },
  {
    suffix: "bracesStack",
    latex: "\\left\\{\\begin{matrix}#?\\\\#?\\end{matrix}\\right\\}",
    glyph: "{⋮}",
  },
  {
    suffix: "absoluteStack",
    latex: "\\left|\\begin{matrix}#?\\\\#?\\end{matrix}\\right|",
    glyph: "|⋮|",
  },
  {
    suffix: "cases",
    latex: "\\left\\{\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right.",
    glyph: "{⋮",
  },
  {
    suffix: "casesThree",
    latex:
      "\\left\\{\\begin{matrix}#?&#?\\\\#?&#?\\\\#?&#?\\end{matrix}\\right.",
    glyph: "{⋮",
  },
  { suffix: "binomial", latex: "\\binom{#?}{#?}", glyph: "()" },
  {
    suffix: "squareBinomial",
    latex: "\\left[\\binom{#?}{#?}\\right]",
    glyph: "[]",
  },
]);

const functionNames = ["sin", "cos", "tan", "csc", "sec", "cot"] as const;
const hyperbolicFunctionNames = [
  "sinh",
  "cosh",
  "tanh",
  "csch",
  "sech",
  "coth",
] as const;
const hyperbolicFunctionLatex = (
  name: (typeof hyperbolicFunctionNames)[number],
) =>
  name === "csch" || name === "sech" || name === "coth"
    ? `\\operatorname{${name}}`
    : `\\${name}`;
const functionMembers = defineStructureMembers("function", [
  ...functionNames.map((name) => ({
    suffix: name,
    latex: `\\${name}\\left(#?\\right)`,
    glyph: name,
  })),
  ...functionNames.map((name) => ({
    suffix: `${name}Inverse`,
    latex: `\\${name}^{-1}\\left(#?\\right)`,
    glyph: `${name}⁻¹`,
  })),
  ...hyperbolicFunctionNames.map((name) => ({
    suffix: name,
    latex: `${hyperbolicFunctionLatex(name)}\\left(#?\\right)`,
    glyph: name,
  })),
  ...hyperbolicFunctionNames.map((name) => ({
    suffix: `${name}Inverse`,
    latex: `${hyperbolicFunctionLatex(name)}^{-1}\\left(#?\\right)`,
    glyph: `${name}⁻¹`,
  })),
  { suffix: "exp", latex: "\\exp\\left(#?\\right)", glyph: "exp" },
  { suffix: "ln", latex: "\\ln\\left(#?\\right)", glyph: "ln" },
  { suffix: "log", latex: "\\log\\left(#?\\right)", glyph: "log" },
]);

const accentMembers = defineStructureMembers("accent", [
  { suffix: "hat", latex: "\\hat{#?}", glyph: "ˆ" },
  { suffix: "wideHat", latex: "\\widehat{#?}", glyph: "ˆ" },
  { suffix: "tilde", latex: "\\tilde{#?}", glyph: "˜" },
  { suffix: "wideTilde", latex: "\\widetilde{#?}", glyph: "˜" },
  { suffix: "bar", latex: "\\bar{#?}", glyph: "¯" },
  { suffix: "overline", latex: "\\overline{#?}", glyph: "¯" },
  { suffix: "underline", latex: "\\underline{#?}", glyph: "_" },
  { suffix: "vector", latex: "\\vec{#?}", glyph: "⃗" },
  { suffix: "dot", latex: "\\dot{#?}", glyph: "˙" },
  { suffix: "doubleDot", latex: "\\ddot{#?}", glyph: "¨" },
  { suffix: "breve", latex: "\\breve{#?}", glyph: "˘" },
  { suffix: "check", latex: "\\check{#?}", glyph: "ˇ" },
  { suffix: "acute", latex: "\\acute{#?}", glyph: "´" },
  { suffix: "grave", latex: "\\grave{#?}", glyph: "`" },
  { suffix: "ring", latex: "\\mathring{#?}", glyph: "˚" },
  { suffix: "rightArrow", latex: "\\overrightarrow{#?}", glyph: "→" },
  { suffix: "leftArrow", latex: "\\overleftarrow{#?}", glyph: "←" },
  {
    suffix: "leftRightArrow",
    latex: "\\overleftrightarrow{#?}",
    glyph: "↔",
  },
  { suffix: "overbrace", latex: "\\overbrace{#?}", glyph: "⏞" },
  {
    suffix: "overbraceLabel",
    latex: "\\overbrace{#?}^{#?}",
    glyph: "⏞",
  },
  { suffix: "underbrace", latex: "\\underbrace{#?}", glyph: "⏟" },
  {
    suffix: "underbraceLabel",
    latex: "\\underbrace{#?}_{#?}",
    glyph: "⏟",
  },
  { suffix: "overset", latex: "\\overset{#?}{#?}", glyph: "¯" },
  { suffix: "underset", latex: "\\underset{#?}{#?}", glyph: "_" },
  { suffix: "boxed", latex: "\\boxed{#?}", glyph: "□" },
  {
    suffix: "doubleOverline",
    latex: "\\overline{\\overline{#?}}",
    glyph: "═",
  },
  {
    suffix: "boxedEquation",
    latex: "\\boxed{#?=#?}",
    glyph: "□",
  },
]);

const limitLogMembers = defineStructureMembers("limitLog", [
  { suffix: "limit", latex: "\\lim_{#?\\to #?}#?", glyph: "lim" },
  {
    suffix: "limitInfinity",
    latex: "\\lim_{#?\\to\\infty}#?",
    glyph: "lim∞",
  },
  { suffix: "limitRight", latex: "\\lim_{#?\\to #?^{+}}#?", glyph: "lim⁺" },
  { suffix: "limitLeft", latex: "\\lim_{#?\\to #?^{-}}#?", glyph: "lim⁻" },
  { suffix: "logBase", latex: "\\log_{#?}\\left(#?\\right)", glyph: "logₙ" },
  { suffix: "log", latex: "\\log\\left(#?\\right)", glyph: "log" },
  { suffix: "naturalLog", latex: "\\ln\\left(#?\\right)", glyph: "ln" },
  { suffix: "minimum", latex: "\\min_{#?}#?", glyph: "min" },
  { suffix: "maximum", latex: "\\max_{#?}#?", glyph: "max" },
]);

const operatorMembers = defineStructureMembers("operator", [
  { suffix: "multiply", latex: "#?\\times #?", glyph: "×" },
  { suffix: "divide", latex: "#?\\div #?", glyph: "÷" },
  { suffix: "plusMinus", latex: "#?\\pm #?", glyph: "±" },
  { suffix: "dot", latex: "#?\\cdot #?", glyph: "⋅" },
  { suffix: "equals", latex: "#?=#?", glyph: "=" },
  { suffix: "notEquals", latex: "#?\\ne #?", glyph: "≠" },
  { suffix: "equivalent", latex: "#?\\equiv #?", glyph: "≡" },
  { suffix: "approximately", latex: "#?\\approx #?", glyph: "≈" },
  { suffix: "proportional", latex: "#?\\propto #?", glyph: "∝" },
  { suffix: "assignment", latex: "#?\\coloneqq #?", glyph: ":=" },
  {
    suffix: "definition",
    latex: "#?\\stackrel{\\mathrm{def}}{=}#?",
    glyph: "def",
  },
  { suffix: "deltaEquals", latex: "#?\\stackrel{\\Delta}{=}#?", glyph: "Δ=" },
  { suffix: "leftArrow", latex: "#?\\leftarrow #?", glyph: "←" },
  { suffix: "rightArrow", latex: "#?\\rightarrow #?", glyph: "→" },
  { suffix: "leftRightArrow", latex: "#?\\leftrightarrow #?", glyph: "↔" },
  { suffix: "doubleLeft", latex: "#?\\Leftarrow #?", glyph: "⇐" },
  { suffix: "doubleRight", latex: "#?\\Rightarrow #?", glyph: "⇒" },
  { suffix: "doubleBoth", latex: "#?\\Leftrightarrow #?", glyph: "⇔" },
  { suffix: "mapsTo", latex: "#?\\mapsto #?", glyph: "↦" },
  { suffix: "longRight", latex: "#?\\longrightarrow #?", glyph: "⟶" },
  { suffix: "labelledRight", latex: "#?\\xrightarrow{#?}#?", glyph: "→" },
]);

const matrixMembers = defineStructureMembers("matrix", [
  { suffix: "blankOne", latex: "\\begin{matrix}#?\\end{matrix}", glyph: "1×1" },
  {
    suffix: "blankRowTwo",
    latex: "\\begin{matrix}#?&#?\\end{matrix}",
    glyph: "1×2",
  },
  {
    suffix: "blankColumnTwo",
    latex: "\\begin{matrix}#?\\\\#?\\end{matrix}",
    glyph: "2×1",
  },
  {
    suffix: "blankTwo",
    latex: "\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}",
    glyph: "2×2",
  },
  {
    suffix: "blankTwoByThree",
    latex: "\\begin{matrix}#?&#?&#?\\\\#?&#?&#?\\end{matrix}",
    glyph: "2×3",
  },
  {
    suffix: "blankThreeByTwo",
    latex: "\\begin{matrix}#?&#?\\\\#?&#?\\\\#?&#?\\end{matrix}",
    glyph: "3×2",
  },
  {
    suffix: "blankThree",
    latex: "\\begin{matrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{matrix}",
    glyph: "3×3",
  },
  {
    suffix: "blankFour",
    latex:
      "\\begin{matrix}#?&#?&#?&#?\\\\#?&#?&#?&#?\\\\#?&#?&#?&#?\\\\#?&#?&#?&#?\\end{matrix}",
    glyph: "4×4",
  },
  {
    suffix: "twoByTwo",
    latex: "\\left[\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right]",
    glyph: "[2×2]",
  },
  {
    suffix: "threeByThree",
    latex:
      "\\left[\\begin{matrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{matrix}\\right]",
    glyph: "[3×3]",
  },
  {
    suffix: "determinant",
    latex: "\\left|\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right|",
    glyph: "|A|",
  },
  {
    suffix: "cases",
    latex: "\\left\\{\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right.",
    glyph: "{□",
  },
  {
    suffix: "rowThree",
    latex: "\\begin{matrix}#?&#?&#?\\end{matrix}",
    glyph: "1×3",
  },
  {
    suffix: "columnThree",
    latex: "\\begin{matrix}#?\\\\#?\\\\#?\\end{matrix}",
    glyph: "3×1",
  },
  {
    suffix: "rowFour",
    latex: "\\begin{matrix}#?&#?&#?&#?\\end{matrix}",
    glyph: "1×4",
  },
  {
    suffix: "columnFour",
    latex: "\\begin{matrix}#?\\\\#?\\\\#?\\\\#?\\end{matrix}",
    glyph: "4×1",
  },
  {
    suffix: "horizontalEllipsis",
    latex: "\\begin{matrix}#?&\\cdots&#?\\end{matrix}",
    glyph: "⋯",
  },
  {
    suffix: "verticalEllipsis",
    latex: "\\begin{matrix}#?\\\\\\vdots\\\\#?\\end{matrix}",
    glyph: "⋮",
  },
  {
    suffix: "diagonalEllipsis",
    latex: "\\begin{matrix}#?&0&0\\\\0&\\ddots&0\\\\0&0&#?\\end{matrix}",
    glyph: "⋱",
  },
  {
    suffix: "antiDiagonalEllipsis",
    latex: "\\begin{matrix}0&0&#?\\\\0&⋰&0\\\\#?&0&0\\end{matrix}",
    glyph: "⋰",
  },
  {
    suffix: "identityTwo",
    latex: "\\begin{matrix}1&0\\\\0&1\\end{matrix}",
    glyph: "I₂",
  },
  {
    suffix: "identityThree",
    latex: "\\begin{matrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{matrix}",
    glyph: "I₃",
  },
  {
    suffix: "identityFour",
    latex:
      "\\begin{matrix}1&0&0&0\\\\0&1&0&0\\\\0&0&1&0\\\\0&0&0&1\\end{matrix}",
    glyph: "I₄",
  },
  {
    suffix: "parenthesesTwo",
    latex: "\\left(\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right)",
    glyph: "(A)",
  },
  {
    suffix: "bracesTwo",
    latex: "\\left\\{\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right\\}",
    glyph: "{A}",
  },
  {
    suffix: "doubleBarTwo",
    latex:
      "\\left\\lVert\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}\\right\\rVert",
    glyph: "‖A‖",
  },
  {
    suffix: "sparseDiagonal",
    latex:
      "\\left(\\begin{matrix}#?&\\cdots&0\\\\\\vdots&\\ddots&\\vdots\\\\0&\\cdots&#?\\end{matrix}\\right)",
    glyph: "diag",
  },
  {
    suffix: "augmentedTwo",
    latex:
      "\\left[\\begin{matrix}#?&#?&\\mid&#?\\\\#?&#?&\\mid&#?\\end{matrix}\\right]",
    glyph: "[A|b]",
  },
]);

/** Screenshot-derived Word 16.86 floors. MRAI may add, never drop below. */
export const EQUATION_STRUCTURE_MEMBER_MINIMUMS: Readonly<
  Record<EquationStructureId, number>
> = Object.freeze({
  fraction: 9,
  script: 8,
  radical: 6,
  integral: 21,
  largeOperator: 40,
  bracket: 27,
  function: 27,
  accent: 27,
  limitLog: 8,
  operator: 21,
  matrix: 28,
});







export const EQUATION_STRUCTURE_MEMBERS: readonly EquationStructureMember[] =
  Object.freeze([
    ...fractionMembers,
    ...scriptMembers,
    ...radicalMembers,
    ...integralMembers,
    ...largeOperatorMembers,
    ...bracketMembers,
    ...functionMembers,
    ...accentMembers,
    ...limitLogMembers,
    ...operatorMembers,
    ...matrixMembers,
  ]);

if (
  new Set(EQUATION_STRUCTURE_MEMBERS.map((member) => member.id)).size !==
  EQUATION_STRUCTURE_MEMBERS.length
) {
  throw new Error("Duplicate equation structure member identity");
}
for (const [familyId, minimum] of Object.entries(
  EQUATION_STRUCTURE_MEMBER_MINIMUMS,
) as Array<[EquationStructureId, number]>) {
  const actual = EQUATION_STRUCTURE_MEMBERS.filter(
    (member) => member.familyId === familyId,
  ).length;
  if (actual < minimum) {
    throw new Error(
      `Equation structure census below floor: ${familyId} ${actual}/${minimum}`,
    );
  }
}

const EQUATION_STRUCTURE_MEMBER_BY_ID = Object.freeze(
  Object.fromEntries(
    EQUATION_STRUCTURE_MEMBERS.map((member) => [member.id, member]),
  ),
) as Readonly<Record<string, EquationStructureMember>>;

export function resolveEquationStructureMember(
  memberId: string,
): EquationStructureMember | null {
  return Object.prototype.hasOwnProperty.call(
    EQUATION_STRUCTURE_MEMBER_BY_ID,
    memberId,
  )
    ? (EQUATION_STRUCTURE_MEMBER_BY_ID[memberId] ?? null)
    : null;
}

export interface EquationStructure {
  readonly id: EquationStructureId;
  readonly defaultMemberId: EquationStructureMemberId;
  /** MathLive insertion source. `#?` is an editable placeholder. */
  readonly latex: string;
  readonly glyph: string;
  /**
   * Ribbon face for the family, typeset as real mathematics.
   *
   * Word's Formula tab draws each Structures button as a finished, math-italic
   * specimen — `x/y`, `e^x`, `ⁿ√x`, an integral and a summation carrying real
   * limits, `sinθ`, an oversized double-dot accent, `lim n→∞`, `≜`, a bracketed
   * identity matrix — NOT the insertion template's empty placeholder squares.
   * Rendering `latex` here instead produced the hollow `□` faces our own ribbon
   * used to show. `iconLatex` is therefore a render-only specimen with no
   * placeholders; insertion still goes exclusively through `latex` /
   * `defaultMemberId`, so a face can never become an insertion source.
   */
  readonly iconLatex: string;
}

/**
 * The eleven structure families exposed by Word's Formula contextual tab.
 * One registry drives both the contextual Ribbon and the lazy MathLive editor.
 */
export const EQUATION_STRUCTURES: readonly EquationStructure[] = Object.freeze(
  (
    [
      {
        id: "fraction",
        defaultMemberId: "fraction.stacked",
        glyph: "a⁄b",
        iconLatex: "\\frac{x}{y}",
      },
      {
        id: "script",
        defaultMemberId: "script.subSup",
        glyph: "xₙⁿ",
        iconLatex: "e^x",
      },
      {
        id: "radical",
        defaultMemberId: "radical.nthRoot",
        glyph: "ⁿ√x",
        iconLatex: "\\sqrt[n]{x}",
      },
      {
        id: "integral",
        defaultMemberId: "integral.single",
        glyph: "∫",
        iconLatex: "\\int_{-x}^{x}",
      },
      {
        id: "largeOperator",
        defaultMemberId: "largeOperator.sum",
        glyph: "∑",
        iconLatex: "\\sum\\limits_{i=0}^{n}",
      },
      {
        id: "bracket",
        defaultMemberId: "bracket.parentheses",
        glyph: "(□)",
        iconLatex: "\\{()\\}",
      },
      {
        id: "function",
        defaultMemberId: "function.sin",
        glyph: "f(x)",
        iconLatex: "\\sin{\\theta }",
      },
      {
        id: "accent",
        defaultMemberId: "accent.hat",
        glyph: "x̂",
        iconLatex: "\\ddot{a}",
      },
      {
        id: "limitLog",
        defaultMemberId: "limitLog.limit",
        glyph: "lim",
        iconLatex: "\\lim\\limits_{n\\to\\infty}",
      },
      {
        id: "operator",
        defaultMemberId: "operator.multiply",
        glyph: "×",
        iconLatex: "\\triangleq",
      },
      {
        id: "matrix",
        defaultMemberId: "matrix.twoByTwo",
        glyph: "[□]",
        iconLatex: "\\left[\\begin{matrix}1&0\\\\0&1\\end{matrix}\\right]",
      },
    ] as const
  ).map((family) => {
    const defaultMember = resolveEquationStructureMember(
      family.defaultMemberId,
    );
    if (!defaultMember || defaultMember.familyId !== family.id) {
      throw new Error(`Invalid equation structure family: ${family.id}`);
    }
    return Object.freeze({ ...family, latex: defaultMember.latex });
  }),
);

const EQUATION_STRUCTURE_MEMBERS_BY_FAMILY = Object.freeze(
  Object.fromEntries(
    EQUATION_STRUCTURES.map((family) => [
      family.id,
      Object.freeze(
        EQUATION_STRUCTURE_MEMBERS.filter(
          (member) => member.familyId === family.id,
        ),
      ),
    ]),
  ),
) as Readonly<Record<EquationStructureId, readonly EquationStructureMember[]>>;

export function equationStructureMembersForFamily(
  familyId: EquationStructureId,
): readonly EquationStructureMember[] {
  return EQUATION_STRUCTURE_MEMBERS_BY_FAMILY[familyId];
}

/**
 * Contextual-Ribbon insertion has no live MathLive placeholders. Preserve the
 * structural LaTeX while converting placeholders to editable empty groups.
 */
export function equationStructureLatex(structure: {
  readonly latex: string;
}): string {
  return structure.latex.replaceAll("#?", "").replaceAll("#@", "");
}

/**
 * Render-only view of the exact insertion template. Placeholders become empty
 * slots, which every passive renderer draws as Word's dotted placeholder box
 * (latexWithSlotsDrawn), and the selection anchor becomes x; callers never
 * invent a second preview catalog or display ambiguous text approximations.
 */
export function equationStructurePreviewLatex(structure: {
  readonly latex: string;
}): string {
  return structure.latex.replaceAll("#?", "{\\placeholder{}}").replaceAll("#@", "x");
}

/** One entry of the Word-style "Built-In" equation gallery. */
export interface EquationGalleryEntry {
  /** Stable identifier (also the i18n suffix and the gallery test id). */
  readonly id: string;
  /** i18n key under the `console-notebooks` namespace for the entry name. */
  readonly labelKey: string;
  /** The finished equation, already in importer-canonical LaTeX. */
  readonly latex: string;
  /**
   * Word stores every built-in gallery entry as a `<m:oMathPara>` display
   * equation, so inserting one always produces a block equation. Kept explicit
   * so the field reads as a decision rather than an omission.
   */
  readonly target: EquationTarget;
}


















export const EQUATION_GALLERY_ENTRIES: readonly EquationGalleryEntry[] =
  Object.freeze([
    {
      id: "areaOfCircle",
      labelKey: "equation.gallery.areaOfCircle",
      latex: "A=\\pi r^2",
      target: "block",
    },
    {
      id: "binomialTheorem",
      labelKey: "equation.gallery.binomialTheorem",
      // `\genfrac{}{}{0pt}{}` is the bar-less fraction both the DOCX exporter
      // and the OMML importer use for Word's `<m:f><m:type m:val="noBar"/>`
      // binomial-coefficient stack.
      latex: "{(x+a)}^n=\\sum_{k=0}^n(\\genfrac{}{}{0pt}{}{n}{k})x^ka^{n-k}",
      target: "block",
    },
    {
      id: "expansionOfASum",
      labelKey: "equation.gallery.expansionOfASum",
      latex: "{(1+x)}^n=1+\\frac{nx}{1!}+\\frac{n(n-1)x^2}{2!}+\\dots",
      target: "block",
    },
    {
      id: "fourierSeries",
      labelKey: "equation.gallery.fourierSeries",
      latex:
        "f(x)=a_0+\\sum_{n=1}^\\infty(a_n\\cos{\\frac{n\\pi x}{L}}+b_n\\sin{\\frac{n\\pi x}{L}})",
      target: "block",
    },
    {
      id: "pythagoreanTheorem",
      labelKey: "equation.gallery.pythagoreanTheorem",
      latex: "a^2+b^2=c^2",
      target: "block",
    },
    {
      id: "quadraticFormula",
      labelKey: "equation.gallery.quadraticFormula",
      latex: "x=\\frac{-b\\pm \\sqrt{b^2-4ac}}{2a}",
      target: "block",
    },
    {
      id: "taylorExpansion",
      labelKey: "equation.gallery.taylorExpansion",
      latex:
        "e^x=1+\\frac{x}{1!}+\\frac{x^2}{2!}+\\frac{x^3}{3!}+\\dots ,-\\infty <x<\\infty",
      target: "block",
    },
    {
      id: "trigIdentity1",
      labelKey: "equation.gallery.trigIdentity1",
      latex:
        "\\sin{\\alpha }\\pm \\sin{\\beta }=2\\sin{\\frac{1}{2}(\\alpha \\pm \\beta )}\\cos{\\frac{1}{2}(\\alpha \\mp \\beta )}",
      target: "block",
    },
    {
      id: "trigIdentity2",
      labelKey: "equation.gallery.trigIdentity2",
      latex:
        "\\cos{\\alpha }+\\cos{\\beta }=2\\cos{\\frac{1}{2}(\\alpha +\\beta )}\\cos{\\frac{1}{2}(\\alpha -\\beta )}",
      target: "block",
    },
  ] as const);

const equationGalleryEntryById = new Map(
  EQUATION_GALLERY_ENTRIES.map((entry) => [entry.id, entry] as const),
);

/** Resolve a frozen gallery identity; never accept caller-provided LaTeX. */
export function resolveEquationGalleryEntry(
  id: string,
): EquationGalleryEntry | null {
  return equationGalleryEntryById.get(id) ?? null;
}

/**
 * Common equation skeletons. Block templates open as a display formula; the
 * fraction/sqrt/power/subscript variants seed inline math because they read
 * naturally mid-sentence, matching how Word's quick-equation gallery behaves.
 */
export const EQUATION_TEMPLATES: readonly EquationTemplate[] = [
  {
    id: "fraction",
    labelKey: "equation.template.fraction",
    latex: "\\frac{a}{b}",
    target: "inline",
  },
  {
    id: "sqrt",
    labelKey: "equation.template.sqrt",
    latex: "\\sqrt{x}",
    target: "inline",
  },
  {
    id: "power",
    labelKey: "equation.template.power",
    latex: "x^{n}",
    target: "inline",
  },
  {
    id: "subscript",
    labelKey: "equation.template.subscript",
    latex: "x_{n}",
    target: "inline",
  },
  {
    id: "sum",
    labelKey: "equation.template.sum",
    latex: "\\sum_{i=1}^{n}",
    target: "block",
  },
  {
    id: "integral",
    labelKey: "equation.template.integral",
    latex: "\\int_a^b",
    target: "block",
  },
  {
    id: "limit",
    labelKey: "equation.template.limit",
    latex: "\\lim_{x\\to 0}",
    target: "block",
  },
  {
    id: "matrix",
    labelKey: "equation.template.matrix",
    latex: "\\begin{matrix}a & b \\\\ c & d\\end{matrix}",
    target: "block",
  },
  {
    id: "cases",
    labelKey: "equation.template.cases",
    latex: "\\begin{cases}a & x < 0 \\\\ b & x \\geq 0\\end{cases}",
    target: "block",
  },
];

/** Greek lowercase letters, alpha → omega, in the canonical order. */
export const GREEK_SYMBOLS: readonly MathSymbol[] = [
  {
    id: "alpha",
    labelKey: "equation.symbol.alpha",
    latex: "\\alpha",
    glyph: "α",
  },
  { id: "beta", labelKey: "equation.symbol.beta", latex: "\\beta", glyph: "β" },
  {
    id: "gamma",
    labelKey: "equation.symbol.gamma",
    latex: "\\gamma",
    glyph: "γ",
  },
  {
    id: "delta",
    labelKey: "equation.symbol.delta",
    latex: "\\delta",
    glyph: "δ",
  },
  {
    id: "epsilon",
    labelKey: "equation.symbol.epsilon",
    latex: "\\epsilon",
    glyph: "ε",
  },
  { id: "zeta", labelKey: "equation.symbol.zeta", latex: "\\zeta", glyph: "ζ" },
  { id: "eta", labelKey: "equation.symbol.eta", latex: "\\eta", glyph: "η" },
  {
    id: "theta",
    labelKey: "equation.symbol.theta",
    latex: "\\theta",
    glyph: "θ",
  },
  { id: "iota", labelKey: "equation.symbol.iota", latex: "\\iota", glyph: "ι" },
  {
    id: "kappa",
    labelKey: "equation.symbol.kappa",
    latex: "\\kappa",
    glyph: "κ",
  },
  {
    id: "lambda",
    labelKey: "equation.symbol.lambda",
    latex: "\\lambda",
    glyph: "λ",
  },
  { id: "mu", labelKey: "equation.symbol.mu", latex: "\\mu", glyph: "μ" },
  { id: "nu", labelKey: "equation.symbol.nu", latex: "\\nu", glyph: "ν" },
  { id: "xi", labelKey: "equation.symbol.xi", latex: "\\xi", glyph: "ξ" },
  {
    id: "omicron",
    labelKey: "equation.symbol.omicron",
    latex: "\\omicron",
    glyph: "ο",
  },
  { id: "pi", labelKey: "equation.symbol.pi", latex: "\\pi", glyph: "π" },
  { id: "rho", labelKey: "equation.symbol.rho", latex: "\\rho", glyph: "ρ" },
  {
    id: "sigma",
    labelKey: "equation.symbol.sigma",
    latex: "\\sigma",
    glyph: "σ",
  },
  { id: "tau", labelKey: "equation.symbol.tau", latex: "\\tau", glyph: "τ" },
  {
    id: "upsilon",
    labelKey: "equation.symbol.upsilon",
    latex: "\\upsilon",
    glyph: "υ",
  },
  { id: "phi", labelKey: "equation.symbol.phi", latex: "\\phi", glyph: "φ" },
  { id: "chi", labelKey: "equation.symbol.chi", latex: "\\chi", glyph: "χ" },
  { id: "psi", labelKey: "equation.symbol.psi", latex: "\\psi", glyph: "ψ" },
  {
    id: "omega",
    labelKey: "equation.symbol.omega",
    latex: "\\omega",
    glyph: "ω",
  },
];

/** Common binary / relational / calculus operators. */
export const OPERATOR_SYMBOLS: readonly MathSymbol[] = [
  {
    id: "times",
    labelKey: "equation.symbol.times",
    latex: "\\times",
    glyph: "×",
  },
  { id: "div", labelKey: "equation.symbol.div", latex: "\\div", glyph: "÷" },
  { id: "pm", labelKey: "equation.symbol.pm", latex: "\\pm", glyph: "±" },
  { id: "leq", labelKey: "equation.symbol.leq", latex: "\\leq", glyph: "≤" },
  { id: "geq", labelKey: "equation.symbol.geq", latex: "\\geq", glyph: "≥" },
  { id: "neq", labelKey: "equation.symbol.neq", latex: "\\neq", glyph: "≠" },
  {
    id: "approx",
    labelKey: "equation.symbol.approx",
    latex: "\\approx",
    glyph: "≈",
  },
  {
    id: "infty",
    labelKey: "equation.symbol.infty",
    latex: "\\infty",
    glyph: "∞",
  },
  {
    id: "rightarrow",
    labelKey: "equation.symbol.rightarrow",
    latex: "\\rightarrow",
    glyph: "→",
  },
  {
    id: "partial",
    labelKey: "equation.symbol.partial",
    latex: "\\partial",
    glyph: "∂",
  },
  {
    id: "nabla",
    labelKey: "equation.symbol.nabla",
    latex: "\\nabla",
    glyph: "∇",
  },
];

/** The full symbol palette (Greek followed by operators). */
export const MATH_SYMBOLS: readonly MathSymbol[] = [
  ...GREEK_SYMBOLS,
  ...OPERATOR_SYMBOLS,
];

/** One headed category of the Insert ▸ Equation ▸ Symbols palette. */
export interface MathSymbolGroup {
  /** Shares the contextual Formula ribbon's category identity. */
  readonly id: EquationSymbolGroup["id"];
  /** i18n key under `console-notebooks` for the gallery heading. */
  readonly labelKey: string;
  readonly symbols: readonly MathSymbol[];
}

/**
 * Word's Equation ▸ Symbols gallery is grouped, with a heading per category
 * (Microsoft, "Insert mathematical symbols"). The Insert menu's compact palette
 * is exactly Word's first two categories — every operator here is listed under
 * Word's Basic Math, every letter under Greek Letters ▸ Lowercase — so it
 * reuses the same category identities as the contextual ribbon's full gallery
 * instead of presenting one unheaded grid. Basic Math leads, as in Word.
 */
export const MATH_SYMBOL_GROUPS: readonly MathSymbolGroup[] = Object.freeze([
  Object.freeze({
    id: "basicMath" as const,
    labelKey: "equation.symbolGroup.basicMath",
    symbols: OPERATOR_SYMBOLS,
  }),
  Object.freeze({
    id: "lowercaseGreek" as const,
    labelKey: "equation.symbolGroup.lowercaseGreek",
    symbols: GREEK_SYMBOLS,
  }),
]);

type EquationPaletteSymbolSpec = readonly [
  id: string,
  latex: string,
  glyph: string,
  label: string,
];

function definePaletteSymbols(
  specs: readonly EquationPaletteSymbolSpec[],
): readonly EquationPaletteSymbol[] {
  return Object.freeze(
    specs.map(([id, latex, glyph, label]) =>
      Object.freeze({ id, latex, glyph, label }),
    ),
  );
}

const alphabet = Array.from({ length: 26 }, (_, index) =>
  String.fromCharCode(65 + index),
);

const mathematicalAlphabetExceptions: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  scriptUpper: Object.freeze({
    B: "ℬ",
    E: "ℰ",
    F: "ℱ",
    H: "ℋ",
    I: "ℐ",
    L: "ℒ",
    M: "ℳ",
    R: "ℛ",
  }),
  scriptLower: Object.freeze({ e: "ℯ", g: "ℊ", o: "ℴ" }),
  frakturUpper: Object.freeze({ C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" }),
  doubleStruckUpper: Object.freeze({
    C: "ℂ",
    H: "ℍ",
    N: "ℕ",
    P: "ℙ",
    Q: "ℚ",
    R: "ℝ",
    Z: "ℤ",
  }),
});

function mathematicalAlphabetGlyph(
  style: "script" | "fraktur" | "doubleStruck",
  letter: string,
  lowercase: boolean,
): string {
  const character = lowercase ? letter.toLowerCase() : letter;
  const exceptionKey = `${style}${lowercase ? "Lower" : "Upper"}`;
  const exception = mathematicalAlphabetExceptions[exceptionKey]?.[character];
  if (exception) return exception;
  const base =
    style === "script"
      ? lowercase
        ? 0x1d4b6
        : 0x1d49c
      : style === "fraktur"
        ? lowercase
          ? 0x1d51e
          : 0x1d504
        : lowercase
          ? 0x1d552
          : 0x1d538;
  return String.fromCodePoint(base + letter.charCodeAt(0) - 65);
}

function defineStyledAlphabetSymbols(
  style: "script" | "fraktur" | "doubleStruck",
  command: "mathcal" | "mathfrak" | "mathbb",
  label: string,
): readonly EquationPaletteSymbol[] {
  return Object.freeze(
    alphabet.flatMap((letter) =>
      ([false, true] as const).map((lowercase) => {
        const character = lowercase ? letter.toLowerCase() : letter;
        return Object.freeze({
          id: `${style}-${lowercase ? "lower" : "upper"}-${letter.toLowerCase()}`,
          latex: `\\${command}{${character}}`,
          glyph: mathematicalAlphabetGlyph(style, letter, lowercase),
          label: `${label} ${character}`,
        });
      }),
    ),
  );
}

const basicMathSymbols = definePaletteSymbols([
  ["pm", "\\pm", "±", "Plus or minus"],
  ["infty", "\\infty", "∞", "Infinity"],
  ["basic-equals", "=", "=", "Equals"],
  ["neq", "\\neq", "≠", "Not equal to"],
  ["basic-sim", "\\sim", "∼", "Tilde operator"],
  ["times", "\\times", "×", "Multiplication sign"],
  ["div", "\\div", "÷", "Division sign"],
  ["basic-factorial", "!", "!", "Factorial"],
  ["basic-propto", "\\propto", "∝", "Proportional to"],
  ["basic-less-than", "<", "<", "Less than"],
  ["basic-much-less", "\\ll", "≪", "Much less than"],
  ["basic-greater-than", ">", ">", "Greater than"],
  ["basic-much-greater", "\\gg", "≫", "Much greater than"],
  ["leq", "\\leq", "≤", "Less than or equal to"],
  ["geq", "\\geq", "≥", "Greater than or equal to"],
  ["basic-mp", "\\mp", "∓", "Minus or plus"],
  ["basic-simeq", "\\simeq", "≃", "Asymptotically equal to"],
  ["approx", "\\approx", "≈", "Approximately equal to"],
  ["basic-equiv", "\\equiv", "≡", "Identical to"],
  ["basic-forall", "\\forall", "∀", "For all"],
  ["basic-complement", "\\complement", "∁", "Set complement"],
  ["partial", "\\partial", "∂", "Partial differential"],
  ["basic-square-root", "\\sqrt{#?}", "√", "Square root"],
  ["basic-cube-root", "\\sqrt[3]{#?}", "∛", "Cube root"],
  ["basic-fourth-root", "\\sqrt[4]{#?}", "∜", "Fourth root"],
  ["basic-union", "\\cup", "∪", "Union"],
  ["basic-intersection", "\\cap", "∩", "Intersection"],
  ["basic-empty-set", "\\varnothing", "∅", "Empty set"],
  ["basic-percent", "\\%", "%", "Percent"],
  ["basic-degree", "^{\\circ}", "°", "Degree"],
  ["basic-fahrenheit", "^{\\circ}\\mathrm{F}", "℉", "Degrees Fahrenheit"],
  ["basic-celsius", "^{\\circ}\\mathrm{C}", "℃", "Degrees Celsius"],
  ["basic-capital-delta", "\\Delta", "Δ", "Increment"],
  ["nabla", "\\nabla", "∇", "Nabla"],
  ["basic-exists", "\\exists", "∃", "There exists"],
  ["basic-not-exists", "\\nexists", "∄", "There does not exist"],
  ["basic-element-of", "\\in", "∈", "Element of"],
  ["basic-contains", "\\ni", "∋", "Contains as member"],
  ["basic-left-arrow", "\\leftarrow", "←", "Left arrow"],
  ["rightarrow", "\\rightarrow", "→", "Right arrow"],
  ["basic-up-arrow", "\\uparrow", "↑", "Up arrow"],
  ["basic-down-arrow", "\\downarrow", "↓", "Down arrow"],
]);

const lowercaseGreekSymbols = definePaletteSymbols([
  ["alpha", "\\alpha", "α", "Lowercase alpha"],
  ["beta", "\\beta", "β", "Lowercase beta"],
  ["gamma", "\\gamma", "γ", "Lowercase gamma"],
  ["delta", "\\delta", "δ", "Lowercase delta"],
  ["epsilon", "\\epsilon", "ε", "Lowercase epsilon"],
  ["varepsilon", "\\varepsilon", "ϵ", "Lunate epsilon"],
  ["zeta", "\\zeta", "ζ", "Lowercase zeta"],
  ["eta", "\\eta", "η", "Lowercase eta"],
  ["theta", "\\theta", "θ", "Lowercase theta"],
  ["vartheta", "\\vartheta", "ϑ", "Script theta"],
  ["iota", "\\iota", "ι", "Lowercase iota"],
  ["kappa", "\\kappa", "κ", "Lowercase kappa"],
  ["varkappa", "\\varkappa", "ϰ", "Curled kappa"],
  ["lambda", "\\lambda", "λ", "Lowercase lambda"],
  ["mu", "\\mu", "μ", "Lowercase mu"],
  ["nu", "\\nu", "ν", "Lowercase nu"],
  ["xi", "\\xi", "ξ", "Lowercase xi"],
  ["omicron", "\\omicron", "ο", "Lowercase omicron"],
  ["pi", "\\pi", "π", "Lowercase pi"],
  ["varpi", "\\varpi", "ϖ", "Variant pi"],
  ["rho", "\\rho", "ρ", "Lowercase rho"],
  ["varrho", "\\varrho", "ϱ", "Variant rho"],
  ["sigma", "\\sigma", "σ", "Lowercase sigma"],
  ["varsigma", "\\varsigma", "ς", "Final sigma"],
  ["tau", "\\tau", "τ", "Lowercase tau"],
  ["upsilon", "\\upsilon", "υ", "Lowercase upsilon"],
  ["phi", "\\phi", "φ", "Lowercase phi"],
  ["varphi", "\\varphi", "ϕ", "Variant phi"],
  ["chi", "\\chi", "χ", "Lowercase chi"],
  ["psi", "\\psi", "ψ", "Lowercase psi"],
  ["omega", "\\omega", "ω", "Lowercase omega"],
]);

const uppercaseGreekSymbols = definePaletteSymbols([
  ["greek-upper-alpha", "A", "Α", "Uppercase alpha"],
  ["greek-upper-beta", "B", "Β", "Uppercase beta"],
  ["greek-upper-gamma", "\\Gamma", "Γ", "Uppercase gamma"],
  ["greek-upper-delta", "\\Delta", "Δ", "Uppercase delta"],
  ["greek-upper-epsilon", "E", "Ε", "Uppercase epsilon"],
  ["greek-upper-zeta", "Z", "Ζ", "Uppercase zeta"],
  ["greek-upper-eta", "H", "Η", "Uppercase eta"],
  ["greek-upper-theta", "\\Theta", "Θ", "Uppercase theta"],
  ["greek-upper-iota", "I", "Ι", "Uppercase iota"],
  ["greek-upper-kappa", "K", "Κ", "Uppercase kappa"],
  ["greek-upper-lambda", "\\Lambda", "Λ", "Uppercase lambda"],
  ["greek-upper-mu", "M", "Μ", "Uppercase mu"],
  ["greek-upper-nu", "N", "Ν", "Uppercase nu"],
  ["greek-upper-xi", "\\Xi", "Ξ", "Uppercase xi"],
  ["greek-upper-omicron", "O", "Ο", "Uppercase omicron"],
  ["greek-upper-pi", "\\Pi", "Π", "Uppercase pi"],
  ["greek-upper-rho", "P", "Ρ", "Uppercase rho"],
  ["greek-upper-sigma", "\\Sigma", "Σ", "Uppercase sigma"],
  ["greek-upper-tau", "T", "Τ", "Uppercase tau"],
  ["greek-upper-upsilon", "\\Upsilon", "Υ", "Uppercase upsilon"],
  ["greek-upper-phi", "\\Phi", "Φ", "Uppercase phi"],
  ["greek-upper-chi", "X", "Χ", "Uppercase chi"],
  ["greek-upper-psi", "\\Psi", "Ψ", "Uppercase psi"],
  ["greek-upper-omega", "\\Omega", "Ω", "Uppercase omega"],
]);

const letterLikeSymbols = definePaletteSymbols([
  ["letter-aleph", "\\aleph", "ℵ", "Aleph"],
  ["letter-beth", "\\beth", "ℶ", "Beth"],
  ["letter-gimel", "\\gimel", "ℷ", "Gimel"],
  ["letter-daleth", "\\daleth", "ℸ", "Daleth"],
  ["letter-hbar", "\\hbar", "ℏ", "Reduced Planck constant"],
  ["letter-hslash", "\\hslash", "ℏ", "H bar"],
  ["letter-ell", "\\ell", "ℓ", "Script small l"],
  ["letter-wp", "\\wp", "℘", "Weierstrass p"],
  ["letter-real", "\\Re", "ℜ", "Real part"],
  ["letter-imaginary", "\\Im", "ℑ", "Imaginary part"],
  ["letter-mho", "\\mho", "℧", "Mho"],
  ["letter-angstrom", "\\mathring{A}", "Å", "Angstrom"],
  ["letter-planck", "h", "ℎ", "Planck constant"],
  ["letter-capital-c", "\\mathbb{C}", "ℂ", "Complex numbers"],
  ["letter-capital-h", "\\mathbb{H}", "ℍ", "Quaternions"],
  ["letter-capital-n", "\\mathbb{N}", "ℕ", "Natural numbers"],
  ["letter-capital-p", "\\mathbb{P}", "ℙ", "Prime numbers"],
  ["letter-capital-q", "\\mathbb{Q}", "ℚ", "Rational numbers"],
  ["letter-capital-r", "\\mathbb{R}", "ℝ", "Real numbers"],
  ["letter-capital-z", "\\mathbb{Z}", "ℤ", "Integers"],
  ["letter-eth", "\\eth", "ð", "Eth"],
  ["letter-inverted-iota", "℩", "℩", "Turned Greek iota"],
]);

const commonBinarySymbols = definePaletteSymbols([
  ["binary-plus", "+", "+", "Plus"],
  ["binary-minus", "-", "−", "Minus"],
  ["binary-plus-minus", "\\pm", "±", "Plus or minus"],
  ["binary-minus-plus", "\\mp", "∓", "Minus or plus"],
  ["binary-times", "\\times", "×", "Times"],
  ["binary-divide", "\\div", "÷", "Divide"],
  ["binary-asterisk", "\\ast", "∗", "Asterisk operator"],
  ["binary-star", "\\star", "⋆", "Star operator"],
  ["binary-circle", "\\circ", "∘", "Ring operator"],
  ["binary-bullet", "\\bullet", "•", "Bullet operator"],
  ["binary-dot", "\\cdot", "⋅", "Dot operator"],
  ["binary-cap", "\\cap", "∩", "Intersection"],
  ["binary-cup", "\\cup", "∪", "Union"],
  ["binary-uplus", "\\uplus", "⊎", "Multiset union"],
  ["binary-sqcap", "\\sqcap", "⊓", "Square intersection"],
  ["binary-sqcup", "\\sqcup", "⊔", "Square union"],
  ["binary-vee", "\\vee", "∨", "Logical or"],
  ["binary-wedge", "\\wedge", "∧", "Logical and"],
  ["binary-setminus", "\\setminus", "∖", "Set minus"],
  ["binary-wreath", "\\wr", "≀", "Wreath product"],
]);

const commonRelationSymbols = definePaletteSymbols([
  ["relation-equals", "=", "=", "Equals"],
  ["relation-not-equals", "\\ne", "≠", "Not equal to"],
  ["relation-less", "<", "<", "Less than"],
  ["relation-greater", ">", ">", "Greater than"],
  ["relation-leq", "\\leq", "≤", "Less than or equal to"],
  ["relation-geq", "\\geq", "≥", "Greater than or equal to"],
  ["relation-equiv", "\\equiv", "≡", "Identical to"],
  ["relation-sim", "\\sim", "∼", "Similar to"],
  ["relation-simeq", "\\simeq", "≃", "Asymptotically equal to"],
  ["relation-approx", "\\approx", "≈", "Approximately equal to"],
  ["relation-cong", "\\cong", "≅", "Congruent to"],
  ["relation-propto", "\\propto", "∝", "Proportional to"],
  ["relation-in", "\\in", "∈", "Element of"],
  ["relation-ni", "\\ni", "∋", "Contains as member"],
  ["relation-notin", "\\notin", "∉", "Not an element of"],
  ["relation-subset", "\\subset", "⊂", "Subset of"],
  ["relation-supset", "\\supset", "⊃", "Superset of"],
  ["relation-subseteq", "\\subseteq", "⊆", "Subset of or equal to"],
  ["relation-supseteq", "\\supseteq", "⊇", "Superset of or equal to"],
  ["relation-parallel", "\\parallel", "∥", "Parallel to"],
  ["relation-perpendicular", "\\perp", "⊥", "Perpendicular to"],
]);

const narySymbols = definePaletteSymbols([
  ["nary-sum", "\\sum", "∑", "Summation"],
  ["nary-product", "\\prod", "∏", "Product"],
  ["nary-coproduct", "\\coprod", "∐", "Coproduct"],
  ["nary-integral", "\\int", "∫", "Integral"],
  ["nary-double-integral", "\\iint", "∬", "Double integral"],
  ["nary-triple-integral", "\\iiint", "∭", "Triple integral"],
  ["nary-contour-integral", "\\oint", "∮", "Contour integral"],
  ["nary-intersection", "\\bigcap", "⋂", "N-ary intersection"],
  ["nary-union", "\\bigcup", "⋃", "N-ary union"],
  ["nary-square-union", "\\bigsqcup", "⨆", "N-ary square union"],
  ["nary-logical-and", "\\bigwedge", "⋀", "N-ary logical and"],
  ["nary-logical-or", "\\bigvee", "⋁", "N-ary logical or"],
  ["nary-circled-dot", "\\bigodot", "⨀", "N-ary circled dot"],
  ["nary-circled-times", "\\bigotimes", "⨂", "N-ary circled times"],
  ["nary-circled-plus", "\\bigoplus", "⨁", "N-ary circled plus"],
  ["nary-multiset-union", "\\biguplus", "⨄", "N-ary multiset union"],
]);

const advancedBinarySymbols = definePaletteSymbols([
  ["advanced-binary-dot-plus", "\\dotplus", "∔", "Dot plus"],
  ["advanced-binary-box-plus", "\\boxplus", "⊞", "Box plus"],
  ["advanced-binary-box-minus", "\\boxminus", "⊟", "Box minus"],
  ["advanced-binary-box-times", "\\boxtimes", "⊠", "Box times"],
  ["advanced-binary-box-dot", "\\boxdot", "⊡", "Box dot"],
  [
    "advanced-binary-left-times",
    "\\ltimes",
    "⋉",
    "Left normal factor semidirect product",
  ],
  [
    "advanced-binary-right-times",
    "\\rtimes",
    "⋊",
    "Right normal factor semidirect product",
  ],
  [
    "advanced-binary-left-three-times",
    "\\leftthreetimes",
    "⋋",
    "Left three times",
  ],
  [
    "advanced-binary-right-three-times",
    "\\rightthreetimes",
    "⋌",
    "Right three times",
  ],
  ["advanced-binary-curly-vee", "\\curlyvee", "⋎", "Curly logical or"],
  ["advanced-binary-curly-wedge", "\\curlywedge", "⋏", "Curly logical and"],
  ["advanced-binary-circled-asterisk", "\\circledast", "⊛", "Circled asterisk"],
  ["advanced-binary-circled-circle", "\\circledcirc", "⊚", "Circled ring"],
  ["advanced-binary-circled-dash", "\\circleddash", "⊝", "Circled dash"],
  ["advanced-binary-dagger", "\\dagger", "†", "Dagger"],
  ["advanced-binary-double-dagger", "\\ddagger", "‡", "Double dagger"],
  ["advanced-binary-amalgamation", "\\amalg", "⨿", "Amalgamation"],
]);

const advancedRelationSymbols = definePaletteSymbols([
  ["advanced-relation-less-dot", "\\lessdot", "⋖", "Less than with dot"],
  ["advanced-relation-greater-dot", "\\gtrdot", "⋗", "Greater than with dot"],
  ["advanced-relation-much-less", "\\ll", "≪", "Much less than"],
  ["advanced-relation-much-greater", "\\gg", "≫", "Much greater than"],
  ["advanced-relation-triple-less", "\\lll", "⋘", "Very much less than"],
  ["advanced-relation-triple-greater", "\\ggg", "⋙", "Very much greater than"],
  ["advanced-relation-less-sim", "\\lesssim", "≲", "Less than or similar to"],
  [
    "advanced-relation-greater-sim",
    "\\gtrsim",
    "≳",
    "Greater than or similar to",
  ],
  [
    "advanced-relation-less-approx",
    "\\lessapprox",
    "⪅",
    "Less than or approximately equal to",
  ],
  [
    "advanced-relation-greater-approx",
    "\\gtrapprox",
    "⪆",
    "Greater than or approximately equal to",
  ],
  ["advanced-relation-precedes", "\\prec", "≺", "Precedes"],
  ["advanced-relation-succeeds", "\\succ", "≻", "Succeeds"],
  ["advanced-relation-precedes-eq", "\\preceq", "⪯", "Precedes or equals"],
  ["advanced-relation-succeeds-eq", "\\succeq", "⪰", "Succeeds or equals"],
  ["advanced-relation-dot-eq", "\\doteq", "≐", "Approaches the limit"],
  ["advanced-relation-asymp", "\\asymp", "≍", "Equivalent to"],
  ["advanced-relation-bowtie", "\\bowtie", "⋈", "Bowtie relation"],
  ["advanced-relation-pitchfork", "\\pitchfork", "⋔", "Pitchfork relation"],
  ["advanced-relation-vdash", "\\vdash", "⊢", "Right tack"],
  ["advanced-relation-dashv", "\\dashv", "⊣", "Left tack"],
  ["advanced-relation-models", "\\models", "⊨", "Models"],
]);

const arrowSymbols = definePaletteSymbols([
  ["arrow-left", "\\leftarrow", "←", "Left arrow"],
  ["arrow-right", "\\rightarrow", "→", "Right arrow"],
  ["arrow-up", "\\uparrow", "↑", "Up arrow"],
  ["arrow-down", "\\downarrow", "↓", "Down arrow"],
  ["arrow-left-right", "\\leftrightarrow", "↔", "Left right arrow"],
  ["arrow-up-down", "\\updownarrow", "↕", "Up down arrow"],
  ["arrow-double-left", "\\Leftarrow", "⇐", "Double left arrow"],
  ["arrow-double-right", "\\Rightarrow", "⇒", "Double right arrow"],
  ["arrow-double-up", "\\Uparrow", "⇑", "Double up arrow"],
  ["arrow-double-down", "\\Downarrow", "⇓", "Double down arrow"],
  [
    "arrow-double-left-right",
    "\\Leftrightarrow",
    "⇔",
    "Double left right arrow",
  ],
  ["arrow-double-up-down", "\\Updownarrow", "⇕", "Double up down arrow"],
  ["arrow-ne", "\\nearrow", "↗", "North east arrow"],
  ["arrow-se", "\\searrow", "↘", "South east arrow"],
  ["arrow-sw", "\\swarrow", "↙", "South west arrow"],
  ["arrow-nw", "\\nwarrow", "↖", "North west arrow"],
  ["arrow-mapsto", "\\mapsto", "↦", "Maps to"],
  ["arrow-hook-left", "\\hookleftarrow", "↩", "Left hook arrow"],
  ["arrow-hook-right", "\\hookrightarrow", "↪", "Right hook arrow"],
  ["arrow-left-harpoon-up", "\\leftharpoonup", "↼", "Left harpoon up"],
  ["arrow-left-harpoon-down", "\\leftharpoondown", "↽", "Left harpoon down"],
  ["arrow-right-harpoon-up", "\\rightharpoonup", "⇀", "Right harpoon up"],
  ["arrow-right-harpoon-down", "\\rightharpoondown", "⇁", "Right harpoon down"],
  ["arrow-long-left", "\\longleftarrow", "⟵", "Long left arrow"],
  ["arrow-long-right", "\\longrightarrow", "⟶", "Long right arrow"],
  [
    "arrow-long-left-right",
    "\\longleftrightarrow",
    "⟷",
    "Long left right arrow",
  ],
  ["arrow-long-double-left", "\\Longleftarrow", "⟸", "Long double left arrow"],
  [
    "arrow-long-double-right",
    "\\Longrightarrow",
    "⟹",
    "Long double right arrow",
  ],
  [
    "arrow-long-double-left-right",
    "\\Longleftrightarrow",
    "⟺",
    "Long double left right arrow",
  ],
  ["arrow-reversible", "\\rightleftharpoons", "⇌", "Right-left harpoons"],
]);

const negatedRelationSymbols = definePaletteSymbols([
  ["negated-less", "\\nless", "≮", "Not less than"],
  ["negated-greater", "\\ngtr", "≯", "Not greater than"],
  ["negated-leq", "\\nleq", "≰", "Neither less than nor equal to"],
  ["negated-geq", "\\ngeq", "≱", "Neither greater than nor equal to"],
  ["negated-prec", "\\nprec", "⊀", "Does not precede"],
  ["negated-succ", "\\nsucc", "⊁", "Does not succeed"],
  ["negated-subset", "\\nsubset", "⊄", "Not a subset of"],
  ["negated-supset", "\\nsupset", "⊅", "Not a superset of"],
  ["negated-subseteq", "\\nsubseteq", "⊈", "Neither a subset nor equal to"],
  ["negated-supseteq", "\\nsupseteq", "⊉", "Neither a superset nor equal to"],
  ["negated-parallel", "\\nparallel", "∦", "Not parallel to"],
  ["negated-mid", "\\nmid", "∤", "Does not divide"],
  ["negated-vdash", "\\nvdash", "⊬", "Does not prove"],
  ["negated-models", "\\nvDash", "⊭", "Does not model"],
  ["negated-in", "\\notin", "∉", "Not an element of"],
  ["negated-contains", "\\not\\ni", "∌", "Does not contain as member"],
  ["negated-sim", "\\nsim", "≁", "Not similar to"],
  ["negated-cong", "\\ncong", "≇", "Not congruent to"],
  ["negated-equiv", "\\not\\equiv", "≢", "Not identical to"],
  ["negated-equals", "\\ne", "≠", "Not equal to"],
]);

const geometrySymbols = definePaletteSymbols([
  ["geometry-right-angle", "\\rightangle", "∟", "Right angle"],
  ["geometry-angle", "\\angle", "∠", "Angle"],
  ["geometry-measured-angle", "\\measuredangle", "∡", "Measured angle"],
  ["geometry-spherical-angle", "\\sphericalangle", "∢", "Spherical angle"],
  ["geometry-perpendicular", "\\perp", "⊥", "Perpendicular"],
  ["geometry-triangle", "\\triangle", "△", "Triangle"],
  ["geometry-black-triangle", "\\blacktriangle", "▲", "Black triangle"],
  ["geometry-down-triangle", "\\triangledown", "▽", "Down-pointing triangle"],
  [
    "geometry-black-down-triangle",
    "\\blacktriangledown",
    "▼",
    "Black down-pointing triangle",
  ],
  ["geometry-square", "\\square", "□", "Square"],
  ["geometry-black-square", "\\blacksquare", "■", "Black square"],
  ["geometry-diamond", "\\diamond", "◇", "Diamond"],
  ["geometry-lozenge", "\\lozenge", "◊", "Lozenge"],
  ["geometry-black-lozenge", "\\blacklozenge", "◆", "Black lozenge"],
  ["geometry-circle", "\\bigcirc", "○", "Circle"],
  ["geometry-circled-dot", "\\odot", "⊙", "Circled dot"],
  ["geometry-circled-plus", "\\oplus", "⊕", "Circled plus"],
  ["geometry-circled-times", "\\otimes", "⊗", "Circled times"],
  ["geometry-parallel", "\\parallel", "∥", "Parallel"],
  ["geometry-therefore", "\\therefore", "∴", "Therefore"],
  ["geometry-because", "\\because", "∵", "Because"],
  ["geometry-end-proof", "\\blacksquare", "■", "End of proof"],
]);

/**
 * Word-compatible symbol subsets used by the contextual Formula ribbon.
 * Group order follows Microsoft's public Insert mathematical symbols catalog.
 */
export const EQUATION_SYMBOL_GROUPS: readonly EquationSymbolGroup[] =
  Object.freeze([
    Object.freeze({
      id: "basicMath",
      label: "Basic Math",
      labelZh: "基础数学",
      symbols: basicMathSymbols,
    }),
    Object.freeze({
      id: "lowercaseGreek",
      label: "Lowercase Greek",
      labelZh: "小写希腊字母",
      symbols: lowercaseGreekSymbols,
    }),
    Object.freeze({
      id: "uppercaseGreek",
      label: "Uppercase Greek",
      labelZh: "大写希腊字母",
      symbols: uppercaseGreekSymbols,
    }),
    Object.freeze({
      id: "letterLike",
      label: "Letter-like Symbols",
      labelZh: "字母类符号",
      symbols: letterLikeSymbols,
    }),
    Object.freeze({
      id: "commonBinary",
      label: "Common Binary Operators",
      labelZh: "常用二元运算符",
      symbols: commonBinarySymbols,
    }),
    Object.freeze({
      id: "commonRelations",
      label: "Common Relation Operators",
      labelZh: "常用关系运算符",
      symbols: commonRelationSymbols,
    }),
    Object.freeze({
      id: "nary",
      label: "Basic N-ary Operators",
      labelZh: "基本 N 元运算符",
      symbols: narySymbols,
    }),
    Object.freeze({
      id: "advancedBinary",
      label: "Advanced Binary Operators",
      labelZh: "高级二元运算符",
      symbols: advancedBinarySymbols,
    }),
    Object.freeze({
      id: "advancedRelations",
      label: "Advanced Relation Operators",
      labelZh: "高级关系运算符",
      symbols: advancedRelationSymbols,
    }),
    Object.freeze({
      id: "arrows",
      label: "Arrows",
      labelZh: "箭头",
      symbols: arrowSymbols,
    }),
    Object.freeze({
      id: "negatedRelations",
      label: "Negated Relations",
      labelZh: "求反关系运算符",
      symbols: negatedRelationSymbols,
    }),
    Object.freeze({
      id: "script",
      label: "Script",
      labelZh: "手写体",
      symbols: defineStyledAlphabetSymbols("script", "mathcal", "Script"),
    }),
    Object.freeze({
      id: "fraktur",
      label: "Fraktur",
      labelZh: "德国哥特体",
      symbols: defineStyledAlphabetSymbols("fraktur", "mathfrak", "Fraktur"),
    }),
    Object.freeze({
      id: "doubleStruck",
      label: "Double-struck",
      labelZh: "双线体",
      symbols: defineStyledAlphabetSymbols(
        "doubleStruck",
        "mathbb",
        "Double-struck",
      ),
    }),
    Object.freeze({
      id: "geometry",
      label: "Geometry",
      labelZh: "几何图形",
      symbols: geometrySymbols,
    }),
  ]);

/** Frozen flat index used by the live editor's fail-closed command seam. */
export const EQUATION_PALETTE_SYMBOLS: readonly EquationPaletteSymbol[] =
  Object.freeze(EQUATION_SYMBOL_GROUPS.flatMap((group) => [...group.symbols]));

const equationPaletteSymbolById = new Map(
  EQUATION_PALETTE_SYMBOLS.map((symbol) => [symbol.id, symbol] as const),
);

if (equationPaletteSymbolById.size !== EQUATION_PALETTE_SYMBOLS.length) {
  throw new Error("Equation symbol palette contains duplicate identities");
}

export function resolveEquationPaletteSymbol(
  id: string,
): EquationPaletteSymbol | null {
  return equationPaletteSymbolById.get(id) ?? null;
}

/** TipTap node names the catalog targets (kept in sync with the extensions). */
export const EQUATION_NODE_BY_TARGET: Record<EquationTarget, string> = {
  block: "mathBlock",
  inline: "inlineMath",
};

/**
 * Build the `insertContent` payload for a template — the exact shape the
 * toolbar's other math insertions dispatch (`{ type, attrs: { latex } }`).
 */
export function equationInsertPayload(template: EquationTemplate): {
  type: string;
  attrs: { latex: string };
} {
  return {
    type: EQUATION_NODE_BY_TARGET[template.target],
    attrs: { latex: template.latex },
  };
}

/**
 * Build the `insertContent` payload for a built-in gallery equation. Resolved
 * from the frozen catalog by id so a caller can never smuggle in its own LaTeX.
 * Returns `null` for an unknown id instead of inserting something arbitrary.
 */
export function equationGalleryInsertPayload(id: string): {
  type: string;
  attrs: { latex: string };
} | null {
  const entry = resolveEquationGalleryEntry(id);
  if (!entry) return null;
  return {
    type: EQUATION_NODE_BY_TARGET[entry.target],
    attrs: { latex: entry.latex },
  };
}

/**
 * Build the `insertContent` payload for a symbol — always an inline math node
 * carrying the single LaTeX token.
 */
export function symbolInsertPayload(symbol: MathSymbol): {
  type: string;
  attrs: { latex: string };
} {
  return {
    type: EQUATION_NODE_BY_TARGET.inline,
    attrs: { latex: symbol.latex },
  };
}
