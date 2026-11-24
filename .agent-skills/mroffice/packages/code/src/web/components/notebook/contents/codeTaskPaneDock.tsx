"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  OfficeDockedPane,
  OfficeTaskPaneDockHost,
} from "@mrnote/core/web/components/office-ribbon/OfficeTaskPaneDockHost.tsx";
import { useOfficeTaskPaneCover } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneOverlay.ts";
import {
  useOfficeTaskPaneDockRegistry,
  type OfficeTaskPaneDockRegistry,
} from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";

import styles from "./CodeTaskPaneDock.module.css";

/**
 * The code window's task pane dock: the code editor's adapter onto the shared
 * dock model (components/office-ribbon/officeTaskPaneDock.ts) and the shared
 * host and slot (components/office-ribbon/OfficeTaskPaneDockHost.tsx), as
 * Docs' components/console/editor/documentTaskPaneDock.tsx is. Only the code
 * pane table and class names live here.
 *
 * The code window's side panes (Outline, Problems, the workspace's Problems,
 * Find in Files, User snippets, the Test Explorer and Version History) dock at the window's RIGHT edge, beside the
 * editor, where Office docks its task panes (Microsoft Support, "Manage pane
 * layout in Office apps"). Several open panes share the one dock: each keeps
 * a tab, one shows at a time, and the pane opened last is in front. The
 * workspace explorer stays at the left edge, where the editor's navigation
 * lives.
 *
 * The panes mount only while open and live in two components (CodeWindow and
 * CodeMirrorEditor), so each registers through its slot (`CodeDockedPane`).
 * Without docks (a pane's own unit test, a notebook cell's editor) a pane
 * renders where it is.
 */

export type CodeTaskPaneEdge = "right";

export type CodeTaskPaneId =
  | "outline"
  | "problems"
  | "snippets"
  | "test-explorer"
  | "version-history"
  | "workspace-problems"
  | "find-in-files";

export const CODE_TASK_PANE_EDGE: Readonly<
  Record<CodeTaskPaneId, CodeTaskPaneEdge>
> = {
  outline: "right",
  problems: "right",
  snippets: "right",
  "test-explorer": "right",
  "version-history": "right",
  "workspace-problems": "right",
  "find-in-files": "right",
};

export interface CodeTaskPaneDocks {
  readonly right: OfficeTaskPaneDockRegistry;
}

const codeTaskPaneTabTestId = (id: string) => `code-task-pane-tab-${id}`;

export function useCodeTaskPaneDocks(): CodeTaskPaneDocks {
  const t = useTranslations("console-notebooks");
  // The strip's accessible name is the one the Docs and deck docks read.
  const tabsLabel = t("presentation.taskPanes.tabs");
  const options = useMemo(
    () => ({ tabTestId: codeTaskPaneTabTestId, tabsLabel }),
    [tabsLabel],
  );
  const right = useOfficeTaskPaneDockRegistry(options);
  return useMemo(() => ({ right }), [right]);
}

/** The element the docked panes render into: an anchor at the end of the
 * workspace row whose pane floats over the editor's right edge
 * (CodeTaskPaneDock.module.css). It publishes what the card covers of the
 * editor, which the cursor keeps clear of (CodeMirrorEditor). */
export function CodeTaskPaneDockHost({
  docks,
}: {
  readonly docks: CodeTaskPaneDocks;
}): React.JSX.Element {
  const root = docks.right.host?.parentElement ?? null;
  const viewport =
    root?.querySelector<HTMLElement>(':scope > [data-testid="code-editor-stack"]') ?? null;
  useOfficeTaskPaneCover({ root, viewport });
  return (
    <OfficeTaskPaneDockHost
      docks={docks}
      edge="right"
      className={styles.right}
      testId="code-task-pane-dock-right"
      overlay
    />
  );
}

/** One code pane in the dock of its edge. Without docks it renders where it
 * is. */
export function CodeDockedPane({
  docks,
  pane,
  children,
}: {
  readonly docks: CodeTaskPaneDocks | null | undefined;
  readonly pane: CodeTaskPaneId;
  readonly children: ReactNode;
}): React.JSX.Element | null {
  return (
    <OfficeDockedPane
      docks={docks ?? null}
      edges={CODE_TASK_PANE_EDGE}
      pane={pane}
    >
      {children}
    </OfficeDockedPane>
  );
}

/** A docked pane's own class: it fills the dock's column. */
export const codeTaskPaneClassName = styles.pane;
