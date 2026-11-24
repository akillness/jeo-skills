/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Self-contained evaluator for Word-style formulas in DOCUMENT table cells
 * (rich-text TipTap tables — NOT the spreadsheet page type). A cell may carry an
 * optional `formula` attribute: a string starting with `=` whose computed value
 * is what the cell DISPLAYS (the raw formula is shown only while the cell is
 * focused/edited; see tableCellStyle.ts + the TableCell extension).
 *
 * Scope (kept deliberately small + decoupled from the spreadsheet grid engine):
 *   - Directional aggregates over adjacent cells, Word/WPS-style:
 *       =SUM(ABOVE)  =SUM(LEFT)  =SUM(BELOW)  =SUM(RIGHT)
 *       =AVERAGE(ABOVE)  =COUNT(LEFT)  =PRODUCT(ABOVE) ...
 *     and the union form =AVERAGE(ABOVE|LEFT) (also LEFT|ABOVE, any direction
 *     pair, deduplicated by cell position so an overlap is never double-counted).
 *   - Intra-table A1-style references inside the aggregates AND in arithmetic:
 *       =A1+B2      =A1*2-C3      =SUM(A1, B2, A3)
 *     A = first column, row 1 = first row; matched against THIS table only.
 *   - Plain arithmetic over numeric cell values with + - * / and parentheses,
 *     unary minus, and numeric literals: =A1*2, =(A1+A2)/2.
 *
 * Numeric semantics (mirrors the spec + Excel/Word aggregate behavior):
 *   - SUM / PRODUCT: non-numeric cells count as 0 (PRODUCT therefore treats a
 *     blank/text cell as 0 — matching Excel where a text token in PRODUCT range
 *     is ignored; here a directional blank contributes 0, see note below).
 *   - AVERAGE / COUNT: non-numeric cells are SKIPPED (not counted). AVERAGE of an
 *     empty numeric set is 0 (Word renders 0, not a div-by-zero error).
 *   - A direct A1 reference to a non-numeric cell used in arithmetic resolves to
 *     0 (so =A1+1 on a text A1 is 1), matching Word field arithmetic.
 *
 * Cycle guard: evaluating a cell whose formula references its own position
 * (directly, or transitively through other formula cells) returns the #REF!
 * sentinel for that branch and never recurses infinitely. A top-level formula
 * that is itself part of a cycle renders as `#REF!`.
 *
 * This module imports NOTHING from the spreadsheet engine: the A1 helpers and a
 * tiny recursive-descent arithmetic parser are reimplemented here so the
 * document editor stays independent of lib/spreadsheet/formula-engine.ts.
 */

import type { CellFormulaNumberFormat } from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";

/** Sentinel rendered for a cyclic / malformed / out-of-range formula. */
export const TABLE_FORMULA_REF_ERROR = "#REF!" as const;

/** Functions the editor can both evaluate and truthfully expose in Paste Function. */
export const TABLE_FORMULA_FUNCTIONS = [
  "ABS",
  "AND",
  "AVERAGE",
  "COUNT",
  "DEFINED",
  "FALSE",
  "IF",
  "INT",
  "MAX",
  "MIN",
  "MOD",
  "NOT",
  "OR",
  "PRODUCT",
  "ROUND",
  "SIGN",
  "SUM",
  "TRUE",
] as const;
export type TableFormulaFunction = (typeof TABLE_FORMULA_FUNCTIONS)[number];

/** A single document-table cell as seen by the evaluator. */
export interface TableFormulaCell {
  /**
   * The cell's plain-text content. For a NON-formula cell this is the literal
   * text shown in the cell; for a formula cell it is the last-computed display
   * text (ignored — the formula is recomputed from scratch each pass).
   */
  text: string;
  /** Optional formula string (must start with `=`); absent on plain cells. */
  formula?: string | null;
  /** Optional native Word numeric-picture switch for the displayed result. */
  numberFormat?: CellFormulaNumberFormat | null;
  /** True for a native tableHeader cell; positional directions skip headers. */
  header?: boolean;
  




  covered?: boolean;
}

/** A rectangular grid of cells, row-major. Ragged rows are tolerated. */
export type TableFormulaGrid = TableFormulaCell[][];

/** A direction keyword usable inside a directional aggregate. */
type Direction = "ABOVE" | "BELOW" | "LEFT" | "RIGHT";

const DIRECTIONS: ReadonlySet<string> = new Set<Direction>([
  "ABOVE",
  "BELOW",
  "LEFT",
  "RIGHT",
]);

const AGGREGATE_NAMES: ReadonlySet<string> = new Set([
  "SUM",
  "AVERAGE",
  "COUNT",
  "PRODUCT",
  "MIN",
  "MAX",
]);
const SCALAR_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "ABS",
  "AND",
  "DEFINED",
  "FALSE",
  "IF",
  "INT",
  "MOD",
  "NOT",
  "OR",
  "ROUND",
  "SIGN",
  "TRUE",
]);
const SUPPORTED_FUNCTION_NAMES: ReadonlySet<string> = new Set(
  TABLE_FORMULA_FUNCTIONS,
);

/**
 * True when `text` (a cell's editable content) is a formula. A formula is a
 * string whose first non-whitespace character is `=` and that has at least one
 * more character after it. This is the single predicate the extension/toolbar
 * use to decide formula-vs-literal, so it stays cheap and total.
 */
export function isTableFormula(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  return trimmed.length > 1 && trimmed.startsWith("=");
}

// ---------------------------------------------------------------------------
// A1 helpers (reimplemented locally; column A = 0, row 1 = 0)
// ---------------------------------------------------------------------------

const CELL_REF_RE = /^([A-Za-z]{1,3})([0-9]{1,7})$/;

/** "A" -> 0, "Z" -> 25, "AA" -> 26. Returns -1 for an invalid letter run. */
function lettersToColumn(letters: string): number {
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) return -1;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** Parse "A1" / "b12" into 0-indexed { row, col }; null when not a cell ref. */
function parseCellRef(token: string): { row: number; col: number } | null {
  const m = CELL_REF_RE.exec(token.trim());
  if (!m) return null;
  const col = lettersToColumn(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0 || !Number.isInteger(row)) return null;
  return { row, col };
}

const RNCN_CELL_REF_RE = /^R([1-9][0-9]{0,6})C([1-9][0-9]{0,6})$/i;

function parseRnCnCellRef(
  token: string,
): { row: number; col: number } | null {
  const match = RNCN_CELL_REF_RE.exec(token.trim());
  if (!match) return null;
  return { row: Number(match[1]) - 1, col: Number(match[2]) - 1 };
}

function parseAnyCellRef(
  token: string,
): { row: number; col: number } | null {
  return parseRnCnCellRef(token) ?? parseCellRef(token);
}








export function formulaNameReadsAsCellReference(name: string): boolean {
  return parseAnyCellRef(name) !== null;
}

// ---------------------------------------------------------------------------
// Numeric coercion of a single cell
// ---------------------------------------------------------------------------

/**
 * Parse a cell's plain text into a finite number, or null when it is not a
 * clean numeric literal. Strips a leading currency symbol, thousands commas and
 * a trailing percent (Word treats "1,234" / "$5" / "10%" as numbers). Anything
 * else (free text, empty) is null → treated per the caller's aggregate rule.
 */
/**
 * Currency symbols a table number may be written with ("$5", "€3"). Shared by
 * the formula engine and the table Sort's "Number" type, so a value one of them
 * reads as a number the other does too.
 */
export const TABLE_NUMBER_CURRENCY_PREFIX_SOURCE = "[$£€¥￥₩₹]";
// A minus may stand before the currency symbol as well as after it: Word's
// = field reads "-$5.00" as it reads "$-5.00" and "-5" (measured on Word 16

// before the symbol Word does not read as a number, so neither do we.
const CURRENCY_PREFIX_RE = new RegExp(`^(-?)${TABLE_NUMBER_CURRENCY_PREFIX_SOURCE}`, "u");

function numberFromText(text: string): number | null {
  const raw = text.trim();
  if (raw === "") return null;
  const currency = CURRENCY_PREFIX_RE.exec(raw);
  let s = currency ? raw.slice(currency[0].length) : raw;
  if (currency?.[1]) {
    // "-$-5" carries two signs: not a number.
    if (/^[-+]/.test(s)) return null;
    s = `-${s}`;
  }
  s = s.replace(/,/g, "");
  let scale = 1;
  if (s.endsWith("%")) {
    s = s.slice(0, -1);
    scale = 0.01;
  }
  // Accept scientific/E-notation too: a user can type "1e3"/"1.5E2", and the
  // renderer itself emits E-notation for integer results >= 1e21 (String(1e21)
  // === "1e+21"). Without the exponent branch those parsed as non-numbers and
  // aggregates silently read them as 0 — including values the engine had just
  // rendered, which it then could not read back.
  if (s === "" || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s) * scale;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Evaluation state
// ---------------------------------------------------------------------------

interface ResolvedCellNumber {
  value: number | null;
  ref: boolean;
}

/** The text of a bookmark operand by the name a formula writes, or undefined. */
type BookmarkValueLookup = (name: string) => string | undefined;

interface EvalState {
  grid: TableFormulaGrid;
  bookmarkValues: BookmarkValueLookup;
  /** Positions ("r:c") currently on the recursion stack — cycle detection. */
  visiting: Set<string>;
  /**
   * Resolved cell values shared by every formula evaluated in one context (one
   * recompute pass over one logical table). Only values computed without
   * touching a cycle, the depth guard or the work budget are stored, so a
   * cached value never depends on which cell happened to be evaluated first.
   */
  cache: Map<string, ResolvedCellNumber>;
  /** Formula cells already evaluated by the dependency pre-pass. */
  settled: Set<string>;
  /** Count of cycle / depth-guard / budget hits; a changed count blocks caching. */
  uncacheableHits: number;
  /** Current formula recursion depth. */
  depth: number;
  /** Cell resolutions and dependency visits spent so far in this context. */
  work: number;
  exhausted: boolean;
}

/**
 * Deepest formula-to-formula recursion a single evaluation may take. The
 * dependency pre-pass evaluates every acyclic dependency bottom-up first, so a
 * real evaluation recurses at most one level into an already cached value; only
 * a genuine reference cycle can still recurse, and it resolves to #REF! anyway.
 */
const MAX_FORMULA_RECURSION_DEPTH = 256;

/**
 * Work budget for one evaluation context (one logical table per recompute).
 * With the shared cache every formula costs one read per referenced cell, so a
 * dense 5,000-cell table in which every cell sums the whole column above still
 * stays below it. A table that exceeds it renders #REF! instead of freezing the
 * editor.
 */
export const TABLE_FORMULA_WORK_BUDGET = 20_000_000;

function createEvalState(
  grid: TableFormulaGrid,
  bookmarkValues: BookmarkValueLookup,
): EvalState {
  return {
    grid,
    bookmarkValues,
    visiting: new Set(),
    cache: new Map(),
    settled: new Set(),
    uncacheableHits: 0,
    depth: 0,
    work: 0,
    exhausted: false,
  };
}

function spendWork(state: EvalState, amount = 1): boolean {
  state.work += amount;
  if (state.work > TABLE_FORMULA_WORK_BUDGET) {
    state.exhausted = true;
    state.uncacheableHits += 1;
  }
  return !state.exhausted;
}

function bookmarkKey(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("en-US");
}

function resolveBookmarkNumber(state: EvalState, name: string): Scalar {
  const value = state.bookmarkValues(name);
  if (value === undefined) return REF_ERROR;
  return numberFromText(value) ?? REF_ERROR;
}

const REF_ERROR = Symbol("ref-error");
/** A resolved scalar is either a finite number or the #REF! sentinel symbol. */
type Scalar = number | typeof REF_ERROR;

function isRefError(v: Scalar): v is typeof REF_ERROR {
  return v === REF_ERROR;
}

function cellAt(grid: TableFormulaGrid, row: number, col: number): TableFormulaCell | null {
  const r = grid[row];
  if (!r) return null;
  return r[col] ?? null;
}

/**
 * Resolve the NUMERIC value of the cell at (row, col): if it holds a formula,
 * evaluate it (with cycle tracking); otherwise parse its text. `null` means the
 * cell is out of range OR resolved to a non-number (the caller decides whether a
 * non-number contributes 0 or is skipped). A cycle anywhere in the chain yields
 * the #REF! sentinel, which propagates.
 */
function resolveCellNumber(
  state: EvalState,
  row: number,
  col: number,
): ResolvedCellNumber {
  const cell = cellAt(state.grid, row, col);
  // A cell the table does not have is not a cell with nothing in it: the
  
  // 0 and showed 1). An existing cell with no number still contributes 0.
  if (!cell) return { value: null, ref: true };
  const key = `${row}:${col}`;
  const cached = state.cache.get(key);
  if (cached) return cached;
  if (!spendWork(state)) return { value: null, ref: true };
  if (isTableFormula(cell.formula)) {
    if (state.visiting.has(key)) {
      // Self / transitive cycle: this branch is #REF!.
      state.uncacheableHits += 1;
      return { value: null, ref: true };
    }
    if (state.depth >= MAX_FORMULA_RECURSION_DEPTH) {
      state.uncacheableHits += 1;
      return { value: null, ref: true };
    }
    const hitsBefore = state.uncacheableHits;
    state.visiting.add(key);
    state.depth += 1;
    let resolved: ResolvedCellNumber;
    try {
      const result = evalFormulaExpr(state, cell.formula as string, row, col);
      resolved = isRefError(result)
        ? { value: null, ref: true }
        : { value: result, ref: false };
    } finally {
      state.depth -= 1;
      state.visiting.delete(key);
    }
    if (state.uncacheableHits === hitsBefore) state.cache.set(key, resolved);
    return resolved;
  }
  const resolved = { value: numberFromText(cell.text), ref: false };
  state.cache.set(key, resolved);
  return resolved;
}

// ---------------------------------------------------------------------------
// Directional ranges
// ---------------------------------------------------------------------------












function directionPositions(
  grid: TableFormulaGrid,
  row: number,
  col: number,
  dir: Direction,
): Array<{ row: number; col: number }> {
  const out: Array<{ row: number; col: number }> = [];
  const step = (r: number, c: number): boolean => {
    const cell = cellAt(grid, r, c);
    if (!cell) return false;
    if (cell.covered) return true;
    if (!isTableFormula(cell.formula) && numberFromText(cell.text) === null) return false;
    out.push({ row: r, col: c });
    return true;
  };
  if (dir === "ABOVE") {
    for (let r = row - 1; r >= 0 && step(r, col); r -= 1) { /* walk */ }
  } else if (dir === "BELOW") {
    for (let r = row + 1; r < grid.length && step(r, col); r += 1) { /* walk */ }
  } else if (dir === "LEFT") {
    for (let c = col - 1; c >= 0 && step(row, c); c -= 1) { /* walk */ }
  } else {
    const r = grid[row];
    const width = r ? r.length : 0;
    for (let c = col + 1; c < width && step(row, c); c += 1) { /* walk */ }
  }
  return out;
}

/**
 * Collect, for an aggregate argument list, the resolved numeric values plus a
 * `ref` flag (true if any referenced cell hit a cycle). Positions are
 * deduplicated so =AVERAGE(ABOVE|LEFT) never double-counts an overlap.
 * `included` carries every resolved cell's number-or-null so AVERAGE/COUNT can
 * skip non-numbers while SUM/PRODUCT coerce them to 0.
 */
function collectAggregateValues(
  state: EvalState,
  args: string[],
  row: number,
  col: number,
): { values: Array<number | null>; ref: boolean } {
  // Deduplication is per ARGUMENT: =AVERAGE(ABOVE|LEFT) counts the corner
  // once, but =SUM(B2,B2) names B2 twice on purpose and Word adds it twice.
  
  let seen = new Set<string>();
  const positions: Array<{ row: number; col: number }> = [];
  const literals: number[] = [];
  let ref = false;

  const pushPos = (p: { row: number; col: number }) => {
    const key = `${p.row}:${p.col}`;
    if (seen.has(key)) return;
    seen.add(key);
    positions.push(p);
  };
  const pushRectangle = (
    start: { row: number; col: number },
    end: { row: number; col: number },
  ): boolean => {
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    for (let targetRow = rowStart; targetRow <= rowEnd; targetRow += 1) {
      for (let targetCol = colStart; targetCol <= colEnd; targetCol += 1) {
        if (!cellAt(state.grid, targetRow, targetCol)) return false;
        // A range that covers the formula's own cell reads that cell as
        // empty, as Word does: =SUM(A1:B2) in B2 totals the other three
        
        // single cell's self reference). A named single cell (=SUM(B2) in
        // B2) is still a cycle.
        if (targetRow === row && targetCol === col) continue;
        pushPos({ row: targetRow, col: targetCol });
      }
    }
    return true;
  };

  for (const rawArg of args) {
    seen = new Set<string>();
    // An argument may itself be a `A|B` union of directions.
    const parts = rawArg.split("|").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const upper = part.toUpperCase();
      if (DIRECTIONS.has(upper)) {
        for (const p of directionPositions(state.grid, row, col, upper as Direction)) {
          pushPos(p);
        }
        continue;
      }
      const rangeParts = part.split(":");
      if (rangeParts.length === 2) {
        const startRnCn = parseRnCnCellRef(rangeParts[0]);
        const endRnCn = parseRnCnCellRef(rangeParts[1]);
        const startA1 = parseCellRef(rangeParts[0]);
        const endA1 = parseCellRef(rangeParts[1]);
        if (Boolean(startRnCn) !== Boolean(endRnCn)) {
          return { values: [], ref: true };
        }
        const start = startRnCn ?? startA1;
        const end = endRnCn ?? endA1;
        if (!start || !end || !pushRectangle(start, end)) {
          return { values: [], ref: true };
        }
        continue;
      }
      const rowReference = /^R([1-9][0-9]{0,6})?$/i.exec(part);
      if (rowReference) {
        const targetRow = rowReference[1] ? Number(rowReference[1]) - 1 : row;
        const target = state.grid[targetRow];
        if (!target) return { values: [], ref: true };
        target.forEach((_, targetCol) => {
          if (targetRow !== row || targetCol !== col) {
            pushPos({ row: targetRow, col: targetCol });
          }
        });
        continue;
      }
      const columnReference = /^C([1-9][0-9]{0,6})?$/i.exec(part);
      if (columnReference) {
        const targetCol = columnReference[1]
          ? Number(columnReference[1]) - 1
          : col;
        let found = false;
        state.grid.forEach((target, targetRow) => {
          if (!target[targetCol]) return;
          found = true;
          if (targetRow !== row || targetCol !== col) {
            pushPos({ row: targetRow, col: targetCol });
          }
        });
        if (!found) return { values: [], ref: true };
        continue;
      }
      const ref1 = parseAnyCellRef(part);
      if (ref1) {
        pushPos(ref1);
        continue;
      }
      const bookmark = resolveBookmarkNumber(state, part);
      if (!isRefError(bookmark)) {
        literals.push(bookmark);
        continue;
      }
      const lit = numberFromText(part);
      if (lit !== null) {
        literals.push(lit);
        continue;
      }
      // Word's = field takes "numbers, formulas, or bookmark names" as
      // arguments: =SUM(2*3,4) and =SUM(ABS(-2),3) evaluate the expression
      
      // those comes back #REF! from the expression path and fails the call.
      const scalar = evaluateFunctionArgument(state, part, row, col);
      if (isRefError(scalar)) return { values: [], ref: true };
      literals.push(scalar);
    }
  }

  const values: Array<number | null> = [];
  for (const p of positions) {
    const resolved = resolveCellNumber(state, p.row, p.col);
    if (resolved.ref) ref = true;
    values.push(resolved.value);
  }
  for (const lit of literals) values.push(lit);
  return { values, ref };
}

function applyAggregate(name: string, values: Array<number | null>): Scalar {
  const numeric = values.filter((v): v is number => v !== null);
  switch (name) {
    case "SUM":
      // Non-numeric → 0, so just sum the numeric ones (blanks add nothing).
      return numeric.reduce((s, x) => s + x, 0);
    case "PRODUCT": {
      // Word PRODUCT over an all-blank/all-text range is 0; otherwise multiply
      // the numeric members (text/blank members are ignored, not treated as 0,
      // which would zero every product). Empty numeric set → 0.
      if (numeric.length === 0) return 0;
      return numeric.reduce((s, x) => s * x, 1);
    }
    case "COUNT":
      return numeric.length;
    case "AVERAGE":
      // Word renders AVERAGE of an empty numeric set as 0 (no #DIV/0!).
      return numeric.length === 0 ? 0 : numeric.reduce((s, x) => s + x, 0) / numeric.length;
    case "MIN":
      return numeric.length === 0 ? 0 : Math.min(...numeric);
    case "MAX":
      return numeric.length === 0 ? 0 : Math.max(...numeric);
    default:
      return REF_ERROR;
  }
}

// ---------------------------------------------------------------------------
// Arithmetic parser (recursive descent over + - * / parens, refs, literals)
// ---------------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number }
  | { t: "ref"; row: number; col: number }
  | { t: "bookmark"; name: string }
  | { t: "fn"; name: string; args: string[] }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "cmp"; v: "=" | "<>" | "<" | "<=" | ">" | ">=" }
  | { t: "lparen" }
  | { t: "rparen" };

/** Tokenize an arithmetic body (already stripped of a leading `=`). null on a bad char. */
function tokenizeArithmetic(src: string): Tok[] | null {
  const tokens: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ t: "op", v: ch });
      i += 1;
      continue;
    }
    if (ch === "=" || ch === "<" || ch === ">") {
      const pair = src.slice(i, i + 2);
      const comparison =
        pair === "<>" || pair === "<=" || pair === ">=" ? pair : ch;
      tokens.push({
        t: "cmp",
        v: comparison as "=" | "<>" | "<" | "<=" | ">" | ">=",
      });
      i += comparison.length;
      continue;
    }
    if (ch === "(") {
      tokens.push({ t: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ t: "rparen" });
      i += 1;
      continue;
    }
    // A Word-legal identifier begins either an aggregate call NAME(...), an A1
    // reference, or a bookmark operand. Unicode bookmark names are preserved.
    // The first CHARACTER, not code unit: a name may begin with a letter
    // outside the Basic Multilingual Plane (𠮷, a surrogate pair), which
    
    const lead = String.fromCodePoint(src.codePointAt(i) ?? 0);
    if (/^[\p{L}_]$/u.test(lead)) {
      const identifierMatch = /^[\p{L}_][\p{L}\p{N}_]{0,39}/u.exec(
        src.slice(i),
      );
      if (!identifierMatch) return null;
      const identifier = identifierMatch[0];
      const j = i + identifier.length;
      // Skip spaces between the name and a `(` so "SUM (ABOVE)" still parses.
      let p = j;
      while (p < n && (src[p] === " " || src[p] === "\t")) p += 1;
      if (src[p] === "(") {
        // Aggregate function used as a term, e.g. =SUM(ABOVE)*2. Capture the
        // balanced-paren argument list and emit a single aggregate token.
        let depth = 0;
        let q = p;
        for (; q < n; q += 1) {
          if (src[q] === "(") depth += 1;
          else if (src[q] === ")") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        if (q >= n || depth !== 0) return null; // unbalanced parens
        const name = identifier.toUpperCase();
        if (!SUPPORTED_FUNCTION_NAMES.has(name)) return null;
        tokens.push({ t: "fn", name, args: splitArgs(src.slice(p + 1, q)) });
        i = q + 1;
        continue;
      }
      // Word's TRUE and FALSE are the constants 1 and 0 as an operand too,
      // not only as the whole formula (=TRUE): =(TRUE) and IF((TRUE),7,9)
      
      // bookmark of any other name keep their own paths.
      const constant = identifier.toUpperCase();
      if (constant === "TRUE" || constant === "FALSE") {
        tokens.push({ t: "num", v: constant === "TRUE" ? 1 : 0 });
        i = j;
        continue;
      }
      const ref = parseAnyCellRef(identifier);
      if (ref) tokens.push({ t: "ref", row: ref.row, col: ref.col });
      else tokens.push({ t: "bookmark", name: identifier });
      i = j;
      continue;
    }
    // Numeric literal, with the E-notation numberFromText already reads
    
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j += 1;
      const exponent = /^[eE][-+]?\d+/.exec(src.slice(j));
      if (exponent) j += exponent[0].length;
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) return null;
      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }
    return null; // unexpected character
  }
  return tokens;
}

class ArithmeticParser {
  private pos = 0;
  constructor(
    private readonly tokens: Tok[],
    private readonly state: EvalState,
    private readonly row: number,
    private readonly col: number,
  ) {}

  /** Parse the whole token stream; REF_ERROR on a syntax error or cycle. */
  parse(): Scalar {
    const value = this.parseComparison();
    if (isRefError(value)) return value;
    if (this.pos !== this.tokens.length) return REF_ERROR; // trailing junk
    return value;
  }

  private peek(): Tok | undefined {
    return this.tokens[this.pos];
  }

  private parseComparison(): Scalar {
    const left = this.parseExpr();
    if (isRefError(left)) return left;
    const operator = this.peek();
    if (!operator || operator.t !== "cmp") return left;
    this.pos += 1;
    const right = this.parseExpr();
    if (isRefError(right)) return right;
    if (this.peek()?.t === "cmp") return REF_ERROR;
    switch (operator.v) {
      case "=":
        return left === right ? 1 : 0;
      case "<>":
        return left !== right ? 1 : 0;
      case "<":
        return left < right ? 1 : 0;
      case "<=":
        return left <= right ? 1 : 0;
      case ">":
        return left > right ? 1 : 0;
      case ">=":
        return left >= right ? 1 : 0;
    }
  }

  private parseExpr(): Scalar {
    let left = this.parseTerm();
    if (isRefError(left)) return left;
    for (;;) {
      const tok = this.peek();
      if (tok && tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
        this.pos += 1;
        const right = this.parseTerm();
        if (isRefError(right)) return right;
        left = tok.v === "+" ? left + right : left - right;
      } else {
        return left;
      }
    }
  }

  private parseTerm(): Scalar {
    let left = this.parseFactor();
    if (isRefError(left)) return left;
    for (;;) {
      const tok = this.peek();
      if (tok && tok.t === "op" && (tok.v === "*" || tok.v === "/")) {
        this.pos += 1;
        const right = this.parseFactor();
        if (isRefError(right)) return right;
        if (tok.v === "/") {
          if (right === 0) return REF_ERROR; // div-by-zero → #REF!
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        return left;
      }
    }
  }

  private parseFactor(): Scalar {
    const tok = this.peek();
    if (!tok) return REF_ERROR;
    if (tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
      this.pos += 1;
      const operand = this.parseFactor();
      if (isRefError(operand)) return operand;
      return tok.v === "-" ? -operand : operand;
    }
    if (tok.t === "num") {
      this.pos += 1;
      return tok.v;
    }
    if (tok.t === "ref") {
      this.pos += 1;
      const resolved = resolveCellNumber(this.state, tok.row, tok.col);
      if (resolved.ref) return REF_ERROR;
      // A non-numeric / out-of-range referenced cell contributes 0 in arithmetic.
      return resolved.value ?? 0;
    }
    if (tok.t === "bookmark") {
      this.pos += 1;
      return resolveBookmarkNumber(this.state, tok.name);
    }
    if (tok.t === "fn") {
      this.pos += 1;
      return applyFunction(this.state, tok.name, tok.args, this.row, this.col);
    }
    if (tok.t === "lparen") {
      this.pos += 1;
      // The whole grammar inside parentheses, comparisons included: =(1<2)
      // is =1<2, and IF((A1>2),1,0) reads its bracketed condition.
      const inner = this.parseComparison();
      if (isRefError(inner)) return inner;
      const close = this.peek();
      if (!close || close.t !== "rparen") return REF_ERROR;
      this.pos += 1;
      return inner;
    }
    return REF_ERROR;
  }
}

/**
 * Split an aggregate's argument string on top-level commas (parens are not
 * expected inside an aggregate arg here, but we still respect them defensively).
 */
function splitArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  args.push(current);
  // Every slot stays where it was written: an empty one is an argument too,
  // so IF(1,7,200,) has four and is an error, never a valid three (OFL-003).
  const trimmed = args.map((a) => a.trim());
  return trimmed.length === 1 && trimmed[0] === "" ? [] : trimmed;
}

const AGGREGATE_RE = /^([A-Za-z]+)\s*\((.*)\)$/;

function evaluateFunctionArgument(
  state: EvalState,
  argument: string,
  row: number,
  col: number,
): Scalar {
  return evalFormulaExpr(state, `=${argument}`, row, col);
}

/**
 * ROUND as Word and Excel round: on the number's decimal digits, half away
 * from zero. Scaling by 10^digits in binary put 1.005 * 100 just under 100.5,
 * so =ROUND(1.005,2) gave 1.00 while =ROUND(1.006,2) gave 1.01. The shift is
 * done on the decimal representation instead (the exponent of the shortest
 * round-trip string), so 1.005 shifts to exactly 100.5.
 */
function shiftDecimalExponent(value: number, by: number): number {
  const [mantissa, exponent = "0"] = value.toExponential().split("e");
  return Number(`${mantissa}e${Number(exponent) + by}`);
}

export function roundDecimalHalfAwayFromZero(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  // A number with no more decimals than asked for is already rounded: it is
  // returned as it is rather than shifted, because shifting 1e307 by two
  // digits overflows to Infinity and came back as NaN (OFL-040).
  if (decimalPlaces(value) <= digits) return value;
  const shifted = shiftDecimalExponent(Math.abs(value), digits);
  if (!Number.isFinite(shifted)) return value;
  const rounded = Math.round(shifted);
  // Math.round already rounds a .5 up; abs() made every case the away-from-
  // zero direction, restored by the sign below.
  const result = shiftDecimalExponent(rounded, -digits);
  return value < 0 ? -result : result;
}

/** Digits after the decimal point of a number's shortest decimal spelling. */
function decimalPlaces(value: number): number {
  const [mantissa, exponent = "0"] = value.toExponential().split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent));
}

/**
 * MOD in the decimal arithmetic the formula is written in. 0.3 / 0.1 is
 * 2.9999999999999996 in binary floating point, so flooring the quotient
 * left a whole divisor as the remainder (MOD(0.3,0.1) was 0.1, OFL-002).
 * Both operands are scaled to integers by their decimal places first. The
 * remainder takes the dividend's sign, as Word's does: MOD(-5,3) is -2 and
 * MOD(5,-3) is 2 (Word 16.86, measured; live Word audit WUA 176). Excel's
 * MOD follows the divisor; Word's is not Excel's.
 */
function decimalMod(dividend: number, divisor: number): number {
  const places = Math.max(decimalPlaces(dividend), decimalPlaces(divisor));
  if (places <= 15) {
    const scale = 10 ** places;
    const a = Math.round(dividend * scale);
    const b = Math.round(divisor * scale);
    if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && b !== 0) {
      return (a - b * Math.trunc(a / b)) / scale;
    }
  }
  return dividend - divisor * Math.trunc(dividend / divisor);
}

function applyFunction(
  state: EvalState,
  name: string,
  args: string[],
  row: number,
  col: number,
): Scalar {
  if (AGGREGATE_NAMES.has(name)) {
    const collected = collectAggregateValues(
      state,
      args.filter((argument) => argument.length > 0),
      row,
      col,
    );
    return collected.ref ? REF_ERROR : applyAggregate(name, collected.values);
  }
  if (!SCALAR_FUNCTION_NAMES.has(name)) return REF_ERROR;
  // A function of fixed arguments has no empty one.
  if (args.some((argument) => argument.length === 0)) return REF_ERROR;
  if (name === "TRUE" || name === "FALSE") {
    return args.length === 0 ? (name === "TRUE" ? 1 : 0) : REF_ERROR;
  }
  if (name === "DEFINED") {
    if (args.length !== 1) return REF_ERROR;
    const reference = parseAnyCellRef(args[0]);
    if (reference && !cellAt(state.grid, reference.row, reference.col))
      return 0;
    return isRefError(evaluateFunctionArgument(state, args[0], row, col))
      ? 0
      : 1;
  }
  if (name === "IF") {
    if (args.length !== 3) return REF_ERROR;
    const condition = evaluateFunctionArgument(state, args[0], row, col);
    if (isRefError(condition)) return REF_ERROR;
    return evaluateFunctionArgument(
      state,
      condition !== 0 ? args[1] : args[2],
      row,
      col,
    );
  }
  if (name === "NOT") {
    if (args.length !== 1) return REF_ERROR;
    const value = evaluateFunctionArgument(state, args[0], row, col);
    return isRefError(value) ? REF_ERROR : value === 0 ? 1 : 0;
  }
  if (name === "AND" || name === "OR") {
    if (args.length === 0 || (name === "OR" && args.length !== 2)) {
      return REF_ERROR;
    }
    const logical = args.map((argument) =>
      evaluateFunctionArgument(state, argument, row, col),
    );
    if (logical.some(isRefError)) return REF_ERROR;
    return name === "AND"
      ? logical.every((value) => value !== 0)
        ? 1
        : 0
      : logical.some((value) => value !== 0)
        ? 1
        : 0;
  }
  const values = args.map((argument) =>
    evaluateFunctionArgument(state, argument, row, col),
  );
  if (values.some(isRefError)) return REF_ERROR;
  const numbers = values as number[];
  if (name === "ABS")
    return numbers.length === 1 ? Math.abs(numbers[0]) : REF_ERROR;
  // Word drops the fraction, towards zero: INT(-5.67) is -5 (Word 16.86,
  // a table formula field updated in compatibility modes 14 and 15; live
  // Word audit WUA 175). Excel's INT rounds down; Word's is not Excel's.
  if (name === "INT")
    return numbers.length === 1 ? Math.trunc(numbers[0]) : REF_ERROR;
  if (name === "SIGN") {
    return numbers.length === 1 ? Math.sign(numbers[0]) : REF_ERROR;
  }
  if (name === "MOD") {
    return numbers.length === 2 && numbers[1] !== 0
      ? decimalMod(numbers[0], numbers[1])
      : REF_ERROR;
  }
  if (name === "ROUND") {
    if (
      numbers.length !== 2 ||
      !Number.isInteger(numbers[1]) ||
      Math.abs(numbers[1]) > 15
    ) {
      return REF_ERROR;
    }
    return roundDecimalHalfAwayFromZero(numbers[0], numbers[1]);
  }
  return REF_ERROR;
}

/**
 * True when `body` is exactly one enclosing call `NAME(...)` — its first `(`
 * matches the final `)`. Guards the single-aggregate fast path so a mixed
 * expression like `SUM(ABOVE)*COUNT(LEFT)` (which also ends with `)`) is NOT
 * swallowed whole by the greedy regex and instead routes to the arithmetic
 * parser, which handles aggregates as terms.
 */
function isSingleEnclosingCall(body: string): boolean {
  const open = body.indexOf("(");
  if (open < 0 || body[body.length - 1] !== ")") return false;
  let depth = 0;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === "(") depth += 1;
    else if (body[i] === ")") {
      depth -= 1;
      if (depth === 0) return i === body.length - 1;
    }
  }
  return false;
}

/**
 * Evaluate a formula STRING (with or without a leading `=`) at the given cell
 * position. Returns a finite number or the REF_ERROR sentinel.
 */
function evalFormulaExpr(
  state: EvalState,
  formula: string,
  row: number,
  col: number,
): Scalar {
  let body = formula.trim();
  if (body.startsWith("=")) body = body.slice(1).trim();
  if (body === "") return REF_ERROR;
  if (body.toUpperCase() === "TRUE") return 1;
  if (body.toUpperCase() === "FALSE") return 0;

  // A single aggregate call, e.g. SUM(ABOVE) or AVERAGE(ABOVE|LEFT) or
  // PRODUCT(A1,A2). Detected when the body is exactly NAME( ... ) with the
  // opening paren matching the final one (so a mixed expression that merely
  // ends with ")" falls through to the arithmetic parser below).
  const aggMatch = AGGREGATE_RE.exec(body);
  if (aggMatch && isSingleEnclosingCall(body)) {
    const name = aggMatch[1].toUpperCase();
    return SUPPORTED_FUNCTION_NAMES.has(name)
      ? applyFunction(state, name, splitArgs(aggMatch[2]), row, col)
      : REF_ERROR;
  }

  // Otherwise: plain arithmetic over refs / literals / aggregate terms
  // (=SUM(ABOVE)*2, =B2/SUM(ABOVE), =SUM(ABOVE)/COUNT(LEFT)).
  const tokens = tokenizeArithmetic(body);
  if (!tokens || tokens.length === 0) return REF_ERROR;
  return new ArithmeticParser(tokens, state, row, col).parse();
}

// ---------------------------------------------------------------------------
// Dependency pre-pass
// ---------------------------------------------------------------------------

type GridPosition = readonly [number, number];

/**
 * Every cell an aggregate argument list MAY read, yielded lazily (a directional
 * argument over a long column never materializes as one array per formula).
 * Mirrors collectAggregateValues' reference forms; it may over-approximate.
 */
function* aggregateDependencyPositions(
  state: EvalState,
  args: string[],
  row: number,
  col: number,
): Generator<GridPosition> {
  for (const rawArg of args) {
    for (const part of rawArg.split("|").map((s) => s.trim()).filter(Boolean)) {
      const upper = part.toUpperCase();
      if (DIRECTIONS.has(upper)) {
        if (upper === "ABOVE") {
          for (let r = row - 1; r >= 0; r -= 1) yield [r, col];
        } else if (upper === "BELOW") {
          for (let r = row + 1; r < state.grid.length; r += 1) yield [r, col];
        } else if (upper === "LEFT") {
          for (let c = col - 1; c >= 0; c -= 1) yield [row, c];
        } else {
          const width = state.grid[row]?.length ?? 0;
          for (let c = col + 1; c < width; c += 1) yield [row, c];
        }
        continue;
      }
      const rangeParts = part.split(":");
      if (rangeParts.length === 2) {
        const start = parseAnyCellRef(rangeParts[0]);
        const end = parseAnyCellRef(rangeParts[1]);
        if (!start || !end) continue;
        const rowEnd = Math.min(Math.max(start.row, end.row), state.grid.length - 1);
        for (let r = Math.min(start.row, end.row); r <= rowEnd; r += 1) {
          const colEnd = Math.min(
            Math.max(start.col, end.col),
            (state.grid[r]?.length ?? 0) - 1,
          );
          for (let c = Math.min(start.col, end.col); c <= colEnd; c += 1) {
            yield [r, c];
          }
        }
        continue;
      }
      const rowReference = /^R([1-9][0-9]{0,6})?$/i.exec(part);
      if (rowReference) {
        const targetRow = rowReference[1] ? Number(rowReference[1]) - 1 : row;
        const width = state.grid[targetRow]?.length ?? 0;
        for (let c = 0; c < width; c += 1) yield [targetRow, c];
        continue;
      }
      const columnReference = /^C([1-9][0-9]{0,6})?$/i.exec(part);
      if (columnReference) {
        const targetCol = columnReference[1] ? Number(columnReference[1]) - 1 : col;
        for (let r = 0; r < state.grid.length; r += 1) yield [r, targetCol];
        continue;
      }
      const reference = parseAnyCellRef(part);
      if (reference) yield [reference.row, reference.col];
    }
  }
}

/** Every cell a formula MAY read (a static over-approximation of IF branches). */
function* formulaDependencyPositions(
  state: EvalState,
  formula: string,
  row: number,
  col: number,
): Generator<GridPosition> {
  let body = formula.trim();
  if (body.startsWith("=")) body = body.slice(1).trim();
  if (body === "") return;
  const tokens = tokenizeArithmetic(body);
  if (!tokens) return;
  for (const token of tokens) {
    if (token.t === "ref") {
      yield [token.row, token.col];
    } else if (token.t === "fn") {
      if (AGGREGATE_NAMES.has(token.name)) {
        yield* aggregateDependencyPositions(state, token.args, row, col);
      } else {
        for (const argument of token.args) {
          yield* formulaDependencyPositions(state, argument, row, col);
        }
      }
    }
  }
}

/**
 * Evaluate, bottom-up and without recursion, every formula cell the root may
 * depend on, so the root's own evaluation only reads cached values. The walk is
 * an explicit-stack depth-first post-order over the static dependencies: a
 * 5,000-row chain (=A1+1, =A2+1, ...) no longer recurses 5,000 levels deep, and
 * a value shared by many formulas is computed once instead of once per path.
 */
function prewarmFormulaDependencies(
  state: EvalState,
  rootKey: string,
  rootDependencies: Iterator<GridPosition>,
): void {
  const stack: Array<{
    row: number;
    col: number;
    key: string;
    dependencies: Iterator<GridPosition>;
  }> = [{ row: -1, col: -1, key: rootKey, dependencies: rootDependencies }];
  const onStack = new Set<string>([rootKey]);
  while (stack.length > 0) {
    if (state.exhausted) return;
    const frame = stack[stack.length - 1];
    const next = frame.dependencies.next();
    if (!next.done) {
      if (!spendWork(state)) return;
      const [row, col] = next.value;
      const key = `${row}:${col}`;
      if (onStack.has(key) || state.cache.has(key) || state.settled.has(key)) {
        continue;
      }
      const cell = cellAt(state.grid, row, col);
      if (!cell || !isTableFormula(cell.formula)) continue;
      stack.push({
        row,
        col,
        key,
        dependencies: formulaDependencyPositions(state, cell.formula, row, col),
      });
      onStack.add(key);
      continue;
    }
    stack.pop();
    onStack.delete(frame.key);
    if (stack.length === 0) return; // the root itself is evaluated by the caller
    state.settled.add(frame.key);
    resolveCellNumber(state, frame.row, frame.col);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EvaluateOptions {
  /** Max decimal places in the rendered number (default 10, trailing zeros trimmed). */
  maxFractionDigits?: number;
  /** Optional supported Word numeric picture; absent/null keeps General. */
  numberFormat?: CellFormulaNumberFormat | null;
  /** Word bookmark-name operands by bookmark name. A formula's name finds
   * its bookmark by exact name first, then case-insensitively (NFKC) when
   * exactly one bookmark folds to it; a name two bookmarks fold to is #REF!
   * rather than either of them. */
  bookmarkValues?: ReadonlyMap<string, string>;
}

const AMBIGUOUS_BOOKMARK = Symbol("ambiguous-bookmark");

function normalizedBookmarkValues(
  values: ReadonlyMap<string, string> | undefined,
): BookmarkValueLookup {
  if (!values || values.size === 0) return () => undefined;
  const folded = new Map<string, string | typeof AMBIGUOUS_BOOKMARK>();
  for (const [name, value] of values) {
    const key = bookmarkKey(name);
    folded.set(key, folded.has(key) ? AMBIGUOUS_BOOKMARK : value);
  }
  return (name) => {
    const exact = values.get(name);
    if (exact !== undefined) return exact;
    const byKey = folded.get(bookmarkKey(name));
    return typeof byKey === "string" ? byKey : undefined;
  };
}

/** Format a finite number the way a Word field would: trim trailing zeros. */
function formatNumber(value: number, maxFractionDigits: number): string {
  if (Number.isInteger(value)) return String(value);
  // Round to the requested precision, then strip trailing zeros / dot.
  const fixed = value.toFixed(Math.max(0, Math.min(15, maxFractionDigits)));
  return fixed.replace(/\.?0+$/, "");
}

/** Apply one supported Word numeric picture without locale-dependent output. */
/**
 * A finite number in plain decimal notation with exactly `decimals` digits
 * after the point, read off its shortest round-trip spelling (never exponent
 * form, whatever its magnitude). The value is expected to be rounded to
 * `decimals` places already; a zero carries no sign.
 */
function plainDecimalString(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return String(value);
  const [mantissa, exponentText = "0"] = Math.abs(value).toExponential().split("e");
  const digits = mantissa.replace(".", "");
  const pointAt = Number(exponentText) + 1;
  let integerPart: string;
  let fractionPart: string;
  if (pointAt <= 0) {
    integerPart = "0";
    fractionPart = "0".repeat(-pointAt) + digits;
  } else if (pointAt >= digits.length) {
    integerPart = digits + "0".repeat(pointAt - digits.length);
    fractionPart = "";
  } else {
    integerPart = digits.slice(0, pointAt);
    fractionPart = digits.slice(pointAt);
  }
  fractionPart = (fractionPart + "0".repeat(decimals)).slice(0, decimals);
  const isZero = /^0*$/.test(integerPart) && /^0*$/.test(fractionPart);
  const sign = value < 0 && !isZero ? "-" : "";
  return `${sign}${integerPart}${decimals > 0 ? `.${fractionPart}` : ""}`;
}

function formatNumberPicture(
  value: number,
  numberFormat: CellFormulaNumberFormat,
): string {
  // In a Word field numeric picture "%" is an output character, not Excel's
  
  const percent = numberFormat.endsWith("%");
  const grouped = numberFormat.startsWith("#,##");
  const decimals = numberFormat.includes(".00") ? 2 : 0;
  // Rounded on the number's decimal digits, half away from zero, as ROUND
  // rounds (=1.005 with "0.00" is 1.01, not toFixed's binary 1.00), and
  // spelled out in full: toFixed writes 1e21 and above in exponent form, so a
  
  const fixed = plainDecimalString(roundDecimalHalfAwayFromZero(value, decimals), decimals);
  const [integerPart, fractionPart] = fixed.split(".");
  const sign = integerPart.startsWith("-") ? "-" : "";
  const unsignedInteger = sign ? integerPart.slice(1) : integerPart;
  const renderedInteger = grouped
    ? unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : unsignedInteger;
  return `${sign}${renderedInteger}${fractionPart ? `.${fractionPart}` : ""}${
    percent ? "%" : ""
  }`;
}

function renderScalar(
  result: Scalar,
  numberFormat: CellFormulaNumberFormat | null,
  maxFractionDigits: number | undefined,
): string {
  if (isRefError(result)) return TABLE_FORMULA_REF_ERROR;
  if (numberFormat) return formatNumberPicture(result, numberFormat);
  return formatNumber(result, maxFractionDigits ?? 10);
}

/** Evaluates many formula cells of ONE grid with a shared dependency cache. */
export interface TableFormulaEvaluator {
  /** Display string of the cell at (row, col); see evaluateTableCellFormula. */
  evaluate(row: number, col: number, options?: EvaluateOptions): string;
}

/**
 * Create an evaluator for every formula of one logical table. All cells share
 * one cache and one work budget, so a recompute pass costs one evaluation per
 * formula cell no matter how many formulas read it.
 */
export function createTableFormulaEvaluator(
  grid: TableFormulaGrid,
  options: Pick<EvaluateOptions, "bookmarkValues"> = {},
): TableFormulaEvaluator {
  const state = createEvalState(
    grid,
    normalizedBookmarkValues(options.bookmarkValues),
  );
  return {
    evaluate(row, col, evaluateOptions = {}) {
      const cell = cellAt(grid, row, col);
      const formula = cell?.formula;
      if (!isTableFormula(formula)) {
        // Not actually a formula cell → show its literal text unchanged.
        return cell?.text ?? "";
      }
      const key = `${row}:${col}`;
      if (!state.cache.has(key)) {
        prewarmFormulaDependencies(
          state,
          key,
          formulaDependencyPositions(state, formula, row, col),
        );
      }
      // Evaluating the root through resolveCellNumber seeds the cycle guard
      // with its own position, exactly like a reference to it would.
      const resolved = resolveCellNumber(state, row, col);
      return renderScalar(
        resolved.ref ? REF_ERROR : (resolved.value ?? 0),
        evaluateOptions.numberFormat ?? cell?.numberFormat ?? null,
        evaluateOptions.maxFractionDigits,
      );
    },
  };
}

/**
 * Evaluate the formula at grid position (row, col) and return its DISPLAY
 * string. The cell at (row, col) is expected to carry the formula (its own
 * `formula` field); a formula referencing itself resolves to `#REF!` instead of
 * looping. Returns `#REF!` for any cycle / malformed / out-of-range formula.
 */
export function evaluateTableCellFormula(
  grid: TableFormulaGrid,
  row: number,
  col: number,
  options: EvaluateOptions = {},
): string {
  return createTableFormulaEvaluator(grid, options).evaluate(row, col, options);
}

/**
 * Convenience: evaluate a standalone formula string against a grid at a given
 * position WITHOUT requiring the grid cell to already carry it. Useful for
 * previewing a formula the user is typing before it is committed to the cell.
 */
export function evaluateTableFormulaString(
  formula: string,
  grid: TableFormulaGrid,
  row: number,
  col: number,
  options: EvaluateOptions = {},
): string {
  if (!isTableFormula(formula)) return formula;
  const state = createEvalState(
    grid,
    normalizedBookmarkValues(options.bookmarkValues),
  );
  const key = `${row}:${col}`;
  // The typed formula is not the grid cell's own formula yet: a dependency that
  // reads this position back is a cycle, as it will be once committed.
  state.visiting.add(key);
  prewarmFormulaDependencies(
    state,
    key,
    formulaDependencyPositions(state, formula, row, col),
  );
  const result = state.exhausted
    ? REF_ERROR
    : evalFormulaExpr(state, formula, row, col);
  return renderScalar(
    result,
    options.numberFormat ?? null,
    options.maxFractionDigits,
  );
}
