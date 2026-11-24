"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { subscribeEditorSurfaceEditable } from "@mrnote/core/web/components/console/editor/useEditorSurfaceEditable.ts";
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  MoreVertical,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { apiPost } from "@mrnote/core/web/lib/api.ts";
import { useCurrentPageId } from "@mrnote/core/web/components/console/editor/PageIdContext.tsx";
import { updateCurrentNodeViewAttributes } from "./nodeViewWriteAuthority";

interface TaskAttrs {
  block_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
}

interface TaskBlockOptions {
  /**
   * Guest mode (public marketing demo). When `true` the optimistic local
   * checkbox flip is kept but the `POST /tasks/{id}/complete` authed call is
   * skipped, so an unauthenticated visitor never fires a 401 request. Defaults
   * to `false` → the authenticated console persists completion exactly as before.
   */
  guestMode: boolean;
}

interface TaskCompletionLogAttempt {
  readonly generation: number;
  readonly pageId: string;
  readonly blockId: string;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly controller: AbortController;
}

function TaskBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node } = props;
  const attrs = node.attrs as TaskAttrs;
  const [expanded, setExpanded] = useState(false);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [syncingActivity, setSyncingActivity] = useState(false);
  const [activityLogFailed, setActivityLogFailed] = useState(false);
  const completionLogGenerationRef = useRef(0);
  const activeCompletionLogRef = useRef<TaskCompletionLogAttempt | null>(null);
  const pageId = useCurrentPageId();
  const guestMode = Boolean(
    (props.extension.options as TaskBlockOptions).guestMode,
  );
  const commitTaskPatch = useCallback(
    (expectedNode: NodeViewProps["node"], patch: Record<string, unknown>) =>
      updateCurrentNodeViewAttributes(
        editor,
        getPos,
        expectedNode,
        "task",
        patch,
      ),
    [editor, getPos],
  );

  const currentTaskNode = useCallback((): NodeViewProps["node"] | null => {
    if (editor.isDestroyed || typeof getPos !== "function") return null;
    try {
      const pos = getPos();
      if (typeof pos !== "number") return null;
      const current = editor.state.doc.nodeAt(pos);
      return current?.type.name === "task" ? current : null;
    } catch {
      return null;
    }
  }, [editor, getPos]);

  const attemptIsCurrent = useCallback(
    (attempt: TaskCompletionLogAttempt): boolean => {
      const current = currentTaskNode();
      return Boolean(
        activeCompletionLogRef.current === attempt &&
        completionLogGenerationRef.current === attempt.generation &&
        !attempt.controller.signal.aborted &&
        pageId === attempt.pageId &&
        !editor.isDestroyed &&
        editor.isEditable &&
        current?.attrs.block_id === attempt.blockId,
      );
    },
    [currentTaskNode, editor, pageId],
  );

  const retireCompletionLog = useCallback(() => {
    completionLogGenerationRef.current += 1;
    activeCompletionLogRef.current?.controller.abort();
    activeCompletionLogRef.current = null;
    setSyncingActivity(false);
  }, []);

  useEffect(() => {
    const syncAuthority = () => {
      const nextEditable = !editor.isDestroyed && editor.isEditable;
      setEditable(nextEditable);
      const active = activeCompletionLogRef.current;
      if (!nextEditable || (active && !attemptIsCurrent(active))) {
        retireCompletionLog();
      }
    };
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncAuthority);
    syncAuthority();
    return () => {
      unsubscribe();
      retireCompletionLog();
    };
  }, [attemptIsCurrent, editor, retireCompletionLog]);

  const recordCompletionActivity = useCallback(
    async (blockId: string, completed: boolean, completedAt: string | null) => {
      if (guestMode || !pageId || !blockId) return;
      retireCompletionLog();
      const controller = new AbortController();
      const attempt: TaskCompletionLogAttempt = {
        generation: completionLogGenerationRef.current + 1,
        pageId,
        blockId,
        completed,
        completedAt,
        controller,
      };
      completionLogGenerationRef.current = attempt.generation;
      activeCompletionLogRef.current = attempt;
      setSyncingActivity(true);
      setActivityLogFailed(false);
      try {
        const receipt = await apiPost<{ ok?: unknown }>(
          `/api/v1/pages/${encodeURIComponent(pageId)}/tasks/${encodeURIComponent(blockId)}/complete`,
          { completed, completed_at: completedAt },
          { signal: controller.signal },
        );
        if (!attemptIsCurrent(attempt)) return;
        if (receipt?.ok !== true)
          throw new Error("task_activity_receipt_invalid");
        setActivityLogFailed(false);
      } catch {
        if (attemptIsCurrent(attempt)) setActivityLogFailed(true);
      } finally {
        if (activeCompletionLogRef.current === attempt) {
          activeCompletionLogRef.current = null;
          setSyncingActivity(false);
        }
      }
    },
    [attemptIsCurrent, guestMode, pageId, retireCompletionLog],
  );

  const handleToggle = useCallback(() => {
    if (!editable || syncingActivity) return;
    const nextCompleted = !attrs.completed;
    const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;
    const optimisticNode = commitTaskPatch(node, {
      completed: nextCompleted,
      completed_at: nextCompletedAt,
    });
    if (!optimisticNode) return;
    setActivityLogFailed(false);
    void recordCompletionActivity(
      String(optimisticNode.attrs.block_id ?? ""),
      nextCompleted,
      nextCompletedAt,
    );
  }, [
    attrs.completed,
    commitTaskPatch,
    editable,
    node,
    recordCompletionActivity,
    syncingActivity,
  ]);

  const retryCompletionActivity = useCallback(() => {
    if (!editable || syncingActivity) return;
    const current = currentTaskNode();
    if (!current) return;
    void recordCompletionActivity(
      String(current.attrs.block_id ?? ""),
      current.attrs.completed === true,
      typeof current.attrs.completed_at === "string"
        ? current.attrs.completed_at
        : null,
    );
  }, [currentTaskNode, editable, recordCompletionActivity, syncingActivity]);

  return (
    <NodeViewWrapper className="task-block" data-testid="task-block">
      <div className="task-block__row">
        <input
          type="checkbox"
          checked={attrs.completed}
          disabled={!editable || syncingActivity}
          onChange={handleToggle}
          data-testid="task-block-checkbox"
        />
        <input
          type="text"
          className="task-block__title"
          value={attrs.title}
          disabled={!editable}
          placeholder={t("block.task.titlePlaceholder")}
          onChange={(e) => commitTaskPatch(node, { title: e.target.value })}
        />
        {attrs.due_date && (
          <span className="task-block__due">
            <CalendarDays size={12} /> {attrs.due_date}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="task-block__menu"
          title={t("block.task.detailsTitle")}
          aria-label={t("block.task.detailsTitle")}
          aria-expanded={expanded}
        >
          <MoreVertical size={14} />
        </button>
      </div>
      {expanded && (
        <div className="task-block__expanded">
          <textarea
            placeholder={t("block.task.descriptionPlaceholder")}
            value={attrs.description ?? ""}
            disabled={!editable}
            onChange={(e) =>
              commitTaskPatch(node, { description: e.target.value || null })
            }
          />
          <input
            type="date"
            value={attrs.due_date ?? ""}
            disabled={!editable}
            onChange={(e) =>
              commitTaskPatch(node, { due_date: e.target.value || null })
            }
          />
        </div>
      )}
      {activityLogFailed ? (
        <p className="task-block__error" role="alert">
          <span>{t("block.task.activityLogFailed")}</span>
          <button
            type="button"
            data-testid="task-block-retry-activity"
            disabled={!editable || syncingActivity}
            onClick={retryCompletionActivity}
          >
            {t("block.task.retryActivity")}
          </button>
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}

const TaskBlock = Node.create<TaskBlockOptions>({
  name: "task",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      guestMode: false,
    };
  },

  addAttributes() {
    return {
      block_id: { default: "" },
      title: { default: "" },
      description: { default: null as string | null },
      due_date: { default: null as string | null },
      completed: { default: false },
      completed_at: { default: null as string | null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="task"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "task" })];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(TaskBlockView);
  },
});

export default TaskBlock;
