"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type RefObject,
} from "react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { normalizeFloatAnchor } from "@mrnote/core/web/lib/office-float-anchor.ts";
import { moveSelectionInDrawingStack, type DrawingStackEntry } from "@mrnote/sheets/web/lib/spreadsheet/drawing-stack.ts";
import { NodeSelection } from "@tiptap/pm/state";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BarChart3,
  Boxes,
  FileText,
  Image as ImageIcon,
  LayoutPanelTop,
  ChevronDown,
  ChevronUp,
  Shapes,
  Workflow,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";

import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import {
  collectDocumentGoToTargets,
  goToDocumentTarget,
  type DocumentGoToTarget,
} from "./native-document/documentGoTo";
import {
  documentShapeIsGroup,
  normalizeDocumentShapeName,
  documentShapeUngroupAttrs,
  documentShapeZOrderPatches,
  documentShapeZOrderPatchesForSelection,
  resolveDocumentShapeStack,
  type DocumentShapeGroupMember,
  type DocumentShapeStackResolution,
  type DocumentShapeZOrderAction,
  documentStackPatchAttrs,
} from "@mrnote/core/web/lib/document-shapes.ts";
import {
  documentGroupMembersInUnitOrder,
  documentGroupMembersReorderable,
  documentGroupUnits,
  type DocumentGroupUnit,
} from "@mrnote/core/web/lib/document-shape-group-tree.ts";
import {
  DOCUMENT_SHAPE_SELECT_MEMBER_EVENT,
  deleteDocumentShapeGroupMember,
  type DocumentShapeSelectMemberDetail,
  documentShapeMultiSelection,
  documentShapeMultiSelectionKey,
  groupDocumentShapes,
  documentObjectsGroupable,
  documentShapePickable,
  ungroupDocumentShape,
} from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";
import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  OfficeSelectionPaneList,
  OfficeSelectionPaneRow,
  type OfficeSelectionPaneMove,
} from "@mrnote/core/web/components/office-ribbon/OfficeSelectionPaneList.tsx";
import {
  planSelectionPaneReorder,
  type OfficeStackCommand,
} from "@mrnote/core/web/components/office-ribbon/officeSelectionPaneReorder.ts";
import {
  canHideInSelectionPane,
  isSelectionPaneHidden,
  setObjectsHidden,
} from "./native-document/documentObjectVisibility";
import dockStyles from "@mrnote/core/web/components/console/editor/native-document/DocumentShapeFormatPane.module.css";
import styles from "./DocumentSelectionPane.module.css";

interface DocumentSelectionPaneProps {
  editor: Editor;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  /** Tells the ribbon whether Group has two or more groupable shapes to act
   * on (the pane's Ctrl+click selection), so Shape Format > Group can be
   * enabled only then, as in Word. */
  onGroupAvailabilityChange?: (
    action: { readonly run: () => void } | null,
  ) => void;
}

type RuntimeEditor = Editor & {
  on?: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
};

interface SelectionPaneSnapshot {
  doc: ProseMirrorNode;
  targets: DocumentGoToTarget[];
  selectedId: string | null;
  shapeStackComplete: boolean;
  /** The floating stack's members (any kind), by document position. */
  stackPositions: ReadonlySet<number>;
  /** The members behind the text (`behindDoc`): a layer of their own. */
  behindPositions: ReadonlySet<number>;
}

/**
 * Whether a member of the floating stack lies behind the text (Word's
 * "Behind Text", `wp:anchor/@behindDoc`): its anchor says so, or a shape's
 * wrap or a picture floated here says "behind text".
 */
export function documentStackMemberBehindText(
  node: { readonly attrs: Readonly<Record<string, unknown>> } | null | undefined,
): boolean {
  if (!node) return false;
  if (normalizeFloatAnchor(node.attrs.floatAnchor)?.behindDoc === true) return true;
  return node.attrs.wrapMode === "behindText" || node.attrs.dataFloat === "behindText";
}

function objectType(target: DocumentGoToTarget): string {
  return target.id.split(":", 3)[1] || "object";
}

function selectedObjectId(
  editor: Editor,
  targets: readonly DocumentGoToTarget[],
): string | null {
  const selection = editor.state.selection;
  if (!(selection instanceof NodeSelection)) return null;
  return (
    targets.find(
      (target) =>
        target.selection === "node" && target.from === selection.from,
    )?.id ?? null
  );
}










export function orderSelectionPaneTargets(
  targets: readonly DocumentGoToTarget[],
  stack: Pick<ReturnType<typeof resolveDocumentShapeStack>, "complete" | "backToFront">,
  


  behindText: (pos: number) => boolean = () => false,
): DocumentGoToTarget[] {
  if (!stack.complete) return [...targets];
  const stacked = new Set(stack.backToFront.map((entry) => entry.pos));
  const stackTargets = new Map(
    targets
      .filter((target) => target.selection === "node" && stacked.has(target.from))
      .map((target) => [target.from, target]),
  );
  const frontToBack = [...stack.backToFront].reverse();
  const orderedMembers = [
    ...frontToBack.filter((entry) => !behindText(entry.pos)),
    ...frontToBack.filter((entry) => behindText(entry.pos)),
  ]
    .map((entry) => stackTargets.get(entry.pos))
    .filter((target): target is DocumentGoToTarget => Boolean(target));
  const listed = new Set(orderedMembers);
  return [...orderedMembers, ...targets.filter((target) => !listed.has(target))];
}

function readSnapshot(editor: Editor): SelectionPaneSnapshot {
  const doc = editor.state.doc;
  const targets = collectDocumentGoToTargets(doc).filter(
    (target) => target.kind === "object",
  );
  const stack = resolveDocumentShapeStack(doc);
  const behindPositions = new Set(
    stack.backToFront
      .filter((entry) => documentStackMemberBehindText(doc.nodeAt(entry.pos)))
      .map((entry) => entry.pos),
  );
  const orderedTargets = orderSelectionPaneTargets(targets, stack, (pos) => behindPositions.has(pos));
  return {
    doc,
    targets: orderedTargets,
    selectedId: selectedObjectId(editor, orderedTargets),
    shapeStackComplete: stack.complete,
    stackPositions: new Set(stack.backToFront.map((entry) => entry.pos)),
    behindPositions,
  };
}

/** The pane's drag container of a group's objects: that group in the file ("" the group itself). */
function groupMemberContainer(groupId: string, path: string): string {
  return path ? `group:${groupId}#${path}` : `group:${groupId}`;
}

function typeIcon(type: string) {
  switch (type) {
    case "documentShape":
    case "inlineDocumentShape":
      return <Shapes size={17} aria-hidden />;
    case "image":
      return <ImageIcon size={17} aria-hidden />;
    case "chart":
    case "codeChart":
      return <BarChart3 size={17} aria-hidden />;
    case "smartArt":
    case "mermaid":
      return <Workflow size={17} aria-hidden />;
    case "whiteboard":
      return <LayoutPanelTop size={17} aria-hidden />;
    case "file":
      return <FileText size={17} aria-hidden />;
    default:
      return <Boxes size={17} aria-hidden />;
  }
}

/**
 * MRNote's session-only Docs Selection Pane extension.
 *
 * Word documents expose many inline objects whose visibility/z-order cannot be
 * truthfully changed by our current model. This pane therefore owns only the
 * closed contract: enumerate live object atoms, select one by stable document
 * identity, reorder a complete native-shape floating stack, and group multiple
 * fully-authored shapes. Authenticated imported WPG groups may move as one,
 * while ungroup remains limited to groups authored by this editor so native
 * member custody is never flattened implicitly.
 */
export default function DocumentSelectionPane({
  editor,
  onClose,
  returnFocusRef,
  onGroupAvailabilityChange,
}: DocumentSelectionPaneProps) {
  const t = useTranslations("console-notebooks");
  const [snapshot, setSnapshot] = useState<SelectionPaneSnapshot>(() =>
    readSnapshot(editor),
  );
  const [rovingId, setRovingId] = useState<string | null>(
    () => snapshot.selectedId ?? snapshot.targets[0]?.id ?? null,
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(snapshot.selectedId ? [snapshot.selectedId] : []),
  );
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // Word's Selection Pane rename: double-click (or F2) a name to type a new one.
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  // Groups the author closed or opened (Right / Left arrow, the arrow, or
  // Alt+Shift+1 / Alt+Shift+9); a group lists its objects until closed.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const placedInitialFocusRef = useRef(false);
  const targetIds = useMemo(
    () => new Set(snapshot.targets.map((target) => target.id)),
    [snapshot.targets],
  );
  const effectiveRovingId =
    rovingId && targetIds.has(rovingId)
      ? rovingId
      : (snapshot.selectedId ?? snapshot.targets[0]?.id ?? null);
  const effectiveSelectedIds = useMemo(() => {
    const retained = new Set(
      [...selectedIds].filter((id) => targetIds.has(id)),
    );
    if (snapshot.selectedId && !retained.has(snapshot.selectedId)) {
      return new Set([snapshot.selectedId]);
    }
    return retained;
  }, [selectedIds, snapshot.selectedId, targetIds]);

  const close = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => {
      const trigger = returnFocusRef.current;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
        return;
      }
      // Picking an object here can hand the ribbon to that object's
      // contextual tab (a chart row activates Chart Design), and an inactive
      // tab no longer constructs its controls, so the trigger that opened the
      // pane may be gone. Return focus to the document holding the selected
      // object instead of dropping it on <body>.
      try {
        if (!editor.isDestroyed) editor.view.focus();
      } catch {
        // The editor view can disappear between the lifecycle check and focus.
      }
    });
  }, [editor, onClose, returnFocusRef]);

  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refresh = () => setSnapshot(readSnapshot(editor));
    refresh();
    runtime.on?.("update", refresh);
    runtime.on?.("selectionUpdate", refresh);
    return () => {
      runtime.off?.("update", refresh);
      runtime.off?.("selectionUpdate", refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (placedInitialFocusRef.current) return;
    const focusId = snapshot.selectedId ?? snapshot.targets[0]?.id;
    if (!focusId) return;
    placedInitialFocusRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setRovingId(focusId);
      rowRefs.current.get(focusId)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [snapshot.selectedId, snapshot.targets]);

  const typeLabels = useMemo(
    () => ({
      documentShape: t("toolbar.shape"),
      inlineDocumentShape: t("toolbar.shape"),
      image: t("editor.image"),
      chart: t("toolbar.chart"),
      codeChart: t("toolbar.chart"),
      smartArt: t("toolbar.smartArt"),
      mermaid: t("toolbar.object"),
      whiteboard: t("editor.whiteboard_label"),
      file: t("toolbar.file"),
    }),
    [t],
  );
  // The rows the stack orders (front first): the reorder buttons' reach. An
  // In Line with Text shape is listed but has no layer (Word greys it).
  const shapeOrder = useMemo(() => {
    const ids = snapshot.targets
      .filter((target) => target.selection === "node" && snapshot.stackPositions.has(target.from))
      .map((target) => target.id);
    return {
      count: ids.length,
      indexById: new Map(ids.map((id, index) => [id, index])),
    };
  }, [snapshot.targets, snapshot.stackPositions]);

  const labelFor = useCallback(
    (target: DocumentGoToTarget) => {
      const type = objectType(target);
      const typeLabel =
        typeLabels[type as keyof typeof typeLabels] ?? t("toolbar.object");
      const raw = target.label?.trim();
      return raw && raw !== type ? raw : `${typeLabel} ${target.ordinal}`;
    },
    [t, typeLabels],
  );

  const activate = useCallback(
    (target: DocumentGoToTarget, additive = false) => {
      const canAdd = additive && objectType(target) === "documentShape";
      let next: Set<string>;
      if (!canAdd) {
        next = new Set([target.id]);
      } else {
        next = new Set(effectiveSelectedIds);
        if (next.has(target.id) && next.size > 1) next.delete(target.id);
        else next.add(target.id);
      }
      setSelectedIds(next);
      // Ctrl-clicking a selected object takes it OUT of the selection: the
      // document then selects one that stays (the last one added), never
      // the one just removed -- which the pane would read back as "only B".
      const selectedTarget = next.has(target.id)
        ? target
        : (snapshot.targets.find(
            (candidate) => candidate.id === [...next].at(-1),
          ) ?? target);
      if (!goToDocumentTarget(editor, selectedTarget, snapshot.doc)) return;
      // The rows picked here are the document's selection too, as Shift +
      // click on the page makes it: Align, the ribbon's count and a drag act
      // on all of them, not only on the last one picked (WUA 188).
      const state = editor.state;
      const positions = snapshot.targets
        .filter(
          (candidate) =>
            next.has(candidate.id) &&
            // A floating chart is picked with the shapes: Group takes it.
            documentShapePickable(snapshot.doc.nodeAt(candidate.from)),
        )
        .map((candidate) => candidate.from);
      if (
        canAdd &&
        positions.length > 1 &&
        state.doc === snapshot.doc &&
        state.selection instanceof NodeSelection &&
        positions.includes(state.selection.from)
      ) {
        editor.view.dispatch(state.tr.setMeta(documentShapeMultiSelectionKey, { positions }));
      } else if (documentShapeMultiSelection(state).length > 0) {
        editor.view.dispatch(state.tr.setMeta(documentShapeMultiSelectionKey, { positions: [] }));
      }
      setRovingId(target.id);
      window.requestAnimationFrame(() => {
        rowRefs.current.get(target.id)?.focus({ preventScroll: true });
      });
    },
    [editor, effectiveSelectedIds, snapshot.doc, snapshot.targets],
  );

  // One object of a group, picked from its row (Word selects that object
  // inside its group): the group is the document's selection and its node
  // view marks the object (DOCUMENT_SHAPE_SELECT_MEMBER_EVENT).
  const [picked, setPicked] = useState<{ groupId: string; memberId: string } | null>(null);
  const pickedMember = picked && snapshot.selectedId === picked.groupId ? picked : null;
  const pickMember = useCallback(
    (target: DocumentGoToTarget, memberId: string) => {
      activate(target);
      if (editor.isDestroyed || editor.state.doc !== snapshot.doc) return;
      setPicked({ groupId: target.id, memberId });
      window.dispatchEvent(
        new CustomEvent<DocumentShapeSelectMemberDetail>(DOCUMENT_SHAPE_SELECT_MEMBER_EVENT, {
          detail: { position: target.from, memberId },
        }),
      );
    },
    [activate, editor, snapshot.doc],
  );

  const selectedShapeTargets = useMemo(
    () =>
      snapshot.targets.filter(
        (target) =>
          effectiveSelectedIds.has(target.id) &&
          (objectType(target) === "documentShape" ||
            documentShapePickable(snapshot.doc.nodeAt(target.from))),
      ),
    [effectiveSelectedIds, snapshot.doc, snapshot.targets],
  );
  const selectedShapeNodes = useMemo(
    () =>
      selectedShapeTargets.map((target) => ({
        target,
        node: snapshot.doc.nodeAt(target.from),
      })),
    [selectedShapeTargets, snapshot.doc],
  );
  // The same test Group itself applies (documentShapeGroupAttrs): a button
  // that lit for two shapes the group then refused did nothing at all.
  const canGroup =
    editor.isEditable &&
    snapshot.shapeStackComplete &&
    selectedShapeNodes.length >= 2 &&
    selectedShapeNodes.every(
      ({ node }) =>
        node?.type.name === "chart" ||
        (node?.type.name === "documentShape" &&
          !documentShapeIsGroup(node.attrs as Record<string, unknown>) &&
          node.attrs.source === null),
    ) &&
    // Shapes, and the floating charts picked with them (documentShapeGroupAttrs).
    documentObjectsGroupable(
      snapshot.doc,
      selectedShapeNodes.map(({ target }) => target.from),
    );
  const canUngroup =
    editor.isEditable &&
    selectedShapeNodes.length === 1 &&
    selectedShapeNodes[0]?.node?.type.name === "documentShape" &&
    documentShapeUngroupAttrs(
      selectedShapeNodes[0].node.attrs as Record<string, unknown>,
    ) !== null;

  const refreshAfterStructureChange = useCallback(() => {
    const next = readSnapshot(editor);
    setSnapshot(next);
    setSelectedIds(new Set(next.selectedId ? [next.selectedId] : []));
    setRovingId(next.selectedId ?? next.targets[0]?.id ?? null);
  }, [editor]);

  const groupSelectedShapes = useCallback(() => {
    if (!canGroup) return;
    const position = groupDocumentShapes(
      editor,
      snapshot.doc,
      selectedShapeTargets.map((target) => target.from),
    );
    if (position === null) {
      toast({ title: t("toolbar.onlyShapesDrawnInEditorCan") });
      return;
    }
    refreshAfterStructureChange();
  }, [
    canGroup,
    editor,
    refreshAfterStructureChange,
    selectedShapeTargets,
    snapshot.doc,
  ]);

  useEffect(() => {
    if (!onGroupAvailabilityChange) return;
    onGroupAvailabilityChange(canGroup ? { run: groupSelectedShapes } : null);
  }, [canGroup, groupSelectedShapes, onGroupAvailabilityChange]);
  useEffect(
    () => () => onGroupAvailabilityChange?.(null),
    [onGroupAvailabilityChange],
  );

  const ungroupSelectedShape = useCallback(() => {
    const target = selectedShapeTargets[0];
    if (
      !target ||
      !canUngroup ||
      !ungroupDocumentShape(editor, snapshot.doc, target.from)
    ) {
      return;
    }
    refreshAfterStructureChange();
  }, [
    canUngroup,
    editor,
    refreshAfterStructureChange,
    selectedShapeTargets,
    snapshot.doc,
  ]);

  const reorderShape = useCallback(
    (target: DocumentGoToTarget, action: DocumentShapeZOrderAction) => {
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        editor.state.doc !== snapshot.doc ||
        !snapshot.shapeStackComplete
      ) {
        return;
      }
      const patches = documentShapeZOrderPatches(
        resolveDocumentShapeStack(editor.state.doc),
        target.from,
        action,
      );
      if (!patches?.length) return;
      let transaction = editor.state.tr;
      for (const patch of patches) {
        const node = transaction.doc.nodeAt(patch.pos);
        const attrs = node ? documentStackPatchAttrs(node, patch.relativeHeight) : null;
        if (!node || !attrs) return;
        transaction = transaction.setNodeMarkup(patch.pos, undefined, attrs, node.marks);
      }
      transaction = closeHistory(transaction).setSelection(
        NodeSelection.create(transaction.doc, target.from),
      );
      if (!transaction.docChanged) return;
      editor.view.dispatch(transaction);
      editor.view.focus();
      setRovingId(target.id);
      window.requestAnimationFrame(() => {
        rowRefs.current.get(target.id)?.focus({ preventScroll: true });
      });
    },
    [editor, snapshot.doc, snapshot.shapeStackComplete],
  );

  /**
   * The pane's drag and Ctrl+Shift+F / Ctrl+Shift+B (Microsoft Support,
   * "Manage objects with the Selection pane"). Containers:
   * - "front" / "behind": the floating objects in front of the text and
   *   behind it, each a layer of its own (Word paints every behind-text
   *   object under the text, whatever its height). A drop is reached by the
   *   ONE stack's own Bring to Front / Bring Forward / Send Backward / Send
   *   to Back (`documentShapeZOrderPatchesForSelection`, Word's heights), run
   *   until the layer reads the dropped order, and written in one
   *   transaction: one Undo step, one save, one update for a second window.
   *   An inline object has no layer and never moves (Word greys it).
   * - `group:<id>`: the objects of a group drawn here, which move only among
   *   the group's own objects (their order is the group's `groupMembers`).
   */
  const moveDocumentPaneUnits = useCallback(
    (move: OfficeSelectionPaneMove) => {
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        editor.state.doc !== snapshot.doc
      ) {
        return;
      }
      const doc = snapshot.doc;
      if (move.container.startsWith("group:")) {
        const scope = move.container.slice("group:".length);
        const cut = scope.indexOf("#");
        const groupId = cut < 0 ? scope : scope.slice(0, cut);
        const path = cut < 0 ? "" : scope.slice(cut + 1);
        const group = snapshot.targets.find((target) => target.id === groupId);
        const node = group ? doc.nodeAt(group.from) : null;
        const members = (node?.attrs.groupMembers ?? []) as readonly DocumentShapeGroupMember[];
        if (!group || !node || !documentGroupMembersReorderable(node)) return;
        // The objects of that group, bottom first as the group paints them:
        // its own members, and each nested group whole.
        const units = documentGroupUnits(members, path);
        if (!units) return;
        const entries: DrawingStackEntry[] = units.map((unit) => ({ kind: "object", id: unit.key }));
        const moving = entries.filter((entry) => move.keys.includes(entry.id));
        if (moving.length === 0) return;
        // One step passes one neighbouring object, a selection keeping its
        // own order: the moves the sheet's stack takes (Excel's ShapeRange).
        const single = (order: readonly DrawingStackEntry[], command: OfficeStackCommand) =>
          moveSelectionInDrawingStack(order, moving, command);
        const reordered =
          move.kind === "step"
            ? single(entries, move.direction)
            : planSelectionPaneReorder({
                model: entries,
                order: (order) => [...order].reverse().map((entry) => entry.id),
                moving: move.keys,
                slot: move.slot,
                step: single,
              });
        if (!reordered) return;
        // Back into the run that group's objects held, a nested group named
        // by its new place.
        const groupMembers = documentGroupMembersInUnitOrder(
          members,
          path,
          reordered.map((entry) => entry.id),
        );
        if (!groupMembers) return;
        const transaction = closeHistory(
          editor.state.tr.setNodeMarkup(group.from, undefined, { ...node.attrs, groupMembers }, node.marks),
        );
        editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, group.from)));
        return;
      }
      if (!snapshot.shapeStackComplete) return;
      const behind = move.container === "behind";
      const positionOf = new Map(snapshot.targets.map((target) => [target.id, target.from]));
      const idOf = new Map(snapshot.targets.map((target) => [target.from, target.id]));
      const positions = move.keys.flatMap((key) => {
        const pos = positionOf.get(key);
        return pos !== undefined && snapshot.stackPositions.has(pos) && snapshot.behindPositions.has(pos) === behind
          ? [pos]
          : [];
      });
      if (positions.length !== move.keys.length || positions.length === 0) return;
      const actionOf: Record<OfficeStackCommand, DocumentShapeZOrderAction> = {
        front: "bringToFront",
        forward: "bringForward",
        backward: "sendBackward",
        back: "sendToBack",
      };
      const step = (stack: DocumentShapeStackResolution, command: OfficeStackCommand) => {
        const patches = documentShapeZOrderPatchesForSelection(stack, positions, actionOf[command]);
        if (!patches?.length) return null;
        const heights = new Map(patches.map((patch) => [patch.pos, patch.relativeHeight]));
        return {
          complete: true,
          backToFront: stack.backToFront
            .map((entry) => ({ pos: entry.pos, relativeHeight: heights.get(entry.pos) ?? entry.relativeHeight }))
            .sort((left, right) => left.relativeHeight - right.relativeHeight || left.pos - right.pos),
        } satisfies DocumentShapeStackResolution;
      };
      const layer = (stack: DocumentShapeStackResolution) =>
        [...stack.backToFront]
          .reverse()
          .filter((entry) => snapshot.behindPositions.has(entry.pos) === behind)
          .map((entry) => idOf.get(entry.pos) ?? `pos:${entry.pos}`);
      const start = resolveDocumentShapeStack(doc);
      let finalStack: DocumentShapeStackResolution | null;
      if (move.kind === "step" && positions.length > 1) {
        finalStack = step(start, move.direction);
      } else {
        // One object's Ctrl+Shift+F / B moves it one row of its layer (a step
        // of the whole stack could pass only objects of the other layer and
        // show nothing).
        const order = layer(start);
        const rest = order.filter((key) => !move.keys.includes(key));
        const firstAt = order.findIndex((key) => move.keys.includes(key));
        const restBefore = order.slice(0, firstAt).filter((key) => !move.keys.includes(key)).length;
        const slot =
          move.kind === "drop"
            ? move.slot
            : Math.max(0, Math.min(rest.length, restBefore + (move.direction === "forward" ? -1 : 1)));
        finalStack = planSelectionPaneReorder({
          model: start as DocumentShapeStackResolution,
          order: layer,
          moving: move.keys,
          slot,
          step,
        });
      }
      if (!finalStack) return;
      const before = new Map(start.backToFront.map((entry) => [entry.pos, entry.relativeHeight]));
      let transaction = editor.state.tr;
      for (const entry of finalStack.backToFront) {
        if (before.get(entry.pos) === entry.relativeHeight) continue;
        const node = transaction.doc.nodeAt(entry.pos);
        const attrs = node ? documentStackPatchAttrs(node, entry.relativeHeight) : null;
        if (!node || !attrs) return;
        transaction = transaction.setNodeMarkup(entry.pos, undefined, attrs, node.marks);
      }
      if (!transaction.docChanged) return;
      const lead = positions[0];
      transaction = closeHistory(transaction);
      if (lead !== undefined && positions.length === 1) {
        transaction = transaction.setSelection(NodeSelection.create(transaction.doc, lead));
      }
      editor.view.dispatch(transaction);
    },
    [editor, snapshot],
  );

  /**
   * Word's Selection Pane eye and rename, written on the drawing's `wp:docPr`
   * (`name`, `hidden`): one history step each, the object stays selected.
   */
  const patchShapeDocPr = useCallback(
    (targets: readonly DocumentGoToTarget[], patch: { name?: string; hidden?: boolean }) => {
      if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== snapshot.doc) return;
      let transaction = editor.state.tr;
      for (const target of targets) {
        const node = transaction.doc.nodeAt(target.from);
        if (!node || node.type.name !== "documentShape") continue;
        const next = { ...node.attrs };
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.hidden !== undefined) next.hidden = patch.hidden ? true : undefined;
        transaction = transaction.setNodeMarkup(target.from, undefined, next, node.marks);
      }
      if (!transaction.docChanged) return;
      editor.view.dispatch(closeHistory(transaction));
    },
    [editor, snapshot.doc],
  );
  // The eye: a shape's is its `wp:docPr/@hidden` (`hidden`, written by
  // both DOCX writers); a picture's or text box's is the document-local
  // `selectionPaneHidden` flag (documentObjectVisibility.ts), which no
  // package writer carries.
  const canHideTarget = useCallback(
    (target: DocumentGoToTarget) => {
      const node = snapshot.doc.nodeAt(target.from);
      return node?.type.name === "documentShape" || canHideInSelectionPane(node);
    },
    [snapshot.doc],
  );
  const shapeHidden = useCallback(
    (target: DocumentGoToTarget) => {
      const node = snapshot.doc.nodeAt(target.from);
      return node?.type.name === "documentShape"
        ? node.attrs.hidden === true
        : isSelectionPaneHidden(node);
    },
    [snapshot.doc],
  );
  const hideableTargets = useMemo(
    () => snapshot.targets.filter(canHideTarget),
    [canHideTarget, snapshot.targets],
  );
  /** Show / Hide every target in one transaction (one history step). */
  const setVisibility = useCallback(
    (targets: readonly DocumentGoToTarget[], hidden: boolean) => {
      if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== snapshot.doc) return;
      const transaction = editor.state.tr;
      const others: number[] = [];
      for (const target of targets) {
        const node = transaction.doc.nodeAt(target.from);
        if (!node) continue;
        if (node.type.name !== "documentShape") {
          others.push(target.from);
          continue;
        }
        if ((node.attrs.hidden === true) === hidden) continue;
        transaction.setNodeMarkup(
          target.from,
          undefined,
          { ...node.attrs, hidden: hidden ? true : undefined },
          node.marks,
        );
      }
      setObjectsHidden(transaction, others, hidden);
      if (!transaction.docChanged) return;
      editor.view.dispatch(closeHistory(transaction));
    },
    [editor, snapshot.doc],
  );
  // Word's Bring Forward / Send Backward at the top of the pane act on the
  // one selected object.
  const singleSelectedShape =
    effectiveSelectedIds.size === 1
      ? snapshot.targets.find(
          (target) =>
            effectiveSelectedIds.has(target.id) &&
            shapeOrder.indexById.has(target.id),
        )
      : undefined;
  const singleShapeIndex = singleSelectedShape
    ? (shapeOrder.indexById.get(singleSelectedShape.id) ?? -1)
    : -1;
  const canReorderSelected =
    editor.isEditable &&
    snapshot.shapeStackComplete &&
    shapeOrder.count > 1 &&
    singleShapeIndex >= 0;
  const commitRename = useCallback(() => {
    if (!renaming) return;
    const target = snapshot.targets.find((candidate) => candidate.id === renaming.id);
    const name = normalizeDocumentShapeName(renaming.draft);
    setRenaming(null);
    if (target && name) patchShapeDocPr([target], { name });
    window.requestAnimationFrame(() => rowRefs.current.get(renaming.id)?.focus({ preventScroll: true }));
  }, [patchShapeDocPr, renaming, snapshot.targets]);

  const handleRowKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      target: DocumentGoToTarget,
    ) => {
      // Up / Down / Home / End walk the rows in the shared list, which
      // reaches a group's objects too.
      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          activate(target, event.metaKey || event.ctrlKey);
          return;
        case "F2":
          if (objectType(target) === "documentShape" && editor.isEditable) {
            event.preventDefault();
            setRenaming({ id: target.id, draft: labelFor(target) });
          }
          return;
      }
    },
    [activate, editor.isEditable, labelFor],
  );

  // The groups listed as nodes: a group of shapes (a SmartArt graphic is one
  // object, as Word lists it).
  const groupIds = snapshot.targets
    .filter((target) => {
      const node = snapshot.doc.nodeAt(target.from);
      return (
        node?.type.name === "documentShape" &&
        ((node.attrs.groupMembers as readonly unknown[] | undefined)?.length ?? 0) > 1 &&
        typeof node.attrs.smartArtKind !== "string"
      );
    })
    .map((target) => target.id);
  const layerSizes = {
    front: [...snapshot.stackPositions].filter((pos) => !snapshot.behindPositions.has(pos)).length,
    behind: snapshot.behindPositions.size,
  };

  // Word's Selection Pane (Home > Select > Selection Pane) is a docked task
  // pane: the shared Office task pane, in the Docs dock Format Shape uses.
  return (
    <OfficeTaskPane
      title={t("toolbar.selectionPane")}
      closeLabel={`${t("outline.close")} · ${t("toolbar.selectionPane")}`}
      onClose={close}
      testIdPrefix="document-selection"
      testId="document-selection-pane"
      closeTestId="document-selection-pane-close"
      dataAttributes={{ "data-product-scope": "mrai-extension" }}
      dockRight={false}
      className={dockStyles.pane}
      headerActions={
        <span className={styles.count}>{snapshot.targets.length}</span>
      }
    >
      <div
        className={styles.actionRail}
        role="toolbar"
        aria-label={t("toolbar.objectGroup")}
      >
        <button
          type="button"
          className={styles.actionButton}
          disabled={!canGroup}
          onClick={groupSelectedShapes}
          data-testid="document-selection-pane-group"
        >
          <DocumentDialogIcon icon="object.group" />
          {t("toolbar.objectGroup")}
        </button>
        <button
          type="button"
          className={styles.actionButton}
          disabled={!canUngroup}
          onClick={ungroupSelectedShape}
          data-testid="document-selection-pane-ungroup"
        >
          <DocumentDialogIcon icon="object.ungroup" />
          {t("presentation.group.ungroup")}
        </button>
        {/* Word's Selection Pane: Show All / Hide All, over every listed
            object that has an eye (shapes, pictures, text boxes). */}
        {hideableTargets.length > 0 ? (<>
        <button
          type="button"
          className={styles.actionButton}
          disabled={!editor.isEditable || !hideableTargets.some(shapeHidden)}
          onClick={() => setVisibility(hideableTargets, false)}
          data-testid="document-selection-pane-show-all"
        >
          <DocumentDialogIcon icon="view.show" />
          {t("presentation.selectionPane.showAll")}
        </button>
        <button
          type="button"
          className={styles.actionButton}
          disabled={!editor.isEditable || hideableTargets.every(shapeHidden)}
          onClick={() => setVisibility(hideableTargets, true)}
          data-testid="document-selection-pane-hide-all"
        >
          <DocumentDialogIcon icon="view.hide" />
          {t("presentation.selectionPane.hideAll")}
        </button>
        </>) : null}
        <button
          type="button"
          className={styles.actionButton}
          disabled={!canReorderSelected || singleShapeIndex === 0}
          onClick={() =>
            singleSelectedShape &&
            reorderShape(singleSelectedShape, "bringForward")
          }
          title={t("presentation.contextMenu.bringForward")}
          data-testid="document-selection-pane-move-up"
        >
          <ChevronUp size={13} aria-hidden />{" "}
          {t("presentation.contextMenu.bringForward")}
        </button>
        <button
          type="button"
          className={styles.actionButton}
          disabled={
            !canReorderSelected || singleShapeIndex === shapeOrder.count - 1
          }
          onClick={() =>
            singleSelectedShape &&
            reorderShape(singleSelectedShape, "sendBackward")
          }
          title={t("presentation.contextMenu.sendBackward")}
          data-testid="document-selection-pane-move-down"
        >
          <ChevronDown size={13} aria-hidden />{" "}
          {t("presentation.contextMenu.sendBackward")}
        </button>
      </div>
      {!snapshot.shapeStackComplete ? (
        <div className={styles.extensionNote} role="note">
          <span className={styles.extensionBadge}>
            {t("toolbar.mraiExtension")}
          </span>
          <span>{t("toolbar.selectionPaneUnavailable")}</span>
        </div>
      ) : null}
      <OfficeSelectionPaneList
        isEmpty={snapshot.targets.length === 0}
        emptyLabel={t("goTo.empty")}
        emptyTestId="document-selection-pane-empty"
        listLabel={t("goTo.kind.object")}
        reorder={{
          onMove: moveDocumentPaneUnits,
          hint: t("presentation.selectionPane.reorderHelp"),
          onExpandAll: groupIds.length
            ? (expanded) => setExpandedGroups(new Map(groupIds.map((id) => [id, expanded])))
            : undefined,
        }}
      >
        {snapshot.targets.flatMap((target) => {
          const selected = effectiveSelectedIds.has(target.id);
          const type = objectType(target);
          const isShape = type === "documentShape";
          const shapeIndex = shapeOrder.indexById.get(target.id) ?? -1;
          const shapeCount = shapeOrder.count;
          const hideable = canHideTarget(target);
          const hidden = hideable && shapeHidden(target);
          const label = labelFor(target);
          const visibilityLabel = hidden
            ? t("presentation.selectionPane.showObject")
            : t("presentation.selectionPane.hideObject");
          const stacked = shapeIndex >= 0 && snapshot.shapeStackComplete;
          const behind = snapshot.behindPositions.has(target.from);
          const layerSize = behind ? layerSizes.behind : layerSizes.front;
          const groupNode = groupIds.includes(target.id) ? snapshot.doc.nodeAt(target.from) : null;
          const groupExpanded = groupNode ? (expandedGroups.get(target.id) ?? true) : false;
          const showReorder =
            shapeIndex >= 0 &&
            effectiveSelectedIds.size <= 1 &&
            snapshot.shapeStackComplete &&
            shapeCount > 1;
          const row = (
            <OfficeSelectionPaneRow
              key={target.id}
              level={groupIds.length ? 0 : undefined}
              // Each layer drags among itself (front of / behind the text);
              // an inline object is listed and never moves, as in Word.
              drag={{
                key: target.id,
                container: stacked ? (behind ? "behind" : "front") : "inline",
                movable: stacked && editor.isEditable && layerSize > 1,
              }}
              expansion={
                groupNode
                  ? {
                      expanded: groupExpanded,
                      label: groupExpanded
                        ? t("presentation.selectionPane.collapseGroup")
                        : t("presentation.selectionPane.expandGroup"),
                      testId: "document-selection-pane-expand",
                      onToggle: () =>
                        setExpandedGroups((current) => new Map(current).set(target.id, !groupExpanded)),
                    }
                  : null
              }
              rowRef={(element) => {
                if (element) rowRefs.current.set(target.id, element);
                else rowRefs.current.delete(target.id);
              }}
              icon={typeIcon(type)}
              label={label}
              ordinal={target.ordinal}
              selected={selected}
              current={target.id === snapshot.selectedId}
              hidden={hidden}
              reorderable={
                editor.isEditable &&
                shapeIndex >= 0 &&
                snapshot.shapeStackComplete &&
                shapeCount > 1
              }
              tabIndex={target.id === effectiveRovingId ? 0 : -1}
              testId="document-selection-pane-row"
              rowData={{ "data-object-type": type }}
              onFocus={() => setRovingId(target.id)}
              onClick={(event) => {
                activate(target, event.metaKey || event.ctrlKey);
                // a finger's double tap renames, as a double-click does
                
                if (
                  isShape &&
                  editor.isEditable &&
                  isDoubleTap(event.nativeEvent, target.id)
                ) {
                  setRenaming({ id: target.id, draft: label });
                }
              }}
              onKeyDown={(event) => handleRowKeyDown(event, target)}
              onLabelDoubleClick={(event) => {
                if (!isShape || !editor.isEditable) return;
                event.preventDefault();
                setRenaming({ id: target.id, draft: label });
              }}
              rename={
                renaming?.id === target.id
                  ? {
                      draft: renaming.draft,
                      inputLabel: t("presentation.selectionPane.objectName"),
                      testId: "document-selection-pane-rename-input",
                      onChange: (draft) =>
                        setRenaming({ id: target.id, draft }),
                      onCommit: commitRename,
                      onCancel: () => setRenaming(null),
                    }
                  : null
              }
              visibility={
                hideable
                  ? {
                      hidden,
                      disabled: !editor.isEditable,
                      title: visibilityLabel,
                      ariaLabel: `${visibilityLabel} · ${label}`,
                      testId: "document-selection-pane-visibility",
                      onToggle: () => setVisibility([target], !hidden),
                    }
                  : null
              }
              reorder={
                showReorder
                  ? {
                      label: t("toolbar.objectLayer"),
                      actions: (
                        [
                          ["bringToFront", ArrowUpToLine, shapeIndex === 0],
                          ["bringForward", ChevronUp, shapeIndex === 0],
                          [
                            "sendBackward",
                            ChevronDown,
                            shapeIndex === shapeCount - 1,
                          ],
                          [
                            "sendToBack",
                            ArrowDownToLine,
                            shapeIndex === shapeCount - 1,
                          ],
                        ] as const
                      ).map(([action, Icon, disabled]) => ({
                        key: action,
                        label: t(`presentation.contextMenu.${action}`),
                        icon: <Icon size={13} aria-hidden />,
                        disabled: !editor.isEditable || disabled,
                        testId: `document-selection-pane-${action}`,
                        onClick: () => reorderShape(target, action),
                      })),
                    }
                  : null
              }
            />
          );
          if (!groupNode || !groupExpanded) return [row];
          // The group's objects, front first, under it, a nested group as a
          // row of its own over its objects. They are picked with the group;
          // each moves among its own group's objects, a nested group whole.
          const members = [...((groupNode.attrs.groupMembers ?? []) as readonly DocumentShapeGroupMember[])];
          const membersMovable = editor.isEditable && documentGroupMembersReorderable(groupNode);
          const memberIndex = new Map(members.map((member, index) => [member.memberId, index]));
          const rowsOf = (path: string, level: number): ReactElement[] => {
            const units = membersMovable ? documentGroupUnits(members, path) : null;
            // Not read as a tree: the objects listed flat, as they paint.
            const listed: DocumentGroupUnit[] =
              units ?? (path === "" ? members.map((member) => ({ key: member.memberId, path: null, members: [member] })) : []);
            const container = groupMemberContainer(target.id, path);
            const movable = membersMovable && listed.length > 1;
            return [...listed].reverse().flatMap((unit, frontIndex): ReactElement[] => {
              if (unit.path !== null) {
                const groupLabel = `${t("presentation.group.group")} ${listed.length - frontIndex}`;
                return [
                  <OfficeSelectionPaneRow
                    key={`${target.id}/${unit.key}`}
                    level={level}
                    drag={{ key: unit.key, container, movable }}
                    icon={<Boxes size={17} aria-hidden />}
                    label={groupLabel}
                    selected={false}
                    tabIndex={-1}
                    testId="document-selection-pane-nested-group"
                    rowData={{ "data-group-path": unit.path }}
                    onClick={() => activate(target)}
                  />,
                  ...rowsOf(unit.path, level + 1),
                ];
              }
              const member = unit.members[0];
              if (!member) return [];
              const kindLabel =
                member.kind === "picture"
                  ? t("editor.image")
                  : member.kind === "chart"
                    ? t("toolbar.chart")
                    : t("toolbar.shape");
              const memberLabel = member.text?.trim() || `${kindLabel} ${(memberIndex.get(member.memberId) ?? 0) + 1}`;
              return [
                <OfficeSelectionPaneRow
                  key={`${target.id}/${member.memberId}`}
                  level={level}
                  drag={{ key: member.memberId, container, movable }}
                  icon={member.kind === "picture" ? <ImageIcon size={17} aria-hidden /> : <Shapes size={17} aria-hidden />}
                  label={memberLabel}
                  selected={pickedMember?.groupId === target.id && pickedMember.memberId === member.memberId}
                  tabIndex={-1}
                  testId="document-selection-pane-member"
                  rowData={{ "data-member-id": member.memberId, "data-object-type": member.kind ?? "shape" }}
                  onClick={() => pickMember(target, member.memberId)}
                  onKeyDown={(event) => {
                    // Delete on an object's row deletes that object, never
                    // its group (Word deletes the item picked in its group).
                    if (
                      (event.key === "Delete" || event.key === "Backspace") &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.altKey &&
                      editor.isEditable &&
                      editor.state.doc === snapshot.doc
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteDocumentShapeGroupMember(editor.view, target.from, member.memberId);
                    }
                  }}
                />,
              ];
            });
          };
          const memberRows = rowsOf("", 1);
          return [row, ...memberRows];
        })}
      </OfficeSelectionPaneList>
    </OfficeTaskPane>
  );
}
