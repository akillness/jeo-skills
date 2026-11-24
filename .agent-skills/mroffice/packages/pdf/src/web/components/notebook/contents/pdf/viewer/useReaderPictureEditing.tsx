"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * In-place picture editing in the PDF reader, as WPS 6.8.2 does it (图片编辑,
 * wps/image-selected.png): a click on a picture the page paints selects it
 * on the reading canvas -- same zoom, same scroll, no other surface -- with
 * the WPS frame, the floating tools beside it, the 图片编辑 contextual tab
 * and the picture's right-click menu. Every command is one native write
 * through the host (`PdfNativePictureCommitRequest`), so each is one Undo
 * step of the window's receipt journal:
 *
 * - move / resize (Shift keeps the ratio) / free turn (Shift snaps 15°) by
 *   the frame, the 90° turns, the mirrors, the crop and the transparency are
 *   one page-space affine (`reader-picture-geometry.ts`) on the paint;
 * - delete, replace (替换图片) and 清晰化 (the picture's own pixels enhanced
 *   and written back as a replacement);
 * - z-order (置于顶层 / 置于底层 / one step);
 * - copy / cut / paste: a copy is painted as new page content where the
 *   pointer is, keeping the size and angle it is shown with;
 * - 提取文字 runs the reader's OCR on the picture; 保存图片 / 提取图片 save its
 *   original bytes (its decoded pixels when the PDF holds no file of it);
 *   图片另存为PDF saves a one-page PDF of it.
 *
 * While a write saves, the frame stands where it was asked to go and a new
 * frame gesture is held, then run on the written page.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  BringToFront,
  ClipboardPaste,
  Copy,
  FileImage,
  ImageDown,
  Scissors,
  ScanText,
  SendToBack,
  Sparkles,
  Trash2,
  BoxSelect,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import type { PointerContextMenuEntry } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { OfficePictureCorrectionsMenu } from "@mrnote/core/web/components/office-ribbon/OfficePictureAdjustMenus.tsx";
import { OfficeAltTextPane } from "@mrnote/core/web/components/office-ribbon/OfficeAltTextPane.tsx";
import DocumentPictureFormatPane from "@mrnote/docs/web/components/console/editor/native-document/DocumentPictureFormatPane.tsx";
import { imageCorrectionDeltaFromStored, imageCorrectionStoredFromDelta } from "@mrnote/core/web/lib/presentation-image-effects.ts";
import { normalizeOfficeArtisticEffect } from "@mrnote/core/web/lib/office-artistic-effects.ts";
import { MRAI_NATIVE_ALT_TEXT_MAX_LENGTH } from "../../../../../lib/pdf/engine/native/content-stream-transaction";
import type { OfficePictureStyleId } from "@mrnote/core/web/lib/office-picture-styles/catalog.ts";
import type { PdfPictureFormat } from "../../../../../lib/pdf/picture-format";
import { DropdownMenuItem } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import type { PercentBox } from "../../../../../lib/pdf/annotation-transform";
import { pdfNativeEmbeddedImagePaintMatrixMatches } from "../../../../../lib/pdf/engine/native/embedded-image-model";
import { nativeVectorLayerBoundary } from "../../../../../lib/pdf/native-vector-layer-boundary";
import { buildPdfFromImages } from "../../../../../lib/pdf/images-to-pdf";
import { enhancePicturePixels } from "../../../../../lib/pdf/picture-enhance";
import {
  cropPictureCanvas,
  encodePictureCanvas,
  readPdfPagePicturePixels,
  type PdfPicturePageLike,
} from "../../../../../lib/pdf/picture-pixels";
import {
  concatAffine,
  IDENTITY_AFFINE,
  readerPictureAffineIsIdentity,
  readerPictureBounds,
  readerPictureBox,
  readerPictureBoxFromPercent,
  readerPictureCropIntent,
  readerPictureCropOnWholeSquare,
  readerPictureDisplayTransform,
  readerPictureFlip,
  readerPicturePageClipCrop,
  readerPicturePasteMatrix,
  readerPicturePercentBox,
  readerPictureQuarterOrientation,
  readerPictureTurn,
  readerPictureUserTransform,
  readerPictureVisibleUnitRect,
  type ReaderPictureAffine,
  type ReaderPictureBox,
  type ReaderPictureDisplay,
} from "../../../../../lib/pdf/reader-picture-geometry";
import { formatOfficeShortcut } from "@mrnote/core/web/lib/office-context-menu.ts";
import { downloadBlobFile } from "@mrnote/core/web/lib/download-file.ts";
import { normalizeRotationDegrees } from "@mrnote/core/web/lib/presentation-drag.ts";

import type {
  PdfPictureFormatContextRibbonModel,
} from "../PdfPictureFormatContextRibbon";
import type {
  PdfNativeImageTarget,
  PdfNativePictureCommitOutcome,
  PdfNativePictureCommitRequest,
  PdfNativePictureAlt,
  PdfNativePictureOrigin,
  PdfNativePictureOriginal,
} from "./nativeImageTarget";
import { useReaderPictureFormat, type ReaderPictureFormat } from "./useReaderPictureFormat";
import {
  alignTransform,
  multiplyAffine,
  paintDisplayBox,
  positionTransform,
  type PdfAffine,
} from "./readerPictureFormatGeometry";
import type {
  PdfReaderPictureRibbonCommands,
  PdfReaderPictureRibbonModel,
} from "../PdfReaderPictureFormatRibbon";
import {
  DocumentPictureCompressionDialog,
} from "@mrnote/docs/web/components/console/editor/native-document/DocumentPictureCompressionDialog.tsx";
import { DOCUMENT_PICTURE_COMPRESSION_PRESETS } from "@mrnote/core/web/components/console/editor/native-document/documentPictureCompression.ts";
import { DocumentPictureDrawDialog } from "@mrnote/docs/web/components/console/editor/native-document/DocumentPictureDrawDialog.tsx";
import {
  PdfReaderPictureLayer,
  PdfReaderPicturePendingPreview,
  type PdfReaderPictureCarry,
  type PdfReaderPictureCropRect,
} from "./PdfReaderPictureLayer";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The native writers' encoded-picture ceiling (2 MB). */
const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
const KEYBOARD_NUDGE_PERCENT = 0.5;
const KEYBOARD_FAST_NUDGE_PERCENT = 2;
/** A pointer position older than this does not place a paste. */
const POINTER_FRESH_MS = 60_000;
/** A write whose page never shows it lets the frame go after this. */
const PENDING_TIMEOUT_MS = 10_000;




const PENDING_IN_FLIGHT_TIMEOUT_MS = 120_000;
/** A Picture Format write's drawing stays in its frame this long for the
 * page to paint it: gone sooner, the old picture showed for the seconds
 * between (a page read again under load took up to 33 s). */
const PENDING_PREVIEW_TIMEOUT_MS = 45_000;

/**
 * The reader's own drag stage for a source picture (the page split around
 * the picture's paint, as for a source vector): the picture leaves its place
 * as it moves and what the page paints over it stays. Each call names the
 * picture; `preview` answers false when the stage cannot carry it (its page
 * layers are not in hand), and the layer then carries a copy of its pixels.
 */
export interface ReaderPictureCarry {
  readonly prewarm: (target: PdfNativeImageTarget) => void;
  readonly preview: (target: PdfNativeImageTarget, preview: PercentBox | null, start: PercentBox) => boolean;
  readonly turn: (target: PdfNativeImageTarget, turn: number | null, start: PercentBox) => boolean;
  /** Let go: the pixels stay at `box` (turned by `turn`) until the page
   * paints the write. */
  readonly settle: (target: PdfNativeImageTarget, box: PercentBox, turn?: number) => void;
  /** No write follows: the pixels go back with the frame. */
  readonly release: (target: PdfNativeImageTarget) => void;
  /** The drop waits for the write before it: the pixels stay at it through
   * that write's repaint too, until the drop's own write repaints. */
  readonly hold?: (target: PdfNativeImageTarget) => void;
  /** The page over `region` once the picture is drawn at `opacity` and
   * `dx`, `dy` (percent of the page) away, from the layers in hand: shown
   * while a Transparency or Position write saves. The layers are rendered
   * first when they are not in hand (the page painted a write since). */
  readonly compose?: (
    target: PdfNativeImageTarget,
    change: {
      readonly opacity?: number;
      readonly dx?: number;
      readonly dy?: number;
      /** A new drawing in place of the picture, filling `box` turned by
       * `turn` degrees about its centre. */
      readonly picture?: Readonly<{ canvas: HTMLCanvasElement; box: PercentBox; turn?: number }>;
    },
    region: PercentBox,
  ) => Promise<HTMLCanvasElement | null>;
}

export interface UseReaderPictureEditingInput {
  readonly t: Translate;
  /** Edit Content is on and the select tool is armed: pictures are targets. */
  readonly active: boolean;
  readonly targetsByPage: ReadonlyMap<number, readonly PdfNativeImageTarget[]>;
  readonly pageProxiesRef: RefObject<Map<number, unknown>>;
  readonly viewerRootRef: RefObject<HTMLElement | null>;
  /** The page as shown: user space to displayed pixels at scale 1. */
  readonly displayForPage: (pageNumber: number) => ReaderPictureDisplay | null;
  readonly onCommit?: (
    request: PdfNativePictureCommitRequest,
  ) => Promise<PdfNativePictureCommitOutcome>;
  readonly onOriginal?: (
    target: PdfNativeImageTarget,
  ) => Promise<PdfNativePictureOriginal | null>;
  /** The picture's alternate text as the file holds it (Alt Text). */
  readonly onReadAlt?: (target: PdfNativeImageTarget) => Promise<PdfNativePictureAlt | null>;
  /** Where a picture the Picture Format redrew came from, as the file names it. */
  readonly onReadOrigin?: (target: PdfNativeImageTarget) => Promise<PdfNativePictureOrigin | null>;
  /** Why no picture write can run now (read-only page, host busy...). */
  readonly writeDisabledReason?: string;
  readonly notify: (message: string | null, tone?: "error" | "status") => void;
  readonly documentName: string;
  /** OCR of the picture's region through the reader's own flow. */
  readonly extractText: (pageNumber: number, box: PercentBox, options?: { translate?: boolean }) => boolean;
  readonly insertPicture?: () => void;
  readonly selectAll?: () => void;
  /** Changes whenever the placed-annotation clipboard is filled: the newer
   * copy is the one Cmd+V pastes. */
  readonly placedClipboardToken: unknown;
  /** The reader is about to select a picture: other selections let go. */
  readonly onBeforeSelect?: () => void;
  /** Open the reader's right-click menu at a viewport point. */
  readonly openContextMenu: (x: number, y: number) => void;
  /** The reader's drag stage, when it can carry a picture. */
  readonly carry?: ReaderPictureCarry;
  /**
   * Another native write of the document is on its way (an Undo/Redo replay,
   * another edit). A size typed for the picture meanwhile waits for it and
   * is applied to the picture as the page then shows it (user audit PDF
   * 0097: typed during a Redo, the new height was dropped and the page said
   * Saved).
   */
  readonly documentWriteBusy?: boolean;
  /** The UI locale: the Picture Format tab's length unit, its dialogs. */
  readonly locale?: string;
  /**
   * Each page's paint stops (`pdfPagePaintStops`), read from the operator
   * list the targets came from: Office greys Bring Forward / Bring to Front
   * once the picture is painted last on its page and Send Backward / Send to
   * Back once it is painted first, as the source vectors' arrange does. A
   * page whose stops are not known leaves every move live; the planner stays
   * the authority on the write.
   */
  readonly paintStopsByPage?: ReadonlyMap<number, readonly number[]>;
}

export interface ReaderPictureEditing {
  /** The selected picture as the page now paints it. */
  readonly selected: PdfNativeImageTarget | null;
  readonly busy: boolean;
  /** A write is saving, or a gesture waits for one (read live). */
  readonly isWriting: () => boolean;
  readonly select: (target: PdfNativeImageTarget) => void;
  readonly clear: () => void;
  /** Right-click on a picture: it is selected; the caller opens the menu. */
  readonly selectForMenu: (target: PdfNativeImageTarget, event: ReactMouseEvent) => void;
  readonly contextMenuEntries: PointerContextMenuEntry[];
  readonly ribbonModel: PdfPictureFormatContextRibbonModel | null;
  readonly ribbonCommands: {
    readonly onInsertPicture?: () => void;
    readonly onExtractOriginal: () => void;
    readonly onChangePicture: () => void;
    readonly onDeletePicture: () => void;
    readonly onOpacityChange: (opacity: number) => void;
    readonly onSharpenPicture: () => void;
    readonly onCropPicture: () => void;
    readonly onRotatePicture: (direction: "left" | "right") => void;
    readonly onFlipPicture: (axis: "horizontal" | "vertical") => void;
    readonly onArrangePicture: (direction: "front" | "back" | "forward" | "backward") => void;
    readonly onResizePicturePoints: (width: number, height: number) => void;
  };
  /** The Picture Format tab laid out as Docs' (PdfReaderPictureFormatRibbon). */
  readonly docsRibbonModel: PdfReaderPictureRibbonModel | null;
  readonly docsRibbonCommands: Omit<PdfReaderPictureRibbonCommands, "onExit">;
  /** Compress Pictures and Draw, Docs' own dialogs, open over the reader. */
  readonly dialogs: ReactNode;
  /** Format Picture and Alt Text, Docs' panes, floating over the pages'
   * right edge (rendered inside the reader's body). */
  readonly panes: ReactNode;
  readonly renderLayer: (pageNumber: number, pageWidth: number, pageHeight: number) => ReactNode;
  /** The hidden file input 替换图片 opens. */
  readonly fileInput: ReactNode;
}

interface PictureClipboard {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly matrix: ReaderPictureAffine;
  readonly visibleUnit: { x: number; y: number; width: number; height: number };
  readonly sourceDisplay: ReaderPictureDisplay;
  readonly pageNumber: number;
  readonly order: number;
}

interface PendingPictureWrite {
  readonly id: number;
  readonly pageNumber: number;
  readonly order: number;
  readonly sourceSha256: string | undefined;
  /** Where the frame stands while the write saves. */
  readonly frame: { box: PercentBox; rotation: number } | null;
  /** A Picture Format write's drawing, shown in the frame meanwhile. */
  readonly preview: HTMLCanvasElement | null;
  /** Where `preview` stands when it is not the frame: the page around the
   * picture's old and new place, put together from its layers. */
  readonly previewBox?: PercentBox | null;
  /** The turn `preview` is drawn at in `previewBox`. */
  readonly previewTurn?: number;
  readonly landed: boolean;
}

/** The box (page percent) a box turned about its centre by `turn` degrees
 * covers, the page shown `display.width` x `display.height`. */
function turnedPercentBounds(
  box: PercentBox,
  turn: number,
  display: Readonly<{ width: number; height: number }>,
): PercentBox {
  if (Math.abs(turn) < 1e-6) return box;
  const w = (box.width / 100) * display.width;
  const h = (box.height / 100) * display.height;
  const radians = (turn * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(radians)) + Math.abs(h * Math.sin(radians));
  const bh = Math.abs(w * Math.sin(radians)) + Math.abs(h * Math.cos(radians));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const width = (bw / display.width) * 100;
  const height = (bh / display.height) * 100;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** The smallest box holding both. */
function percentUnion(a: PercentBox, b: PercentBox): PercentBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** The picture as this window's staged writes left it, while the page still
 * lists it on the bytes they started from (`basedOn`). */
interface PictureSuccessor {
  readonly basedOn: string | undefined;
  readonly target: PdfNativeImageTarget;
}

/**
 * The picture as a staged write left it: its paint after `pageTransform`, on
 * `sourceSha256`. Only for a picture drawn whole (its visible box is its
 * paint's box), whose new box is then its new paint's; null otherwise.
 */
function successorTarget(
  target: PdfNativeImageTarget,
  sourceSha256: string,
  pageTransform: PdfAffine | readonly number[] | null,
  opacity: number | undefined,
  /** The write took the picture's crop away: it now shows its whole paint. */
  wholePaint = false,
): PdfNativeImageTarget | null {
  // Its place in the operator list is the old bytes'; the writers find it
  // by its paint.
  const withOpacity = { operatorIndex: undefined, ...(opacity === undefined ? {} : { sourceOpacity: opacity }) };
  const matrix = target.matrix as PdfAffine | undefined;
  const display = target.display;
  const fractions = (paint: PdfAffine) => {
    const box = paintDisplayBox(paint, display!);
    return { x: box.left / display!.width, y: box.top / display!.height,
      width: (box.right - box.left) / display!.width, height: (box.bottom - box.top) / display!.height };
  };
  if (wholePaint) {
    return matrix && display && !target.rotated
      ? { ...target, sourceSha256, bounds: fractions(matrix), ...withOpacity } : null;
  }
  if (!pageTransform || readerPictureAffineIsIdentity(pageTransform as PdfAffine)) {
    return { ...target, sourceSha256, ...withOpacity };
  }
  if (!matrix || !display || target.rotated) return null;
  const shown = fractions(matrix);
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.002;
  if (!near(shown.x, target.bounds.x) || !near(shown.y, target.bounds.y) ||
    !near(shown.width, target.bounds.width) || !near(shown.height, target.bounds.height)) return null;
  const next = multiplyAffine(matrix, pageTransform as PdfAffine);
  return { ...target, sourceSha256, matrix: next, bounds: fractions(next), ...withOpacity };
}

function frameOf(target: PdfNativeImageTarget): {
  box: ReaderPictureBox;
  display: ReaderPictureDisplay;
} | null {
  if (!target.matrix || !target.display) return null;
  const display: ReaderPictureDisplay = {
    transform: target.display.transform,
    width: target.display.width,
    height: target.display.height,
  };
  return {
    box: readerPictureBox({ matrix: target.matrix, display, visible: target.bounds }),
    display,
  };
}


/** Whether a frame (percent of the page as shown, turned by `rotation`)
 * stands past the clips its picture is drawn under: moved there, the
 * picture is taken out from under them and drawn whole (leaveClips). */
function frameLeavesClips(
  target: PdfNativeImageTarget,
  frame: Readonly<{ box: PercentBox; rotation: number }>,
): boolean {
  const clip = target.enclosingClip;
  if (!clip) return false;
  const radians = (frame.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  // The turned frame's bounding box, in page fractions (an approximation
  // across a page that is not square, where it is only a margin of error).
  const width = (frame.box.width * cos + frame.box.height * sin) / 100;
  const height = (frame.box.width * sin + frame.box.height * cos) / 100;
  const cx = (frame.box.x + frame.box.width / 2) / 100;
  const cy = (frame.box.y + frame.box.height / 2) / 100;
  const slack = 0.002;
  return cx - width / 2 < clip.x - slack || cy - height / 2 < clip.y - slack ||
    cx + width / 2 > clip.x + clip.width + slack || cy + height / 2 > clip.y + clip.height + slack;
}

/** The crop a geometry write of a page-cut picture carries (its visible
 * part, kept as its own clip so it goes with the picture); null for any
 * other picture. */
function pageClipCropOf(
  target: PdfNativeImageTarget,
  info: { box: ReaderPictureBox; display: ReaderPictureDisplay },
) {
  if (!target.pageClipped || !target.matrix || info.box.rotation !== 0 || info.box.skewed) return null;
  return readerPicturePageClipCrop({ box: info.box, matrix: target.matrix, display: info.display });
}

function signedAngle(degrees: number): number {
  const normalized = normalizeRotationDegrees(degrees);
  return normalized > 180 ? normalized - 360 : normalized;
}

function downloadName(base: string, target: PdfNativeImageTarget, extension: string): string {
  const stem = (base || "document").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "_");
  return `${stem}-page${target.pageNumber}-picture${target.order + 1}.${extension}`;
}

/** A picture's bytes as PNG, for the system clipboard (it takes no JPEG). */
async function pngBlobOf(bytes: Uint8Array, mimeType: string): Promise<Blob> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mimeType }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no png"))), "image/png"),
    );
  } finally {
    bitmap.close?.();
  }
}

export function useReaderPictureEditing(
  input: UseReaderPictureEditingInput,
): ReaderPictureEditing {
  const {
    t,
    active,
    targetsByPage,
    pageProxiesRef,
    viewerRootRef,
    displayForPage,
    onCommit,
    onOriginal,
    onReadAlt,
    onReadOrigin,
    writeDisabledReason,
    notify,
    documentName,
    extractText,
    insertPicture,
    selectAll,
    placedClipboardToken,
    onBeforeSelect,
    openContextMenu,
    carry,
    documentWriteBusy = false,
    locale = "en",
    paintStopsByPage,
  } = input;
  const documentWriteBusyRef = useRef(documentWriteBusy);
  useLayoutEffect(() => {
    documentWriteBusyRef.current = documentWriteBusy;
  });
  const [selection, setSelection] = useState<{ pageNumber: number; order: number } | null>(null);
  const [pending, setPending] = useState<PendingPictureWrite | null>(null);
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });
  const pendingIdRef = useRef(0);
  const carryRef = useRef(carry);
  useLayoutEffect(() => {
    carryRef.current = carry;
  });
  const [failureEpoch, setFailureEpoch] = useState(0);
  const [cropping, setCropping] = useState<PdfReaderPictureCropRect | null>(null);
  const [clipboard, setClipboard] = useState<PictureClipboard | null>(null);
  const clipboardRef = useRef(clipboard);
  useLayoutEffect(() => {
    clipboardRef.current = clipboard;
  });
  /** After a paste or a z-order move: the picture to select once its page
   * is read again, found by where it is drawn (a z-order move keeps that and
   * changes its order; a paste draws it there). */
  const [follow, setFollow] = useState<{
    readonly pageNumber: number;
    readonly matrix: readonly number[] | null;
    /** The page's bytes as shown before the write. */
    readonly sourceSha256: string | undefined;
    /** A paste: how many pictures the page listed before it. */
    readonly countBefore?: number;
    /** The person's choice of picture when it was set (userChoiceRef). */
    readonly choice?: number;
  } | null>(null);
  



  const userChoiceRef = useRef(0);
  /** A frame gesture made while a write saves, run once it has landed. */
  const heldFrameRef = useRef<{ box: PercentBox; rotation: number } | null>(null);
  const isWriting = useCallback(
    () => Boolean(pendingRef.current) || Boolean(heldFrameRef.current),
    [],
  );
  const lastPointerRef = useRef<{ pageNumber: number; x: number; y: number; at: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The newest copy is the one Cmd+V pastes: a placed annotation copied
  // after a picture takes the clipboard over.
  const [seenPlacedToken, setSeenPlacedToken] = useState(placedClipboardToken);
  if (seenPlacedToken !== placedClipboardToken) {
    setSeenPlacedToken(placedClipboardToken);
    if (placedClipboardToken && clipboard) setClipboard(null);
  }

  // So does text copied after the picture (the text editor's ⌘C, a field,
  // the browser's Copy): the system clipboard holds the text now, and 粘贴
  // pasted the older picture into the file (user audit PDF 0079). A picture's
  // own copy takes its keys before the browser copies, so it fires no event.
  useEffect(() => {
    const takenOver = () => setClipboard((current) => (current ? null : current));
    document.addEventListener("copy", takenOver, true);
    document.addEventListener("cut", takenOver, true);
    return () => {
      document.removeEventListener("copy", takenOver, true);
      document.removeEventListener("cut", takenOver, true);
    };
  }, []);

  const pageTargets = selection ? targetsByPage.get(selection.pageNumber) : undefined;
  const resolved = selection
    ? (pageTargets?.find((target) => target.order === selection.order) ?? null)
    : null;
  // While the page is read again (a save shows its revision) its targets
  // are briefly missing: the picture stays selected as it was. Kept as
  // state adjusted during render (React's derived-state pattern).
  const [lastResolved, setLastResolved] = useState<PdfNativeImageTarget | null>(null);
  if (resolved && resolved !== lastResolved) setLastResolved(resolved);
  if (!selection && lastResolved) setLastResolved(null);
  const selected =
    active && selection
      ? (resolved ??
        (pageTargets === undefined &&
        lastResolved?.pageNumber === selection.pageNumber &&
        lastResolved.order === selection.order
          ? lastResolved
          : null))
      : null;
  const selectedRef = useRef(selected);
  // Where the selected picture stands among what its page paints.
  const selectedPaintStops = selected ? paintStopsByPage?.get(selected.pageNumber) : undefined;
  const selectedOperatorIndex = selected?.operatorIndex;
  const layerBoundary = useMemo(
    () =>
      selectedPaintStops && typeof selectedOperatorIndex === "number"
        ? nativeVectorLayerBoundary(selectedPaintStops, selectedOperatorIndex)
        : { atFront: false, atBack: false },
    [selectedOperatorIndex, selectedPaintStops],
  );
  const layerBoundaryRef = useRef(layerBoundary);
  useLayoutEffect(() => {
    layerBoundaryRef.current = layerBoundary;
  });
  // The picture format, read by commands declared before it (Delete, Arrange).
  const pictureFormatRef = useRef<ReaderPictureFormat | null>(null);
  useLayoutEffect(() => {
    selectedRef.current = selected;
  });

  // The picture is gone from a page read again (deleted, undone) or Edit
  // Content ended: the selection lets go.
  if (selection && (!active || (pageTargets && !resolved && !pending))) {
    setSelection(null);
    if (cropping) setCropping(null);
  }

  // A pending write lets go once the page shows other bytes than those it
  // was planned on. Checked whenever the write has landed, not only when the
  // targets change: the page can list the written revision's pictures
  // before the write's answer is back, and a gesture held behind it then
  // waited for the timeout (10 s).
  if (pending?.landed) {
    const targets = targetsByPage.get(pending.pageNumber);
    if (targets && targets[0]?.sourceSha256 !== pending.sourceSha256) {
      setPending(null);
    }
  }
  // A paste selects its copy once the page lists it.
  const [seenTargets, setSeenTargets] = useState(targetsByPage);
  if (seenTargets !== targetsByPage) {
    setSeenTargets(targetsByPage);
    if (follow) {
      const targets = targetsByPage.get(follow.pageNumber);
      const reread =
        targets !== undefined &&
        (follow.countBefore === undefined
          ? targets.length > 0 && targets[0].sourceSha256 !== follow.sourceSha256
          : targets.length > follow.countBefore);
      if (targets && reread && follow.countBefore === undefined && follow.choice !== undefined &&
        follow.choice !== userChoiceRef.current) {
        setFollow(null);
      } else if (targets && reread) {
        setFollow(null);
        const drawn = targets.filter((target) =>
          pdfNativeEmbeddedImagePaintMatrixMatches(target.matrix, follow.matrix),
        );
        if (drawn.length === 1) {
          setSelection({ pageNumber: follow.pageNumber, order: drawn[0].order });
        } else if (follow.countBefore !== undefined) {
          // A paste draws last on its page.
          const last = targets.reduce((best, target) => (target.order > best.order ? target : best));
          setSelection({ pageNumber: follow.pageNumber, order: last.order });
        } else {
          setSelection(null);
        }
      }
    }
  }
  useEffect(() => {
    if (!pending) return;
    const id = pending.id;
    const timer = window.setTimeout(() => {
      setPending((current) => (current?.id === id ? null : current));
    }, pending.landed
      ? pending.preview ? PENDING_PREVIEW_TIMEOUT_MS : PENDING_TIMEOUT_MS
      : PENDING_IN_FLIGHT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const select = useCallback(
    (target: PdfNativeImageTarget) => {
      onBeforeSelect?.();
      userChoiceRef.current += 1;
      setCropping(null);
      setSelection({ pageNumber: target.pageNumber, order: target.order });
    },
    [onBeforeSelect],
  );
  const clear = useCallback(() => {
    userChoiceRef.current += 1;
    setSelection(null);
    setCropping(null);
    heldFrameRef.current = null;
  }, []);

  const canWrite = Boolean(onCommit) && !writeDisabledReason;
  const refuseWhenReadOnly = useCallback((): boolean => {
    if (!onCommit || writeDisabledReason) {
      if (writeDisabledReason) notify(writeDisabledReason, "error");
      return true;
    }
    return false;
  }, [notify, onCommit, writeDisabledReason]);

  const successorRef = useRef<PictureSuccessor | null>(null);
  /** `target`, or where this window's staged writes left it while the page
   * still lists it on the bytes before them. */
  const latestTarget = useCallback((target: PdfNativeImageTarget): PdfNativeImageTarget => {
    const chain = successorRef.current;
    if (!chain || chain.target.pageNumber !== target.pageNumber || chain.target.order !== target.order) return target;
    if (target === chain.target) return target;
    if (target.sourceSha256 !== chain.basedOn) {
      // The page lists it on other bytes now: it caught up.
      successorRef.current = null;
      return target;
    }
    return chain.target;
  }, []);

  /** Run one write; the frame stands at `frame` until the page shows it. */
  const runWrite = useCallback(
    async (
      request: PdfNativePictureCommitRequest,
      frame: { box: PercentBox; rotation: number } | null,
      preview: HTMLCanvasElement | null = null,
      /** Where `preview` stands when the frame does not say (a picture turned
       * past 45 degrees keeps its own frame meanwhile). */
      place: { box: PercentBox; rotation: number } | null = null,
    ): Promise<PdfNativePictureCommitOutcome | null> => {
      if (!onCommit) return null;
      if (request.kind !== "append") {
        request = { ...request, target: latestTarget(request.target) } as PdfNativePictureCommitRequest;
      }
      if (request.kind !== "append" && pendingRef.current) {
        // A command given while the last write is on its way, or while the
        // page is read again after it, waits for the page to list the picture
        // where that write left it and runs on it there: it ran on the
        // picture's old place (refused, 「图片修改未能保存」) or was turned away.
        // A write that landed where its place is known without the page
        // (successorRef) is not waited for.
        const { pageNumber: page, order } = request.target;
        if (!(pendingRef.current.landed && successorRef.current?.target === request.target)) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[pdf-picture] write waits for the last", { landed: pendingRef.current.landed });
          }
          const deadline = Date.now() + PENDING_IN_FLIGHT_TIMEOUT_MS;
          while (pendingRef.current && Date.now() < deadline) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
          }
          const current = selectedRef.current;
          if (pendingRef.current) {
            notify(t("pdf.viewer.picture.busy"), "status");
            return null;
          }
          if (!current || current.pageNumber !== page || current.order !== order) return null;
          request = { ...request, target: latestTarget(current) } as PdfNativePictureCommitRequest;
        }
      }
      const target = request.kind === "append" ? null : request.target;
      const id = ++pendingIdRef.current;
      const pageNumber = request.kind === "append" ? request.pageNumber : request.target.pageNumber;
      // What the page lists now: the write lets go once it lists other bytes.
      const chain = target && successorRef.current?.target === target ? successorRef.current : null;
      const shownSha = chain ? chain.basedOn
        : target?.sourceSha256 ?? targetsByPage.get(pageNumber)?.[0]?.sourceSha256;
      const next: PendingPictureWrite = {
        id,
        pageNumber,
        order: target?.order ?? -1,
        sourceSha256: shownSha,
        frame,
        preview,
        ...(preview && place ? { previewBox: place.box, previewTurn: place.rotation } : {}),
        landed: false,
      };
      pendingRef.current = next;
      setPending(next);
      let outcome: PdfNativePictureCommitOutcome;
      try {
        outcome = await onCommit(request);
      } catch {
        outcome = { ok: false, reason: t("pdf.pageWindow.picture.writeFailed") };
      }
      if (!outcome.ok) {
        // The copy is not where this window thought: the page decides again.
        successorRef.current = null;
        heldFrameRef.current = null;
        setPending((current) => (current?.id === id ? null : current));
        setFailureEpoch((epoch) => epoch + 1);
        // The frame goes back: so do the picture's pixels on the stage.
        if (target) carryRef.current?.release(target);
        notify(outcome.reason, "error");
        return outcome;
      }
      if (request.kind === "remove" || request.kind === "arrange") successorRef.current = null;
      if (request.kind === "remove") {
        setPending((current) => (current?.id === id ? null : current));
        setSelection(null);
        return outcome;
      }
      if (request.kind === "arrange") {
        setFollow({ pageNumber, matrix: request.target.matrix ?? null, sourceSha256: shownSha,
          choice: userChoiceRef.current });
      }
      // Moved out from under its clips, the picture is drawn last: the
      // selection and its format follow it there (they stayed on its old
      // number, and Reset Picture & Size then wrote it on another picture).
      if (request.kind === "transform" && target && typeof outcome.imageOrder === "number" &&
        outcome.imageOrder !== target.order) {
        setFollow({ pageNumber, sourceSha256: shownSha, choice: userChoiceRef.current,
          matrix: target.matrix ? multiplyAffine(target.matrix as PdfAffine, request.pageTransform as PdfAffine) : null });
        pictureFormatRef.current?.moved(pageNumber, target.order, outcome.imageOrder);
      }
      // Where the write left the picture, when that is known without
      // reading the page again: the next command need not wait for it (a
      // page's inspection failing under load left its pictures listed on the
      // bytes before, and every later write missed the working copy).
      const resetCrop = request.kind === "transform" && request.cropMode === "reset";
      const successor = target && outcome.sourceSha256 && (request.kind === "replace" || request.kind === "alt" ||
        resetCrop || (request.kind === "transform" && !request.crop && !request.leaveClips && !request.cropMode))
        ? successorTarget(target, outcome.sourceSha256, (request.kind === "transform" || request.kind === "replace") ? request.pageTransform ?? null : null,
          request.kind === "transform" ? request.opacity : undefined, resetCrop)
        : null;
      if (request.kind === "replace" || request.kind === "transform" || request.kind === "alt") {
        successorRef.current = successor ? { basedOn: shownSha, target: successor } : null;
      }
      if (pendingRef.current?.id === id) pendingRef.current = { ...pendingRef.current, landed: true };
      setPending((current) =>
        current?.id === id ? { ...current, landed: true } : current,
      );
      return outcome;
    },
    [latestTarget, notify, onCommit, t, targetsByPage],
  );

  // Where this window's writes left the picture (re-read with each landing).
  const frameInfo = useMemo(
    () => (selected ? frameOf(latestTarget(selected)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pending` marks a landing
    [latestTarget, pending, selected],
  );
  const shownFrame = useMemo(() => {
    if (!selected || !frameInfo) return null;
    const own = {
      box: readerPicturePercentBox(frameInfo.box, frameInfo.display),
      rotation: frameInfo.box.rotation,
    };
    if (
      pending?.frame &&
      pending.pageNumber === selected.pageNumber &&
      pending.order === selected.order
    ) {
      return pending.frame;
    }
    // Between a write's repaint and the held gesture's own write (the next
    // effect), the frame stays at the held drop: it stepped back to the
    // write before for that moment.
    if (!pending && heldFrameRef.current) return heldFrameRef.current;
    return own;
  }, [frameInfo, pending, selected]);

  /** Carry the selected picture from the frame it shows to `to`. */
  const writeFrame = useCallback(
    (to: { box: PercentBox; rotation: number }) => {
      const target = selectedRef.current;
      if (!target) return;
      // Nothing is written: pixels let go at the drop go back with the frame.
      const release = () => carryRef.current?.release(target);
      if (refuseWhenReadOnly()) return release();
      const info = frameOf(target);
      if (!info) return release();
      if (pendingRef.current) {
        // Held: written from where the picture will then stand. Its pixels
        // stay at the drop through the write before it.
        if (!heldFrameRef.current) carryRef.current?.hold?.(target);
        heldFrameRef.current = to;
        setPending((current) => (current ? { ...current, frame: to } : current));
        return;
      }
      const toBox = readerPictureBoxFromPercent(to.box, to.rotation, info.display, info.box.skewed);
      const motion = readerPictureDisplayTransform(info.box, toBox);
      const pageTransform = motion
        ? readerPictureUserTransform(info.display.transform, motion)
        : null;
      if (!pageTransform || readerPictureAffineIsIdentity(pageTransform)) return release();
      const crop = pageClipCropOf(target, info);
      const leaveClips = frameLeavesClips(target, to);
      void runWrite({ kind: "transform", target, pageTransform, ...(crop ? { crop } : {}),
        ...(leaveClips ? { leaveClips: true as const } : {}) }, to).then((outcome) => {
        // Refused before it started (another write still saving).
        if (outcome === null) release();
      });
    },
    [refuseWhenReadOnly, runWrite],
  );
  // A held gesture runs once its predecessor's page is shown.
  useEffect(() => {
    if (pending || !heldFrameRef.current || !selected) return;
    const held = heldFrameRef.current;
    heldFrameRef.current = null;
    writeFrame(held);
  }, [pending, selected, writeFrame]);

  /** One motion of the picture about its frame (a turn, a mirror). */
  const writeMotion = useCallback(
    (
      motionFor: (box: ReaderPictureBox) => ReaderPictureAffine,
      frameAfter: (frame: { box: PercentBox; rotation: number }) => { box: PercentBox; rotation: number },
      


      carryTurn?: number,
      


      carryMirror?: "horizontal" | "vertical",
    ) => {
      const target = selectedRef.current;
      if (!target || refuseWhenReadOnly()) return;
      const info = frameOf(target);
      if (!info) return;
      const pageTransform = readerPictureUserTransform(info.display.transform, motionFor(info.box));
      if (!pageTransform) return;
      const frame = {
        box: readerPicturePercentBox(info.box, info.display),
        rotation: info.box.rotation,
      };
      const crop = pageClipCropOf(target, info);
      if (carryTurn !== undefined && carryRef.current?.turn(target, carryTurn, frame.box)) {
        // Let go once the stage holds the turn (its state is committed with
        // the next render): settled at once it found no stage, stayed a
        // preview and was never taken off -- Undo left the turned pixels.
        const carry = carryRef.current;
        requestAnimationFrame(() => requestAnimationFrame(() => carry?.settle(target, frame.box, carryTurn)));
      }
      if (carryMirror && Math.abs(frame.rotation % 360) < 1e-6) {
        const mirrored = carryMirror === "horizontal"
          ? { ...frame.box, mirrorX: true } : { ...frame.box, mirrorY: true };
        const carry = carryRef.current;
        if (carry?.preview(target, mirrored, frame.box)) {
          requestAnimationFrame(() => requestAnimationFrame(() => carry.settle(target, mirrored)));
        }
      }
      const after = frameAfter(frame);
      void runWrite({ kind: "transform", target, pageTransform, ...(crop ? { crop } : {}),
        ...(frameLeavesClips(target, after) ? { leaveClips: true as const } : {}) }, after);
    },
    [refuseWhenReadOnly, runWrite],
  );

  const turn = useCallback(
    (degrees: number) =>
      writeMotion(
        (box) => readerPictureTurn(box, degrees),
        (frame) => ({ box: frame.box, rotation: frame.rotation + degrees }),
        degrees,
      ),
    [writeMotion],
  );
  const flip = useCallback(
    (axis: "horizontal" | "vertical") =>
      writeMotion(
        (box) => readerPictureFlip(box, axis),
        (frame) => ({ box: frame.box, rotation: -frame.rotation }),
        undefined,
        axis,
      ),
    [writeMotion],
  );
  /** The page put together for the write just started, shown over its
   * region from the moment it is drawn until the page paints the write (or
   * not at all, when that write already let go). */
  const showComposed = useCallback((composed: Promise<HTMLCanvasElement | null>, box: PercentBox) => {
    const id = pendingRef.current?.id;
    if (id === undefined) return;
    void composed.then((canvas) => {
      if (!canvas) return;
      const current = pendingRef.current;
      if (current?.id !== id || current.preview) return;
      pendingRef.current = { ...current, preview: canvas, previewBox: box, previewTurn: 0 };
      setPending((latest) => (latest?.id === id && !latest.preview
        ? { ...latest, preview: canvas, previewBox: box, previewTurn: 0 } : latest));
    });
  }, []);
  const setOpacity = useCallback(
    (opacity: number) => {
      const target = selectedRef.current;
      if (!target || refuseWhenReadOnly()) return;
      if (Math.abs((target.sourceOpacity ?? 1) - opacity) < 1e-6) return;
      // The page shows the picture at its new opacity at once, put together
      
      const info = frameOf(target);
      const region = info && Math.abs(info.box.rotation) < 1e-6
        ? readerPicturePercentBox(info.box, info.display)
        : null;
      const composed = region ? carryRef.current?.compose?.(target, { opacity }, region) ?? null : null;
      void runWrite({ kind: "transform", target, pageTransform: IDENTITY_AFFINE, opacity }, null);
      if (composed && region) showComposed(composed, region);
    },
    [refuseWhenReadOnly, runWrite, showComposed],
  );
  const remove = useCallback(() => {
    const target = selectedRef.current;
    if (!target || refuseWhenReadOnly()) return;
    void runWrite({ kind: "remove", target }, null).then((outcome) => {
      if (outcome?.ok) pictureFormatRef.current?.forget(target);
    });
  }, [refuseWhenReadOnly, runWrite]);
  const arrange = useCallback(
    (direction: "front" | "back" | "forward" | "backward") => {
      const target = selectedRef.current;
      if (!target || refuseWhenReadOnly()) return;
      // A move to the end the picture already stands at is greyed, and
      // answers nothing when it is reached another way (a menu kept open).
      const boundary = layerBoundaryRef.current;
      if ((direction === "front" || direction === "forward") && boundary.atFront) return;
      if ((direction === "back" || direction === "backward") && boundary.atBack) return;
      void runWrite({ kind: "arrange", target, direction }, null).then((outcome) => {
        if (outcome?.ok && typeof outcome.imageOrder === "number") {
          pictureFormatRef.current?.moved(target.pageNumber, target.order, outcome.imageOrder);
        }
      });
    },
    [refuseWhenReadOnly, runWrite],
  );
  /** The picture moved by a transform after its paint (Position, Align),
   * kept inside the crop it has, as every move of it is. */
  /** A size typed while another write of the document was on its way. */
  const deferredResizeRef = useRef<{
    /** The size typed; null where it kept the picture's size then. */
    readonly width: number | null;
    readonly height: number | null;
    readonly pageNumber: number;
    readonly order: number;
    readonly sourceSha256: string | undefined;
  } | null>(null);
  const [deferredResizeEpoch, setDeferredResizeEpoch] = useState(0);
  const resizePoints = useCallback(
    (width: number, height: number) => {
      const target = selectedRef.current;
      if (!target) return;
      const info = frameOf(target);
      if (!info || !(width > 0) || !(height > 0)) return;
      if (documentWriteBusyRef.current && !pendingRef.current) {
        // Measured now it would be planned on the picture as it was before
        // that write; it waits and is applied, in order, to the picture the
        // write leaves.
        deferredResizeRef.current = {
          width: Math.abs(width - info.box.width) > 1e-3 ? width : null,
          height: Math.abs(height - info.box.height) > 1e-3 ? height : null,
          pageNumber: target.pageNumber,
          order: target.order,
          sourceSha256: target.sourceSha256,
        };
        setDeferredResizeEpoch((epoch) => epoch + 1);
        notify(t("pdf.viewer.picture.busy"), "status");
        return;
      }
      // An upright picture keeps its top-left corner, a turned one its centre
      // (Office's size fields).
      const box = info.box;
      const upright = box.rotation === 0;
      const next: ReaderPictureBox = {
        ...box,
        width,
        height,
        cx: upright ? box.cx - box.width / 2 + width / 2 : box.cx,
        cy: upright ? box.cy - box.height / 2 + height / 2 : box.cy,
      };
      writeFrame({
        box: readerPicturePercentBox(next, info.display),
        rotation: box.rotation,
      });
    },
    [notify, t, writeFrame],
  );
  // The deferred size runs once the other write is done and the page shows
  // the picture it left (a new reading), or after a moment if the page reads
  // the same bytes again.
  useEffect(() => {
    const deferred = deferredResizeRef.current;
    if (!deferred || documentWriteBusy || pending) return;
    if (!selected || selected.pageNumber !== deferred.pageNumber || selected.order !== deferred.order) {
      deferredResizeRef.current = null;
      return;
    }
    const reread = selected.sourceSha256 !== deferred.sourceSha256;
    const timer = window.setTimeout(() => {
      if (deferredResizeRef.current !== deferred) return;
      deferredResizeRef.current = null;
      // Only what was typed changes: the other side is the picture's now
      // (a Redo that widened it keeps its width).
      const now = selectedRef.current;
      const box = now ? frameOf(now)?.box : null;
      if (!box) return;
      resizePoints(deferred.width ?? box.width, deferred.height ?? box.height);
    }, reread ? 0 : 1_500);
    return () => window.clearTimeout(timer);
  }, [deferredResizeEpoch, documentWriteBusy, pending, resizePoints, selected]);

  // ---- Crop ---------------------------------------------------------------
  const cropRefusal = useCallback(
    (target: PdfNativeImageTarget): string | null => {
      const info = frameOf(target);
      if (!info) return t("pdf.pageWindow.picture.sourceChanged");
      if (info.box.skewed) return t("pdf.viewer.picture.cropSkewed");
      // A turned picture's frame is its whole paint; a clip it already has
      // cannot be read back from the page, so a second crop is not offered.
      const bounds = readerPictureBounds(info.box);
      const visibleArea = target.bounds.width * info.display.width * target.bounds.height * info.display.height;
      if (info.box.rotation !== 0 && visibleArea < bounds.width * bounds.height * 0.98) {
        return t("pdf.viewer.picture.cropTurnedClipped");
      }
      return null;
    },
    [t],
  );
  const startCrop = useCallback(() => {
    const target = selectedRef.current;
    if (!target || refuseWhenReadOnly()) return;
    const refusal = cropRefusal(target);
    if (refusal) {
      notify(refusal, "error");
      return;
    }
    setCropping({ x: 0, y: 0, width: 1, height: 1 });
  }, [cropRefusal, notify, refuseWhenReadOnly]);
  /** Crop > Aspect Ratio: crop mode on with the largest centred rectangle
   * of the ratio the picture holds (Word's), to adjust and apply. */
  const startCropWithRatio = useCallback((ratioWidth: number, ratioHeight: number) => {
    const target = selectedRef.current;
    if (!target || refuseWhenReadOnly()) return;
    const refusal = cropRefusal(target);
    const info = frameOf(target);
    if (refusal || !info) {
      if (refusal) notify(refusal, "error");
      return;
    }
    const pictureRatio = info.box.width / Math.max(1e-6, info.box.height);
    const ratio = ratioWidth / ratioHeight;
    const width = ratio > pictureRatio ? 1 : ratio / pictureRatio;
    const height = ratio > pictureRatio ? pictureRatio / ratio : 1;
    setCropping({ x: (1 - width) / 2, y: (1 - height) / 2, width, height });
  }, [cropRefusal, notify, refuseWhenReadOnly]);
  /** Crop the picture to `crop` (fractions of its frame, top-left origin). */
  const applyCropRect = useCallback((target: PdfNativeImageTarget, crop: PdfReaderPictureCropRect) => {
    const info = frameOf(target);
    if (!info || !target.matrix) return;
    const visibleUnit = readerPictureVisibleUnitRect({
      box: info.box,
      matrix: target.matrix,
      display: info.display,
    });
    const measured = readerPictureCropIntent({
      box: info.box,
      crop,
      matrix: target.matrix,
      display: info.display,
      visibleUnit,
    });
    if (!measured) return;
    // A page-cut picture's visible part is no clip of its own: the writer
    // measures the crop on its whole square.
    const intent = target.pageClipped ? readerPictureCropOnWholeSquare(measured, visibleUnit) : measured;
    const radians = (info.box.rotation * Math.PI) / 180;
    const offsetX = (crop.x + crop.width / 2 - 0.5) * info.box.width;
    const offsetY = (crop.y + crop.height / 2 - 0.5) * info.box.height;
    const kept: ReaderPictureBox = {
      ...info.box,
      cx: info.box.cx + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
      cy: info.box.cy + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
      width: info.box.width * crop.width,
      height: info.box.height * crop.height,
    };
    return runWrite(
      { kind: "transform", target, pageTransform: IDENTITY_AFFINE, crop: intent },
      { box: readerPicturePercentBox(kept, info.display), rotation: info.box.rotation },
    );
  }, [runWrite]);
  const applyCrop = useCallback(() => {
    const target = selectedRef.current;
    const crop = cropping;
    setCropping(null);
    if (!target || !crop) return;
    void applyCropRect(target, crop);
  }, [applyCropRect, cropping]);

  // ---- Pixels ---------------------------------------------------------------
  const readPixels = useCallback(
    async (target: PdfNativeImageTarget): Promise<HTMLCanvasElement | null> => {
      const page = pageProxiesRef.current?.get(target.pageNumber) as PdfPicturePageLike | undefined;
      if (!page) return null;
      return readPdfPagePicturePixels(page, target.name);
    },
    [pageProxiesRef],
  );
  /** The picture as a file: its original bytes when the PDF holds them and
   * the whole picture shows, else its visible pixels. */
  const pictureFile = useCallback(
    async (
      target: PdfNativeImageTarget,
      options: {
        readonly visibleOnly: boolean;
        readonly lossless: boolean;
        /** Ask the host for the stored file (slower: it reads the PDF). */
        readonly preferOriginal: boolean;
      },
    ): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number; filename?: string } | null> => {
      const info = frameOf(target);
      const visibleUnit =
        info && target.matrix
          ? readerPictureVisibleUnitRect({ box: info.box, matrix: target.matrix, display: info.display })
          : { x: 0, y: 0, width: 1, height: 1 };
      const whole =
        visibleUnit.x <= 1e-4 &&
        visibleUnit.y <= 1e-4 &&
        visibleUnit.width >= 1 - 1e-4 &&
        visibleUnit.height >= 1 - 1e-4;
      if (onOriginal && options.preferOriginal && (whole || !options.visibleOnly)) {
        const original = await onOriginal(target).catch(() => null);
        if (original) {
          const pixels = await readPixels(target);
          return {
            bytes: original.bytes,
            mimeType: original.mimeType,
            width: pixels?.width ?? 0,
            height: pixels?.height ?? 0,
            filename: original.filename,
          };
        }
      }
      const pixels = await readPixels(target);
      if (!pixels) return null;
      const piece = options.visibleOnly ? cropPictureCanvas(pixels, visibleUnit) : pixels;
      if (options.lossless) {
        const blob = await new Promise<Blob | null>((resolve) => {
          try {
            piece.toBlob((value) => resolve(value), "image/png");
          } catch {
            resolve(null);
          }
        });
        if (!blob) return null;
        return {
          bytes: new Uint8Array(await blob.arrayBuffer()),
          mimeType: "image/png",
          width: piece.width,
          height: piece.height,
        };
      }
      const encoded = await encodePictureCanvas(piece, { maxBytes: PICTURE_MAX_BYTES, allowDownscale: true });
      return encoded
        ? { bytes: encoded.bytes, mimeType: encoded.mimeType, width: piece.width, height: piece.height }
        : null;
    },
    [onOriginal, readPixels],
  );

  // The Picture Format of the picture (useReaderPictureFormat): every format
  // drawn from the picture as it was before any, written as one step.
  // The format commands draw on the picture where the last write left it,
  // when the page has not listed it there yet.
  const formatTargetRef = useMemo<RefObject<PdfNativeImageTarget | null>>(() => ({
    get current() {
      const shown = selectedRef.current;
      return shown ? latestTarget(shown) : null;
    },
  }), [latestTarget]);
  const pictureFormat = useReaderPictureFormat({
    t,
    notify,
    selectedRef: formatTargetRef,
    readPixels,
    runWrite: (request, frame, preview, place) => {
      // A translucent picture's drawing is shown as the page will paint it:
      // at its opacity, over what the page paints under it. Drawn opaque, it
      
      const target = request.kind === "replace" ? request.target : null;
      const opacity = target?.sourceOpacity ?? 1;
      const at = frame ?? place ?? null;
      const display = target?.display;
      if (!target || !preview || !at || !display || opacity >= 1 - 1e-6) {
        return runWrite(request, frame, preview, place);
      }
      const shown = { x: target.bounds.x * 100, y: target.bounds.y * 100,
        width: target.bounds.width * 100, height: target.bounds.height * 100 };
      const region = percentUnion(shown, turnedPercentBounds(at.box, at.rotation, display));
      const written = runWrite(request, frame, null);
      const composed = carryRef.current?.compose?.(target,
        { picture: { canvas: preview, box: at.box, turn: at.rotation } }, region);
      if (composed) showComposed(composed, region);
      return written;
    },
    refuseWhenReadOnly,
    readOrigin: onReadOrigin,
  });
  pictureFormatRef.current = pictureFormat;
  // A picture style hovered: what its press would draw, with nothing written,
  // put together with the page under it as the press's own drawing is. It
  // stands until the press's drawing does, and goes at once otherwise.
  const [hoverFormat, setHoverFormat] = useState<Readonly<{ canvas: HTMLCanvasElement; box: PercentBox; turn: number; frame: PercentBox | null; pageNumber: number; order: number }> | null>(null);
  const hoverFormatTokenRef = useRef(0);
  const hoverFormatClearRef = useRef<number | null>(null);
  const hoverFormatPressedRef = useRef(false);
  const previewPictureStyle = useCallback((style: OfficePictureStyleId | null) => {
    if (hoverFormatClearRef.current !== null) window.clearTimeout(hoverFormatClearRef.current);
    hoverFormatClearRef.current = null;
    const token = ++hoverFormatTokenRef.current;
    if (style === null) {
      // After the event: a press clears the preview just before it commits.
      hoverFormatClearRef.current = window.setTimeout(() => {
        hoverFormatClearRef.current = null;
        if (!hoverFormatPressedRef.current) setHoverFormat(null);
      }, 0);
      return;
    }
    void pictureFormatRef.current?.draw(() => ({ style })).then(async (drawn) => {
      if (token !== hoverFormatTokenRef.current) return;
      if (!drawn) {
        setHoverFormat(null);
        return;
      }
      const { target, frame, canvas, upright } = drawn;
      const display = target.display;
      const shown = { x: target.bounds.x * 100, y: target.bounds.y * 100,
        width: target.bounds.width * 100, height: target.bounds.height * 100 };
      const region = display ? percentUnion(shown, turnedPercentBounds(frame.box, frame.rotation, display)) : null;
      const composed = region
        ? await carryRef.current?.compose?.(target, { picture: { canvas, box: frame.box, turn: frame.rotation } }, region) ?? null
        : null;
      if (token !== hoverFormatTokenRef.current) return;
      setHoverFormat(Object.freeze({
        ...(composed && region ? { canvas: composed, box: region, turn: 0 } : { canvas, box: frame.box, turn: frame.rotation }),
        frame: upright ? frame.box : null,
        pageNumber: target.pageNumber, order: target.order,
      }));
    }).catch(() => undefined);
  }, []);
  // A picture formatted in an earlier session: the file says what it was
  // drawn from, read when it is selected (the ribbon's format and Reset).
  const recallFormat = pictureFormat.recall;
  const selectedCarryKeyForFormat = selected
    ? `${selected.pageNumber}:${selected.order}:${selected.sourceSha256 ?? ""}`
    : null;
  useEffect(() => {
    if (selectedCarryKeyForFormat) recallFormat(selectedRef.current);
  }, [recallFormat, selectedCarryKeyForFormat]);
  // 清晰化 (Sharpen) reworks the picture itself: a format given after it
  // draws on the sharpened picture.
  const sharpen = useCallback(
    () =>
      pictureFormat.reworkPicture(
        (picture) => {
          const context = picture.getContext("2d");
          if (!context) return null;
          const image = context.getImageData(0, 0, picture.width, picture.height);
          const result = enhancePicturePixels(image.data, picture.width, picture.height);
          if (!result.stretched && !(result.sharpenedPixels > 0)) return null;
          context.putImageData(image, 0, 0);
          return picture;
        },
        {
          nothing: t("pdf.viewer.picture.sharpenNothing"),
          done: t("pdf.viewer.picture.sharpened"),
        },
      ),
    [pictureFormat, t],
  );
  // 校正 (Corrections): Office's Brightness/Contrast, kept as the picture's
  // format so a later preset replaces it rather than adding to it.
  const correct = useCallback(
    (brightness: number, contrast: number) =>
      pictureFormat.apply(() => ({ brightness, contrast })),
    [pictureFormat],
  );

  const replaceWith = useCallback(
    async (file: File) => {
      const target = selectedRef.current;
      if (!target || refuseWhenReadOnly()) return;
      let bytes: Uint8Array | null = null;
      let mimeType: "image/png" | "image/jpeg" | null = null;
      if ((file.type === "image/png" || file.type === "image/jpeg") && file.size <= PICTURE_MAX_BYTES) {
        bytes = new Uint8Array(await file.arrayBuffer());
        mimeType = file.type;
      } else {
        // Another picture format, or one too large for the writer: drawn
        // once and written as PNG or JPEG within the limit.
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
          bitmap.close?.();
          const encoded = await encodePictureCanvas(canvas, { maxBytes: PICTURE_MAX_BYTES, allowDownscale: true });
          if (encoded) {
            bytes = encoded.bytes;
            mimeType = encoded.mimeType;
          }
        } catch {
          bytes = null;
        }
      }
      if (!bytes || !mimeType) {
        notify(t("pdf.pageWindow.picture.replacementUnsupported"), "error");
        return;
      }
      // Another picture: the format given to this one is not its own.
      const outcome = await runWrite({ kind: "replace", target, bytes, mimeType }, null);
      if (outcome?.ok) pictureFormat.forget(target);
    },
    [notify, pictureFormat, refuseWhenReadOnly, runWrite, t],
  );
  const openReplacePicker = useCallback(() => {
    if (refuseWhenReadOnly()) return;
    fileInputRef.current?.click();
  }, [refuseWhenReadOnly]);

  const savePicture = useCallback(async () => {
    const target = selectedRef.current;
    if (!target) return;
    const file = await pictureFile(target, { visibleOnly: false, lossless: true, preferOriginal: true });
    if (!file) {
      notify(t("pdf.viewer.picture.saveFailed"), "error");
      return;
    }
    const extension = file.mimeType === "image/jpeg" ? "jpg" : "png";
    const ok = downloadBlobFile(
      file.filename ?? downloadName(documentName, target, extension),
      new Blob([file.bytes as BlobPart], { type: file.mimeType }),
    );
    notify(ok ? t("pdf.viewer.picture.saved") : t("pdf.viewer.picture.saveFailed"), ok ? "status" : "error");
  }, [documentName, notify, pictureFile, t]);

  const savePictureAsPdf = useCallback(async () => {
    const target = selectedRef.current;
    if (!target) return;
    const info = frameOf(target);
    const file = await pictureFile(target, { visibleOnly: true, lossless: false, preferOriginal: true });
    if (!file || (file.mimeType !== "image/png" && file.mimeType !== "image/jpeg")) {
      notify(t("pdf.viewer.picture.saveFailed"), "error");
      return;
    }
    try {
      // The page is the picture's own size as the PDF shows it, in points.
      const width = info ? info.box.width : file.width;
      const height = info ? info.box.height : file.height;
      // Its pixels as the page shows them too: a picture turned by quarter
      // turns or flipped is drawn so before it fills that page. Its stored
      // pixels went in unturned, stretched across the turned page (user
      // audit PDF 0080).
      let bytes = file.bytes;
      let mimeType = file.mimeType;
      const orientation = info && target.matrix && !info.box.skewed
        ? readerPictureQuarterOrientation(concatAffine(target.matrix, info.display.transform))
        : null;
      if (orientation && !(orientation.x[0] === 1 && orientation.y[1] === 1)) {
        const bitmap = await createImageBitmap(new Blob([file.bytes as BlobPart], { type: file.mimeType }));
        const canvas = document.createElement("canvas");
        canvas.width = orientation.swap ? bitmap.height : bitmap.width;
        canvas.height = orientation.swap ? bitmap.width : bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas");
        const [xa, xb] = orientation.x;
        const [ya, yb] = orientation.y;
        context.setTransform(xa, xb, ya, yb, xa < 0 || ya < 0 ? canvas.width : 0, xb < 0 || yb < 0 ? canvas.height : 0);
        context.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const encoded = await encodePictureCanvas(canvas, { maxBytes: PICTURE_MAX_BYTES, allowDownscale: true });
        if (!encoded) throw new Error("Picture not encoded");
        bytes = encoded.bytes;
        mimeType = encoded.mimeType;
      }
      const pdf = await buildPdfFromImages([
        {
          bytes,
          format: mimeType === "image/jpeg" ? "jpg" : "png",
          width: Math.max(1, width),
          height: Math.max(1, height),
        },
      ]);
      const ok = downloadBlobFile(
        downloadName(documentName, target, "pdf"),
        new Blob([pdf as BlobPart], { type: "application/pdf" }),
      );
      notify(ok ? t("pdf.viewer.picture.savedAsPdf") : t("pdf.viewer.picture.saveFailed"), ok ? "status" : "error");
    } catch {
      notify(t("pdf.viewer.picture.saveFailed"), "error");
    }
  }, [documentName, notify, pictureFile, t]);

  const runExtractText = useCallback((options?: { translate?: boolean }) => {
    const target = selectedRef.current;
    if (!target) return;
    const info = frameOf(target);
    const bounds = info ? readerPictureBounds(info.box) : null;
    const box: PercentBox = bounds && info
      ? {
          x: (bounds.x / info.display.width) * 100,
          y: (bounds.y / info.display.height) * 100,
          width: (bounds.width / info.display.width) * 100,
          height: (bounds.height / info.display.height) * 100,
        }
      : {
          x: target.bounds.x * 100,
          y: target.bounds.y * 100,
          width: target.bounds.width * 100,
          height: target.bounds.height * 100,
        };
    const clamped: PercentBox = {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(100, box.x + box.width) - Math.max(0, box.x),
      height: Math.min(100, box.y + box.height) - Math.max(0, box.y),
    };
    if (!(clamped.width > 0) || !(clamped.height > 0) || !extractText(target.pageNumber, clamped, options)) {
      notify(t("pdf.viewer.picture.ocrUnavailable"), "error");
    }
  }, [extractText, notify, t]);

  // ---- Clipboard --------------------------------------------------------------
  const copy = useCallback(async (): Promise<boolean> => {
    const target = selectedRef.current;
    const info = target?.matrix && target.display ? frameOf(target) : null;
    if (!target || !target.matrix || !info) {
      notify(t("pdf.viewer.picture.pixelsUnavailable"), "error");
      return false;
    }
    // The system clipboard is asked for at once, inside the key press or
    // click, with the picture to follow: Safari and WebKit refuse a write
    // made after the pixels are decoded (the gesture has ended), so Cmd+C
    // copied nothing for other applications although the menu said Cmd+C
    // (user audit PDF 0098). The reader's own clipboard is set either way.
    const png: { deliver: (blob: Blob) => void; withhold: () => void } = {
      deliver: () => undefined,
      withhold: () => undefined,
    };
    const pngPromise = new Promise<Blob>((resolve, reject) => {
      png.deliver = resolve;
      png.withhold = () => reject(new Error("picture pixels unavailable"));
    });
    pngPromise.catch(() => undefined);
    let systemWrite: Promise<unknown> | null = null;
    try {
      const ClipboardItemCtor = (globalThis as {
        ClipboardItem?: new (items: Record<string, Blob | Promise<Blob>>) => unknown;
      }).ClipboardItem;
      if (ClipboardItemCtor && navigator.clipboard?.write) {
        systemWrite = navigator.clipboard
          .write([new ClipboardItemCtor({ "image/png": pngPromise }) as ClipboardItem])
          .catch(() => undefined);
      }
    } catch {
      systemWrite = null;
    }
    const visibleUnit = readerPictureVisibleUnitRect({
      box: info.box,
      matrix: target.matrix,
      display: info.display,
    });
    // The decoded pixels: a copy is made at once, without reading the PDF.
    const file = await pictureFile(target, { visibleOnly: true, lossless: false, preferOriginal: false });
    if (!file || (file.mimeType !== "image/png" && file.mimeType !== "image/jpeg")) {
      png.withhold();
      notify(t("pdf.viewer.picture.pixelsUnavailable"), "error");
      return false;
    }
    setClipboard({
      bytes: file.bytes,
      mimeType: file.mimeType,
      matrix: target.matrix,
      visibleUnit,
      sourceDisplay: info.display,
      pageNumber: target.pageNumber,
      order: target.order,
    });
    // Other applications take PNG: a JPEG picture is re-encoded for them.
    if (systemWrite) {
      try {
        png.deliver(
          file.mimeType === "image/png"
            ? new Blob([file.bytes as BlobPart], { type: "image/png" })
            : await pngBlobOf(file.bytes, file.mimeType),
        );
      } catch {
        png.withhold();
      }
      await systemWrite;
    }
    notify(t("pdf.viewer.picture.copied"), "status");
    return true;
  }, [notify, pictureFile, t]);

  const cut = useCallback(async () => {
    if (refuseWhenReadOnly()) return;
    if (await copy()) remove();
  }, [copy, refuseWhenReadOnly, remove]);

  /** Paste the copied picture with its top-left at `point` (page
   * fractions), or at the pointer, or beside the original. */
  const paste = useCallback(
    async (point?: { pageNumber: number; x: number; y: number } | null) => {
      const copied = clipboardRef.current;
      if (!copied) {
        notify(t("pdf.viewer.picture.nothingToPaste"), "status");
        return;
      }
      if (refuseWhenReadOnly()) return;
      const pointer = lastPointerRef.current;
      const place =
        point ??
        (pointer && Date.now() - pointer.at < POINTER_FRESH_MS
          ? { pageNumber: pointer.pageNumber, x: pointer.x, y: pointer.y }
          : null);
      const targetPage = place?.pageNumber ?? copied.pageNumber;
      const display = displayForPage(targetPage);
      if (!display) {
        notify(t("pdf.pageWindow.picture.pasteFailed"), "error");
        return;
      }
      const at = place
        ? { x: place.x, y: place.y }
        : (() => {
            // Beside the original: a little down and to the right.
            const sourceTargets = targetsByPage.get(copied.pageNumber);
            const source = sourceTargets?.find((target) => target.order === copied.order);
            return source
              ? { x: source.bounds.x + 0.03, y: source.bounds.y + 0.03 }
              : { x: 0.1, y: 0.1 };
          })();
      const matrix = readerPicturePasteMatrix({
        matrix: copied.matrix,
        visibleUnit: copied.visibleUnit,
        sourceDisplay: copied.sourceDisplay,
        targetDisplay: display,
        point: at,
      });
      if (!matrix) {
        notify(t("pdf.pageWindow.picture.pasteFailed"), "error");
        return;
      }
      setFollow({
        pageNumber: targetPage,
        matrix,
        sourceSha256: targetsByPage.get(targetPage)?.[0]?.sourceSha256,
        countBefore: targetsByPage.get(targetPage)?.length ?? 0,
      });
      const outcome = await runWrite(
        {
          kind: "append",
          pageNumber: targetPage,
          bytes: copied.bytes,
          mimeType: copied.mimeType,
          matrix,
        },
        null,
      );
      if (!outcome?.ok) setFollow(null);
    },
    [displayForPage, notify, refuseWhenReadOnly, runWrite, t, targetsByPage],
  );

  const shownFrameRef = useRef(shownFrame);
  useLayoutEffect(() => {
    shownFrameRef.current = shownFrame;
  });

  // Where the pointer last was on a page, for a paste (WPS pastes there).
  useEffect(() => {
    const track = (event: PointerEvent) => {
      const root = viewerRootRef.current;
      const element = event.target instanceof Element ? event.target : null;
      const page = element?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
      if (!root || !page || !root.contains(page)) return;
      const rect = page.getBoundingClientRect();
      const pageNumber = Number(page.dataset.pageNumber);
      if (!Number.isInteger(pageNumber) || rect.width <= 0 || rect.height <= 0) return;
      lastPointerRef.current = {
        pageNumber,
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
        at: Date.now(),
      };
    };
    document.addEventListener("pointermove", track, { passive: true });
    document.addEventListener("pointerdown", track, { passive: true });
    return () => {
      document.removeEventListener("pointermove", track);
      document.removeEventListener("pointerdown", track);
    };
  }, [viewerRootRef]);

  // Keyboard: Cmd/Ctrl+C, X, V and Delete on the picture; the arrows nudge
  // it when its frame does not hold the keyboard. Escape belongs to the
  // reader (it ends Edit Content); only a crop in progress takes it first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const root = viewerRootRef.current;
      const element = target instanceof Element ? target : null;
      if (
        element?.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }
      const insideViewer = root !== null && element !== null && root.contains(element);
      const onDocument =
        target === document || target === document.body || target === document.documentElement;
      if (!insideViewer && !onDocument) return;
      const picture = selectedRef.current;
      const key = event.key.toLowerCase();
      const accelerator = (event.metaKey || event.ctrlKey) && !event.altKey;
      if (accelerator && key === "v" && clipboardRef.current && !event.shiftKey) {
        if (!picture && !lastPointerRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        void paste();
        return;
      }
      if (!picture) return;
      if (accelerator && key === "c") {
        event.preventDefault();
        event.stopPropagation();
        void copy();
        return;
      }
      if (accelerator && key === "x") {
        event.preventDefault();
        event.stopPropagation();
        void cut();
        return;
      }
      // The frame and the crop edges take their own keys; any other control
      // (a tool, a ribbon command, a menu) keeps its arrows and Delete.
      const keysTaken = element?.closest(
        "[data-pdf-native-picture-hit], [data-testid='pdf-native-picture-crop'], button, a[href], [role='menu'], [role='menuitem'], [role='toolbar'], [role='dialog'], [role='listbox'], [role='tablist'], [role='tab']",
      );
      if (keysTaken) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        remove();
        return;
      }
      const step = event.shiftKey ? KEYBOARD_FAST_NUDGE_PERCENT : KEYBOARD_NUDGE_PERCENT;
      const delta =
        event.key === "ArrowLeft"
          ? [-step, 0]
          : event.key === "ArrowRight"
            ? [step, 0]
            : event.key === "ArrowUp"
              ? [0, -step]
              : event.key === "ArrowDown"
                ? [0, step]
                : null;
      if (!delta || !shownFrameRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const frame = shownFrameRef.current;
      writeFrame({
        box: { ...frame.box, x: frame.box.x + delta[0], y: frame.box.y + delta[1] },
        rotation: frame.rotation,
      });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [copy, cut, paste, remove, viewerRootRef, writeFrame]);

  // ---- Menu -------------------------------------------------------------------
  // Where the menu was opened on the page: its 粘贴 pastes there.
  const menuPointRef = useRef<{ pageNumber: number; x: number; y: number } | null>(null);
  const rememberMenuPoint = useCallback((event: ReactMouseEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    const page = element?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
    const rect = page?.getBoundingClientRect();
    menuPointRef.current =
      page && rect && rect.width > 0 && rect.height > 0
        ? {
            pageNumber: Number(page.dataset.pageNumber),
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
          }
        : null;
  }, []);
  const selectForMenu = useCallback(
    (target: PdfNativeImageTarget, event: ReactMouseEvent) => {
      rememberMenuPoint(event);
      if (
        selectedRef.current?.pageNumber !== target.pageNumber ||
        selectedRef.current?.order !== target.order
      ) {
        select(target);
      }
    },
    [rememberMenuPoint, select],
  );
  /** One menu command by id; the entries carry no closures of their own. */
  const runMenuCommand = useCallback(
    (id: string) => {
      switch (id) {
        case "copy":
          void copy();
          return;
        case "cut":
          void cut();
          return;
        case "paste":
          void paste(menuPointRef.current);
          return;
        case "delete":
          remove();
          return;
        case "select-all":
          selectAll?.();
          return;
        case "sharpen":
          void sharpen();
          return;
        case "extract-text":
          runExtractText();
          return;
        case "extract-picture":
        case "save-picture":
          void savePicture();
          return;
        case "bring-to-front":
          arrange("front");
          return;
        case "send-to-back":
          arrange("back");
          return;
        case "save-as-pdf":
          void savePictureAsPdf();
          return;
      }
    },
    [arrange, copy, cut, paste, remove, runExtractText, savePicture, savePictureAsPdf, selectAll, sharpen],
  );
  const contextMenuEntries = useMemo<PointerContextMenuEntry[]>(() => {
    if (!selected) return [];
    const busy = Boolean(pending && !pending.landed);
    const writeReason = busy ? t("pdf.viewer.picture.busy") : canWrite ? undefined : writeDisabledReason;
    // WPS's picture menu (wps/tabs/img-menu.png), in its order.
    const rows: ReadonlyArray<
      | { id: string; label: string; icon: ReactNode; writes: boolean; shortcut?: string; disabledReason?: string }
      | { separator: string }
    > = [
      { id: "copy", label: t("pdf.viewer.picture.copy"), icon: officeContextMenuIcon("copy"), writes: false, shortcut: formatOfficeShortcut("Mod+C") },
      { id: "cut", label: t("pdf.viewer.picture.cut"), icon: officeContextMenuIcon("cut"), writes: true, shortcut: formatOfficeShortcut("Mod+X") },
      {
        id: "paste",
        label: t("pdf.viewer.picture.paste"),
        icon: officeContextMenuIcon("paste"),
        writes: true,
        shortcut: formatOfficeShortcut("Mod+V"),
        ...(clipboard ? {} : { disabledReason: t("pdf.viewer.picture.nothingToPaste") }),
      },
      { id: "delete", label: t("pdf.viewer.picture.delete"), icon: officeContextMenuIcon("delete"), writes: true, shortcut: "Delete" },
      { separator: "picture-clipboard-separator" },
      { id: "select-all", label: t("pdf.viewer.picture.selectAll"), icon: <BoxSelect size={16} />, writes: false, shortcut: formatOfficeShortcut("Mod+A") },
      { separator: "picture-select-separator" },
      { id: "sharpen", label: t("pdf.viewer.picture.sharpen"), icon: <Sparkles size={16} />, writes: true },
      { separator: "picture-adjust-separator" },
      { id: "extract-text", label: t("pdf.viewer.picture.extractText"), icon: <ScanText size={16} />, writes: false },
      { id: "extract-picture", label: t("pdf.viewer.picture.extractPicture"), icon: <ImageDown size={16} />, writes: false },
      { separator: "picture-extract-separator" },
      {
        id: "bring-to-front",
        label: t("pdf.viewer.picture.bringToFront"),
        icon: officeContextMenuIcon("bringForward"),
        writes: true,
        ...(layerBoundary.atFront ? { disabledReason: t("pdf.annotationFormat.alreadyAtFront") } : {}),
      },
      {
        id: "send-to-back",
        label: t("pdf.viewer.picture.sendToBack"),
        icon: officeContextMenuIcon("sendBackward"),
        writes: true,
        ...(layerBoundary.atBack ? { disabledReason: t("pdf.annotationFormat.alreadyAtBack") } : {}),
      },
      { separator: "picture-arrange-separator" },
      { id: "save-picture", label: t("pdf.viewer.picture.saveImage"), icon: <ImageDown size={16} />, writes: false },
      { id: "save-as-pdf", label: t("pdf.viewer.picture.saveAsPdf"), icon: <FileImage size={16} />, writes: false },
    ];
    return rows.map((row): PointerContextMenuEntry => {
      if ("separator" in row) return { id: row.separator, separator: true };
      const reason = row.disabledReason ?? (row.writes ? writeReason : undefined);
      return {
        id: row.id,
        label: row.label,
        icon: row.icon,
        testId: `pdf-picture-context-${row.id}`,
        ...(row.shortcut ? { shortcut: row.shortcut } : {}),
        ...(reason || (row.writes && (!canWrite || busy))
          ? { disabled: true, disabledReason: reason }
          : {}),
        onSelect: () => runMenuCommand(row.id),
      };
    });
  }, [canWrite, clipboard, layerBoundary, pending, runMenuCommand, selected, t, writeDisabledReason]);

  // ---- Ribbon ------------------------------------------------------------------
  const ribbonModel = useMemo<PdfPictureFormatContextRibbonModel | null>(() => {
    if (!selected || !frameInfo) return null;
    const busy = Boolean(pending && !pending.landed);
    const cropBlocked = cropRefusal(selected);
    return {
      page: selected.pageNumber,
      order: selected.order,
      width: shownFrame ? shownFrame.box.width / 100 : selected.bounds.width,
      height: shownFrame ? shownFrame.box.height / 100 : selected.bounds.height,
      widthPoints: shownFrame ? (shownFrame.box.width / 100) * frameInfo.display.width : frameInfo.box.width,
      heightPoints: shownFrame ? (shownFrame.box.height / 100) * frameInfo.display.height : frameInfo.box.height,
      // The frame turns with the picture: a turned picture takes every command.
      rotated: false,
      opacity: selected.sourceOpacity ?? 1,
      cropSupported: cropBlocked === null,
      rotationSupported: true,
      flipSupported: true,
      hasEdit: false,
      busy,
      writable: canWrite,
      ...(canWrite ? {} : { disabledReason: writeDisabledReason }),
      extractOriginalEnabled: true,
      arrangeEnabled: true,
      arrangeAtFront: layerBoundary.atFront,
      arrangeAtBack: layerBoundary.atBack,
      arrangeAtFrontReason: t("pdf.annotationFormat.alreadyAtFront"),
      arrangeAtBackReason: t("pdf.annotationFormat.alreadyAtBack"),
    };
  }, [canWrite, cropRefusal, frameInfo, layerBoundary, pending, selected, shownFrame, t, writeDisabledReason]);
  const ribbonCommands = useMemo(
    () => ({
      ...(insertPicture ? { onInsertPicture: insertPicture } : {}),
      onExtractOriginal: () => void savePicture(),
      onChangePicture: openReplacePicker,
      onDeletePicture: remove,
      onOpacityChange: setOpacity,
      onSharpenPicture: () => void sharpen(),
      onCropPicture: startCrop,
      onRotatePicture: (direction: "left" | "right") => turn(direction === "left" ? -90 : 90),
      onFlipPicture: flip,
      onArrangePicture: arrange,
      onResizePicturePoints: resizePoints,
    }),
    [arrange, flip, insertPicture, openReplacePicker, remove, resizePoints, savePicture, setOpacity, sharpen, startCrop, turn],
  );

  // ---- Picture Format tab, Docs' layout ------------------------------------------
  const [compressOpen, setCompressOpen] = useState(false);
  const [drawSource, setDrawSource] = useState<string | null>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const formatTarget = selected;
  // ---- Format Picture and Alt Text panes --------------------------------------
  type PaneTab = "fillLine" | "effects" | "layout" | "picture";
  const [pane, setPane] = useState<
    | Readonly<{ kind: "format"; opening: Readonly<{ tab: PaneTab; focusAlt: boolean }> | null }>
    | Readonly<{ kind: "alt"; focus: number }>
    | null
  >(null);
  const paneKey = formatTarget ? `${formatTarget.pageNumber}:${formatTarget.order}` : null;
  // The picture's alternate text as the file holds it, read when a pane
  // that shows it opens (a tagged PDF's /Figure /Alt).
  const [altInfo, setAltInfo] = useState<Readonly<{ key: string; tagged: boolean; alt: string }> | null>(null);
  const altShown = altInfo && altInfo.key === paneKey ? altInfo : null;
  useEffect(() => {
    if (!pane || !paneKey || !onReadAlt || altInfo?.key === paneKey) return;
    const target = formatTargetRef.current;
    if (!target) return;
    let cancelled = false;
    void onReadAlt(target).then((read) => {
      if (!cancelled) setAltInfo({ key: paneKey, tagged: read?.tagged ?? false, alt: read?.alt ?? "" });
    });
    return () => {
      cancelled = true;
    };
  }, [altInfo?.key, formatTargetRef, onReadAlt, pane, paneKey]);
  const commitAlt = useCallback(async (value: string, key: string | null): Promise<boolean> => {
    const target = formatTargetRef.current;
    if (!target || !key || key !== `${target.pageNumber}:${target.order}` || refuseWhenReadOnly()) return false;
    const alt = value.replace(/\s+/g, " ").trim().slice(0, MRAI_NATIVE_ALT_TEXT_MAX_LENGTH);
    if (altInfo?.key === key && altInfo.alt === alt) return true;
    const outcome = await runWrite({ kind: "alt", target, alt }, null);
    if (outcome?.ok) setAltInfo({ key, tagged: true, alt });
    return Boolean(outcome?.ok);
  }, [altInfo, formatTargetRef, refuseWhenReadOnly, runWrite]);
  // Each keystroke would be a revision of the file: the description is
  // written once the typing pauses, and when the pane closes.
  const altDraftRef = useRef<{ value: string; key: string | null; timer: number } | null>(null);
  const flushAlt = useCallback(() => {
    const draft = altDraftRef.current;
    if (!draft) return;
    window.clearTimeout(draft.timer);
    altDraftRef.current = null;
    void commitAlt(draft.value, draft.key);
  }, [commitAlt]);
  const typeAlt = useCallback((value: string, key: string | null) => {
    if (altDraftRef.current) window.clearTimeout(altDraftRef.current.timer);
    altDraftRef.current = { value, key, timer: window.setTimeout(() => flushAlt(), 900) };
  }, [flushAlt]);
  useEffect(() => () => {
    const draft = altDraftRef.current;
    if (draft) window.clearTimeout(draft.timer);
  }, []);
  const closePane = useCallback(() => {
    flushAlt();
    setPane(null);
  }, [flushAlt]);
  if (pane && !formatTarget) setPane(null);
  const paneVisible = useMemo(() => {
    if (!formatTarget || !frameInfo || !formatTarget.matrix) return null;
    return readerPictureVisibleUnitRect({ box: frameInfo.box, matrix: formatTarget.matrix, display: frameInfo.display });
  }, [formatTarget, frameInfo]);
  /** The picture as Word's Format Picture pane reads one (its picture
   * attributes), drawn from the PDF picture's format, paint and crop. */
  const paneAttrs = useMemo(() => {
    if (!formatTarget || !frameInfo || !paneVisible) return null;
    const format = pictureFormat.formatOf(formatTarget);
    const border = format.border && format.border !== "none" ? format.border : null;
    return {
      alt: altShown?.alt ?? "",
      pictureOpacity: Math.round((formatTarget.sourceOpacity ?? 1) * 100),
      pictureBrightness: imageCorrectionStoredFromDelta(format.brightness),
      pictureContrast: imageCorrectionStoredFromDelta(format.contrast),
      pictureSaturation: Math.min(200, format.saturation),
      pictureRecolor: format.recolor === "grayscale" ? "grayscale" : "none",
      pictureStyle: format.style ?? "none",
      artisticEffect: format.artisticEffect ?? "none",
      pictureBorderWidth: border?.widthPt ?? 0,
      pictureBorderColor: border?.color ?? "#000000",
      pictureBorderStyle: border?.dash ?? "solid",
      pictureStyleOutlineHidden: format.border === "none",
      pictureRotation: normalizeRotationDegrees(frameInfo.box.rotation),
      // The picture's own unit square has its first row at the top (y = 1).
      pictureCropLeft: paneVisible.x * 100,
      pictureCropBottom: paneVisible.y * 100,
      pictureCropRight: (1 - paneVisible.x - paneVisible.width) * 100,
      pictureCropTop: (1 - paneVisible.y - paneVisible.height) * 100,
    };
  }, [altShown, formatTarget, frameInfo, paneVisible, pictureFormat]);
  /** A change the pane makes, as the PDF picture's own commands. */
  const commitPaneVisual = useCallback((patch: Readonly<Record<string, unknown>>): boolean => {
    const target = formatTargetRef.current;
    const info = target ? frameOf(target) : null;
    if (!target || !info || !paneAttrs || !paneVisible || refuseWhenReadOnly()) return false;
    const changes: { -readonly [K in keyof PdfPictureFormat]?: PdfPictureFormat[K] } = {};
    if ("pictureBrightness" in patch) changes.brightness = imageCorrectionDeltaFromStored(patch.pictureBrightness);
    if ("pictureContrast" in patch) changes.contrast = imageCorrectionDeltaFromStored(patch.pictureContrast);
    if ("pictureSaturation" in patch) changes.saturation = Number(patch.pictureSaturation);
    if ("pictureRecolor" in patch) changes.recolor = patch.pictureRecolor === "grayscale" ? "grayscale" : null;
    if ("artisticEffect" in patch) changes.artisticEffect = normalizeOfficeArtisticEffect(patch.artisticEffect) ?? null;
    if ("pictureStyle" in patch) {
      changes.style = patch.pictureStyle === "none" || !patch.pictureStyle ? null : (patch.pictureStyle as OfficePictureStyleId);
    } else if ("pictureBorderWidth" in patch || "pictureBorderColor" in patch || "pictureBorderStyle" in patch) {
      const width = Number(patch.pictureBorderWidth ?? paneAttrs.pictureBorderWidth);
      const dash = patch.pictureBorderStyle ?? paneAttrs.pictureBorderStyle;
      changes.border = width > 0
        ? { color: String(patch.pictureBorderColor ?? paneAttrs.pictureBorderColor), widthPt: width,
            dash: dash === "dashed" || dash === "dotted" ? dash : "solid" }
        : "none";
    }
    if (Object.keys(changes).length) void pictureFormat.apply(() => changes);
    if ("pictureOpacity" in patch) setOpacity(Math.max(0.05, Number(patch.pictureOpacity) / 100));
    if ("pictureRotation" in patch) {
      const delta = Number(patch.pictureRotation) - paneAttrs.pictureRotation;
      if (Number.isFinite(delta) && Math.abs(delta) > 1e-6) turn(delta);
    }
    const edges = ["pictureCropLeft", "pictureCropTop", "pictureCropRight", "pictureCropBottom"] as const;
    if (edges.some((edge) => edge in patch)) {
      const value = (edge: (typeof edges)[number]) => Number(patch[edge] ?? paneAttrs[edge]) / 100;
      const next = { left: value("pictureCropLeft"), top: value("pictureCropTop"),
        right: value("pictureCropRight"), bottom: value("pictureCropBottom") };
      const shown = { left: paneAttrs.pictureCropLeft / 100, top: paneAttrs.pictureCropTop / 100,
        right: paneAttrs.pictureCropRight / 100, bottom: paneAttrs.pictureCropBottom / 100 };
      const width = 1 - shown.left - shown.right;
      const height = 1 - shown.top - shown.bottom;
      const inside = next.left >= shown.left - 1e-6 && next.top >= shown.top - 1e-6 &&
        next.right >= shown.right - 1e-6 && next.bottom >= shown.bottom - 1e-6;
      const cropOf = (from: typeof shown, w: number, h: number): PdfReaderPictureCropRect => ({
        x: (next.left - from.left) / w, y: (next.top - from.top) / h,
        width: (1 - next.left - next.right) / w, height: (1 - next.top - next.bottom) / h,
      });
      if (inside) {
        void applyCropRect(target, cropOf(shown, width, height));
      } else {
        // An edge let out past the crop: the crop is taken away, then the
        // new one is cut from the whole picture (Word keeps the cut-off
        // part; the PDF keeps it too, under the crop).
        void (async () => {
          const reset = await runWrite({ kind: "transform", target, pageTransform: IDENTITY_AFFINE, cropMode: "reset" }, null);
          const whole = reset?.ok ? latestTarget(target) : null;
          const full = { left: 0, top: 0, right: 0, bottom: 0 };
          if (whole && (next.left + next.top + next.right + next.bottom) > 1e-6) {
            await applyCropRect(whole, cropOf(full, 1, 1));
          }
        })();
      }
    }
    return true;
  }, [applyCropRect, formatTargetRef, latestTarget, paneAttrs, paneVisible, pictureFormat, refuseWhenReadOnly,
    runWrite, setOpacity, turn]);
  const panes = pane && formatTarget && frameInfo && paneAttrs ? (
    <div
      data-testid="pdf-picture-pane-host"
      style={{ position: "absolute", top: 8, right: 8, bottom: 8, width: 340, zIndex: 40,
        display: "flex", flexDirection: "column", pointerEvents: "auto" }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {pane.kind === "alt" ? (
        <OfficeAltTextPane
          title={t("toolbar.altTextPaneTitle")}
          closeLabel={t("toolbar.altTextPaneClose")}
          onClose={closePane}
          testIdPrefix="pdf-picture-alt-text"
          label={t("toolbar.altTextPaneLabel")}
          hint={t("toolbar.altTextPaneHint")}
          unavailableMessage={
            !canWrite ? writeDisabledReason ?? t("toolbar.altTextPaneReadOnly")
              : altShown && !altShown.tagged ? t("pdf.pageWindow.picture.altUntagged") : null
          }
          value={altShown?.alt ?? ""}
          targetKey={altShown ? paneKey : null}
          onChange={typeAlt}
          maxLength={MRAI_NATIVE_ALT_TEXT_MAX_LENGTH}
          inputTestId="pdf-picture-alt-text-input"
          focusRequest={pane.focus}
          dockRight
        />
      ) : (
        <DocumentPictureFormatPane
          attrs={paneAttrs}
          authorityValid={canWrite}
          editable={canWrite}
          isChinese={locale.startsWith("zh")}
          onClose={closePane}
          onCommitAlt={(value) => {
            void commitAlt(value, paneKey);
            return true;
          }}
          onCommitVisual={commitPaneVisual}
          opening={pane.opening}
          sizePx={[frameInfo.box.width, frameInfo.box.height]}
          visualEditable={!pictureFormat.busy}
        />
      )}
    </div>
  ) : null;

  const docsRibbonModel = useMemo<PdfReaderPictureRibbonModel | null>(() => {
    if (!formatTarget || !frameInfo) return null;
    return {
      busy: Boolean(pending && !pending.landed) || pictureFormat.busy,
      writable: canWrite,
      ...(canWrite ? {} : { disabledReason: writeDisabledReason }),
      widthPoints: shownFrame ? (shownFrame.box.width / 100) * frameInfo.display.width : frameInfo.box.width,
      heightPoints: shownFrame ? (shownFrame.box.height / 100) * frameInfo.display.height : frameInfo.box.height,
      transparency: Math.round((1 - (formatTarget.sourceOpacity ?? 1)) * 100),
      format: pictureFormat.formatOf(formatTarget),
      canReset: pictureFormat.canReset(formatTarget),
      cropDisabledReason: cropRefusal(formatTarget),
      cropped: (() => {
        if (!formatTarget.matrix) return false;
        const visible = readerPictureVisibleUnitRect({ box: frameInfo.box, matrix: formatTarget.matrix,
          display: frameInfo.display });
        return visible.x > 1e-3 || visible.y > 1e-3 || visible.width < 1 - 1e-3 || visible.height < 1 - 1e-3;
      })(),
      formatPaneOpen: pane?.kind === "format",
      altPaneOpen: pane?.kind === "alt",
      hasAlt: Boolean(altShown?.alt),
      arrangeAtFront: layerBoundary.atFront,
      arrangeAtBack: layerBoundary.atBack,
    };
  }, [altShown, canWrite, cropRefusal, formatTarget, frameInfo, layerBoundary, pane, pending, pictureFormat, shownFrame,
    writeDisabledReason]);
  /** Position / Align: the picture moved as a drop of its frame there is:
   * the frame stands there at once while the page paints the write. (The
   * drag stage is not asked to carry it: lifted by a command, not a
   * gesture, the picture stayed off the page after a later write.) */
  const placeBy = useCallback(
    (measure: (matrix: PdfAffine, display: NonNullable<PdfNativeImageTarget["display"]>) => PdfAffine | null) => {
      const target = selectedRef.current;
      if (!target?.matrix || !target.display || refuseWhenReadOnly()) return;
      const move = measure(target.matrix as PdfAffine, target.display);
      const info = frameOf(target);
      if (!move || !info) return;
      const [a, b, c, d] = info.display.transform;
      const dx = move[4] * a + move[5] * c;
      const dy = move[4] * b + move[5] * d;
      const from = readerPicturePercentBox(info.box, info.display);
      const to = {
        box: { ...from, x: from.x + (dx / info.display.width) * 100, y: from.y + (dy / info.display.height) * 100 },
        rotation: info.box.rotation,
      };
      // The picture stands there at once, put together from the page's
      // layers around its old and new place: only the frame moved, and the
      
      const region = Math.abs(info.box.rotation) < 1e-6 ? percentUnion(from, to.box) : null;
      const composed = region
        ? carryRef.current?.compose?.(target, { dx: to.box.x - from.x, dy: to.box.y - from.y }, region) ?? null
        : null;
      writeFrame(to);
      if (composed && region) showComposed(composed, region);
    },
    [refuseWhenReadOnly, showComposed, writeFrame],
  );
  const docsRibbonCommands = useMemo<Omit<PdfReaderPictureRibbonCommands, "onExit">>(
    () => ({
      onStyle: (style) => {
        if (hoverFormatClearRef.current !== null) window.clearTimeout(hoverFormatClearRef.current);
        hoverFormatClearRef.current = null;
        hoverFormatPressedRef.current = true;
        void pictureFormat.apply(() => ({ style })).finally(() => {
          hoverFormatPressedRef.current = false;
          setHoverFormat(null);
        });
      },
      onStylePreview: previewPictureStyle,
      onBorder: (border) => void pictureFormat.apply(() => ({ border })),
      onPosition: (preset) => placeBy((matrix, display) => positionTransform(matrix, display, preset)),
      onArrange: arrange,
      onAlign: (align) => placeBy((matrix, display) => alignTransform(matrix, display, align)),
      onRotate: (direction) => turn(direction === "left" ? -90 : 90),
      onFlip: flip,
      onRotateReset: () => {
        const target = selectedRef.current;
        const info = target ? frameOf(target) : null;
        const rotation = info ? normalizeRotationDegrees(info.box.rotation) : 0;
        if (info && Math.abs(rotation) > 1e-6) turn(rotation > 180 ? 360 - rotation : -rotation);
      },
      onCrop: startCrop,
      onCropAspectRatio: startCropWithRatio,
      onCropToShape: (shape) => void pictureFormat.apply(() => ({ shape })),
      onFormatPane: () => setPane((open) => (open?.kind === "format" ? null : { kind: "format", opening: null })),
      onAltText: () => setPane((open) => ({ kind: "alt", focus: (open?.kind === "alt" ? open.focus : 0) + 1 })),
      onCropMode: (cropMode) => {
        const target = selectedRef.current;
        if (!target || refuseWhenReadOnly()) return;
        void runWrite({ kind: "transform", target, pageTransform: IDENTITY_AFFINE, cropMode }, null);
      },
      onResize: resizePoints,
      onArtisticEffect: (id) => void pictureFormat.apply(() => ({ artisticEffect: id === "none" ? null : id })),
      onCorrections: (brightness, contrast) => void pictureFormat.apply(() => ({ brightness, contrast })),
      onSharpness: (sharpness) => void pictureFormat.apply(() => ({ sharpness })),
      onSharpen: () => void sharpen(),
      onSaturation: (saturation) => void pictureFormat.apply(() => ({ saturation })),
      onTone: (tone) => void pictureFormat.apply(() => ({ tone })),
      onRecolor: (recolor) => void pictureFormat.apply(() => ({ recolor })),
      onTransparency: (percent) => setOpacity(Math.max(0.05, 1 - percent / 100)),
      onCompress: () => {
        dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setCompressOpen(true);
      },
      onChangePicture: openReplacePicker,
      onReset: (withSize) => void pictureFormat.reset(withSize),
      ...(insertPicture ? { onInsertPicture: insertPicture } : {}),
      onExtractPicture: () => void savePicture(),
      onExtractText: () => runExtractText(),
      onTranslatePicture: () => runExtractText({ translate: true }),
      onDelete: remove,
      onDraw: () => {
        const target = selectedRef.current;
        if (!target || refuseWhenReadOnly()) return;
        dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        void pictureFormat.basePicture(target).then((picture) => {
          if (picture && selectedRef.current === target) setDrawSource(picture.toDataURL("image/png"));
          else if (!picture) notify(t("pdf.viewer.picture.pixelsUnavailable"), "error");
        });
      },
    }),
    [arrange, flip, insertPicture, notify, openReplacePicker, pictureFormat, placeBy, refuseWhenReadOnly, remove, resizePoints,
      runExtractText, runWrite, savePicture, setOpacity, sharpen, startCrop, startCropWithRatio, t, turn],
  );
  const dialogs = (
    <>
      {compressOpen ? (
        <DocumentPictureCompressionDialog
          open
          canEdit={canWrite}
          locale={locale}
          returnFocusRef={dialogReturnFocusRef}
          onSubmit={async (presetId) => {
            const preset = DOCUMENT_PICTURE_COMPRESSION_PRESETS.find((entry) => entry.id === presetId);
            return preset ? pictureFormat.compress(preset.ppi) : "rejected";
          }}
          onClose={() => setCompressOpen(false)}
        />
      ) : null}
      {drawSource ? (
        <DocumentPictureDrawDialog
          open
          canEdit={canWrite}
          source={drawSource}
          mimeType="image/png"
          locale={locale}
          returnFocusRef={dialogReturnFocusRef}
          onApply={(source) => {
            // The drawing becomes the picture: a format given to it is drawn
            // on the drawn picture, as on any other.
            void (async () => {
              const image = new Image();
              image.src = source;
              await image.decode();
              await pictureFormat.reworkPicture(() => {
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext("2d")?.drawImage(image, 0, 0);
                return canvas;
              });
            })().catch(() => notify(t("pdf.pageWindow.picture.writeFailed"), "error"));
            return true;
          }}
          onClose={() => setDrawSource(null)}
        />
      ) : null}
    </>
  );

  // ---- Layer --------------------------------------------------------------------
  const layerLabels = useMemo(
    () => ({
      frame: t("pdf.viewer.picture.frame"),
      toolbar: t("pdf.viewer.picture.toolbar"),
      collapse: t("pdf.viewer.picture.collapse"),
      expand: t("pdf.viewer.picture.expand"),
      crop: t("pdf.viewer.picture.crop"),
      rotateLeft: t("pdfContextRibbon.picture.rotateLeft"),
      rotateRight: t("pdfContextRibbon.picture.rotateRight"),
      replace: t("pdf.viewer.picture.replace"),
      extractText: t("pdf.viewer.picture.extractText"),
      edit: t("pdf.viewer.picture.edit"),
      done: t("pdf.viewer.picture.done"),
      applyCrop: t("pdf.viewer.picture.applyCrop"),
      cancelCrop: t("pdf.viewer.picture.cancelCrop"),
      cropEdge: t("pdf.viewer.picture.cropEdge"),
    }),
    [t],
  );
  const captureGhostFor = useCallback(
    (pageNumber: number, frame: { box: PercentBox; rotation: number }, display: ReaderPictureDisplay) =>
      (): HTMLCanvasElement | null => {
        const canvas = viewerRootRef.current?.querySelector<HTMLCanvasElement>(
          `canvas[data-pdf-page="${pageNumber}"]`,
        );
        if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
        const box = readerPictureBoxFromPercent(frame.box, frame.rotation, display);
        const bounds = readerPictureBounds(box);
        const sx = Math.max(0, Math.floor((bounds.x / display.width) * canvas.width));
        const sy = Math.max(0, Math.floor((bounds.y / display.height) * canvas.height));
        const sw = Math.min(canvas.width - sx, Math.ceil((bounds.width / display.width) * canvas.width));
        const sh = Math.min(canvas.height - sy, Math.ceil((bounds.height / display.height) * canvas.height));
        if (!(sw > 0) || !(sh > 0)) return null;
        // A picture partly off the page is cut where the page ends; the
        // ghost is drawn at its whole box, the missing part left clear.
        const out = document.createElement("canvas");
        out.width = Math.max(1, Math.round((bounds.width / display.width) * canvas.width));
        out.height = Math.max(1, Math.round((bounds.height / display.height) * canvas.height));
        const dx = Math.round(((Math.max(0, bounds.x) - bounds.x) / display.width) * canvas.width);
        const dy = Math.round(((Math.max(0, bounds.y) - bounds.y) / display.height) * canvas.height);
        try {
          out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, dx, dy, sw, sh);
        } catch {
          return null;
        }
        return out;
      },
    [viewerRootRef],
  );
  // The stage carries the selected picture by its own paint: its layers are
  // rendered when it is selected, ahead of a drag.
  const selectedCarryKey = selected
    ? `${selected.pageNumber}:${selected.order}:${selected.operatorIndex ?? ""}:${selected.sourceSha256 ?? ""}`
    : null;
  useEffect(() => {
    const target = selectedRef.current;
    if (selectedCarryKey && target) carryRef.current?.prewarm(target);
  }, [selectedCarryKey]);
  const carryFor = useCallback(
    (target: PdfNativeImageTarget): PdfReaderPictureCarry | null => {
      if (!carry) return null;
      return {
        preview: (preview, start) => carry.preview(target, preview, start),
        turn: (turn, start) => carry.turn(target, turn, start),
        settle: (box, turn) => carry.settle(target, box, turn),
      };
    },
    [carry],
  );
  const renderLayer = useCallback(
    (pageNumber: number, pageWidth: number, pageHeight: number): ReactNode => {
      // A write's drawing on this page for a picture no longer the selected
      // one stays until the page paints it.
      const ownsPending = Boolean(selected && pending && selected.pageNumber === pending.pageNumber &&
        selected.order === pending.order && shownFrame && frameInfo);
      const pendingAt = pending?.preview && pending.pageNumber === pageNumber && !ownsPending
        ? pending.previewBox
          ? { box: pending.previewBox, turn: pending.previewTurn ?? 0 }
          : pending.frame ? { box: pending.frame.box, turn: pending.frame.rotation } : null
        : null;
      const standalone = pendingAt && pending?.preview
        ? <PdfReaderPicturePendingPreview key="pending-preview" source={pending.preview} box={pendingAt.box}
            turn={pendingAt.turn} />
        : null;
      if (!selected || selected.pageNumber !== pageNumber || !shownFrame || !frameInfo) {
        return standalone;
      }
      const display = frameInfo.display;
      return (
        <>
        {standalone}
        <PdfReaderPictureLayer
          key={`${selected.pageNumber}:${selected.order}`}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          box={hoverFormat?.frame && hoverFormat.pageNumber === selected.pageNumber && hoverFormat.order === selected.order ? hoverFormat.frame : shownFrame.box}
          rotation={shownFrame.rotation}
          busy={false}
          readOnly={!canWrite}
          labels={layerLabels}
          captureGhost={captureGhostFor(pageNumber, shownFrame, display)}
          carry={carryFor(selected)}
          settledKey={`${selected.sourceSha256 ?? ""}|${failureEpoch}`}
          formatPreview={
            pending?.preview && pending.pageNumber === selected.pageNumber && pending.order === selected.order
              ? pending.preview
              : hoverFormat && hoverFormat.pageNumber === selected.pageNumber && hoverFormat.order === selected.order
                ? hoverFormat.canvas
                : null
          }
          formatPreviewBox={pending?.preview ? (pending.previewBox ?? null) : hoverFormat?.box ?? null}
          formatPreviewTurn={pending?.preview ? (pending.previewTurn ?? 0) : hoverFormat?.turn ?? 0}
          cropping={cropping}
          onCropChange={setCropping}
          onCropApply={applyCrop}
          onCropCancel={() => setCropping(null)}
          onFrameCommit={(box) => writeFrame({ box, rotation: shownFrame.rotation })}
          onRotateCommit={(rotation) => {
            const target = selectedRef.current;
            // Nothing is written: a turned stage goes back with the frame.
            const release = () => {
              if (target) carryRef.current?.release(target);
            };
            const delta = signedAngle(rotation - shownFrame.rotation);
            if (Math.abs(delta) < 0.01) return release();
            const info = target ? frameOf(target) : null;
            if (!target || !info || refuseWhenReadOnly()) return release();
            if (pendingRef.current) {
              heldFrameRef.current = { box: shownFrame.box, rotation: shownFrame.rotation + delta };
              return;
            }
            const pageTransform = readerPictureUserTransform(
              info.display.transform,
              readerPictureTurn(
                readerPictureBoxFromPercent(shownFrame.box, shownFrame.rotation, info.display),
                delta,
              ),
            );
            if (!pageTransform) return release();
            const turned = { box: shownFrame.box, rotation: shownFrame.rotation + delta };
            void runWrite(
              { kind: "transform", target, pageTransform,
                ...(frameLeavesClips(target, turned) ? { leaveClips: true as const } : {}) },
              turned,
            ).then((outcome) => {
              if (outcome === null) release();
            });
          }}
          onDelete={remove}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            rememberMenuPoint(event);
            openContextMenu(event.clientX, event.clientY);
          }}
          onCrop={startCrop}
          onRotate={(direction) => turn(direction === "left" ? -90 : 90)}
          onReplace={openReplacePicker}
          onExtractText={runExtractText}
          onEdit={startCrop}
          // 编辑: the shared 校正 gallery (brightness / contrast presets, the
          // deck's own), baked into the pixels; 清晰化 beside it and the
          // picture's crop at its foot.
          editMenu={(trigger) => (
            <OfficePictureCorrectionsMenu
              trigger={trigger}
              optionsLabel={t("pdf.viewer.picture.crop")}
              onOptions={startCrop}
              testIdPrefix="pdf-native-picture-corrections"
              brightnessDelta={0}
              contrastDelta={0}
              recolor="none"
              sharpnessUnavailableReason=""
              showSharpness={false}
              extraItems={
                <DropdownMenuItem
                  data-testid="pdf-native-picture-corrections-sharpen"
                  onSelect={() => void sharpen()}
                >
                  {t("pdf.viewer.picture.sharpen")}
                </DropdownMenuItem>
              }
              onCommit={(brightness, contrast) => void correct(brightness, contrast)}
            />
          )}
          onDone={clear}
        />
        </>
      );
    },
    [hoverFormat, 
      applyCrop,
      canWrite,
      captureGhostFor,
      carryFor,
      clear,
      correct,
      cropping,
      failureEpoch,
      frameInfo,
      layerLabels,
      openContextMenu,
      openReplacePicker,
      pending,
      refuseWhenReadOnly,
      rememberMenuPoint,
      remove,
      runExtractText,
      runWrite,
      selected,
      sharpen,
      shownFrame,
      startCrop,
      t,
      writeFrame,
    ],
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
      className="hidden"
      data-testid="pdf-native-picture-replace-input"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void replaceWith(file);
      }}
    />
  );

  return {
    selected,
    busy: Boolean(pending && !pending.landed),
    isWriting,
    select,
    clear,
    selectForMenu,
    contextMenuEntries,
    ribbonModel,
    ribbonCommands,
    docsRibbonModel,
    docsRibbonCommands,
    dialogs,
    panes,
    renderLayer,
    fileInput,
  };
}
