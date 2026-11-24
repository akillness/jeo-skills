/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * How Word sets a display equation (`m:oMathPara`) that a single centred line of
 * KaTeX is not: ECMA-376 §22.1.2 `m:defJc` (a group of lines, centred as a
 * group, its lines at its left), `m:brkBin` (a line too long for its column
 * breaks before a binary operator or relation) and `m:wrapIndent` (the lines
 * after the first stand one inch in).
 */

/** Below this many characters of LaTeX a formula has no need to break. */
const SHORTEST_WRAPPING_LATEX = 40;

const OPERATOR_COMMANDS = new Set([
  "pm", "mp", "times", "cdot", "div", "ast", "star", "circ", "bullet", "oplus", "ominus", "otimes", "odot",
  "cup", "cap", "wedge", "vee", "land", "lor", "setminus",
  "ne", "neq", "le", "leq", "ge", "geq", "ll", "gg", "approx", "equiv", "sim", "simeq", "cong", "propto",
  "in", "notin", "ni", "subset", "supset", "subseteq", "supseteq", "to", "rightarrow", "leftarrow",
  "Rightarrow", "Leftarrow", "Leftrightarrow", "leftrightarrow", "longrightarrow", "Longrightarrow", "mapsto",
  "iff", "implies",
]);
const OPERATOR_CHARACTERS = new Set(["+", "-", "=", "<", ">", "−", "×", "·", "÷", "±", "∓", "≠", "≤", "≥", "≈", "≡", "∼", "≅", "→", "←", "⇒", "⇔", "∈", "⊂", "⊆", "∪", "∩", "⊗", "⊕"]);
const OPENING = new Set(["(", "[", "{", "|"]);

/**
 * `latex` with a break allowed before each operator standing at its top level
 * and none after (KaTeX breaks after one by itself), or null when it has no
 * such place, is short, or is lines of its own (an environment, a `\\`). A
 * formula with no place to break stays as it was.
 */
export function wrappableDisplayLatex(latex: string): string | null {
  const source = latex.trim();
  if (source.length < SHORTEST_WRAPPING_LATEX) return null;
  let out = "";
  let depth = 0;
  let places = 0;
  /** Nothing yet, or an operator or opening just before: a sign, no break. */
  let afterOperand = false;
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (ch === "\\") {
      const match = /^\\([A-Za-z]+|.)/su.exec(source.slice(i));
      const command = match?.[1] ?? "";
      const token = match?.[0] ?? ch;
      if (command === "\\" || command === "cr" || command === "newline") {
        if (depth === 0) return null;
      }
      if (command === "begin" || command === "left") depth += 1;
      else if (command === "end" || command === "right") depth -= 1;
      if (depth === 0 && OPERATOR_COMMANDS.has(command)) {
        if (afterOperand) {
          out += `\\allowbreak ${token}\\nobreak `;
          places += 1;
        } else out += `${token} `;
        afterOperand = false;
      } else {
        out += token;
        // A control word eats the spaces after it.
        if (/^[A-Za-z]/u.test(command)) {
          const spaces = /^\s+/u.exec(source.slice(i + token.length))?.[0] ?? "";
          out += spaces;
          i += spaces.length;
        }
        if (command !== "," && command !== ";" && command !== ":" && command !== "!" && command !== " " && command !== "quad" && command !== "qquad") afterOperand = true;
        if (command === "left") afterOperand = true;
      }
      i += token.length;
      continue;
    }
    if (ch === "{") { depth += 1; out += ch; i += 1; continue; }
    if (ch === "}") { depth -= 1; out += ch; i += 1; afterOperand = true; continue; }
    if (ch === "^" || ch === "_") {
      // A bare script: the character after it is the script, whatever it is.
      out += ch;
      i += 1;
      while (i < source.length && /\s/u.test(source[i])) { out += source[i]; i += 1; }
      if (i < source.length && source[i] !== "{" && source[i] !== "\\") { out += source[i]; i += 1; }
      afterOperand = true;
      continue;
    }
    if (/\s/u.test(ch)) { out += ch; i += 1; continue; }
    if (depth === 0 && OPERATOR_CHARACTERS.has(ch)) {
      if (afterOperand) {
        out += `\\allowbreak ${ch}\\nobreak `;
        places += 1;
      } else out += ch;
      afterOperand = false;
      i += 1;
      continue;
    }
    out += ch;
    afterOperand = !OPENING.has(ch);
    i += 1;
  }
  return places > 0 && depth === 0 ? out : null;
}

/** `\\` at the top level of `body`, its lines. */
function topLevelLines(body: string): string[] {
  const lines: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "\\") {
      const rest = body.slice(i);
      if (rest.startsWith("\\begin") ) depth += 1;
      else if (rest.startsWith("\\end")) depth -= 1;
      else if (rest.startsWith("\\\\") && depth === 0) {
        lines.push(body.slice(start, i));
        start = i + 2;
      }
      i += 1;
    } else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  lines.push(body.slice(start));
  return lines;
}

/**
 * Several `m:oMath` of one `m:oMathPara` as the import joined them (one
 * `gathered`), when each stands as a line of its own at the group's left, as
 * Word's default `m:defJc` centerGroup sets them; null for any other formula.
 * Lines with an alignment point (`m:aln`, read as `&`) share columns instead:
 * `wordDisplayLatex`.
 */
export function wordDisplayGroupLines(latex: string): string[] | null {
  const match = GATHERED.exec(latex);
  if (!match || /\\begin\{gathered\}/u.test(match[1]) || topLevelAmpersand(match[1]) >= 0) return null;
  return topLevelLines(match[1]).map((line) => wordDisplayLatex(line.trim()));
}

/** Where `&` first stands at the top level of `latex` (not a matrix's), or -1. */
function topLevelAmpersand(latex: string): number {
  let depth = 0;
  for (let i = 0; i < latex.length; i += 1) {
    const ch = latex[i];
    if (ch === "\\") {
      const rest = latex.slice(i, i + 6);
      if (rest.startsWith("\\begin") || rest.startsWith("\\left") && !/[A-Za-z]/u.test(rest[5] ?? "")) depth += 1;
      else if (rest.startsWith("\\end") || rest.startsWith("\\right")) depth -= 1;
      i += 1;
    } else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === "&" && depth === 0) return i;
  }
  return -1;
}

/** One line of a Word equation group: around its alignment point, or whole. */
export interface WordMathLine {
  /** The line as drawn when it states no point; else null. */
  whole: string | null;
  left: string;
  right: string;
}

const withoutSpacesOrPoints = (latex: string): string => latex.replace(/[&\s]/gu, "");

const LATEX_TOKEN = /\\(?:[A-Za-z]+|.)|./gsu;

/** Where the first token of `latex` equal to `wanted` stands at its top level. */
function topLevelToken(latex: string, wanted: string): number {
  let depth = 0;
  for (const match of latex.matchAll(LATEX_TOKEN)) {
    const token = match[0];
    if (token === "}" || token === "\\right" || token === "\\end") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && token === wanted) return match.index;
    if (token === "{" || token === "\\left" || token === "\\begin") depth += 1;
  }
  return -1;
}

/**
 * `line` with its alignment point, `&`, where `aligned` (`mathAlignedLines`, the
 * file's `m:aln`) sets it, or null when it has none. A line edited since it was
 * read keeps the point on the token it stood on, as it does typing in Word; with
 * that token gone it has none and stands at the group's left. The save writes the
 * same (`docx_equations.split_at_stated_point`).
 */
export function wordMathStatedLine(line: string, aligned: unknown): string | null {
  const source = typeof aligned === "string" ? wordDisplayLatex(aligned) : null;
  const at = source ? topLevelAmpersand(source) : -1;
  if (!source || at < 0) return null;
  if (withoutSpacesOrPoints(source) === withoutSpacesOrPoints(line)) return source;
  const wanted = /^\s*(\\(?:[A-Za-z]+|.)|.)/su.exec(source.slice(at + 1))?.[1];
  const point = wanted ? topLevelToken(line, wanted) : -1;
  return point < 0 ? null : `${line.slice(0, point)}&${line.slice(point)}`;
}

/**
 * The line `line` as `aligned` sets it. With several points the first stands: see
 * `wordMathGroupLayout`.
 */
export function wordMathLine(line: string, aligned: unknown): WordMathLine {
  const stated = wordMathStatedLine(line, aligned);
  if (stated === null) return { whole: line, left: "", right: "" };
  const at = topLevelAmpersand(stated);
  return { whole: null, left: stated.slice(0, at), right: wordMathLineWithoutPoints(stated.slice(at + 1)) };
}

/** A stated line without its alignment points; a matrix's columns stay. */
export function wordMathLineWithoutPoints(line: string): string {
  let out = line;
  for (let at = topLevelAmpersand(out); at >= 0; at = topLevelAmpersand(out)) {
    out = out.slice(0, at) + out.slice(at + 1);
  }
  return out;
}

/** How wide a line is, in em: before and after its alignment point, or whole. */
export interface WordMathLineExtent {
  /** Null: the line has no point. */
  left: number | null;
  right: number;
}

export interface WordMathGroupLayout {
  /** How wide the group is centred as, in em, its points in one column. */
  width: number;
  /** The widest line as written: the group's width with its points given up. */
  natural: number;
  /** All the lines' reach, points in one column: wider than the text column,
   * Word gives the points up and the lines stand at the group's left. */
  extent: number;
  /** How far each line stands in from the group's left. */
  offsets: number[];
}

/**
 * Where Word sets the lines of one display zone (measured, Word 16.86): lines
 * with a point stand with their points in one column, the widest left part
 * deciding it; a line with none stands at the group's left. The width the group
 * is centred on grows down the lines: from the first line with a point, a line
 * whose left part reaches at least as far takes the group's left to it and its
 * right part may widen the group, while a line reaching less leaves it, its
 * right part running on past the centred width. The widest line as written is
 * the least the group is.
 */
export function wordMathGroupLayout(lines: readonly WordMathLineExtent[]): WordMathGroupLayout {
  let reach: { left: number; right: number } | null = null;
  let furthest = 0;
  let natural = 0;
  for (const line of lines) {
    natural = Math.max(natural, (line.left ?? 0) + line.right);
    if (line.left === null) continue;
    furthest = Math.max(furthest, line.right);
    if (!reach) reach = { left: line.left, right: line.right };
    else if (line.left >= reach.left) reach = { left: line.left, right: Math.max(reach.right, line.right) };
  }
  const column = reach?.left ?? 0;
  return {
    width: Math.max(natural, column + (reach?.right ?? 0)),
    natural,
    extent: column + furthest,
    offsets: lines.map((line) => (line.left === null ? 0 : column - line.left)),
  };
}

const LOOSE_BIG_OPERATOR = /\\(bigotimes|bigoplus)(?![A-Za-z])(?!\s*(?:[_^]|\\limits|\\nolimits))/gu;
/**
 * An Office equation set as one block where a line has no box of its own (a
 * slide's text, a worksheet's equation box, a note): its lines at the group's
 * left, its matrices in display style.
 */
export function officeEquationBlockLatex(latex: string): string {
  const lines = wordDisplayGroupLines(latex);
  return lines
    ? `\\begin{aligned}${lines.map((line) => `&${line}`).join(" \\\\ ")}\\end{aligned}`
    : wordDisplayLatex(latex);
}

const GATHERED = /^\s*\\begin\{gathered\}([\s\S]*)\\end\{gathered\}\s*$/u;
const MATRIX_ENVIRONMENT = /^(?:|p|b|B|v|V)matrix\*?$/u;

/**
 * An Office formula as Word sets it on a display line, as far as LaTeX differs:
 * a matrix's entries keep the line's display style (LaTeX sets them in text
 * style: a fraction in a matrix came out a size smaller, the matrix half as tall
 * as Word's), and a group with alignment points shares its columns.
 */
export function wordDisplayLatex(latex: string): string {
  // Word's ⨂ typed among the terms, no limits on it, is a character of the line;
  // read as LaTeX's n-ary operator it stood at display size between two letters.
  const gathered = GATHERED.exec(latex);
  let source = latex.replace(LOOSE_BIG_OPERATOR, "\\mathbin{\\textstyle\\$1}");
  if (gathered && topLevelAmpersand(gathered[1]) >= 0 && !/\\begin\{gathered\}/u.test(gathered[1])) {
    source = `\\begin{aligned}${source.replace(GATHERED, "$1")}\\end{aligned}`;
  }
  if (!source.includes("matrix}")) return source;
  let out = "";
  /** The environments open here, and the brace depth each was opened at. */
  const open: { matrix: boolean; braces: number }[] = [];
  let braces = 0;
  for (let i = 0; i < source.length;) {
    const rest = source.slice(i);
    const begin = /^\\begin\{([^}]*)\}/u.exec(rest);
    if (begin) {
      const matrix = MATRIX_ENVIRONMENT.test(begin[1]);
      open.push({ matrix, braces });
      out += begin[0] + (matrix ? "\\displaystyle " : "");
      i += begin[0].length;
      continue;
    }
    const end = /^\\end\{[^}]*\}/u.exec(rest);
    if (end) {
      open.pop();
      out += end[0];
      i += end[0].length;
      continue;
    }
    const top = open[open.length - 1];
    const atCell = Boolean(top?.matrix) && top.braces === braces;
    if (rest.startsWith("\\\\")) {
      out += "\\\\" + (atCell ? "\\displaystyle " : "");
      i += 2;
      continue;
    }
    if (rest[0] === "\\") {
      out += rest.slice(0, 2);
      i += 2;
      continue;
    }
    if (rest[0] === "{") braces += 1;
    else if (rest[0] === "}") braces -= 1;
    out += rest[0];
    if (rest[0] === "&" && atCell) out += "\\displaystyle ";
    i += 1;
  }
  return out;
}
