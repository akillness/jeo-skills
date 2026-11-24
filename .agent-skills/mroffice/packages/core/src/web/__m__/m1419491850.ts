/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Lossless, display-only handling for an in-flight Markdown prefix.
 *
 * Completed model output is rendered exactly as received. While a stream is
 * inside a fenced block we append a temporary matching fence to the render
 * copy so the AST parser cannot reinterpret code as prose. The stored string
 * and the caller's input are never changed.
 */

function closingFenceForPrefix(text: string): string | null {
  let open: { marker: "`" | "~"; length: number } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const indentation = line.match(/^ */)?.[0].length ?? 0;
    if (indentation > 3) continue;
    const candidate = line.slice(indentation);
    const marker = candidate[0];
    if (marker !== "`" && marker !== "~") continue;
    let length = 0;
    while (candidate[length] === marker) length += 1;
    if (length < 3) continue;
    if (open === null) {
      open = { marker, length };
      continue;
    }
    if (open.marker === marker && length >= open.length) {
      open = null;
    }
  }
  return open ? open.marker.repeat(open.length) : null;
}

export function protectPartialFenceBlocks(text: string): string {
  const closingFence = closingFenceForPrefix(text);
  if (!closingFence) return text;
  return `${text}${text.endsWith("\n") ? "" : "\n"}${closingFence}`;
}

export function normalizeStreamingMarkdown(text: string): string {
  return protectPartialFenceBlocks(text);
}















const NEXT_PROMPT_BLOCK = /\n*```[ \t]*mrai-next[ \t]*(?:\n[\s\S]*?(?:\n```[ \t]*(?=\n|$)|$)|$)/g;
const NEXT_PROMPT_OPENING = /(?:^|\n+)[ \t]*`{1,3}(?:[ \t]*m(?:r(?:a(?:i(?:-(?:n(?:e(?:x(?:t)?)?)?)?)?)?)?)?)?$/;










const QUESTION_BLOCK = /<user_question>[\s\S]*?(?:<\/user_question>|$)|<\/user_question>/g;
const QUESTION_TAG_OPENING = /<(?:\/)?(?:u(?:s(?:e(?:r(?:_(?:q(?:u(?:e(?:s(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?)?)?)?)?)?)?$/;

export function withoutQuestionMarkup(text: string): string {
  if (!text || !text.includes("<")) return text;
  let out = text.includes("user_question>") ? text.replace(QUESTION_BLOCK, "") : text;
  const opening = out.match(QUESTION_TAG_OPENING);
  // "<" alone, or "</" alone, is too little to call a tag.
  if (opening && opening[0].replace(/^<\/?/, "").length > 0) {
    out = out.slice(0, opening.index);
  }
  return out === text ? text : out.replace(/\s+$/, "");
}

export function withoutNextPrompt(text: string): string {
  if (!text) return text;
  text = withoutQuestionMarkup(text);
  let out = text.includes("mrai-next") ? text.replace(NEXT_PROMPT_BLOCK, "") : text;
  // The block's fence arriving token by token, before its name is complete;
  // a fence that closes a code block is not one.
  const opening = out.match(NEXT_PROMPT_OPENING);
  if (opening && opening[0].trim()) {
    const before = out.slice(0, opening.index);
    const fences = before.split("\n").filter((line) => /^\s*```/.test(line)).length;
    if (fences % 2 === 0) out = before;
  }
  return out.replace(/\s+$/, "");
}




export function nextPromptsFromAnswer(text: string | null | undefined): string[] {
  if (!text || !text.includes("mrai-next")) return [];
  let found: string | null = null;
  for (const match of text.matchAll(/```[ \t]*mrai-next[ \t]*\n([\s\S]*?)(?:\n```|$)/g)) found = match[1];
  const lines = (found ?? "")
    .split("\n")
    .map((row) => row.split(/\s+/).join(" ").replace(/^["'“”「」\s\-•*]+|["'“”「」\s]+$/g, ""))
    .filter((row) => row && row.length <= 120);
  return [...new Set(lines)].slice(0, 3);
}

/** The likeliest of them, the composer's grey suggestion, or null. */
export function nextPromptFromAnswer(text: string | null | undefined): string | null {
  return nextPromptsFromAnswer(text)[0] ?? null;
}






























export function isolateDisplayMath(text: string, streaming = false): string {
  if (!text.includes("$$")) return text;
  const out: string[] = [];
  let fence: string | null = null;
  let prose: string[] = [];
  const flush = (atEnd: boolean) => {
    if (prose.length) out.push(...setDisplayMathApart(prose, atEnd));
    prose = [];
  };
  for (const line of text.split("\n")) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      flush(false);
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }
    prose.push(line);
  }
  flush(streaming);
  return out.join("\n");
}

/** Quote and list markup opening a line: the quote marks and indentation,
 * then a list marker if there is one. */
const LINE_CONTAINER = /^((?:[ \t]*>)*[ \t]*)((?:[-*+]|\d{1,9}[.)])[ \t]+)?/;
/** What may follow a display formula's closing `$$` and still belong to it. */
const FORMULA_END_PUNCTUATION = /^[ \t]*[。．，、；：！？,.;:!?]*[ \t]*$/;

/** The markup a line's continuation lines carry: its quote marks and
 * indentation, a list marker as the spaces of its width. */
function continuationOf(line: string): string {
  const match = LINE_CONTAINER.exec(line);
  return (match?.[1] ?? "") + " ".repeat(match?.[2]?.length ?? 0);
}

/** A blank line inside the same container (a quote keeps its marks). */
function blankIn(cont: string): string {
  return cont.replace(/[^>]/g, "").split("").join(" ");
}

function isBlankLine(line: string | undefined): boolean {
  return line === undefined || !/[^ \t>]/.test(line);
}

/** The `$$` delimiters of a prose run, paired in order; an opener left
 * without a closer ends the list with -1. */
function displayMathPairs(text: string): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      let run = 0;
      while (text[index + run] === "`") run += 1;
      const close = text.indexOf("`".repeat(run), index + run);
      index = close >= 0 ? close + run : index + run;
      continue;
    }
    if (char !== "$") {
      index += 1;
      continue;
    }
    let run = 0;
    while (text[index + run] === "$") run += 1;
    if (run === 2) {
      const close = displayMathClose(text, index + 2);
      pairs.push([index, close]);
      if (close < 0) break;
      index = close + 2;
      continue;
    }
    if (run === 1) {
      const close = inlineMathClose(text, index + 1);
      index = close >= 0 ? close + 1 : index + 1;
      continue;
    }
    index += run;
  }
  return pairs;
}

function displayMathClose(text: string, from: number): number {
  for (let at = from; at < text.length - 1; at += 1) {
    if (text[at] === "\\") {
      at += 1;
      continue;
    }
    if (text[at] === "$" && text[at + 1] === "$") return at;
  }
  return -1;
}

/** The `$` closing inline maths opened just before `from`, in its paragraph. */
function inlineMathClose(text: string, from: number): number {
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (char === "\\") {
      at += 1;
      continue;
    }
    if (char === "\n" && /^\n[ \t>]*\n/.test(text.slice(at, at + 64))) return -1;
    if (char !== "$") continue;
    return text[at + 1] === "$" ? -1 : at;
  }
  return -1;
}

/** One prose run (no code fence in it) with its display formulas in fence form. */
function setDisplayMathApart(lines: string[], atEnd: boolean): string[] {
  const text = lines.join("\n");
  if (!text.includes("$$")) return lines;
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const lineOf = (position: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= position) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  const out: string[] = [];
  let next = 0;
  for (const [open, close] of displayMathPairs(text)) {
    const first = lineOf(open);
    // Two formulas sharing a line with words between them: left as written.
    if (first < next) continue;
    const before = lines[first].slice(0, open - starts[first]);
    if (close < 0 && !atEnd) {
      // A `$$` with no partner is shown as written; the rest reads as Markdown.
      out.push(...lines.slice(next, first), `${before}\\$\\$${lines[first].slice(open - starts[first] + 2)}`);
      next = first + 1;
      break;
    }
    const last = close < 0 ? lines.length - 1 : lineOf(close);
    const body = close < 0 ? text.slice(open + 2) : text.slice(open + 2, close);
    const after = close < 0 ? "" : lines[last].slice(close + 2 - starts[last]);
    const container = LINE_CONTAINER.exec(before);
    const alone = container?.[0] === before;
    if (close >= 0 && !body.includes("\n") && !(alone && FORMULA_END_PUNCTUATION.test(after))) continue;
    out.push(...lines.slice(next, first));
    const cont = continuationOf(alone ? before : lines[first]);
    let fenceOpen = before;
    if (!alone) {
      out.push(before.replace(/[ \t]+$/, ""), blankIn(cont));
      fenceOpen = cont;
    } else if (!container?.[2] && out.length > 0 && !isBlankLine(out[out.length - 1])) {
      out.push(blankIn(cont));
    }
    const pieces = body.split("\n");
    const inner: string[] = [];
    if (pieces[0].trim()) inner.push(cont + pieces[0].trim());
    if (pieces.length > 1) {
      inner.push(...pieces.slice(1, -1));
      let tail = pieces[pieces.length - 1];
      // Still streaming: the closing `$$` arriving a dollar at a time.
      if (close < 0) tail = tail.replace(/(^|[^\\$])\$$/, "$1");
      if (tail.trim()) inner.push(tail.replace(/[ \t]+$/, ""));
    }
    const punctuation = FORMULA_END_PUNCTUATION.test(after) ? after.trim() : "";
    if (punctuation) {
      let at = inner.length - 1;
      while (at >= 0 && !inner[at].trim()) at -= 1;
      if (at >= 0) inner[at] += punctuation;
    }
    out.push(`${fenceOpen}$$`, ...inner);
    next = last + 1;
    if (close < 0) break;
    out.push(`${cont}$$`);
    if (!punctuation && after.trim()) out.push(blankIn(cont), cont + after.trim());
    if (next < lines.length && !isBlankLine(lines[next])) {
      out.push(blankIn(cont));
      // The blank line set after a formula would make a following line
      // indented four spaces past it an indented code block ("    - 子项"
      // drawn as code): that line starts at the formula's margin instead.
      const indent = /^[ \t]*/.exec(lines[next])?.[0].length ?? 0;
      if (indent >= cont.length + 4) lines[next] = cont + lines[next].trimStart();
    }
  }
  out.push(...lines.slice(next));
  return out;
}

export function normalizeLatexMathDelimiters(text: string): string {
  if (
    !text.includes("\\[") &&
    !text.includes("\\(") &&
    !text.includes("\\begin{") &&
    !/^ {0,3}(`{3,}|~{3,})\s*math\s*$/m.test(text)
  ) {
    return text;
  }
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: { marker: string; length: number; math: string[] | null } | null = null;
  let prose: string[] = [];
  const flush = () => {
    if (prose.length) out.push(convertProse(prose.join("\n")));
    prose = [];
  };
  for (const line of lines) {
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closes =
        opener && opener[1][0] === fence.marker && opener[1].length >= fence.length && !line.slice(opener[0].length).trim();
      if (fence.math) {
        // A ```math block (GitHub's display maths): drawn as a $$ formula.
        if (closes) {
          out.push("$$", ...fence.math, "$$");
          fence = null;
        } else {
          fence.math.push(line);
        }
        continue;
      }
      out.push(line);
      if (closes) fence = null;
      continue;
    }
    if (opener) {
      flush();
      const math = line.slice(opener[0].length).trim() === "math";
      fence = { marker: opener[1][0], length: opener[1].length, math: math ? [] : null };
      if (!math) out.push(line);
      continue;
    }
    prose.push(line);
  }
  // A ```math block still being written: its lines as they stand.
  if (fence?.math) out.push("$$", ...fence.math, "$$");
  flush();
  return out.join("\n");
}

/** The environments a model writes bare, without dollars, that KaTeX draws. */
const BARE_MATH_ENVIRONMENT = /^\\begin\{(equation|align|gather|multline|eqnarray|aligned|gathered|split|cases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|array)(\*?)\}/;

function convertProse(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "`") {
      // an inline code span: copied whole when it closes
      let run = 0;
      while (text[index + run] === "`") run += 1;
      const ticks = "`".repeat(run);
      const close = text.indexOf(ticks, index + run);
      if (close >= 0) {
        result += text.slice(index, close + run);
        index = close + run;
        continue;
      }
      result += ticks;
      index += run;
      continue;
    }
    if (char === "$") {
      // maths already in dollars: copied whole when it closes
      const dollars = text[index + 1] === "$" ? "$$" : "$";
      const close = findUnescaped(text, dollars, index + dollars.length);
      if (close >= 0) {
        result += text.slice(index, close + dollars.length);
        index = close + dollars.length;
        continue;
      }
      result += dollars;
      index += dollars.length;
      continue;
    }
    if (char === "\\") {
      const next = text[index + 1];
      if (next === "\\") {
        result += "\\\\";
        index += 2;
        continue;
      }
      const bare = next === "b" ? BARE_MATH_ENVIRONMENT.exec(text.slice(index)) : null;
      if (bare) {
        // \begin{aligned}…\end{aligned} written as prose: a $$ formula.
        const end = `\\end{${bare[1]}${bare[2]}}`;
        const close = text.indexOf(end, index + bare[0].length);
        if (close >= 0) {
          result += `$$${text.slice(index, close + end.length)}$$`;
          index = close + end.length;
          continue;
        }
      }
      if (next === "[" || next === "(") {
        const closer = next === "[" ? "\\]" : "\\)";
        const close = findUnescaped(text, closer, index + 2);
        const body = close >= 0 ? text.slice(index + 2, close) : "";
        // inline maths stays on one line; a display may span lines
        if (close >= 0 && body.trim() && (next === "[" || !body.includes("\n"))) {
          result += next === "[" ? `$$${body}$$` : `$${body.trim()}$`;
          index = close + 2;
          continue;
        }
      }
      result += char + (next ?? "");
      index += next === undefined ? 1 : 2;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

/** The next `token` at or after `from` that no backslash escapes. */
function findUnescaped(text: string, token: string, from: number): number {
  let at = text.indexOf(token, from);
  while (at >= 0) {
    let slashes = 0;
    while (at - 1 - slashes >= from && text[at - 1 - slashes] === "\\") slashes += 1;
    if (slashes % 2 === 0) return at;
    at = text.indexOf(token, at + 1);
  }
  return -1;
}

/**
 * A dollar sign that is money, not maths: "价格从 $5 涨到 $8" drew "5 涨到" as
 * an italic formula. Pandoc's rule for `$…$` decides (the one GitHub follows),
 * held to the next dollar: an opening `$` is not followed by a space, the
 * next `$` closes it when it is not preceded by one nor followed by a digit,
 * in the same paragraph. A `$` with no such partner is escaped and shows as
 * itself. Display only; code (fenced
 * or inline), `$$` formulas and `\$` pass through as they are.
 */
export function guardCurrencyDollars(text: string): string {
  if (!/\$\s?[0-9]/.test(text)) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: { marker: string; length: number } | null = null;
  let prose: string[] = [];
  const flush = () => {
    if (prose.length) out.push(guardProse(prose.join("\n")));
    prose = [];
  };
  for (const line of lines) {
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (opener && opener[1][0] === fence.marker && opener[1].length >= fence.length && !line.slice(opener[0].length).trim()) {
        fence = null;
      }
      continue;
    }
    if (opener) {
      flush();
      fence = { marker: opener[1][0], length: opener[1].length };
      out.push(line);
      continue;
    }
    prose.push(line);
  }
  flush();
  return out.join("\n");
}

function closingDollar(text: string, from: number): number {
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (char === "\\") {
      at += 1;
      continue;
    }
    if (char === "\n" && text[at + 1] === "\n") return -1;
    if (char !== "$") continue;
    // Maths holds no bare dollar: the next one closes it, or this one is
    // money ("$5 涨到 $8 … $v$" paired $5 with the formula's end).
    if (text[at + 1] === "$") return -1;
    return !/\s/.test(text[at - 1] ?? " ") && !/[0-9]/.test(text[at + 1] ?? "") ? at : -1;
  }
  return -1;
}

function guardProse(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "`") {
      let run = 0;
      while (text[index + run] === "`") run += 1;
      const ticks = "`".repeat(run);
      const close = text.indexOf(ticks, index + run);
      const end = close >= 0 ? close + run : index + run;
      result += text.slice(index, end);
      index = end;
      continue;
    }
    if (char === "\\") {
      result += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === "$" && text[index + 1] === "$") {
      const close = findUnescaped(text, "$$", index + 2);
      const end = close >= 0 ? close + 2 : text.length;
      result += text.slice(index, end);
      index = end;
      continue;
    }
    if (char === "$") {
      const close = /\s/.test(text[index + 1] ?? " ") ? -1 : closingDollar(text, index + 1);
      if (close >= 0) {
        result += text.slice(index, close + 1);
        index = close + 1;
        continue;
      }
      result += "\\$";
      index += 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

/**
 * An answer's text as every answer renderer draws it: without the hidden
 * next-prompt block, LaTeX delimiters as dollars, money dollars escaped, and
 * one-line display formulas set apart. Display only.
 */
export function answerMarkdownForDisplay(text: string, streaming = false): string {
  const reader = withoutNextPrompt(text);
  const shown = !streaming
    ? reader
    : closingFenceForPrefix(reader)
      ? protectPartialFenceBlocks(reader)
      : holdUnfinishedInlineTail(reader);
  return isolateDisplayMath(guardCurrencyDollars(normalizeLatexMathDelimiters(shown)), streaming);
}










export function holdUnfinishedInlineTail(text: string): string {
  const cut = text.lastIndexOf("\n") + 1;
  const head = text.slice(0, cut);
  let line = text.slice(cut);
  if (!line.trim() || /^\s*\|/.test(line)) return text;
  // An odd run of backticks leaves the line inside a code span: as it is.
  if ((line.match(/`/g) ?? []).length % 2 === 1) return text;
  // ![alt](partial: nothing until it can be drawn; [words](partial: the words.
  line = line
    .replace(/!\[[^\]\n]*\]\([^)\s]*$/, "")
    .replace(/\[([^\]\n]*)\]\([^)\s]*$/, "$1")
    // ![alt or [words with no closing bracket yet.
    .replace(/!\[[^\]\n]*$/, "")
    .replace(/\[([^\]\n]*)$/, "$1");
  // Bold pairs within its paragraph, which may have begun lines above.
  const paragraph = head.slice(head.lastIndexOf("\n\n") + 1);
  const prose = (paragraph + line).replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
  const strong = [...prose.matchAll(/\*\*/g)];
  const last = strong[strong.length - 1]?.index ?? -1;
  if (strong.length % 2 === 1 && last >= paragraph.length) {
    const at = last - paragraph.length;
    line = line.slice(0, at) + line.slice(at + 2);
  }
  return head + line;
}
