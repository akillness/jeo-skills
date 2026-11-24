"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import {
  documentRubyCssAlign,
  normalizeRubyAlign,
  normalizeRubyFontFamily,
  normalizeRubyFontSize,
  normalizeRubyOffset,
  readDocumentRubyProperties,
  type DocumentRubyProperties,
} from "./rubyProperties";

/**
 * Document RUBY TEXT / phonetic guide (Word "拼音指南" / WPS Writer phonetic
 * guide / furigana) — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds ONE inline ATOM node ("ruby") — a
 * base run with a small annotation rendered ABOVE it (pinyin over Chinese,
 * furigana over kanji, etc.). It carries TWO sanitized text attributes:
 *   - `base`: the main run the annotation sits over (the selected text the user
 *     wraps). Rendered as the `<ruby>` body.
 *   - `rt`:   the annotation the user typed (the phonetic guide). Rendered as the
 *     `<rt>` element above the base.
 *
 * NODE, NOT MARK — and an ATOM at that — because:
 *   - a ruby binds TWO text components (base + annotation), which a mark (a span
 *     over existing text) structurally cannot carry; it is naturally an inline
 *     node;
 *   - the codebase's other two-part inline constructs (crossRef = anchor+label,
 *     footnoteRef, citation) are all inline ATOM nodes carrying their parts on
 *     sanitized attrs, and this MIRRORS that proven pattern (parse/render/export
 *     all funnel through one sanitizer, so a forged/imported value can never
 *     break out of the DOM/OOXML surface);
 *   - a ruby is one conceptual unit — it should move and delete atomically (Word
 *     edits the guide via a dialog, not by editing the base in place), which is
 *     exactly an atom's behavior. The user re-types the annotation to change it.
 *
 * The node rides through the document schema's open `content`/`attrs`
 * passthrough (see lib/native-page-schemas → documentNodeSchema accepts any node
 * type with arbitrary attrs), so EXISTING documents — which carry none — still
 * validate and load unchanged. There is no flag: the feature is purely opt-in
 * per user action (Insert ruby / phonetic guide); a document with no ruby nodes
 * behaves, renders, and EXPORTS exactly as before.
 *
 * SECURITY: both attrs pass through {@link sanitizeRubyText} on EVERY edge
 * (parse, render, command, NodeView) — control bytes are stripped, whitespace
 * collapsed, length clamped — and are painted as TEXT (React/TipTap escape
 * markup). A ruby whose base sanitizes to empty is never created (an annotation
 * with nothing to sit over is meaningless); an empty annotation is allowed and
 * simply renders an empty `<rt>` so the base text is never lost.
 */

/** The inline node name for a ruby / phonetic-guide annotation. */
export const RUBY_NODE_NAME = "ruby";

/**
 * The maximum length (in characters) of a ruby base run and of its annotation.
 * A phonetic guide annotates a short word/phrase, not a paragraph; clamping both
 * sides keeps a forged/imported value from ballooning the document (mirrors the
 * per-field clamps the footnote/citation/cross-reference nodes carry). The base
 * is the more generous of the two (a run can be a phrase); the annotation is the
 * pronunciation of that run.
 */
export const MAX_RUBY_BASE_LENGTH = 300;
export const MAX_RUBY_TEXT_LENGTH = 300;

const RUBY_CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Sanitize a stored/imported ruby text fragment (base OR annotation). Drops
 * control characters, collapses internal whitespace to single spaces, trims, and
 * clamps to `max`. Literal angle brackets / quotes are PRESERVED (React/TipTap +
 * the OOXML XML-escaper handle them); only control bytes that could corrupt the
 * DOM / XML stream are removed. Returns "" for any non-string / empty input.
 */
export function sanitizeRubyText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(RUBY_CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentRuby: {
      /**
       * Wrap the current text selection in a ruby node: the selected text becomes
       * the base run and `annotation` becomes the phonetic guide rendered above
       * it. When the selection is collapsed (no base), `base` may be supplied
       * explicitly; otherwise the selected text is used. No-op (returns false)
       * when the resolved base sanitizes to empty — a guide needs something to
       * sit over. The annotation may be empty (renders an empty `<rt>`).
       */
      setRubyAnnotation: (annotation: string, base?: string) => ReturnType;
    };
  }
}

/**
 * The in-editor ruby view: a native `<ruby>` with the base as its body and an
 * `<rt>` above carrying the annotation. Both texts are re-sanitized off the
 * immutable node attrs so a forged value cannot smuggle markup, and an empty
 * annotation still renders (an empty `<rt>`) so the base run is never lost. The
 * whole node is non-editable (an atom); a `title` surfaces the annotation on
 * hover for accessibility.
 */
function RubyAnnotationView(props: NodeViewProps) {
  const { node } = props;
  const base = sanitizeRubyText(node.attrs?.base, MAX_RUBY_BASE_LENGTH);
  const rt = sanitizeRubyText(node.attrs?.rt, MAX_RUBY_TEXT_LENGTH);
  const properties = readDocumentRubyProperties(
    node.attrs as Record<string, unknown>,
  );
  return (
    <NodeViewWrapper
      as="ruby"
      className="mrnote-ruby"
      data-type="ruby"
      data-ruby-align={properties.align ?? undefined}
      style={rubyStyle(properties)}
      title={rt || undefined}
    >
      {base}
      <rt
        className="mrnote-ruby__rt"
        contentEditable={false}
        style={rubyTextStyle(properties)}
      >
        {rt}
      </rt>
    </NodeViewWrapper>
  );
}

/**
 * The guide's Word properties as CSS: Alignment as `ruby-align` (Right and
 * Vertical align the guide's own text), Size as the guide's font size, Offset
 * as extra space under the guide, Font as its face.
 */
function rubyStyle(
  properties: DocumentRubyProperties,
): React.CSSProperties | undefined {
  const style: Record<string, string> = {};
  if (properties.align !== null) {
    style.rubyAlign = documentRubyCssAlign(properties.align);
  }
  // How far the guide stands above its base (its own line box plus the
  // Offset gap), for the line-grid rule in note-editor.css that keeps a
  // guided line inside one grid slot when the guide fits there, as Word does.
  const extent = rubyAnnotationExtent(properties);
  if (extent !== null) style["--mrnote-ruby-annotation-extent"] = extent;
  return Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined;
}

function rubyAnnotationExtent(properties: DocumentRubyProperties): string | null {
  const offset =
    properties.offset !== null && properties.offset > 0 ? properties.offset : 0;
  if (properties.fontSize === null && offset === 0) return null;
  const size = properties.fontSize !== null ? `${properties.fontSize}pt` : "0.5em";
  return offset > 0
    ? `calc(${size} * 1.1 + ${offset}pt)`
    : `calc(${size} * 1.1)`;
}

function rubyTextStyle(
  properties: DocumentRubyProperties,
): React.CSSProperties | undefined {
  const style: React.CSSProperties = {};
  if (properties.fontSize !== null) style.fontSize = `${properties.fontSize}pt`;
  if (properties.fontFamily !== null) {
    style.fontFamily = `"${properties.fontFamily.replace(/["\\]/g, "")}"`;
  }
  if (properties.offset !== null && properties.offset > 0) {
    style.paddingBottom = `${properties.offset}pt`;
  }
  if (properties.align === "right" || properties.align === "rightVertical") {
    style.textAlign = "end";
  } else if (properties.align === "left") {
    style.textAlign = "start";
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

/** One optional Word guide property as a round-tripping `data-*` attribute. */
function rubyPropertyAttribute(
  attribute: string,
  property: keyof DocumentRubyProperties,
  normalize: (value: unknown) => string | number | null,
  parse: (raw: string) => unknown,
) {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(attribute);
      return raw === null ? null : normalize(parse(raw));
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = normalize(attrs[property]);
      return value === null ? {} : { [attribute]: String(value) };
    },
  };
}

/**
 * The inline ruby ATOM node. parse/render funnel both attrs through
 * {@link sanitizeRubyText} so a forged/imported value can never break out of the
 * DOM attribute surface or inject markup. The annotation is carried on a
 * `data-rt` attribute (round-tripped through getHTML) and the base is the node's
 * `<ruby>` text body. Mirrors CrossReference (inline atom) for registration
 * shape.
 */
const RubyAnnotation = Node.create({
  name: RUBY_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      base: {
        default: "" as string,
        parseHTML: (element: HTMLElement) => {
          // Prefer an explicit data-base (our own round-trip), else read the
          // `<ruby>` body text MINUS the `<rt>` (a pasted/native ruby element).
          const explicit = element.getAttribute("data-base");
          if (explicit !== null) {
            return sanitizeRubyText(explicit, MAX_RUBY_BASE_LENGTH);
          }
          const clone = element.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("rt, rp")
            .forEach((rt) => rt.parentNode?.removeChild(rt));
          return sanitizeRubyText(clone.textContent, MAX_RUBY_BASE_LENGTH);
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const base = sanitizeRubyText(attrs.base, MAX_RUBY_BASE_LENGTH);
          return base ? { "data-base": base } : {};
        },
      },
      rt: {
        default: "" as string,
        parseHTML: (element: HTMLElement) => {
          const explicit = element.getAttribute("data-rt");
          if (explicit !== null) {
            return sanitizeRubyText(explicit, MAX_RUBY_TEXT_LENGTH);
          }
          const rt = element.querySelector("rt");
          return sanitizeRubyText(rt?.textContent, MAX_RUBY_TEXT_LENGTH);
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const rt = sanitizeRubyText(attrs.rt, MAX_RUBY_TEXT_LENGTH);
          return rt ? { "data-rt": rt } : {};
        },
      },
      // Word's Phonetic Guide properties (w:rubyPr). null = not stated; the
      // exporter then writes the historical defaults (rubyProperties.ts).
      align: rubyPropertyAttribute(
        "data-ruby-align",
        "align",
        normalizeRubyAlign,
        (raw) => raw,
      ),
      fontSize: rubyPropertyAttribute(
        "data-ruby-font-size",
        "fontSize",
        normalizeRubyFontSize,
        Number,
      ),
      baseFontSize: rubyPropertyAttribute(
        "data-ruby-base-font-size",
        "baseFontSize",
        normalizeRubyFontSize,
        Number,
      ),
      offset: rubyPropertyAttribute(
        "data-ruby-offset",
        "offset",
        normalizeRubyOffset,
        Number,
      ),
      fontFamily: rubyPropertyAttribute(
        "data-ruby-font-family",
        "fontFamily",
        normalizeRubyFontFamily,
        (raw) => raw,
      ),
    };
  },

  // The text a phonetic guide contributes wherever the document is read as
  // plain text (a copy pasted into a text box, getText): its base, the
  // characters on the line. The guide is an annotation over them, not more
  
  // nothing, and a copied line lost the character).
  renderText({ node }) {
    return sanitizeRubyText(node.attrs?.base, MAX_RUBY_BASE_LENGTH);
  },

  parseHTML() {
    // A high priority so a real `<ruby>` element is captured as this node rather
    // than its inner text leaking out as a bare run when pasted/round-tripped.
    return [{ tag: "ruby", priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    const base = sanitizeRubyText(
      (HTMLAttributes as { "data-base"?: unknown })["data-base"],
      MAX_RUBY_BASE_LENGTH,
    );
    const rt = sanitizeRubyText(
      (HTMLAttributes as { "data-rt"?: unknown })["data-rt"],
      MAX_RUBY_TEXT_LENGTH,
    );
    // Static serialization (HTML export path): a native `<ruby>` element with the
    // base as its body and an `<rt>` above carrying the annotation, so non-app
    // viewers render the phonetic guide correctly. The data-* attributes round-
    // trip the canonical values back into the node on re-parse.
    return [
      "ruby",
      mergeAttributes(
        {},
        base ? { "data-base": base } : {},
        rt ? { "data-rt": rt } : {},
        Object.fromEntries(
          Object.entries(HTMLAttributes).filter(
            ([key]) =>
              key.startsWith("data-ruby-") ||
              // The base's own formatting (inlineAtomRunStyle.ts).
              key === "data-run-style",
          ),
        ),
        { "data-type": "ruby", class: "mrnote-ruby" },
      ),
      base,
      ["rt", { class: "mrnote-ruby__rt" }, rt],
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(RubyAnnotationView);
  },

  addCommands() {
    return {
      setRubyAnnotation:
        (annotation: string, base?: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const rubyType = state.schema.nodes[RUBY_NODE_NAME];
          if (!rubyType) return false;
          // The base is the explicitly-passed text, else the current selection's
          // text. A collapsed selection with no explicit base has nothing to sit
          // the guide over → no-op.
          const { from, to, empty } = state.selection;
          const rawBase =
            typeof base === "string" && base.length > 0
              ? base
              : empty
                ? ""
                : state.doc.textBetween(from, to, "", "");
          const baseText = sanitizeRubyText(rawBase, MAX_RUBY_BASE_LENGTH);
          if (!baseText) return false;
          if (dispatch) {
            const node = rubyType.create({
              base: baseText,
              rt: sanitizeRubyText(annotation, MAX_RUBY_TEXT_LENGTH),
            });
            tr.replaceSelectionWith(node, false);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export const DocumentRuby = RubyAnnotation;

export default DocumentRuby;
