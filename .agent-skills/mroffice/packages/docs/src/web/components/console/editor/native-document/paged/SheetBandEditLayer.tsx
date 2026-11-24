"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * On-page header/footer editing (Word/WPS parity).
 *
 * Every structural sheet gets two invisible hit strips over its top/bottom
 * MARGIN boxes. Double-clicking a strip opens an in-place band editor at
 * exactly the band's position: dashed outline, a variant label tag (页眉 /
 * 首页页眉 / 偶数页页眉 + the footer twins), a multi-line text area and
 * an "insert page number" chip — the WPS interaction, replacing the old
 * toolbar-only textarea as the primary editing surface.
 *
 * The editor writes through the SAME sanitized doc-attr commands the
 * toolbar used (setDocumentHeader / setFirstPageHeader / … and, for
 * sectioned imports, setSectionBand), so every existing contract
 * (sanitizer, export round-trip, band rendering) holds. Which VARIANT a
 * sheet edits mirrors the render precedence exactly: per-section entry
 * flags when the document carries sectionBands (resolveSectionSheetBands
 * applies them at DOCUMENT page positions), the doc-level flags otherwise.
 * Editing a sheet of section 2 therefore edits section 2's band alone —
 * Word's sectioned model — and uniform documents keep editing the shared
 * pair.
 *
 * The ribbon 页眉/页脚 buttons route here too: a "mrn-open-band-editor"
 * window event (detail {kind, sheetIndex}) opens the island on the sheet
 * the host resolved as current — the toolbar textarea panel is no longer
 * the sheeted-mode entry.
 *
 * Imported RICH bands stay rich while editing: formatted text runs and table
 * cells are editable in place, PAGE/NUMPAGES remain structured field chips,
 * and pictures remain native image objects (with an explicit remove action).
 * No rich story is ever flattened into a textarea, so editing a caption cannot
 * silently discard a logo/table or turn a live PAGE field into cached text.
 */

import { documentPictureDisplaySrc } from "@mrnote/core/web/lib/document-picture-references.ts";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { TOUCH_REVEAL_PROPS } from "@mrnote/core/web/lib/pointer-capability.ts";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  BAND_NUMPAGES_TOKEN,
  bandParagraphStyleId,
  BAND_PAGE_TOKEN,
  MAX_HEADER_FOOTER_LENGTH,
  resolveBandVariantForSheet,
  sanitizeHeaderFooterText,
  replaceBandRichCellText,
  replaceBandRichCellParagraphText,
  bandRichRunsText,
  splitBandRichCellParagraph,
  joinBandRichCellParagraph,
  isBandRichRunTypable,
  isBandRichSlotParagraphWhole,
  type BandFieldToken,
  type BandRichBlock,
  type BandVariant,
} from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import type { Editor } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import BandStoryEditor from "./BandStoryEditor";
import { announceBandLayerDrawn } from "@mrnote/core/web/components/console/editor/native-document/paged/bandObjectHoles.ts";
import { sheetBoxInRange, useVisibleSheetBoxRange } from "./visibleSheetBoxes";
import type { BandTokenContext } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { bandRichRunsFromTokenText } from "./bandStoryDoc";

export type BandKind = "header" | "footer";

export const OPEN_BAND_EDITOR_EVENT = "mrn-open-band-editor";
export const NAVIGATE_BAND_EDITOR_EVENT = "mrn-navigate-band-editor";

/**
 * Floating editor popups that share the sheet area with the band hit strips.
 * The selection BubbleMenu (.floating-toolbar) is portaled into the
 * ProseMirror wrapper — a SIBLING stacking context of this layer — so a
 * pointer event whose target sits inside one of these containers belongs to
 * the popup, never to band editing. Future in-sheet popovers opt in via
 * data-editor-popup.
 */
export const EDITOR_POPUP_SELECTOR = ".floating-toolbar, [data-editor-popup]";
/** The refusal of a story draft holding a node its band cannot keep. */
const BAND_STORY_UNSUPPORTED_BLOCK = "native_story_edit_unsupported_block";
/**
 * The story's words carry formatting a header line cannot keep (a proofing
 * language, a hyperlink, strikethrough) and nothing else it refuses: said
 * as such, not as a task list or a quote the header never held (WUA 107).
 */
const BAND_STORY_UNSUPPORTED_MARK = "native_story_edit_unsupported_mark";
function bandStoryUnsupportedRefusal(unsupported: readonly string[]): string {
  return unsupported.every((entry) => entry.startsWith("mark:"))
    ? BAND_STORY_UNSUPPORTED_MARK
    : BAND_STORY_UNSUPPORTED_BLOCK;
}
/** Content the story editor did not take (a rule or a picture pasted). */
const BAND_STORY_BLOCK_REFUSED = "band_story_block_refused";
const HEADER_FOOTER_CONTEXT_CONTROL_SELECTOR =
  "[data-header-footer-context-control]";
const COMMAND_DIALOG_SELECTOR =
  ".office-dialog, [role='dialog'][aria-modal='true'], [role='alertdialog']";

export function isEditorPopupTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(EDITOR_POPUP_SELECTOR) !== null
  );
}

export interface OpenBandEditorDetail {
  kind: BandKind;
  sheetIndex: number;
  variant?: BandVariant;
}

export type HeaderFooterNavigationTarget =
  | "previous"
  | "next"
  | "header"
  | "footer"
  | BandVariant
  | "close";

export interface NavigateBandEditorDetail {
  target: HeaderFooterNavigationTarget;
}

export interface HeaderFooterEditingContext {
  sheetIndex: number;
  sectionIndex: number;
  kind: BandKind;
  variant: BandVariant;
  availableVariants: readonly BandVariant[];
  canPrevious: boolean;
  canNext: boolean;
  /** The editor instance on the open story (a `full` story hosted by
   * {@link BandStoryEditor}); the ribbon's commands target it while it is
   * the active one. Null for a story edited through its native text slots. */
  storyEditor?: Editor | null;
}

export interface SheetBandBox {
  top: number;
  left: number;
  width: number;
  height: number;
  sectionIndex: number;
  /** The sheet's section began on an earlier sheet, mid-page
   * (`sheetOpensSectionMidPage`): not its first page. */
  sectionContinues?: boolean;
}

/**
 * The editable Gallery band fixture is guest-only and has no room, autosave,
 * or authenticated API authority. A local-only Yjs session would merely drop
 * ProseMirror history while leaving top-level section attrs outside Yjs. Use
 * the existing native history for that explicit fixture only.
 */
export function shouldUseGuestBandEditingCollaboration(
  collaborationEnabled: boolean,
  guestMode: boolean,
  enableGuestBandEditing: boolean,
): boolean {
  return collaborationEnabled && !(guestMode && enableGuestBandEditing);
}

export interface SheetBandEditLayerProps {
  boxes: SheetBandBox[];
  /** Reactive write state for controls plus an event-time authority recheck. */
  canEdit?: boolean;
  canEditNow?: () => boolean;
  /** One-based PHYSICAL page number of every editable sheet. Odd/even section
   * fillers do not have their own box, so array index alone is not page parity. */
  pageStarts?: readonly number[];
  differentFirstPage: boolean;
  differentOddEven: boolean;
  /** Per-section variant flags (sectioned imports). Null/absent = uniform
   * document, the doc-level flags above apply to every sheet. */
  sectionFlags?:
    | ((sectionIndex: number) => {
        differentFirstPage: boolean;
        differentOddEven: boolean;
      })
    | null;
  /** Whether the given variant renders an imported RICH band. */
  isRichBand: (
    kind: BandKind,
    variant: BandVariant,
    sectionIndex: number,
  ) => boolean;
  /** How the variant's story may be edited: `text` types only into runs
   * drawn from Word's own text slots and keeps the story's structure (fields,
   * pictures, paragraphs) fixed; `none` shows the story read-only. A story is
   * never offered for typing that its save would drop. Absent = `full`. */
  getBandEditMode?: (
    kind: BandKind,
    variant: BandVariant,
    sectionIndex: number,
  ) => BandEditMode;
  /** Why committing `blocks` to the variant's story would be refused, or
   * null when it can be written. Word's own part opened in the story editor
   * is edited in place, and an edit its save cannot write into the part is
   * named here instead of being dropped. */
  getBandCommitRefusal?: (
    kind: BandKind,
    variant: BandVariant,
    sectionIndex: number,
    blocks: BandRichBlock[],
  ) => string | null;
  /** Structured story for the active rich variant. */
  getBandRich: (
    kind: BandKind,
    variant: BandVariant,
    sectionIndex: number,
  ) => BandRichBlock[] | null;
  /** Live sanitized band text for the variant (read at edit-start).
   * `sheetIndex` lets page-scoped hosts hand a CLEAN draft to a
   * continuation sheet (its section's band belongs to another page). */
  getBandText: (
    kind: BandKind,
    variant: BandVariant,
    sectionIndex: number,
    sheetIndex?: number,
  ) => string;
  /** Follow transaction-backed story props while an island is open. Hosts
   * with static/fallback getters leave this false so local drafts remain the
   * only authority. Even when enabled, dirty local input is never replaced. */
  syncAuthoritativeStoryChanges?: boolean;
  /** Commit sanitized text back through the doc-attr commands. The SHEET
   * index rides along so a sectionless document can isolate the edited
   * page into its own section (per-page independence, the product
   * default). */
  commitBandText: (
    kind: BandKind,
    variant: BandVariant,
    text: string,
    sectionIndex: number,
    sheetIndex: number,
  ) => void;
  /** Commit a structured rich story without flattening fields/images/tables. */
  commitBandRich: (
    kind: BandKind,
    variant: BandVariant,
    blocks: BandRichBlock[] | null,
    sectionIndex: number,
    sheetIndex: number,
  ) => void;
  /** The host hands the layer a slot for "write the open story's draft
   * now": its save path calls it before it serializes the document, so a
   * save started while the pane is open carries what was typed in it. */
  registerDraftFlush?: (flush: (() => void) | null) => void;
  





  popupOpen?: boolean;
  /** The document editor's extensions: with them a `full` story opens in a
   * real editor instance ({@link BandStoryEditor}) instead of the text
   * draft, so the ribbon's paragraph and run commands act on it. */
  storyExtensions?: Extensions;
  /** The document editor's doc attrs, mirrored onto the story editor. */
  documentAttrs?: Record<string, unknown>;
  /** A doc-attr change a ribbon command made through the story editor. */
  onDocumentAttrsChange?: (patch: Record<string, unknown>) => void;
  onEditingChange?: (context: HeaderFooterEditingContext | null) => void;
  /** The sheet's own layout variables (its section's margins and header /
   * footer distances), the ones the painted band is placed with, so an open
   * band sits exactly where it is drawn. */
  boxStyle?: (box: SheetBandBox, index: number) => CSSProperties | undefined;
  /** Word's crop marks at the corners of each page's text area. */
  showCropMarks?: boolean;
  /** The page number and page count a sheet's header or footer band shows,
   * which an open story's page fields show too. */
  bandFieldContext?: (index: number, kind: BandKind) => Pick<BandTokenContext, "pageLabel" | "totalPages"> | undefined;
  labels: {
    header: string;
    footer: string;
    firstPageHeader: string;
    firstPageFooter: string;
    evenPageHeader: string;
    evenPageFooter: string;
    insertPageNumber: string;
    insertPageCount: string;
    done: string;
    editHint: string;
    richHint: string;
    removeImage: string;
    /** The label of a field chip's remove button: any field a band run
     * may be (page number, page count, date, time, document information). */
    removeField: (field: BandFieldToken) => string;
    /** Shown in a `none` story (optional for hosts without native stories). */
    nativeReadOnly?: string;
    /** Shown in a `text` story. */
    nativeTextOnly?: string;
    /** Shown while an edit of Word's own part cannot be written into it. */
    nativeRefusal?: (reason: string) => string;
    /** Word's tag of a section's default story while Different Odd & Even
     * Pages is on. */
    oddPageHeader?: string;
    oddPageFooter?: string;
    /** Word's tag in a document of several sections: "Header -Section 2-". */
    sectionTag?: (label: string, sectionNumber: number) => string;
    /** Word's right-hand tag of a story linked to the previous section. */
    sameAsPrevious?: string;
  };
  /** Whether a section's story of this kind and variant is linked to the
   * previous section's (Word's "Same as Previous"). */
  isLinkedToPrevious?: (sectionIndex: number, kind: BandKind, variant: BandVariant) => boolean;
}

export type BandEditMode = "full" | "text" | "none";

/** How long typing in an open header/footer rests before its story is
 * written to the document. Word keeps what was typed in the header pane
 * without "Close Header and Footer": the story is written while it is open,
 * through the same commit Close uses, never only at close. */
export const BAND_DRAFT_AUTOSAVE_MS = 600;

interface EditingSlot {
  index: number;
  kind: BandKind;
  variant: BandVariant;
  sectionIndex: number;
  mode: BandEditMode;
}

/** A native-text run edit keeps a slot's text a slot's text: at most 500
 * characters and no break or tab (those are Word elements, not text). */
function isSlotText(text: string): boolean {
  return Array.from(text).length <= 500 && !/[\r\n\t]/.test(text);
}

/** The sheet's text width (page less its margins) in twips, from the box the
 * host measured; the box's paddings are the page margins when it has them. */
function bandTextWidthTwips(box: SheetBandBox): number {
  const padded = box as SheetBandBox & { paddingLeft?: number; paddingRight?: number };
  const width = box.width - (padded.paddingLeft ?? 0) - (padded.paddingRight ?? 0);
  return Math.max(0, Math.round(width * 15));
}

function variantLabel(
  kind: BandKind,
  variant: BandVariant,
  labels: SheetBandEditLayerProps["labels"],
  place?: { oddEven: boolean; sectionIndex: number; sectionCount: number },
): string {
  let label: string;
  if (variant === "first") {
    label = kind === "header" ? labels.firstPageHeader : labels.firstPageFooter;
  } else if (variant === "even") {
    label = kind === "header" ? labels.evenPageHeader : labels.evenPageFooter;
  } else {
    // Word names a section's default story "Odd Page Header" while its
    // pages alternate (Different Odd & Even Pages).
    const odd = place?.oddEven ? (kind === "header" ? labels.oddPageHeader : labels.oddPageFooter) : undefined;
    label = odd ?? (kind === "header" ? labels.header : labels.footer);
  }
  // ... and adds the section in a document of more than one ("Header
  // -Section 2-").
  return place && place.sectionCount > 1 && labels.sectionTag
    ? labels.sectionTag(label, place.sectionIndex + 1)
    : label;
}

function SheetBandEditLayer({
  boxes,
  canEdit = true,
  canEditNow,
  pageStarts,
  differentFirstPage,
  differentOddEven,
  sectionFlags,
  isLinkedToPrevious,
  isRichBand,
  getBandEditMode,
  getBandCommitRefusal,
  getBandRich,
  getBandText,
  syncAuthoritativeStoryChanges = false,
  commitBandText,
  commitBandRich,
  popupOpen = false,
  registerDraftFlush,
  onEditingChange,
  storyExtensions,
  documentAttrs,
  onDocumentAttrsChange,
  boxStyle,
  showCropMarks = false,
  bandFieldContext,
  labels,
}: SheetBandEditLayerProps) {
  const [editing, setEditing] = useState<EditingSlot | null>(null);
  // Only the sheets near the viewport get their strips drawn (a long book
  // drew hundreds on every transaction); an open band always stays drawn.
  const [layerHost, setLayerHost] = useState<HTMLDivElement | null>(null);
  const drawnRange = useVisibleSheetBoxRange(layerHost, boxes);
  const [draft, setDraft] = useState("");
  const [draftRich, setDraftRich] = useState<BandRichBlock[] | null>(null);
  const [authoritativeStoryRevision, setAuthoritativeStoryRevision] =
    useState(0);
  const [storyEditor, setStoryEditor] = useState<Editor | null>(null);
  // Why the open story's draft cannot be written, and the draft that reason
  // was already shown for at a commit (a second commit of it discards it).
  const [refusal, setRefusal] = useState<string | null>(null);
  const refusalShownForRef = useRef<string | null>(null);
  // The refusal is a floating notice beside the open band, not text in it:
  // it closes by itself after a while, as a status message does.
  useEffect(() => {
    if (!refusal) return;
    const timer = window.setTimeout(() => setRefusal(null), 6000);
    return () => window.clearTimeout(timer);
  }, [refusal]);
  // Whether the story editor holds a node the band cannot (a list, a quote,
  // a code block): such a draft is refused by name, never saved without it.
  // The refusal the draft's foreign content earns, or null.
  const draftUnsupportedRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const islandRef = useRef<HTMLDivElement | null>(null);
  const paragraphFocusRef = useRef<{owner: EditingSlot; block: number; cell: number; paragraph: number; offset: number} | null>(null);
  useEffect(() => {
    const request = paragraphFocusRef.current;
    if (!request) return;
    paragraphFocusRef.current = null;
    if (request.owner !== editing) return;
    const suffix = request.paragraph ? `-paragraph-${request.paragraph}` : "";
    const input = islandRef.current?.querySelector<HTMLTextAreaElement>(`[data-testid="sheet-band-rich-cell-${request.block}-${request.cell}${suffix}"]`);
    if (!input || input.disabled) return;
    input.focus({preventScroll:true});
    input.setSelectionRange(request.offset,request.offset);
  }, [draftRich, editing]);
  const initialDraftRef = useRef("");
  const initialRichRef = useRef<string | null>(null);
  const contextualPointerOwnedRef = useRef(false);
  // A draft written while the island stays open: the authoritative story
  // then changes under it (its echo), which is not an outside change to
  // follow by reopening the story (that would move the caret).
  const ownCommitRef = useRef<{ rich: string | null; text: string } | null>(null);
  const ownEchoRef = useRef<{ rich: string | null; text: string } | null>(null);
  const backgroundCommitRef = useRef<() => void>(() => undefined);
  const richDraftActive = draftRich !== null;
  const hasWriteAuthority = useCallback(
    () => canEdit && (canEditNow?.() ?? true),
    [canEdit, canEditNow],
  );

  useEffect(() => {
    if (canEdit || !editing) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setEditing(null);
    });
    return () => {
      cancelled = true;
    };
  }, [canEdit, editing]);

  useEffect(() => {
    if (!editing) {
      onEditingChange?.(null);
      return;
    }
    const flags = sectionFlags?.(editing.sectionIndex) ?? {
      differentFirstPage,
      differentOddEven,
    };
    onEditingChange?.({
      sheetIndex: editing.index,
      sectionIndex: editing.sectionIndex,
      kind: editing.kind,
      variant: editing.variant,
      availableVariants: [
        "normal",
        ...(flags.differentFirstPage ? (["first"] as const) : []),
        ...(flags.differentOddEven ? (["even"] as const) : []),
      ],
      canPrevious: editing.index > 0,
      canNext: editing.index + 1 < boxes.length,
      storyEditor,
    });
  }, [
    boxes.length,
    differentFirstPage,
    differentOddEven,
    editing,
    onEditingChange,
    sectionFlags,
    storyEditor,
  ]);

  useEffect(() => {
    if (!editing) return;
    const input =
      (textareaRef.current && !textareaRef.current.disabled ? textareaRef.current : null) ??
      islandRef.current?.querySelector<HTMLElement>(
        editing.mode === "none"
          ? "[data-testid='sheet-band-done']:not([disabled])"
          : "input:not([disabled]), textarea:not([disabled])",
      );
    input?.focus();
  }, [editing, richDraftActive]);

  useEffect(() => {
    if (!editing || typeof document === "undefined") {
      contextualPointerOwnedRef.current = false;
      return;
    }
    const capturePointerOwner = (event: PointerEvent) => {
      contextualPointerOwnedRef.current =
        event.target instanceof Element &&
        event.target.closest(HEADER_FOOTER_CONTEXT_CONTROL_SELECTOR) !== null;
    };
    const clearPointerOwner = () => {
      contextualPointerOwnedRef.current = false;
    };
    const releasePointerOwner = () => {
      const restoreIslandFocus = contextualPointerOwnedRef.current;
      contextualPointerOwnedRef.current = false;
      if (!restoreIslandFocus) return;
      // Native pointerup is followed by mouseup/click. Restore after that full
      // activation, not during the history transaction, so the click tail
      // cannot strand focus on BODY after the pristine story rerenders.
      window.requestAnimationFrame(() => {
        const input =
          textareaRef.current ??
          islandRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            "input:not([disabled]), textarea:not([disabled])",
          );
        if (input?.isConnected) input.focus({ preventScroll: true });
      });
    };
    document.addEventListener("pointerdown", capturePointerOwner, true);
    document.addEventListener("pointerup", releasePointerOwner, true);
    document.addEventListener("pointercancel", clearPointerOwner, true);
    return () => {
      contextualPointerOwnedRef.current = false;
      document.removeEventListener("pointerdown", capturePointerOwner, true);
      document.removeEventListener("pointerup", releasePointerOwner, true);
      document.removeEventListener("pointercancel", clearPointerOwner, true);
    };
  }, [editing]);

  useEffect(() => {
    if (!editing || !syncAuthoritativeStoryChanges) return;

    const currentRich = draftRich ? JSON.stringify(draftRich) : null;
    const currentText = sanitizeHeaderFooterText(draft);
    const draftIsPristine =
      currentRich === initialRichRef.current &&
      currentText === initialDraftRef.current;
    if (!draftIsPristine) return;

    const authoritativeRich = isRichBand(
      editing.kind,
      editing.variant,
      editing.sectionIndex,
    )
      ? getBandRich(editing.kind, editing.variant, editing.sectionIndex)
      : null;
    const authoritativeText = getBandText(
      editing.kind,
      editing.variant,
      editing.sectionIndex,
      editing.index,
    );
    const nextRich = authoritativeRich
      ? (JSON.parse(JSON.stringify(authoritativeRich)) as BandRichBlock[])
      : null;
    const nextRichBaseline = nextRich ? JSON.stringify(nextRich) : null;
    const nextTextBaseline = sanitizeHeaderFooterText(authoritativeText);
    if (
      nextRichBaseline === initialRichRef.current &&
      nextTextBaseline === initialDraftRef.current
    ) {
      // Also the echo of the island's own write, stored as written.
      ownCommitRef.current = null;
      return;
    }
    const own = ownCommitRef.current;
    if (own) {
      // The story still reads as before the island's own write: its echo
      // has not arrived yet.
      if (own.rich === nextRichBaseline && own.text === nextTextBaseline) return;
      // This is the echo of the island's own write (the document may
      // normalize what it stores): the draft already holds it.
      ownCommitRef.current = null;
      ownEchoRef.current = { rich: nextRichBaseline, text: nextTextBaseline };
      return;
    }
    const echo = ownEchoRef.current;
    if (echo && echo.rich === nextRichBaseline && echo.text === nextTextBaseline) {
      return;
    }
    ownEchoRef.current = null;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      // The open island follows a real toolbar/Undo authority change only
      // while it is still pristine. A locally edited draft remains the user's
      // sole authority until Done/blur commits it, so an external transaction
      // can never erase in-progress header/footer text.
      initialRichRef.current = nextRichBaseline;
      initialDraftRef.current = nextTextBaseline;
      setDraftRich(nextRich);
      setDraft(authoritativeText);
      // The story editor reads its blocks only when it mounts; remount it on
      // the new story, or Remove Header left the old text in the open island
      // and Done wrote it straight back.
      setAuthoritativeStoryRevision((revision) => revision + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [
    draft,
    draftRich,
    editing,
    getBandRich,
    getBandText,
    isRichBand,
    syncAuthoritativeStoryChanges,
  ]);

  const variantForSheet = useCallback(
    (index: number, sectionIndex: number): BandVariant => {
      const flags = sectionFlags?.(sectionIndex) ?? {
        differentFirstPage,
        differentOddEven,
      };
      // First-page is section-local; odd/even is physical-document parity. An
      // implicit filler is absent from `boxes`, so use the accounted one-based
      // page start for parity and the adjacent section indexes for first-page.
      const physicalPageIndex = Math.max(
        0,
        (pageStarts?.[index] ?? index + 1) - 1,
      );
      const isFirstSheetOfSection =
        index === 0 ||
        (boxes[index - 1]?.sectionIndex !== sectionIndex && boxes[index]?.sectionContinues !== true);
      return resolveBandVariantForSheet(
        physicalPageIndex,
        flags,
        isFirstSheetOfSection,
      );
    },
    [boxes, differentFirstPage, differentOddEven, pageStarts, sectionFlags],
  );

  const openEditor = useCallback(
    (index: number, kind: BandKind, requestedVariant?: BandVariant) => {
      if (!hasWriteAuthority()) return;
      const box = boxes[index];
      if (!box) return;
      const sectionIndex = box.sectionIndex;
      const flags = sectionFlags?.(sectionIndex) ?? {
        differentFirstPage,
        differentOddEven,
      };
      const availableVariants: readonly BandVariant[] = [
        "normal",
        ...(flags.differentFirstPage ? (["first"] as const) : []),
        ...(flags.differentOddEven ? (["even"] as const) : []),
      ];
      const variant =
        requestedVariant && availableVariants.includes(requestedVariant)
          ? requestedVariant
          : variantForSheet(index, sectionIndex);
      const rich = isRichBand(kind, variant, sectionIndex)
        ? getBandRich(kind, variant, sectionIndex)
        : null;
      // A fresh structured clone is the editor draft.  Mutations below never
      // touch the persisted attrs before Done/blur commits the story.
      setDraftRich(
        rich ? (JSON.parse(JSON.stringify(rich)) as BandRichBlock[]) : null,
      );
      const text = getBandText(kind, variant, sectionIndex, index);
      setDraft(text);
      initialDraftRef.current = sanitizeHeaderFooterText(text);
      initialRichRef.current = rich ? JSON.stringify(rich) : null;
      // A plain-text draft rewrites the whole story, which only a story MRAI
      // owns can take; Word's own part is edited through its rich runs.
      const mode = getBandEditMode?.(kind, variant, sectionIndex) ?? "full";
      // A new island starts without a refusal of the previous one's draft.
      setRefusal(null);
      refusalShownForRef.current = null;
      draftUnsupportedRef.current = null;
      ownCommitRef.current = null;
      ownEchoRef.current = null;
      setEditing({ index, kind, variant, sectionIndex, mode: rich || mode === "full" ? mode : "none" });
    },
    [
      boxes,
      differentFirstPage,
      differentOddEven,
      getBandEditMode,
      getBandRich,
      getBandText,
      hasWriteAuthority,
      isRichBand,
      sectionFlags,
      variantForSheet,
    ],
  );

  // Double-click entry: inert while a floating popup is open, and never for
  // an event whose target lies inside a popup container (layering contract's
  // second half — the CSS side puts .floating-toolbar above this layer).
  const handleHitDoubleClick = useCallback(
    (index: number, kind: BandKind, event: ReactMouseEvent) => {
      if (
        !hasWriteAuthority() ||
        popupOpen ||
        isEditorPopupTarget(event.target)
      ) {
        return;
      }
      openEditor(index, kind);
    },
    [hasWriteAuthority, openEditor, popupOpen],
  );

  // Ribbon 页眉/页脚 route: the host resolves the current sheet and asks
  // the layer to open its island directly.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenBandEditorDetail>).detail;
      if (!detail) return;
      // The same authority the double-click route asks for. A stale ribbon
      // control, or one opened before the page went read-only, must not put
      // an editing island on a surface that refuses writes.
      if (!hasWriteAuthority()) return;
      const index = Math.min(
        Math.max(0, detail.sheetIndex ?? 0),
        Math.max(0, boxes.length - 1),
      );
      openEditor(
        index,
        detail.kind === "footer" ? "footer" : "header",
        detail.variant,
      );
    };
    window.addEventListener(OPEN_BAND_EDITOR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BAND_EDITOR_EVENT, onOpen);
  }, [boxes.length, hasWriteAuthority, openEditor]);

  const commitDraft = useCallback((): boolean => {
    if (!editing || !hasWriteAuthority()) return false;
    if (editing.mode === "none") return true;
    if (draftRich) {
      const serialized = JSON.stringify(draftRich);
      const refused = draftUnsupportedRef.current
        ? draftUnsupportedRef.current
        : serialized !== initialRichRef.current
          ? (getBandCommitRefusal?.(editing.kind, editing.variant, editing.sectionIndex, draftRich) ?? null)
          : null;
      if (refused) {
        // Word's part cannot take this edit. The reason stays on screen and
        // the island stays open; committing the same draft again leaves the
        // story as it was (nothing is written, nothing is dropped silently).
        setRefusal(refused);
        if (refusalShownForRef.current !== serialized) {
          refusalShownForRef.current = serialized;
          return false;
        }
        refusalShownForRef.current = null;
        return true;
      }
      if (serialized !== initialRichRef.current) {
        commitBandRich(
          editing.kind,
          editing.variant,
          draftRich,
          editing.sectionIndex,
          editing.index,
        );
        initialRichRef.current = serialized;
      }
    } else {
      const sanitized = sanitizeHeaderFooterText(draft);
      if (sanitized !== initialDraftRef.current) {
        commitBandText(
          editing.kind,
          editing.variant,
          sanitized,
          editing.sectionIndex,
          editing.index,
        );
        initialDraftRef.current = sanitized;
      }
    }
    return true;
  }, [
    commitBandRich,
    commitBandText,
    draft,
    draftRich,
    editing,
    getBandCommitRefusal,
    hasWriteAuthority,
  ]);

  // The open story written to the document without closing the island or
  // touching focus. A draft the story cannot take (a refusal, a block the
  // band cannot hold) is left to the explicit commit, which names it.
  const commitDraftInBackground = useCallback((): void => {
    if (!editing || editing.mode === "none" || !hasWriteAuthority()) return;
    const before = { rich: initialRichRef.current, text: initialDraftRef.current };
    if (draftRich) {
      const serialized = JSON.stringify(draftRich);
      if (serialized === initialRichRef.current || draftUnsupportedRef.current) return;
      if (getBandCommitRefusal?.(editing.kind, editing.variant, editing.sectionIndex, draftRich)) {
        return;
      }
      ownCommitRef.current = before;
      ownEchoRef.current = null;
      commitBandRich(editing.kind, editing.variant, draftRich, editing.sectionIndex, editing.index);
      initialRichRef.current = serialized;
      return;
    }
    const sanitized = sanitizeHeaderFooterText(draft);
    if (sanitized === initialDraftRef.current) return;
    ownCommitRef.current = before;
    ownEchoRef.current = null;
    commitBandText(editing.kind, editing.variant, sanitized, editing.sectionIndex, editing.index);
    initialDraftRef.current = sanitized;
  }, [
    commitBandRich,
    commitBandText,
    draft,
    draftRich,
    editing,
    getBandCommitRefusal,
    hasWriteAuthority,
  ]);
  backgroundCommitRef.current = commitDraftInBackground;

  // Typing that rests is written; so is the draft when the page is hidden,
  // reloaded or closed, and before a save (Cmd/Ctrl+S, the host's save).
  useEffect(() => {
    if (!editing || editing.mode === "none") return;
    const timer = window.setTimeout(
      () => backgroundCommitRef.current(),
      BAND_DRAFT_AUTOSAVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [draft, draftRich, editing]);

  const editingOpen = editing !== null;
  useEffect(() => {
    if (!editingOpen || typeof window === "undefined") return;
    const flush = () => backgroundCommitRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editingOpen]);

  // Registered only while a header/footer draft is open: the host reads a
  // registered flush as pending work (a saved page then is not provably
  // settled), and with no open draft the flush writes nothing anyway.
  const draftOpen = editing !== null && editing.mode !== "none";
  useEffect(() => {
    if (!registerDraftFlush || !draftOpen) return;
    registerDraftFlush(() => backgroundCommitRef.current());
    return () => registerDraftFlush(null);
  }, [draftOpen, registerDraftFlush]);

  // The layer leaving (its window closed, the view switched) writes the open
  // draft first; the document editor is still there in a layout cleanup.
  useLayoutEffect(() => () => backgroundCommitRef.current(), []);

  const commit = useCallback(() => {
    if (!editing) return;
    if (!commitDraft()) {
      if (!hasWriteAuthority()) setEditing(null);
      return;
    }
    setEditing(null);
  }, [commitDraft, editing, hasWriteAuthority]);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<NavigateBandEditorDetail>).detail;
      if (!editing || !detail) return;
      if (!hasWriteAuthority()) {
        setEditing(null);
        return;
      }
      if (detail.target === "close") {
        commit();
        return;
      }
      commitDraft();
      if (detail.target === "previous" || detail.target === "next") {
        const delta = detail.target === "previous" ? -1 : 1;
        const index = editing.index + delta;
        if (index >= 0 && index < boxes.length) {
          openEditor(index, editing.kind, editing.variant);
        }
        return;
      }
      if (detail.target === "header" || detail.target === "footer") {
        openEditor(editing.index, detail.target, editing.variant);
        return;
      }
      openEditor(editing.index, editing.kind, detail.target);
    };
    window.addEventListener(NAVIGATE_BAND_EDITOR_EVENT, onNavigate);
    return () =>
      window.removeEventListener(NAVIGATE_BAND_EDITOR_EVENT, onNavigate);
  }, [
    boxes.length,
    commit,
    commitDraft,
    editing,
    hasWriteAuthority,
    openEditor,
  ]);

  // Different First Page or Different Odd & Even turned on (or off) while a
  // story is open: Word's pane now shows the story the open page uses
  // ("First Page Header" on the section's first page, "Even Page Header" on
  // an even page). Only a change of the section's switches moves it -- a
  // story chosen through the ribbon's navigation stays open.
  const editingFlags = editing ? sectionFlags?.(editing.sectionIndex) ?? { differentFirstPage, differentOddEven } : null;
  const editingFlagsKey = editingFlags
    ? `${editingFlags.differentFirstPage ? 1 : 0}${editingFlags.differentOddEven ? 1 : 0}`
    : null;
  const lastEditingFlagsRef = useRef<{ slot: string; key: string } | null>(null);
  useEffect(() => {
    if (!editing || editingFlagsKey === null) {
      lastEditingFlagsRef.current = null;
      return;
    }
    const slot = `${editing.index}:${editing.kind}`;
    const last = lastEditingFlagsRef.current;
    lastEditingFlagsRef.current = { slot, key: editingFlagsKey };
    if (!last || last.slot !== slot || last.key === editingFlagsKey) return;
    const sheetVariant = variantForSheet(editing.index, editing.sectionIndex);
    if (sheetVariant === editing.variant || !hasWriteAuthority()) return;
    commitDraft();
    openEditor(editing.index, editing.kind, sheetVariant);
  }, [commitDraft, editing, editingFlagsKey, hasWriteAuthority, openEditor, variantForSheet]);

  const insertToken = useCallback(
    (token: string) => {
      if (!hasWriteAuthority() || editing?.mode !== "full") return;
      if (storyEditor && !storyEditor.isDestroyed) {
        const field = token === BAND_NUMPAGES_TOKEN ? "NUMPAGES" : "PAGE";
        (storyEditor.chain().focus() as unknown as {
          insertDocumentField: (type: string) => { run: () => boolean };
        })
          .insertDocumentField(field)
          .run();
        return;
      }
      if (draftRich) {
        const field = token === BAND_NUMPAGES_TOKEN ? "NUMPAGES" : "PAGE";
        setDraftRich((previous) => {
          if (!previous) return previous;
          const next = JSON.parse(JSON.stringify(previous)) as BandRichBlock[];
          const paragraph = next.find(
            (block): block is Extract<BandRichBlock, { type: "paragraph" }> =>
              block.type === "paragraph",
          );
          if (paragraph) paragraph.runs.push({ token: field });
          else next.push({ type: "paragraph", runs: [{ token: field }] });
          return next;
        });
        return;
      }
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      setDraft(
        (previous) => previous.slice(0, start) + token + previous.slice(end),
      );
      window.requestAnimationFrame(() => {
        textarea.focus();
        const caret = start + token.length;
        textarea.setSelectionRange(caret, caret);
      });
    },
    [draftRich, editing?.mode, hasWriteAuthority, storyEditor],
  );

  const updateRichRun = useCallback(
    (blockIndex: number, runIndex: number, text: string) => {
      if (!hasWriteAuthority() || !editing || editing.mode === "none") return;
      const nativeTextOnly = editing.mode === "text";
      if (nativeTextOnly && !isSlotText(text)) return;
      setDraftRich((previous) => {
        if (!previous) return previous;
        const next = JSON.parse(JSON.stringify(previous)) as BandRichBlock[];
        const block = next[blockIndex];
        if (block?.type !== "paragraph") return previous;
        const run = block.runs[runIndex];
        if (!run || !isBandRichRunTypable(run, nativeTextOnly)) return previous;
        run.text = text;
        return next;
      });
    },
    [editing, hasWriteAuthority],
  );

  const appendRichRun = useCallback(
    (blockIndex: number, text: string) => {
      if (!hasWriteAuthority() || !text || editing?.mode !== "full") return;
      setDraftRich((previous) => {
        if (!previous) return previous;
        const next = JSON.parse(JSON.stringify(previous)) as BandRichBlock[];
        const block = next[blockIndex];
        if (block?.type !== "paragraph") return previous;
        block.runs.push({ text });
        return next;
      });
    },
    [editing?.mode, hasWriteAuthority],
  );

  const updateRichCell = useCallback(
    (blockIndex: number, cellIndex: number, text: string, paragraphIndex?: number) => {
      if (!hasWriteAuthority() || !editing || editing.mode === "none") return;
      // A native-text cell takes typing only into its slots
      // (replaceBandRichCellParagraphText refuses anything else).
      if (editing.mode === "text" && paragraphIndex === undefined) return;
      setDraftRich((previous) => {
        if (!previous) return previous;
        const next = JSON.parse(JSON.stringify(previous)) as BandRichBlock[];
        const block = next[blockIndex];
        if (block?.type !== "table" || !block.cells[cellIndex]) return previous;
        block.cells[cellIndex] = paragraphIndex === undefined
          ? replaceBandRichCellText(block.cells[cellIndex], text)
          : replaceBandRichCellParagraphText(block.cells[cellIndex], paragraphIndex, text);
        return next;
      });
    },
    [editing, hasWriteAuthority],
  );

  const handleCellParagraphKey = useCallback((event: KeyboardEvent<HTMLTextAreaElement>, blockIndex: number, cellIndex: number, paragraphIndex: number) => {
    if (!hasWriteAuthority() || !editing) return;
    const input = event.currentTarget;
    const from = input.selectionStart, to = input.selectionEnd;
    const block = draftRich?.[blockIndex];
    if (block?.type !== "table") return;
    const cell = block.cells[cellIndex];
    const split = event.key === "Enter" && !event.shiftKey;
    const joinBefore = event.key === "Backspace" && from === 0 && to === 0 && paragraphIndex > 0;
    const joinAfter = event.key === "Delete" && from === input.value.length && to === from && paragraphIndex + 1 < (cell.paragraphs?.length ?? 1);
    if (editing.mode !== "full") {
      // Word's own cell keeps its paragraphs: no split, join or line break.
      if (event.key === "Enter" || joinBefore || joinAfter) event.preventDefault();
      return;
    }
    if (!split && !joinBefore && !joinAfter) return;
    event.preventDefault();
    const targetIndex = joinBefore ? paragraphIndex - 1 : paragraphIndex;
    const nextCell = split ? splitBandRichCellParagraph(cell, paragraphIndex, from, to) : joinBandRichCellParagraph(cell, targetIndex);
    if (nextCell === cell) return;
    paragraphFocusRef.current = {owner:editing,block:blockIndex,cell:cellIndex,paragraph:split ? paragraphIndex + 1 : targetIndex,offset:split ? 0 : bandRichRunsText(cell.paragraphs![targetIndex].runs).length};
    setDraftRich(previous => previous?.map((part,index) => index === blockIndex && part.type === "table" ? {...part,cells:part.cells.map((value,position) => position === cellIndex ? nextCell : value)} : part) ?? previous);
  }, [draftRich, editing, hasWriteAuthority]);

  const removeRichRun = useCallback(
    (blockIndex: number, runIndex: number) => {
      if (!hasWriteAuthority() || editing?.mode !== "full") return;
      setDraftRich((previous) => {
        if (!previous) return previous;
        const next = JSON.parse(JSON.stringify(previous)) as BandRichBlock[];
        const block = next[blockIndex];
        if (block?.type !== "paragraph" || !block.runs[runIndex]) {
          return previous;
        }
        block.runs.splice(runIndex, 1);
        return next;
      });
    },
    [editing?.mode, hasWriteAuthority],
  );

  const removeRichImage = useCallback(
    (blockIndex: number, imageIndex: number) => {
      if (!hasWriteAuthority() || editing?.mode !== "full") return;
      setDraftRich((previous) => {
        if (!previous) return previous;
        const next = JSON.parse(JSON.stringify(previous)) as BandRichBlock[];
        const block = next[blockIndex];
        if (block?.type !== "paragraph" || !block.images) return previous;
        block.images.splice(imageIndex, 1);
        if (block.images.length === 0) delete block.images;
        return next;
      });
    },
    [editing?.mode, hasWriteAuthority],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        commit();
      }
    },
    [commit],
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent) => {
      const relatedTarget = event.relatedTarget;
      if (
        relatedTarget instanceof Node &&
        islandRef.current?.contains(relatedTarget)
      ) {
        return; // moving focus to a chip inside the island
      }
      if (
        relatedTarget instanceof Element &&
        relatedTarget.closest(HEADER_FOOTER_CONTEXT_CONTROL_SELECTOR)
      ) {
        return; // the contextual Ribbon owns this story until explicit close
      }
      if (
        relatedTarget instanceof Element &&
        relatedTarget.closest(COMMAND_DIALOG_SELECTOR)
      ) {
        // A command dialog opened from the story (Insert Alignment Tab, Date
        // and Time) acts on it: Word keeps the header open behind the dialog.
        return;
      }
      const usableRelatedTarget =
        relatedTarget instanceof Node &&
        relatedTarget.isConnected &&
        relatedTarget !== document.body &&
        relatedTarget !== document.documentElement;
      if (!usableRelatedTarget && contextualPointerOwnedRef.current) {
        return; // pointerdown belongs to contextual chrome; mousedown owns it
      }
      commit();
    },
    [commit],
  );

  // The strips drawn now are cut again around the body objects over them
  // (bandObjectHoles): a strip that mounts as it scrolls into view is whole.
  useLayoutEffect(() => {
    announceBandLayerDrawn();
  });

  return (
    <div
      ref={setLayerHost}
      className="sheet-band-edit-layer"
      data-testid="sheet-band-edit-layer"
      aria-disabled={!canEdit || undefined}
    >
      {boxes.map((box, index) => {
        if (!sheetBoxInRange(drawnRange, index) && editing?.index !== index) return null;
        const variant = variantForSheet(index, box.sectionIndex);
        return (
          <div
            key={index}
            className="sheet-band-box sheet-band-box--hits"
            style={{
              ...boxStyle?.(box, index),
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            }}
          >
            {showCropMarks ? (
              <span
                className="sheet-crop-marks"
                aria-hidden="true"
                data-testid={`sheet-crop-marks-${index}`}
              >
                <span className="sheet-crop-mark sheet-crop-mark--top-left" />
                <span className="sheet-crop-mark sheet-crop-mark--top-right" />
                <span className="sheet-crop-mark sheet-crop-mark--bottom-left" />
                <span className="sheet-crop-mark sheet-crop-mark--bottom-right" />
              </span>
            ) : null}
            {(["header", "footer"] as const).map((kind) => {
              const active =
                editing !== null &&
                editing.index === index &&
                editing.kind === kind;
              const rich = isRichBand(kind, variant, box.sectionIndex);
              const hint = rich ? labels.richHint : labels.editHint;
              const interactionSuppressed = popupOpen || !canEdit;
              if (!active) {
                return (
                  <div
                    key={kind}
                    className={`sheet-band-hit sheet-band-hit--${kind}${
                      interactionSuppressed
                        ? " sheet-band-hit--popup-suppressed"
                        : ""
                    }`}
                    data-testid={`sheet-band-hit-${kind}-${index}`}
                    title={interactionSuppressed ? undefined : hint}
                    onMouseDown={(event) => {
                      // The band owns this gesture. The outer paper's margin
                      // handler otherwise queues a body-focus frame which
                      // closes the freshly opened island via blur.
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDoubleClick={(event) =>
                      handleHitDoubleClick(index, kind, event)
                    }
                    // A finger: a double tap opens the band (an iPad does
                    // not dependably send dblclick), and the first tap shows
                    
                    onClick={(event) => {
                      if (isDoubleTap(event.nativeEvent, `${kind}:${index}`)) {
                        handleHitDoubleClick(index, kind, event);
                      }
                    }}
                    {...TOUCH_REVEAL_PROPS}
                  >
                    {/* The 双击编辑 affordance must never surface under an
                        open popup — the strip is pointer-inert then and the
                        hint (native title AND styled span) is withheld. */}
                    {interactionSuppressed ? null : (
                      <span className="sheet-band-hit__hint">{hint}</span>
                    )}
                  </div>
                );
              }
              // A story open in its own editor is Word's header/footer pane:
              // the text stays where the page draws it, a rule across the
              // page and a tag mark the area, and the ribbon's Header &
              // Footer tab carries the commands (page number at the current
              // position, Close Header and Footer).
              const story = editing.mode === "full" && Boolean(storyExtensions);
              return (
                <div
                  key={kind}
                  ref={islandRef}
                  className={`sheet-band-island sheet-band-island--${kind}${
                    story ? " sheet-band-island--story" : ""
                  }`}
                  data-testid={`sheet-band-island-${kind}`}
                >
                  {story ? (
                    <span className="sheet-band-island__rule" aria-hidden="true" />
                  ) : null}
                  <span className="sheet-band-island__tag" data-testid="sheet-band-island-tag">
                    {variantLabel(kind, editing.variant, labels, {
                      oddEven: (sectionFlags?.(editing.sectionIndex) ?? { differentOddEven }).differentOddEven,
                      sectionIndex: editing.sectionIndex,
                      sectionCount: boxes.reduce((count, sheet) => Math.max(count, sheet.sectionIndex + 1), 1),
                    })}
                  </span>
                  {story &&
                  labels.sameAsPrevious &&
                  editing.sectionIndex > 0 &&
                  isLinkedToPrevious?.(editing.sectionIndex, kind, editing.variant) ? (
                    <span
                      className="sheet-band-island__tag sheet-band-island__tag--linked"
                      data-testid="sheet-band-island-same-as-previous"
                    >
                      {labels.sameAsPrevious}
                    </span>
                  ) : null}
                  {editing.mode !== "full" &&
                  (editing.mode === "none" ? labels.nativeReadOnly : labels.nativeTextOnly) ? (
                    <span
                      className="sheet-band-island__notice"
                      data-testid={`sheet-band-native-${editing.mode}`}
                      role="note"
                    >
                      {editing.mode === "none" ? labels.nativeReadOnly : labels.nativeTextOnly}
                    </span>
                  ) : null}
                  {refusal && labels.nativeRefusal ? (
                    <span
                      className="sheet-band-island__notice sheet-band-island__notice--refusal"
                      data-testid="sheet-band-native-refusal"
                      data-reason={refusal}
                      role="alert"
                    >
                      {labels.nativeRefusal(refusal)}
                    </span>
                  ) : null}
                  {editing.mode === "full" && storyExtensions ? (
                    <BandStoryEditor
                      key={`${editing.index}:${editing.kind}:${editing.variant}:${authoritativeStoryRevision}`}
                      initialBlocks={
                        draftRich ??
                        (draft.trim()
                          ? draft
                              .split("\n")
                              .map((line) => ({
                                type: "paragraph" as const,
                                // A plain band is drawn and exported centred
                                // (the sheet chrome and the DOCX writer);
                                // its editor opened it left-aligned.
                                align: "center" as const,
                                runs: bandRichRunsFromTokenText(line),
                              }))
                          : [])
                      }
                      textWidthTwips={bandTextWidthTwips(box)}
                      paragraphStyleId={bandParagraphStyleId(documentAttrs, kind)}
                      extensions={storyExtensions}
                      fieldContext={bandFieldContext?.(editing.index, editing.kind)}
                      editable={canEdit}
                      documentAttrs={documentAttrs ?? {}}
                      ariaLabel={variantLabel(kind, editing.variant, labels)}
                      onChange={(blocks, unsupported) => {
                        if (!hasWriteAuthority()) return;
                        setDraftRich(blocks);
                        draftUnsupportedRef.current = unsupported.length > 0
                          ? bandStoryUnsupportedRefusal(unsupported)
                          : null;
                        setRefusal(
                          unsupported.length
                            ? bandStoryUnsupportedRefusal(unsupported)
                            : (getBandCommitRefusal?.(editing.kind, editing.variant, editing.sectionIndex, blocks) ??
                                null),
                        );
                      }}
                      onDocumentAttrsChange={(patch) => onDocumentAttrsChange?.(patch)}
                      onBlockRefused={() => setRefusal(BAND_STORY_BLOCK_REFUSED)}
                      onReady={setStoryEditor}
                      onEscape={commit}
                      onBlur={(event) => handleBlur(event as unknown as React.FocusEvent)}
                    />
                  ) : draftRich ? (
                    <div
                      className="sheet-band-island__rich-editor"
                      data-testid="sheet-band-rich-editor"
                      onBlur={handleBlur}
                    >
                      {draftRich.map((block, blockIndex) =>
                        block.type === "paragraph" ? (
                          <div
                            key={`p-${blockIndex}`}
                            className="sheet-band-island__rich-paragraph"
                            style={{ textAlign: block.align ?? "left" }}
                          >
                            {block.runs.map((run, runIndex) =>
                              run.token ? (
                                <button
                                  type="button"
                                  key={`field-${runIndex}`}
                                  className="sheet-band-island__field-chip"
                                  data-testid={`sheet-band-rich-field-${run.token}`}
                                  aria-label={labels.removeField(run.token)}
                                  disabled={!canEdit || editing.mode !== "full"}
                                  onMouseDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={() =>
                                    removeRichRun(blockIndex, runIndex)
                                  }
                                >
                                  {`{${run.token}} ×`}
                                </button>
                              ) : (
                                <input
                                  key={`run-${runIndex}`}
                                  className="sheet-band-island__rich-run"
                                  data-testid={`sheet-band-rich-run-${blockIndex}-${runIndex}`}
                                  aria-label={`${variantLabel(
                                    kind,
                                    editing.variant,
                                    labels,
                                  )} ${blockIndex + 1}.${runIndex + 1}`}
                                  maxLength={500}
                                  disabled={
                                    !canEdit ||
                                    editing.mode === "none" ||
                                    !isBandRichRunTypable(run, editing.mode === "text")
                                  }
                                  value={run.text ?? ""}
                                  style={{
                                    fontWeight: run.bold ? 600 : undefined,
                                    fontStyle: run.italic
                                      ? "italic"
                                      : undefined,
                                    textDecoration: run.underline
                                      ? "underline"
                                      : undefined,
                                    fontSize: run.sizePt
                                      ? `${run.sizePt}pt`
                                      : undefined,
                                    color: run.color,
                                  }}
                                  onChange={(event) =>
                                    updateRichRun(
                                      blockIndex,
                                      runIndex,
                                      event.target.value,
                                    )
                                  }
                                  onKeyDown={handleKeyDown}
                                />
                              ),
                            )}
                            {editing.mode === "full" &&
                            block.runs.every((run) => Boolean(run.token)) ? (
                              <input
                                className="sheet-band-island__rich-run"
                                data-testid={`sheet-band-rich-run-${blockIndex}-new`}
                                aria-label={variantLabel(
                                  kind,
                                  editing.variant,
                                  labels,
                                )}
                                maxLength={500}
                                disabled={!canEdit}
                                value=""
                                onChange={(event) =>
                                  appendRichRun(blockIndex, event.target.value)
                                }
                                onKeyDown={handleKeyDown}
                              />
                            ) : null}
                            {(block.images ?? []).map((image, imageIndex) => (
                              <span
                                key={`image-${imageIndex}`}
                                className="sheet-band-island__rich-image-wrap"
                              >
                                <img
                                  src={documentPictureDisplaySrc(image.src)}
                                  alt=""
                                  draggable={false}
                                  className="sheet-band-island__rich-image"
                                />
                                <button
                                  type="button"
                                  className="sheet-band-island__rich-image-remove"
                                  aria-label={labels.removeImage}
                                  disabled={!canEdit || editing.mode !== "full"}
                                  onMouseDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={() =>
                                    removeRichImage(blockIndex, imageIndex)
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <table
                            key={`table-${blockIndex}`}
                            className="sheet-band-island__rich-table"
                          >
                            <tbody>
                              {Array.from({ length: block.rows }, (_, row) => (
                                <tr key={row}>
                                  {block.cells
                                    .filter((cell) => cell.row === row)
                                    .sort((a, b) => a.col - b.col)
                                    .map((cell) => {
                                      const cellIndex =
                                        block.cells.indexOf(cell);
                                      return (
                                        <td
                                          key={`${cell.row}:${cell.col}`}
                                          colSpan={cell.colspan}
                                          rowSpan={cell.rowspan}
                                        >
                                          {(cell.paragraphs ?? [null]).map((paragraph, paragraphIndex) => <textarea
                                            key={paragraphIndex}
                                            rows={Math.min(3, (paragraph ? bandRichRunsText(paragraph.runs) : cell.text).split("\n").length)}
                                            className="sheet-band-island__rich-cell"
                                            data-testid={`sheet-band-rich-cell-${blockIndex}-${cellIndex}${paragraphIndex ? `-paragraph-${paragraphIndex}` : ""}`}
                                            aria-label={`${variantLabel(
                                              kind,
                                              editing.variant,
                                              labels,
                                            )} ${blockIndex + 1}.${cell.row + 1}.${cell.col + 1}${(cell.paragraphs?.length ?? 0) > 1 ? `.${paragraphIndex + 1}` : ""}`}
                                            maxLength={Math.max(0, 500 - (cell.text.length - (paragraph ? bandRichRunsText(paragraph.runs).length : cell.text.length)))}
                                            disabled={
                                              !canEdit ||
                                              editing.mode === "none" ||
                                              (editing.mode === "text" &&
                                                (!paragraph?.runs.some((run) => isBandRichRunTypable(run, true)) ||
                                                  !isBandRichSlotParagraphWhole(paragraph.runs)))
                                            }
                                            value={paragraph ? bandRichRunsText(paragraph.runs) : cell.text}
                                            onChange={(event) =>
                                              updateRichCell(
                                                blockIndex,
                                                cellIndex,
                                                event.target.value,
                                                paragraph ? paragraphIndex : undefined,
                                              )
                                            }
                                            onKeyDown={(event) => { handleCellParagraphKey(event, blockIndex, cellIndex, paragraphIndex); if (!event.defaultPrevented) handleKeyDown(event); }}
                                          />)}
                                        </td>
                                      );
                                    })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ),
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={textareaRef}
                      className="sheet-band-island__input"
                      data-testid="sheet-band-island-input"
                      rows={2}
                      maxLength={MAX_HEADER_FOOTER_LENGTH}
                      disabled={!canEdit || editing.mode !== "full"}
                      value={draft}
                      onChange={(event) => {
                        if (hasWriteAuthority()) setDraft(event.target.value);
                      }}
                      onKeyDown={handleKeyDown}
                      onBlur={handleBlur}
                    />
                  )}
                  {story ? null : (
                  <div className="sheet-band-island__chips">
                    <button
                      type="button"
                      className="sheet-band-island__chip"
                      data-testid="sheet-band-insert-page"
                      disabled={!canEdit || editing.mode !== "full"}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertToken(BAND_PAGE_TOKEN)}
                    >
                      {labels.insertPageNumber}
                    </button>
                    <button
                      type="button"
                      className="sheet-band-island__chip"
                      disabled={!canEdit || editing.mode !== "full"}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertToken(BAND_NUMPAGES_TOKEN)}
                    >
                      {labels.insertPageCount}
                    </button>
                    <button
                      type="button"
                      className="sheet-band-island__chip sheet-band-island__chip--primary"
                      data-testid="sheet-band-done"
                      disabled={!canEdit}
                      onClick={commit}
                      // A read-only story has nothing else to focus: Done
                      // holds the island's focus, so Escape and clicking
                      // away close it as they do from a run.
                      onBlur={editing.mode === "none" ? handleBlur : undefined}
                      onKeyDown={(event) => {
                        if (editing.mode === "none" && event.key === "Escape") {
                          event.preventDefault();
                          commit();
                        }
                      }}
                    >
                      {labels.done}
                    </button>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * NoteEditor renders on every keystroke of a long document (its causal model
 * publishes a fresh snapshot per transaction); every prop of this layer is a
 * memoized value or callback there, so a render that changed none of them
 * keeps the 158-page hit layer instead of rebuilding its element tree.
 */
export default memo(SheetBandEditLayer);
