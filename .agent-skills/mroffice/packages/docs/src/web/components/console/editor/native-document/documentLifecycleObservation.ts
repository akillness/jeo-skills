/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { documentSurfaceFontsLoaded } from "./documentSurfaceFonts";

/** Facts emitted by the production editor, never a client-side certificate. */
export interface DocumentLifecycleOwner {
  pageId: string;
  windowId: string | null;
  /** Opaque current principal scope; server must resolve authenticated actor. */
  principal: string;
  sessionEpoch: number;
  editorGeneration: number;
  collabSessionGeneration: number | null;
  reloadNonce: number;
}

export interface DocumentLifecycleObservation {
  kind: "hydrated" | "save-ack";
  origin: "production-note-editor";
  owner: DocumentLifecycleOwner;
  source: { contentVersion: number; contentSha256: string | null };
  serializedContent: Record<string, unknown>;
  paginationSettled: boolean;
  acknowledgement?: {
    source: "patch" | "server-match";
    requestBaseContentVersion: number;
  };
  sequence: number;
}

const differencePathTokens = [
  "type", "attrs", "content", "text", "marks", "length", "other",
  "sectionBands", "differentFirstPage", "differentOddEven", "pageBlockSizes",
  "pageBlockLayoutKey", "pageRegionLayoutReceipt", "fontFamily", "fontSize", "color",
] as const;
type DifferencePathToken = typeof differencePathTokens[number] | number;
type DocumentLifecycleDifference = Readonly<{
  firstDifferencePath: readonly DifferencePathToken[];
  differencePathTruncated: boolean;
}>;
const DIFFERENCE_PATH_LIMIT = 16;
const DIFFERENCE_INDEX_LIMIT = 1023;
const DIFFERENCE_COMPARISON_BUDGET = 2048;
function safeDifferenceToken(value: unknown): DifferencePathToken {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= DIFFERENCE_INDEX_LIMIT) return value;
  return typeof value === "string" && (differencePathTokens as readonly string[]).includes(value)
    ? value as typeof differencePathTokens[number] : "other";
}

/** Best-effort location only, after the real equality guard rejected a draft.
 * Never returns values or arbitrary keys, never invokes accessors, and never
 * participates in the equality/ACK decision. A truncated path is only a prefix. */
export function documentLifecycleFirstDifference(left: unknown, right: unknown): DocumentLifecycleDifference | undefined {
  let budget = DIFFERENCE_COMPARISON_BUDGET;
  const found = (path: readonly DifferencePathToken[], truncated = false): DocumentLifecycleDifference => ({
    firstDifferencePath: Object.freeze(path.slice(0, DIFFERENCE_PATH_LIMIT)), differencePathTruncated: truncated,
  });
  const walk = (a: unknown, b: unknown, path: readonly DifferencePathToken[]): DocumentLifecycleDifference | undefined => {
    if (--budget < 0 || path.length >= DIFFERENCE_PATH_LIMIT) return found(path, true);
    if (a === b) return undefined;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return found(path);
    const aa = Array.isArray(a), ba = Array.isArray(b);
    if (aa !== ba) return found(path);
    const child = (key: string, token: DifferencePathToken) => {
      const next = [...path, token];
      const ad = Object.getOwnPropertyDescriptor(a, key), bd = Object.getOwnPropertyDescriptor(b, key);
      if (!ad || !bd) return found(next);
      if (!("value" in ad) || !("value" in bd)) return found(next, true);
      return walk(ad.value, bd.value, next);
    };
    if (aa && ba) {
      if (a.length !== b.length) return found([...path, "length"]);
      for (let index = 0; index < a.length; index++) {
        if (--budget < 0) return found(path, true);
        const difference = child(String(index), safeDifferenceToken(index));
        if (difference) return index > DIFFERENCE_INDEX_LIMIT ? {...difference, differencePathTruncated: true} : difference;
      }
      return undefined;
    }
    // Iterate with a work budget instead of allocating unbounded key arrays.
    for (const key in a) {
      if (--budget < 0) return found(path, true);
      if (!Object.hasOwn(a, key)) continue;
      const difference = child(key, safeDifferenceToken(key));
      if (difference) return difference;
    }
    for (const key in b) {
      if (--budget < 0) return found(path, true);
      if (Object.hasOwn(b, key) && !Object.hasOwn(a, key)) return found([...path, safeDifferenceToken(key)]);
    }
    return undefined;
  };
  try { return walk(left, right, []); }
  catch { return found(["other"], true); }
}

/**
 * A document without its layout receipt's geometry: what this browser measured
 * this time. The same page cut can read one run as two rects once a font has
 * settled (91 rects, then 93, on one line of a document with footnotes). The block
 * sizes beside it are the same kind of measurement. The canonical hash and the
 * pages, which are what the receipt proves, stay.
 */
export function withoutMeasuredLayoutGeometry<T>(document: T): T {
  const attrs = (document as {attrs?: Record<string, unknown>} | null | undefined)?.attrs;
  if (!attrs) return document;
  const {pageBlockSizes: _sizes, pageBlockLayoutKey: _key, ...kept} = attrs;
  const receipt = kept.pageRegionLayoutReceipt;
  if (receipt && typeof receipt === "object") {
    const {geometry: _measured, ...proven} = receipt as Record<string, unknown>;
    kept.pageRegionLayoutReceipt = proven;
  }
  return {...document, attrs: kept};
}

const diagnosticReasons = [
  "save-ack-entry", "observer-disabled", "binding-rejected", "scope-rejected",
  "current-rejected", "layout-pending", "serializer-invalid", "draft-mismatch",
  "emitter-guard", "duplicate", "capture-rejected", "capture-stale", "emitted", "emitter-exception",
] as const;
const diagnosticBooleanKeys = [
  "hasAcknowledgement", "saved", "ackPageMatches", "ackVersionMatches", "ackSourceAllowed",
  "differencePathTruncated", "hasDraft", "dirty", "guest", "hasOwner", "editorUsable", "sourcePageMatches",
  "ownerPageMatches", "loadedPageMatches", "bindingEditorMatches", "bindingSessionMatches",
  "reloadMatches", "validVersion", "hasPrincipal", "scopeCurrent", "authorityPending",
  "authorityPageMatches", "authorityVersionMatches", "authorityHashMatches", "importPageMatches",
  "ownerCurrent", "bindingCurrent", "documentCurrent", "generationCurrent", "composing", "serializePending",
  // Which layout prerequisite is still holding; a pending layout that never
  // resolves is otherwise one word in the log and no way to tell them apart.
  "layoutEditorPass", "layoutBlockPass", "layoutFontSet", "layoutSurfaceFonts", "layoutFontAssets",
] as const;
const diagnosticNumberKeys = [
  "contentVersion", "ackVersion", "requestBaseContentVersion", "generation", "capturedGeneration", "reloadNonce",
] as const;

/** Closed, content-free diagnostics. These are never lifecycle facts or ACKs. */
export type DocumentLifecycleDiagnostic = Readonly<{
  kind: DocumentLifecycleObservation["kind"];
  reason: typeof diagnosticReasons[number];
  firstDifferencePath?: readonly DifferencePathToken[];
} & Partial<Record<typeof diagnosticBooleanKeys[number], boolean>> &
  Partial<Record<typeof diagnosticNumberKeys[number], number>>>;
export type DocumentLifecycleDiagnosticSink = (diagnostic: DocumentLifecycleDiagnostic) => void;
export type DocumentLifecycleObserver = ((fact: DocumentLifecycleObservation) => void) & {
  diagnostic?: DocumentLifecycleDiagnosticSink;
};

function sanitizeDiagnostic(input: DocumentLifecycleDiagnostic): DocumentLifecycleDiagnostic | null {
  if (!input) return null;
  const kind = input.kind, reason = input.reason;
  if (!["hydrated", "save-ack"].includes(kind) || !diagnosticReasons.includes(reason)) return null;
  const safe: Record<string, string | number | boolean | readonly DifferencePathToken[]> = {kind, reason};
  for (const key of diagnosticBooleanKeys) {
    const value = input[key];
    if (typeof value === "boolean") safe[key] = value;
  }
  for (const key of diagnosticNumberKeys) {
    const value = input[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff) safe[key] = value;
  }
  if (Array.isArray(input.firstDifferencePath)) {
    safe.firstDifferencePath = Object.freeze(input.firstDifferencePath.slice(0, DIFFERENCE_PATH_LIMIT).map(safeDifferenceToken));
    if (input.firstDifferencePath.length > DIFFERENCE_PATH_LIMIT) safe.differencePathTruncated = true;
  }
  return Object.freeze(safe) as DocumentLifecycleDiagnostic;
}

/** Lazy and exception-isolated, including sink access and diagnostic capture. */
export function reportDocumentLifecycleDiagnostic(
  observer: DocumentLifecycleObserver | undefined,
  capture: () => DocumentLifecycleDiagnostic,
): void {
  try {
    const sink = observer?.diagnostic;
    if (!sink) return;
    const diagnostic = sanitizeDiagnostic(capture());
    if (diagnostic) sink(diagnostic);
  } catch { /* Diagnostics must never affect authoring, guards, or observation. */ }
}

export function createDocumentLifecycleDiagnosticCollector() {
  const diagnostics: DocumentLifecycleDiagnostic[] = [];
  return Object.freeze({
    record(input: DocumentLifecycleDiagnostic): void {
      try {
        const diagnostic = sanitizeDiagnostic(input);
        if (!diagnostic) return;
        if (diagnostics.length === 64) diagnostics.shift();
        diagnostics.push(diagnostic);
      } catch { /* Reject malformed diagnostics without changing host status. */ }
    },
    read(): readonly DocumentLifecycleDiagnostic[] {
      return Object.freeze(diagnostics.map(diagnostic => sanitizeDiagnostic(diagnostic)!));
    },
  });
}

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
export function documentLifecycleIdentity(value: object): number {
  let identity = identities.get(value);
  if (identity === undefined) {
    identity = ++nextIdentity;
    identities.set(value, identity);
  }
  return identity;
}

export function createDocumentLifecycleObservationEmitter() {
  let sequence = 0;
  const emitted = new Set<string>();
  return {
    emit(input: {
      observer: DocumentLifecycleObserver | undefined;
      kind: DocumentLifecycleObservation["kind"];
      owner: DocumentLifecycleOwner;
      source: DocumentLifecycleObservation["source"];
      acknowledgement?: DocumentLifecycleObservation["acknowledgement"];
      isCurrent: () => boolean;
      serialize: () => { content: Record<string, unknown>; paginationSettled: boolean } | null;
    }): boolean {
      const { observer, owner, source, acknowledgement } = input;
      if (!observer || !owner.principal || !owner.pageId ||
          !Number.isSafeInteger(source.contentVersion) || source.contentVersion < 1 ||
          (source.contentSha256 !== null && !/^[0-9a-f]{64}$/i.test(source.contentSha256)) ||
          (input.kind === "save-ack" && (!acknowledgement ||
            !["patch", "server-match"].includes(acknowledgement.source) ||
            !Number.isSafeInteger(acknowledgement.requestBaseContentVersion) ||
            acknowledgement.requestBaseContentVersion < 1)) ||
          !input.isCurrent()) {
        reportDocumentLifecycleDiagnostic(observer, () => ({kind: input.kind, reason: "emitter-guard"}));
        return false;
      }
      const key = JSON.stringify([input.kind, owner, source, acknowledgement]);
      if (emitted.has(key)) {
        reportDocumentLifecycleDiagnostic(observer, () => ({kind: input.kind, reason: "duplicate"}));
        return false;
      }
      try {
        const serialized = input.serialize();
        if (!serialized || !serialized.paginationSettled || !input.isCurrent()) {
          reportDocumentLifecycleDiagnostic(observer, () => ({kind: input.kind, reason: "capture-rejected"}));
          return false;
        }
        const fact = structuredClone({
          kind: input.kind, origin: "production-note-editor" as const,
          owner, source, serializedContent: serialized.content,
          paginationSettled: serialized.paginationSettled,
          ...(acknowledgement ? { acknowledgement } : {}), sequence: sequence + 1,
        });
        if (!input.isCurrent()) {
          reportDocumentLifecycleDiagnostic(observer, () => ({kind: input.kind, reason: "capture-stale"}));
          return false;
        }
        sequence += 1;
        emitted.add(key);
        // Bound observer bookkeeping even for a document held open for days.
        if (emitted.size > 64) emitted.delete(emitted.values().next().value!);
        observer(fact);
        reportDocumentLifecycleDiagnostic(observer, () => ({kind: input.kind, reason: "emitted"}));
        return true;
      } catch {
        // Observation failures must never cancel authoring or a real save ACK.
        reportDocumentLifecycleDiagnostic(observer, () => ({kind: input.kind, reason: "emitter-exception"}));
        return false;
      }
    },
  };
}

const EDITOR_LAYOUT_ATTRIBUTES = [
  "data-docs-auto-line-spacing-pending", "data-docs-word-cjk-spacing-pending",
  "data-docs-display-fonts-pending", "data-docs-display-fonts-settling",
  "data-pagination-initial-settling", "data-pagination-stalled", "data-docs-page-bands-pending",
  // A long document is shown before its last pages are laid out.
  "data-pagination-background",
  // A long document is still being filled into the view.
  "data-paged-bulk-filling",
] as const;
const BLOCK_LAYOUT_ATTRIBUTES = ["data-math-pending", "data-docs-page-bands-pending"] as const;
const EDITOR_LAYOUT_SELECTOR = EDITOR_LAYOUT_ATTRIBUTES.map(name => `[${name}]`).join(",");
const BLOCK_LAYOUT_SELECTOR = BLOCK_LAYOUT_ATTRIBUTES.map(name => `[${name}]`).join(",");
const PRINT_BLOCK_LAYOUT_SELECTOR = "[data-math-pending]:not([data-math-layout-ready]),[data-docs-page-bands-pending]";

/** Every attribute whose presence keeps {@link documentLifecycleLayoutSettled}
 *  false. A pending lifecycle fact is retried when one of them changes, so a
 *  layout that settles by clearing any of them is always observed. */
export const DOCUMENT_LIFECYCLE_LAYOUT_ATTRIBUTES: readonly string[] = [
  ...new Set<string>([...EDITOR_LAYOUT_ATTRIBUTES, ...BLOCK_LAYOUT_ATTRIBUTES]),
];

/** Each layout prerequisite, named. Only reads current browser state; never
 *  changes author data. A caller that merely needs the verdict asks
 *  {@link documentLifecycleLayoutSettled}; a caller reporting why nothing was
 *  emitted says which one is still holding, in booleans that carry no content. */
export function documentLifecycleLayoutPasses(element: HTMLElement | null): {
  layoutEditorPass: boolean;
  layoutBlockPass: boolean;
  layoutFontSet: boolean;
  layoutSurfaceFonts: boolean;
  layoutFontAssets: boolean;
} {
  if (!element)
    return {
      layoutEditorPass: false, layoutBlockPass: false, layoutFontSet: false,
      layoutSurfaceFonts: false, layoutFontAssets: false,
    };
  const document = element.ownerDocument;
  return {
    layoutEditorPass: !element.matches(EDITOR_LAYOUT_SELECTOR),
    layoutBlockPass: !element.querySelector(BLOCK_LAYOUT_SELECTOR),
    layoutFontSet: document.fonts?.status !== "loading",
    // A face nothing has asked for yet reports nothing loading, and this
    // surface would measure its own text in a fallback.
    layoutSurfaceFonts: documentSurfaceFontsLoaded(element),
    layoutFontAssets:
      !document.documentElement.hasAttribute("data-font-assets-loading") &&
      !document.documentElement.hasAttribute("data-font-assets-error"),
  };
}

/** Only reads current browser layout prerequisites; never changes author data. */
export function documentLifecycleLayoutSettled(
  element: HTMLElement | null,
  /** A print: a formula still a placeholder of its typeset box
   * (`data-math-layout-ready`) stands as it will print, and the print copy
   * typesets it. Only one with no box yet holds the layout. */
  options?: { readonly formulaBoxesStand?: boolean },
): boolean {
  // The same verdict as every pass of documentLifecycleLayoutPasses, the
  // cheap ones first: the surface-font pass matches every face of the font
  // set against the page's sample, and asked every frame while a long
  // document's first layout was still settling it cost 0.6 s of the
  // 298-page book's first seconds, to be outvoted by an attribute.
  if (!element) return false;
  if (element.matches(EDITOR_LAYOUT_SELECTOR) ||
      element.querySelector(options?.formulaBoxesStand ? PRINT_BLOCK_LAYOUT_SELECTOR : BLOCK_LAYOUT_SELECTOR)) return false;
  const document = element.ownerDocument;
  if (document.fonts?.status === "loading") return false;
  if (document.documentElement.hasAttribute("data-font-assets-loading") ||
      document.documentElement.hasAttribute("data-font-assets-error")) return false;
  return documentSurfaceFontsLoaded(element);
}

/** The attribute the display-font plan writes its verdict to. */
export const DOCUMENT_DISPLAY_FONTS_STATUS_ATTRIBUTE = "data-document-display-fonts";











export function documentLifecycleDisplayFontsDecided(element: HTMLElement | null): boolean {
  const status = element?.getAttribute(DOCUMENT_DISPLAY_FONTS_STATUS_ATTRIBUTE);
  return typeof status === "string" && status !== "" && status !== "loading";
}
