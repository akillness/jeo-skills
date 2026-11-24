"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The text drawn inside a shape: the shape text frame (insets, anchoring,
 * rotation), autofit, and the paragraph list or plain runs inside it.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { readNativeListIndents } from "@mrnote/core/web/lib/native-drawing-geometry.ts";
import {
  normalizeOfficeShapeEffectPreset,
  officeShapeEffectInsetLayerReflectionCss,
} from "@mrnote/core/web/lib/office-shape-effects.ts";
import { memo, useCallback, useContext, type CSSProperties, type HTMLAttributes, type ReactElement, type Ref } from "react";
import { usePowerPointLineFit } from "./usePowerPointLineFit";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { normalizeNativeBulletReceipt, paragraphStatesIndent } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import { normalizeRuns } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { normalizeVerticalAnchor } from "@mrnote/core/web/lib/presentation-vertical-anchor.ts";
import { flippedTextTransform } from "@mrnote/core/web/lib/presentation-shape-text-rect.ts";
import { textColumnsCss } from "@mrnote/core/web/lib/presentation-text-columns.ts";
import {
  normalizeParagraphsWithRuns,
  presentationTextUsesPoints,
} from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import { readZoomTileMarker } from "../../../../lib/presentation-zoom";
import { normalizeShapeText, shapeTextBeingTyped } from "@mrnote/core/web/lib/presentation-text-format.ts";
import type {
  PresentationShapeBlock,
  PresentationTextStyle,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { asRecord } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import {
  SHAPE_LABEL_DEFAULT_FONT_PX,
  shapeLabelTextAlignCss,
  shapeTextPaintCss,
  textBlockStyleCss,
  textBlockLineBreakCss,
  autofitRenderForBlock,
  withAutofitFontSize,
  shapeTextFrameLayout,
  shapeTextAreaWidthEmu,
  AUTOFIT_EMU_PER_PX,
  splitParagraphListTextStyle,
  importedPptxRunLineBoxCss,
  officePercentLeadingFlatRowCss,
  reducedOfficeLineHeight,
  type PresentationFontSizeUnit,
  presentationTextPaintOwnsShadow,
  textBlockTabSizeCss,
} from "../../../../lib/presentation/text-layout-css";
import { PresentationAutofitScaleContext, PresentationRunsText } from "./PresentationRunsText";
import {
  PresentationParagraphPlayContext,
  paragraphPlayRowProps,
  paragraphBuildRows,
} from "../../../../lib/presentation/block-play";
import { PresentationParagraphList } from "./PresentationParagraphList";
import { PresentationEngineOrFallback } from "./PresentationEngineTextBody";
import { PresentationEngineEditOrRows } from "./PresentationEngineEditLayer";
import { textEngineOn } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { planPresentationParagraphRows } from "./presentationParagraphRows";
import { OFFICE_HIT_TEXT_ATTRIBUTE } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { OfficeTextWarpMarker } from "@mrnote/core/web/components/office-text-warp/OfficeTextWarpMarker.tsx";
import { OfficeTextShadowCopyMarker } from "@mrnote/core/web/components/office-text-warp/OfficeTextShadowCopyMarker.tsx";
import { officeShapeTextTurn } from "@mrnote/core/web/lib/office-shape-effects-paint.ts";
import type { TextWarpShadow } from "@mrnote/core/web/lib/office-text-warp-render.ts";
import { presentationTextShapingCss } from "../../../../lib/presentation/presentation-text-shaping";

/**
 * The label's words made the editor (`PresentationCanvasShapeBlock`): the
 * body that draws them takes the caret, so the words are typed in the size,
 * spacing and place they are drawn in. `key` remounts the body after each
 * committed edit (the browser has mutated it), as a text box's does.
 */
export interface ShapeTextOverlayEditor {
  readonly key: string;
  readonly ref: Ref<HTMLElement>;
  readonly props: HTMLAttributes<HTMLElement>;
}

/** PowerPoint's default size for a shape's words, 18 pt, in slide px. */

/** Hand `element` to a callback or object ref. */
function assignRef<T>(ref: Ref<T> | undefined, element: T | null): void {
  if (typeof ref === "function") ref(element);
  else if (ref && typeof ref === "object") (ref as { current: T | null }).current = element;
}

function ShapeTextOverlayDrawing({
  block,
  colorOverride,
  slideIds,
  onNavigateToSlide,
  hitText = false,
  editor,
}: {
  block: PresentationShapeBlock;
  /** The label is being typed in, in its own drawn words. */
  editor?: ShapeTextOverlayEditor;
  colorOverride?: string;
  /** The words are hit as the shape's words where the host hit-tests its
   * shapes by geometry (`.geometryHit`, a SmartArt shape on the edit canvas):
   * a press on them selects the shape although its box passes presses on. */
  hitText?: boolean;
  /** The show's slide ids and navigation: a word's slide link in a shape's
   * label jumps as a text box's does (PPT-B269). */
  slideIds?: ReadonlySet<string>;
  onNavigateToSlide?: (slideId: string) => void;
}): ReactElement | null {
  const fontAliases = useContext(PresentationFontAliasesContext);
  // A By Paragraph build plays row by row (PPT-B370).
  const paragraphPlay = useContext(PresentationParagraphPlayContext);
  // A flat label ends its lines where PowerPoint does, as a structured
  // label's rows do (`usePowerPointLineFit`), while it is typed in too.
  const registerLineFitRow = usePowerPointLineFit();
  const editorRef = editor?.ref;
  const flatRowRef = useCallback(
    (element: HTMLParagraphElement | null) => {
      registerLineFitRow(element);
      assignRef(editorRef, element);
    },
    [editorRef, registerLineFitRow],
  );
  if (readZoomTileMarker(block)) return null;
  // A label being typed in keeps its body when it has no words (all deleted,
  // or only the spaces and breaks typed before the first word): its rows hold
  // the caret, as PowerPoint's empty shape shows only the caret.
  const text = editor ? shapeTextBeingTyped(block.text) : normalizeShapeText(block.text);
  if (text === undefined) return null;
  const runs = normalizeRuns(block.runs);
  // A shape's own label may run to SEVERAL paragraphs, each with its own
  // alignment and before/after spacing. They render through the same
  // `PresentationParagraphList` a text block's do — one reading of a paragraph
  // row, not a second one that drifts. A single paragraph keeps the flat `<p>`
  // below, which is what every shape label was until the import gate stopped
  // refusing multi-paragraph ones (SHAPE-IMPORT-AUDIT.md §15.5).
  const shapeParagraphs = normalizeParagraphsWithRuns(
    (block as { paragraphs?: unknown }).paragraphs,
  );
  // ONE row still needs the list when it says something the flat `<p>` cannot
  // draw: an outline level, or its own `a:pPr@marL`/`@indent`. The projection
  // carries the rows on exactly those terms, so a single indented label used to
  // arrive with its indentation on the block and nothing rendering it.
  // ... or a bullet / number: one top-level list item is a list too
  // (PPT-B267: the flat `<p>` drew "ONLY_ITEM" without its bullet).
  const flatRowPlay = paragraphPlayRowProps(paragraphPlay, 0);
  const buildParagraphs =
    shapeParagraphs ??
    (paragraphPlay !== null && text.includes("\n")
      ? paragraphBuildRows(text, runs, undefined, block)
      : undefined);
  const labelParagraphs =
    buildParagraphs &&
    (paragraphPlay !== null ||
      buildParagraphs.length > 1 ||
      buildParagraphs[0].level > 0 ||
      buildParagraphs[0].bullet !== "none" ||
      paragraphStatesIndent(buildParagraphs[0]) ||
      // ... or Line Spacing > Exactly (`lineSpacingPoints`): the flat `<p>`
      // only knows a multiple, and a title at "Exactly 55 pt" under a 90 %
      
      // 78 pt rows where PowerPoint's are 55).
      (buildParagraphs[0] as { lineSpacingPoints?: unknown }).lineSpacingPoints !== undefined)
      ? buildParagraphs
      : undefined;
  const style = block.style as PresentationTextStyle | undefined;
  const fontSizeUnit: PresentationFontSizeUnit = presentationTextUsesPoints(block)
    ? "point"
    : "design-px";
  // A shape label DEFAULTS to centered text (PowerPoint behaviour); only an
  // EXPLICIT align (left/right/justify) overrides that. So `align` is the
  // block's own align when it set one, else `center`.
  // Default-center for shape labels; `distribute` projects through the same
  // CSS rule as everywhere (justify + text-align-last).
  const alignCss = shapeLabelTextAlignCss(block);
  // The shape text style uses only the keys the shape actually set (no master /
  // theme inheritance — a shape label stands alone). `textAlign` (set below)
  // takes precedence over `textBlockStyleCss`'s own align so the default-center
  // is honoured.
  // `a:bodyPr@wrap="none"` means the label runs on past the shape's edge
  // instead of wrapping inside it — the other of DrawingML's two wrap values,
  // and what 819 of the slide shapes in the local corpus ask for. An imported
  // shape states it as `style.textWrap`; anything else keeps the wrapped
  // default the editor has always drawn.
  const shapeTextWraps = (style as { textWrap?: unknown } | undefined)?.textWrap !== false;
  // The package's own autofit, for a label that states one. The shape gate has
  // admitted `a:normAutofit` since §35 and the receipt rides on the shape, but
  // nothing here ever asked for it: the label was drawn at its nominal size,
  // 40pt where PowerPoint draws 25pt (§40.3). An authored shape with Shrink
  // text on overflow is measured in its own text box
  // (`authoredShapeAutofitBox`, PPT-B315); the bounds are never read, as a
  // shape always has its own frame.
  const labelStyleCss = textBlockStyleCss(style, undefined, fontSizeUnit, fontAliases);
  // The label's WordArt states its shadow: Home > Text Shadow adds none
  // (`presentationTextPaintOwnsShadow`).
  if (presentationTextPaintOwnsShadow((block as { textPaint?: unknown }).textPaint)) delete labelStyleCss.textShadow;
  // The label's tab settings (`a:pPr@defTabSz`, `a:tabLst`; readings row 834),
  // which the engine sets its tabs by, as a text box's.
  const labelTabStops = (style as { tabStops?: unknown } | undefined)?.tabStops;
  const labelDefaultTabPx = (style as { defaultTabPx?: unknown } | undefined)?.defaultTabPx;
  const labelFit = autofitRenderForBlock(
    block,
    { width: 0, height: 0 },
    typeof labelStyleCss.fontSize === "number" ? labelStyleCss.fontSize : undefined,
  );
  // The label's line pitch, as PowerPoint draws it: the face's own single line
  // (by the label's first face when the style names none), times the spacing
  // a placeholder drawn as a shape inherits from its layout when it states
  // none, less the package's autofit reduction. It drew at a flat 1.2: a body
  
  
  const labelLineHeight = (() => {
    const source = asRecord(block.source);
    const layoutSpacing =
      typeof source?.placeholderType === "string"
        ? asRecord(source.layoutStyle)?.lineSpacing
        : undefined;
    const ownFamily = (style as { fontFamily?: unknown } | undefined)?.fontFamily;
    const runFamily = [...(shapeParagraphs ?? []).flatMap((row) => row.runs ?? []), ...(runs ?? [])].find(
      (run) => typeof run.style?.fontFamily === "string",
    )?.style?.fontFamily;
    const lineStyle = {
      ...(style ?? {}),
      ...(style?.lineSpacing === undefined && typeof layoutSpacing === "number" && layoutSpacing > 0
        ? { lineSpacing: layoutSpacing }
        : {}),
      ...(typeof ownFamily !== "string" && runFamily ? { fontFamily: runFamily } : {}),
    } as PresentationTextStyle;
    const pitch = textBlockStyleCss(lineStyle, undefined, fontSizeUnit, fontAliases).lineHeight;
    // The reduction is taken off the percentage, not multiplied into it
    // (`reducedOfficeLineHeight`, as a text box's rows take it).
    return typeof pitch === "number" ? reducedOfficeLineHeight(pitch, labelFit.lineSpacingMultiplier) : pitch;
  })();
  // A text box's columns survive Change Shape: the block keeps its
  // `columnCount`, and a shape's label flows in it as the box's text did
  // (PPT-B124). The label's own body is the multicol container; the flex
  // wrapper around it still anchors it vertically.
  const labelColumnsCss = textColumnsCss((block as { columnCount?: unknown }).columnCount);
  const verticalWords = (() => {
    const mode = asRecord(block.style)?.writingMode;
    return typeof mode === "string" && mode !== "horizontal-tb";
  })();
  const { paddingTop: labelSpaceBefore, paddingBottom: labelSpaceAfter } =
    splitParagraphListTextStyle(labelStyleCss).paragraphStyle;
  const labelRowSpacing: CSSProperties = {
    ...(labelSpaceBefore !== undefined ? { paddingTop: labelSpaceBefore } : {}),
    ...(labelSpaceAfter !== undefined ? { paddingBottom: labelSpaceAfter } : {}),
  };
  const textCss: CSSProperties = {
    // Scale a size the label actually STATES. `withAutofitFontSize` falls back
    // to a 13px base when the style has none, which for a shape would invent a
    // size the label never had: a label with no block size inherits, this
    // renderer does not resolve a shape's inheritance ("a shape label stands
    // alone"), and its runs get the scale through the context below anyway.
    ...(typeof labelStyleCss.fontSize === "number"
      ? withAutofitFontSize(labelStyleCss, labelFit, fontSizeUnit)
      : // A label that states no size draws at PowerPoint's default for a
        // shape's text, 18 pt (24 slide px): Home read 18 while the words
        // drew at the page's 16px, so the same 18 confirmed once grew them
        // (PPT-B426).
        { ...labelStyleCss, fontSize: SHAPE_LABEL_DEFAULT_FONT_PX }),
    ...(labelLineHeight !== undefined ? { lineHeight: labelLineHeight } : {}),
    margin: 0,
    // Vertical words (Text Direction) fill the frame's height and lay their
    // lines right to left across it, as PowerPoint's vert text does.
    ...(verticalWords ? { height: "100%" } : { width: "100%" }),
    textAlign: "center",
    ...alignCss,
    whiteSpace: shapeTextWraps ? "pre-wrap" : "pre",
    overflowWrap: shapeTextWraps ? "anywhere" : "normal",
    // Its tabs step as the label states (`textBlockTabSizeCss`): stops, else
    
    // shape drawn by the browser for its 3-D words).
    ...textBlockTabSizeCss({ style }),
    // `latinLineBreak` (`a:pPr@latinLnBrk="1"`): Latin words break anywhere.
    ...(shapeTextWraps ? textBlockLineBreakCss(block) : {}),
    ...(colorOverride === undefined ? {} : { color: colorOverride }),
  };
  const flatRunLineBox = Object.fromEntries(
    Object.entries(importedPptxRunLineBoxCss(runs ?? undefined, fontSizeUnit, fontAliases, labelFit.fontScale)).filter(
      ([, value]) => value !== undefined,
    ),
  ) as CSSProperties;
  // PowerPoint's place for the glyphs in a percentage-spaced line, as every
  // paragraph row takes it (`officePercentLeadingFlatRowCss`); the vertical
  // words of a Text Direction label are not laid out by that rule.
  const { marginBottom: flatLeadingFoot, ...flatLeadingShift } = verticalWords
    ? ({} as CSSProperties)
    : officePercentLeadingFlatRowCss(textCss.lineHeight, flatRunLineBox.fontFamily ?? textCss.fontFamily);
  const { vAlign, alignItems, nativeInsets, shapeHeight, textRect, frame } =
    shapeTextFrameLayout(block);
  // Shape Effects > Reflection reflects the shape WITH its text, and the text
  // is drawn on this layer (PPT-B137).
  const textReflection = (() => {
    const effect = normalizeOfficeShapeEffectPreset(block.effect);
    if (effect !== "reflection") return "";
    const insetFraction = (edge: "top" | "bottom") =>
      typeof nativeInsets?.[edge] === "number" && shapeHeight > 0
        ? Math.max(0, Math.min(0.5, (nativeInsets[edge] as number) / shapeHeight))
        : 0;
    return officeShapeEffectInsetLayerReflectionCss(
      effect,
      (textRect?.top ?? 0) + insetFraction("top"),
      (textRect ? 1 - textRect.bottom : 0) + insetFraction("bottom"),
    );
  })();
  const editorHostProps = {
    contentEditable: true,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-multiline": true,
    "data-shape-rich-editor": "true",
    [OFFICE_HIT_TEXT_ATTRIBUTE]: "",
  } as const;
  // The body takes the presses and the caret the label's frame passes on.
  const editorHostStyle: CSSProperties = {
    pointerEvents: "auto",
    cursor: "text",
    outline: "none",
    userSelect: "text",
    WebkitUserSelect: "text",
  };
  // A label being typed in, drawn by the engine too (`PresentationEngineEditLayer`,
  // switch slides-edit): its rows stay the caret's, unpainted, their lines
  // ended where the engine ends them. Only a label in rows (a flat label is a
  // <p>, which takes no block of the engine's drawing).
  const editCandidate =
    editor !== undefined &&
    labelParagraphs !== null &&
    labelParagraphs !== undefined &&
    paragraphPlay === null &&
    !verticalWords &&
    !(block as { textWarp?: unknown }).textWarp &&
    !shapeTextPaintCss(block) &&
    fontSizeUnit === "point" &&
    !(typeof labelColumnsCss.columnCount === "number" && labelColumnsCss.columnCount > 1) &&
    asRecord(block.source)?.nativeKerning !== undefined &&
    textEngineOn("slides-edit");
  const editWidthEmu = editCandidate ? shapeTextAreaWidthEmu(block) : null;
  const editRows = editCandidate && labelParagraphs?.length
    ? planPresentationParagraphRows({
        paragraphs: labelParagraphs,
        listIndents: readNativeListIndents(asRecord(block.source)?.nativeListIndents),
        nativeBullet: normalizeNativeBulletReceipt((block as { nativeBullet?: unknown }).nativeBullet, labelParagraphs.length),
        bulletChar: (block as { bulletChar?: string }).bulletChar,
        numberFormat: (block as { numberFormat?: string }).numberFormat,
        fontSizeUnit,
        paragraphStyle: { ...textCss, ...labelRowSpacing },
        autofitLineSpacingMultiplier: labelFit.lineSpacingMultiplier,
        colorOverride,
        suppressFirstSpaceBefore: (style as { spaceFirstLastPara?: unknown } | undefined)?.spaceFirstLastPara === false,
        fontAliases,
        autofitScale: labelFit.fontScale,
      })
    : null;
  const labelBody: ReactElement = (labelParagraphs ? (
        <div
          key={editor?.key}
          ref={editor?.ref as Ref<HTMLDivElement> | undefined}
          {...(editor ? editorHostProps : {})}
          {...editor?.props}
          style={{
            ...(verticalWords
              ? { height: "100%", writingMode: textCss.writingMode, textOrientation: textCss.textOrientation }
              : { width: "100%" }),
            ...labelColumnsCss,
            ...(editor ? editorHostStyle : {}),
          }}
        >
          <PresentationEngineEditOrRows
            enabled={editCandidate && editRows !== null && editWidthEmu !== null}
            rows={editRows}
            bodyStyle={textCss}
            fontSizeUnit={fontSizeUnit}
            fontAliases={fontAliases}
            autofitScale={labelFit.fontScale}
            tabStops={labelTabStops}
            defaultTabPx={labelDefaultTabPx}
            kerning={asRecord(block.source)?.nativeKerning}
            eastAsianLines={asRecord(block.source)?.nativeEastAsianLines}
            lineBox={asRecord(block.source)?.nativeLineBox}
            widthPx={editWidthEmu === null ? null : editWidthEmu / AUTOFIT_EMU_PER_PX}
            wrap={shapeTextWraps}
            colorOverride={colorOverride}
            render={(engineLineStarts) => (
          <PresentationParagraphList
            engineLineStarts={engineLineStarts}
            paragraphs={labelParagraphs}
            autofitLineSpacingMultiplier={labelFit.lineSpacingMultiplier}
            // Being typed in: an empty row is a line for the caret, not a
            // space a key would be typed beside.
            emptyRowAsBreak={editor !== undefined}
            listIndents={readNativeListIndents(asRecord(block.source)?.nativeListIndents)}
            nativeBullet={normalizeNativeBulletReceipt(
              (block as { nativeBullet?: unknown }).nativeBullet,
              labelParagraphs.length,
            )}
            bulletChar={(block as { bulletChar?: string }).bulletChar}
            numberFormat={(block as { numberFormat?: string }).numberFormat}
            fontSizeUnit={fontSizeUnit}
            // Space Before / After the label states is every row's, as a
            // text box's is (`splitParagraphListTextStyle`): the row took the
            // label's `margin: 0` and a placeholder drawn as a shape lost its
            
            
            paragraphStyle={{ ...textCss, ...labelRowSpacing }}
            colorOverride={colorOverride}
            slideIds={slideIds}
            onNavigateToSlide={onNavigateToSlide}
            // `a:bodyPr@spcFirstLastPara` false: PowerPoint draws no space
            // before the first row at the top of the label (export-look).
            suppressFirstSpaceBefore={
              (style as { spaceFirstLastPara?: unknown } | undefined)?.spaceFirstLastPara === false
            }
          />
            )}
          />
        </div>
      ) : (
        <p
          key={editor?.key}
          ref={flatRowRef}
          {...(editor ? editorHostProps : {})}
          {...editor?.props}
          className={flatRowPlay.className}
          data-paragraph-play={flatRowPlay.state}
          style={{
            ...textCss,
            // An imported label's lines stand on its runs, as a text box's
            // flat row does (`importedPptxRunLineBoxCss`): a placeholder drawn
            // as a shape stood every line on the box's 18 pt, and a 10 pt
            
            ...flatRunLineBox,
            // ... and its glyphs stand in their lines where PowerPoint's do,
            
            ...flatLeadingShift,
            ...(flatLeadingFoot === undefined ? {} : { margin: `0 0 ${String(flatLeadingFoot)} 0` }),
            ...labelColumnsCss,
            ...flatRowPlay.style,
            ...(editor ? editorHostStyle : {}),
          }}
        >
          {text === "" ? (
            <br data-presentation-empty-row="true" />
          ) : (
            <PresentationRunsText
              text={text}
              runs={runs}
              fontSizeUnit={fontSizeUnit}
              colorOverride={colorOverride}
              slideIds={slideIds}
              onNavigateToSlide={onNavigateToSlide}
            />
          )}
          {/* A last line break opens a line the caret stands on. */}
          {editor && text.endsWith("\n") ? <br data-presentation-empty-row="true" /> : null}
        </p>
      ));
  // The text engine's drawing of an imported label at rest, where the
  // surface asks for it (`PresentationEngineTextBody`): its rows read by the
  // same plan the browser-flowed rows are. Anything else is the browser's.
  const engineEligible =
    !editor &&
    paragraphPlay === null &&
    !verticalWords &&
    !(block as { textWarp?: unknown }).textWarp &&
    !shapeTextPaintCss(block) &&
    fontSizeUnit === "point" &&
    !(typeof labelColumnsCss.columnCount === "number" && labelColumnsCss.columnCount > 1) &&
    // Read under reading row 345 (its kerning receipt): a page stored
    // before keeps the browser's drawing.
    asRecord(block.source)?.nativeKerning !== undefined;
  const engineWidthEmu = engineEligible ? shapeTextAreaWidthEmu(block) : null;
  const engineRows = (() => {
    if (!engineEligible) return null;
    const rows = labelParagraphs ?? paragraphBuildRows(text, runs, (block as { endLatinFace?: unknown }).endLatinFace, block);
    if (!rows.length) return null;
    return planPresentationParagraphRows({
      paragraphs: rows,
      listIndents: readNativeListIndents(asRecord(block.source)?.nativeListIndents),
      nativeBullet: normalizeNativeBulletReceipt((block as { nativeBullet?: unknown }).nativeBullet, rows.length),
      bulletChar: (block as { bulletChar?: string }).bulletChar,
      numberFormat: (block as { numberFormat?: string }).numberFormat,
      fontSizeUnit,
      paragraphStyle: labelParagraphs ? { ...textCss, ...labelRowSpacing } : { ...textCss, ...flatRunLineBox },
      autofitLineSpacingMultiplier: labelFit.lineSpacingMultiplier,
      colorOverride,
      suppressFirstSpaceBefore: labelParagraphs
        ? (style as { spaceFirstLastPara?: unknown } | undefined)?.spaceFirstLastPara === false
        : false,
      fontAliases,
      autofitScale: labelFit.fontScale,
    });
  })();
  // Format Shape > 3-D Rotation: the words lie on the shape's front and turn
  // with it unless Keep text flat is checked; typed into, they lie flat, as
  // PowerPoint edits them. A SmartArt member's words are its diagram's.
  const textTurn = block.scene3d
    ? null
    : officeShapeTextTurn(
        block.shapeEffects,
        {
          width: (typeof block.width === "number" && Number.isFinite(block.width) ? block.width : 952500) / 9525,
          height: (typeof block.height === "number" && Number.isFinite(block.height) ? block.height : 952500) / 9525,
        },
        {
          keepTextFlat: (block as { keepTextFlat?: unknown }).keepTextFlat,
          editing: editor !== undefined,
          // The block wears its flips outside the words' turned layer
          // (`buildBlockTransform`): the turn is taken through them, as the
          // shape's own is (`flippedCameraTurn`), so a flipped shape's words
          // lean with it as PowerPoint draws them (text3d-flip-probe).
          frame: {
            flipH: (block as { flipH?: unknown }).flipH === true,
            flipV: (block as { flipV?: unknown }).flipV === true,
          },
        },
      );
  // PowerPoint's shaping of the label's words where the browser draws them:
  // no common ligatures, and no kerning below the label's `kern` size
  
  // drawn kerned and took a word onto a line PowerPoint ends before it).
  const shapingSizes = (buildParagraphs ? buildParagraphs.flatMap((paragraph) => paragraph.runs ?? []) : runs ?? []).map((run) =>
    typeof run.style?.fontSize === "number" ? run.style.fontSize : undefined,
  );
  const shapingCss = presentationTextShapingCss(
    asRecord(block.source)?.nativeKerning,
    shapingSizes.length ? shapingSizes : null,
    labelFit.fontScale,
  );
  const label = (
    <div
      className="presentation-shape-text"
      data-testid="presentation-shape-text"
      dir={(block as { dir?: unknown }).dir === "rtl" ? "rtl" : undefined}
      data-align={alignCss.textAlign ?? "center"}
      data-valign={normalizeVerticalAnchor(vAlign ?? "middle")}
      data-text-paint={shapeTextPaintCss(block) ? "true" : undefined}
      data-reflected={textReflection ? "true" : undefined}
      {...(hitText && text.trim() ? { [OFFICE_HIT_TEXT_ATTRIBUTE]: "" } : {})}
      style={{
        // The shared WordArt paint (text fill, outline, effects), as Docs and
        // the worksheet draw it.
        ...(shapeTextPaintCss(block)
          ? shapeTextPaintCss(block)
          : {}),
        ...frame,
        display: "flex",
        alignItems,
        justifyContent: "center",
        // The frame mirrors a flipped shape, its text rectangle with it;
        // PowerPoint never mirrors the words (`flippedTextTransform`).
        transform: flippedTextTransform(block),
        ...(textReflection ? { WebkitBoxReflect: textReflection } : {}),
        boxSizing: "border-box",
        pointerEvents: "none",
        ...shapingCss,
      }}
    >
      {/* WordArt Transform: the label's words drawn bent (shared painter). */}
      <OfficeTextWarpMarker
        warp={(block as { textWarp?: unknown }).textWarp}
        shadow={(block as { textPaint?: { shadow?: TextWarpShadow } }).textPaint?.shadow ?? null}
        noWrap={!shapeTextWraps}
        align={alignCss.textAlign === "left" || alignCss.textAlign === "right" || alignCss.textAlign === "justify" ? alignCss.textAlign : "center"}
      />
      {/* Text Effects > Shadow > Perspective on a label's straight words (shared copy). */}
      <OfficeTextShadowCopyMarker
        warp={(block as { textWarp?: unknown }).textWarp}
        shadow={(block as { textPaint?: { shadow?: TextWarpShadow } }).textPaint?.shadow ?? null}
      />
      {engineEligible ? (
        <PresentationEngineOrFallback
          rows={engineRows}
          bodyStyle={textCss}
          fontSizeUnit={fontSizeUnit}
          autofitScale={labelFit.fontScale}
          tabStops={labelTabStops}
          defaultTabPx={labelDefaultTabPx}
          kerning={asRecord(block.source)?.nativeKerning}
          eastAsianLines={asRecord(block.source)?.nativeEastAsianLines}
          lineBox={asRecord(block.source)?.nativeLineBox}
          markLines={asRecord(block.source)?.nativeMarkLines}
          {...(labelParagraphs ? {} : { flatText: text, flatRuns: block.runs })}
          widthPx={engineWidthEmu === null ? null : engineWidthEmu / AUTOFIT_EMU_PER_PX}
          wrap={shapeTextWraps}
          colorOverride={colorOverride}
          naturalLines={Boolean(asRecord(block.source)?.nativeSmartArtView)}
          fallback={labelBody}
        />
      ) : (
        labelBody
      )}
    </div>
  );
  return (
    <PresentationAutofitScaleContext.Provider value={labelFit.fontScale}>
      {textTurn ? (
        // The shape's box, turned about its centre as the shape's own
        // effects frame is (`OfficeShapeEffectsFrame`).
        <div
          data-presentation-shape-text-turn=""
          style={{ position: "absolute", inset: 0, pointerEvents: "none", ...textTurn }}
        >
          {label}
        </div>
      ) : (
        label
      )}
    </PresentationAutofitScaleContext.Provider>
  );
}







export const ShapeTextOverlay = memo(ShapeTextOverlayDrawing);
ShapeTextOverlay.displayName = "ShapeTextOverlay";
