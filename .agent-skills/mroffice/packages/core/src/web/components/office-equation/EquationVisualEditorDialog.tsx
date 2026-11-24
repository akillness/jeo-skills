"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The visual equation editor in a dialog: the Docs MathLive controller
 * (`createVisualMathEditor`) mounted in a Radix dialog, shared by every editor
 * that edits an equation away from a ProseMirror NodeView -- the PDF formula
 * source editor and the Spreadsheet's (`PdfFormulaVisualEditorDialog`), and a
 * slide's equation run (PowerPoint's Insert > Equation, PPT-A052).
 *
 * The controller owns only an in-memory draft; the host decides what Done
 * writes. `modal: false` keeps the page behind it usable, so a host's
 * contextual Equation tab can drive the open draft through `onController`
 * (its controls carry `VISUAL_MATH_EDITOR_FOCUS_OWNER_ATTRIBUTE`, which the
 * controller treats as part of the draft, and a press anywhere else commits it
 * as a click outside an equation does in Office).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import {
  createVisualMathEditor,
  type VisualMathEditorController,
  type VisualMathEditorLabels,
  type VisualMathEditorState,
} from "../console/editor/extensions/visualMathEditor";
import {
  EQUATION_STRUCTURES,
  EQUATION_STRUCTURE_MEMBERS,
  EQUATION_SYMBOL_GROUPS,
  MATH_SYMBOLS,
  equationStructureMembersForFamily,
  type EquationLayoutMode,
} from "../console/editor/extensions/equationCatalog";
import { equationRibbonCopy } from "../console/editor/native-document/equationRibbonCopy";

/** The editor's words, from the `console-notebooks` equation keys. */
export function useEquationVisualEditorLabels(): VisualMathEditorLabels {
  const t = useTranslations("console-notebooks");
  return useMemo<VisualMathEditorLabels>(() => {
    const translate = t as (key: string) => string;
    const equationCopy = equationRibbonCopy(translate);
    return {
      label: translate("equation.editor.label"),
      inputFormat: equationCopy.inputFormat,
      unicodeMode: equationCopy.unicode,
      latexMode: translate("equation.editor.latexMode"),
      textMode: equationCopy.text,
      layout: equationCopy.layout,
      professionalMode: equationCopy.professional,
      linearMode: equationCopy.linear,
      structures: translate("equation.editor.structures"),
      symbols: translate("equation.editor.symbols"),
      done: translate("equation.editor.done"),
      cancel: translate("equation.editor.cancel"),
      loading: translate("equation.editor.loading"),
      loadFailed: translate("equation.editor.loadFailed"),
      hint: translate("equation.editor.hint"),
      sourceLabel: translate("equation.editor.sourceLabel"),
      conversionUnavailable: equationCopy.unsupportedUnicode,
      latexInvalid: equationCopy.invalidLatex,
      textUnavailable: equationCopy.unsupportedText,
      templateLabels: Object.fromEntries([
        ...EQUATION_STRUCTURES.map((entry) => [entry.id, equationCopy.structureLabels[entry.id]] as const),
        ...EQUATION_STRUCTURE_MEMBERS.map((member) => {
          const familyMembers = equationStructureMembersForFamily(member.familyId);
          const fallback = `${equationCopy.structureLabels[member.familyId]} ${familyMembers.indexOf(member) + 1}`;
          return [member.id, equationCopy.structureMemberLabels[member.id] ?? fallback] as const;
        }),
      ]),
      symbolLabels: Object.fromEntries(MATH_SYMBOLS.map((entry) => [entry.id, translate(entry.labelKey)])),
      inputAxisHint: translate("equation.ribbon.inputAxisHint"),
      layoutAxisHint: translate("equation.ribbon.layoutAxisHint"),
      symbolGroupLabels: Object.fromEntries(
        EQUATION_SYMBOL_GROUPS.map((group) => [group.id, translate(`equation.ribbon.symbolGroup.${group.id}`)]),
      ),
    };
  }, [t]);
}

export interface EquationVisualEditorDialogProps {
  latex: string;
  onAccept: (state: VisualMathEditorState) => void;
  onCancel: () => void;
  /** The dialog root's test id (each host keeps its own). */
  testId: string;
  /** Professional (built up) unless the host knows the draft is linear. */
  initialLayoutMode?: EquationLayoutMode;
  /**
   * Whether the dialog blocks the page behind it (default). A host with a
   * contextual Equation tab passes false so the tab stays usable.
   */
  modal?: boolean;
  /** The live controller while the draft is open, then null. */
  onController?: (controller: VisualMathEditorController | null) => void;
}

export function EquationVisualEditorDialog({
  latex,
  onAccept,
  onCancel,
  testId,
  initialLayoutMode = "professional",
  modal = true,
  onController,
}: EquationVisualEditorDialogProps) {
  // The dialog's children mount in a later commit than this component's own,
  // so a plain ref would still read null when the effect below first runs and
  // the editor would never be built. Track the node in state instead.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const acceptRef = useRef(onAccept);
  const cancelRef = useRef(onCancel);
  const controllerRef = useRef(onController);
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const labels = useEquationVisualEditorLabels();

  useEffect(() => {
    acceptRef.current = onAccept;
    cancelRef.current = onCancel;
    controllerRef.current = onController;
  }, [onAccept, onCancel, onController]);

  useEffect(() => {
    if (!portalTarget || !host) return;

    let active = true;
    const controller = createVisualMathEditor({
      initialLatex: latex,
      initialInputMode: "latex",
      initialLayoutMode,
      variant: "block",
      labels,
      onCommit: (state) => {
        if (active) acceptRef.current(state);
      },
      onCancel: () => {
        if (active) cancelRef.current();
      },
    });
    host.replaceChildren(controller.dom);
    controller.focus();
    controllerRef.current?.(controller);

    return () => {
      active = false;
      controllerRef.current?.(null);
      controller.destroy();
      host.replaceChildren();
    };
  }, [host, initialLayoutMode, labels, latex, portalTarget]);

  if (!portalTarget) return null;

  // Radix's dialog supplies the modal role, the focus containment, Escape and
  // the click-outside dismissal (CupertinoSheet and OfficeDialogShell build on
  // the same primitive). The editor keeps its own Done/Cancel chrome, so no
  // second header or footer is layered over it, and the card carries no skin
  // of its own (`skin="none"`): the editor's card is the only surface.
  return (
    <Dialog
      open
      modal={modal}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) cancelRef.current();
      }}
    >
      <DialogContent
        aria-modal={modal ? "true" : undefined}
        data-testid={testId}
        showCloseButton={false}
        skin="none"
        className="max-w-[min(760px,calc(100vw-24px))]"
        onOpenAutoFocus={(event) => {
          // `createVisualMathEditor` focuses its own math field on mount;
          // letting the dialog autofocus first would move the caret off it.
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          // Without a modal layer the page stays live: the controller itself
          // commits the draft on a press outside it (and keeps it open for a
          // control that belongs to the draft), so Radix must not ALSO close
          // the dialog as a cancel.
          if (!modal) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">{labels.label}</DialogTitle>
        <DialogDescription skin="none" className="sr-only">
          {labels.hint}
        </DialogDescription>
        <div
          ref={setHost}
          style={{
            maxHeight: "min(720px, calc(100dvh - 24px))",
            overflow: "auto",
            overscrollBehavior: "contain",
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
