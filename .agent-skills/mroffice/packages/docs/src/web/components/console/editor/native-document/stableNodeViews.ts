/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The editor's node and mark views keep their identity when the React
 * surface mounts, so the document is not built a second time.
 *
 * TipTap's EditorContent, once mounted, calls `editor.createNodeViews()`
 * so that React node views (a table of contents, a diagram) can render
 * through its portals. That hands ProseMirror freshly made constructor
 * functions for every node type, and ProseMirror, seeing new constructors,
 * throws the whole document's DOM away and builds it again. On a 7,390-block
 * book that was a second full build of about 0.8 s in a production build,
 * right after the first, and every page the ledger had measured was
 * measured again.
 *
 * Here ProseMirror is given one constructor per type that forwards to
 * TipTap's latest one, so its constructors never change. A React node view
 * built before the surface mounted had no portal to render through (TipTap
 * returned an empty view and the node was drawn from its schema; since
 * 3.30.3 it returns a blank `<span>` stand-in). Only the nodes of those
 * types are rebuilt when the surface mounts.
 */
import { Extension, type Editor } from "@tiptap/core";
import type { EditorView, MarkViewConstructor, NodeViewConstructor } from "@tiptap/pm/view";

type Constructors<T> = Record<string, T>;
type ViewDescLike = { dirty: number; node?: { type: { name: string } } };
type DirtyMarkingDocView = {
  markDirty?: (from: number, to: number) => void;
  descAt?: (pos: number) => ViewDescLike | undefined;
};
/** prosemirror-view's NODE_DIRTY: the node's view is built anew. */
const NODE_DIRTY = 3;

function trampolines<T extends (...args: never[]) => unknown>(
  read: () => Constructors<T>,
  onSpec?: (name: string, spec: unknown) => void,
): () => Constructors<T> {
  let latest = read();
  const stable: Constructors<T> = {};
  const add = (name: string) => {
    stable[name] = ((...args: Parameters<T>) => {
      const spec = latest[name]?.(...args);
      onSpec?.(name, spec);
      return spec;
    }) as unknown as T;
  };
  for (const name of Object.keys(latest)) add(name);
  return () => {
    latest = read();
    // A type that appeared since (an extension registered later) gets its
    // own forwarder; ProseMirror then rebuilds once, as before.
    for (const name of Object.keys(latest)) if (!(name in stable)) add(name);
    return stable;
  };
}

/** Rebuild the nodes of `types` in place (their views were made empty). */
function rebuildNodesOf(view: EditorView, types: ReadonlySet<string>): boolean {
  const docView = (view as unknown as { docView?: DirtyMarkingDocView }).docView;
  if (!docView || typeof docView.markDirty !== "function" || typeof docView.descAt !== "function") return false;
  let marked = false;
  view.state.doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return true;
    // Dirty up the chain (so the update reaches it), and the node's own
    // view built anew (a dirty leaf alone would only be updated).
    docView.markDirty!(pos, pos + node.nodeSize);
    const desc = docView.descAt!(pos);
    if (desc && desc.node?.type.name === node.type.name) desc.dirty = NODE_DIRTY;
    marked = true;
    return false;
  });
  if (marked) view.updateState(view.state);
  return true;
}

/**
 * The view TipTap's ReactNodeViewRenderer gives while the editor has no
 * surface (`contentComponent`) to render React through: an empty object up
 * to 3.30.2, then a plain object holding an empty `<span>` and no content
 * DOM. A real ReactNodeView is a class instance; either stand-in stays
 * blank until the node is built again.
 */
function isSurfacelessStandIn(editor: Editor, spec: unknown): boolean {
  if (!spec || typeof spec !== "object") return true;
  const view = spec as { dom?: unknown; contentDOM?: unknown };
  if (!view.dom) return true;
  if ((editor as unknown as { contentComponent?: unknown }).contentComponent) return false;
  if (Object.getPrototypeOf(spec) !== Object.prototype || view.contentDOM !== null) return false;
  const dom = view.dom as { nodeName?: unknown; childNodes?: { length: number }; attributes?: { length: number } };
  return dom.nodeName === "SPAN" && dom.childNodes?.length === 0 && dom.attributes?.length === 0;
}

export function installStableNodeViews(editor: Editor): void {
  const manager = editor.extensionManager as unknown as object;
  const proto = Object.getPrototypeOf(manager) as object;
  const nodeViewsGetter = Object.getOwnPropertyDescriptor(proto, "nodeViews")?.get;
  const markViewsGetter = Object.getOwnPropertyDescriptor(proto, "markViews")?.get;
  if (!nodeViewsGetter || !markViewsGetter) return;
  // Read once per node view and mark view, and worked out anew over every
  // extension at each read: half a second of a slow tablet's first opening. An
  // editor's extensions do not change.
  const attributesGetter = Object.getOwnPropertyDescriptor(proto, "attributes")?.get;
  if (attributesGetter) {
    let attributes: unknown;
    Object.defineProperty(manager, "attributes", {
      configurable: true,
      get: () => (attributes ??= attributesGetter.call(manager)),
    });
  }
  // Types whose view was a stand-in: a React node view asked for before the
  // surface could host it.
  const emptyViews = new Set<string>();
  const nodeViews = trampolines<NodeViewConstructor>(
    () => nodeViewsGetter.call(manager) as Constructors<NodeViewConstructor>,
    (name, spec) => {
      if (isSurfacelessStandIn(editor, spec)) emptyViews.add(name);
    },
  );
  const markViews = trampolines<MarkViewConstructor>(() => markViewsGetter.call(manager) as Constructors<MarkViewConstructor>);
  Object.defineProperty(manager, "nodeViews", { configurable: true, get: nodeViews });
  Object.defineProperty(manager, "markViews", { configurable: true, get: markViews });
  const createNodeViews = editor.createNodeViews.bind(editor);
  editor.createNodeViews = () => {
    createNodeViews();
    if (editor.isDestroyed || emptyViews.size === 0) return;
    const types = new Set(emptyViews);
    emptyViews.clear();
    // Without ProseMirror's dirty marking, give it new constructors: the
    // whole document is built again, as it always was.
    if (!rebuildNodesOf(editor.view, types)) {
      editor.view.setProps({ nodeViews: { ...nodeViewsGetter.call(manager) } });
    }
  };
}

/** Installs the stable node views before the editor draws anything. */
export const StableNodeViews = Extension.create({
  name: "stableNodeViews",
  onBeforeCreate() {
    installStableNodeViews(this.editor);
  },
});
