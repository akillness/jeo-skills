/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A preserved Office SmartArt becoming MRAI's own: the one recipe.
 *
 * A real .docx import goes through the SERVER projection, so the frontend
 * importer's conversion never runs for it: every diagram arrives as the
 * preserve-only `documentShape` group `preservedDocumentSmartArtAttrs`
 * describes, carrying its native view. Opening writes nothing: a diagram whose
 * Office layout is one of the 39 MRAI owns is converted with its first real edit
 * (`documentSmartArtPrepared`), and every other diagram stays preserved until the
 * author picks a catalog layout from the SmartArt tab's 转换为可编辑.
 * {@link convertedDocumentSmartArtAttrs} is the one recipe both use.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { SmartArtColorTheme } from "../../../../lib/office-smartart/colors";
import {
  smartArtHostThemeSource,
  smartArtThemeEffectShadows,
  smartArtThemeFillStyles,
} from "../../../../lib/office-smartart/theme-effects";
import { documentThemeBodyLatin, normalizeDocumentDesign } from "../../../../lib/document-design";

import {
  documentShapeIsPreservedNativeSmartArt,
  normalizeDocumentShapeAttrs,
  type DocumentShapeAttrs,
  type DocumentShapeAttrsInput,
} from "../../../../lib/document-shapes";
import {
  documentSmartArtCatalogLayoutId,
  documentNativeSmartArtView,
  documentSmartArtNodeHostTheme,
  nativeSmartArtHostTheme,
} from "../../../../lib/office-smartart/document-native-model";
// The conversion lays the diagram out, so it is the server's (the engine host).
import { smartArtEngine } from "../../../../lib/office-smartart/remote";
import {
  smartArtConvertRefusal,
  type SmartArtConvertRefusal,
} from "../../../../lib/office-smartart/native-convert-model";
import {
  cachedNativeSmartArtOutline,
  readNativeSmartArtOutline,
} from "../../../../lib/office-smartart/native-outline-remote";
import { isShapeNode } from "./documentObjectNodes";
import {
  SMARTART_OWN_DEFINITION_LIKENESS_LIMIT,
  smartArtBlockDrawingBoxes,
  smartArtConversionLooksLikeDrawing,
  smartArtDrawingLikeness,
  smartArtGroupMemberDrawingBoxes,
} from "../../../../lib/office-smartart/drawing-likeness";
import { SMARTART_OFFICE_DEFINITION_KIND } from "../../../../lib/office-smartart/model";
import {
  smartArtConversionMedia,
  smartArtPictureConversionUnreachable,
  type SmartArtConversionMedia,
  type SmartArtConversionRefusal,
} from "../../../../lib/office-smartart/slot-media-client";

/** The node one Docs SmartArt — catalog or preserved — is on a line of its
 * own (`inlineDocumentShape` when it shares its line with text). */
export const DOCUMENT_SHAPE_NODE_NAME = "documentShape";

/**
 * The attrs a preserved Office diagram becomes, or `null` when it stays
 * preserved.
 *
 * `layoutId` is the catalog layout the author picked by hand (转换为可编辑);
 * omitted, the diagram's own Office layout decides, and a layout MRAI does not
 * own converts to nothing. What lands is the Docs insert path's own group for
 * that layout, built from the diagram's outline inside the diagram's frame,
 * keeping only where the diagram sat on the page and dropping every trace of
 * the native package it replaces.
 */
/**
 * The document's theme colours as the SmartArt engine reads a theme, or
 * `null` when the document states none (the engine's own palette then).
 */
export function documentSmartArtColorTheme(
  value: unknown,
  design?: unknown,
  /** The diagram's view's `hostTheme`: the file's own theme lists, as imported. */
  hostTheme?: { readonly effects?: string | null; readonly xml?: string | null } | null,
  /**
   * The document theme's body face (`documentSmartArtBodyFace`): Word fits a
   * diagram's words by it, so the engine does too. Without it the engine fit
   * them by Aptos's approximation -- W24ui, a Cambria document, 25.13 pt where
   * Word set 28 (SMARTART-GAP.md §8.38).
   */
  bodyFace?: string | null,
): Partial<SmartArtColorTheme> | null {
  // The theme's style matrix a quick style's `a:fillRef` / `a:effectRef`
  // names (Design > Effects, or the document's own theme as imported): 3-D
  // Polished's shadow and rising ramp under the 2007 Office theme
  // (`theme-effects`).
  const documentDesign = normalizeDocumentDesign(design);
  const source = smartArtHostThemeSource(
    documentDesign ? { id: documentDesign.effects, xml: documentDesign.nativeEffects?.xml ?? null } : null,
    hostTheme,
  );
  const effectShadows = smartArtThemeEffectShadows(source);
  const fillStyles = smartArtThemeFillStyles(source);
  const face = typeof bodyFace === "string" && bodyFace.trim() ? { bodyFace: bodyFace.trim() } : {};
  const effects = { ...(effectShadows ? { effectShadows } : {}), ...(fillStyles ? { fillStyles } : {}) };
  const stated = effectShadows !== undefined || fillStyles !== undefined;
  if (!value || typeof value !== "object") return stated ? { ...effects, ...face } : null;
  const record = value as Record<string, unknown>;
  const hex = (key: string) => (typeof record[key] === "string" && /^#[0-9a-f]{6}$/i.test(record[key] as string) ? (record[key] as string) : null);
  const accents = [1, 2, 3, 4, 5, 6].map((n) => hex(`accent${n}`));
  if (accents.some((accent) => accent === null)) return stated ? { ...effects, ...face } : null;
  return {
    ...effects,
    ...face,
    accents: accents as string[],
    ...(hex("text1") ? { dk1: hex("text1")! } : {}),
    ...(hex("background1") ? { lt1: hex("background1")! } : {}),
    ...(hex("text2") ? { dk2: hex("text2")! } : {}),
    ...(hex("background2") ? { lt2: hex("background2")! } : {}),
  };
}

/**
 * The face a Docs diagram's words are fitted by: the document theme's body
 * face (`documentThemeBodyLatin`), as Word fits them -- Chinese Word's 等线
 * (DengXian) too. Word's own layouts of a Basic List in a 等线 document (probes
 * W26_D0-D4, Word for Mac laying each out on open) set 32 / 17 / 13 / 17 pt
 * for one-line, two-line, three-line and Chinese labels; fitted by DengXian
 * the engine gives 31.88 / 16.88 / 13.13 / 16.88, by its default measure
 * 31.13 / 19.13 / 15 / 16.13. Only words the author spaced 1.5 lines stand
 * a point under Word's (15 for 16, SMARTART-GAP.md §8.41).
 */
export function documentSmartArtBodyFace(documentDesign: unknown, defaultFontFamily: unknown): string | null {
  const face = documentThemeBodyLatin(documentDesign, defaultFontFamily);
  return face || null;
}

/**
 * The theme one Docs diagram is rebuilt through: the document's colours and
 * Design > Effects over the file's own theme lists its view (or its
 * conversion's receipt) carries -- the theme the conversion drew it through.
 * Every rebuild, repaint and reset of a Docs diagram asks with it.
 */
export function documentSmartArtHostColorTheme(
  documentAttrs:
    | { readonly documentThemeColors?: unknown; readonly documentDesign?: unknown; readonly defaultFontFamily?: unknown }
    | null
    | undefined,
  nodeAttrs: unknown,
): Partial<SmartArtColorTheme> | null {
  return documentSmartArtColorTheme(
    documentAttrs?.documentThemeColors,
    documentAttrs?.documentDesign,
    documentSmartArtNodeHostTheme(nodeAttrs) ?? null,
    documentAttrs ? documentSmartArtBodyFace(documentAttrs.documentDesign, documentAttrs.defaultFontFamily) : null,
  );
}

/**
 * The layout definition a preserved diagram converts from when MRAI stocks no
 * definition of its layout: its own part, by urn and digest. `null` for a
 * layout MRAI owns, a pick, or a view that names no part.
 */
export function documentSmartArtOwnDefinitionRef(
  view: ReturnType<typeof documentNativeSmartArtView>,
  layoutId: string | null,
): { readonly urn: string; readonly sha256: string } | null {
  if (!view || layoutId || !view.layoutIdentity || !view.layoutDefinition) return null;
  if (documentSmartArtCatalogLayoutId(view.layoutIdentity) !== null) return null;
  return { urn: view.layoutIdentity, sha256: view.layoutDefinition.sha256 };
}

export async function convertedDocumentSmartArtAttrs(
  nodeAttrs: DocumentShapeAttrsInput,
  layoutId: string | null,
  groupIdsInUse?: readonly string[],
  /**
   * The diagram's slot pictures, when it has any
   * ({@link documentPreservedSmartArtMedia} fetched them out of the page's own
   * source package). Omitted, the conversion behaves exactly as before: a
   * picture point with no picture keeps the whole diagram PRESERVED rather
   * than converting it into empty slots.
   */
  images?: Readonly<Record<string, string>>,
  signal?: AbortSignal,
  /** The document's `documentThemeColors` (its root's attrs). */
  documentThemeColors?: unknown,
  /** The document's `documentDesign` (its root's attrs): the theme's effects and body face. */
  documentDesign?: unknown,
  /** The document's `defaultFontFamily` (its root's attrs): its body face when it states no theme. */
  defaultFontFamily?: unknown,
): Promise<Record<string, unknown> | null> {
  if (!documentShapeIsPreservedNativeSmartArt(nodeAttrs)) return null;
  const view = documentNativeSmartArtView(nodeAttrs);
  if (!view) return null;
  const attrs = normalizeDocumentShapeAttrs(nodeAttrs);
  const { converted } = await smartArtEngine(
    "document.convert",
    {
      dataXml: view.dataXml,
      // The diagram's own urn rides with a pick too: picking the layout an
      // aligned alias stands for converts it as itself (`native-layouts`).
      ...(layoutId ? { layoutId } : {}),
      layoutIdentity: view.layoutIdentity,
      frameEmu: { widthEmu: attrs.widthEmu, heightEmu: attrs.heightEmu },
      smartArtStyle: view.smartArtStyle,
      // WordArt on the diagram's words, which the outline alone cannot say.
      ...(view.itemTextPaint ? { itemTextPaint: view.itemTextPaint } : {}),
      ...(groupIdsInUse ? { groupIdsInUse: [...groupIdsInUse] } : {}),
      ...(images ? { images: { ...images } } : {}),
      // A layout MRAI stocks no definition of is laid out from the one the
      // document's own package holds (SMARTART-GAP.md §8.6); the engine
      // client borrows that part by its digest. Never on a pick.
      ...(documentSmartArtOwnDefinitionRef(view, layoutId)
        ? { layoutDefinitionRef: documentSmartArtOwnDefinitionRef(view, layoutId)! }
        : {}),
      ...(() => {
        const colorTheme = documentSmartArtColorTheme(
          documentThemeColors,
          documentDesign,
          view.hostTheme,
          documentSmartArtBodyFace(documentDesign, defaultFontFamily),
        );
        return colorTheme ? { colorTheme } : {};
      })(),
    },
    { signal },
  );
  return documentSmartArtAttrsFromConversion(nodeAttrs, converted);
}

/**
 * Where a converted diagram lands: the server's converted group, placed where
 * the preserved one sat (its anchor, wrap, stacking, Alt Text and the receipt
 * of the drawing it replaces), or `null` when the conversion refused.
 */
export function documentSmartArtAttrsFromConversion(
  nodeAttrs: DocumentShapeAttrsInput,
  converted: { readonly attrs: DocumentShapeAttrs } | null,
): Record<string, unknown> | null {
  const attrs = normalizeDocumentShapeAttrs(nodeAttrs);
  if (!converted) return null;
  // A diagram Word holds In Line with Text (`wp:inline`) has no position and
  // no place in the floating stack: the engine's group states a stacking
  // order of its own, and carried onto an inline host the page was refused
  // on every save ("an inline shape has no position and no relativeHeight"),
  // so the converted Word diagram never reached the server.
  if (attrs.wrapMode === "inline") {
    const rest: Record<string, unknown> = { ...converted.attrs };
    delete rest.relativeHeight;
    delete rest.floatAnchor;
    return {
      ...rest,
      xEmu: 0,
      yEmu: 0,
      wrapMode: "inline",
      altText: attrs.altText,
      source: convertedSmartArtSource(attrs.source),
    };
  }
  return converted
    ? {
        ...converted.attrs,
        xEmu: attrs.xEmu,
        yEmu: attrs.yEmu,
        wrapMode: attrs.wrapMode,
        // Where Word floats it (the anchor's receipt and stacking order),
        // read by the importer as a shape group's is.
        ...((nodeAttrs as Record<string, unknown>).floatAnchor
          ? { floatAnchor: (nodeAttrs as Record<string, unknown>).floatAnchor }
          : {}),
        ...(attrs.relativeHeight !== undefined
          ? { relativeHeight: attrs.relativeHeight }
          : {}),
        // The graphic's Alt Text (the drawing's `wp:docPr/@descr`) is the
        // diagram's, not the old drawing's: it survives the conversion.
        altText: attrs.altText,
        // Every trace of the native package goes EXCEPT the receipt naming the
        // drawing this replaces: the original `.docx` still holds that
        // DiagramML, and the original-package export has to replace it on every
        // save, not only the one right after the conversion. The server
        // re-reads those parts from the original package and refuses a receipt
        // that does not match, so this is an address, not an authority.
        source: convertedSmartArtSource(attrs.source),
      }
    : null;
}

/**
 * The receipt {@link documentShapeConvertedSmartArtSource} reads back: which
 * drawing this diagram replaces, and the parts and fingerprints that identify
 * it. `null` when the preserved node cannot say, which leaves the converted
 * group sourceless exactly as before — it still converts, still edits, still
 * exports as a native group; only the original-package write-back needs this.
 */
function convertedSmartArtSource(
  source: DocumentShapeAttrs["source"],
): Record<string, unknown> | null {
  const anchor = source?.sourceAnchor;
  // The preserved node's OWN view, not the narrowed one the conversion reads:
  // `documentNativeSmartArtView` returns only what building the scene needs.
  const view = source?.nativeSmartArtView;
  if (!view || typeof view !== "object" || Array.isArray(view)) return null;
  const { parts, fingerprints } = view as Record<string, unknown>;
  if (
    typeof anchor !== "string" ||
    !anchor ||
    !parts ||
    typeof parts !== "object" ||
    Array.isArray(parts) ||
    !fingerprints ||
    typeof fingerprints !== "object" ||
    Array.isArray(fingerprints)
  ) {
    return null;
  }
  return {
    adapter: "docx",
    nodeType: "convertedSmartArtGroup",
    sourceAnchor: anchor,
    ...(typeof source?.partName === "string" && source.partName
      ? { partName: source.partName }
      : {}),
    // The file's theme lists the conversion drew through stay with the
    // diagram, so Add Shape, a layout or a style rebuilt later draw its
    // gradients and shadows as the conversion did (3-D Polished under the
    // 2007 theme), not the Office theme's.
    nativeSmartArtView: {
      parts,
      fingerprints,
      ...(nativeSmartArtHostTheme((view as Record<string, unknown>).hostTheme)
        ? { hostTheme: nativeSmartArtHostTheme((view as Record<string, unknown>).hostTheme)! }
        : {}),
    },
  };
}

/**
 * The slot pictures this Docs diagram must bring before 转换为可编辑 converts
 * it, or `null` when it needs some and they cannot be brought.
 *
 * The rule itself is the shared one every host asks
 * ({@link smartArtConversionMedia}); this is only the Docs spelling of its
 * three inputs — the node's stored view, the layout the author picked and the
 * diagram's outline. `{ ok: true }` means "convert, nothing to fetch", which is
 * every diagram whose layout draws no pictures and every pictured diagram whose
 * points carry none.
 *
 * A node this reader cannot read at all — not a preserved diagram, or an
 * outline that will not parse — is `unavailable` rather than a silent `null`:
 * to the author, a diagram whose pictures cannot be found and a diagram that
 * cannot be read are the same refusal, and both must say something.
 */
export async function documentPreservedSmartArtMedia(
  nodeAttrs: DocumentShapeAttrsInput,
  layoutId: string,
  pageId: string | undefined,
): Promise<SmartArtConversionMedia> {
  if (!documentShapeIsPreservedNativeSmartArt(nodeAttrs)) {
    return { ok: false, reason: "unavailable" };
  }
  const view = documentNativeSmartArtView(nodeAttrs);
  // Read by the server; unreachable (offline) is the same refusal as a
  // diagram whose pictures cannot be fetched.
  const outline = view
    ? await readNativeSmartArtOutline(view.dataXml).catch(() => null)
    : null;
  if (!outline) return { ok: false, reason: "unavailable" };
  return smartArtConversionMedia({
    pageId,
    view: documentPreservedSmartArtSlotMediaView(nodeAttrs),
    layoutId,
    outline,
  });
}

/** The stored `nativeSmartArtView` the slot-media address is read off. */
function documentPreservedSmartArtSlotMediaView(
  nodeAttrs: DocumentShapeAttrsInput,
): unknown {
  const source = (nodeAttrs as Record<string, unknown>).source;
  return source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>).nativeSmartArtView
    : null;
}

/**
 * The Docs spelling of {@link smartArtPictureConversionUnreachable}: the
 * refusal already certain before 转换为可编辑 is pressed, so the tab can grey
 * the picture layouts out instead of offering a command that must fail.
 */
export function documentPreservedSmartArtPicturesUnreachable(
  nodeAttrs: DocumentShapeAttrsInput,
  pageId: string | undefined,
): SmartArtConversionRefusal | null {
  if (!documentShapeIsPreservedNativeSmartArt(nodeAttrs)) return null;
  const view = documentNativeSmartArtView(nodeAttrs);
  // Not known until the server has read the outline: nothing is greyed yet.
  const outline = view ? cachedNativeSmartArtOutline(view.dataXml) : null;
  if (!outline) return null;
  return smartArtPictureConversionUnreachable({
    pageId,
    view: documentPreservedSmartArtSlotMediaView(nodeAttrs),
    outline,
  });
}

/**
 * Why a Docs conversion that already came back empty came back empty, so the
 * command answers instead of returning in silence. A layout's capacity is not
 * a reason: the items it does not draw stay as hidden members.
 */
export function documentPreservedSmartArtConvertRefusal(): SmartArtConvertRefusal {
  return smartArtConvertRefusal();
}

/**
 * Whether a converted diagram's members stand where the preserved diagram's
 * drawn members stood. The preserved members are in the frame's EMU; the
 * converted group's in its child coordinate box, scaled from the frame.
 */
export function documentConversionLooksLikeDrawing(
  preserved: Readonly<Record<string, unknown>>,
  converted: Readonly<Record<string, unknown>>,
): boolean {
  const source = preserved.source as Record<string, unknown> | null | undefined;
  const view = source?.nativeSmartArtView as Record<string, unknown> | undefined;
  const drawn = Array.isArray(view?.members) ? (view!.members as unknown[]) : [];
  const width = Number(converted.widthEmu);
  const scale = Number(converted.groupCoordinateWidthEmu) / width;
  const members = Array.isArray(converted.groupMembers) ? (converted.groupMembers as unknown[]) : [];
  if (converted.smartArtKind === SMARTART_OFFICE_DEFINITION_KIND) {
    // Laid out from the file's own definition, a diagram converts only when
    // there is Word's drawing to compare and it matches it closely: there is
    // no MRAI layout of its own to stand behind a looser match (as on a slide,
    // SMARTART-GAP.md §8.7).
    const likeness = smartArtDrawingLikeness(
      smartArtBlockDrawingBoxes(drawn),
      smartArtGroupMemberDrawingBoxes(members, scale),
      width,
    );
    return likeness !== null && likeness.mean <= SMARTART_OWN_DEFINITION_LIKENESS_LIMIT;
  }
  return smartArtConversionLooksLikeDrawing(
    smartArtBlockDrawingBoxes(drawn),
    smartArtGroupMemberDrawingBoxes(members, scale),
    width,
  );
}

/** Every group id the document already spends, converted diagrams included. */
export function documentGroupIdsInUse(doc: ProseMirrorNode): Set<string> {
  const taken = new Set<string>();
  doc.descendants((node) => {
    if (!isShapeNode(node)) return true;
    const groupId = (node.attrs as Record<string, unknown>).smartArtGroupId;
    if (typeof groupId === "string" && groupId) taken.add(groupId);
    return false;
  });
  return taken;
}
