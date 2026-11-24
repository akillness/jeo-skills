"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One text block as the edit canvas draws it (rich text body and the input
 * bridge).
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { PresentationTextEngineSurfaceContext } from "./PresentationEngineTextBody";
import { useAutofitMeasureVersion } from "../../../../lib/presentation/autofit-measure-store";
import { isTextBoxBlock } from "@mrnote/core/web/lib/presentation-slide-buttons.ts";
import { textBoxFillCss, resolveTextBoxFill, textBoxNativeGeometry } from "@mrnote/core/web/lib/presentation-text-fill.ts";
import { PresentationTextBoxGeometry } from "./PresentationTextBoxGeometry";
import { PresentationTextBoxEffectLayers, presentationTextBoxHostCss } from "./PresentationTextBoxEffects";
import { presentationTextBoxEffectsLook } from "../../../../lib/presentation-text-box-effects";
import type { PresentationTextBlock, PresentationBlock, PresentationTextBoxBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import {
  browserSpellcheckForTextBlock,
  mapOffsetThroughTextChange,
  guardPresentationPreviewInput,
  presentationPreviewAtomSpans,
  presentationPreviewLineEdge,
  presentationPreviewPlainText,
  presentationPreviewSelection,
  selectPresentationPreviewWordAtPress,
  setPresentationPreviewSelection,
  followPreviewTextPress,
} from "@mrnote/core/web/lib/presentation/text-selection.ts";
import { presentationDesktopShortcutFor } from "../../../../lib/presentation-desktop-shortcuts";
import { normalizeParagraphsWithRuns, type SlideParagraphWithRuns } from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import { resolvePresentationTextStyle } from "../../../../lib/presentation-text-style-resolve";
import { restoreTextareaSelectionAfterCommit, layoutPlaceholderPrompt, isEmptyContentPlaceholder } from "../../../../lib/presentation/text-editing-host";
import { paragraphIndexAtOffset } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import {
  textStyleWithUniformIndent,
  textBlockStyleCss,
  withAutofitFontSize,
  autofitRenderForBlock,
  shapeTextPaintCss,
  textBlockDrawsInsets,
  importedPptxTextOverflow,
  needsStructuredParagraphRender,
  textBlockOverflowWrap,
  textBlockWraps,
  textBlockTabSizeCss,
  textBlockLineBreakCss,
  type PresentationFontSizeUnit,
} from "../../../../lib/presentation/text-layout-css";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import {
  Image as ImageIcon,
  ChartNoAxesCombined,
  Table2,
  Film,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { presentationSmartArtLabelLineHeight, presentationTextVisualLayout, PresentationTextVisualContents } from "./PresentationTextVisual";
import { useRichTextSelectionFollower } from "./useRichTextSelectionFollower";
import { PresentationTypingTextarea } from "./PresentationTypingTextarea";
import { inputIsLetterInPlace, usePresentationRichTypingKey } from "./usePresentationRichTypingKey";
import { browserReplacement } from "../../../../lib/presentation/collab-caret";
import { isTextEditLocked, isTextKeptReadOnly, isTextKeptReadOnlyTruncated } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { useCallback, useId, useLayoutEffect, useRef } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  FormEvent as ReactFormEvent,
  CompositionEvent as ReactCompositionEvent,
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  ChangeEvent,
  Dispatch,
  KeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";
import { normalizeColumnCount, anchorCssForColumns } from "@mrnote/core/web/lib/presentation-text-columns.ts";
import { balanceOverflowingColumns } from "../../../../lib/presentation/text-columns-overflow";
import { verticalAnchorWrapperCss, readVerticalAnchor } from "@mrnote/core/web/lib/presentation-vertical-anchor.ts";
import { readSpacingFromStyle } from "@mrnote/core/web/lib/presentation-line-spacing.ts";
import { textBodyRotationCss } from "@mrnote/core/web/lib/presentation-shape-text-rect.ts";
import { hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { presentationEquationBoxSpan } from "../../../../lib/presentation-equation-buttons";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { OfficeFontFace } from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import type { PresentationFontRequirement } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import { OFFICE_TEXT_PAINT_HIDDEN_CSS } from "@mrnote/core/web/lib/office-text-paint.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { TextEditSelection } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import type { RunStyle, ToggleableRunStyleKey } from "@mrnote/core/web/lib/presentation-runs.ts";
import { keepRemoteCaret } from "../../../../lib/presentation/remote-caret-hold";

/**
 * PowerPoint: Esc while typing in a box selects the box itself, so the arrows
 * then move it and Delete removes it. The keyboard goes to the object's own
 * frame, which owns those keys; the text it held stays as typed. F2 does the
 * same: it toggles between the words and the object (PowerPoint for the
 * web's "F2: end text editing"), so the F2 that put the caret in the box
 * also takes it out (PPT-B421).
 */
function escapeTextToObject(event: ReactKeyboardEvent<HTMLElement>): boolean {
  const exits =
    event.key === "Escape" ||
    (event.key === "F2" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey);
  if (!exits || event.nativeEvent.isComposing || event.defaultPrevented) return false;
  const frame = event.currentTarget.closest<HTMLElement>("[data-block-id]");
  if (!frame || frame === event.currentTarget) return false;
  event.preventDefault();
  event.stopPropagation();
  frame.focus({ preventScroll: true });
  return true;
}

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCanvasTextBlockCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  theme: DeckTheme | undefined;
  masters: SlideMaster[];
  findRevealRef: RefObject<{ target: string; start: number; end: number; } | null>;
  textSelectionRef: RefObject<{ blockId: string; start: number; end: number; } | null>;
  setTextSelectionSnapshot: Dispatch<SetStateAction<{ blockId: string; start: number; end: number; } | null>>;
  textSelectionIntentRef: RefObject<number>;
  deckContentGenerationRef: RefObject<number>;
  fontDisplay: { aliases: Record<string, string>; faces: OfficeFontFace[]; unavailable: boolean; revision: number; requirements: PresentationFontRequirement[]; verifiedVersion: number | undefined; layoutUpdateRequired: boolean | undefined; refreshBindings: () => void; };
  activeSlide: SlideModel;
  activeSlideBounds: { width: number; height: number; };
  undo: () => void;
  redo: () => void;
  showProofingErrors: boolean;
  deleteBlock: (blockId: string) => void;
  captureTextEditSelection: (blockId: string, start: number, end: number) => void;
  consumeTextEditSelection: (blockId: string) => TextEditSelection | undefined;
  updateTextBlock: (blockId: string, text: string, editSelection?: TextEditSelection, insertedLineBreaksAreSoft?: boolean) => void;
  composingTextRef: RefObject<boolean>;
  composingImportedPreviewRef: RefObject<boolean>;
  handleTextBlockBodyChange: (blockId: string, event: ChangeEvent<HTMLTextAreaElement>) => void;
  captureImportedRichTextSelection: (blockId: string, textLength: number, preview: HTMLElement, paragraphs?: readonly SlideParagraphWithRuns[]) => void;
  /** Record the preview's selection as the browser changed it (no new intent). */
  followImportedRichTextSelection: (blockId: string, preview: HTMLElement) => void;
  restoreImportedPreviewSelectionAfterCommit: (blockId: string, start: number, end: number) => void;
  /** The caret a local commit is putting back in this block, if one is. */
  pendingImportedPreviewCaret: (blockId: string) => { start: number; end: number } | null;
  /** The words of a body the window's typing burst holds and has not drawn, else null. */
  heldBlockWords: (blockId: string) => string | null;
  commitImportedPreviewText: (blockId: string, preview: HTMLElement, paragraphs?: readonly SlideParagraphWithRuns[], letterTyped?: boolean,
    replacement?: string | null) => void;
  replaceImportedPreviewSelection: (blockId: string, preview: HTMLElement, insertedText: string, paragraphs?: readonly SlideParagraphWithRuns[], softLineBreaks?: boolean) => number;
  clearLiveRibbonList: () => boolean;
  pasteIntoImportedPreview: (blockId: string, preview: HTMLElement, clipboard: DataTransfer, paragraphs?: readonly SlideParagraphWithRuns[]) => void;
  copyFromImportedPreview: (blockId: string, preview: HTMLElement, clipboard: DataTransfer, paragraphs?: readonly SlideParagraphWithRuns[]) => boolean;
  adjustParagraphCaretLevel: (blockId: string, caret: number, delta: number, selectionEnd?: number) => boolean;
  applyTextBlockRunToggle: (blockId: string, key: ToggleableRunStyleKey) => void;
  runStyleAtBodySelection: (block: PresentationBlock, selection: { blockId: string; start: number; end: number; } | null) => { fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; underlineStyle?: RunStyle["underlineStyle"]; strike?: boolean; caps?: "all" | "small"; color?: string; superscript?: boolean; subscript?: boolean; highlight?: string; textOutline?: string; href?: string; proofingLanguage?: string; noProof?: boolean; linkTooltip?: string; } | null;
  blockAriaName: (block: PresentationBlock) => string;
  handleFindRevealedKey: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, target: string) => boolean;
  fillContentPlaceholder: (placeholderId: string, kind: "image" | "chart" | "table" | "media") => void;
  block: PresentationTextBlock | PresentationTextBoxBlock;
  /**
   * The box's words as drawn while an equation is written in them (the
   * equation's place in its line, `presentationEquationSlot`): drawn only,
   * never typed in or saved -- the box's own words stay `block`'s.
   */
  previewBlock?: PresentationTextBlock | PresentationTextBoxBlock;
  isSelected: boolean;
  fontSizeUnit: PresentationFontSizeUnit;
  importedPptxText: boolean;
  importedTextHasPreview: boolean;
  importedTextInsets: CSSProperties;
}

/**
 * The selected rich preview is keyed by its text, so every change of the
 * text mounts a new host -- another person's typing included. A local commit
 * puts the caret back itself; a remote one removed the focused host and left
 * focus on <body>, so the next keystroke went nowhere and two people typing
 * in one text box kept a character each. The host that holds focus hands its
 * caret to its replacement as it is mounted, mapped through the text change.
 */
/**
 * A caret a click or an arrow put in a paragraph's bullet or number (a mark
 * that is not editable) goes to that paragraph's words (backward: the end of
 * the paragraph before). Left in the mark, a typed key inserted nothing and
 * Select All took the whole page.
 */
function caretOutOfParagraphMarker(preview: HTMLElement, backward = false): void {
  const doc = preview.ownerDocument;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
  const anchor = selection.anchorNode;
  const anchorElement = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
  const mark = anchorElement?.closest?.('[contenteditable="false"]');
  if (!mark || mark === preview || !preview.contains(mark)) return;
  const paragraph = mark.closest('[data-testid="presentation-paragraph"]') ?? mark.parentElement;
  if (!paragraph || !preview.contains(paragraph)) return;
  const words = (root: Element, last: boolean): Text | null => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let found: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest('[contenteditable="false"]')) {
        found = node as Text;
        if (!last) break;
      }
    }
    return found;
  };
  let target: Text | null = null;
  let offset = 0;
  if (backward) {
    const previous = paragraph.previousElementSibling;
    target = previous && preview.contains(previous) ? words(previous, true) : null;
    offset = target?.length ?? 0;
  }
  if (!target) {
    target = words(paragraph, false);
    offset = 0;
  }
  if (!target) return;
  const range = doc.createRange();
  range.setStart(target, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function useRichPreviewFocusHandover(
  blockId: string,
  restoreAfterCommit: (blockId: string, start: number, end: number) => void,
  /**
   * The caret this person's own commit is putting back, if one is: it wins
   * over the old caret mapped through the text change. Mapped, a caret where
   * the model inserted text (Enter's line break, a Tab, a paste) stays in
   * front of it, so Enter left the caret on the old line.
   */
  pendingLocalCaret: (blockId: string) => { start: number; end: number } | null,
): { ref: (node: HTMLDivElement | null) => void; host: () => HTMLDivElement | null } {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handoverRef = useRef<{ text: string; start: number; end: number } | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    // Backspace in an empty title took its row: the caret fell to the top.
    guardPresentationPreviewInput(node);
    if (node === null) {
      const previous = hostRef.current;
      hostRef.current = null;
      // Detached before it is removed: it still holds focus if it had it.
      if (previous?.isConnected && previous.contains(previous.ownerDocument.activeElement)) {
        const text = presentationPreviewPlainText(previous);
        const range = presentationPreviewSelection(previous, text.length) ?? { start: text.length, end: text.length };
        handoverRef.current = { text, ...range };
      }
      return;
    }
    hostRef.current = node;
    const handover = handoverRef.current;
    handoverRef.current = null;
    if (!handover) return;
    const active = node.ownerDocument.activeElement;
    // Focus that went somewhere on purpose stays there.
    if (active && active !== node.ownerDocument.body && !node.contains(active)) return;
    const local = pendingLocalCaret(blockId);
    if (local) {
      // This person's commit remounted the body: its caret is the one the
      // commit restores on the next frame, shown at once.
      node.focus({ preventScroll: true });
      setPresentationPreviewSelection(node, local.start, local.end);
      return;
    }
    const text = presentationPreviewPlainText(node);
    const start = mapOffsetThroughTextChange(handover.text, text, handover.start);
    const end = mapOffsetThroughTextChange(handover.text, text, handover.end);
    node.focus({ preventScroll: true });
    setPresentationPreviewSelection(node, start, end);
    restoreAfterCommit(blockId, start, end);
  }, [blockId, pendingLocalCaret, restoreAfterCommit]);
  const host = useCallback(() => hostRef.current, []);
  return { ref, host };
}

/**
 * An empty box read as if its first row held `words`: the prompt, drawn where
 * the typed words will be, and the empty row the caret is put in take their
 * row's formatting (its own first paragraph's, else the layout's) from it.
 */
function emptyPlaceholderPromptBlock(block: PresentationTextBlock, words: string): PresentationTextBlock {
  const own = (block as { paragraphs?: unknown }).paragraphs;
  const prompt = {
    ...block,
    text: words,
    runs: undefined,
    ...(Array.isArray(own) && own.length > 0 && own[0] && typeof own[0] === "object"
      ? { paragraphs: [{ ...(own[0] as Record<string, unknown>), text: words, runs: undefined }] }
      : {}),
  } as PresentationTextBlock;
  return smartArtPromptFitted(prompt, words);
}

/**
 * An empty SmartArt shape's `[Text]` prompt on one line inside its shape. The
 * layout sizes an empty shape's words for no words (the largest size its
 * rules allow), and drawn at that size the prompt broke inside the word
 * ("[文" over "本]") and was cut off by the shape. PowerPoint shows the
 * prompt whole; it is the editor's drawing only, never the slide's words.
 */
function smartArtPromptFitted(block: PresentationTextBlock, words: string): PresentationTextBlock {
  const record = block as unknown as Record<string, unknown>;
  const style = (record.style ?? {}) as Record<string, unknown>;
  const size = style.fontSize;
  const width = record.width;
  const height = record.height;
  if (
    record.smartArtRole !== "label" ||
    typeof size !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !(width > 0) ||
    !(height > 0)
  ) {
    return block;
  }
  // The prompt's width in ems: an ideograph is one, anything else about half.
  const ems = [...words].reduce((sum, ch) => sum + (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 1 : 0.56), 0);
  const fit = Math.min((width / 12700) * 0.86 / Math.max(1, ems), (height / 12700) * 0.8 / 1.2);
  if (!(fit < size)) return block;
  const fitted = Math.max(1, Math.floor(fit * 2) / 2);
  const paragraphs = (record.paragraphs as Record<string, unknown>[] | undefined)?.map((paragraph) => {
    const own = paragraph.style as Record<string, unknown> | undefined;
    return own && typeof own.fontSize === "number" ? { ...paragraph, style: { ...own, fontSize: fitted } } : paragraph;
  });
  return {
    ...block,
    style: { ...style, fontSize: fitted },
    ...(paragraphs ? { paragraphs } : {}),
  } as unknown as PresentationTextBlock;
}

export function PresentationCanvasTextBlock({ ctl }: { ctl: PresentationCanvasTextBlockCtl }) {
  // Shrink text on overflow measured on the slide's drawing: draw again when it lands.
  useAutofitMeasureVersion();
  const {
    t,
    theme,
    masters,
    findRevealRef,
    textSelectionRef,
    setTextSelectionSnapshot,
    textSelectionIntentRef,
    deckContentGenerationRef,
    fontDisplay,
    activeSlide,
    activeSlideBounds,
    undo,
    redo,
    showProofingErrors,
    deleteBlock,
    captureTextEditSelection,
    consumeTextEditSelection,
    updateTextBlock,
    composingTextRef,
    composingImportedPreviewRef,
    handleTextBlockBodyChange,
    captureImportedRichTextSelection,
    followImportedRichTextSelection,
    restoreImportedPreviewSelectionAfterCommit,
    pendingImportedPreviewCaret,
    heldBlockWords,
    commitImportedPreviewText,
    replaceImportedPreviewSelection,
    clearLiveRibbonList,
    pasteIntoImportedPreview,
    copyFromImportedPreview,
    adjustParagraphCaretLevel,
    applyTextBlockRunToggle,
    runStyleAtBodySelection,
    blockAriaName,
    handleFindRevealedKey,
    fillContentPlaceholder,
    block,
    previewBlock,
    isSelected,
    fontSizeUnit,
    importedPptxText,
    importedTextHasPreview,
    importedTextInsets,
  } = ctl;
  const richPreviewHost = useRichPreviewFocusHandover(
    block.id,
    restoreImportedPreviewSelectionAfterCommit,
    pendingImportedPreviewCaret,
  );
  // A typed or deleted range the browser would edit across the drawn rows is
  // the model's (`presentationPreviewStructuralEdit`): written over the same
  // words through the box's own replace, so the rows are never read back
  
  const previewWriterRef = useRef<(host: HTMLElement, inserted: string) => void>(() => undefined);
  useLayoutEffect(() => {
    previewWriterRef.current = (host, inserted) => {
      if (!importedTextHasPreview || isTextEditLocked(block)) return;
      replaceImportedPreviewSelection(block.id, host, inserted);
    };
  });
  const handoverRef = richPreviewHost.ref;
  const richPreviewHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      handoverRef(node);
      guardPresentationPreviewInput(node, (host, inserted) => previewWriterRef.current(host, inserted));
    },
    [handoverRef],
  );
  // contentEditable lets the browser mutate descendants before React sees
  // the input: the selected host keeps its key while its words change, the
  // browser's own edits put back before React draws the words
  // (`usePresentationRichTypingKey`, its commit guard rendered below).
  const { key: richTypingKey, commitGuard: richTypingCommitGuard } = usePresentationRichTypingKey({
    blockId: block.id,
    text: ((previewBlock ?? block) as PresentationTextBlock).text,
    enabled: importedTextHasPreview && isSelected,
    host: richPreviewHost.host,
    pendingCaret: pendingImportedPreviewCaret,
    heldWords: heldBlockWords,
  });
  // The words being typed in their drawn body: their selection is followed
  // however it was made (a drag released past the box's edge included), so
  // Home formats the highlighted words.
  const richPreviewEditable =
    isSelected && importedTextHasPreview && !isTextEditLocked(block) && !previewBlock;
  useRichTextSelectionFollower(
    richPreviewHost.host,
    (host) => followImportedRichTextSelection(block.id, host),
    richPreviewEditable,
  );
  // An equation box (PowerPoint's Insert > Equation with nothing selected):
  // its text is one display equation, edited in the equation editor a press
  // on it opens. Its textarea holds only the characters the equation draws,
  // so typing there would break the equation into loose letters; it takes no
  // typing, and Delete or Backspace removes the box whole, as PowerPoint
  // deletes a selected equation box.
  const equationBox = presentationEquationBoxSpan(block) !== null;
  // Format Shape > Effects on the box (a text box is a shape): drawn on the
  // box, its words lying flat while they are typed into, as PowerPoint edits
  // them (`lib/presentation-text-box-effects`).
  const effectsFilterId = `presentation-textbox-effects-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boxFill = resolveTextBoxFill(block as PresentationTextBlock);
  const boxGeometry = textBoxNativeGeometry(block) !== null;
  const boxFrameCss = textBoxFillCss(boxFill, { onGeometry: boxGeometry });
  const boxEffects = presentationTextBoxEffectsLook(block, {
    filterUrl: `url(#${effectsFilterId})`,
    hasFrame: boxFill.hasBox,
    editing: isSelected,
  });
  return (
                    // At rest the box's words are laid out by the text engine,
                    // as the thumbnails and the printed slide draw them
                    // (`PresentationEngineTextBody`); selected, they are the
                    // editing host's own rows.
                    <PresentationTextEngineSurfaceContext.Provider value={!isSelected}>
                    <div
                      className={
                        isTextBoxBlock(block)
                          ? "presentation-window__text-block presentation-window__textbox-block"
                          : "presentation-window__text-block"
                      }
                      data-testid={
                        isTextBoxBlock(block)
                          ? "presentation-textbox-block"
                          : undefined
                      }
                      // Words drawn turned in 3-D: a host hit-tested where they
                      // are drawn finds them here (`data-hit-where-drawn`).
                      data-words-turned={boxEffects?.hostTurn ? "" : undefined}
                      // The text-box FILL / OUTLINE shows through in the editor so
                      // the author sees the background + border they applied. An
                      // un-styled block adds nothing (byte-stable render).
                      style={{
                        ...presentationTextBoxHostCss(boxEffects, boxFrameCss),
                        ...(boxEffects?.hostTurn
                          ? { transform: boxEffects.hostTurn, transformStyle: "preserve-3d" }
                          : {}),
                        ...(boxGeometry || boxEffects?.frameLayer ? { position: "relative" } : {}),
                        ...(importedPptxText
                          ? {
                              position: "relative",
                              height: "100%",
                              minHeight: 0,
                              // DrawingML's own default is `overflow`: words
                              // past the frame show, as the show draws them;
                              // only a stated clip / ellipsis cuts them
                              
                              // in half here and whole in the show).
                              overflow: importedPptxTextOverflow(block),
                            }
                          : {}),
                      }}
                    >
                      <PresentationTextBoxEffectLayers
                        look={boxEffects}
                        filterId={effectsFilterId}
                        frameCss={boxFrameCss}
                      >
                        <PresentationTextBoxGeometry block={block} fill={boxFill} />
                      </PresentationTextBoxEffectLayers>
                      <PresentationTypingTextarea
                        // After each commit of this box: a collaborator's
                        // delivery's caret, if this commit rewrote the words
                        // under it (lib/presentation/remote-caret-hold).
                        ref={(element) => { keepRemoteCaret(element, block.id, { composing: composingTextRef.current }); }}
                        value={(block as PresentationTextBlock).text}
                        readOnly={equationBox || undefined}
                        data-equation-box={equationBox ? "true" : undefined}
                        onPointerDown={(event) => {
                          textSelectionIntentRef.current += 1;
                          findRevealRef.current = null;
                          // Under a drawn preview the press is answered from
                          
                          if (!importedTextHasPreview) return;
                          const field = event.currentTarget;
                          const preview = () =>
                            field
                              .closest("[data-block-id]")
                              ?.querySelector<HTMLElement>(".presentation-window__paragraph-preview") ?? null;
                          followPreviewTextPress(field, preview, event.nativeEvent, (start, end) => {
                            textSelectionRef.current = { blockId: block.id, start, end };
                            setTextSelectionSnapshot({ blockId: block.id, start, end });
                            restoreImportedPreviewSelectionAfterCommit(block.id, start, end);
                          }, (start, end) => {
                            // With the press's own render (it selected the
                            // box); a release in place then changes nothing.
                            textSelectionRef.current = { blockId: block.id, start, end };
                            setTextSelectionSnapshot({ blockId: block.id, start, end });
                          });
                        }}
                        // Under drawn words the bridge's own text is laid out
                        // as it is not drawn (from the top, an equation as its
                        // characters): the browser's spelling marks for it
                        // showed above the line. The drawn words check their
                        // own spelling while they are typed in.
                        spellCheck={
                          showProofingErrors &&
                          !importedTextHasPreview &&
                          browserSpellcheckForTextBlock(
                            block as PresentationTextBlock,
                          ).spellCheck
                        }
                        lang={
                          browserSpellcheckForTextBlock(
                            block as PresentationTextBlock,
                          ).lang
                        }
                        onBeforeInput={(event) => {
                          const el = event.currentTarget;
                          captureTextEditSelection(
                            block.id,
                            el.selectionStart ?? 0,
                            el.selectionEnd ?? 0,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (
                            equationBox &&
                            (event.key === "Delete" || event.key === "Backspace") &&
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.altKey
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            if (isTextEditLocked(block)) return;
                            // Keys stay on the slide once the box is gone.
                            const canvas = event.currentTarget.closest<HTMLElement>(
                              ".presentation-window__slide",
                            );
                            deleteBlock(block.id);
                            requestAnimationFrame(() => canvas?.focus());
                            return;
                          }
                          if (handleFindRevealedKey(event, block.id)) return;
                          if (escapeTextToObject(event)) return;
                          // A SmartArt shape selected as an object holds its
                          // words here, every one selected, so a typed key
                          // replaces them; Enter edits them instead (Office:
                          // "Edit text in the selected shape: Enter or F2"):
                          // the caret goes after the words, in the body that
                          // draws them. Enter replaced the words with an
                          // empty paragraph.
                          if (
                            importedTextHasPreview &&
                            (block as Record<string, unknown>).smartArtRole === "label" &&
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.altKey &&
                            !event.nativeEvent.isComposing &&
                            !composingTextRef.current
                          ) {
                            const words = event.currentTarget;
                            const length = words.value.length;
                            if (length > 0 && words.selectionStart === 0 && words.selectionEnd === length) {
                              event.preventDefault();
                              event.stopPropagation();
                              restoreImportedPreviewSelectionAfterCommit(block.id, length, length);
                              return;
                            }
                          }
                          textSelectionIntentRef.current += 1;
                          const el = event.currentTarget;
                          captureTextEditSelection(
                            block.id,
                            el.selectionStart ?? 0,
                            el.selectionEnd ?? 0,
                          );
                          // Shift+Enter is a line break inside the paragraph
                          // (PowerPoint's `a:br`): a list item continues on
                          // the next line without a second bullet
                          // (PPT-B041). Enter still starts a new paragraph.
                          if (
                            event.key === "Enter" &&
                            event.shiftKey &&
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.altKey &&
                            !event.nativeEvent.isComposing &&
                            !composingTextRef.current &&
                            normalizeParagraphsWithRuns(
                              (block as PresentationTextBlock).paragraphs,
                            )
                          ) {
                            event.preventDefault();
                            const start = el.selectionStart ?? el.value.length;
                            const end = el.selectionEnd ?? start;
                            updateTextBlock(
                              block.id,
                              `${el.value.slice(0, start)}\n${el.value.slice(end)}`,
                              consumeTextEditSelection(block.id) ?? { start, end },
                              true,
                            );
                            const caret = start + 1;
                            const intent = ++textSelectionIntentRef.current;
                            const generation = deckContentGenerationRef.current;
                            restoreTextareaSelectionAfterCommit(
                              el,
                              caret,
                              caret,
                              undefined,
                              () =>
                                textSelectionIntentRef.current === intent &&
                                deckContentGenerationRef.current === generation,
                            );
                            return;
                          }
                          // Backspace at the start of a list item takes its
                          // bullet away first, as PowerPoint does ("press Enter
                          // and then press Backspace to erase the bullet or
                          // number", Microsoft Support): the empty item an
                          // Enter left becomes plain text and the list ends
                          // there (PPT-B174). Another Backspace joins the lines.
                          if (
                            event.key === "Backspace" &&
                            !event.shiftKey &&
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.altKey &&
                            !event.nativeEvent.isComposing &&
                            !composingTextRef.current &&
                            el.selectionStart === el.selectionEnd
                          ) {
                            const paragraphs = normalizeParagraphsWithRuns(
                              (block as PresentationTextBlock).paragraphs,
                            );
                            const caret = el.selectionStart ?? 0;
                            if (paragraphs) {
                              const index = paragraphIndexAtOffset(paragraphs, caret);
                              const start = paragraphs
                                .slice(0, index)
                                .reduce((sum, paragraph) => sum + paragraph.text.length + 1, 0);
                              const bullet = paragraphs[index]?.bullet;
                              if (caret === start && bullet && bullet !== "none") {
                                event.preventDefault();
                                clearLiveRibbonList();
                              }
                            }
                          }
                        }}
                        onPaste={(event) => {
                          const el = event.currentTarget;
                          captureTextEditSelection(
                            block.id,
                            el.selectionStart ?? 0,
                            el.selectionEnd ?? 0,
                          );
                        }}
                        onCut={(event) => {
                          const el = event.currentTarget;
                          captureTextEditSelection(
                            block.id,
                            el.selectionStart ?? 0,
                            el.selectionEnd ?? 0,
                          );
                        }}
                        onChange={(event) =>
                          handleTextBlockBodyChange(block.id, event)
                        }
                        onFocus={(event) => {
                          if (!importedTextHasPreview || composingTextRef.current) return;
                          // An empty box's caret is drawn in its body's empty
                          // row (after the bullet, at the anchor): the bridge
                          // paints no caret, and a Chinese IME's letters typed
                          // into it would not be seen.
                          if ((block as PresentationTextBlock).text === "") {
                            restoreImportedPreviewSelectionAfterCommit(block.id, 0, 0);
                            return;
                          }
                          // A caret left here (Enter / F2 on the selected box)
                          // is the visible body's too, for the same reason:
                          // read once the focus has settled, so a selection
                          // set right after the focus (a found match, the
                          // selected object's words, which a typed key
                          // replaces before the body takes the caret in
                          // `handleTextBlockBodyChange`) stays where it is.
                          const el = event.currentTarget;
                          const intent = textSelectionIntentRef.current;
                          requestAnimationFrame(() => {
                            if (
                              el.ownerDocument.activeElement !== el ||
                              composingTextRef.current ||
                              // A newer press or edit owns the caret.
                              textSelectionIntentRef.current !== intent
                            ) {
                              return;
                            }
                            const start = el.selectionStart ?? el.value.length;
                            const end = el.selectionEnd ?? start;
                            if (start === end) {
                              restoreImportedPreviewSelectionAfterCommit(block.id, start, end);
                            }
                          });
                        }}
                        onCompositionStart={() => {
                          composingTextRef.current = true;
                        }}
                        onCompositionEnd={(event) => {
                          composingTextRef.current = false;
                          // The final composed text arrives with this event in
                          // some browsers without a following `change`, so commit
                          // it here too; `updateTextBlock` is idempotent.
                          handleTextBlockBodyChange(block.id, event as never);
                        }}
                        onKeyUp={(event) => {
                          // A caret moved by the keyboard (arrows, Home/End,
                          // word jumps) raises no `select` event in Chrome or
                          // Safari, so the Ribbon acted on where the typing
                          // ended: Insert > Equation landed at the end of the
                          // line (PPT-A052 acceptance 公式-1). Nor does React
                          // raise `onSelect` for a keyboard selection while it
                          // believes a mouse button is down -- after Insert >
                          // Text Box, which runs on mouse-down and re-renders
                          // the ribbon so the mouse-up lands on a disabled
                          // control, Shift+Home in the new box left a caret and
                          // Ctrl+K opened with no Text to Display (L19-1).
                          // Record it here.
                          if (composingTextRef.current) return;
                          const el = event.currentTarget;
                          const start = el.selectionStart ?? 0;
                          const end = el.selectionEnd ?? start;
                          const known = textSelectionRef.current;
                          if (known?.blockId === block.id && known.start === start && known.end === end) return;
                          textSelectionRef.current = { blockId: block.id, start, end };
                          setTextSelectionSnapshot({ blockId: block.id, start, end });
                        }}
                        onSelect={(event) => {
                          // Capture the live selection so the per-run format
                          // buttons can split + restyle exactly the highlighted
                          // sub-range. A collapsed selection (start === end) means
                          // "format the whole block".
                          const el = event.currentTarget;
                          textSelectionRef.current = {
                            blockId: block.id,
                            start: el.selectionStart ?? 0,
                            end: el.selectionEnd ?? 0,
                          };
                          setTextSelectionSnapshot({
                            blockId: block.id,
                            start: el.selectionStart ?? 0,
                            end: el.selectionEnd ?? 0,
                          });
                        }}
                        onMouseUp={(event) => {
                          if (!importedTextHasPreview) {
                            // A click that only places the caret raises no
                            // `select` event either; the Ribbon reads this.
                            const el = event.currentTarget;
                            const start = el.selectionStart ?? 0;
                            const end = el.selectionEnd ?? start;
                            textSelectionRef.current = { blockId: block.id, start, end };
                            setTextSelectionSnapshot({ blockId: block.id, start, end });
                            return;
                          }
                          const start = event.currentTarget.selectionStart ?? 0;
                          const end = event.currentTarget.selectionEnd ?? start;
                          // The first press can reach this legacy layer before
                          // selection raises the rich preview. Transfer its model
                          // offset on the next frame so the visible editor owns
                          // the caret after one click.
                          restoreImportedPreviewSelectionAfterCommit(
                            block.id,
                            start,
                            end,
                          );
                        }}
                        placeholder={layoutPlaceholderPrompt(block, t)}
                        // Under a mounted preview this textarea is a
                        // transparent input bridge; the stylesheet hides its
                        // own selection band (presentation-window-shell).
                        data-rich-bridge={importedTextHasPreview ? "true" : undefined}
                        data-testid={
                          isTextBoxBlock(block)
                            ? "presentation-textbox-body"
                            : "presentation-slide-body"
                        }
                        style={(() => {
                          // Bold / italic / underline are applied as RUN styles,
                          // but the body is a plain <textarea> whose CSS came only
                          // from the block-level style — so pressing Bold lit the
                          // ribbon button and left the text at weight 400. Nothing
                          // was lost (the run carried it, and it exported), but the
                          // editor showed none of it.
                          //
                          // Reading the run style across the WHOLE block gives the
                          // textarea the formatting whenever it is uniform, which
                          // is what "select nothing and press Bold" produces. A
                          // block with genuinely mixed runs still cannot be shown
                          // in one textarea; that is a known limit of this editing
                          // surface, and `runFieldAtSelection` returns undefined
                          // there rather than picking a winner.
                          const wholeBlockRuns = runStyleAtBodySelection(block, {
                            blockId: block.id,
                            start: 0,
                            end: (block as PresentationTextBlock).text.length,
                          });
                          const blockStyle = {
                            ...(textStyleWithUniformIndent(block as PresentationTextBlock) ?? {}),
                          } as Record<string, unknown>;
                          for (const [key, value] of Object.entries(
                            wholeBlockRuns ?? {},
                          )) {
                            // Only a value the whole block agrees on; `undefined`
                            // means "mixed", and must not erase the block style.
                            if (value !== undefined) blockStyle[key] = value;
                          }
                          // AUTOFIT: shrink the body font to fit when the block is
                          // in `shrink` mode + overflows (byte-stable otherwise).
                          const styled = textBlockStyleCss(
                            blockStyle as PresentationTextBlock["style"],
                            resolvePresentationTextStyle(
                              activeSlide,
                              block,
                              masters,
                              theme,
                            ),
                            fontSizeUnit, fontDisplay.aliases,
                          );
                          // A SmartArt label's Chinese lines at PowerPoint's line, as its preview draws them.
                          const labelLine = presentationSmartArtLabelLineHeight(block, theme);
                          const base = labelLine === undefined ? styled : { ...styled, lineHeight: labelLine };
                          const rendered = {
                            ...withAutofitFontSize(
                              base,
                              autofitRenderForBlock(
                                block,
                                activeSlideBounds,
                                base.fontSize as number | undefined,
                                activeSlide.blocks,
                                { slide: activeSlide, masters, theme, fontAliases: fontDisplay.aliases },
                              ),
                              fontSizeUnit,
                            ),
                            // A SmartArt label's WordArt (PPT-A010).
                            ...shapeTextPaintCss(block),
                          };
                          if (!importedPptxText && !importedTextHasPreview) {
                            // An authored box's margins pad its text.
                            return textBlockDrawsInsets(block)
                              ? { ...rendered, ...importedTextInsets, boxSizing: "border-box" }
                              : rendered;
                          }
                          return {
                            ...rendered,
                            ...importedTextInsets,
                            position: "relative",
                            zIndex: importedTextHasPreview ? 2 : 0,
                            boxSizing: "border-box",
                            width: "100%",
                            height: "100%",
                            minHeight: 0,
                            margin: 0,
                            // The colour only: the WordArt above states
                            // `backgroundImage` / `backgroundClip` (a gradient
                            // clipped to the glyphs), which the `background`
                            // shorthand wiped while the box was edited -- and
                            // React warned when the shorthand left the style.
                            backgroundColor: "transparent",
                            border: "0 solid transparent",
                            borderRadius: 0,
                            boxShadow: "none",
                            outline: "none",
                            resize: "none",
                            overflow: "hidden",
                            // The bridge draws no words, the body does: none
                            // of the WordArt paint (fill, outline, shadow,
                            // reflection) may draw here, or the hidden words
                            // show as a second copy beside the typed ones. A
                            // flat textarea cannot share the preview's Office
                            // vertical anchor, so its caret must never paint
                            // behind the visible editing host either.
                            ...(importedTextHasPreview ? OFFICE_TEXT_PAINT_HIDDEN_CSS : {}),
                          };
                        })()}
                      />
                      {isEmptyContentPlaceholder(block) ? (
                        <div
                          className={
                            presentationChrome.contentPlaceholderActions
                          }
                          role="toolbar"
                          aria-label={t(
                            "presentation.layoutPlaceholder.content",
                          )}
                          data-testid="presentation-content-placeholder-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {(
                            [
                              [
                                "image",
                                ImageIcon,
                                t("presentation.addImageBlock"),
                              ],
                              [
                                "chart",
                                ChartNoAxesCombined,
                                t("presentation.addChartBlock"),
                              ],
                              [
                                "table",
                                Table2,
                                t("presentation.addTableBlock"),
                              ],
                              ["media", Film, t("presentation.addEmbedBlock")],
                            ] as const
                          ).map(([kind, Icon, label]) => (
                            <button
                              key={kind}
                              type="button"
                              title={label}
                              aria-label={label}
                              data-testid={`presentation-content-placeholder-${kind}`}
                              data-kind={kind}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() =>
                                fillContentPlaceholder(block.id, kind)
                              }
                            >
                              <Icon size={18} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {(() => {
                        // Non-editing preview: the textarea above edits raw lines
                        // (one line = one paragraph) but cannot show bullets/numbers,
                        // per-run formatting, OR a multi-column flow; this renders how
                        // the block will actually look. Shown when paragraphs carry a
                        // visible marker, the block carries per-run inline formatting
                        // (so the author sees the bold/colour/etc. they applied), OR
                        // the body flows across >1 column. A plain single-column flat
                        // block with no runs shows nothing extra (byte-stable).
                        const layout = presentationTextVisualLayout(previewBlock ?? block, activeSlideBounds, activeSlide, masters, theme, fontDisplay.aliases, { hostStyled: true });
                        const { paragraphs, flatRuns, paragraphTextStyles, columnsCss } = layout;
                        const browserSpellcheck = browserSpellcheckForTextBlock(
                          block as PresentationTextBlock,
                        );
                        // The selected host's key: its words, kept across a
                        // letter typed in place (usePresentationRichTypingKey).
                        const importedRichEditorKey = richTypingKey;
                        // Local previews also own native text selection. Without
                        // this marker the object's click handler focuses its
                        // border and collapses the user's highlighted list text.
                        const richPreviewSelectionProps =
                          isSelected
                            ? {
                                ref: richPreviewHostRef,
                                "data-selection-owner": "rich-preview",
                                // Not typed in while an equation is written in it.
                                contentEditable: importedTextHasPreview && !isTextEditLocked(block) && !previewBlock,
                                tabIndex: -1,
                                suppressContentEditableWarning: true,
                                spellCheck: showProofingErrors && browserSpellcheck.spellCheck,
                                ...(browserSpellcheck.lang
                                  ? { lang: browserSpellcheck.lang }
                                  : {}),
                                role: "textbox" as const,
                                "aria-readonly": isTextEditLocked(block),
                                "aria-label": blockAriaName(block),
                                "aria-multiline": true,
                                onPointerDown: (
                                  event: ReactPointerEvent<HTMLDivElement>,
                                ) => {
                                  textSelectionIntentRef.current += 1;
                                  event.stopPropagation();
                                },
                                onKeyUp: (
                                  event: ReactKeyboardEvent<HTMLDivElement>,
                                ) => {
                                  if (
                                    composingImportedPreviewRef.current ||
                                    !(
                                      [
                                        "ArrowLeft", "ArrowRight", "ArrowUp",
                                        "ArrowDown", "Home", "End",
                                      ].includes(event.key) ||
                                      ((event.metaKey || event.ctrlKey) &&
                                        event.key.toLowerCase() === "a")
                                    )
                                  ) {
                                    return;
                                  }
                                  caretOutOfParagraphMarker(
                                    event.currentTarget,
                                    event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "Home",
                                  );
                                  captureImportedRichTextSelection(
                                    block.id,
                                    (block as PresentationTextBlock).text.length,
                                    event.currentTarget,
                                    paragraphs,
                                  );
                                },
                                // A double- or triple-click selects the word
                                // or paragraph in the box's own words, never
                                // a paragraph's break or a drawn bullet.
                                onMouseDown: (
                                  event: ReactMouseEvent<HTMLDivElement>,
                                ) => {
                                  if (!importedTextHasPreview || isTextEditLocked(block)) return;
                                  if (!selectPresentationPreviewWordAtPress(event.currentTarget, event.nativeEvent, paragraphs)) return;
                                  event.stopPropagation();
                                  captureImportedRichTextSelection(
                                    block.id,
                                    (block as PresentationTextBlock).text.length,
                                    event.currentTarget,
                                    paragraphs,
                                  );
                                },
                                onMouseUp: (
                                  event: ReactMouseEvent<HTMLDivElement>,
                                ) => {
                                  event.stopPropagation();
                                  caretOutOfParagraphMarker(event.currentTarget);
                                  captureImportedRichTextSelection(
                                    block.id,
                                    (block as PresentationTextBlock).text.length,
                                    event.currentTarget,
                                    paragraphs,
                                  );
                                },
                                onBeforeInput: (
                                  event: ReactFormEvent<HTMLDivElement>,
                                ) => {
                                  // The browser's formatting and a delete
                                  // with no words to take are refused by the
                                  // host's native guard (`ref` above).
                                  const text = presentationPreviewPlainText(
                                    event.currentTarget,
                                  );
                                  const range = presentationPreviewSelection(
                                    event.currentTarget,
                                    text.length,
                                    paragraphs,
                                  );
                                  if (range) {
                                    captureTextEditSelection(
                                      block.id,
                                      range.start,
                                      range.end,
                                    );
                                  }
                                },
                                onInput: (
                                  event: ReactFormEvent<HTMLDivElement>,
                                ) => {
                                  if (
                                    !importedTextHasPreview || isTextEditLocked(block) ||
                                    composingImportedPreviewRef.current
                                  ) return;
                                  commitImportedPreviewText(
                                    block.id,
                                    event.currentTarget,
                                    paragraphs,
                                    inputIsLetterInPlace(event.nativeEvent),
                                    browserReplacement(event.nativeEvent),
                                  );
                                },
                                onCompositionStart: () => {
                                  composingImportedPreviewRef.current = true;
                                },
                                onCompositionEnd: (
                                  event: ReactCompositionEvent<HTMLDivElement>,
                                ) => {
                                  composingImportedPreviewRef.current = false;
                                  if (!importedTextHasPreview || isTextEditLocked(block)) return;
                                  commitImportedPreviewText(
                                    block.id,
                                    event.currentTarget,
                                    paragraphs,
                                  );
                                },
                                onKeyDown: (
                                  event: ReactKeyboardEvent<HTMLDivElement>,
                                ) => {
                                  if (escapeTextToObject(event)) return;
                                  // Ctrl/Cmd+K is the deck's: it reaches the
                                  // window's Insert Hyperlink with the words
                                  // selected here. This surface stops every
                                  // other key, and stopped this one too, so the
                                  // shortcut did nothing on a link the ribbon
                                  
                                  if (presentationDesktopShortcutFor(event) === "hyperlink") {
                                    captureImportedRichTextSelection(
                                      block.id,
                                      (block as PresentationTextBlock).text.length,
                                      event.currentTarget,
                                      paragraphs,
                                    );
                                    return;
                                  }
                                  textSelectionIntentRef.current += 1;
                                  event.stopPropagation();
                                  // Select All is this box's words: from a
                                  // caret the browser could not place in them
                                  // its own took the whole page.
                                  if (
                                    (event.metaKey || event.ctrlKey) &&
                                    !event.altKey &&
                                    !event.shiftKey &&
                                    event.key.toLowerCase() === "a"
                                  ) {
                                    event.preventDefault();
                                    // From its first character to its last, in
                                    // the words' own text: a range round the
                                    // whole body (its drawn bullets included)
                                    // was highlighted, but a typed key was put
                                    // after the last line instead of replacing
                                    
                                    const host = event.currentTarget;
                                    if (!setPresentationPreviewSelection(host, 0, presentationPreviewPlainText(host).length)) {
                                      const all = host.ownerDocument.createRange();
                                      all.selectNodeContents(host);
                                      const selection = host.ownerDocument.getSelection();
                                      selection?.removeAllRanges();
                                      selection?.addRange(all);
                                    }
                                    return;
                                  }
                                  // Home / End in a line with an equation: the
                                  // line's own edges (the browser's stopped
                                  // right after the equation).
                                  if (
                                    (event.key === "Home" || event.key === "End") &&
                                    !event.metaKey && !event.ctrlKey && !event.altKey &&
                                    !event.nativeEvent.isComposing &&
                                    event.currentTarget.querySelector("[data-presentation-math]")
                                  ) {
                                    const host = event.currentTarget;
                                    const length = presentationPreviewPlainText(host).length;
                                    const current = presentationPreviewSelection(host, length, paragraphs);
                                    if (current) {
                                      const from = event.key === "Home" ? current.start : current.end;
                                      const target = presentationPreviewLineEdge(host, from, event.key === "Home" ? "start" : "end");
                                      if (target !== null) {
                                        event.preventDefault();
                                        if (event.shiftKey) {
                                          setPresentationPreviewSelection(
                                            host,
                                            event.key === "Home" ? target : current.start,
                                            event.key === "Home" ? current.end : target,
                                          );
                                        } else {
                                          setPresentationPreviewSelection(host, target, target);
                                        }
                                        return;
                                      }
                                    }
                                  }
                                  // Left / Right step over an equation whole,
                                  // its caret anchor included.
                                  if (
                                    (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                                    !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
                                    !event.nativeEvent.isComposing &&
                                    event.currentTarget.querySelector("[data-presentation-math]")
                                  ) {
                                    const host = event.currentTarget;
                                    const current = presentationPreviewSelection(host, presentationPreviewPlainText(host).length, paragraphs);
                                    if (current && current.start === current.end) {
                                      const span = presentationPreviewAtomSpans(host).find((candidate) =>
                                        event.key === "ArrowLeft" ? candidate.end === current.start : candidate.start === current.start,
                                      );
                                      if (span) {
                                        event.preventDefault();
                                        const target = event.key === "ArrowLeft" ? span.start : span.end;
                                        setPresentationPreviewSelection(host, target, target);
                                        return;
                                      }
                                    }
                                  }
                                  // This surface stops every key, so the
                                  // deck's Undo / Redo listener on the window
                                  // never heard the shortcut (PPT-B261).
                                  if (
                                    (event.metaKey || event.ctrlKey) &&
                                    !event.altKey &&
                                    !event.nativeEvent.isComposing
                                  ) {
                                    const key = event.key.toLowerCase();
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
                                  }
                                  if (!importedTextHasPreview || isTextEditLocked(block)) return;
                                  // Ctrl/Cmd+B / I / U: the browser's own
                                  // contentEditable command would restyle only
                                  // the DOM (an <i> the model never sees, gone
                                  // on the next render). Run the Ribbon's
                                  // writer over the live range instead, so the
                                  // keys save and undo like the buttons do.
                                  // Ctrl/Cmd+= and Ctrl/Cmd+Shift+= (Ctrl/Cmd++)
                                  // are subscript and superscript while words
                                  // are edited (PowerPoint); outside the words
                                  // the same keys zoom the slide.
                                  const scriptKey =
                                    (event.metaKey || event.ctrlKey) &&
                                    !event.altKey &&
                                    !event.nativeEvent.isComposing &&
                                    event.code !== "NumpadAdd" &&
                                    (event.code === "Equal" || event.key === "=" || event.key === "+")
                                      ? event.shiftKey || event.key === "+"
                                        ? ("superscript" as const)
                                        : ("subscript" as const)
                                      : undefined;
                                  const formatKey =
                                    scriptKey ??
                                    ((event.metaKey || event.ctrlKey) &&
                                    !event.altKey &&
                                    !event.shiftKey &&
                                    !event.nativeEvent.isComposing
                                      ? ({ b: "bold", i: "italic", u: "underline" } as const)[
                                          event.key.toLowerCase() as "b" | "i" | "u"
                                        ]
                                      : undefined);
                                  if (formatKey) {
                                    event.preventDefault();
                                    captureImportedRichTextSelection(
                                      block.id,
                                      (block as PresentationTextBlock).text.length,
                                      event.currentTarget,
                                      paragraphs,
                                    );
                                    applyTextBlockRunToggle(block.id, formatKey);
                                    return;
                                  }
                                  if (
                                    event.key === "Enter" &&
                                    !event.metaKey &&
                                    !event.ctrlKey &&
                                    !event.altKey &&
                                    // The Enter that confirms an IME's
                                    // letters is the IME's, not a break.
                                    !event.nativeEvent.isComposing &&
                                    event.keyCode !== 229 &&
                                    !composingImportedPreviewRef.current
                                  ) {
                                    event.preventDefault();
                                    // Enter starts a new paragraph (`a:p`,
                                    // a list's next item); Shift+Enter breaks
                                    // the line inside it (`a:br`, no new
                                    // bullet), as PowerPoint and the textarea
                                    // do (`updateTextBlock` gives a bulleted
                                    // placeholder's flat lines rows for it).
                                    replaceImportedPreviewSelection(
                                      block.id,
                                      event.currentTarget,
                                      "\n",
                                      paragraphs,
                                      event.shiftKey,
                                    );
                                    return;
                                  }
                                  // Tab / Shift+Tab in a list item: the item's
                                  // level, as the textarea editor and Home >
                                  // Increase List Level do. This surface stops
                                  // the key, so Tab walked on to the next
                                  // object instead (PPT-B197); outside a list
                                  // it still moves focus.
                                  if (
                                    event.key === "Tab" &&
                                    !event.metaKey &&
                                    !event.ctrlKey &&
                                    !event.altKey
                                  ) {
                                    const text = presentationPreviewPlainText(event.currentTarget);
                                    const range = presentationPreviewSelection(
                                      event.currentTarget,
                                      text.length,
                                      paragraphs,
                                    );
                                    if (!range) return;
                                    captureImportedRichTextSelection(
                                      block.id,
                                      (block as PresentationTextBlock).text.length,
                                      event.currentTarget,
                                      paragraphs,
                                    );
                                    if (
                                      adjustParagraphCaretLevel(
                                        block.id,
                                        range.start,
                                        event.shiftKey ? -1 : 1,
                                        range.end,
                                      )
                                    ) {
                                      event.preventDefault();
                                      return;
                                    }
                                    // A plain paragraph takes a tab character,
                                    // as PowerPoint's does; the key stays in the
                                    // box either way (Shift+Tab does nothing).
                                    event.preventDefault();
                                    if (!event.shiftKey) {
                                      replaceImportedPreviewSelection(
                                        block.id,
                                        event.currentTarget,
                                        "\t",
                                        paragraphs,
                                      );
                                    }
                                  }
                                },
                                onPaste: (
                                  event: ReactClipboardEvent<HTMLDivElement>,
                                ) => {
                                  if (!importedTextHasPreview || isTextEditLocked(block)) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  pasteIntoImportedPreview(
                                    block.id,
                                    event.currentTarget,
                                    event.clipboardData,
                                    paragraphs,
                                  );
                                },
                                // The words' runs go with their text, so a
                                // paste in the deck keeps the format set on
                                
                                onCopy: (
                                  event: ReactClipboardEvent<HTMLDivElement>,
                                ) => {
                                  if (!importedTextHasPreview) return;
                                  if (!copyFromImportedPreview(block.id, event.currentTarget, event.clipboardData, paragraphs)) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                },
                                onCut: (
                                  event: ReactClipboardEvent<HTMLDivElement>,
                                ) => {
                                  if (!importedTextHasPreview || isTextEditLocked(block)) return;
                                  if (!copyFromImportedPreview(block.id, event.currentTarget, event.clipboardData, paragraphs)) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  replaceImportedPreviewSelection(block.id, event.currentTarget, "", paragraphs);
                                },
                              }
                            : {};
                        // Imported rich text remains the exact visual surface in
                        // both idle and editing states. The selected host owns the
                        // native caret; after a commit it is atomically remounted
                        // and the model selection is restored on the next frame.

                        const multiColumn =
                          normalizeColumnCount(
                            (block as PresentationTextBlock).columnCount,
                          ) > 1;
                        const importedOverlayStyle: CSSProperties =
                          importedTextHasPreview
                            ? {
                                ...importedTextInsets,
                                position: "absolute",
                                inset: 0,
                                zIndex: isSelected ? 3 : 1,
                                boxSizing: "border-box",
                                pointerEvents: isSelected ? "auto" : "none",
                                cursor: isSelected ? "text" : undefined,
                                userSelect: isSelected ? "text" : "none",
                                WebkitUserSelect: isSelected ? "text" : "none",
                                // Missing vertOverflow is DrawingML `overflow`:
                                // preserve visible overfill until the slide
                                // canvas edge. Explicit clip/ellipsis stays
                                // bounded to the authored text frame.
                                overflow: importedPptxTextOverflow(block),
                                ...anchorCssForColumns(
                                  verticalAnchorWrapperCss(
                                    readVerticalAnchor(
                                      (block as PresentationTextBlock).style,
                                    ),
                                    readSpacingFromStyle((block as PresentationTextBlock).style as Record<string, unknown> | undefined)?.writingMode,
                                  ),
                                  columnsCss,
                                ),
                              }
                            : {};
                        if (
                          importedTextHasPreview &&
                          ((previewBlock ?? block) as PresentationTextBlock).text === ""
                        ) {
                          // An empty box being typed in draws its one row as
                          // the words will be drawn -- the bullet its layout
                          // gives the first row, its size and place -- and
                          // the row holds a line for the caret, so a press
                          // shows the caret after the bullet and a Chinese
                          // IME's letters stand there, as in PowerPoint. At
                          // rest the prompt layer covers it (styles).
                          const promptLayout = presentationTextVisualLayout(
                            emptyPlaceholderPromptBlock(block as PresentationTextBlock, layoutPlaceholderPrompt(block, t) || " "),
                            activeSlideBounds, activeSlide, masters, theme, fontDisplay.aliases, { hostStyled: true },
                          );
                          const firstRow = promptLayout.paragraphs?.[0];
                          const emptyLayout = {
                            ...promptLayout,
                            paragraphs: firstRow ? [{ ...firstRow, text: "", runs: undefined }] : promptLayout.paragraphs,
                            flatRuns: undefined,
                          } as typeof promptLayout;
                          return (
                            <div
                              key={importedRichEditorKey}
                              className="presentation-window__paragraph-preview"
                              data-testid="presentation-empty-text-preview"
                              {...richPreviewSelectionProps}
                              style={{
                                ...promptLayout.paragraphTextStyles.containerStyle,
                                ...columnsCss,
                                whiteSpace: textBlockWraps(block) ? "pre-wrap" : "pre",
                                overflowWrap: textBlockOverflowWrap(block),
                                ...textBlockTabSizeCss(block),
                                ...textBlockLineBreakCss(block),
                                ...importedOverlayStyle,
                                ...(importedPptxText
                                  ? textBodyRotationCss((block as { source?: unknown }).source, "frame", block)
                                  : {}),
                              }}
                            >
                              <PresentationTextVisualContents
                                block={block as PresentationTextBlock}
                                layout={emptyLayout}
                                emptyEditable
                              />
                            </div>
                          );
                        }
                        const formattedParagraphs =
                          paragraphs &&
                          needsStructuredParagraphRender(paragraphs);
                        if (paragraphs && formattedParagraphs) {
                          return (
                            <div
                              key={importedRichEditorKey}
                              ref={balanceOverflowingColumns}
                              className="presentation-window__paragraph-preview"
                              data-testid="presentation-paragraph-preview"
                              // A flow body (no frame to overlay) shows ONE
                              // layer: its rows at rest, its textarea while it
                              // is typed in (styles: `data-flow-preview`). The
                              // two drew the same words one above the other
                              // (PPT-B288).
                              {...(importedTextHasPreview
                                ? {}
                                : {
                                    "data-flow-preview": "true",
                                    onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
                                      event.currentTarget.parentElement
                                        ?.querySelector<HTMLTextAreaElement>("textarea")
                                        ?.focus();
                                    },
                                  })}
                              {...richPreviewSelectionProps}
                              style={{
                                ...paragraphTextStyles.containerStyle,
                                ...columnsCss,
                                ...importedOverlayStyle,
                                ...(importedPptxText
                                  ? textBodyRotationCss((block as { source?: unknown }).source, "frame", block)
                                  : {}),
                              }}
                            >
                              <PresentationTextVisualContents block={(previewBlock ?? block) as PresentationTextBlock} layout={layout} emptyEditable={richPreviewEditable} />
                            </div>
                          );
                        }
                        if (flatRuns) {
                          return (
                            <div
                              key={importedRichEditorKey}
                              ref={balanceOverflowingColumns}
                              className="presentation-window__paragraph-preview"
                              data-testid="presentation-run-preview"
                              {...richPreviewSelectionProps}
                              style={{
                                ...paragraphTextStyles.containerStyle,
                                ...columnsCss,
                                whiteSpace: textBlockWraps(block) ? "pre-wrap" : "pre",
                                overflowWrap: textBlockOverflowWrap(block),
                                ...textBlockTabSizeCss(block),
                                ...textBlockLineBreakCss(block),
                                ...importedOverlayStyle,
                                ...(importedPptxText
                                  ? textBodyRotationCss((block as { source?: unknown }).source, "frame", block)
                                  : {}),
                              }}
                            >
                              <PresentationTextVisualContents block={(previewBlock ?? block) as PresentationTextBlock} layout={layout} emptyEditable={richPreviewEditable} />
                            </div>
                          );
                        }
                        if (!importedTextHasPreview && !multiColumn && !importedPptxText && shapeTextPaintCss(block)) {
                          // WordArt on a plain text box (PPT-A059): its words
                          // drawn in the style at rest, the textarea while it
                          // holds the caret (one layer, as a flow body).
                          return (
                            <div
                              key={importedRichEditorKey}
                              className="presentation-window__paragraph-preview"
                              data-testid="presentation-wordart-preview"
                              data-flow-preview="true"
                              onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
                                event.currentTarget.parentElement
                                  ?.querySelector<HTMLTextAreaElement>("textarea")
                                  ?.focus();
                              }}
                              {...richPreviewSelectionProps}
                              style={{
                                ...paragraphTextStyles.containerStyle,
                                whiteSpace: textBlockWraps(block) ? "pre-wrap" : "pre",
                                overflowWrap: textBlockOverflowWrap(block),
                                ...textBlockTabSizeCss(block),
                                ...textBlockLineBreakCss(block),
                              }}
                            >
                              <PresentationTextVisualContents block={(previewBlock ?? block) as PresentationTextBlock} layout={layout} />
                            </div>
                          );
                        }
                        // Keep an imported preview mounted after a free edit drops
                        // stale run boundaries; otherwise the first keystroke would
                        // hand editing back to the vertically displaced textarea.
                        // A plain box anchored middle or bottom: the textarea
                        // draws at the top, so the visible text is this layer,
                        // placed by the anchor as the show places it (PPT-B410).
                        const anchoredPlainText =
                          block.type === "text" &&
                          readVerticalAnchor((block as PresentationTextBlock).style) !== "top";
                        if (multiColumn || importedPptxText || anchoredPlainText || importedTextHasPreview) {
                          return (
                            <div
                              key={importedRichEditorKey}
                              ref={balanceOverflowingColumns}
                              className="presentation-window__paragraph-preview"
                              data-testid={
                                multiColumn
                                  ? "presentation-columns-preview"
                                  : importedPptxText
                                    ? "presentation-imported-text-preview"
                                    : anchoredPlainText
                                      ? "presentation-anchored-text-preview"
                                      : "presentation-text-preview"
                              }
                              {...richPreviewSelectionProps}
                              style={{
                                ...paragraphTextStyles.containerStyle,
                                ...columnsCss,
                                whiteSpace: textBlockWraps(block) ? "pre-wrap" : "pre",
                                overflowWrap: textBlockOverflowWrap(block),
                                ...textBlockTabSizeCss(block),
                                ...textBlockLineBreakCss(block),
                                ...importedOverlayStyle,
                                ...(importedPptxText
                                  ? textBodyRotationCss((block as { source?: unknown }).source, "frame", block)
                                  : {}),
                              }}
                            >
                              <PresentationTextVisualContents block={(previewBlock ?? block) as PresentationTextBlock} layout={layout} emptyEditable={richPreviewEditable} />
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        // An empty placeholder's prompt ("单击此处添加标题") is
                        // drawn where its words will be -- the box's anchor,
                        // insets, bullet and size -- as PowerPoint draws it.
                        // The bridge textarea's own placeholder sat at its top
                        // whatever the anchor, so a bottom-anchored title showed
                        // the prompt at the top and the words typed under it
                        // (a Chinese IME's letters stood below the prompt until
                        // they became characters). The prompt goes the moment
                        // the box is typed in (styles: `placeholder-prompt`).
                        if (!importedTextHasPreview) return null;
                        // An equation being written in it is words: no prompt.
                        if (((previewBlock ?? block) as PresentationTextBlock).text !== "") return null;
                        const prompt = layoutPlaceholderPrompt(block, t);
                        if (!prompt) return null;
                        const promptBlock = emptyPlaceholderPromptBlock(block as PresentationTextBlock, prompt);
                        const promptLayout = presentationTextVisualLayout(promptBlock, activeSlideBounds, activeSlide, masters, theme, fontDisplay.aliases, { hostStyled: true });
                        return (
                          <div
                            aria-hidden="true"
                            className="presentation-window__paragraph-preview presentation-window__placeholder-prompt"
                            data-testid="presentation-placeholder-prompt"
                            style={{
                              ...promptLayout.paragraphTextStyles.containerStyle,
                              ...promptLayout.columnsCss,
                              whiteSpace: textBlockWraps(block) ? "pre-wrap" : "pre",
                                overflowWrap: textBlockOverflowWrap(block),
                              ...textBlockTabSizeCss(block),
                                ...textBlockLineBreakCss(block),
                              ...importedTextInsets,
                              position: "absolute",
                              inset: 0,
                              zIndex: 1,
                              boxSizing: "border-box",
                              pointerEvents: "none",
                              userSelect: "none",
                              WebkitUserSelect: "none",
                              overflow: "hidden",
                              ...anchorCssForColumns(
                                verticalAnchorWrapperCss(
                                  readVerticalAnchor((block as PresentationTextBlock).style),
                                  readSpacingFromStyle((block as PresentationTextBlock).style as Record<string, unknown> | undefined)?.writingMode,
                                ),
                                promptLayout.columnsCss,
                              ),
                              ...(importedPptxText
                                ? textBodyRotationCss((block as { source?: unknown }).source, "frame", block)
                                : {}),
                            }}
                          >
                            <PresentationTextVisualContents block={promptBlock} layout={promptLayout} />
                          </div>
                        );
                      })()}
                      {!hasLayoutGeometry(block) && !isTextKeptReadOnly(block) ? (
                        <button
                          type="button"
                          onClick={() => deleteBlock(block.id)}
                          data-testid="presentation-delete-block"
                        >
                          <Trash2 size={13} />
                          {t("presentation.deleteBlock")}
                        </button>
                      ) : null}
                      {isSelected && isTextKeptReadOnly(block) ? (
                        // Words the import could not make editable (PPTX
                        // reading row 814): drawn as the file has them and
                        // kept unchanged; selecting them says so.
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
                    </div>
                    {richTypingCommitGuard}
                    </PresentationTextEngineSurfaceContext.Provider>
  );
}
