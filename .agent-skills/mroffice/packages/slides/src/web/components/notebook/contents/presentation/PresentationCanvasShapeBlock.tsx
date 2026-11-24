"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One shape block as the edit canvas draws it.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { PresentationTextEngineSurfaceContext } from "./PresentationEngineTextBody";
import { normalizeShapeKind } from "@mrnote/core/web/lib/presentation-shapes.ts";
import { isTextEditTarget } from "../../../../lib/presentation-a11y";
import { readZoomTileMarker } from "../../../../lib/presentation-zoom";
import { presentationShapeTextHost, presentationSmartArtFaceSpan } from "../../../../lib/presentation/selection-geometry";
import { presentationShapeHitsByGeometry } from "./PresentationSmartArtGraphicHitArea";
import { OFFICE_HIT_TEXT_ATTRIBUTE } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { isPresentationCameoBlock, blockClaimsNativeGroup } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { PresentationCameoGraphic } from "./PresentationCameo";
import { PresentationShapeGraphic, presentationShapeReflectionCss } from "./PresentationShapeGraphic";
import { ZoomTileLabel } from "./PresentationBlockView";
import { readPreservedObjectNotice } from "@mrnote/core/web/lib/presentation-preserved-object.ts";
import { PresentationPreservedObjectNotice } from "./PresentationPreservedObjectNotice";
import {
  CROP_CORNERS,
  CROP_EDGES,
  type CropCorner,
  type CropEdge,
  type CropRect,
} from "@mrnote/core/web/lib/presentation-crop-group.ts";
import { shapeLabelEditorTextCss, shapeLabelNeedsRichEditor, shapeTextFrameLayout, type PresentationFontSizeUnit } from "../../../../lib/presentation/text-layout-css";
import {
  guardPresentationPreviewInput,
  selectPresentationPreviewWordAtPress,
  presentationPreviewPlainText,
  presentationPreviewSelection,
  presentationShapeWordsDoubleClickRange,
  setPresentationPreviewSelection,
} from "@mrnote/core/web/lib/presentation/text-selection.ts";
import type { PresentationShapeBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { flippedTextTransform } from "@mrnote/core/web/lib/presentation-shape-text-rect.ts";
import { keepRemoteCaret } from "../../../../lib/presentation/remote-caret-hold";
import { fitOfficeInlineTextEditor, moveOfficeInlineTextCaretHomeEnd, placeOfficeInlineTextCaret, officeInlineTextEditorStyle, typeOfficeInlineTextTab } from "@mrnote/core/web/lib/office-inline-text-editor.ts";
import { holdOfficeTextBoxForChrome } from "@mrnote/core/web/lib/office-inactive-selection.ts";
import { ShapeTextOverlay } from "./PresentationShapeTextOverlay";
import { useRichTextSelectionFollower } from "./useRichTextSelectionFollower";
import { PresentationTypingTextarea } from "./PresentationTypingTextarea";
import { inputIsLetterInPlace, usePresentationRichTypingKey } from "./usePresentationRichTypingKey";
import { browserReplacement } from "../../../../lib/presentation/collab-caret";
import { normalizeParagraphsWithRuns } from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useCallback, useContext, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { OfficeFontFace } from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import type { PresentationFontRequirement } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { BlockGeometry } from "@mrnote/core/web/lib/presentation-drag.ts";
import { smartArtFlat2d } from "@mrnote/core/web/lib/office-smartart/edit-in-2d.ts";
import { inkLineWidthScaled } from "@mrnote/core/web/lib/office-ink-line-scale.ts";
import { isTextEditLocked, isTextKeptReadOnly, isTextKeptReadOnlyTruncated } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { presentationBlockWithGroupPaint } from "../../../../lib/presentation-group-fill";
import { PresentationLiveGeometryContext } from "./PresentationLiveBlockFrame";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCanvasShapeBlockCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  setSelectedBlockId: Dispatch<SetStateAction<string | null>>;
  editingShapeTextId: string | null;
  setEditingShapeTextId: Dispatch<SetStateAction<string | null>>;
  shapeTextBlankDraft: { blockId: string; text: string; } | null;
  setShapeTextBlankDraft: Dispatch<SetStateAction<{ blockId: string; text: string; } | null>>;
  shapeAdjustPreview: { blockId: string; adjustments: Record<string, number>; } | null;
  textSelectionIntentRef: RefObject<number>;
  cropEditingId: string | null;
  cropPreview: { blockId: string; crop: CropRect; } | null;
  fontDisplay: { aliases: Record<string, string>; faces: OfficeFontFace[]; unavailable: boolean; revision: number; requirements: PresentationFontRequirement[]; verifiedVersion: number | undefined; layoutUpdateRequired: boolean | undefined; refreshBindings: () => void; };
  activeSlide: SlideModel;
  editSmartArtShapeText: (shapeId: string, seed?: string, point?: { x: number; y: number; word?: boolean }) => boolean;
  /**
   * The label's field changed. `composing`: an IME is still composing the
   * words, so the caret is the IME's and is left alone.
   */
  handleShapeTextChange: (
    blockId: string,
    event: { readonly currentTarget: HTMLTextAreaElement },
    composing?: boolean,
  ) => void;
  nudgeCropHandle: (blockId: string, edge: CropEdge, event: KeyboardEvent<HTMLElement>) => void;
  beginCropGesture: (blockId: string, edge: CropEdge | CropCorner | "pan", event: PointerEvent) => void;
  recordShapeTextSelection: (blockId: string, editor: HTMLTextAreaElement) => void;
  /** A label typed in its drawn words: the new text and the caret after it. */
  commitShapeRichText: (
    blockId: string,
    text: string,
    start: number,
    end: number,
    edit?: { readonly selection?: { start: number; end: number }; readonly softLineBreaks?: boolean },
    letterIn?: HTMLElement,
    /** The words a browser's replacement put in (`browserReplacement`). */
    replacement?: string | null,
  ) => void;
  recordShapeTextRange: (blockId: string, start: number, end: number) => void;
  /** The caret a remounted rich label body restores (the last commit's, else
   * -- with `orRecorded`, the default -- the recorded one). */
  takeShapeRichSelection: (blockId: string, orRecorded?: boolean, shown?: string) => { start: number; end: number } | null;
  /**
   * The selection the label's words open with, whichever editor draws them
   * (its drawn body or its plain field): taken by `takeShapeRichSelection`
   * once the editor mounts. Selection only: no history step.
   */
  placeShapeTextCaret: (blockId: string, start: number, end: number) => void;
  /** The words of a label the window's typing burst holds and has not drawn, else null. */
  heldBlockWords: (blockId: string) => string | null;
  /** Ctrl/Cmd+B, I or U in the label's words: Home's own toggle. */
  toggleShapeWordsRunStyle: (
    key: "bold" | "italic" | "underline" | "subscript" | "superscript",
  ) => void;
   
  copyShapeText: (blockId: string, start: number, end: number, clipboard: DataTransfer) => boolean;
  /**
   * Paste over the label's `range` of `text` keeping the format the
   * clipboard states on the words; false when it states none (the plain
   * text is pasted as before).
   */
  pasteShapeTextRuns: (
    blockId: string,
    text: string,
    range: { start: number; end: number },
    clipboard: DataTransfer,
  ) => boolean;
  undo: () => void;
  redo: () => void;
  block: PresentationShapeBlock;
  isSelected: boolean;
  fontSizeUnit: PresentationFontSizeUnit;
  previewGeom: BlockGeometry | undefined;
  /** Its SmartArt graphic is in Edit in 2-D: the shape is drawn without its 3-D. */
  smartArtFlat2d?: boolean;
}

/**
 * A stroke of ink being scaled draws its line at the width the commit gives
 * it (commitGestureGeometry), so nothing jumps when the hand lifts.
 */
function inkLinePreview(block: PresentationShapeBlock, geom: BlockGeometry): { strokeWidth?: number } {
  const ink = block as PresentationShapeBlock & { shape?: unknown; strokeWidth?: unknown; width?: unknown; height?: unknown };
  const strokeWidth = Number(ink.strokeWidth);
  if (ink.shape !== "ink" || !(strokeWidth > 0)) return {};
  return {
    strokeWidth: inkLineWidthScaled(
      strokeWidth,
      { width: Math.max(1, Number(ink.width)), height: Math.max(1, Number(ink.height)) },
      geom,
    ),
  };
}

/** Whether the keyboard is in a field outside `host` (a box, a dialog's field). */
function typingOutside(host: HTMLElement): boolean {
  const active = host.ownerDocument.activeElement;
  return (
    active instanceof HTMLElement &&
    active !== host.ownerDocument.body &&
    !host.contains(active) &&
    isTextEditTarget(active)
  );
}

export function PresentationCanvasShapeBlock({ ctl }: { ctl: PresentationCanvasShapeBlockCtl }) {
  // A stroke of ink another member is scaling is drawn where their hand has
  // it, at its size and its scaled line (PresentationLiveGeometryContext).
  const liveGeom = useContext(PresentationLiveGeometryContext);
  const liveInkGeom =
    liveGeom && (ctl.block as { shape?: unknown }).shape === "ink" && !ctl.block.groupId ? liveGeom : null;
  // An IME's letters are not the label's words until they are characters.
  const richComposing = useRef(false);
  // The same for the plain field a label of one format is typed in.
  const fieldComposing = useRef(false);
  // The shape whose words this editing session types in their drawn body.
  const [richSession, setRichSession] = useState<string | null>(null);
  const {
    t,
    setSelectedBlockId,
    editingShapeTextId,
    setEditingShapeTextId,
    shapeTextBlankDraft,
    setShapeTextBlankDraft,
    shapeAdjustPreview,
    textSelectionIntentRef,
    cropEditingId,
    cropPreview,
    fontDisplay,
    activeSlide,
    editSmartArtShapeText,
    handleShapeTextChange,
    nudgeCropHandle,
    beginCropGesture,
    recordShapeTextSelection,
    commitShapeRichText,
    recordShapeTextRange,
    takeShapeRichSelection,
    placeShapeTextCaret,
    heldBlockWords,
    toggleShapeWordsRunStyle,
    copyShapeText,
    pasteShapeTextRuns,
    undo,
    redo,
    block,
    isSelected,
    fontSizeUnit,
    previewGeom,
    smartArtFlat2d: drawFlat2d = false,
  } = ctl;
  // A shape whose words the file keeps (`noTextEdit`, or kept read-only)
  // opens no editor however it is asked to: keys typed into one showed in it
  
  
  const shapeTextEditable =
    !isPresentationCameoBlock(block) &&
    !isTextEditLocked(block) &&
    editingShapeTextId === block.id &&
    !readZoomTileMarker(block) &&
    !["ink", "custom-geometry"].includes(normalizeShapeKind(block.shape));
  // A label the textarea cannot draw as it reads (rows of its own, runs that
  // differ) is typed in its drawn words (`ShapeTextOverlay` editor). Once
  // typed there, the words stay in that body until the editing ends:
  // deleting them all, or formatting them all alike, swapped it for the plain
  
  // keeps the editing surface it had).
  const richShapeText =
    shapeTextEditable && (richSession === block.id || shapeLabelNeedsRichEditor(block));
  const nextRichSession = richShapeText ? block.id : null;
  // Held for the session: state derived in render (React's own pattern).
  if (nextRichSession !== richSession) setRichSession(nextRichSession);
  // The spaces and breaks typed before the label's first word are no label
  // yet (PPT-B189); the body being typed in draws them.
  const typedBlankDraft = shapeTextBlankDraft?.blockId === block.id ? shapeTextBlankDraft.text : null;
  const richEditorBlock =
    typedBlankDraft !== null
      ? ({ ...block, text: typedBlankDraft, runs: undefined, paragraphs: undefined } as PresentationShapeBlock)
      : block;
  const leaveShapeText = (host: HTMLElement | null) => {
    setShapeTextBlankDraft(null);
    setEditingShapeTextId(null);
    host?.closest<HTMLElement>("[data-block-id]")?.focus({ preventScroll: true });
  };
  const richSelection = (host: HTMLElement) => {
    const text = presentationPreviewPlainText(host);
    return {
      text,
      range: presentationPreviewSelection(host, text.length) ?? { start: text.length, end: text.length },
    };
  };
  const commitRichHost = (host: HTMLElement, letterTyped = false, replacement?: string | null) => {
    const { text, range } = richSelection(host);
    commitShapeRichText(block.id, text, range.start, range.end, undefined, letterTyped ? host : undefined, replacement);
  };
  const replaceRichSelection = (host: HTMLElement, inserted: string, softLineBreaks = false) => {
    const { text, range } = richSelection(host);
    const insertion = inserted.replace(/\r\n?/g, "\n");
    const caret = range.start + insertion.length;
    commitShapeRichText(
      block.id,
      `${text.slice(0, range.start)}${insertion}${text.slice(range.end)}`,
      caret,
      caret,
      // Where the words were replaced: Enter at the end of one row and at
      // the start of the next make the same text, not the same rows.
      { selection: range, softLineBreaks },
    );
  };
  const recordRichRange = (host: HTMLElement) => {
    const { range } = richSelection(host);
    recordShapeTextRange(block.id, range.start, range.end);
  };
  // The label's selection is followed however it was made (a drag released
  // past the shape included), so Home formats the highlighted words.
  const richHostRef = useRef<HTMLElement | null>(null);
  const richHost = useCallback(() => richHostRef.current, []);
  // The body keeps its key while its words change, the browser's own edits
  // put back before React draws the words (`usePresentationRichTypingKey`,
  // its commit guard rendered below).
  const { key: richTypingKey, commitGuard: richTypingCommitGuard } = usePresentationRichTypingKey({
    blockId: block.id,
    text: richEditorBlock.text ?? "",
    enabled: richShapeText,
    host: richHost,
    heldWords: heldBlockWords,
  });
  const shapeReflection = isPresentationCameoBlock(block) ? null : presentationShapeReflectionCss(block);
  useRichTextSelectionFollower(
    () => richHostRef.current,
    (host) => {
      if (!richComposing.current) recordRichRange(host);
    },
    richShapeText,
  );
  return (
                    <div
                      className="presentation-window__shape-block"
                      // Shape Effects > Reflection reflects the drawing and
                      
                      style={shapeReflection ? ({ WebkitBoxReflect: shapeReflection } as CSSProperties) : undefined}
                      data-testid="presentation-shape-block"
                      data-shape={normalizeShapeKind(block.shape)}
                      data-zoom-kind={readZoomTileMarker(block)?.zoomKind}
                      // Double-click a (non-zoom) shape to edit its centered text.
                      onDoubleClick={
                        // Lock leaves a shape's words open (PowerPoint's Lock
                        // fixes only its place); the file's `noTextEdit` keeps them.
                        presentationShapeTextHost(activeSlide.blocks, block) === null || isTextEditLocked(block)
                          ? undefined
                          : (event) => {
                              event.stopPropagation();
                              // A SmartArt shape's words open with the word under the
                              // pointer selected, as PowerPoint's double click does
                              // (the file's diagrams already do, 5675e053ae); any
                              // other shape's caret goes where the words were clicked.
                              if (editSmartArtShapeText(block.id, undefined, { x: event.clientX, y: event.clientY, word: true })) return;
                              // Words not open yet open where they were
                              // double-clicked, as PowerPoint opens them: the
                              // word under the pointer selected, or, in the
                              // frame off the words, the caret at the nearest
                              // place. The editor opened with the caret after
                              
                              // slide 1, under the subtitle's one line). Read
                              // from the words drawn at rest, before they open.
                              if (editingShapeTextId !== block.id) {
                                const range = presentationShapeWordsDoubleClickRange(
                                  event.currentTarget,
                                  event.target,
                                  event.clientX,
                                  event.clientY,
                                  (block as PresentationShapeBlock).text ?? "",
                                );
                                if (range) placeShapeTextCaret(block.id, range[0], range[1]);
                              }
                              setSelectedBlockId(block.id);
                              setEditingShapeTextId(block.id);
                            }
                      }
                    >
                      {isPresentationCameoBlock(block) ? (
                        <PresentationCameoGraphic
                          block={block}
                          cropOverride={
                            cropPreview && cropPreview.blockId === block.id
                              ? cropPreview.crop
                              : undefined
                          }
                          interactive={isSelected}
                          t={t}
                        />
                      ) : (
                        <>
                          <PresentationShapeGraphic reflectionOutside={Boolean(shapeReflection)}
                            // Hit by its outline and words (a SmartArt shape, a
                            // No Fill shape): a hairline outline gets a band.
                            outlineHitBand={presentationShapeHitsByGeometry(block)}
                            // Where the member stands in its diagram: 3d7's metal and
                            // 3d6's balanced light fall across the whole graphic, as
                            // the slide show draws them.
                            smartArtFaceSpan={
                              block.shape3d?.material === "metal" || block.scene3d?.lightRig.rig === "balanced"
                                ? presentationSmartArtFaceSpan(activeSlide.blocks, block)
                                : null
                            }
                            block={(() => {
                            // Edit in 2-D draws the shape flat; the page keeps its 3-D.
                            // A member wearing its group's gradient, picture or
                            // pattern draws its part of it, from the boxes as
                            // they are now (presentation-group-fill).
                            const drawnBlock = presentationBlockWithGroupPaint(
                              drawFlat2d ? smartArtFlat2d(block) : block,
                              activeSlide.blocks,
                            );
                            const geometryBlock = previewGeom && !block.groupId && !blockClaimsNativeGroup(block)
                              ? { ...drawnBlock, ...previewGeom, ...inkLinePreview(block, previewGeom) }
                              : liveInkGeom
                                ? { ...drawnBlock, ...liveInkGeom, ...inkLinePreview(block, liveInkGeom) }
                                : drawnBlock;
                            return shapeAdjustPreview?.blockId === block.id
                              ? { ...geometryBlock, adjustments: shapeAdjustPreview.adjustments }
                              : geometryBlock;
                          })()} />
                          <ZoomTileLabel block={block} />
                          {(() => {
                            // A diagram the file keeps and this page cannot
                            // draw: the frame is real and the members are not
                            // here, so the frame says so instead of the slide
                            // arriving one object shorter with no mark.
                            const preserved = readPreservedObjectNotice(
                              block as unknown as Record<string, unknown>,
                            );
                            return preserved ? (
                              <PresentationPreservedObjectNotice
                                notice={preserved}
                                label={t(
                                  `presentation.preservedObject.${preserved.kind}`,
                                )}
                              />
                            ) : null;
                          })()}
                        </>
                      )}
                      {isPresentationCameoBlock(block) &&
                      cropEditingId === block.id ? (
                        <div
                          className="presentation-window__crop-overlay"
                          data-testid="presentation-cameo-crop-overlay"
                          style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                          }}
                        >
                          {

}
                          <div
                            className="presentation-window__crop-pan"
                            aria-label={t("presentation.crop.pan")}
                            title={t("presentation.crop.pan")}
                            data-testid="presentation-cameo-crop-pan"
                            onPointerDown={(event) =>
                              beginCropGesture(block.id, "pan", event)
                            }
                          />
                          {CROP_CORNERS.map((corner) => (
                            <div
                              key={corner}
                              role="button"
                              tabIndex={-1}
                              aria-label={t(
                                `presentation.crop.handle.${corner}` as "presentation.crop.handle.top-left",
                              )}
                              title={t(
                                `presentation.crop.handle.${corner}` as "presentation.crop.handle.top-left",
                              )}
                              data-testid={`presentation-cameo-crop-handle-${corner}`}
                              className={`presentation-window__crop-handle presentation-window__crop-handle--corner presentation-window__crop-handle--${corner}`}
                              style={{ pointerEvents: "auto" }}
                              onPointerDown={(event) =>
                                beginCropGesture(block.id, corner, event)
                              }
                            />
                          ))}
                          {CROP_EDGES.map((edge) => (
                            <div
                              key={edge}
                              role="button"
                              tabIndex={0}
                              aria-label={t(
                                `presentation.crop.handle.${edge}` as "presentation.crop.handle.left",
                              )}
                              title={t(
                                `presentation.crop.handle.${edge}` as "presentation.crop.handle.left",
                              )}
                              data-testid={`presentation-cameo-crop-handle-${edge}`}
                              className={`presentation-window__crop-handle presentation-window__crop-handle--${edge}`}
                              style={{ pointerEvents: "auto" }}
                              onPointerDown={(event) =>
                                beginCropGesture(block.id, edge, event)
                              }
                              onKeyDown={(event) =>
                                nudgeCropHandle(block.id, edge, event)
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                      {richShapeText ? (
                        // The label's own drawn words take the caret: typed in
                        // the size, spacing and place they read in, so
                        // entering and leaving editing never moves them.
                        <ShapeTextOverlay
                          block={richEditorBlock}
                          hitText
                          editor={{
                            // A letter typed in place keeps the body
                            // (usePresentationRichTypingKey).
                            key: richTypingKey ?? `shape-rich:${block.id}:${richEditorBlock.text ?? ""}`,
                            ref: (host: HTMLElement | null) => {
                              richHostRef.current = host;
                              // The browser's formatting, and a delete with
                              // no words to take (it removed the label's
                              // empty row, the caret's line), are refused; a
                              // range it would edit across the drawn rows is
                              // written over the words in the model.
                              guardPresentationPreviewInput(host, replaceRichSelection);
                              if (!host) return;
                              // An input method's marked text is the
                              // browser's until it commits: focusing or
                              // selecting under it commits the letters typed
                              // so far (pinyin in a listed shape became
                              
                              if (richComposing.current) return;
                              // The same body drawn again while the keyboard
                              // is in a field outside it (Home's size or font
                              // box, a dialog) leaves it there: taking it back
                              // put the size typed into the box into the
                              // words, over the selected ones.
                              if (host.dataset.caretPlaced && typingOutside(host)) return;
                              // A body already holding the caret is only moved
                              // by a caret a command left for it, not by the
                              // last recorded one on every redraw (this ref
                              // runs on each render).
                              const restore = takeShapeRichSelection(block.id, !host.dataset.caretPlaced, presentationPreviewPlainText(host));
                              if (!restore && host.dataset.caretPlaced) return;
                              host.dataset.caretPlaced = "true";
                              host.focus({ preventScroll: true });
                              const end = presentationPreviewPlainText(host).length;
                              setPresentationPreviewSelection(
                                host,
                                restore?.start ?? end,
                                restore?.end ?? end,
                              );
                            },
                            props: {
                              spellCheck: false,
                              "aria-label": t("presentation.shapeTextLabel"),
                              onPointerDown: (event) => {
                                textSelectionIntentRef.current += 1;
                                event.stopPropagation();
                              },
                              onInput: (event) => {
                                if (richComposing.current) return;
                                commitRichHost(event.currentTarget, inputIsLetterInPlace(event.nativeEvent), browserReplacement(event.nativeEvent));
                              },
                              onCompositionStart: () => {
                                richComposing.current = true;
                              },
                              onCompositionEnd: (event) => {
                                richComposing.current = false;
                                commitRichHost(event.currentTarget);
                              },
                              // A double- or triple-click selects the word or
                              // paragraph in the label's own words, never a
                              // paragraph's break or a drawn bullet.
                              onMouseDown: (event) => {
                                if (!selectPresentationPreviewWordAtPress(event.currentTarget, event.nativeEvent)) return;
                                event.stopPropagation();
                                recordRichRange(event.currentTarget);
                              },
                              onMouseUp: (event) => recordRichRange(event.currentTarget),
                              onKeyUp: (event) => {
                                if (!richComposing.current) recordRichRange(event.currentTarget);
                              },
                              onPaste: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                // The words keep the format their copy states
                                
                                const { text, range } = richSelection(event.currentTarget);
                                if (pasteShapeTextRuns(block.id, text, range, event.clipboardData)) return;
                                replaceRichSelection(
                                  event.currentTarget,
                                  event.clipboardData.getData("text/plain"),
                                );
                              },
                              onCopy: (event) => {
                                const { range } = richSelection(event.currentTarget);
                                if (!copyShapeText(block.id, range.start, range.end, event.clipboardData)) return;
                                event.preventDefault();
                                event.stopPropagation();
                              },
                              onCut: (event) => {
                                const { range } = richSelection(event.currentTarget);
                                if (!copyShapeText(block.id, range.start, range.end, event.clipboardData)) return;
                                event.preventDefault();
                                event.stopPropagation();
                                replaceRichSelection(event.currentTarget, "");
                              },
                              onBlur: (event) => {
                                const host = event.currentTarget;
                                if (holdOfficeTextBoxForChrome(host, event.relatedTarget, () => leaveShapeText(null))) {
                                  return;
                                }
                                setShapeTextBlankDraft(null);
                                setEditingShapeTextId(null);
                              },
                              onKeyDown: (event) => {
                                textSelectionIntentRef.current += 1;
                                event.stopPropagation();
                                if (event.nativeEvent.isComposing) return;
                                const host = event.currentTarget;
                                const command = event.metaKey || event.ctrlKey;
                                if (
                                  event.key === "Escape" ||
                                  (event.key === "F2" && !command && !event.altKey && !event.shiftKey)
                                ) {
                                  event.preventDefault();
                                  leaveShapeText(host);
                                  return;
                                }
                                if (command && !event.altKey) {
                                  const key = event.key.toLowerCase();
                                  // Ctrl/Cmd+= subscript, Ctrl/Cmd+Shift+=
                                  // superscript in the words (PowerPoint);
                                  // outside them the keys zoom the slide.
                                  if (
                                    event.code !== "NumpadAdd" &&
                                    (event.code === "Equal" || key === "=" || key === "+")
                                  ) {
                                    event.preventDefault();
                                    toggleShapeWordsRunStyle(
                                      event.shiftKey || key === "+" ? "superscript" : "subscript",
                                    );
                                    return;
                                  }
                                  if ((key === "z" && event.shiftKey) || key === "y") {
                                    event.preventDefault();
                                    redo();
                                    return;
                                  }
                                  if (key === "z") {
                                    event.preventDefault();
                                    undo();
                                    return;
                                  }
                                  if (key === "a" && !event.shiftKey) {
                                    // Select All is the label's words.
                                    event.preventDefault();
                                    // Its first to its last character, in the
                                    // words' own text, so a typed key replaces
                                    
                                    if (!setPresentationPreviewSelection(host, 0, presentationPreviewPlainText(host).length)) {
                                      const all = host.ownerDocument.createRange();
                                      all.selectNodeContents(host);
                                      const selection = host.ownerDocument.getSelection();
                                      selection?.removeAllRanges();
                                      selection?.addRange(all);
                                    }
                                    recordRichRange(host);
                                    return;
                                  }
                                  if (["b", "i", "u"].includes(key)) {
                                    // The browser's own bold would change only
                                    // the drawn words; the Font group formats
                                    // the model -- the selected words, as
                                    // Home's button does (the key did nothing).
                                    event.preventDefault();
                                    if (!event.shiftKey) {
                                      toggleShapeWordsRunStyle(
                                        key === "b" ? "bold" : key === "i" ? "italic" : "underline",
                                      );
                                    }
                                    return;
                                  }
                                }
                                if (event.key === "Enter" && !command && !event.altKey && event.keyCode !== 229) {
                                  // Enter starts a new paragraph; Shift+Enter
                                  // breaks the line inside it (`a:br`, no new
                                  // bullet), as PowerPoint does -- in a label
                                  // with rows of its own, the only kind that
                                  // can tell the two apart.
                                  event.preventDefault();
                                  replaceRichSelection(
                                    host,
                                    "\n",
                                    event.shiftKey &&
                                      Boolean(
                                        normalizeParagraphsWithRuns(
                                          (block as { paragraphs?: unknown }).paragraphs,
                                        ),
                                      ),
                                  );
                                  return;
                                }
                                if (event.key === "Tab" && !command && !event.altKey) {
                                  // A tab in the words, as PowerPoint's.
                                  event.preventDefault();
                                  if (!event.shiftKey) replaceRichSelection(host, "\t");
                                }
                              },
                            },
                          }}
                        />
                      ) : shapeTextEditable ? (
                        // The words are typed in the box they are drawn in,
                        // at the same anchor (`shapeTextFrameLayout`): the
                        // editor is as tall as its words and hangs where the
                        // label hangs, so F2 and Esc never move them
                        // (PPT-B190). A press in the box but off the words
                        // keeps the caret in them.
                        <div
                          data-testid="presentation-shape-text-editor-frame"
                          // Words being typed are hit as words, also on a
                          // shape hit by its geometry (a SmartArt shape).
                          {...{ [OFFICE_HIT_TEXT_ATTRIBUTE]: "" }}
                          style={{
                            ...shapeTextFrameLayout(block as PresentationShapeBlock).frame,
                            display: "flex",
                            alignItems: shapeTextFrameLayout(block as PresentationShapeBlock).alignItems,
                            justifyContent: "center",
                            boxSizing: "border-box",
                            // Typed as it will read: a flipped shape's words are
                            // not mirrored (`flippedTextTransform`).
                            transform: flippedTextTransform(block),
                          }}
                          onPointerDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            event.preventDefault();
                            event.stopPropagation();
                            event.currentTarget
                              .querySelector<HTMLTextAreaElement>("textarea")
                              ?.focus();
                          }}
                        >
                        <PresentationTypingTextarea
                          autoFocus
                          rows={1}
                          ref={(element) => {
                            if (!element) return;
                            fitOfficeInlineTextEditor(element);
                            // After each commit of this box: a collaborator's
                            // delivery's caret, if this commit rewrote the
                            // words under it (lib/presentation/remote-caret-hold).
                            keepRemoteCaret(element, block.id, { composing: fieldComposing.current });
                          }}
                          onInput={(event) => fitOfficeInlineTextEditor(event.currentTarget)}
                          value={
                            shapeTextBlankDraft?.blockId === block.id
                              ? shapeTextBlankDraft.text
                              : ((block as PresentationShapeBlock).text ?? "")
                          }
                          onChange={(event) =>
                            handleShapeTextChange(
                              block.id,
                              event,
                              fieldComposing.current ||
                                (event.nativeEvent as InputEvent).isComposing === true,
                            )
                          }
                          // An IME's letters are typed through this field as
                          // they are composed: the caret is left to the IME
                          // until the composition ends, then the words and
                          // their caret are taken as for a typed key.
                          onCompositionStart={() => {
                            fieldComposing.current = true;
                          }}
                          onCompositionEnd={(event) => {
                            fieldComposing.current = false;
                            handleShapeTextChange(block.id, event, false);
                          }}
                          // A copy carries the words' runs, and a paste keeps
                          
                          // paste is the textarea's own.
                          onCopy={(event) => {
                            const el = event.currentTarget;
                            if (!copyShapeText(block.id, el.selectionStart ?? 0, el.selectionEnd ?? 0, event.clipboardData)) return;
                            event.preventDefault();
                          }}
                          onCut={(event) => {
                            const el = event.currentTarget;
                            const start = el.selectionStart ?? 0;
                            const end = el.selectionEnd ?? start;
                            if (!copyShapeText(block.id, start, end, event.clipboardData)) return;
                            event.preventDefault();
                            el.setRangeText("", start, end, "end");
                            el.dispatchEvent(new Event("input", { bubbles: true }));
                          }}
                          onPaste={(event) => {
                            const el = event.currentTarget;
                            const start = el.selectionStart ?? el.value.length;
                            const range = { start, end: el.selectionEnd ?? start };
                            if (!pasteShapeTextRuns(block.id, el.value, range, event.clipboardData)) return;
                            event.preventDefault();
                            // The caret after the pasted words, once the
                            // label (still typed here) has its new text.
                            const caret = range.start + event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").length;
                            requestAnimationFrame(() => {
                              if (el.isConnected && el.ownerDocument.activeElement === el) el.setSelectionRange(caret, caret);
                            });
                          }}
                          // The characters the Font commands format
                          // (`commitEditingShapeTextRuns`).
                          onSelect={(event) => recordShapeTextSelection(block.id, event.currentTarget)}
                          // A caret placed by a click or a key raises no
                          // `select`; the equation context reads this too
                          // (PPT-B402).
                          onMouseUp={(event) => recordShapeTextSelection(block.id, event.currentTarget)}
                          onKeyUp={(event) => recordShapeTextSelection(block.id, event.currentTarget)}
                          onBlur={(event) => {
                            const leave = () => {
                              setShapeTextBlankDraft(null);
                              setEditingShapeTextId(null);
                            };
                            // The ribbon (a tab, a font, a size, a colour)
                            // keeps the words in edit, as PowerPoint keeps a
                            // shape's text selection across the ribbon; a
                            // press anywhere else (or Esc) then leaves.
                            if (
                              holdOfficeTextBoxForChrome(
                                event.currentTarget,
                                event.relatedTarget,
                                leave,
                              )
                            ) {
                              return;
                            }
                            leave();
                          }}
                          onFocus={(event) => {
                            // A caret after the words when the editor opens, as
                            // Enter / F2 / a typed key open it in PowerPoint; a
                            // later refocus keeps whatever selection it had.
                            const editorElement = event.currentTarget;
                            if (editorElement.dataset.caretPlaced) return;
                            editorElement.dataset.caretPlaced = "true";
                            // Words a format command just made one format
                            // leave the drawn editor for this field: their
                            // selection comes with them.
                            const carried = takeShapeRichSelection(block.id, false);
                            if (carried && carried.end <= editorElement.value.length) {
                              editorElement.setSelectionRange(carried.start, carried.end);
                              return;
                            }
                            placeOfficeInlineTextCaret(editorElement);
                          }}
                          onKeyDown={(event) => {
                            const command = event.metaKey || event.ctrlKey;
                            const formatKey = event.key.toLowerCase();
                            if (
                              command &&
                              !event.altKey &&
                              event.code !== "NumpadAdd" &&
                              (event.code === "Equal" || formatKey === "=" || formatKey === "+")
                            ) {
                              // Ctrl/Cmd+= subscript, Ctrl/Cmd+Shift+= superscript.
                              event.preventDefault();
                              event.stopPropagation();
                              toggleShapeWordsRunStyle(
                                event.shiftKey || formatKey === "+" ? "superscript" : "subscript",
                              );
                              return;
                            }
                            if (
                              command &&
                              !event.altKey &&
                              !event.shiftKey &&
                              (formatKey === "b" || formatKey === "i" || formatKey === "u")
                            ) {
                              // Ctrl/Cmd+B, I, U format the selected words, as
                              // Home's buttons do (the key did nothing here).
                              event.preventDefault();
                              event.stopPropagation();
                              toggleShapeWordsRunStyle(
                                formatKey === "b" ? "bold" : formatKey === "i" ? "italic" : "underline",
                              );
                              return;
                            }
                            textSelectionIntentRef.current += 1;
                            // Home / End move the caret in the words (the
                            // browser would scroll the slide area instead).
                            if (moveOfficeInlineTextCaretHomeEnd(event, event.currentTarget)) {
                              event.stopPropagation();
                              return;
                            }
                            // Tab is a tab in the shape's words, as in
                            // PowerPoint (the browser's Tab left the shape
                            // and the typing went to whatever took focus).
                            if (typeOfficeInlineTextTab(event, event.currentTarget)) {
                              event.stopPropagation();
                              return;
                            }
                            // PowerPoint: Enter is a new paragraph in the shape
                            // (the textarea's own line break); Esc leaves the
                            // words and selects the shape, so the keyboard goes
                            // back to the block (its arrows, Delete, F2). Stop
                            // bubbling so the canvas-level shortcuts don't also
                            // fire.
                            // F2 ends the editing the F2 on the shape began
                            // (PowerPoint toggles between words and object,
                            // PPT-B421).
                            if (
                              event.key === "Escape" ||
                              (event.key === "F2" &&
                                !event.metaKey &&
                                !event.ctrlKey &&
                                !event.altKey &&
                                !event.shiftKey)
                            ) {
                              event.preventDefault();
                              const host =
                                event.currentTarget.closest<HTMLElement>(
                                  "[data-block-id]",
                                );
                              setShapeTextBlankDraft(null);
                              setEditingShapeTextId(null);
                              host?.focus({ preventScroll: true });
                            }
                            event.stopPropagation();
                          }}
                          // An empty shape shows only the caret, as
                          // PowerPoint's does: a shape has no prompt of its
                          // own (a layout placeholder's prompt is drawn by
                          // its text box).
                          aria-label={t("presentation.shapeTextLabel")}
                          data-testid="presentation-shape-text-input"
                          className="presentation-window__shape-text-input"
                          style={{
                            // The ONE in-shape editor style the three hosts share.
                            ...officeInlineTextEditorStyle(),
                            // Typed as it reads at rest: the label's runs'
                            // size, face and colour and its alignment, not
                            // only the shape's own style (the words jumped to
                            // a small centred default on entering editing).
                            ...shapeLabelEditorTextCss(block, fontSizeUnit, fontDisplay.aliases),
                            // In the frame, not over the whole shape: as wide
                            // as the text box and as tall as its words. Words
                            // taller than the frame run past it as they do at
                            // rest (a bottom-anchored title grows upward):
                            // capped at the frame, the editor pulled a
                            // two-line title down into the box and scrolled
                            // it, so entering editing moved the words.
                            position: "relative",
                            inset: "auto",
                            width: "100%",
                            height: "auto",
                            flexShrink: 0,
                            overflow: "hidden",
                            margin: 0,
                            padding: 0,
                          }}
                        />
                        </div>
                      ) : !isPresentationCameoBlock(block) ? (
                        // A SmartArt shape, and a shape with No Fill, is hit
                        // by its geometry and its words
                        // (`presentationShapeGeometryHitClassName`).
                        // At rest its words are laid out by the text engine,
                        // as the thumbnails and the printed slide draw them.
                        <PresentationTextEngineSurfaceContext.Provider value={!isSelected}>
                          <ShapeTextOverlay
                            block={block}
                            hitText={presentationShapeHitsByGeometry(block)}
                          />
                        </PresentationTextEngineSurfaceContext.Provider>
                      ) : null}
                      {isSelected && isTextKeptReadOnly(block) ? (
                        // A placeholder whose words the import could not make
                        // editable (PPTX reading row 814): drawn as the file
                        // has it and kept unchanged; selecting it says so.
                        <div
                          role="note"
                          data-testid="presentation-text-kept-read-only"
                          style={{
                            position: "absolute",
                            left: 0,
                            top: "100%",
                            marginTop: 4,
                            zIndex: 4,
                            maxWidth: 360,
                            padding: "4px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            lineHeight: 1.4,
                            background: "var(--popover, #fff)",
                            color: "var(--popover-foreground, #222)",
                            border: "1px solid var(--border, #d0d0d0)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                            pointerEvents: "none",
                            whiteSpace: "normal",
                          }}
                        >
                          {t(isTextKeptReadOnlyTruncated(block) ? "presentation.textKeptReadOnlyTruncated" : "presentation.textKeptReadOnly")}
                        </div>
                      ) : null}
                      {richTypingCommitGuard}
                    </div>
  );
}
