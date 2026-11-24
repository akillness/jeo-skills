/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  managedPdfInkIdentitiesForDocument,
  managedPdfShapeIdentitiesForDocument,
  managedPdfTextMarkupIdentitiesForDocument,
  managedPdfTextNoteIdentitiesForDocument,
} from "@mrnote/core/web/lib/pdf/managed-note-source-identity.ts";
import {
  normalizeNativePdfInkAnnotations,
  type NativePdfInkImportResult,
} from "../../../../../lib/pdf/native-ink-annotations";
import {
  normalizeNativePdfShapeAnnotations,
  type NativePdfShapeImportResult,
} from "../../../../../lib/pdf/native-shape-annotations";
import { nativePdfShapeSourceDetailsForDocument } from "../../../../../lib/pdf/native-shape-source-details";
import {
  normalizeNativePdfStampAnnotations,
  type NativePdfStampImportResult,
} from "../../../../../lib/pdf/native-stamp-annotations";
import {
  normalizeNativePdfTextAnnotations,
  normalizeNativePdfTextMarkupAnnotations,
  type NativePdfTextAnnotation,
  type NativePdfTextMarkupAnnotation,
} from "@mrnote/core/web/lib/pdf/native-text-annotations.ts";

type PdfDocumentSource = Parameters<typeof managedPdfTextNoteIdentitiesForDocument>[0];

/** The subtypes a page's annotation lists hold (a page with none of them is
 * not read for the lists). */
export const PDF_LISTED_ANNOTATION_SUBTYPES: ReadonlySet<string> = new Set([
  "Text", "Highlight", "Underline", "StrikeOut", "Squiggly", "Ink",
  "Line", "Square", "Circle", "Polygon", "PolyLine", "Stamp",
]);

/** The page geometry the annotations are placed by: a pdf.js viewport. */
export interface PdfPageAnnotationViewport {
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  convertToViewportPoint(x: number, y: number): readonly number[];
  convertToViewportRectangle(rect: readonly number[]): readonly number[];
}

/** One page's own annotations, as the side panel, the comments manager and
 * the page itself list them. */
export interface PdfPageAnnotationLists {
  readonly notes: NativePdfTextAnnotation[];
  readonly blockedNoteIds: string[] | undefined;
  readonly markups: NativePdfTextMarkupAnnotation[];
  readonly inks: NativePdfInkImportResult;
  readonly shapes: NativePdfShapeImportResult;
  /** Every shape the page draws, MRAI's own included (for routing). */
  readonly allShapes: NativePdfShapeImportResult["shapes"];
  readonly stamps: NativePdfStampImportResult;
}

const rectangle = (viewport: PdfPageAnnotationViewport) => (rect: readonly number[]) =>
  viewport.convertToViewportRectangle(Array.from(rect)) as [number, number, number, number];

/**
 * Read a page's notes, text markups, ink, shapes and stamps from its raw
 * pdf.js annotations. The page's render reads them this way, and so does the
 * document-wide pass that lists the pages not drawn yet (user audit PDF 0001:
 * the comments manager showed 「批注 0」 on opening, and only the pages
 * visited later). Null when `isCurrent` turns false across a read.
 */
export async function readPdfPageAnnotationLists(input: {
  document: PdfDocumentSource;
  pageNumber: number;
  rawAnnotations: ReadonlyArray<{ subtype?: unknown }>;
  pageView: readonly number[] | undefined;
  userUnit: number | undefined;
  viewport: PdfPageAnnotationViewport;
  isCurrent: () => boolean;
}): Promise<PdfPageAnnotationLists | null> {
  const { document, pageNumber, rawAnnotations, pageView, viewport, isCurrent } = input;
  const has = (...subtypes: string[]) =>
    rawAnnotations.some((annotation) => subtypes.includes(String(annotation.subtype)));
  const noteIdentities = has("Text")
    ? await managedPdfTextNoteIdentitiesForDocument(document)
    : undefined;
  if (!isCurrent()) return null;
  const notes = normalizeNativePdfTextAnnotations(rawAnnotations, pageNumber, undefined, noteIdentities);
  const sourceMarkups = normalizeNativePdfTextMarkupAnnotations(rawAnnotations, pageNumber);
  // A mark MRAI wrote is that mark, proven by its /NM: named here, so it is
  // matched to its own row and never read as a mark the file came with.
  const managedMarkupIds = sourceMarkups.length > 0
    ? await managedPdfTextMarkupIdentitiesForDocument(document)
    : null;
  if (!isCurrent()) return null;
  const markups = managedMarkupIds && managedMarkupIds.size > 0
    ? sourceMarkups.map((markup) => {
        const managedMarkupId = managedMarkupIds.get(markup.nativeSource.objectRef);
        return managedMarkupId ? { ...markup, managedMarkupId } : markup;
      })
    : sourceMarkups;
  const inkImport = normalizeNativePdfInkAnnotations(rawAnnotations, pageNumber, pageView, {
    width: viewport.width,
    height: viewport.height,
    convertToViewportPoint: (x, y) => {
      const [convertedX, convertedY] = viewport.convertToViewportPoint(x, y);
      return [convertedX, convertedY] as const;
    },
  });
  // A managed stroke reopened from the file is known by its /NM, not only by
  
  const managedInkIds = inkImport.strokes.length > 0
    ? await managedPdfInkIdentitiesForDocument(document)
    : null;
  if (!isCurrent()) return null;
  // pdf.js reports neither a Line's /L direction nor a shape's /IC fill; read
  
  const shapeSourceDetails = has("Line", "Square", "Circle", "Polygon")
    ? await nativePdfShapeSourceDetailsForDocument(document)
    : null;
  if (!isCurrent()) return null;
  const shapeImport = normalizeNativePdfShapeAnnotations(
    rawAnnotations,
    pageNumber,
    {
      width: viewport.width,
      height: viewport.height,
      ...(Array.isArray(pageView) && pageView.length === 4
        ? {
            pageBox: {
              width: Math.abs(pageView[2] - pageView[0]),
              height: Math.abs(pageView[3] - pageView[1]),
            },
          }
        : {}),
      userUnit: input.userUnit,
      rotation: viewport.rotation,
      convertToViewportPoint: (x, y) => viewport.convertToViewportPoint(x, y),
      convertToViewportRectangle: rectangle(viewport),
    },
    shapeSourceDetails,
  );
  // A shape MRAI wrote is that shape, proven by its /NM: it is its platform
  
  const managedShapeIds = shapeImport.shapes.length > 0
    ? await managedPdfShapeIdentitiesForDocument(document)
    : null;
  if (!isCurrent()) return null;
  const stamps = normalizeNativePdfStampAnnotations(rawAnnotations, pageNumber, {
    width: viewport.width,
    height: viewport.height,
    convertToViewportRectangle: rectangle(viewport),
  });
  return {
    notes,
    blockedNoteIds: noteIdentities
      ? [...noteIdentities].flatMap(([key, value]) =>
          value.kind === "blocked" ? [`pdf-native-text:${key}`, ...(value.id ? [value.id] : [])] : [])
      : undefined,
    markups,
    inks: managedInkIds
      ? {
          ...inkImport,
          strokes: inkImport.strokes.map((stroke) => {
            const managedId = managedInkIds.get(stroke.nativeSource.objectRef);
            return managedId ? { ...stroke, managedId } : stroke;
          }),
        }
      : inkImport,
    shapes: managedShapeIds && managedShapeIds.size > 0
      ? {
          ...shapeImport,
          shapes: shapeImport.shapes.filter(
            (shape) => !managedShapeIds.has(shape.nativeSource.objectRef),
          ),
        }
      : shapeImport,
    allShapes: shapeImport.shapes,
    stamps,
  };
}
