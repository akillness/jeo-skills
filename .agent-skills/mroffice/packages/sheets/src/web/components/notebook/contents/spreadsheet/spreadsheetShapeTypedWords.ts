/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Home ▸ Font and WordArt on the words typed in a sheet shape: the selected
 * characters (a caret: the word it is in), as Excel formats the text being
 * edited in a shape, instead of the whole label (the selected shape's own
 * route, `applySpreadsheetShapeTextFont`). The words are the shared shape
 * text field's (`OfficeShapeTextField`), the same calls Docs makes on a Docs
 * shape's words (`formatCharacters`, `formatCharacterPaint`).
 */

import { PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import type { OfficeShapeTextFieldElement } from "@mrnote/core/web/components/office-ribbon/OfficeShapeTextField.tsx";
import { stepOfficeFontSizePt } from "@mrnote/core/web/lib/office-smartart/text-format.ts";
import { officeTextPaintWithFontColor, type OfficeTextPaint } from "@mrnote/core/web/lib/office-text-paint.ts";
import type { RunStyle } from "@mrnote/core/web/lib/presentation-runs.ts";
import type { SpreadsheetShapeTextFontCommand } from "../../../../lib/spreadsheet/shape-text-font";
import type { SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";

/** The words of a shape open for typing in `root`, with the shape's id. */
export function spreadsheetTypedShapeWords(
  root: ParentNode | null | undefined,
): { readonly objectId: string; readonly field: OfficeShapeTextFieldElement } | null {
  const field = root?.querySelector<HTMLElement>(
    '[data-office-shape-text-field][data-testid^="spreadsheet-shape-text-input-"]',
  );
  if (!field?.isConnected) return null;
  const words = field as unknown as OfficeShapeTextFieldElement;
  if (typeof words.formatCharacters !== "function" || typeof words.formatCharacterPaint !== "function") return null;
  const objectId = field.getAttribute("data-testid")!.slice("spreadsheet-shape-text-input-".length);
  return objectId ? { objectId, field: words } : null;
}

/** Whether every selected character is `key` (a caret: the format typed next). */
function on(field: OfficeShapeTextFieldElement, key: keyof RunStyle): boolean {
  const state = field.characterState(key);
  return state.value === true && !state.mixed;
}

/**
 * One Home ▸ Font command on the typed words. Alignment is the paragraph's,
 * never a character's: null hands it back to the shape's own route.
 */
export function formatSpreadsheetTypedShapeWords(
  field: OfficeShapeTextFieldElement,
  shape: SpreadsheetShapeStyle,
  command: SpreadsheetShapeTextFontCommand,
): boolean | null {
  switch (command.kind) {
    case "toggle":
      return field.formatCharacters(
        command.field === "textBold"
          ? { bold: !on(field, "bold") }
          : command.field === "textItalic"
            ? { italic: !on(field, "italic") }
            : { strike: !on(field, "strike") },
      );
    case "underline": {
      // A run states its line (`a:rPr@u`: `sng`, `dbl`): the characters
      // take the variant, or lose the line when they all wear it already.
      const style = field.characterState("underlineStyle");
      const double = command.variant === "double";
      const wearing = on(field, "underline") && !style.mixed && (style.value === "double") === double;
      return field.formatCharacters(
        wearing
          ? { underline: false, underlineStyle: undefined }
          : { underline: true, underlineStyle: double ? "double" : undefined },
      );
    }
    case "size":
      return field.formatCharacters({ fontSize: Math.round(command.px * 100) / 100 });
    case "step":
      // Each run steps from its own size, as Excel's shape text (PowerPoint's
      // engine) grows words of mixed sizes: 9 and 20 pt become 10 and 22.
      return field.formatCharacters((drawn) => {
        const px = typeof drawn.fontSize === "number" ? drawn.fontSize : (shape.textSize ?? 12);
        const pt = stepOfficeFontSizePt(Math.round((px / PX_PER_PT) * 100) / 100, command.direction, command.ladderPt);
        return pt === null ? {} : { fontSize: Math.round(pt * PX_PER_PT * 100) / 100 };
      });
    case "family":
      return field.formatCharacters({ fontFamily: command.family ?? undefined });
    case "variant":
      return field.formatCharacters({ fontFamily: command.family, bold: command.bold, italic: command.italic });
    case "color": {
      // Font Color on WordArt words is their fill (outline and effects kept);
      // on plain words, their colour.
      const color = command.color;
      if (!color) return field.formatCharacters({ color: undefined });
      return field.formatCharacterPaint(
        (paint) => {
          const worn = paint ?? shape.textPaint ?? null;
          // The shared rule (a transparency goes too); inside a WordArt label
          // the words keep a paint of their own to show over the label's.
          return worn ? officeTextPaintWithFontColor(worn, color, { keepBare: Boolean(shape.textPaint) }) : null;
        },
        { color },
      );
    }
    case "align":
    case "verticalAlign":
      return null;
  }
}

/**
 * WordArt Styles, Text Fill, Text Outline and Text Effects on the typed
 * words: each character's paint (its run's own, else the shape's, else its
 * plain colour as a fill) edited by `edit`.
 */
export function paintSpreadsheetTypedShapeWords(
  field: OfficeShapeTextFieldElement,
  shape: SpreadsheetShapeStyle,
  edit: (paint: OfficeTextPaint) => OfficeTextPaint | null,
): boolean {
  return field.formatCharacterPaint((paint, style) =>
    edit(
      paint ??
        shape.textPaint ?? {
          fill: style?.color ?? shape.textColor ?? "#111827",
          outline: "none",
          outlineWidthPt: 0,
        },
    ),
  );
}
