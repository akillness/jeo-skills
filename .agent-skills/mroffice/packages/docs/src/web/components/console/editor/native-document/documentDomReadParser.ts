/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { DOMParser, type ParseOptions, type Schema, type TagParseRule } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";








































class EditorDomReadParser extends DOMParser {
  constructor(schema: Schema) {
    super(schema, DOMParser.fromSchema(schema).rules.filter((rule) => !("style" in rule)));
  }

  override parse(dom: globalThis.Node, options: ParseOptions = {}) {
    return super.parse(dom, domReadOptions(this.schema, options));
  }
}

/** ProseMirror's view passes the rule of each node view it re-reads (an
 * option its typings keep internal). */
type DomReadParseOptions = ParseOptions & {
  ruleFromNode?: (node: globalThis.Node) => Omit<TagParseRule, "tag"> | null;
};

/** The ProseMirror node a DOM element's view desc stands for (the view
 * keeps the desc on the element, untyped). */
function viewNodeOf(element: globalThis.Node | null): { isBlock: boolean; isTextblock: boolean } | null {
  const desc = (element as { pmViewDesc?: { node?: { isBlock: boolean; isTextblock: boolean } | null } } | null)?.pmViewDesc;
  return desc?.node ?? null;
}

/** An element the editor did not render, standing beside the blocks of a
 * block container (the document, a page sheet, a list item): sheet chrome,
 * never content. The browser inserts its own elements inside text blocks
 * (a span, a break), which still parse -- in a decorated text run too, whose
 * wrapper is the view of a text node: Chrome typing at a link's end moves the
 * link down around the run's text, inside that wrapper, and read as chrome
 * the run's text went, each key taking the letter before it (corpus R334-D08). */
function isForeignBlockLevelElement(node: globalThis.Node): boolean {
  if (node.nodeType !== 1 || viewNodeOf(node)) return false;
  const parent = viewNodeOf(node.parentNode);
  return parent !== null && parent.isBlock && !parent.isTextblock;
}

/** The DOM-read options of {@link EditorDomReadParser}. */
export function domReadOptions(schema: Schema, options: DomReadParseOptions): DomReadParseOptions {
  const { ruleFromNode } = options;
  return {
    ...options,
    ...(options.preserveWhitespace === true && options.topNode?.isTextblock
      ? { preserveWhitespace: "full" as const } : {}),
    // A re-read spanning several blocks parses each block by the rule its
    // view gives: text blocks read their content the same way.
    ...(ruleFromNode ? {
      ruleFromNode(node: globalThis.Node) {
        const rule = ruleFromNode(node);
        if (!rule) return isForeignBlockLevelElement(node) ? { ignore: true } : rule;
        const type = "node" in rule && rule.node ? schema.nodes[rule.node] : undefined;
        return type?.isTextblock && rule.preserveWhitespace === undefined
          ? { ...rule, preserveWhitespace: "full" as const } : rule;
      },
    } : {}),
  };
}

/** @deprecated The former name of {@link domReadOptions}. */
export const preserveTextBlockLineFeeds = domReadOptions;

export const documentDomReadParserKey = new PluginKey("documentDomReadParser");

export const DocumentDomReadParser = Extension.create({
  name: "documentDomReadParser",
  addProseMirrorPlugins() {
    const schema = this.editor.schema;
    const domParser = new EditorDomReadParser(schema);
    const clipboardParser = DOMParser.fromSchema(schema);
    return [new Plugin({ key: documentDomReadParserKey, props: { domParser, clipboardParser } })];
  },
});
