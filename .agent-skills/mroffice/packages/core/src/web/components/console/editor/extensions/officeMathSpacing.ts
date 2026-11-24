/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's spacing for an imported Office formula (`data-math-style="office"`),
 * where it is not TeX's. Word spaces atoms by their classes as TeX does (5/18
 * em around a relation, 4/18 em around a binary operator: measured 4.44 px and
 * 3.56 px at 16 px), except where measured otherwise against Word for Mac
 * 16.9 on 700 of a textbook's formulas and 405 single symbols (each between
 * two marker characters, the width read from Word's PDF):
 *
 *  - A delimiter object (`m:d`, imported as `\left( ... \right)`) is an
 *    ordinary atom: no thin space before or after it. KaTeX sets it as an
 *    inner atom, 3 mu after the letter before it (f(x): 2.67 px here, 0.48 px
 *    in Word, the letter's italic correction alone).
 *  - A colon is punctuation: nothing before it, a thin space after (f:X->Y:
 *    0.47 px and 2.66 px in Word). TeX makes it a relation, 5 mu each side.
 *  - A binary operator ending the formula keeps the space before it
 *    (\mathbb{F}-: 3.56 px between the F and the minus in Word). TeX makes a
 *    final binary operator ordinary, with no space.
 *
 * An italic letter's correction is the stylesheet's (note-editor.css, under
 * `[data-math-style="office"]`): Cambria Math's is a fraction of Computer
 * Modern's (V: 0.52 px in Word, 3.56 px here) and none between two letters.
 *
 * The stored source is unchanged; this is what KaTeX is given to draw.
 */

const BINARY_OPERATORS = new Set([
  "+", "-", "−", "\\pm", "\\mp", "\\times", "\\cdot", "\\div", "\\cup", "\\cap", "\\oplus", "\\otimes",
  "\\ominus", "\\setminus", "\\ast", "\\circ", "\\bullet", "\\wedge", "\\vee",
]);
/** Commands whose braced argument is text: a colon in it is a colon. */
const TEXT_COMMANDS = new Set(["\\text", "\\textrm", "\\mathrm", "\\operatorname", "\\mbox", "\\textit", "\\textbf"]);
const NOT_AN_OPERAND = new Set(["{", "(", "[", "\\left", "&", "\\\\", "^", "_", "=", ","]);

function tokens(source: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < source.length;) {
    if (source[i] === "\\") {
      const match = /^\\([A-Za-z]+|.)/su.exec(source.slice(i));
      const token = match?.[0] ?? "\\";
      out.push(token);
      i += token.length;
      continue;
    }
    const code = source.codePointAt(i) ?? 0;
    const character = String.fromCodePoint(code);
    out.push(character);
    i += character.length;
  }
  return out;
}

const blank = (token: string | undefined) => token !== undefined && /^\s+$/u.test(token);

/** The index of the `}` closing the group opened at `open` (a `{`), or -1. */
function groupEnd(list: readonly string[], open: number): number {
  let depth = 0;
  for (let i = open; i < list.length; i += 1) {
    if (list[i] === "{") depth += 1;
    else if (list[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewrite(list: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];
    if (TEXT_COMMANDS.has(token)) {
      let open = i + 1;
      while (blank(list[open])) open += 1;
      const close = list[open] === "{" ? groupEnd(list, open) : -1;
      if (close < 0) {
        out.push(token);
        continue;
      }
      out.push(...list.slice(i, close + 1));
      i = close;
      continue;
    }
    if (token === "\\left") {
      let depth = 0;
      let right = i;
      for (; right < list.length; right += 1) {
        if (list[right] === "\\left") depth += 1;
        else if (list[right] === "\\right" && --depth === 0) break;
      }
      let delimiter = right + 1;
      while (blank(list[delimiter])) delimiter += 1;
      if (right >= list.length || delimiter >= list.length) {
        out.push(token);
        continue;
      }
      // Braced, the pair is an ordinary atom; its body is spaced as before.
      out.push("{", "\\left", ...rewrite(list.slice(i + 1, right)), "\\right", ...list.slice(right + 1, delimiter + 1), "}");
      i = delimiter;
      continue;
    }
    if (token === ":" && list[i + 1] !== "=" && list[i - 1] !== ":") {
      out.push("\\mathpunct{:}");
      continue;
    }
    out.push(token);
  }
  return out;
}

/** What KaTeX draws an Office formula from: `latex` with Word's spacing. */
export function officeMathLatex(latex: string): string {
  const out = rewrite(tokens(latex));
  let last = out.length - 1;
  while (blank(out[last])) last -= 1;
  if (last > 0 && BINARY_OPERATORS.has(out[last])) {
    let before = last - 1;
    while (blank(out[before])) before -= 1;
    if (before >= 0 && !BINARY_OPERATORS.has(out[before]) && !NOT_AN_OPERAND.has(out[before])) {
      out.splice(last, 0, "\\mskip 4mu ");
    }
  }
  return out.join("");
}
