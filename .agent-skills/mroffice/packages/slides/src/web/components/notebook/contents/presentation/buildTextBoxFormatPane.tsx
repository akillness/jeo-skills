/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Format Shape pane of a selected text box.
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import type { OfficeGroupCameraControl } from "@mrnote/core/web/lib/office-group-camera.ts";
import type { PresentationTextBlock, PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { ReactNode, Dispatch, SetStateAction } from "react";
import { OfficeShapeFormatPane, type OfficeShapeFormatPaneField, type OfficeShapeFormatPaneTab } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { canEditBlockContent } from "@mrnote/core/web/lib/presentation-text-case.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { PresentationTaskPaneDock } from "../../../../lib/presentation/presentationTaskPaneDock";
import type { PresentationTextFrameBlock } from "../../../../lib/presentation-text-frame-options";
import {
  presentationShapeEffectsPaneSections,
  type PresentationShapeEffectsPanePatch,
} from "./presentationShapeEffectsPane";

/** The window bindings this reads, passed through unchanged. */
export interface BuildTextBoxFormatPaneCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  formatPaneOpen: boolean;
  setFormatPaneOpen: Dispatch<SetStateAction<boolean>>;
  formatPaneRequestedTab: { readonly id: string; readonly serial: number; readonly section?: string } | null;
  taskPaneDock: PresentationTaskPaneDock;
  taskPaneTabsLabel: string;
  formatPaneInFront: boolean;
  renderInspectorGeometry: (block: PresentationBlock) => ReactNode;
  writeShapeAltText: (blockId: string, text: string, decorative: boolean) => boolean;
  textOptionsTabFor: (block: PresentationTextFrameBlock) => OfficeShapeFormatPaneTab;
  formatPaneLinkFields: (record: Record<string, unknown>, block: { id: string; }) => OfficeShapeFormatPaneField[];
  renderTextBoxFillLine: (inspectorBlock: PresentationBlock) => ReactNode;
  renderTextBoxTextTools: (inspectorBlock: PresentationBlock) => ReactNode;
  deleteBlock: (blockId: string) => void;
  /** The deck's six accents (Effects presets draw in them). */
  themeAccentColors: string[];
  /** Format Shape > Effects on the box: the shape's own fields, one undo step. */
  updateTextBoxEffects: (blockId: string, patch: PresentationShapeEffectsPanePatch) => boolean;
  /** The camera of the group the box is in (Format Shape > 3-D Rotation edits the group's). */
  groupCameraFor?: (block: PresentationTextBlock) => OfficeGroupCameraControl | undefined;
}

export function buildTextBoxFormatPane(ctl: BuildTextBoxFormatPaneCtl) {
  const {
    t,
    formatPaneOpen,
    setFormatPaneOpen,
    formatPaneRequestedTab,
    taskPaneDock,
    taskPaneTabsLabel,
    formatPaneInFront,
    renderInspectorGeometry,
    writeShapeAltText,
    textOptionsTabFor,
    formatPaneLinkFields,
    renderTextBoxFillLine,
    renderTextBoxTextTools,
    deleteBlock,
    themeAccentColors,
    updateTextBoxEffects,
    groupCameraFor,
  } = ctl;
  const renderTextBoxFormatPane = (block: PresentationTextBlock): ReactNode => {
    const record = block as Record<string, unknown>;
    const textOptions = textOptionsTabFor(block);
    // Format Shape > Effects: a text box is a shape, and PowerPoint gives it
    // the shape's whole Effects page (Shadow, Reflection, Glow, Soft Edges,
    // 3-D Format, 3-D Rotation with Keep text flat), the same builder.
    const officeEffects = presentationShapeEffectsPaneSections({
      block,
      themeAccentColors,
      t,
      disabled: !canEditBlockContent(block),
      update: (patchOf) => {
        const patch = patchOf(block);
        return patch ? updateTextBoxEffects(block.id, patch) : false;
      },
      holdsWords: true,
      groupCamera: groupCameraFor?.(block),
    });
    return (
      <OfficeShapeFormatPane
        testIdPrefix="presentation-textbox"
        rootTestId="presentation-block-inspector"
        // A text box opens at its words, as Format Text Effects... does.
        initialTab="text"
        requestedTab={formatPaneRequestedTab ?? undefined}
        titleId="presentation-block-inspector-title"
        className={`presentation-window__inspector ${presentationChrome.taskPane}`}
        dockRight={false}
        hidden={!formatPaneInFront}
        style={{ display: formatPaneInFront ? "flex" : "none", padding: 0, gap: 0 }}
        dataAttributes={{ "data-open": formatPaneOpen ? "true" : "false" }}
        dockTabs={taskPaneDock.tabs("format")}
        dockTabsLabel={taskPaneTabsLabel}
        headerActions={
          <button
            type="button"
            onClick={() => deleteBlock(block.id)}
            data-testid="presentation-delete-block"
            aria-label={t("presentation.deleteBlock")}
            title={t("presentation.deleteBlock")}
            className={presentationChrome.taskPaneClose}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        }
        labels={{
          title: t("presentation.ui.shapeFormatPane.title"),
          close: t("common.close"),
          apply: t("presentation.ui.shapeFormatPane.apply"),
          cancel: t("common.cancel"),
        }}
        writable={canEditBlockContent(block)}
        onClose={() => setFormatPaneOpen(false)}
        tabs={[
          {
            id: "shape",
            label: t("presentation.ui.shapeFormatPane.shapeOptions"),
            sections: [
              {
                id: "fill-line",
                title: t("presentation.ui.shapeFormatPane.fillLine"),
                fields: [{ kind: "custom", id: "fill-line", render: renderTextBoxFillLine(block) }],
              },
            ],
          },
          {
            id: "office-effects",
            label: t("presentation.ui.shapeFormatPane.effects"),
            sections: officeEffects,
          },
          {
            id: "size",
            label: t("presentation.ui.shapeFormatPane.sizeProperties"),
            sections: [
              {
                id: "geometry",
                title: t("presentation.smartartContext.sizeGroup"),
                fields: [{ kind: "custom", id: "geometry", render: renderInspectorGeometry(block) }],
              },
              {
                id: "alt-text",
                title: t("presentation.shapeAltText"),
                fields: [
                  {
                    kind: "textarea",
                    id: "alt",
                    label: t("presentation.ui.shapeFormatPane.description"),
                    value: typeof record.alt === "string" ? record.alt : "",
                    rows: 4,
                    maxLength: 1_000,
                    disabled: record.decorative === true,
                    disabledReason:
                      record.decorative === true
                        ? t("presentation.ui.shapeFormatPane.decorativeNoDescription")
                        : undefined,
                    onCommit: (text) => writeShapeAltText(block.id, text, false),
                  },
                  {
                    kind: "checkbox",
                    id: "decorative",
                    label: t("presentation.ui.shapeFormatPane.markDecorative"),
                    checked: record.decorative === true,
                    onChange: (checked) =>
                      writeShapeAltText(
                        block.id,
                        checked ? "" : typeof record.alt === "string" ? record.alt : "",
                        checked,
                      ),
                  },
                ],
              },
              { id: "link", title: t("presentation.link"), fields: formatPaneLinkFields(record, block) },
            ],
          },
          {
            ...textOptions,
            sections: [
              ...textOptions.sections,
              {
                id: "text-tools",
                fields: [{ kind: "custom", id: "text-tools", render: renderTextBoxTextTools(block) }],
              },
            ],
          },
        ]}
      />
    );
  };
  return renderTextBoxFormatPane;
}
