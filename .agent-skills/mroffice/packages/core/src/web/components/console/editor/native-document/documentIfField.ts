/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
const MAX_IF_EXPRESSION_LENGTH = 256;
const MAX_IF_TOKEN_LENGTH = 128;
const MAX_IF_TOKENS = 5;

type IfLiteralToken =
  | { kind: "operator"; value: "=" | "<>" | ">" | "<" | ">=" | "<=" }
  | { kind: "value"; value: string; quoted: boolean };

interface DecimalLiteral {
  sign: -1 | 0 | 1;
  digits: bigint;
  scale: number;
}

function isWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function readOperator(
  expression: string,
  offset: number,
): Extract<IfLiteralToken, { kind: "operator" }> | null {
  const pair = expression.slice(offset, offset + 2);
  if (pair === "<>" || pair === ">=" || pair === "<=") {
    return { kind: "operator", value: pair };
  }
  const value = expression[offset];
  return value === "=" || value === ">" || value === "<"
    ? { kind: "operator", value }
    : null;
}

function tokenizeIfLiteralExpression(
  expression: string,
): IfLiteralToken[] | null {
  if (
    expression.length === 0 ||
    expression.length > MAX_IF_EXPRESSION_LENGTH ||
    /[\x00-\x1f\x7f]/.test(expression.replace(/[\t\r\n]/g, ""))
  ) {
    return null;
  }

  const tokens: IfLiteralToken[] = [];
  let offset = 0;
  while (offset < expression.length) {
    while (offset < expression.length && isWhitespace(expression[offset])) {
      offset += 1;
    }
    if (offset >= expression.length) break;
    if (tokens.length >= MAX_IF_TOKENS) return null;

    if (expression[offset] === '"') {
      const end = expression.indexOf('"', offset + 1);
      if (end < 0 || end - offset - 1 > MAX_IF_TOKEN_LENGTH) return null;
      tokens.push({
        kind: "value",
        value: expression.slice(offset + 1, end),
        quoted: true,
      });
      offset = end + 1;
      continue;
    }

    const operator = readOperator(expression, offset);
    if (operator) {
      tokens.push(operator);
      offset += operator.value.length;
      continue;
    }

    const start = offset;
    while (
      offset < expression.length &&
      !isWhitespace(expression[offset]) &&
      expression[offset] !== '"' &&
      !readOperator(expression, offset)
    ) {
      offset += 1;
    }
    if (offset === start || offset - start > MAX_IF_TOKEN_LENGTH) return null;
    tokens.push({
      kind: "value",
      value: expression.slice(start, offset),
      quoted: false,
    });
  }
  return tokens;
}

function parseDecimalLiteral(value: string): DecimalLiteral | null {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(value);
  if (!match) return null;
  const integer = match[2] ?? "0";
  const fraction = (match[3] ?? match[4] ?? "").replace(/0+$/, "");
  const rawDigits = `${integer}${fraction}`.replace(/^0+/, "") || "0";
  const digits = BigInt(rawDigits);
  return {
    sign: digits === 0n ? 0 : match[1] === "-" ? -1 : 1,
    digits,
    scale: fraction.length,
  };
}

function compareDecimals(left: DecimalLiteral, right: DecimalLiteral): number {
  if (left.sign !== right.sign) return left.sign < right.sign ? -1 : 1;
  if (left.sign === 0) return 0;
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.digits * 10n ** BigInt(scale - left.scale);
  const rightValue = right.digits * 10n ** BigInt(scale - right.scale);
  const comparison =
    leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
  return left.sign < 0 ? -comparison : comparison;
}

function compareIfLiterals(
  left: Extract<IfLiteralToken, { kind: "value" }>,
  right: Extract<IfLiteralToken, { kind: "value" }>,
): number | null {
  const leftNumber = left.quoted ? null : parseDecimalLiteral(left.value);
  const rightNumber = right.quoted ? null : parseDecimalLiteral(right.value);
  if (leftNumber && rightNumber)
    return compareDecimals(leftNumber, rightNumber);
  if (!left.quoted || !right.quoted) return null;
  return left.value === right.value ? 0 : left.value < right.value ? -1 : 1;
}

/**
 * Evaluate the deliberately small, inert IF subset supported by the web editor.
 * Unsupported Word expressions remain native fields and display their cached
 * result; this function never executes nested fields, formulas, links, or code.
 */
export function evaluateDocumentIfLiteralExpression(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const tokens = tokenizeIfLiteralExpression(value.trim());
  if (!tokens || (tokens.length !== 4 && tokens.length !== 5)) return null;
  const [left, operator, right, trueText, falseText] = tokens;
  if (
    left.kind !== "value" ||
    operator.kind !== "operator" ||
    right.kind !== "value" ||
    trueText.kind !== "value" ||
    (falseText && falseText.kind !== "value")
  ) {
    return null;
  }
  const branchIsLiteral = (token: Extract<IfLiteralToken, { kind: "value" }>) =>
    token.quoted || /^[\p{L}\p{N}_.:,!?+\-]{1,128}$/u.test(token.value);
  if (
    !branchIsLiteral(trueText) ||
    (falseText && !branchIsLiteral(falseText))
  ) {
    return null;
  }
  if (
    (operator.value === "=" || operator.value === "<>") &&
    /[?*]/.test(right.value)
  ) {
    return null;
  }

  const comparison = compareIfLiterals(left, right);
  if (comparison === null) return null;
  const matches =
    operator.value === "="
      ? comparison === 0
      : operator.value === "<>"
        ? comparison !== 0
        : operator.value === ">"
          ? comparison > 0
          : operator.value === "<"
            ? comparison < 0
            : operator.value === ">="
              ? comparison >= 0
              : comparison <= 0;
  return matches ? trueText.value : (falseText?.value ?? "");
}
