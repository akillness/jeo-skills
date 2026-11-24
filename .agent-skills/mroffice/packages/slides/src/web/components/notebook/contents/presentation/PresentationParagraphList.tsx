"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Draws a text body paragraph by paragraph: list markers (bullets, numbers,
 * pictures, symbol fonts with their availability check), per-paragraph
 * indents and spacing, and paragraph-level animation rows.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import type { NativeListIndent, NativeParagraphMetrics } from "@mrnote/core/web/lib/native-drawing-geometry.ts";
import { useContext, type CSSProperties, type ReactElement, type RefObject } from "react";
import { usePowerPointLineFit } from "./usePowerPointLineFit";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import type { NativeBulletMarker } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import type { SlideParagraphWithRuns } from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import { PARAGRAPH_MARKER_EM, type PresentationFontSizeUnit } from "../../../../lib/presentation/text-layout-css";
import {
  PresentationAutofitScaleContext,
  PresentationLetterPlayContext,
  letterPlayUnitCount,
  PresentationRunsText,
} from "./PresentationRunsText";
import {
  PresentationParagraphPlayContext,
  paragraphPlayRowProps,
} from "../../../../lib/presentation/block-play";
import { planPresentationParagraphRows } from "./presentationParagraphRows";
import { ENGINE_LINE_STARTS_ATTRIBUTE } from "@mrnote/core/web/lib/presentation/powerpoint-line-fit-dom.ts";

/**
 * Render a text block's list `paragraphs` as bulleted / numbered lines with a
 * hanging indent per level. Pure + render-only; shared by the present overlay
 * and the editor canvas so the two never drift. Numbered paragraphs number
 * within their contiguous same-level run (`renderParagraphs`). A paragraph with
 * `bullet: "none"` shows no marker (a plain indented line). Returns `null` when
 * there are no paragraphs so the caller can fall back to the flat `text`.
 * Each row's marker, style and indentation are planned once
 * (`planPresentationParagraphRows`), as the text engine's drawing reads them.
 */
export function PresentationParagraphList({
  paragraphs,
  baselineOffset,
  firstRowRef,
  nativeMetrics,
  listIndents,
  nativeBullet,
  bulletChar,
  numberFormat,
  fontSizeUnit = "design-px",
  paragraphStyle,
  bodyAlignStated = false,
  autofitLineSpacingMultiplier = 1,
  colorOverride,
  suppressFirstSpaceBefore = false,
  slideIds,
  onNavigateToSlide,
  wrap = true,
  emptyRowAsBreak = false,
  engineLineStarts,
  rowDirection,
}: {
  /**
   * The base direction a row without its own states, set in a body whose
   * columns run right to left (`textColumnsRowDirection`): the column
   * container's `direction` orders the columns, not the words.
   */
  rowDirection?: "ltr" | "rtl";
  /**
   * Where the text engine ends each row's lines (offsets after the first
   * line's start, comma-separated): a body being typed in has its rows
   * fitted to end their lines there (`powerpoint-line-fit-dom`).
   */
  engineLineStarts?: readonly string[];
  paragraphs: readonly SlideParagraphWithRuns[];
  /**
   * An empty row of a body being typed in holds a line break, not a space:
   * it gives the row its line for the caret (and a Chinese IME's letters)
   * and reads as no text, so the first keystroke is not followed by a space.
   * Every editable body sets it (a text box's, a shape label's): the text
   * readers take a lone space in an editable row as typed
   * (`lib/presentation/text-selection`).
   */
  emptyRowAsBreak?: boolean;
  /** False for a box whose text runs on past its edge (`textWrap: false`). */
  wrap?: boolean;
  baselineOffset?: number;
  firstRowRef?: RefObject<HTMLDivElement | null>;
  nativeMetrics?: readonly NativeParagraphMetrics[];
  /**
   * Each outline level's inherited `a:pPr@marL` / `@indent` (EMU), read by the
   * import from the master text style and list styles
   * (`source.nativeListIndents`). A marked row that states neither draws its
   * marker at marL + indent and its text at marL, PowerPoint's hanging
   * indent, instead of the editor's em gutter (PPT-D005).
   */
  listIndents?: readonly NativeListIndent[];
  /**
   * The marker each row actually draws where the bounded gallery cannot name
   * it, aligned to `paragraphs` by index. Display-only: nothing authors it and
   * a free-text edit drops it with its row (SHAPE-IMPORT-AUDIT.md §31.2).
   */
  nativeBullet?: readonly (NativeBulletMarker | null)[];
  /** Optional block-level marker overrides (picked glyph / number format). */
  bulletChar?: string;
  numberFormat?: string;
  fontSizeUnit?: PresentationFontSizeUnit;
  /** Effective a:spcBef/a:spcAft for each DrawingML paragraph. */
  paragraphStyle?: CSSProperties;
  /** The box states an alignment its rows inherit (a text block's `style.align`):
   * a Right-to-Left row stating none takes it, not Left. */
  bodyAlignStated?: boolean;
  /** The box's autofit line reduction for rows that state their own spacing
   * (`autofitRenderForBlock().lineSpacingMultiplier`); 1 draws them as stated. */
  autofitLineSpacingMultiplier?: number;
  /** Native Font Color emphasis overrides markers, paragraphs and child runs. */
  colorOverride?: string;
  /** Render-only no-autofit overflow reconciliation for imported text frames. */
  suppressFirstSpaceBefore?: boolean;
  slideIds?: ReadonlySet<string>;
  onNavigateToSlide?: (slideId: string) => void;
}): ReactElement | null {
  const fontAliases = useContext(PresentationFontAliasesContext);
  const autofitScale = useContext(PresentationAutofitScaleContext);
  const paragraphPlay = useContext(PresentationParagraphPlayContext);
  const letterPlay = useContext(PresentationLetterPlayContext);
  // Each row's lines end where PowerPoint ends them (`usePowerPointLineFit`).
  const registerLineFitColumn = usePowerPointLineFit();
  if (!paragraphs.length) return null;
  // For a letter-by-letter play, each row's letters count on from the rows above.
  const letterBases: number[] = [];
  if (letterPlay) {
    let count = 0;
    for (const paragraph of paragraphs) {
      letterBases.push(count);
      count += letterPlayUnitCount(paragraph.text ?? "", letterPlay);
    }
  }
  const rows = planPresentationParagraphRows({
    paragraphs,
    baselineOffset,
    nativeMetrics,
    listIndents,
    nativeBullet,
    bulletChar,
    numberFormat,
    fontSizeUnit,
    paragraphStyle,
    autofitLineSpacingMultiplier,
    colorOverride,
    suppressFirstSpaceBefore,
    fontAliases,
    autofitScale,
  });
  return (
    <>
      {rows.map((row) => {
        const { index, markerText, markerCss, markerBoxCss, rowTextStyle, gutterCss, indentCss, markerFollowsText, rowJustify } = row;
        const paragraph = { level: row.level, text: row.text };
        const rowPlay = paragraphPlayRowProps(paragraphPlay, index);
        return (
          <div
            key={index}
            ref={index === 0 ? firstRowRef : undefined}
            className={
              rowPlay.className
                ? `presentation-paragraph ${rowPlay.className}`
                : "presentation-paragraph"
            }
            data-paragraph-play={rowPlay.state}
            data-testid="presentation-paragraph"
            // PowerPoint's Right-to-Left paragraph: the bidi base direction,
            // so the marker (the row's first flex item) sits on the right and
            // the logical indentation below mirrors with it.
            dir={paragraphs[index]?.dir ?? rowDirection}
            data-presentation-paragraph-index={index}
            data-level={paragraph.level}
            data-marker={markerText ?? ""}
            style={{
              display: "flex",
              alignItems: "baseline",
              ...(rowJustify ? { justifyContent: rowJustify } : {}),
              ...gutterCss,
              ...rowTextStyle,
              // A Right-to-Left row stating no alignment is Left, a physical
              // side, as PowerPoint draws it (look-fit
              // truth-probes/lookfit-rtl-align-probe.pptx), not its start.
              // One its box states (`bodyAlignStated`: the block's `align`,
              
              // that side, inherited from the box.
              ...((paragraphs[index]?.dir ?? rowDirection) === "rtl" &&
              rowTextStyle.textAlign === undefined &&
              !bodyAlignStated
                ? { textAlign: "left" as const }
                : {}),
              ...indentCss,
              ...(baselineOffset === undefined ? {} : { transform: `translateY(${baselineOffset}px)` }),
              ...rowPlay.style,
              // The effect's keyframes compose the row's own offset.
              ...(rowPlay.state === "playing" && baselineOffset !== undefined
                ? ({ "--mrai-ppt-base-transform": `translateY(${baselineOffset}px)` } as CSSProperties)
                : {}),
            }}
          >
            {markerText ? (
              <span
                aria-hidden="true"
                contentEditable={false}
                data-presentation-selection-ignore="true"
                data-testid="presentation-paragraph-marker"
                style={{
                  flex: "0 0 auto",
                  minWidth: `${PARAGRAPH_MARKER_EM}em`,
                  // The marker stands at the start of its hanging gutter: the
                  // left in a left-to-right row, the right in a right-to-left
                  // one, where "left" drew the number against the words
                  
                  // numbers beside their text, PowerPoint's 40 pt out).
                  textAlign: "start",
                  ...markerCss,
                  // A large native marker can be wider than the hanging
                  // indent. Keep its actual glyph advance in the line so
                  // text never starts inside the marker's occupied space.
                  ...markerBoxCss,
                }}
              >
                {row.markerPicture ? (
                  // A picture bullet (`a:buBlip`) is drawn at the slot a
                  // glyph would take: the text's height, scaled by
                  // `a:buSzPct` / stated by `a:buSzPts`, aspect kept.
                  <img
                    alt=""
                    data-testid="presentation-paragraph-picture-marker"
                    draggable={false}
                    src={row.markerPicture}
                    style={{
                      display: "inline-block",
                      height: "1em",
                      width: "auto",
                      verticalAlign: "baseline",
                      transform: "translateY(0.12em)",
                    }}
                  />
                ) : (
                  markerText
                )}
              </span>
            ) : null}
            <span
              ref={registerLineFitColumn}
              data-presentation-paragraph-text="true"
              {...(engineLineStarts?.[index] !== undefined ? { [ENGINE_LINE_STARTS_ATTRIBUTE]: engineLineStarts[index] } : {})}
              style={{
                flex: markerFollowsText ? "0 1 auto" : "1 1 auto",
                // A flex item is no narrower than its longest word by
                // default: one long link widened the text past its box and
                // every line of the row wrapped at that width, off the
                
                
                minWidth: 0,
                // A no-wrap box keeps its hard breaks and nothing else
                // (PPT-B360).
                whiteSpace: wrap ? "pre-wrap" : "pre",
                
                overflowWrap: wrap ? "break-word" : "normal",
              }}
            >
              {paragraph.text ? (
                <PresentationRunsText
                  text={paragraph.text}
                  runs={paragraphs[index]?.runs}
                  fontSizeUnit={fontSizeUnit}
                  colorOverride={colorOverride}
                  slideIds={slideIds}
                  onNavigateToSlide={onNavigateToSlide}
                  letterBase={letterBases[index] ?? 0}
                />
              ) : emptyRowAsBreak ? (
                <br data-presentation-empty-row="true" />
              ) : (
                " "
              )}
            </span>
          </div>
        );
      })}
    </>
  );
}
