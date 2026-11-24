/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** A named native face, not an invented numeric weight on a different font.
 * No font bytes, URLs or machine paths enter the document. */
export type OfficeFontRole = "regular" | "bold" | "italic" | "boldItalic";
export interface OfficeFontAssetFile {
  attachmentId?: string;
  embeddedPart?: string;
  fontKey?: string;
  sha256: string;
  sizeBytes: number;
  postscriptName: string;
  role: OfficeFontRole;
  /** Embedded with only the characters the document uses (Word's `w:subsetted`). */
  subsetted?: true;
}
export interface OfficeFontAsset {
  family: string;
  files: OfficeFontAssetFile[];
}

export interface OfficeFontFace {
  version: 1;
  family: string;
  style: string;
  fullName: string;
  postscriptName: string;
  basePostscriptName: string;
  axes: Record<string, number>;
  asset?: OfficeFontAsset;
}

export const OFFICE_FONT_FACE_NS = "https://mrnote.dev/ns/font-face/1";
let assetRuleBuilder: ((asset: OfficeFontAsset) => string) | null = null;
export function setOfficeFontAssetRuleBuilder(
  builder: (asset: OfficeFontAsset) => string,
): void {
  assetRuleBuilder = builder;
}

const safeName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f<>;{}\\"']/u.test(value);
const safePostscript = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/u.test(value);

export function normalizeOfficeFontFace(value: unknown): OfficeFontFace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const face = value as Record<string, unknown>;
  if (
    Object.keys(face).some(
      (key) =>
        ![
          "version",
          "family",
          "style",
          "fullName",
          "postscriptName",
          "basePostscriptName",
          "axes",
          "asset",
        ].includes(key),
    ) ||
    face.version !== 1 ||
    !safeName(face.family) ||
    !safeName(face.style) ||
    !safeName(face.fullName) ||
    !safePostscript(face.postscriptName) ||
    !safePostscript(face.basePostscriptName) ||
    !face.axes ||
    typeof face.axes !== "object" ||
    Array.isArray(face.axes)
  )
    return null;
  const axes: Record<string, number> = {};
  const asset =
    face.asset === undefined ? undefined : normalizeOfficeFontAsset(face.asset);
  if (face.asset !== undefined && !asset) return null;
  const entries = Object.entries(face.axes);
  if (entries.length > 16) return null;
  for (const [tag, coordinate] of entries.sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (
      !/^[A-Za-z][A-Za-z0-9 ]{3}$/u.test(tag) ||
      typeof coordinate !== "number" ||
      !Number.isFinite(coordinate) ||
      coordinate < -32768 ||
      coordinate >= 32768
    )
      return null;
    axes[tag] = coordinate;
  }
  return {
    version: 1,
    family: face.family,
    style: face.style,
    fullName: face.fullName,
    postscriptName: face.postscriptName,
    basePostscriptName: face.basePostscriptName,
    axes,
    ...(asset ? { asset } : {}),
  };
}

export function normalizeOfficeFontAsset(
  value: unknown,
): OfficeFontAsset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const asset = value as Record<string, unknown>;
  if (
    Object.keys(asset).sort().join(",") !== "family,files" ||
    !safeName(asset.family) ||
    !Array.isArray(asset.files) ||
    asset.files.length < 1 ||
    asset.files.length > 4
  )
    return null;
  const files: OfficeFontAssetFile[] = [];
  const roles = new Set<string>();
  let total = 0;
  for (const item of asset.files) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const f = item as Record<string, unknown>;
    // Word's own marker for a font embedded with only the characters the
    // document uses; optional, and only ever true.
    if ("subsetted" in f && f.subsetted !== true) return null;
    const keys = Object.keys(f).filter(key => key !== "subsetted").sort().join(",");
    const uploaded =
      keys ===
        "attachmentId,postscriptName,role,sha256,sizeBytes" &&
      typeof f.attachmentId === "string" &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(f.attachmentId);
    const embedded =
      keys ===
        "embeddedPart,fontKey,postscriptName,role,sha256,sizeBytes" &&
      typeof f.embeddedPart === "string" &&
      /^word\/fonts\/[0-9a-f]{64}\.odttf$/u.test(f.embeddedPart) &&
      typeof f.fontKey === "string" &&
      /^\{?[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\}?$/u.test(
        f.fontKey,
      );
    if (
      (!uploaded && !embedded) ||
      typeof f.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(f.sha256) ||
      !safePostscript(f.postscriptName) ||
      typeof f.sizeBytes !== "number" ||
      !Number.isSafeInteger(f.sizeBytes) ||
      f.sizeBytes < 12 ||
      f.sizeBytes > 64 * 1024 * 1024 ||
      typeof f.role !== "string" ||
      !["regular", "bold", "italic", "boldItalic"].includes(f.role) ||
      roles.has(f.role)
    )
      return null;
    roles.add(f.role);
    total += f.sizeBytes;
    files.push({
      ...(uploaded
        ? { attachmentId: f.attachmentId as string }
        : {
            embeddedPart: f.embeddedPart as string,
            fontKey: f.fontKey as string,
          }),
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      postscriptName: f.postscriptName,
      role: f.role as OfficeFontRole,
      ...(f.subsetted === true ? { subsetted: true as const } : {}),
    });
  }
  if (total > 128 * 1024 * 1024 || !roles.has("regular")) return null;
  return {
    family: asset.family,
    files: files.sort((a, b) => a.role.localeCompare(b.role)),
  };
}

export function parseOfficeFontFace(
  value: string | null,
): OfficeFontFace | null {
  if (!value || value.length > 4096) return null;
  try {
    return normalizeOfficeFontFace(JSON.parse(value));
  } catch {
    return null;
  }
}

export function officeFontFaceVariationCss(face: OfficeFontFace): string {
  return (
    Object.entries(face.axes)
      .map(([tag, coordinate]) => `"${tag}" ${coordinate}`)
      .join(", ") || "normal"
  );
}

export function officeFontFaceFamily(face: OfficeFontFace): string {
  if (face.asset)
    return `MRAI-Font-${face.asset.files.map((file) => file.sha256).join("-")}`;
  return `MRAI-Face-${face.postscriptName}`;
}

/**
 * CSS generic family keywords and platform aliases. Each names a CATEGORY or
 * "whatever the OS picks", never a font, so no OOXML face attribute may hold
 * one -- and `system-ui` leads the pickers' "System default" stack.
 */
const CSS_NON_FAMILY_TOKENS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "cursive",
  "fantasy",
  "-apple-system",
  "blinkmacsystemfont",
  "ui-rounded",
  "math",
  "fangsong",
]);

/**
 * The first concrete family of a page font value (`"SimSun", serif` -> `SimSun`),
 * or `""` when the value names none.
 *
 * THE map from what a page stores to what an OOXML single-face attribute may
 * hold. The font pickers store a whole CSS stack so the browser has a fallback
 * chain, but `w:rFonts/@w:ascii` and `a:latin/@typeface` (ST_TextTypeface) each
 * name exactly ONE family -- DrawingML expresses alternates through the sibling
 * `panose`/`pitchFamily`/`charset` attributes, never through more names. Its
 * server-side twin is `app/services/document_font_face.py::primary_font_face`,
 * which both editors' writers use; keep the two lists together.
 */
export function primaryOfficeFontFace(value: unknown): string {
  if (typeof value !== "string") return "";
  for (const token of value.split(",")) {
    const face = token.trim().replace(/^["']|["']$/g, "").trim();
    if (!face || CSS_NON_FAMILY_TOKENS.has(face.toLowerCase())) continue;
    return face.slice(0, 200);
  }
  return "";
}

const registered = new WeakMap<Document, Map<string, FontFace>>();

/** Bind a persisted face again on reload, independently of discovery permission.
 * local() accepts the native PostScript identity; font-family alone does not
 * reliably do so on every platform. Only local sources are ever constructed. */
export function registerOfficeFontFace(
  face: OfficeFontFace,
  target?: Document,
): void {
  const doc =
    target ?? (typeof document === "undefined" ? undefined : document);
  const Constructor = (doc?.defaultView as (Window & typeof globalThis) | null)
    ?.FontFace;
  if (!doc?.fonts || !Constructor) return;
  if (face.asset) {
    void import("./officeFontAssets")
      .then((module) => module.registerLeasedFontAsset(face.asset!, doc))
      .catch(() => undefined);
    return;
  }
  let fonts = registered.get(doc);
  if (!fonts) {
    fonts = new Map();
    registered.set(doc, fonts);
  }
  const family = officeFontFaceFamily(face);
  if (fonts.has(family)) return;
  const descriptors: FontFaceDescriptors & { variationSettings: string } = {
    variationSettings: officeFontFaceVariationCss(face),
  };
  const font = new Constructor(
    family,
    `local("${face.postscriptName}")`,
    descriptors,
  );
  fonts.set(family, font);
  doc.fonts.add(font);
  // A missing local face remains a failed font load, never replaced with a
  // different named instance. Native font-loading events invalidate measurement.
  void font.load().catch(() => undefined);
}

export function officeFontFaceStyle(face: OfficeFontFace): string {
  registerOfficeFontFace(face);
  if (face.asset) return `font-family: "${officeFontFaceFamily(face)}"`;
  // Prefer the native named face where the platform exposes it. The explicit
  // binding covers engines that accept the identity only through local(). Axes
  // belong to that face, not the inline box: otherwise fallback scripts would
  // accidentally inherit another font's private wght/wdth coordinates.
  return `font-family: "${face.postscriptName}", "${officeFontFaceFamily(face)}"`;
}

/** For standalone HTML/print documents, whose FontFaceSet is not the editor's. */
export function officeFontFaceRule(face: OfficeFontFace): string {
  if (face.asset) {
    if (!assetRuleBuilder) throw new Error("document_font_assets_not_ready");
    return assetRuleBuilder(face.asset);
  }
  return `@font-face{font-family:"${officeFontFaceFamily(face)}";src:local("${face.postscriptName}");font-variation-settings:${officeFontFaceVariationCss(face)}}`;
}
