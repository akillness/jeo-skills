"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeSplitLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import OfficeBordersMenuBody, {
  OFFICE_BORDER_LINE_STYLE_IDS,
  officeBorderLineSpecForStyle,
  officeBorderLineStyleForSpec,
  officeBordersMenuStyles,
  type OfficeBorderLineStyleId,
} from "@mrnote/core/web/components/office-ribbon/OfficeBordersMenu.tsx";
import { RibbonDropdownMenuSubContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  DOCUMENT_PARAGRAPH_BORDER_PRESETS,
  type DocumentBorderPen,
  type DocumentParagraphBorderPreset,
} from "@mrnote/core/web/lib/document-borders.ts";
import { useChangedState } from "@mrnote/core/web/hooks/useChangedState.ts";
import { DocsHomeIcon } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import homeStyles from "@mrnote/core/web/components/console/editor/DocumentHomeRibbon.module.css";
import { OfficeBorderPresetIcon } from "@mrnote/core/web/components/office-ribbon/OfficeBorderPresetIcon.tsx";
import {
  commitDocumentBorderPreset,
  commitDocumentParagraphBorderSteps,
  documentBorderPenForTarget,
  documentBorderPresetMatchesPen,
  documentBorderPresetState,
  restyleDocumentBorders,
  readDocumentBorderTarget,
  type BorderTargetKind,
  type DocumentBorderTarget,
} from "./documentBorders";
import { DocumentBorderPresetIcon } from "./DocumentTableBordersMenu";

interface DocumentBordersMenuProps {
  readonly editor: Editor;
  readonly disabled?: boolean;
  readonly onPointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
}

const PARAGRAPH_PRESETS = [
  "bottom",
  "top",
  "left",
  "right",
  "none",
  "all",
  "outside",
  "insideH",
] as const satisfies readonly DocumentParagraphBorderPreset[];

/** Word's list groups: single edges, whole boxes, the inside rule. */
function presetGroup(preset: DocumentParagraphBorderPreset): string {
  if (preset === "bottom" || preset === "top" || preset === "left" || preset === "right") {
    return "edges";
  }
  return preset === "insideH" ? "inside" : "boxes";
}

/**
 * The weighted and doubled outer edges of the Borders list (Excel's set),
 * each drawn in the pen's colour as one change.
 */
const PARAGRAPH_COMPOUND_BORDERS = [
  "thickBox",
  "bottomDouble",
  "thickBottom",
  "topAndBottom",
  "topAndThickBottom",
  "topAndDoubleBottom",
] as const;
type ParagraphCompoundBorder = (typeof PARAGRAPH_COMPOUND_BORDERS)[number];

const COMPOUND_LABEL_KEYS: Record<ParagraphCompoundBorder, string> = {
  thickBox: "spreadsheet.bordersThickBox",
  bottomDouble: "spreadsheet.bordersBottomDouble",
  thickBottom: "spreadsheet.bordersThickBottom",
  topAndBottom: "spreadsheet.bordersTopAndBottom",
  topAndThickBottom: "spreadsheet.bordersTopAndThickBottom",
  topAndDoubleBottom: "spreadsheet.bordersTopAndDoubleBottom",
};

/** Text above and below a full-width rule: Word's Horizontal Line glyph. */
function HorizontalLineIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
      <g stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" fill="none">
        <path d="M6 4.5h11M6 7h8M6 13h11M6 15.5h8" />
        <path d="M2.5 3.5l1.6 4.2 1.6-4.2M2.5 12l1.6 4.2 1.6-4.2" strokeWidth={1} />
      </g>
      <path d="M1.5 10.25h17" stroke="#2563eb" strokeWidth={1.6} />
    </svg>
  );
}

function compoundBorderSteps(
  compound: ParagraphCompoundBorder,
  pen: DocumentBorderPen,
): { preset: DocumentParagraphBorderPreset; pen: DocumentBorderPen }[] {
  const thick = { ...pen, ...officeBorderLineSpecForStyle("thick") };
  const double = { ...pen, ...officeBorderLineSpecForStyle("double") };
  switch (compound) {
    case "thickBox":
      return [{ preset: "outside", pen: thick }];
    case "bottomDouble":
      return [{ preset: "bottom", pen: double }];
    case "thickBottom":
      return [{ preset: "bottom", pen: thick }];
    case "topAndBottom":
      return [{ preset: "top", pen }, { preset: "bottom", pen }];
    case "topAndThickBottom":
      return [{ preset: "top", pen }, { preset: "bottom", pen: thick }];
    case "topAndDoubleBottom":
      return [{ preset: "top", pen }, { preset: "bottom", pen: double }];
  }
}

const TEXT_BOX_PRESETS = [
  "outside",
  "none",
] as const satisfies readonly DocumentParagraphBorderPreset[];

type RuntimeEditor = Editor & {
  on?: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
};

function presetLabel(
  t: ReturnType<typeof useTranslations>,
  preset: DocumentParagraphBorderPreset,
): string {
  switch (preset) {
    case "bottom":
      return t("toolbar.tableBordersBottom");
    case "top":
      return t("toolbar.tableBordersTop");
    case "left":
      return t("toolbar.tableBordersLeft");
    case "right":
      return t("toolbar.tableBordersRight");
    case "none":
      return t("toolbar.tableBordersNone");
    case "outside":
      return t("toolbar.tableBordersOutside");
    case "all":
      return t("toolbar.tableBordersAll");
    case "insideH":
      return t("toolbar.tableBordersInsideHorizontal");
  }
}

/** What the menu shows of a target: whether there is one, whether it is a
 * text box, and which presets it already carries. */
function sameBorderTargetView(
  left: DocumentBorderTarget | null,
  right: DocumentBorderTarget | null,
): boolean {
  if (!left || !right) return left === right;
  if (Boolean(left.textBox) !== Boolean(right.textBox) || left.defaultKind !== right.defaultKind) return false;
  return DOCUMENT_PARAGRAPH_BORDER_PRESETS.every((preset) =>
    (["paragraph", "textBox"] as const).every((kind) =>
      documentBorderPresetState(left, kind, preset) === documentBorderPresetState(right, kind, preset)));
}

export default function DocumentBordersMenu({
  editor,
  disabled = false,
  onPointerDown,
}: DocumentBordersMenuProps) {
  const t = useTranslations("console-notebooks");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const actionTargetRef = useRef<DocumentBorderTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveTarget, setLiveTarget] = useChangedState<DocumentBorderTarget | null>(
    () => readDocumentBorderTarget(editor),
  );
  // Editability is read where the target is: the button re-renders only when
  // either changes, no longer on every transaction.
  const [writable, setWritable] = useChangedState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [kind, setKind] = useChangedState<BorderTargetKind>(
    () => readDocumentBorderTarget(editor)?.defaultKind ?? "paragraph",
  );
  const [lastParagraphPreset, setLastParagraphPreset] =
    useState<DocumentParagraphBorderPreset>("outside");
  const [lastTextBoxPreset, setLastTextBoxPreset] =
    useState<DocumentParagraphBorderPreset>("outside");
  const [pen, setPen] = useState<DocumentBorderPen>(
    DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  );
  // A line style or colour the user picked stays the pen (Word keeps the
  // last pen); until then the pen follows the selection's own border.
  const penPickedRef = useRef(false);

  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refresh = () => {
      const target = readDocumentBorderTarget(editor);
      // Every keystroke makes a new target (it holds the document); the
      // button shows only whether there is one and what its borders are.
      setLiveTarget((current) => (sameBorderTargetView(current, target) ? current : target));
      setWritable(!editor.isDestroyed && editor.isEditable);
      if (!menuOpen && target) setKind(target.defaultKind);
      if (
        menuOpen &&
        (disabled || editor.isDestroyed || !editor.isEditable || !target)
      ) {
        setMenuOpen(false);
        actionTargetRef.current = null;
      }
    };
    refresh();
    runtime.on?.("update", refresh);
    runtime.on?.("selectionUpdate", refresh);
    runtime.on?.("transaction", refresh);
    return () => {
      runtime.off?.("update", refresh);
      runtime.off?.("selectionUpdate", refresh);
      runtime.off?.("transaction", refresh);
    };
  }, [disabled, editor, menuOpen]);

  const captureActionTarget = useCallback(() => {
    const target = readDocumentBorderTarget(editor);
    actionTargetRef.current = target;
    if (target) {
      const nextKind = target.defaultKind;
      setLiveTarget(target);
      setKind(nextKind);
      if (!penPickedRef.current) {
        setPen(documentBorderPenForTarget(target, nextKind));
      }
    }
    return target;
  }, [editor]);

  const activeKind: BorderTargetKind =
    kind === "textBox" && !liveTarget?.textBox ? "paragraph" : kind;
  const presets =
    activeKind === "textBox" ? TEXT_BOX_PRESETS : PARAGRAPH_PRESETS;
  const lastPreset =
    activeKind === "textBox" ? lastTextBoxPreset : lastParagraphPreset;
  const checks = useMemo(
    () =>
      Object.fromEntries(
        DOCUMENT_PARAGRAPH_BORDER_PRESETS.map((preset) => [
          preset,
          documentBorderPresetState(liveTarget, activeKind, preset),
        ]),
      ) as Record<DocumentParagraphBorderPreset, boolean | "indeterminate">,
    [activeKind, liveTarget],
  );

  // Each border in the menu is a toggle, as in Word: one the selection
  // already shows in the pen is taken away (only the edges it names), any
  // other is drawn in the pen.
  const applyPreset = useCallback(
    (preset: DocumentParagraphBorderPreset) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) return;
      const target = actionTargetRef.current;
      if (!target) return;
      const activePen = penPickedRef.current
        ? pen
        : documentBorderPenForTarget(target, activeKind);
      const remove = documentBorderPresetMatchesPen(target, activeKind, preset, activePen);
      commitDocumentBorderPreset(
        editor,
        target,
        activeKind,
        preset,
        activePen,
        remove ? "remove" : "draw",
      );
    },
    [activeKind, disabled, editor, pen],
  );

  const choosePreset = useCallback(
    (preset: DocumentParagraphBorderPreset) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) return;
      if (activeKind === "textBox") setLastTextBoxPreset(preset);
      else setLastParagraphPreset(preset);
      applyPreset(preset);
      setMenuOpen(false);
    },
    [activeKind, applyPreset, disabled, editor],
  );

  const applyRememberedPreset = useCallback(() => {
    if (disabled || editor.isDestroyed || !editor.isEditable) return;
    const target = captureActionTarget();
    if (!target) return;
    const targetKind = target.defaultKind;
    const remembered =
      targetKind === "textBox" ? lastTextBoxPreset : lastParagraphPreset;
    const activePen = penPickedRef.current
      ? pen
      : documentBorderPenForTarget(target, targetKind);
    // Taken away only when already drawn in this pen, and then only the
    // edges that preset draws; otherwise redrawn in it.
    const remove =
      remembered !== "none" &&
      documentBorderPresetMatchesPen(target, targetKind, remembered, activePen);
    commitDocumentBorderPreset(
      editor,
      target,
      targetKind,
      remembered,
      activePen,
      remove ? "remove" : "draw",
    );
  }, [
    captureActionTarget,
    disabled,
    editor,
    lastParagraphPreset,
    lastTextBoxPreset,
    pen,
  ]);

  const chooseCompound = useCallback(
    (compound: ParagraphCompoundBorder) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) return;
      const target = actionTargetRef.current;
      if (!target) return;
      const activePen = penPickedRef.current
        ? pen
        : documentBorderPenForTarget(target, "paragraph");
      commitDocumentParagraphBorderSteps(
        editor,
        target,
        compoundBorderSteps(compound, activePen),
      );
      setMenuOpen(false);
    },
    [disabled, editor, pen],
  );

  const insertHorizontalLine = useCallback(() => {
    if (disabled || editor.isDestroyed || !editor.isEditable) return;
    setMenuOpen(false);
    editor.chain().focus().setHorizontalRule().run();
  }, [disabled, editor]);

  // A picked line style or colour redraws the borders the selection already
  // has at once; with none the pen waits for a border preset.
  const pickPen = useCallback(
    (next: DocumentBorderPen) => {
      setPen(next);
      penPickedRef.current = true;
      const target = actionTargetRef.current;
      if (disabled || editor.isDestroyed || !editor.isEditable || !target) {
        return;
      }
      if (restyleDocumentBorders(editor, target, activeKind, next) === "changed") {
        setMenuOpen(false);
      }
    },
    [activeKind, disabled, editor],
  );

  const selectKind = useCallback((nextKind: BorderTargetKind) => {
    const target = actionTargetRef.current;
    if (nextKind === "textBox" && !target?.textBox) return;
    setKind(nextKind);
    if (target && !penPickedRef.current) {
      setPen(documentBorderPenForTarget(target, nextKind));
    }
  }, []);

  const targetUnavailable =
    disabled || !writable || editor.isDestroyed || !editor.isEditable || !liveTarget;
  const targetTitle =
    activeKind === "textBox"
      ? t("presentation.textBoxOutlineColor")
      : t("toolbar.paragraphBorder");

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        if (
          open &&
          (disabled ||
            editor.isDestroyed ||
            !editor.isEditable ||
            !captureActionTarget())
        ) {
          return;
        }
        setMenuOpen(open);
      }}
    >
      <OfficeHomeSplitLayout
        className={homeStyles.borderSplit}
        testId="document-toolbar-borders-shading-split"
        primary={
          <OfficeHomeCommand
            active={
              checks[lastPreset] === "indeterminate"
                ? "mixed"
                : checks[lastPreset]
            }
            disabled={targetUnavailable}
            icon={<DocsHomeIcon name="bordersShading" />}
            label={presetLabel(t, lastPreset)}
            onClick={applyRememberedPreset}
            testId="document-toolbar-borders-shading-primary"
            variant="icon"
          />
        }
        trigger={
          <DropdownMenuTrigger asChild>
            <OfficeHomeMenuTrigger
              ref={triggerRef}
              className="note-editor-office-toolbar__menu-trigger"
              disabled={targetUnavailable}
              icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
              label={t("toolbar.bordersShading")}
              onPointerDown={(event) => {
                captureActionTarget();
                onPointerDown?.(event);
              }}
              testId="document-toolbar-borders-shading"
              variant="icon"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            />
          </DropdownMenuTrigger>
        }
      />
      <DropdownMenuContent
        align="start"
        className={`note-editor-toolbar-menu docs-cupertino-menu ${officeBordersMenuStyles.menu}`}
        data-testid="document-toolbar-borders-shading-menu"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <OfficeBordersMenuBody
          title={targetTitle}
          presetGroupLabel={t("toolbar.tableBordersPreset")}
          presets={[
            ...presets.map((preset) => ({
              id: preset,
              label: presetLabel(t, preset),
              icon: <DocumentBorderPresetIcon preset={preset} size={20} />,
              checked: checks[preset],
              disabled: targetUnavailable,
              testId: `document-toolbar-border-${preset}`,
              group: presetGroup(preset),
              onSelect: () => choosePreset(preset),
            })),
            ...(activeKind === "paragraph"
              ? PARAGRAPH_COMPOUND_BORDERS.map((compound) => ({
                  id: compound,
                  label: t(COMPOUND_LABEL_KEYS[compound] as "spreadsheet.bordersThickBox"),
                  icon: <OfficeBorderPresetIcon preset={compound} size={20} />,
                  disabled: targetUnavailable,
                  testId: `document-toolbar-border-${compound}`,
                  group: "compound",
                  onSelect: () => chooseCompound(compound),
                }))
              : []),
            ...(activeKind === "paragraph"
              ? [
                  {
                    id: "horizontalLine",
                    label: t("editorCommands.document.insert.horizontal_line"),
                    icon: <HorizontalLineIcon />,
                    disabled: targetUnavailable,
                    testId: "document-toolbar-border-horizontal-line",
                    group: "line",
                    onSelect: insertHorizontalLine,
                  },
                ]
              : []),
          ]}
          sections={[
            {
              id: "style",
              kind: "line-styles",
              label: t("toolbar.tableBordersLineStyle"),
              value: officeBorderLineStyleForSpec(pen),
              triggerTestId: "document-toolbar-border-style-menu",
              disabled: targetUnavailable,
              options: OFFICE_BORDER_LINE_STYLE_IDS.map((style) => ({
                id: style,
                label:
                  style === "thin"
                    ? `${t("toolbar.tableBordersStyleSingle")}, 0.5 pt`
                    : style === "medium"
                      ? `${t("toolbar.tableBordersStyleSingle")}, 1.5 pt`
                      : style === "thick"
                        ? `${t("toolbar.tableBordersStyleSingle")}, 3 pt`
                        : t(
                            `toolbar.tableBordersStyle${style[0]?.toUpperCase()}${style.slice(1)}` as "toolbar.tableBordersStyleDouble",
                          ),
                testId: `document-toolbar-border-style-${style}`,
              })),
              onSelect: (value) => {
                if (
                  OFFICE_BORDER_LINE_STYLE_IDS.includes(
                    value as OfficeBorderLineStyleId,
                  )
                ) {
                  pickPen({
                    ...pen,
                    ...officeBorderLineSpecForStyle(
                      value as OfficeBorderLineStyleId,
                    ),
                  });
                }
              },
            },
            {
              id: "color",
              kind: "color-palette",
              label: t("toolbar.tableBordersColor"),
              value: pen.color,
              triggerTestId: "document-toolbar-border-color-menu",
              testIdPrefix: "document-toolbar-border-color",
              disabled: targetUnavailable,
              labels: {
                automatic: t("toolbar.textColorAutomatic"),
                themeColors: t("toolbar.themeColors"),
                standardColors: t("toolbar.standardColors"),
                moreColors: t("spreadsheet.moreColors"),
              },
              onSelect: (value) => {
                pickPen({ ...pen, color: value });
              },
            },
          ]}
          disabled={targetUnavailable}
          beforePresets={
            liveTarget?.textBox ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger data-testid="document-toolbar-border-target-menu">
                    {t("toolbar.tableBordersApplyTo")}: {targetTitle}
                  </DropdownMenuSubTrigger>
                  <RibbonDropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={activeKind}>
                      <DropdownMenuRadioItem
                        value="textBox"
                        disabled={targetUnavailable}
                        data-testid="document-toolbar-border-target-textbox"
                        onSelect={(event) => {
                          event.preventDefault();
                          selectKind("textBox");
                        }}
                      >
                        {t("presentation.textBoxOutlineColor")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        value="paragraph"
                        disabled={targetUnavailable}
                        data-testid="document-toolbar-border-target-paragraph"
                        onSelect={(event) => {
                          event.preventDefault();
                          selectKind("paragraph");
                        }}
                      >
                        {t("toolbar.paragraphBorder")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </RibbonDropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
              </>
            ) : null
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
