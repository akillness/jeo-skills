/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The LaTeX the live equation field (MathLive) is given, and the LaTeX read
 * back from it.
 *
 * ## Why
 *
 * Word's bar-less stack — the `(n k)` of the binomial theorem, Word's
 * `<m:f>` with `<m:type m:val="noBar"/>` — is spelled `\genfrac{}{}{0pt}{}
 * {n}{k}` throughout MRAI: the equation gallery, the DOCX importer and the
 * DOCX exporter all read and write exactly that spelling, and KaTeX typesets
 * it. MathLive 0.109 knows no `\genfrac` at all, so the live field showed the
 * gallery's binomial theorem as `\genfrac 0` with an error mark the moment
 * the editor opened, and only the passive KaTeX rendering looked right.
 *
 * MathLive does know TeX's `\atop` (the same bar-less stack, as a primitive),
 * so the field is handed `{n \atop k}` and what it serializes is turned back
 * into the `\genfrac` spelling the rest of the pipeline expects. Only the
 * literal zero-thickness, delimiter-less `\genfrac` converts: any other
 * `\genfrac` stays as written (and keeps MathLive's error mark, as before).
 */

const GENFRAC_NOBAR = "\\genfrac{}{}{0pt}{}";

/** The `{…}` group starting at `start` (which must be `{`): its end index
 * (exclusive) and inner text, or null when it is unbalanced. */
function readGroup(
  source: string,
  start: number,
): { end: number; inner: string } | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { end: index + 1, inner: source.slice(start + 1, index) };
      }
    }
  }
  return null;
}

/** `\genfrac{}{}{0pt}{}{A}{B}` → `{A \atop B}`, innermost first. */
/**
 * Office's Bold on math letters is bold italic (`m:sty bi`). The document
 * spells it `\\boldsymbol` (KaTeX and the OMML converter read it); MathLive
 * reads `\\boldsymbol` as upright bold and spells bold italic `\\mathbfit`.
 */
const LIVE_BOLD_ITALIC = /\\mathbfit(?![A-Za-z])/g;
const DOCUMENT_BOLD_ITALIC = /\\(?:boldsymbol|bm)(?![A-Za-z])/g;

export function latexForLiveField(latex: string): string {
  return latexForLiveFieldStacks(liveRunUnderlines(latex.replace(DOCUMENT_BOLD_ITALIC, "\\mathbfit")));
}

/**
 * Word's run underline (`w:u` on part of an equation) is spelled `\uline{…}`
 * in the document, apart from the Bar structure `\underline{…}`. MathLive
 * keeps a macro whole (nothing can be typed inside it), so in the field the
 * run underline is the editable `\underline` marked with a class, and read
 * back as `\uline` on commit.
 */
export const LIVE_RUN_UNDERLINE_CLASS = "office-u";
const DOCUMENT_RUN_UNDERLINE = "\\uline";
const LIVE_RUN_UNDERLINE_OPEN = `\\class{${LIVE_RUN_UNDERLINE_CLASS}}{`;

function liveRunUnderlines(latex: string): string {
  if (!latex.includes(DOCUMENT_RUN_UNDERLINE)) return latex;
  let out = "";
  let cursor = 0;
  for (;;) {
    const at = latex.indexOf(DOCUMENT_RUN_UNDERLINE, cursor);
    if (at < 0) break;
    const after = at + DOCUMENT_RUN_UNDERLINE.length;
    const group = /[A-Za-z]/.test(latex[after] ?? "") ? null : readGroup(latex, after);
    if (!group) {
      out += latex.slice(cursor, after);
      cursor = after;
      continue;
    }
    out += `${latex.slice(cursor, at)}${LIVE_RUN_UNDERLINE_OPEN}\\underline{${liveRunUnderlines(group.inner)}}}`;
    cursor = group.end;
  }
  return out + latex.slice(cursor);
}

/** The field's marked `\underline` back as the document's `\uline`. */
function documentRunUnderlines(value: string): string {
  if (!value.includes(LIVE_RUN_UNDERLINE_OPEN)) return value;
  let out = "";
  let cursor = 0;
  for (;;) {
    const at = value.indexOf(LIVE_RUN_UNDERLINE_OPEN, cursor);
    if (at < 0) break;
    const group = readGroup(value, at + LIVE_RUN_UNDERLINE_OPEN.length - 1);
    if (!group) {
      out += value.slice(cursor, at + LIVE_RUN_UNDERLINE_OPEN.length);
      cursor = at + LIVE_RUN_UNDERLINE_OPEN.length;
      continue;
    }
    // Inside the mark: each `\underline{…}` is the run underline; anything
    // typed beside it inside the mark is plain.
    const inner = documentRunUnderlines(group.inner);
    let content = "";
    let at2 = 0;
    for (;;) {
      const bar = inner.indexOf("\\underline{", at2);
      if (bar < 0) break;
      const body = readGroup(inner, bar + "\\underline".length);
      if (!body) break;
      content += `${inner.slice(at2, bar)}${DOCUMENT_RUN_UNDERLINE}{${body.inner}}`;
      at2 = body.end;
    }
    out += value.slice(cursor, at) + content + inner.slice(at2);
    cursor = group.end;
  }
  return out + value.slice(cursor);
}

function latexForLiveFieldStacks(latex: string): string {
  let out = "";
  let cursor = 0;
  for (;;) {
    const at = latex.indexOf(GENFRAC_NOBAR, cursor);
    if (at < 0) break;
    const numerator = readGroup(latex, at + GENFRAC_NOBAR.length);
    const denominator = numerator ? readGroup(latex, numerator.end) : null;
    if (!numerator || !denominator) {
      out += latex.slice(cursor, at + GENFRAC_NOBAR.length);
      cursor = at + GENFRAC_NOBAR.length;
      continue;
    }
    out += latex.slice(cursor, at);
    out += `{${latexForLiveFieldStacks(numerator.inner)} \\atop ${latexForLiveFieldStacks(denominator.inner)}}`;
    cursor = denominator.end;
  }
  return out + latex.slice(cursor);
}

/**
 * `{A \atop B}` (as MathLive serializes it) → `\genfrac{}{}{0pt}{}{A}{B}`.
 *
 * MathLive writes the stack as one group whose content is `A \atop B`; the
 * group is found by its `\atop` and the surrounding braces, so a stack the
 * user typed into the field by hand in the same form converts too.
 */
/** MathLive wraps its bold italic in a series command too
 * (`\\mathbf{\\mathbfit{x}}`): the document's spelling is the one
 * `\\boldsymbol{x}`, which an outer `\\mathbf` would turn upright. */
function liveBoldItalicAsDocument(value: string): string {
  let out = "";
  let cursor = 0;
  const outer = "\\mathbf{";
  for (;;) {
    const at = value.indexOf(outer, cursor);
    if (at < 0) break;
    const group = readGroup(value, at + outer.length - 1);
    const inner = group?.inner.trim() ?? "";
    const nested = /^\\mathbfit(?![A-Za-z])/.exec(inner);
    const innerGroup = nested ? readGroup(inner, nested[0].length) : null;
    if (!group || !innerGroup || innerGroup.end !== inner.length) {
      out += value.slice(cursor, at + outer.length);
      cursor = at + outer.length;
      continue;
    }
    out += value.slice(cursor, at) + inner;
    cursor = group.end;
  }
  return (out + value.slice(cursor)).replace(LIVE_BOLD_ITALIC, "\\boldsymbol");
}

export function latexFromLiveField(value: string): string {
  let out = liveBoldItalicAsDocument(documentRunUnderlines(value));
  for (let guard = 0; guard < 64; guard += 1) {
    const converted = convertOneAtop(out);
    if (converted === null) return out;
    out = converted;
  }
  return out;
}

function convertOneAtop(value: string): string | null {
  const at = value.search(/\\atop(?![A-Za-z])/);
  if (at < 0) return null;
  // The group the `\atop` sits in: walk back to its opening brace.
  let depth = 0;
  let open = -1;
  for (let index = at - 1; index >= 0; index -= 1) {
    const char = value[index];
    const escaped = index > 0 && value[index - 1] === "\\";
    if (escaped) continue;
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth === 0) {
        open = index;
        break;
      }
      depth -= 1;
    }
  }
  if (open < 0) return null;
  const group = readGroup(value, open);
  if (!group) return null;
  const innerAt = at - open - 1;
  const numerator = group.inner.slice(0, innerAt).trim();
  const denominator = group.inner.slice(innerAt + "\\atop".length).trim();
  return (
    value.slice(0, open) +
    `${GENFRAC_NOBAR}{${numerator}}{${denominator}}` +
    value.slice(group.end)
  );
}

/** MathLive's editing-only empty slot: `\placeholder{}`, or `\placeholder[hint]{value}`. */
const PLACEHOLDER_RE = /\\placeholder(?:\[[^\][]*\])?\{([^{}]*)\}/g;
const SOLE_PLACEHOLDER_RE = /\{\\placeholder(?:\[[^\][]*\])?\{([^{}]*)\}\}/g;

/**
 * MathLive's own macros (its default macro table, mathlive 0.109) that KaTeX
 * and the server's Office Math writer do not know, as the LaTeX MathLive
 * itself expands them to. MathLive keeps the macro in what it serializes: its
 * inline shortcut for "dx" writes `\differentialD x`, "e" in an exponent can
 * be `\exponentialE`. Unexpanded, the equation could not be committed (the
 * commit check typesets it with KaTeX) or, through a path without that check,
 * was stored and then drawn as raw TeX.
 */
const MATHLIVE_ONLY_MACROS: Readonly<Record<string, string>> = {
  differentialD: "\\mathrm{d}",
  capitalDifferentialD: "\\mathrm{D}",
  exponentialE: "\\mathrm{e}",
  imaginaryI: "\\mathrm{i}",
  imaginaryJ: "\\mathrm{j}",
  rd: "\\mathrm{d}",
  rD: "\\mathrm{D}",
  odif: "\\mathrm{d}",
  part: "\\partial",
  doubleStruckCapitalN: "\\mathbb{N}",
  doubleStruckCapitalR: "\\mathbb{R}",
  doubleStruckCapitalQ: "\\mathbb{Q}",
  doubleStruckCapitalZ: "\\mathbb{Z}",
  doubleStruckCapitalP: "\\mathbb{P}",
  scriptCapitalE: "\\mathscr{E}",
  scriptCapitalH: "\\mathscr{H}",
  scriptCapitalL: "\\mathscr{L}",
  gothicCapitalC: "\\mathfrak{C}",
  gothicCapitalH: "\\mathfrak{H}",
  gothicCapitalI: "\\mathfrak{I}",
  gothicCapitalR: "\\mathfrak{R}",
  Simcolon: "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\dblcolon}",
  Approxcolon: "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\dblcolon}",
  strut: "\\vphantom{(}",
  // Symbols the Equation gallery inserts that KaTeX has no command for: the
  // characters themselves, as Office Math stores them.
  nsubset: "⊄",
  nsupset: "⊅",
  rightangle: "∟",
};
const MATHLIVE_ONLY_MACRO_RE = new RegExp(
  `\\\\(${Object.keys(MATHLIVE_ONLY_MACROS).join("|")})(?![A-Za-z])`,
  "g",
);
/** `\nicefrac{a}{b}` (MathLive's slashed fraction) with simple arguments. */
const NICEFRAC_RE = /\\nicefrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;

/** MathLive-only commands in `latex`, written as LaTeX every renderer and writer knows. */
export function expandMathLiveOnlyCommands(latex: string): string {
  if (!latex.includes("\\")) return latex;
  return latex
    .replace(NICEFRAC_RE, (_match, numerator: string, denominator: string) => `{}^{${numerator}}\\!\\!/\\!_{${denominator}}`)
    .replace(MATHLIVE_ONLY_MACRO_RE, (_match, name: string) => MATHLIVE_ONLY_MACROS[name] ?? _match);
}

/**
 * An equation as it is STORED once its draft commits: MathLive's editing-only
 * slots become ordinary groups -- an empty slot an empty group (the empty
 * argument Office Math writes as an empty element and Word shows as its
 * dotted box), a filled one its content -- and MathLive's own macros are
 * expanded (expandMathLiveOnlyCommands). MathLive opens the empty groups as
 * editable slots again, KaTeX typesets the result, and the server's Office
 * Math writer converts it natively instead of falling back to the linear
 * form; `\placeholder` and the macros are MathLive's alone, so a committed
 * equation holding them was drawn as raw TeX (a worksheet equation box) or
 * refused.
 */
export function committedEquationLatex(latex: string): string {
  let current = expandMathLiveOnlyCommands(latex);
  for (let guard = 0; guard < 64; guard += 1) {
    // Innermost first; a slot that is a group's whole content keeps that
    // group's braces instead of nesting a second pair.
    const next = current
      .replace(SOLE_PLACEHOLDER_RE, (_match, inner: string) => `{${inner}}`)
      .replace(PLACEHOLDER_RE, (_match, inner: string) => `{${inner}}`);
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * The class of an empty argument slot as the passive renderer draws it. The
 * KaTeX square keeps the glyph's metrics (so a fraction or a sum lays out as
 * it would around a real argument); the stylesheet draws it as Word's dotted
 * placeholder box (note-editor.css). KaTeX may attach this one class and no
 * other (equationSlotTrust).
 */
export const EQUATION_SLOT_CLASS = "office-math-slot";
const EQUATION_SLOT_LATEX = `\\htmlClass{${EQUATION_SLOT_CLASS}}{\\square}`;

/** KaTeX `trust`: only the slot class drawn by latexWithSlotsDrawn. */
export function equationSlotTrust(context: { command: string; class?: string }): boolean {
  return context.command === "\\htmlClass" && context.class === EQUATION_SLOT_CLASS;
}

/**
 * LaTeX the passive KaTeX renderer can typeset, for an equation that may
 * still hold MathLive's own vocabulary (a draft, or one stored before commits
 * were normalized): an empty slot is drawn as Word's dotted placeholder box,
 * a filled one as its content, and MathLive's macros as their expansion.
 *
 * A committed equation keeps its empty arguments as empty groups (`{}`, the
 * empty element Office Math writes), and Word goes on showing each one as a
 * dotted box after the equation is left, on screen and in a PDF: an empty
 * fraction, the limits and operand of a sum, a script's base. They are drawn
 * the same way here (drawEmptyArgumentSlots), so a structure inserted from
 * the gallery and left unfilled still shows where its arguments go instead
 * of vanishing.
 */
export function latexWithSlotsDrawn(latex: string): string {
  // Word's run underline (`\uline`, one line under each run) is drawn as an
  // underline of that run.
  let current = expandMathLiveOnlyCommands(latex).replace(/\\uline(?![A-Za-z])/g, "\\underline");
  for (let guard = 0; guard < 64; guard += 1) {
    const next = current.replace(PLACEHOLDER_RE, (_match, inner: string) => (inner.trim() ? inner : EQUATION_SLOT_LATEX));
    if (next === current) break;
    current = next;
  }
  return current.includes("{") ? drawEmptyArgumentSlots(current) : current;
}

// ── Empty argument slots ────────────────────────────────────────────────────
//
// An empty group is a slot where Office Math has an argument element: the
// arguments of a fraction, root, accent, bar, box or labelled arrow; a
// script; the operand of a large operator or function; the content of a
// delimiter; a matrix cell; a script's base. A free-standing `{}` (TeX's
// spacing idiom) is no argument: the server writes nothing for it, and
// neither does Word. `{}^{14}C` is a prescript (m:sPre), not an empty base,
// by the rule the server's writer uses: braced scripts on an empty group
// with a base after them (latex_omml.py, _try_parse_braced_prescript).

/** Structure commands: which of their brace arguments are argument slots. */
const SLOT_ARGUMENTS: Readonly<Record<string, { optional?: boolean; args: readonly boolean[] }>> = (() => {
  const table: Record<string, { optional?: boolean; args: readonly boolean[] }> = {};
  const one = [true] as const;
  const two = [true, true] as const;
  for (const name of ["frac", "dfrac", "tfrac", "cfrac", "binom", "dbinom", "tbinom", "overset", "underset", "stackrel"]) {
    table[name] = { args: two };
  }
  for (const name of [
    "overline", "underline", "overbrace", "underbrace", "hat", "widehat", "check", "widecheck",
    "tilde", "widetilde", "utilde", "acute", "grave", "dot", "ddot", "dddot", "ddddot", "breve", "bar",
    "vec", "mathring", "overrightarrow", "overleftarrow", "overleftrightarrow", "underrightarrow",
    "underleftarrow", "underleftrightarrow", "overgroup", "undergroup", "overlinesegment",
    "underlinesegment", "Overrightarrow", "overleftharpoon", "overrightharpoon", "boxed", "cancel",
    "bcancel", "xcancel", "sout",
  ]) {
    table[name] = { args: one };
  }
  table.sqrt = { optional: true, args: one };
  for (const name of [
    "xrightarrow", "xleftarrow", "xRightarrow", "xLeftarrow", "xleftrightarrow", "xLeftrightarrow",
    "xhookleftarrow", "xhookrightarrow", "xmapsto", "xrightharpoondown", "xrightharpoonup",
    "xleftharpoondown", "xleftharpoonup", "xrightleftharpoons", "xleftrightharpoons", "xlongequal",
    "xtwoheadrightarrow", "xtwoheadleftarrow", "xtofrom", "xrightleftarrows",
  ]) {
    table[name] = { optional: true, args: one };
  }
  // `\genfrac{left}{right}{thickness}{style}{num}{den}`: the first four are
  // settings that are routinely empty (Word's bar-less stack is spelled
  // `\genfrac{}{}{0pt}{}{n}{k}`); only the stacked pair are arguments.
  table.genfrac = { args: [false, false, false, false, true, true] };
  return table;
})();

/** Large operators and functions: the group after their limits is the operand. */
const OPERAND_COMMANDS = new Set([
  "sum", "prod", "coprod", "int", "iint", "iiint", "iiiint", "oint", "oiint", "oiiint", "intop",
  "smallint", "bigcup", "bigcap", "bigvee", "bigwedge", "bigodot", "bigoplus", "bigotimes",
  "biguplus", "bigsqcup", "lim", "limsup", "liminf", "varlimsup", "varliminf", "max", "min", "sup",
  "inf", "det", "gcd", "Pr", "arg", "deg", "dim", "exp", "hom", "ker", "lg", "ln", "log", "sin", "cos",
  "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "coth", "arcsin", "arccos", "arctan", "arccot",
  "arcsec", "arccsc", "sech", "csch",
]);

/** Commands whose brace arguments are text, names or settings: copied as is. */
const VERBATIM_ARGUMENTS: Readonly<Record<string, number>> = {
  text: 1, textrm: 1, textit: 1, textbf: 1, textsf: 1, texttt: 1, textnormal: 1, textup: 1,
  textmd: 1, emph: 1, mbox: 1, hbox: 1, operatorname: 1, "operatorname*": 1,
  operatornamewithlimits: 1, color: 1, textcolor: 1, colorbox: 1, fcolorbox: 2, label: 1, tag: 1,
  "tag*": 1, hspace: 1, "hspace*": 1, kern: 0, htmlClass: 2, htmlId: 2, htmlStyle: 2, htmlData: 2,
  href: 2, url: 1, includegraphics: 1, begin: 1, end: 1, phantom: 0, hphantom: 0, vphantom: 0,
};

/** Environments whose cells are matrix elements (Word shows an empty one as a box). */
const MATRIX_ENVIRONMENTS = new Set([
  "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "array",
  "darray", "subarray", "matrix*", "pmatrix*", "bmatrix*", "Bmatrix*", "vmatrix*", "Vmatrix*",
]);
/** Environments with a column-specification argument after `\begin{name}`. */
const COLUMN_SPEC_ENVIRONMENTS = new Set(["array", "darray", "subarray", "alignat", "alignat*", "alignedat"]);

const SLOT_GROUP = `{${EQUATION_SLOT_LATEX}}`;

function skipSpaces(s: string, at: number): number {
  let i = at;
  while (i < s.length && /\s/u.test(s[i]!)) i += 1;
  return i;
}

/** The command at `at` (a backslash): its name and where it ends. */
function readCommand(s: string, at: number): { name: string; end: number } {
  let i = at + 1;
  if (i < s.length && /[A-Za-z]/u.test(s[i]!)) {
    while (i < s.length && /[A-Za-z]/u.test(s[i]!)) i += 1;
    if (s[i] === "*") i += 1;
    return { name: s.slice(at + 1, i), end: i };
  }
  // A one-character command (`\\`, `\{`, `\,`); a lone trailing backslash.
  return { name: s.slice(at + 1, Math.min(i + 1, s.length)), end: Math.min(i + 1, s.length) };
}

/** The end (exclusive) of the group whose `{` (or `[`) is at `at`; -1 when unbalanced. */
function groupEnd(s: string, at: number): number {
  const open = s[at];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = at; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (open === "[") {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === "]" && depth === 0) return i + 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** The end of one TeX token at `at`: a group, a command or one character. */
function tokenEnd(s: string, at: number): number {
  const ch = s[at];
  if (ch === undefined) return at;
  if (ch === "{") {
    const end = groupEnd(s, at);
    return end < 0 ? s.length : end;
  }
  if (ch === "\\") return readCommand(s, at).end;
  const code = s.codePointAt(at) ?? 0;
  return at + (code > 0xffff ? 2 : 1);
}

/** Whether nothing follows at `at` in this argument list (a slot base has no base after its scripts). */
function endsArgument(s: string, at: number): boolean {
  if (at >= s.length) return true;
  const ch = s[at];
  if (ch === "&" || ch === "}") return true;
  if (ch !== "\\") return false;
  const { name } = readCommand(s, at);
  return name === "\\" || name === "cr" || name === "right" || name === "middle" || name === "end";
}

/** A script argument (`_x`, `^{...}`) at `at`: drawn, and where it ends. */
function drawScriptArgument(s: string, at: number): { text: string; end: number } {
  const start = skipSpaces(s, at);
  if (s[start] === "{") {
    const end = groupEnd(s, start);
    if (end < 0) return { text: s.slice(at), end: s.length };
    const inner = s.slice(start + 1, end - 1);
    return {
      text: s.slice(at, start) + (inner.trim() ? `{${drawSequence(inner)}}` : SLOT_GROUP),
      end,
    };
  }
  const end = tokenEnd(s, start);
  return { text: s.slice(at, end), end };
}

/** Where the scripts (`_…`, `^…`, `'`) starting at `at` end. */
function scriptsEnd(s: string, at: number): number {
  let i = skipSpaces(s, at);
  while (s[i] === "_" || s[i] === "^" || s[i] === "'") {
    i = s[i] === "'" ? i + 1 : tokenEnd(s, skipSpaces(s, i + 1));
    i = skipSpaces(s, i);
  }
  return i;
}

/** One environment cell, drawn: a matrix element left empty is a slot. */
function drawCell(cell: string, matrix: boolean): string {
  const trimmed = cell.trim();
  if (trimmed === "{}" || (matrix && trimmed === "")) {
    const lead = cell.slice(0, cell.length - cell.trimStart().length);
    const trail = cell.slice(cell.trimEnd().length);
    return lead + SLOT_GROUP + trail;
  }
  return drawSequence(cell);
}

/** An environment body, cell by cell (cells split at `&`, rows at `\\` / `\cr`). */
function drawEnvironmentBody(body: string, matrix: boolean): string {
  const pieces: Array<{ cell: string; separator: string }> = [];
  let depth = 0;
  let cellStart = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === "\\") {
      const { name, end } = readCommand(body, i);
      if (depth === 0 && name === "begin") {
        // A nested environment is one cell's content.
        const nested = environmentEnd(body, i);
        if (nested > i) {
          i = nested - 1;
          continue;
        }
      }
      if (depth === 0 && (name === "\\" || name === "cr")) {
        let sepEnd = end;
        const afterSep = skipSpaces(body, sepEnd);
        if (body[afterSep] === "[") {
          const bracket = groupEnd(body, afterSep);
          if (bracket > 0) sepEnd = bracket;
        }
        pieces.push({ cell: body.slice(cellStart, i), separator: body.slice(i, sepEnd) });
        cellStart = sepEnd;
        i = sepEnd - 1;
        continue;
      }
      i = end - 1;
    } else if (ch === "&" && depth === 0) {
      pieces.push({ cell: body.slice(cellStart, i), separator: "&" });
      cellStart = i + 1;
    }
  }
  const last = body.slice(cellStart);
  // A row separator closing the body leaves no row after it.
  const trailingEmptyRow = pieces.length > 0 && last.trim() === "" && pieces[pieces.length - 1]!.separator !== "&";
  let out = "";
  for (const piece of pieces) out += drawCell(piece.cell, matrix) + piece.separator;
  out += trailingEmptyRow ? last : drawCell(last, matrix);
  return out;
}

/** The end of the environment whose `\begin` is at `at` (after its `\end{name}`); -1 if unclosed. */
function environmentEnd(s: string, at: number): number {
  let depth = 0;
  for (let i = at; i < s.length; i += 1) {
    if (s[i] !== "\\") continue;
    const { name, end } = readCommand(s, i);
    if (name === "begin") depth += 1;
    else if (name === "end") {
      depth -= 1;
      if (depth === 0) {
        const nameStart = skipSpaces(s, end);
        const nameEnd = s[nameStart] === "{" ? groupEnd(s, nameStart) : -1;
        return nameEnd < 0 ? s.length : nameEnd;
      }
    }
    i = end - 1;
  }
  return -1;
}

/** The `\right` matching the `\left` whose delimiter ends at `at`; -1 if none. */
function matchingRight(s: string, at: number): number {
  let depth = 1;
  let braces = 0;
  for (let i = at; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === "\\") {
      const { name, end } = readCommand(s, i);
      if (braces === 0 && name === "left") depth += 1;
      else if (braces === 0 && name === "right") {
        depth -= 1;
        if (depth === 0) return i;
      }
      i = end - 1;
    }
  }
  return -1;
}

/** A delimiter's content, split at its `\middle` bars: each empty part is a slot. */
function drawDelimited(inner: string): string {
  const parts: string[] = [];
  const bars: string[] = [];
  let braces = 0;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === "\\") {
      const { name, end } = readCommand(inner, i);
      if (braces === 0 && name === "left") depth += 1;
      else if (braces === 0 && name === "right") depth -= 1;
      else if (braces === 0 && depth === 0 && name === "middle") {
        const delimiterEnd = tokenEnd(inner, skipSpaces(inner, end));
        parts.push(inner.slice(start, i));
        bars.push(inner.slice(i, delimiterEnd));
        start = delimiterEnd;
        i = delimiterEnd - 1;
        continue;
      }
      i = end - 1;
    }
  }
  parts.push(inner.slice(start));
  return parts
    .map((part, index) => {
      const trimmed = part.trim();
      const drawn = trimmed === "" || trimmed === "{}" ? SLOT_GROUP : drawSequence(part);
      return drawn + (bars[index] ?? "");
    })
    .join("");
}

/** One argument list (an equation, or a group's content), its empty slots drawn. */
function drawSequence(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "%") {
      const newline = s.indexOf("\n", i);
      const end = newline < 0 ? s.length : newline;
      out += s.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "_" || ch === "^") {
      const script = drawScriptArgument(s, i + 1);
      out += ch + script.text;
      i = script.end;
      continue;
    }
    if (ch === "{") {
      const end = groupEnd(s, i);
      if (end < 0) {
        out += s.slice(i);
        break;
      }
      const inner = s.slice(i + 1, end - 1);
      if (inner.trim()) {
        out += `{${drawSequence(inner)}}`;
      } else {
        // An empty group with scripts on it is their base: a slot unless a
        // base follows the scripts (then it is a prescript, m:sPre).
        const next = skipSpaces(s, end);
        const scripted = s[next] === "_" || s[next] === "^";
        out += scripted && endsArgument(s, scriptsEnd(s, next)) ? SLOT_GROUP : s.slice(i, end);
      }
      i = end;
      continue;
    }
    if (ch !== "\\") {
      const end = tokenEnd(s, i);
      out += s.slice(i, end);
      i = end;
      continue;
    }
    const { name, end: nameEnd } = readCommand(s, i);
    if (name === "begin") {
      const envEnd = environmentEnd(s, i);
      const nameStart = skipSpaces(s, nameEnd);
      const nameClose = s[nameStart] === "{" ? groupEnd(s, nameStart) : -1;
      if (envEnd < 0 || nameClose < 0) {
        out += s.slice(i);
        break;
      }
      const environment = s.slice(nameStart + 1, nameClose - 1).trim();
      let bodyStart = nameClose;
      // Column specifications and a starred matrix's alignment are settings.
      const optional = skipSpaces(s, bodyStart);
      if (environment.endsWith("*") && s[optional] === "[") {
        const close = groupEnd(s, optional);
        if (close > 0) bodyStart = close;
      }
      if (COLUMN_SPEC_ENVIRONMENTS.has(environment)) {
        const spec = skipSpaces(s, bodyStart);
        if (s[spec] === "{") {
          const close = groupEnd(s, spec);
          if (close > 0) bodyStart = close;
        }
      }
      const endCommand = s.lastIndexOf("\\end", envEnd);
      const body = s.slice(bodyStart, endCommand);
      out += s.slice(i, bodyStart) + drawEnvironmentBody(body, MATRIX_ENVIRONMENTS.has(environment)) + s.slice(endCommand, envEnd);
      i = envEnd;
      continue;
    }
    if (name === "left") {
      const delimiterEnd = tokenEnd(s, skipSpaces(s, nameEnd));
      const right = matchingRight(s, delimiterEnd);
      if (right < 0) {
        out += s.slice(i, delimiterEnd);
        i = delimiterEnd;
        continue;
      }
      out += s.slice(i, delimiterEnd) + drawDelimited(s.slice(delimiterEnd, right));
      i = right;
      const rightEnd = readCommand(s, right).end;
      const rightDelimiterEnd = tokenEnd(s, skipSpaces(s, rightEnd));
      out += s.slice(right, rightDelimiterEnd);
      i = rightDelimiterEnd;
      continue;
    }
    const structure = SLOT_ARGUMENTS[name];
    if (structure) {
      out += s.slice(i, nameEnd);
      i = nameEnd;
      if (structure.optional) {
        const open = skipSpaces(s, i);
        if (s[open] === "[") {
          const close = groupEnd(s, open);
          if (close > 0) {
            const inner = s.slice(open + 1, close - 1);
            const trimmed = inner.trim();
            out += s.slice(i, open) + (trimmed === "{}" ? `[${SLOT_GROUP}]` : `[${drawSequence(inner)}]`);
            i = close;
          }
        }
      }
      for (const isSlot of structure.args) {
        const open = skipSpaces(s, i);
        if (open >= s.length) break;
        if (s[open] === "{") {
          const close = groupEnd(s, open);
          if (close < 0) break;
          const inner = s.slice(open + 1, close - 1);
          out += s.slice(i, open) + (!inner.trim() ? (isSlot ? SLOT_GROUP : "{}") : isSlot ? `{${drawSequence(inner)}}` : s.slice(open, close));
          i = close;
        } else {
          const close = tokenEnd(s, open);
          out += s.slice(i, close);
          i = close;
        }
      }
      continue;
    }
    if (OPERAND_COMMANDS.has(name)) {
      out += s.slice(i, nameEnd);
      i = nameEnd;
      // Its limits, then the operand: an empty group there is a slot.
      for (;;) {
        const at = skipSpaces(s, i);
        if (s[at] === "\\") {
          const next = readCommand(s, at);
          if (next.name === "limits" || next.name === "nolimits") {
            out += s.slice(i, next.end);
            i = next.end;
            continue;
          }
          break;
        }
        if (s[at] === "_" || s[at] === "^") {
          const script = drawScriptArgument(s, at + 1);
          out += s.slice(i, at + 1) + script.text;
          i = script.end;
          continue;
        }
        break;
      }
      const operand = skipSpaces(s, i);
      if (s[operand] === "{") {
        const close = groupEnd(s, operand);
        if (close > 0 && !s.slice(operand + 1, close - 1).trim()) {
          out += s.slice(i, operand) + SLOT_GROUP;
          i = close;
        }
      }
      continue;
    }
    const verbatim = VERBATIM_ARGUMENTS[name];
    if (verbatim !== undefined) {
      let at = nameEnd;
      for (let count = 0; count < verbatim; count += 1) {
        const open = skipSpaces(s, at);
        if (s[open] === "[") {
          const close = groupEnd(s, open);
          if (close < 0) break;
          at = close;
          count -= 1;
          continue;
        }
        if (s[open] !== "{") break;
        const close = groupEnd(s, open);
        if (close < 0) break;
        at = close;
      }
      out += s.slice(i, at);
      i = at;
      continue;
    }
    out += s.slice(i, nameEnd);
    i = nameEnd;
  }
  return out;
}

/** `latex` with every empty argument slot drawn as Word's dotted placeholder box. */
export function drawEmptyArgumentSlots(latex: string): string {
  try {
    return drawSequence(latex);
  } catch {
    return latex;
  }
}
