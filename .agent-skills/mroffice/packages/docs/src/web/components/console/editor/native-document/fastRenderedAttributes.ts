/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * TipTap's `toDOM` for every node and mark, with the same HTML attributes
 * built in one pass.
 *
 * TipTap renders a node or a mark through `getRenderedAttributes`: it calls
 * each attribute's own `renderHTML`, then folds the results together with
 * `mergeAttributes`, which copies the whole object built so far for every
 * attribute. A paragraph or a text style with dozens of attributes paid that
 * square cost for each paragraph and each run drawn: about a fifth of the
 * task that builds a 7,390-block book's DOM at open, and the same again
 * every time the page ledger redraws a block it moved or split.
 *
 * The replacement keeps TipTap's semantics: the same attributes, the same
 * order, and the same merge rules. A key is set when it is not already
 * truthy. A class or style meeting an existing one is merged by TipTap's
 * own `mergeAttributes`. Any other key is overwritten. The extension's own
 * `renderHTML` is called with the context TipTap gives it.
 */
import {
  Extension,
  getAttributesFromExtensions,
  getExtensionField,
  mergeAttributes,
  splitExtensions,
  type AnyExtension,
  type ExtensionAttribute,
} from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";

type Rendered = Record<string, unknown>;

/** `getRenderedAttributes` for one type's rendered attributes, folded in place. */
export function renderedAttributesOf(
  target: { attrs: Record<string, unknown> },
  attributes: readonly ExtensionAttribute[],
): Rendered {
  const result: Rendered = {};
  for (const item of attributes) {
    const part: Rendered | null | undefined = item.attribute.renderHTML
      ? item.attribute.renderHTML(target.attrs) || {}
      : { [item.name]: target.attrs[item.name] };
    if (!part) continue;
    for (const key of Object.keys(part)) {
      const value = part[key];
      const existing = result[key];
      if (!existing) {
        result[key] = value;
      } else if (key === "class" || key === "style") {
        result[key] = mergeAttributes({ [key]: existing }, { [key]: value })[key];
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

type RenderHtml = (props: { node?: ProseMirrorNode; mark?: Mark; HTMLAttributes: Rendered }) => unknown;

/** Swap each node and mark type's `toDOM` for the one-pass equivalent. */
export function installFastRenderedAttributes(editor: { schema: { nodes: Record<string, { spec: { toDOM?: unknown } }>; marks: Record<string, { spec: { toDOM?: unknown } }> }; extensionManager: { extensions: AnyExtension[] } }): void {
  const extensions = editor.extensionManager.extensions;
  const all = getAttributesFromExtensions(extensions);
  const { nodeExtensions, markExtensions } = splitExtensions(extensions);
  const install = (extension: AnyExtension, kind: "node" | "mark") => {
    const type = kind === "node" ? editor.schema.nodes[extension.name] : editor.schema.marks[extension.name];
    if (!type || typeof type.spec.toDOM !== "function") return;
    const context = { name: extension.name, options: extension.options, storage: extension.storage, editor };
    const renderHTML = getExtensionField<RenderHtml>(extension, "renderHTML", context as never);
    if (!renderHTML) return;
    const rendered = all.filter((attribute) => attribute.type === extension.name && attribute.attribute.rendered);
    type.spec.toDOM = kind === "node"
      ? (node: ProseMirrorNode) => renderHTML({ node, HTMLAttributes: renderedAttributesOf(node, rendered) })
      : (mark: Mark) => renderHTML({ mark, HTMLAttributes: renderedAttributesOf(mark, rendered) });
  };
  for (const extension of nodeExtensions) install(extension, "node");
  for (const extension of markExtensions) install(extension, "mark");
}

/** Installs the one-pass `toDOM` before the editor draws anything. */
export const FastRenderedAttributes = Extension.create({
  name: "fastRenderedAttributes",
  onBeforeCreate() {
    installFastRenderedAttributes(this.editor as unknown as Parameters<typeof installFastRenderedAttributes>[0]);
  },
});
