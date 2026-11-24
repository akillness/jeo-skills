/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ReactNodeViewRenderer } from "@tiptap/react";
import type {
  ReactNodeViewProps,
  ReactNodeViewRendererOptions,
} from "@tiptap/react";
import type { NodeViewRenderer } from "@tiptap/core";
import { useCallback, useRef, type ComponentType } from "react";

/**
 * A React node view caches the document position it was mounted at, and its own
 * selection listener compares the live selection against that cache one
 * animation frame after every selection change. ProseMirror reuses a node view
 * *without* calling `update()` whenever the node object itself did not change
 * (`ViewTreeUpdater.findNodeMatch`), so any edit that only moves a block — a
 * Copilot apply on another block, a repagination, plain typing above it —
 * leaves the cache pointing at the old position.
 *
 * The listener then decides the block is not selected and calls
 * `deselectNode()`, tearing off the `ProseMirror-selectednode` class and the
 * `selected` prop that ProseMirror had set one tick earlier. The block keeps
 * rendering but loses its selection frame, resize handles and object chrome,
 * and clicking it again cannot bring them back: ProseMirror already records
 * that node view as the selected one, so it never re-runs `selectNode()`.
 *
 * `trackNodeViewPosition` is the option that keeps the cached position in step
 * with position-only moves. It also republishes `getPos` as a fresh function on
 * every update, which would silently re-run every node view effect that depends
 * on it (aborting in-flight work), so the component is wrapped to keep one
 * stable `getPos` identity. Every `getPos` TipTap hands over delegates to the
 * same live node view, so holding one is equivalent, not stale.
 */
const stableViews = new WeakMap<
  ComponentType<ReactNodeViewProps<never>>,
  ComponentType<ReactNodeViewProps<never>>
>();

function withStableGetPos<T>(
  component: ComponentType<ReactNodeViewProps<T>>,
): ComponentType<ReactNodeViewProps<T>> {
  const key = component as unknown as ComponentType<ReactNodeViewProps<never>>;
  const cached = stableViews.get(key);
  if (cached) return cached as unknown as ComponentType<ReactNodeViewProps<T>>;
  const Component = component;
  function StableNodeViewPosition(props: ReactNodeViewProps<T>) {
    const live = useRef(props.getPos);
    live.current = props.getPos;
    const getPos = useCallback(() => live.current(), []);
    return <Component {...props} getPos={getPos} />;
  }
  StableNodeViewPosition.displayName = `StableNodeViewPosition(${
    Component.displayName || Component.name || "NodeView"
  })`;
  stableViews.set(
    key,
    StableNodeViewPosition as unknown as ComponentType<
      ReactNodeViewProps<never>
    >,
  );
  return StableNodeViewPosition;
}

export function reactNodeViewWithLivePosition<T = HTMLElement>(
  component: ComponentType<ReactNodeViewProps<T>>,
  options?: Partial<ReactNodeViewRendererOptions>,
): NodeViewRenderer {
  return ReactNodeViewRenderer<T>(withStableGetPos(component), {
    trackNodeViewPosition: true,
    ...options,
  });
}
