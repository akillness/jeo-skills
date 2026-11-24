/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The language a paragraph's text is set in when its runs state none: the
 * paragraph style's `w:rPr/w:lang/@w:val` along its basedOn chain, else the
 * document defaults' (`w:docDefaults/w:rPrDefault`), as Word resolves a run's
 * language (ECMA-376 §17.7.2, style hierarchy). Read from the page's
 * `styleDefinitions`; shared by automatic hyphenation (the paragraph's `lang`)
 * and spelling (the dictionary its words are judged with).
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const LANGUAGE_TAG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,5}$/;

type StyleRecord = {
  styleId?: unknown;
  type?: unknown;
  basedOn?: unknown;
  default?: unknown;
  rPr?: { language?: { val?: unknown } | null } | null;
};

export interface DocumentLanguageStyles {
  readonly byId: ReadonlyMap<string, StyleRecord>;
  readonly defaultParagraphStyle: string | null;
  readonly defaultLanguage: string | null;
}

export function documentLanguageTag(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 && LANGUAGE_TAG_RE.test(value)
    ? value
    : null;
}

const cache = new WeakMap<object, DocumentLanguageStyles>();

export function readDocumentLanguageStyles(docAttrs: Record<string, unknown>): DocumentLanguageStyles {
  const definitions = docAttrs.styleDefinitions as
    | { styles?: unknown; docDefaults?: { rPr?: { language?: { val?: unknown } } } }
    | null
    | undefined;
  if (definitions && typeof definitions === "object") {
    const known = cache.get(definitions);
    if (known) return known;
  }
  const byId = new Map<string, StyleRecord>();
  let defaultParagraphStyle: string | null = null;
  for (const raw of Array.isArray(definitions?.styles) ? definitions.styles : []) {
    const style = raw as StyleRecord;
    if (typeof style?.styleId !== "string") continue;
    byId.set(style.styleId, style);
    if (style.type === "paragraph" && style.default === true) defaultParagraphStyle = style.styleId;
  }
  const styles: DocumentLanguageStyles = {
    byId,
    defaultParagraphStyle,
    defaultLanguage: documentLanguageTag(definitions?.docDefaults?.rPr?.language?.val),
  };
  if (definitions && typeof definitions === "object") cache.set(definitions, styles);
  return styles;
}

/** The first language the style chain states (the style, then what it is based on). */
function styleChainLanguage(styles: DocumentLanguageStyles, styleId: string | null): string | null {
  const seen = new Set<string>();
  for (let id = styleId; id && !seen.has(id); ) {
    seen.add(id);
    const style = styles.byId.get(id);
    if (!style) break;
    const value = documentLanguageTag(style.rPr?.language?.val);
    if (value) return value;
    id = typeof style.basedOn === "string" ? style.basedOn : null;
  }
  return null;
}

/** The language `paragraph` (a textblock) is set in, or null when the
 *  document states none for it. */
export function documentParagraphLanguage(
  styles: DocumentLanguageStyles,
  paragraph: ProseMirrorNode,
): string | null {
  const attrs = paragraph.attrs as Record<string, unknown>;
  const styleId =
    typeof attrs.docxStyleId === "string" ? attrs.docxStyleId : styles.defaultParagraphStyle;
  return styleChainLanguage(styles, styleId) ?? styles.defaultLanguage;
}
