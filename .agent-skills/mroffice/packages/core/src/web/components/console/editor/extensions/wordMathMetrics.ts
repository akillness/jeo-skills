/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import katex from "katex";

/** Extents in em of the equation's font size, from its baseline. */
export interface WordMathExtents {
  readonly ascent: number;
  readonly descent: number;
}

type GlyphTable = Readonly<Record<string, readonly [number, number]>>;
/** `inner`: the text style of a display fraction's parts and a stack's
 * cells -- Word keeps them, and a fraction inside them, at full size (only
 * the text-style shifts apply), where an in-line fraction's parts shrink. */
/** How much higher a superscript with a structure of its own stands, in em. */
const NESTED_SUP_RISE = 0.35;
/** A superscript holding a script of its own: x^{j^k} 16.8 pt at 12 pt. */
const SCRIPTED_SUP_RISE = 0.07;
/** How far each side of the math axis a delimiter reaches with others inside it,
 * by how many (measured at 12 pt, 16.3 and 21.6 pt tall; the rest by the ratio). */
const NESTED_DELIMITER_HALF = [0.605, 0.83, 1.09, 1.36] as const;
/** How far above the baseline an arrow's axis stands, and its label over it, in em. */
const ARROW_RISE = 0.3;
const LABEL_GAP = 0.15;
type Style = "display" | "inner" | "text" | "script" | "scriptscript";

interface Box {
  /** How deep the delimiters in it are nested. */
  delimiters?: number;
  /** Above the baseline, em of the main size. */
  a: number;
  /** Below the baseline. */
  d: number;
}

// Cambria Math (MATH table, 2048 units per em), in em.
const AXIS = 0.2856;
const RULE = 0.0649;
const FRAC_NUM_SHIFT_DISPLAY = 0.7568;
const FRAC_DEN_SHIFT_DISPLAY = 0.6689;
const FRAC_GAP_DISPLAY = 0.127;
const FRAC_NUM_SHIFT = 0.5859;
const FRAC_DEN_SHIFT = 0.5029;
const FRAC_GAP = 0.0649;
const STACK_TOP_SHIFT_DISPLAY = 0.7568;
const STACK_BOTTOM_SHIFT_DISPLAY = 0.6689;
const STACK_GAP_DISPLAY = 0.3223;
const STACK_TOP_SHIFT = 0.459;
const STACK_BOTTOM_SHIFT = 0.376;
const STACK_GAP = 0.1953;
const SUP_SHIFT = 0.3662;
const SUP_BOTTOM_MIN = 0.1167;
const SUP_BASELINE_DROP_MAX = 0.2246;
const SUB_SHIFT = 0.2041;
const SUB_BASELINE_DROP_MIN = 0.1562;
const SUB_TOP_MAX = 0.3711;
const SUB_SUP_GAP_MIN = 0.1465;
const UPPER_LIMIT_GAP = 0.0649;
const UPPER_LIMIT_RISE = 0.2441;
const LOWER_LIMIT_GAP = 0.0649;
const LOWER_LIMIT_DROP = 0.6055;
const RADICAL_GAP_DISPLAY = 0.1685;
const RADICAL_GAP = 0.0811;
const RADICAL_EXTRA_ASCENDER = 0.0649;








const RADICAL_VARIANT_SLACK = 0.06;
const BAR_GAP = 0.1685;
const ACCENT_BASE_HEIGHT = 0.4766;
/** N̂ 14.9 pt at 12 pt in Word. */
const ACCENT_RISE = 0.21;
/** A stack's rows (matrix, equation array): one Cambria line apart. */
const ROW_PITCH = 1.17;
/** Cambria Math's own line: the floor of every math line. */
const LINE_ASCENT = 0.9502;
const LINE_DESCENT = 0.2222;
/** Above the ink, Word's line takes this much more (measured). */
const LEADING = 0.14;
/** Word's script sizes. */
const SCALE: Record<Style, number> = { display: 1, inner: 1, text: 1, script: 0.7, scriptscript: 0.5 };
/** Display-size operator glyphs (the variant Word draws), [depth, height]. */
const DISPLAY_SUM: readonly [number, number] = [0.669, 1.24];
const DISPLAY_INTEGRAL: readonly [number, number] = [0.792, 1.358];
const TEXT_SUM: readonly [number, number] = [0.21, 0.699];
const TEXT_INTEGRAL: readonly [number, number] = [0.206, 0.877];
/** The surd's variants, [depth, height]. */
const SURDS: readonly (readonly [number, number])[] = [
  [0.042, 0.921], [0.278, 0.963], [0.798, 1.432], [1.34, 1.994], [1.902, 2.555], [2.463, 3.117],
];
/** A parenthesis at its own size, [depth, height]. */
const DELIMITER: readonly [number, number] = [0.221, 0.706];
/** A Chinese, Japanese or Korean character: its text font's line box. */
const EAST_ASIAN: readonly [number, number] = [0.296, 1.009];
/** A glyph the table does not know. */
const OTHER: readonly [number, number] = [0.22, 0.7];
const EAST_ASIAN_CHAR = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u;
const INTEGRALS = new Set(["\\int", "\\iint", "\\iiint", "\\oint", "\\oiint", "\\oiiint", "∫", "∬", "∭", "∮"]);
const SIZING = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.44, 1.728, 2.074, 2.488];
/** An n-ary operator's limits in a line of text: how far its superscript's
 * baseline stands above the line's and its subscript's below (with and without
 * a superscript), in em (Windows Word 16, probes/vsp10 m4). */
const INLINE_NARY_SHIFTS = { sup: 0.41, sub: 0.24, subAlone: 0.2 } as const;
const INLINE_INTEGRAL_SHIFTS = { sup: 0.61, sub: 0.41, subAlone: 0.41 } as const;
/** `window.__docsInlineNaryOff = true` (A/B): an in-line n-ary's limits by the
 * glyph's extents, the older reading. */
function inlineNaryOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsInlineNaryOff?: boolean }).__docsInlineNaryOff === true;
}

/** Commands that stand for one glyph, by the character Word draws. */
const COMMAND_CHARS: Record<string, string> = {
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\epsilon": "ϵ", "\\varepsilon": "ε",
  "\\zeta": "ζ", "\\eta": "η", "\\theta": "θ", "\\vartheta": "ϑ", "\\iota": "ι", "\\kappa": "κ",
  "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ", "\\pi": "π", "\\varpi": "ϖ", "\\rho": "ρ",
  "\\varrho": "ϱ", "\\sigma": "σ", "\\varsigma": "ς", "\\tau": "τ", "\\upsilon": "υ", "\\phi": "ϕ",
  "\\varphi": "φ", "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω", "\\Gamma": "Γ", "\\Delta": "Δ",
  "\\Theta": "Θ", "\\Lambda": "Λ", "\\Xi": "Ξ", "\\Pi": "Π", "\\Sigma": "Σ", "\\Upsilon": "Υ",
  "\\Phi": "Φ", "\\Psi": "Ψ", "\\Omega": "Ω", "\\cdot": "·", "\\times": "×", "\\div": "÷", "\\pm": "±",
  "\\le": "≤", "\\leq": "≤", "\\ge": "≥", "\\geq": "≥", "\\ne": "≠", "\\neq": "≠", "\\approx": "≈",
  "\\equiv": "≡", "\\sim": "∼", "\\propto": "∝", "\\infty": "∞", "\\partial": "∂", "\\nabla": "∇",
  "\\to": "→", "\\rightarrow": "→", "\\leftarrow": "←", "\\leftrightarrow": "↔", "\\Rightarrow": "⇒",
  "\\Leftrightarrow": "⇔", "\\in": "∈", "\\notin": "∉", "\\subset": "⊂", "\\supset": "⊃",
  "\\subseteq": "⊆", "\\supseteq": "⊇", "\\cup": "∪", "\\cap": "∩", "\\wedge": "∧", "\\vee": "∨",
  "\\neg": "¬", "\\forall": "∀", "\\exists": "∃", "\\emptyset": "∅", "\\varnothing": "∅",
  "\\prime": "′", "\\circ": "°", "\\ldots": "…", "\\dots": "…", "\\cdots": "⋯", "\\langle": "⟨",
  "\\rangle": "⟩", "\\|": "‖", "\\vert": "|", "\\mid": "|", "\\lvert": "|", "\\rvert": "|",
  "\\{": "{", "\\}": "}", "\\lbrace": "{", "\\rbrace": "}", "\\lbrack": "[", "\\rbrack": "]",
  "\\minus": "−", "-": "−", "\\%": "%", "\\&": "&", "\\#": "#", "\\$": "$",
};

const UPRIGHT: GlyphTable = {
  "0":[0.008,0.674],"1":[0.0,0.674],"2":[0.0,0.674],"3":[0.008,0.674],"4":[0.0,0.67],
  "5":[0.008,0.699],"6":[0.008,0.674],"7":[0.003,0.667],"8":[0.008,0.674],"9":[0.008,0.674],
  "a":[0.008,0.475],"b":[0.008,0.699],"c":[0.008,0.475],"d":[0.008,0.699],"e":[0.008,0.475],
  "f":[0.0,0.701],"g":[0.218,0.475],"h":[0.0,0.699],"i":[0.0,0.658],"j":[0.216,0.658],"k":[0.0,0.699],
  "l":[0.0,0.699],"m":[0.0,0.475],"n":[0.0,0.475],"o":[0.008,0.475],"p":[0.21,0.475],"q":[0.21,0.475],
  "r":[0.0,0.475],"s":[0.008,0.475],"t":[0.008,0.587],"u":[0.008,0.467],"v":[0.005,0.467],
  "w":[0.002,0.467],"x":[0.0,0.467],"y":[0.214,0.467],"z":[0.0,0.467],"A":[0.0,0.674],"B":[0.0,0.667],
  "C":[0.008,0.674],"D":[0.0,0.667],"E":[0.0,0.667],"F":[0.0,0.667],"G":[0.008,0.674],"H":[0.0,0.667],
  "I":[0.0,0.667],"J":[0.191,0.667],"K":[0.0,0.667],"L":[0.0,0.667],"M":[0.0,0.667],"N":[0.003,0.667],
  "O":[0.008,0.674],"P":[0.0,0.667],"Q":[0.187,0.674],"R":[0.0,0.667],"S":[0.008,0.674],
  "T":[0.0,0.667],"U":[0.008,0.667],"V":[0.008,0.667],"W":[0.003,0.667],"X":[0.0,0.667],
  "Y":[0.0,0.667],"Z":[0.0,0.667],"+":[0.028,0.6],"-":[-0.219,0.295],"=":[-0.152,0.419],
  "<":[0.018,0.589],">":[0.018,0.589],"(":[0.221,0.706],")":[0.221,0.706],"[":[0.224,0.708],
  "]":[0.224,0.708],"{":[0.224,0.708],"}":[0.224,0.708],"|":[0.21,0.699],"/":[0.21,0.699],
  ".":[0.0,0.113],",":[0.135,0.113],";":[0.135,0.441],":":[0.0,0.441],"!":[0.0,0.667],"?":[0.0,0.674],
  "'":[-0.466,0.699],"*":[-0.331,0.699],"^":[-0.33,0.674],"_":[0.118,-0.061],"~":[-0.201,0.371],
  "\"":[-0.471,0.699],"−":[-0.253,0.318],"±":[0.1,0.658],"×":[-0.015,0.553],"÷":[-0.056,0.516],
  "·":[-0.226,0.35],"≤":[0.054,0.625],"≥":[0.054,0.625],"≠":[0.02,0.576],"≈":[-0.102,0.466],
  "≡":[-0.051,0.521],"∼":[-0.201,0.371],"∝":[-0.042,0.529],"∞":[-0.085,0.486],"∂":[0.008,0.702],
  "∇":[0.008,0.667],"→":[-0.084,0.487],"←":[-0.084,0.487],"↔":[-0.084,0.487],"⇒":[-0.031,0.54],
  "⇔":[-0.031,0.54],"∈":[0.0,0.575],"∉":[0.086,0.661],"⊂":[-0.058,0.516],"⊃":[-0.058,0.516],
  "⊆":[0.0,0.605],"⊇":[0.0,0.605],"∪":[0.007,0.575],"∩":[0.0,0.583],"∧":[0.0,0.577],"∨":[0.001,0.575],
  "¬":[0.02,0.325],"∀":[0.0,0.625],"∃":[0.0,0.623],"∅":[0.086,0.708],"′":[-0.455,0.766],
  "″":[-0.455,0.766],"°":[-0.382,0.674],"…":[0.0,0.113],"⋯":[-0.223,0.349],"⟨":[0.212,0.701],
  "⟩":[0.212,0.701],"‖":[0.21,0.699],"√":[0.042,0.921],"∑":[0.21,0.699],"∏":[0.21,0.699],
  "∫":[0.206,0.877],"∮":[0.206,0.877],"%":[0.055,0.674],"&":[0.008,0.674],"#":[0.0,0.667],
  "$":[0.076,0.747],"@":[0.076,0.674],"α":[0.008,0.475],"β":[0.211,0.701],"γ":[0.196,0.477],
  "δ":[0.008,0.7],"ε":[0.008,0.477],"ζ":[0.21,0.674],"η":[0.21,0.475],"θ":[0.008,0.694],
  "ι":[0.008,0.467],"κ":[0.008,0.477],"λ":[0.008,0.699],"μ":[0.196,0.467],"ν":[0.004,0.467],
  "ξ":[0.21,0.701],"ο":[0.008,0.475],"π":[0.008,0.467],"ρ":[0.211,0.477],"σ":[0.008,0.468],
  "τ":[0.008,0.468],"υ":[0.008,0.477],"φ":[0.211,0.477],"χ":[0.191,0.475],"ψ":[0.21,0.674],
  "ω":[0.008,0.477],"Γ":[0.0,0.669],"Δ":[0.0,0.674],"Θ":[0.008,0.674],"Λ":[0.0,0.674],"Ξ":[0.0,0.667],
  "Π":[0.0,0.667],"Σ":[0.0,0.667],"Υ":[0.0,0.674],"Φ":[0.0,0.667],"Ψ":[0.0,0.667],"Ω":[0.0,0.674],
  "ϕ":[0.21,0.684],"ϵ":[0.008,0.475],"ϑ":[0.008,0.684],"ϖ":[0.008,0.467],"ϱ":[0.217,0.475],
};

const ITALIC: GlyphTable = {
  "A":[0.0,0.674],"B":[0.0,0.667],"C":[0.008,0.674],"D":[0.0,0.667],"E":[0.0,0.667],"F":[0.0,0.667],
  "G":[0.008,0.674],"H":[0.0,0.667],"I":[0.0,0.667],"J":[0.189,0.667],"K":[0.0,0.667],"L":[0.0,0.667],
  "M":[0.0,0.667],"N":[0.0,0.667],"O":[0.008,0.674],"P":[0.0,0.667],"Q":[0.187,0.674],"R":[0.0,0.667],
  "S":[0.008,0.674],"T":[0.0,0.667],"U":[0.008,0.667],"V":[0.008,0.667],"W":[0.006,0.667],
  "X":[0.0,0.667],"Y":[0.0,0.667],"Z":[0.0,0.667],"a":[0.008,0.475],"b":[0.008,0.698],
  "c":[0.008,0.475],"d":[0.008,0.698],"e":[0.008,0.475],"f":[0.218,0.701],"g":[0.218,0.475],
  "h":[0.008,0.698],"i":[0.008,0.658],"j":[0.218,0.658],"k":[0.008,0.698],"l":[0.008,0.698],
  "m":[0.008,0.475],"n":[0.008,0.475],"o":[0.008,0.475],"p":[0.21,0.475],"q":[0.21,0.475],
  "r":[0.0,0.475],"s":[0.008,0.475],"t":[0.008,0.587],"u":[0.008,0.475],"v":[0.008,0.477],
  "w":[0.008,0.467],"x":[0.008,0.475],"y":[0.213,0.475],"z":[0.0,0.467],"α":[0.008,0.475],
  "β":[0.21,0.699],"γ":[0.196,0.475],"δ":[0.008,0.701],"ε":[0.008,0.475],"ζ":[0.206,0.675],
  "η":[0.211,0.475],"θ":[0.008,0.685],"ι":[0.008,0.467],"κ":[0.008,0.475],"λ":[0.008,0.699],
  "μ":[0.196,0.467],"ν":[0.004,0.475],"ξ":[0.206,0.698],"ο":[0.008,0.475],"π":[0.008,0.467],
  "ρ":[0.211,0.475],"ς":[0.207,0.475],"σ":[0.008,0.467],"τ":[0.008,0.467],"υ":[0.008,0.475],
  "φ":[0.211,0.476],"χ":[0.191,0.475],"ψ":[0.21,0.685],"ω":[0.008,0.475],"Α":[0.0,0.674],
  "Β":[0.0,0.667],"Γ":[0.0,0.667],"Δ":[0.0,0.674],"Ε":[0.0,0.667],"Ζ":[0.0,0.667],"Η":[0.0,0.667],
  "Θ":[0.008,0.674],"Ι":[0.0,0.667],"Κ":[0.0,0.667],"Λ":[-0.0,0.675],"Μ":[0.0,0.667],"Ν":[0.0,0.667],
  "Ξ":[0.0,0.667],"Ο":[0.008,0.674],"Π":[0.0,0.667],"Ρ":[0.0,0.667],"ϴ":[0.008,0.674],"Σ":[0.0,0.667],
  "Τ":[0.0,0.667],"Υ":[0.0,0.674],"Φ":[0.0,0.667],"Χ":[0.0,0.667],"Ψ":[0.0,0.667],"Ω":[0.0,0.674],
};

class Unknown extends Error {}

type ParseNode = { type: string; [key: string]: unknown };

const childStyle = (style: Style): Style =>
  style === "display" || style === "inner" || style === "text" ? "script" : "scriptscript";
const fractionChildStyle = (style: Style): Style =>
  style === "display" || style === "inner" ? "inner" : style === "text" ? "script" : "scriptscript";

function glyph(text: string, font: "italic" | "upright", s: number): Box {
  const box: Box = { a: 0, d: 0 };
  const char = COMMAND_CHARS[text] ?? text;
  for (const ch of Array.from(char)) {
    if (ch.trim() === "") continue;
    const ink = EAST_ASIAN_CHAR.test(ch)
      ? EAST_ASIAN
      : (font === "italic" ? ITALIC[ch] : undefined) ?? UPRIGHT[ch] ?? ITALIC[ch] ?? OTHER;
    box.d = Math.max(box.d, ink[0] * s);
    box.a = Math.max(box.a, ink[1] * s);
  }
  return box;
}

function row(nodes: unknown, style: Style, upright: boolean): Box {
  const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
  const box: Box = { a: 0, d: 0 };
  for (const node of list) {
    const part = layout(node as ParseNode, style, upright);
    box.a = Math.max(box.a, part.a);
    box.d = Math.max(box.d, part.d);
    if (part.delimiters) box.delimiters = Math.max(box.delimiters ?? 0, part.delimiters);
  }
  return box;
}

function fraction(node: ParseNode, style: Style, upright: boolean): Box {
  const size = node.size === "display" ? "display" : node.size === "text" ? "text" : style;
  const display = size === "display";
  const s = SCALE[size];
  const inner = fractionChildStyle(size);
  const num = row(node.numer, inner, upright);
  const den = row(node.denom, inner, upright);
  let u: number;
  let v: number;
  if (node.hasBarLine !== false) {
    const gap = (display ? FRAC_GAP_DISPLAY : FRAC_GAP) * s;
    u = Math.max((display ? FRAC_NUM_SHIFT_DISPLAY : FRAC_NUM_SHIFT) * s, (AXIS + RULE / 2) * s + gap + num.d);
    v = Math.max((display ? FRAC_DEN_SHIFT_DISPLAY : FRAC_DEN_SHIFT) * s, den.a + gap + (RULE / 2 - AXIS) * s);
  } else {
    u = (display ? STACK_TOP_SHIFT_DISPLAY : STACK_TOP_SHIFT) * s;
    v = (display ? STACK_BOTTOM_SHIFT_DISPLAY : STACK_BOTTOM_SHIFT) * s;
    const gap = u - num.d - (den.a - v);
    const min = (display ? STACK_GAP_DISPLAY : STACK_GAP) * s;
    if (gap < min) {
      u += (min - gap) / 2;
      v += (min - gap) / 2;
    }
  }
  const box = { a: u + num.a, d: v + den.d };
  return node.leftDelim || node.rightDelim ? delimited(box, s) : box;
}

/** Delimiters around `box`: the parenthesis glyph at its own size while the
 * content fits in it, grown to cover the content symmetrically about the
 * math axis once it does not (Word's [f(g(x))]' is no taller than its
 * parentheses). */
function delimited(box: Box, s: number): Box {
  const inner = box.delimiters ?? 0;
  const delimiters = inner + 1;
  // A delimiter around another takes the next size up, whether or not the content
  // needs it (Word 16.86 at 12 pt: (x) 14.2, ((x)) 16.3, (((x))) 21.6 pt).
  const nested = inner > 0 ? NESTED_DELIMITER_HALF[Math.min(inner, NESTED_DELIMITER_HALF.length) - 1]! * s : 0;
  if (!nested && box.a <= DELIMITER[1] * s && box.d <= DELIMITER[0] * s) {
    return { a: DELIMITER[1] * s, d: DELIMITER[0] * s, delimiters };
  }
  const half = Math.max(box.a - AXIS * s, box.d + AXIS * s, nested);
  return {
    a: Math.max(box.a, AXIS * s + half, DELIMITER[1] * s),
    d: Math.max(box.d, half - AXIS * s, DELIMITER[0] * s),
    delimiters,
  };
}

function operator(node: ParseNode, style: Style): Box {
  const s = SCALE[style];
  if (node.symbol) {
    const name = String(node.name ?? "");
    const integral = INTEGRALS.has(name);
    const ink = style === "display"
      ? (integral ? DISPLAY_INTEGRAL : DISPLAY_SUM)
      : (integral ? TEXT_INTEGRAL : TEXT_SUM);
    // In a line of text Word centres the operator nearer the math axis: ∑ 0.04 em
    // up, ∫ 0.05 em down (probes/vsp10 m4; ∫x's line 0.26 em deep, not 0.21).
    const shift = style === "text" && !inlineNaryOff() ? (integral ? -0.05 : 0.04) : 0;
    return { a: (ink[1] + shift) * s, d: (ink[0] - shift) * s };
  }
  if (Array.isArray(node.body)) return row(node.body, style, true);
  return glyph(String(node.name ?? "").replace(/^\\/, ""), "upright", s);
}

/** A base that is one character: a symbol, or a group or font of one. */
function isSingleGlyph(node: ParseNode | undefined): boolean {
  if (!node) return false;
  // A script goes by the letter under an accent, not by the accent: Word's N̂^† is
  // 14.6 pt at 12 pt, raised over the hat it was 18.5.
  if (node.type === "accent") return isSingleGlyph(node.base as ParseNode | undefined);
  if (node.type === "mathord" || node.type === "textord" || node.type === "atom") {
    return Array.from(COMMAND_CHARS[String(node.text ?? "")] ?? String(node.text ?? "")).length === 1;
  }
  if (node.type === "ordgroup" || node.type === "font" || node.type === "mclass") {
    const body = node.type === "font" ? [node.body] : node.body;
    return Array.isArray(body) && body.length === 1 && isSingleGlyph(body[0] as ParseNode);
  }
  return false;
}

const isEmptyGroup = (node: ParseNode | undefined): boolean =>
  !node || (node.type === "ordgroup" && Array.isArray(node.body) && node.body.length === 0);

/** Whether a script holds a fraction or a script of its own. */
function holdsStack(node: ParseNode | undefined): boolean {
  if (!node) return false;
  if (node.type === "supsub" || node.type === "genfrac") return true;
  const body = node.type === "ordgroup" || node.type === "mclass" || node.type === "styling" ? node.body : null;
  return Array.isArray(body) && body.some((child) => holdsStack(child as ParseNode));
}

function holdsFraction(node: ParseNode | undefined): boolean {
  if (!node) return false;
  if (node.type === "genfrac") return true;
  const body = node.type === "ordgroup" || node.type === "mclass" || node.type === "styling" ? node.body : null;
  return Array.isArray(body) && body.some((child) => holdsFraction(child as ParseNode));
}

function scripts(node: ParseNode, style: Style, upright: boolean): Box {
  const baseNode = node.base as ParseNode | undefined;
  const s = SCALE[style];
  // A prime written as a script of nothing (f^{{}'}, the import's form of
  // f′; TeX reads ' as ^{\prime}): Word draws the one prime glyph at the
  // script's place, not a script raised again above an empty base.
  if (isEmptyGroup(baseNode) && node.sup && !node.sub) return row(node.sup, style, upright);
  const base = baseNode ? layout(baseNode, style, upright) : { a: 0, d: 0 };
  const sup = node.sup ? row(node.sup, childStyle(style), upright) : null;
  const sub = node.sub ? row(node.sub, childStyle(style), upright) : null;
  const limits = baseNode && (baseNode.type === "op" || baseNode.type === "operatorname") &&
    (style === "display" || style === "inner" || baseNode.alwaysHandleSupSub === true) && baseNode.limits === true;
  if (limits) {
    const box = { ...base };
    if (sup) box.a = base.a + Math.max(UPPER_LIMIT_GAP * s + sup.d, UPPER_LIMIT_RISE * s) + sup.a;
    if (sub) box.d = base.d + Math.max(LOWER_LIMIT_GAP * s + sub.a, LOWER_LIMIT_DROP * s) + sub.d;
    return box;
  }
  // The base's own height and depth move a script only when the base is a
  // compound box, as in TeX: on a single character (S¹, U₁, 𝕊¹) the script
  // takes its usual shift. Raised by a capital's height, U₁ = 𝕊¹ ∩ {y > 0}
  // was 1.2 pt taller than Word's 14.2 pt line (a textbook has hundreds).
  // A delimited group no taller than a line ((x)², |x|²) takes a script as
  // a character does: Word sets √(|x|²) on the same 1.24 em surd as √(x²),
  // where a superscript raised by the bars' height asked for the next one.
  let core = baseNode;
  while (core && core.type === "ordgroup" && Array.isArray(core.body) && core.body.length === 1) core = core.body[0] as ParseNode;
  // A script on a scripted letter ({x_i}^2, how Word's sSup around an sSub reads)
  // goes by the letter too: 14.2 pt at 12 pt.
  const compound = !isSingleGlyph(baseNode) &&
    !(core?.type === "supsub" && isSingleGlyph(core.base as ParseNode | undefined)) &&
    !(core?.type === "leftright" && base.a <= LINE_ASCENT * s && base.d <= LINE_DESCENT * s + 0.06 * s);
  let u = sup ? Math.max(SUP_SHIFT * s, compound ? base.a - SUP_BASELINE_DROP_MAX * s : 0, sup.d + SUP_BOTTOM_MIN * s) : 0;
  let v = sub ? Math.max(SUB_SHIFT * s, compound ? base.d + SUB_BASELINE_DROP_MIN * s : 0, sub.a - SUB_TOP_MAX * s) : 0;
  // An n-ary operator in a line of text takes its limits beside it at Word's own
  // shifts, not by the operator glyph's extents (Windows Word 16, probes/vsp10
  // m4, TNR 12 and Calibri 10, whatever naryLim says): sum and product 0.41 em up
  // and 0.24 em down (0.20 alone), an integral 0.61 / 0.41. By the glyph, ∑ᵢⁿ x
  // reached 0.37 em below the baseline and opened its line 1.5 pt (Word: 0.25 em).
  const nary = style === "text" && baseNode?.type === "op" && baseNode.symbol === true && !limits && !inlineNaryOff()
    ? (INTEGRALS.has(String(baseNode.name ?? "")) ? INLINE_INTEGRAL_SHIFTS : INLINE_NARY_SHIFTS)
    : null;
  if (nary) {
    if (sup) u = Math.max(nary.sup * s, sup.d + SUP_BOTTOM_MIN * s);
    if (sub) v = Math.max((sup ? nary.sub : nary.subAlone) * s, sub.a - SUB_TOP_MAX * s);
  }
  // A superscript with a structure of its own (e^{x^2}, e^{a/b}) stands higher
  // in Word than its depth asks: e^{a/b} 19.4 pt on a 12 pt line (Word 16.86), and
  // e^{x^2} past a 16.3 pt pitch.
  if (sup && node.sup && holdsStack(node.sup as ParseNode)) {
    u += (holdsFraction(node.sup as ParseNode) ? NESTED_SUP_RISE : SCRIPTED_SUP_RISE) * s;
  }
  if (sup && sub) {
    const gap = u - sup.d - (sub.a - v);
    // Word shares a missing gap evenly: the superscript goes up and the
    // subscript down by half of it each (measured on x_i^2 and v_米^2).
    if (gap < SUB_SUP_GAP_MIN * s) {
      const delta = SUB_SUP_GAP_MIN * s - gap;
      u += delta / 2;
      v += delta / 2;
    }
  }
  return {
    a: Math.max(base.a, sup ? u + sup.a : 0),
    d: Math.max(base.d, sub ? v + sub.d : 0),
    ...(base.delimiters ? { delimiters: base.delimiters } : {}),
  };
}

/** In a line of text Word sets a radicand no taller than this, in em, as if it
 * were this tall: √x stands 1.06 em above the baseline (Windows Word 16,
 * probes/vsp10 m5), where by the x-height
 * √x was 0.99 em. Taller radicands (√2, √b, √(x+1), √(a/b)) were Word's
 * already. √y still takes the short surd here (0.97 / 0.21 em; Word the
 * 1.24 em one, 1.09 / 0.36): the variant slack √(x²) needs keeps it. */
const INLINE_RADICAND_MIN_ASCENT = 0.62;
/** `window.__docsInlineRadicandOff = true` (A/B): a radicand in a line by its
 * ink alone, the older reading. */
function inlineRadicandOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsInlineRadicandOff?: boolean }).__docsInlineRadicandOff === true;
}

function radical(node: ParseNode, style: Style, upright: boolean): Box {
  const s = SCALE[style];
  const inked = row(node.body, style, upright);
  const body = style === "text" && !inlineRadicandOff() ? { ...inked, a: Math.max(inked.a, INLINE_RADICAND_MIN_ASCENT * s) } : inked;
  let gap = (style === "display" ? RADICAL_GAP_DISPLAY : RADICAL_GAP) * s;
  const needed = body.a + gap + RULE * s + body.d;
  const surd = SURDS.find(([d, a], index) => (d + a) * s >= needed - (index <= 1 ? RADICAL_VARIANT_SLACK * s : 0)) ??
    SURDS[SURDS.length - 1]!;
  const surdHeight = (surd[0] + surd[1]) * s;
  if (surdHeight > needed) gap += (surdHeight - needed) / 2;
  const ruleTop = body.a + gap + RULE * s;
  return { a: ruleTop + RADICAL_EXTRA_ASCENDER * s, d: Math.max(body.d, surdHeight - ruleTop) };
}

function stack(node: ParseNode, style: Style, upright: boolean): Box {
  const s = SCALE[style];
  const rows = Array.isArray(node.body) ? (node.body as unknown[]) : [];
  if (rows.length === 0) return { a: 0, d: 0 };
  const boxes = rows.map((cells) => row(cells, style === "display" ? "inner" : style, upright));
  let position = 0; // baseline of each row below the first
  let bottom = boxes[0]!.d;
  for (let index = 1; index < boxes.length; index += 1) {
    position += Math.max(ROW_PITCH * s, boxes[index - 1]!.d + boxes[index]!.a + 0.1 * s);
    bottom = position + boxes[index]!.d;
  }
  const height = boxes[0]!.a + bottom;
  return { a: AXIS * s + height / 2, d: height / 2 - AXIS * s };
}

function layout(node: ParseNode, style: Style, upright: boolean): Box {
  if (!node || typeof node !== "object") return { a: 0, d: 0 };
  const s = SCALE[style];
  switch (node.type) {
    case "mathord":
    case "textord":
      return glyph(String(node.text ?? ""), upright || node.mode === "text" ? "upright" : "italic", s);
    case "atom":
    case "accent-token":
    case "op-token":
      return glyph(String(node.text ?? ""), "upright", s);
    case "spacing":
    case "kern":
    case "cr":
      return { a: 0, d: 0 };
    case "ordgroup":
    case "color":
    case "mclass":
    case "tag":
    case "lap":
    case "pmb":
      return row(node.body, style, upright);
    case "text":
    case "operatorname":
      return row(node.body, style, true);
    case "font": {
      const font = String(node.font ?? "");
      const isUpright = /^(mathrm|textrm|mathbf|textbf|mathsf|textsf|mathtt|texttt|text|textnormal|boldsymbol|bm|mathup)$/.test(font);
      return layout(node.body as ParseNode, style, upright || isUpright);
    }
    case "styling":
      return row(node.body, (node.style as Style) in SCALE ? (node.style as Style) : style, upright);
    case "sizing": {
      const factor = SIZING[Number(node.size) - 1] ?? 1;
      const inner = row(node.body, style, upright);
      return { a: inner.a * factor, d: inner.d * factor };
    }
    case "phantom":
      return row(node.body, style, upright);
    case "vphantom":
      return layout(node.body as ParseNode, style, upright);
    case "hphantom":
      return { a: 0, d: 0 };
    case "smash": {
      const inner = layout(node.body as ParseNode, style, upright);
      return { a: node.smashHeight ? 0 : inner.a, d: node.smashDepth ? 0 : inner.d };
    }
    case "genfrac":
      return fraction(node, style, upright);
    case "supsub":
      return scripts(node, style, upright);
    case "op":
      return operator(node, style);
    case "sqrt":
      return radical(node, style, upright);
    case "leftright":
      return delimited(row(node.body, style, upright), s);
    case "middle":
      return glyph(String(node.delim ?? ""), "upright", s);
    case "delimsizing": {
      const height = ([1.2, 1.8, 2.4, 3.0][Number(node.size) - 1] ?? 1.2) * s;
      return { a: AXIS * s + height / 2, d: height / 2 - AXIS * s };
    }
    case "array":
      return stack(node, style, upright);
    case "accent": {
      const base = layout(node.base as ParseNode, style, upright);
      return { a: Math.max(base.a, ACCENT_BASE_HEIGHT * s) + ACCENT_RISE * s, d: base.d };
    }
    case "overline": {
      const base = layout(node.body as ParseNode, style, upright);
      return { a: base.a + (BAR_GAP + 2 * RULE) * s, d: base.d };
    }
    case "underline": {
      const base = layout(node.body as ParseNode, style, upright);
      return { a: base.a, d: base.d + (BAR_GAP + 2 * RULE) * s };
    }
    case "enclose": {
      const base = layout(node.body as ParseNode, style, upright);
      return /box/.test(String(node.label ?? "")) ? { a: base.a + 0.2 * s, d: base.d + 0.2 * s } : base;
    }
    // \ne and its kin: KaTeX's two drawings of one character.
    case "htmlmathml":
      return row(node.html, style, upright);
    // A strut of no width (\vdots stands on a 15 pt one Word's one character has
    // no need of) holds nothing up.
    case "rule":
      if (Number((node.width as { number?: unknown } | undefined)?.number) !== 0) throw new Unknown(node.type);
      return { a: 0, d: 0 };
    // An arrow with its label above (\xrightarrow, Word's m:groupChr), and below.
    case "xArrow": {
      const above = layout(node.body as ParseNode, childStyle(style), upright);
      const below = node.below ? layout(node.below as ParseNode, childStyle(style), upright) : null;
      return {
        a: Math.max(LINE_ASCENT * s, (ARROW_RISE + LABEL_GAP) * s + above.d + above.a),
        d: Math.max(LINE_DESCENT * s, below ? LABEL_GAP * s + below.a + below.d : 0),
      };
    }
    case "horizBrace": {
      const base = layout(node.base as ParseNode, style, upright);
      return node.isOver ? { a: base.a + 0.55 * s, d: base.d } : { a: base.a, d: base.d + 0.55 * s };
    }
    default:
      throw new Unknown(node.type);
  }
}

const cache = new Map<string, WordMathExtents | null>();
const inlineCache = new Map<string, WordMathExtents | null>();
const CACHE_LIMIT = 4000;

/** Whether KaTeX may break `tree`, set in a line, after a relation or a
 * binary operator at its top level: such a formula is not one box. */
function breaksInLine(tree: readonly ParseNode[]): boolean {
  return tree.slice(0, -1).some((node) =>
    node.type === "atom" && (node.family === "rel" || node.family === "bin"));
}

/**
 * Word's box for `latex` set in a line of text (`<m:oMath>`), in em of its
 * font size: text style, its ink and leading only (the line of text around
 * it is the floor). Null where the
 * model does not apply, and for a formula KaTeX may break across lines.
 * Measured: a fraction in a line is 14.24 / 6.26 pt at 12 pt in Word (model
 * 14.37 / 6.04); x² stays within its line (15.5 pt beside 宋体, where KaTeX
 * made the line 16.6 pt).
 */
export function wordInlineMathExtents(latex: string): WordMathExtents | null {
  return inlineExtents(latex, false);
}

/**
 * Word's box for each line of `latex` set in a line of text when KaTeX may
 * break it there (a relation or binary operator at its top level): the
 * whole formula's box, given to every piece KaTeX lays out (each `.base`),
 * so a formula that stays on one line takes Word's line and one that breaks
 * keeps it on each of its lines. Left to KaTeX's own struts, `p∈M`,
 * `n≥2` and `φ=0` made their lines 16.6 pt where Word's are 15.6 pt (the
 * mp book: about 2 000 such lines). Null where the model does not apply.
 */
export function wordInlineMathLineExtents(latex: string): WordMathExtents | null {
  return inlineExtents(latex, true);
}

function inlineExtents(latex: string, breakable: boolean): WordMathExtents | null {
  const cacheKey = breakable ? `\u0000${latex}` : latex;
  const known = inlineCache.get(cacheKey);
  if (known !== undefined) return known;
  let extents: WordMathExtents | null = null;
  try {
    // A stack among a line's words is drawn taller than Word's Cambria Math
    // sets it: on Word's box its brackets ran 2-3 pt over the next line. Word's
    // line holds what it draws, so this one takes what KaTeX draws.
    if (latex.includes("\\begin{")) throw new Unknown("stack");
    const tree = (katex as unknown as { __parse: (input: string, options: object) => ParseNode[] })
      .__parse(latex, { displayMode: false, throwOnError: true, strict: "ignore", trust: false });
    if (tree.some((node) => node.type === "cr" || node.type === "newline") || (!breakable && breaksInLine(tree))) throw new Unknown("line");
    const box = row(tree, "text", false);
    // No floor of Cambria Math's own line here: in a line of text the
    // text's line is the floor. Floored at Cambria's 0.950 em, a formula
    // of ℕℕℕ in an 11 pt Calibri line opened it to 14.1 pt where Word keeps
    // its 13.4 pt.
    extents = { ascent: round(box.a + LEADING), descent: round(box.d) };
  } catch {
    extents = null;
  }
  if (inlineCache.size >= CACHE_LIMIT) inlineCache.clear();
  inlineCache.set(cacheKey, extents);
  return extents;
}

/**
 * Word's line box for `latex` set as a display equation (`<m:oMathPara>`),
 * in em of its font size; null when the formula holds a construct the model
 * does not know, or does not parse.
 */
export function wordDisplayMathExtents(latex: string): WordMathExtents | null {
  const known = cache.get(latex);
  if (known !== undefined) return known;
  let extents: WordMathExtents | null = null;
  try {
    const tree = (katex as unknown as { __parse: (input: string, options: object) => ParseNode[] })
      .__parse(latex, { displayMode: true, throwOnError: true, strict: "ignore", trust: false });
    // A display equation broken into lines (\\ at its top level) is laid
    // out line by line; the model covers one line.
    if (tree.some((node) => node.type === "cr" || node.type === "newline")) throw new Unknown("newline");
    const box = row(tree, "display", false);
    extents = {
      ascent: round(Math.max(LINE_ASCENT, box.a + LEADING)),
      descent: round(Math.max(LINE_DESCENT, box.d)),
    };
  } catch {
    extents = null;
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(latex, extents);
  return extents;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export const WORD_MATH_BOX_ATTR = "data-word-math-box";
/** On an in-line formula KaTeX may break: Word's box on each of its pieces. */
export const WORD_MATH_LINES_ATTR = "data-word-math-lines";

/**
 * Give a display equation's preview Word's box for `latex` (null: KaTeX's
 * own box), as em of its font size; the stylesheet sizes the preview and
 * places KaTeX's baseline at the ascent. Set from the formula alone, so a
 * placeholder not typeset yet and a measurement clone have the same box.
 */
export function applyWordDisplayMathBox(preview: HTMLElement, latex: string | null): void {
  applyWordMathBox(preview, latex ? wordDisplayMathExtents(latex) : null);
}

/** The same for an equation in a line of text (wordInlineMathExtents). */
export function applyWordInlineMathBox(preview: HTMLElement, latex: string | null): void {
  const box = latex ? wordInlineMathExtents(latex) : null;
  const lines = !box && latex ? wordInlineMathLineExtents(latex) : null;
  if (lines) {
    if (preview.hasAttribute(WORD_MATH_BOX_ATTR)) preview.removeAttribute(WORD_MATH_BOX_ATTR);
    if (preview.getAttribute(WORD_MATH_LINES_ATTR) !== "true") preview.setAttribute(WORD_MATH_LINES_ATTR, "true");
    setWordMathExtents(preview, lines);
    return;
  }
  if (preview.hasAttribute(WORD_MATH_LINES_ATTR)) preview.removeAttribute(WORD_MATH_LINES_ATTR);
  applyWordMathBox(preview, box);
}

function applyWordMathBox(preview: HTMLElement, extents: WordMathExtents | null): void {
  if (!extents) {
    if (preview.hasAttribute(WORD_MATH_BOX_ATTR) || preview.style.getPropertyValue("--word-math-ascent")) {
      preview.removeAttribute(WORD_MATH_BOX_ATTR);
      preview.style.removeProperty("--word-math-ascent");
      preview.style.removeProperty("--word-math-descent");
    }
    return;
  }
  if (preview.getAttribute(WORD_MATH_BOX_ATTR) !== "true") preview.setAttribute(WORD_MATH_BOX_ATTR, "true");
  setWordMathExtents(preview, extents);
}

function setWordMathExtents(preview: HTMLElement, extents: WordMathExtents): void {
  const ascent = `${extents.ascent}em`;
  const descent = `${extents.descent}em`;
  if (preview.style.getPropertyValue("--word-math-ascent") !== ascent) preview.style.setProperty("--word-math-ascent", ascent);
  if (preview.style.getPropertyValue("--word-math-descent") !== descent) preview.style.setProperty("--word-math-descent", descent);
}
