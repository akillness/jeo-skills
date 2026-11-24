/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import DOMPurify from "dompurify";

/**
 * The iframe CSP is deliberately a fixed application constant, never derived
 * from notebook output. A sandbox without `allow-scripts` prevents execution,
 * but does not by itself prevent passive resource loads (for example a
 * tracking `<img>` or CSS `url()`). This policy closes that separate channel.
 */
export const CODE_OUTPUT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "connect-src 'none'",
  "font-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "media-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export type CodeOutputSandboxMarkupKind = "html" | "svg";

const FORBIDDEN_TAGS = [
  "script",
  "noscript",
  "meta",
  "link",
  "base",
  "iframe",
  "frame",
  "frameset",
  "fencedframe",
  "object",
  "embed",
  "applet",
  "portal",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "optgroup",
  "fieldset",
  "label",
  "audio",
  "video",
  "source",
  "track",
  "template",
  "plaintext",
  "xmp",
  "noembed",
  "noframes",
  "foreignobject",
  // SMIL can mutate a safe local reference into a remote URL after the static
  // attribute pass. Static notebook figures do not need animation elements.
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
] as const;

const FORBIDDEN_ATTRIBUTES = [
  "http-equiv",
  "nonce",
  "integrity",
  "target",
  "ping",
  "srcdoc",
  "srcset",
  "imagesrcset",
  "imagesizes",
  "autofocus",
] as const;

/** Attributes whose value can initiate a fetch or navigation. */
const RESOURCE_ATTRIBUTES = new Set([
  "action",
  "archive",
  "background",
  "cite",
  "classid",
  "code",
  "codebase",
  "data",
  "dynsrc",
  "formaction",
  "href",
  "icon",
  "longdesc",
  "lowsrc",
  "manifest",
  "ping",
  "poster",
  "profile",
  "src",
  "srcset",
  "usemap",
  "xlink:href",
]);

/** SVG presentation attributes whose CSS grammar can contain url(...). */
const CSS_REFERENCE_ATTRIBUTES = new Set([
  "clip-path",
  "color-profile",
  "cursor",
  "fill",
  "filter",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
]);

/**
 * Inline styles are useful for DataFrame/table fidelity, but only a small
 * presentation-only property set is needed. Excluding image/filter/cursor and
 * custom properties removes CSS fetch primitives instead of trying to parse
 * every browser-specific URL grammar.
 */
const SAFE_STYLE_PROPERTIES = new Set([
  "background-color",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-width",
  "box-sizing",
  "clear",
  "color",
  "display",
  "fill",
  "fill-opacity",
  "float",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "list-style-position",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-overflow",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
  "word-spacing",
  "word-wrap",
]);

const UNSAFE_STYLE_VALUE =
  /(?:url\s*\(|@import|expression\s*\(|image-set\s*\(|-moz-binding|behavior\s*:|javascript\s*:|vbscript\s*:|data\s*:|blob\s*:|https?\s*:|ftp\s*:|file\s*:|\/\/|\\|var\s*\()/i;

const INLINE_RASTER_IMAGE =
  /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,[a-z0-9+/]*={0,2}$/i;

const MAX_SANDBOX_MARKUP_CHARS = 1_000_000;
const MAX_SANDBOX_TAGS = 20_000;
const MAX_SANDBOX_STYLE_CHARS = 100_000;
const MAX_SANDBOX_STYLE_RULES = 1_000;
const SAFE_STYLE_SELECTOR = /^[A-Za-z0-9_#.*:\-\s>,+~]+$/;
const RICH_OUTPUT_OMITTED =
  '<pre data-output-omitted="resource-budget">Output omitted: rich output exceeds the safe rendering budget.</pre>';

function isSafeInlineImage(value: string): boolean {
  const trimmed = value.trim();
  return INLINE_RASTER_IMAGE.test(trimmed);
}

function isLocalFragment(value: string): boolean {
  return /^#[A-Za-z_][\w:.-]*$/.test(value.trim());
}

function isImageElement(element: Element): boolean {
  const tag = element.localName.toLowerCase();
  return tag === "img" || tag === "image" || tag === "feimage";
}

function isSafeResourceAttribute(
  element: Element,
  attributeName: string,
  value: string,
): boolean {
  if (attributeName === "srcset" || attributeName === "ping") return false;
  if (
    (attributeName === "src" ||
      attributeName === "href" ||
      attributeName === "xlink:href") &&
    isImageElement(element)
  ) {
    return isSafeInlineImage(value) || isLocalFragment(value);
  }
  if (attributeName === "href" || attributeName === "xlink:href") {
    return isLocalFragment(value);
  }
  if (attributeName === "usemap") return isLocalFragment(value);
  return false;
}

function sanitizeStyleAttribute(element: Element, raw: string): void {
  const parser = document.createElement("span");
  parser.setAttribute("style", raw);
  const cleaned = document.createElement("span");

  for (let index = 0; index < parser.style.length; index += 1) {
    const property = parser.style.item(index).toLowerCase();
    const value = parser.style.getPropertyValue(property).trim();
    if (
      !SAFE_STYLE_PROPERTIES.has(property) ||
      UNSAFE_STYLE_VALUE.test(value)
    ) {
      continue;
    }
    cleaned.style.setProperty(property, value);
  }

  const safeStyle = cleaned.getAttribute("style");
  if (safeStyle) element.setAttribute("style", safeStyle);
  else element.removeAttribute("style");
}

function sanitizeStyleSheet(raw: string): string {
  if (
    raw.length > MAX_SANDBOX_STYLE_CHARS ||
    raw.includes("\\") ||
    /@|<!--|-->/i.test(raw)
  ) {
    return "";
  }
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  const rules: string[] = [];
  let consumed = 0;
  for (const match of withoutComments.matchAll(rulePattern)) {
    if (rules.length >= MAX_SANDBOX_STYLE_RULES) return "";
    const index = match.index ?? 0;
    if (withoutComments.slice(consumed, index).trim()) return "";
    consumed = index + match[0].length;
    const selector = match[1].trim();
    if (!selector || !SAFE_STYLE_SELECTOR.test(selector)) continue;
    const scratch = document.createElement("span");
    sanitizeStyleAttribute(scratch, match[2]);
    const declarations = scratch.getAttribute("style");
    if (declarations) rules.push(`${selector}{${declarations}}`);
  }
  if (withoutComments.slice(consumed).trim()) return "";
  return rules.join("\n");
}

function localCssReference(value: string): RegExpMatchArray | null {
  return value.match(/^\s*url\(\s*["']?(#[A-Za-z_][\w:.-]*)["']?\s*\)\s*$/i);
}

function isSafeCssReferenceAttribute(value: string): boolean {
  // A backslash can conceal `url` with a CSS escape (for example u\72l).
  if (value.includes("\\")) return false;
  if (!/url\s*\(/i.test(value)) return true;
  return localCssReference(value) !== null;
}

function sanitizeMarkup(markup: string): string {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    // The React renderer calls this after mount. This branch keeps direct SSR
    // callers fail-closed instead of ever embedding unsanitized markup.
    return markup
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  if (markup.length > MAX_SANDBOX_MARKUP_CHARS) return RICH_OUTPUT_OMITTED;
  let approximateTagCount = 0;
  for (let index = markup.indexOf("<"); index !== -1; ) {
    approximateTagCount += 1;
    if (approximateTagCount > MAX_SANDBOX_TAGS) return RICH_OUTPUT_OMITTED;
    index = markup.indexOf("<", index + 1);
  }

  // Sanitize an app-created container in place. Sanitizing a raw HTML string
  // causes the browser parser to hoist leading <style> elements into a
  // temporary <head>, which DOMPurify intentionally omits when returning a
  // fragment. Keeping the inert container lets us validate Pandas Styler CSS
  // below without widening the sanitizer policy.
  const purifierRoot = document.createElement("div");
  purifierRoot.innerHTML = markup;
  DOMPurify.sanitize(purifierRoot, {
    IN_PLACE: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    WHOLE_DOCUMENT: false,
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_DOM: true,
    // The iframe has no scripts and an opaque origin, so named-property DOM
    // clobbering cannot affect app code. Prefixing every id would instead break
    // legitimate SVG paint/use references such as url(#gradient).
    SANITIZE_NAMED_PROPS: false,
    // DOMPurify does not retain author stylesheets in every environment. Keep
    // the element long enough for the strict, presentation-only CSS parser
    // below to validate each rule and declaration.
    ADD_TAGS: ["use", "style"],
    FORBID_TAGS: [...FORBIDDEN_TAGS],
    FORBID_ATTR: [...FORBIDDEN_ATTRIBUTES],
  });

  // Post-process the purified tree so URL policy is the same for HTML and SVG.
  // DOMPurify blocks executable schemes, but intentionally permits ordinary
  // https images/styles; notebook output must also be unable to track users.
  for (const element of Array.from(purifierRoot.querySelectorAll("*"))) {
    if (element.localName.toLowerCase() === "style") {
      const safeCss = sanitizeStyleSheet(element.textContent ?? "");
      if (safeCss) element.textContent = safeCss;
      else element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name === "style") {
        sanitizeStyleAttribute(element, attribute.value);
        continue;
      }
      if (RESOURCE_ATTRIBUTES.has(name)) {
        if (!isSafeResourceAttribute(element, name, attribute.value)) {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (CSS_REFERENCE_ATTRIBUTES.has(name)) {
        if (!isSafeCssReferenceAttribute(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      // SVG paint/filter attributes may use CSS url(...). Keep only a local
      // fragment; every remote or data URL form is stripped.
      if (/url\s*\(/i.test(attribute.value)) {
        if (!localCssReference(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }
  return purifierRoot.innerHTML;
}

function wrapSandboxedDocument(
  sanitizedMarkup: string,
  kind: CodeOutputSandboxMarkupKind,
): string {
  const bodyStyle =
    kind === "svg"
      ? "margin:0;overflow:auto"
      : "margin:0;font:13px/1.4 system-ui,sans-serif;color:#111827;overflow:auto";
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CODE_OUTPUT_CSP}">`,
    '<meta name="referrer" content="no-referrer">',
    `<style>html{color-scheme:light}body{${bodyStyle}}</style>`,
    `</head><body>${sanitizedMarkup}</body></html>`,
  ].join("");
}

export function emptyCodeOutputDocument(
  kind: CodeOutputSandboxMarkupKind,
): string {
  return wrapSandboxedDocument("", kind);
}

/** Build one sanitized, no-network srcdoc for legacy HTML, rich HTML, or SVG. */
export function buildCodeOutputDocument(
  markup: string,
  kind: CodeOutputSandboxMarkupKind,
): string {
  return wrapSandboxedDocument(sanitizeMarkup(markup), kind);
}
