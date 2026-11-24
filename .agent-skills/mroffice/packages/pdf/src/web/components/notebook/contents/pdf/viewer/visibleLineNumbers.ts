/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export interface PdfVisibleLineNumber {
  number: number;
  topPercent: number;
}

/**
 * Measure the rendered pdf.js text layer into visual rows for the optional
 * reading aid. A PDF text line is often split into many spans, so numbering
 * spans directly produces duplicate numbers; nearby baselines are clustered
 * into one bounded row instead. Empty/malformed layers stay empty rather than
 * inventing lines for scanned pages.
 */
export function collectPdfVisibleLineNumbers(
  textLayer: HTMLElement,
): PdfVisibleLineNumber[] {
  const layerRect = textLayer.getBoundingClientRect();
  const layerHeight =
    layerRect.height || Number.parseFloat(textLayer.style.height) || 0;
  if (!Number.isFinite(layerHeight) || layerHeight <= 0) return [];

  // Source text spans only. The editor's paragraph overlays are boxes of
  // several lines whose centre falls between two of them; counted as text
  // they added a line of their own at high zoom (three lines numbered as
  
  const measured = Array.from(
    textLayer.querySelectorAll<HTMLElement>("span:not([data-pdf-native-text-paragraph-id])"),
  )
    .filter((span) => Boolean(span.textContent?.trim()))
    .map((span) => {
      const rect = span.getBoundingClientRect();
      const height = rect.height || Number.parseFloat(span.style.height) || 0;
      const relativeTop = rect.top - layerRect.top;
      return { center: relativeTop + height / 2, height };
    })
    .filter(
      (row) =>
        Number.isFinite(row.center) &&
        Number.isFinite(row.height) &&
        row.height > 0 &&
        row.center >= 0 &&
        row.center <= layerHeight,
    )
    .sort((left, right) => left.center - right.center)
    .slice(0, 8_000);
  if (measured.length === 0) return [];

  const lines: Array<{ center: number; height: number; count: number }> = [];
  for (const row of measured) {
    const previous = lines.at(-1);
    const tolerance = previous
      ? Math.min(8, Math.max(2, Math.min(previous.height, row.height) * 0.45))
      : 0;
    if (previous && Math.abs(row.center - previous.center) <= tolerance) {
      previous.center =
        (previous.center * previous.count + row.center) / (previous.count + 1);
      previous.height = Math.max(previous.height, row.height);
      previous.count += 1;
      continue;
    }
    lines.push({ ...row, count: 1 });
    if (lines.length === 2_000) break;
  }
  return lines.map((line, index) => ({
    number: index + 1,
    topPercent: Math.max(0, Math.min(100, (line.center / layerHeight) * 100)),
  }));
}
