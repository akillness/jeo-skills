/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * CSS colour reading kept apart from the TextStyling editor extension, so a
 * workbook (watermarks, cell colours) reads it without the rich-text editor.
 * TextStyling re-exports it.
 */
import { cssNamedColorHex } from "../../../../lib/css-named-colors";

export function toHexColor(red: number, green: number, blue: number): string | null {
  const channels = [red, green, blue];
  if (
    channels.some(
      (channel) => !Number.isInteger(channel) || channel < 0 || channel > 255,
    )
  ) {
    return null;
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

// Strict hex matcher: 3- or 6-digit hex only (no alpha, no shorthand abuse).
// Anchored at both ends so a payload like "#fff;background:url(x)" can never
// pass — there is no place for a `;`, url(), or expression() to hide.
export const STRICT_HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;

// Expand a validated #rgb shorthand to its canonical #rrggbb form so every
// accepted color is serialized identically before it reaches the DOM.
export function canonicalHex(value: string): string {
  if (value.length === 4) {
    return `#${value
      .slice(1)
      .split("")
      .map((channel) => channel + channel)
      .join("")}`;
  }
  return value;
}

export function normalizeRgbColor(value: string): string | null {
  const legacyRgb = value.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1|1\.0|100%))?\s*\)$/,
  );
  const modernRgb = value.match(
    /^rgba?\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s*\/\s*(1|1\.0|100%))?\s*\)$/,
  );
  const match = legacyRgb || modernRgb;
  if (!match) return null;
  return toHexColor(Number(match[1]), Number(match[2]), Number(match[3]));
}

// Accepts any strict hex (#rgb / #rrggbb, which covers every preset swatch) or
// an rgb()/rgba() value, ALWAYS re-serializing to a canonical lowercase
// #rrggbb. Anything that is not a single pure validated color — extra
// declarations, url(), ;, expression(), var() — yields null and never reaches
// an inline style. The curated preset sets are no longer the gate; they are
// kept (via isPreset* helpers) only so callers can reason about the swatches.
export function normalizeColor<T extends string>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (STRICT_HEX_RE.test(normalized)) {
    return canonicalHex(normalized) as T;
  }

  const rgbHex = normalizeRgbColor(normalized);
  if (rgbHex) return rgbHex as T;
  // A CSS colour name is a definite colour too (`color: red` in pasted HTML).
  const named = cssNamedColorHex(normalized);
  return named ? (named as T) : null;
}

// The same strict color gate as text/highlight, but returning a plain
// `string | null` for surfaces that style something other than text — e.g. table
// cell shading. Reusing this single validator (not a parallel copy) guarantees
// cell backgrounds go through the identical #rgb / rgb() -> canonical #rrggbb
// canonicalization and CSS-injection rejection (no `;`, url(), expression(),
// var(), extra declarations).
export function normalizeCssColor(value: unknown): string | null {
  return normalizeColor<string>(value);
}
