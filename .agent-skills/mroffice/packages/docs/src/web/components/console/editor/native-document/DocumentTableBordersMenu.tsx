"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  Ban,
  Grid2X2,
  Grid3X3,
  PencilRuler,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { OfficeBorderPresetIcon } from "@mrnote/core/web/components/office-ribbon/OfficeBorderPresetIcon.tsx";
import {
  OFFICE_BORDER_LINE_STYLE_IDS,
  OfficeBorderMenuSections,
  OfficeBorderPresetItems,
  type OfficeBorderPresetOption,
  OfficeBorderWeightMenu,
  officeBorderWeightLabel,
  officeBorderLineSpecForStyle,
  officeBorderLineStyleForSpec,
  officeBordersMenuStyles,
  type OfficeBorderLineStyleId,
} from "@mrnote/core/web/components/office-ribbon/OfficeBordersMenu.tsx";
import { RibbonDropdownMenuSubContent as DropdownMenuSubContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeSplitLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { DocsHomeIcon } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import homeStyles from "@mrnote/core/web/components/console/editor/DocumentHomeRibbon.module.css";
import {
  CELL_MARGIN_VALUES,
  uniformCellMarginPreset,
  type CellMargin,
  type CellMargins,
} from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import {
  DEFAULT_DOCUMENT_TABLE_BORDER,
  DOCUMENT_TABLE_BORDER_PRESETS,
  commitDocumentTableBorderPreset,
  commitDocumentTableBorderSteps,
  documentTableBorderPen,
  documentTableBorderPresetMatchesPen,
  documentTableBorderPresetState,
  documentTableGridlinesVisible,
  readDocumentTableBorderTarget,
  setDocumentTableGridlinesVisible,
  type DocumentTableBorderPen,
  type DocumentTableBorderPreset,
  type DocumentTableBorderTarget,
} from "@mrnote/core/web/components/console/editor/native-document/tableBorders.ts";
import {
  applyPageBorderDialogValue,
  applyShadingDialogValue,
  currentPageBorderDialogValue,
  currentShadingDialogValue,
  DocumentPageBorderPanel,
  DocumentShadingPanel,
  type PageBorderDialogValue,
  type ShadingDialogValue,
} from "./DocumentBordersShadingPanels";

interface DocumentTableBordersMenuProps {
  readonly editor: Editor;
  readonly disabled?: boolean;
  readonly presentation?: "compact" | "large";
  readonly cellMargin: CellMargins | null;
  readonly cellMarginMixed: boolean;
  readonly onCellMarginChange: (margin: CellMargin | null) => void;
  /**
   * Arm the host's freehand Draw Table mode (the same `DocumentTableDrawOverlay`
   * the Insert Table menu and the Table Design tab use). The Draw Table entry
   * renders only when a host supplies it, so the menu never shows a Draw Table
   * command it cannot execute.
   */
  readonly onDrawTable?: () => void;
  /**
   * A line style or colour was picked. Word turns Border Painter on the
   * moment the pen changes (Line Style, Line Weight, Pen Color), so the next
   * click on a table edge draws with it; the host arms its painter here.
   * Without a host the pen only waits for the next border preset.
   */
  readonly onPenPicked?: (pen: DocumentTableBorderPen) => void;
  /**
   * The pen the user last picked, held by the host: this menu is remounted
   * whenever the caret leaves a table, and Word keeps the pen for the whole
   * session. Null until a pen is picked.
   */
  readonly heldPen?: DocumentTableBorderPen | null;
  readonly onPointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
}

export interface DocumentTableBordersMenuHandle {
  /** Open the existing authenticated Borders and Shading dialog. */
  readonly openDialog: () => boolean;
  /** The style, width, and color the next border action will apply. */
  readonly readPen: () => DocumentTableBorderPen;
}

const TABLE_BORDER_GRID_PRESETS = [
  "bottom",
  "top",
  "left",
  "right",
  "none",
  "all",
  "outside",
  "inside",
  "insideH",
  "insideV",
  "diagonalDown",
  "diagonalUp",
] as const satisfies readonly DocumentTableBorderPreset[];

/**
 * The weighted and doubled outer edges of the Borders list (Excel's set),
 * each drawn in the pen's colour as one Undo step.
 */
const TABLE_COMPOUND_BORDERS = [
  "thickBox",
  "bottomDouble",
  "thickBottom",
  "topAndBottom",
  "topAndThickBottom",
  "topAndDoubleBottom",
] as const;
type TableCompoundBorder = (typeof TABLE_COMPOUND_BORDERS)[number];

const TABLE_COMPOUND_LABEL_KEYS: Record<TableCompoundBorder, string> = {
  thickBox: "spreadsheet.bordersThickBox",
  bottomDouble: "spreadsheet.bordersBottomDouble",
  thickBottom: "spreadsheet.bordersThickBottom",
  topAndBottom: "spreadsheet.bordersTopAndBottom",
  topAndThickBottom: "spreadsheet.bordersTopAndThickBottom",
  topAndDoubleBottom: "spreadsheet.bordersTopAndDoubleBottom",
};

function tableCompoundSteps(
  compound: TableCompoundBorder,
  pen: DocumentTableBorderPen,
): { preset: DocumentTableBorderPreset; pen: DocumentTableBorderPen }[] {
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

/** Word's list groups: single edges, whole grids, inside lines and diagonals. */
function tablePresetGroup(preset: DocumentTableBorderPreset): string {
  switch (preset) {
    case "bottom":
    case "top":
    case "left":
    case "right":
      return "edges";
    case "none":
    case "all":
    case "outside":
    case "inside":
      return "grids";
    default:
      return "lines";
  }
}

type RuntimeEditor = Editor & {
  on?: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
};

/** The Docs name for the shared border-preset glyph (OfficeBorderPresetIcon):
 * the deck's Table Design ▸ Borders menu draws the same glyph. */
export function DocumentBorderPresetIcon({
  preset,
  size = 18,
}: {
  preset: DocumentTableBorderPreset;
  size?: number;
}) {
  return <OfficeBorderPresetIcon preset={preset} size={size} />;
}

function presetLabel(
  t: ReturnType<typeof useTranslations>,
  preset: DocumentTableBorderPreset,
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
    case "all":
      return t("toolbar.tableBordersAll");
    case "outside":
      return t("toolbar.tableBordersOutside");
    case "inside":
      return t("toolbar.tableBordersInside");
    case "insideH":
      return t("toolbar.tableBordersInsideHorizontal");
    case "insideV":
      return t("toolbar.tableBordersInsideVertical");
    case "diagonalDown":
      return t("toolbar.tableBordersDiagonalDown");
    case "diagonalUp":
      return t("toolbar.tableBordersDiagonalUp");
  }
}

const DocumentTableBordersMenu = forwardRef<
  DocumentTableBordersMenuHandle,
  DocumentTableBordersMenuProps
>(function DocumentTableBordersMenu(
  {
    editor,
    disabled = false,
    presentation = "compact",
    cellMargin,
    cellMarginMixed,
    onCellMarginChange,
    onDrawTable,
    onPenPicked,
    heldPen = null,
    onPointerDown,
  },
  forwardedRef,
) {
  const t = useTranslations("console-notebooks");
  const largePresentation = presentation === "large";
  const cellMarginPreset = uniformCellMarginPreset(cellMargin);
  const cellMarginMenuValue = cellMarginMixed
    ? "mixed"
    : cellMargin === null
      ? "default"
      : cellMarginPreset === null
        ? "custom"
        : String(cellMarginPreset);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const actionTargetRef = useRef<DocumentTableBorderTarget | null>(null);
  const penInitializedRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [liveTarget, setLiveTarget] =
    useState<DocumentTableBorderTarget | null>(() =>
      readDocumentTableBorderTarget(editor),
    );
  const [gridlines, setGridlines] = useState(() =>
    documentTableGridlinesVisible(editor),
  );
  const [dialogPreset, setDialogPreset] =
    useState<DocumentTableBorderPreset>("all");
  const [lastPreset, setLastPreset] =
    useState<DocumentTableBorderPreset>("bottom");
  const [applyTo, setApplyTo] = useState<"selection" | "table">("selection");
  const [pen, setPen] = useState<DocumentTableBorderPen>(
    heldPen ?? DEFAULT_DOCUMENT_TABLE_BORDER,
  );
  const [lastHeldPen, setLastHeldPen] = useState(heldPen);
  if (heldPen !== lastHeldPen) {
    setLastHeldPen(heldPen);
    if (heldPen) setPen(heldPen);
  }
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Word's Borders and Shading pages. Only the pages the user changed are
  // written on OK, so opening Shading to look never re-applies a border.
  const [dialogTab, setDialogTab] = useState<"borders" | "page" | "shading">(
    "borders",
  );
  const [bordersDirty, setBordersDirty] = useState(false);
  const [pageBorderValue, setPageBorderValue] =
    useState<PageBorderDialogValue | null>(null);
  const [pageBorderDirty, setPageBorderDirty] = useState(false);
  const [shadingValue, setShadingValue] = useState<ShadingDialogValue | null>(
    null,
  );
  const [shadingDirty, setShadingDirty] = useState(false);

  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refresh = () => {
      const target = readDocumentTableBorderTarget(editor);
      setLiveTarget(target);
      setGridlines(documentTableGridlinesVisible(editor));
      if (
        dialogOpen &&
        (disabled || editor.isDestroyed || !editor.isEditable || !target)
      ) {
        setDialogOpen(false);
        setDialogError(null);
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
  }, [dialogOpen, disabled, editor]);

  const captureActionTarget = useCallback(() => {
    const target = readDocumentTableBorderTarget(editor);
    actionTargetRef.current = target;
    if (target) {
      setLiveTarget(target);
      // Until a pen is picked (here, or held by the host) it follows the
      // selection's own border.
      if (!penInitializedRef.current && heldPen === null) {
        setPen(documentTableBorderPen(target));
        penInitializedRef.current = true;
      }
      setApplyTo(target.scope === "table" ? "table" : "selection");
    }
    return target;
  }, [editor, heldPen]);

  const applyPreset = useCallback(
    (
      preset: DocumentTableBorderPreset,
      borderPen: DocumentTableBorderPen = pen,
      targetScope?: "selection" | "table",
      mode: "draw" | "remove" = "draw",
    ) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) {
        return "rejected" as const;
      }
      const target = actionTargetRef.current;
      if (!target) return "rejected" as const;
      return commitDocumentTableBorderPreset(
        editor,
        target,
        preset,
        borderPen,
        targetScope ?? (target.scope === "table" ? "table" : "selection"),
        mode,
      );
    },
    [disabled, editor, pen],
  );

  const checks = useMemo(
    () =>
      Object.fromEntries(
        DOCUMENT_TABLE_BORDER_PRESETS.map((preset) => [
          preset,
          documentTableBorderPresetState(liveTarget, preset),
        ]),
      ) as Record<DocumentTableBorderPreset, boolean | "indeterminate">,
    [liveTarget],
  );

  const openDialog = useCallback(() => {
    const target = actionTargetRef.current ?? captureActionTarget();
    if (!target || disabled || editor.isDestroyed || !editor.isEditable) {
      return false;
    }
    setPen(documentTableBorderPen(target));
    setApplyTo(target.scope === "table" ? "table" : "selection");
    setDialogError(null);
    setDialogTab("borders");
    setBordersDirty(false);
    setPageBorderValue(currentPageBorderDialogValue(editor));
    setPageBorderDirty(false);
    setShadingValue(currentShadingDialogValue(editor));
    setShadingDirty(false);
    setDialogOpen(true);
    return true;
  }, [captureActionTarget, disabled, editor]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      openDialog,
      readPen: () =>
        penInitializedRef.current || heldPen !== null
          ? pen
          : documentTableBorderPen(readDocumentTableBorderTarget(editor)),
    }),
    [editor, heldPen, openDialog, pen],
  );

  const commitDialog = useCallback(() => {
    if (bordersDirty) {
      const result = applyPreset(dialogPreset, pen, applyTo);
      if (result === "rejected") {
        setDialogError(t("toolbar.tableBordersStale"));
        return;
      }
      setLastPreset(dialogPreset);
    }
    if (shadingDirty && shadingValue && !applyShadingDialogValue(editor, shadingValue)) {
      setDialogError(t("toolbar.tableBordersStale"));
      return;
    }
    if (
      pageBorderDirty &&
      pageBorderValue &&
      !applyPageBorderDialogValue(editor, pageBorderValue)
    ) {
      setDialogError(t("toolbar.tableBordersStale"));
      return;
    }
    setDialogOpen(false);
    setDialogError(null);
  }, [
    applyPreset,
    applyTo,
    bordersDirty,
    dialogPreset,
    editor,
    pageBorderDirty,
    pageBorderValue,
    pen,
    shadingDirty,
    shadingValue,
    t,
  ]);

  const targetUnavailable = !liveTarget;
  const writeUnavailable =
    disabled || editor.isDestroyed || !editor.isEditable || !liveTarget;

  const applyRememberedPreset = useCallback(() => {
    if (disabled || editor.isDestroyed || !editor.isEditable) return;
    const hadRememberedPen = penInitializedRef.current || heldPen !== null;
    const target = captureActionTarget();
    if (!target) return;
    const activePen = hadRememberedPen ? pen : documentTableBorderPen(target);
    // Word's Borders button takes the border away only when it is already
    // drawn in the current pen, and then only the edges it names; after a new
    // style or colour it draws the border in that pen.
    const remove =
      lastPreset !== "none" &&
      documentTableBorderPresetMatchesPen(target, lastPreset, activePen);
    applyPreset(lastPreset, activePen, undefined, remove ? "remove" : "draw");
  }, [
    applyPreset,
    captureActionTarget,
    disabled,
    editor,
    heldPen,
    lastPreset,
    pen,
  ]);

  const choosePreset = useCallback(
    (preset: DocumentTableBorderPreset) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) return;
      setLastPreset(preset);
      // Each border in the gallery is a toggle, as in Word.
      const target = actionTargetRef.current;
      const remove =
        preset !== "none" &&
        target !== null &&
        documentTableBorderPresetMatchesPen(target, preset, pen);
      applyPreset(preset, pen, undefined, remove ? "remove" : "draw");
      setMenuOpen(false);
    },
    [applyPreset, disabled, editor, pen],
  );

  const chooseCompound = useCallback(
    (compound: TableCompoundBorder) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) return;
      const target = actionTargetRef.current;
      if (!target) return;
      commitDocumentTableBorderSteps(
        editor,
        target,
        tableCompoundSteps(compound, pen),
        target.scope === "table" ? "table" : "selection",
      );
      setMenuOpen(false);
    },
    [disabled, editor, pen],
  );

  const pickPen = useCallback(
    (next: DocumentTableBorderPen) => {
      setPen(next);
      penInitializedRef.current = true;
      if (!onPenPicked) return;
      setMenuOpen(false);
      onPenPicked(next);
    },
    [onPenPicked],
  );

  const changeCellMargin = useCallback(
    (margin: CellMargin | null) => {
      if (disabled || editor.isDestroyed || !editor.isEditable) return;
      onCellMarginChange(margin);
    },
    [disabled, editor, onCellMarginChange],
  );

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (open && !captureActionTarget()) return;
          setMenuOpen(open);
        }}
      >
        <OfficeHomeSplitLayout
          className={
            largePresentation
              ? homeStyles.tableDesignBorderSplit
              : homeStyles.borderSplit
          }
          testId="document-toolbar-table-borders-split"
          primary={
            <OfficeHomeCommand
              active={
                checks[lastPreset] === "indeterminate"
                  ? "mixed"
                  : checks[lastPreset]
              }
              disabled={writeUnavailable}
              displayLabel={
                largePresentation ? t("toolbar.tableBorders") : undefined
              }
              icon={
                <DocsHomeIcon
                  name="bordersShading"
                  size={largePresentation ? 24 : 18}
                />
              }
              label={presetLabel(t, lastPreset)}
              onClick={applyRememberedPreset}
              testId="document-toolbar-table-borders-primary"
              variant={largePresentation ? "large" : "icon"}
            />
          }
          trigger={
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                ref={triggerRef}
                className="note-editor-office-toolbar__menu-trigger"
                disabled={targetUnavailable}
                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                label={t("toolbar.tableBorders")}
                testId="document-toolbar-table-borders"
                variant="icon"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onPointerDown={(event) => {
                  captureActionTarget();
                  onPointerDown?.(event);
                }}
              />
            </DropdownMenuTrigger>
          }
        />
        <DropdownMenuContent
          align="start"
          className={`docs-cupertino-menu ${officeBordersMenuStyles.menu}`}
          data-testid="document-toolbar-table-borders-menu"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <DropdownMenuLabel>{t("toolbar.tableBorders")}</DropdownMenuLabel>
          <OfficeBorderPresetItems
            groupLabel={t("toolbar.tableBordersPreset")}
            disabled={writeUnavailable}
            presets={[
              ...TABLE_BORDER_GRID_PRESETS.map((preset): OfficeBorderPresetOption => {
                const diagonal = preset === "diagonalDown" || preset === "diagonalUp";
                // A diagonal is a cell's own line: a whole-table target has none.
                const diagonalUnavailable = diagonal && liveTarget?.scope === "table";
                return {
                  id: preset,
                  label: presetLabel(t, preset),
                  icon: <DocumentBorderPresetIcon preset={preset} size={20} />,
                  checked: checks[preset],
                  disabled: writeUnavailable || diagonalUnavailable,
                  testId: "document-toolbar-table-border-" + preset,
                  group: tablePresetGroup(preset),
                  itemProps: diagonalUnavailable
                    ? { title: t("toolbar.tableBordersDiagonalCellsOnly") }
                    : undefined,
                  onSelect: () => choosePreset(preset),
                };
                }),
              ...TABLE_COMPOUND_BORDERS.map((compound): OfficeBorderPresetOption => ({
                id: compound,
                label: t(TABLE_COMPOUND_LABEL_KEYS[compound] as "spreadsheet.bordersThickBox"),
                icon: <OfficeBorderPresetIcon preset={compound} size={20} />,
                disabled: writeUnavailable,
                testId: "document-toolbar-table-border-" + compound,
                group: "compound",
                onSelect: () => chooseCompound(compound),
              })),
            ]}
          />
          <DropdownMenuSeparator />
          <OfficeBorderMenuSections
            disabled={writeUnavailable}
            sections={[
              {
                id: "style",
                kind: "line-styles",
                label: t("toolbar.tableBordersLineStyle"),
                value: officeBorderLineStyleForSpec(pen),
                triggerTestId: "document-toolbar-table-border-style-menu",
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
                  testId: `document-toolbar-table-border-style-${style}`,
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
                value: pen.color ?? "#000000",
                triggerTestId: "document-toolbar-table-border-color-menu",
                testIdPrefix: "document-toolbar-table-border-color",
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
          />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              disabled={writeUnavailable}
              data-testid="document-toolbar-table-border-padding-menu"
            >
              {t("toolbar.cellMargin")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={cellMarginMenuValue}>
                <DropdownMenuRadioItem
                  value="default"
                  disabled={writeUnavailable}
                  data-testid="document-toolbar-table-border-padding-default"
                  onSelect={() => changeCellMargin(null)}
                >
                  {t("toolbar.cellMarginNone")}
                </DropdownMenuRadioItem>
                {CELL_MARGIN_VALUES.map((margin) => (
                  <DropdownMenuRadioItem
                    key={margin}
                    value={String(margin)}
                    disabled={writeUnavailable}
                    data-testid={`document-toolbar-table-border-padding-${margin}`}
                    onSelect={() => changeCellMargin(margin)}
                  >
                    {t("toolbar.cellMarginValue", { px: margin })}
                  </DropdownMenuRadioItem>
                ))}
                {cellMarginMenuValue === "custom" ||
                cellMarginMenuValue === "mixed" ? (
                  <DropdownMenuRadioItem
                    value={cellMarginMenuValue}
                    disabled
                    aria-disabled="true"
                    data-testid={`document-toolbar-table-border-padding-${cellMarginMenuValue}`}
                  >
                    {cellMarginMenuValue === "mixed"
                      ? t("toolbar.cellMarginMixed")
                      : t("toolbar.cellMarginCustom")}
                  </DropdownMenuRadioItem>
                ) : null}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {onDrawTable ? (
            <DropdownMenuItem
              disabled={writeUnavailable}
              data-testid="document-toolbar-table-draw"
              data-control-id="DOCCTL.APP.TABLE.DRAW"
              onSelect={() => onDrawTable()}
            >
              <PencilRuler size={16} aria-hidden />
              {t("toolbar.tableDraw")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuCheckboxItem
            checked={gridlines}
            data-testid="document-toolbar-table-gridlines"
            onSelect={(event) => {
              event.preventDefault();
              const next = !documentTableGridlinesVisible(editor);
              setDocumentTableGridlinesVisible(editor, next);
              setGridlines(next);
            }}
          >
            <Grid2X2 size={16} aria-hidden className="mr-2" />
            {t("toolbar.tableViewGridlines")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={writeUnavailable}
            data-testid="document-toolbar-table-borders-dialog-open"
            onSelect={openDialog}
          >
            <Grid3X3 size={16} aria-hidden />
            {t("toolbar.bordersShading")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OfficeDialogShell
        open={dialogOpen}
        title={t("toolbar.bordersShading")}
        description={t("toolbar.tableBordersDialogDescription")}
        defaultActionLabel={t("toolbar.apply")}
        cancelActionLabel={t("toolbar.cancel")}
        defaultActionDisabled={writeUnavailable}
        onDefaultAction={commitDialog}
        onCancel={() => {
          setDialogOpen(false);
          setDialogError(null);
        }}
        returnFocusRef={triggerRef}
        testIdPrefix="document-table-borders"
        tabStrip={
          <div
            className="office-dialog__tabs"
            role="tablist"
            aria-label={t("toolbar.bordersShading")}
          >
            {(
              [
                ["borders", t("toolbar.bordersShadingTabBorders")],
                ["page", t("toolbar.bordersShadingTabPageBorder")],
                ["shading", t("toolbar.bordersShadingTabShading")],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={dialogTab === tab}
                className="office-dialog__tab"
                data-testid={`document-table-borders-tab-${tab}`}
                onClick={() => setDialogTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {dialogTab === "page" && pageBorderValue ? (
          <DocumentPageBorderPanel
            value={pageBorderValue}
            disabled={writeUnavailable}
            onChange={(next) => {
              setPageBorderValue(next);
              setPageBorderDirty(true);
            }}
          />
        ) : null}
        {dialogTab === "shading" && shadingValue ? (
          <DocumentShadingPanel
            value={shadingValue}
            tableAvailable
            disabled={writeUnavailable}
            onChange={(next) => {
              setShadingValue(next);
              setShadingDirty(true);
            }}
          />
        ) : null}
        <div
          hidden={dialogTab !== "borders"}
          className="office-dialog__body"
          onChangeCapture={() => setBordersDirty(true)}
          onClickCapture={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.closest("button, input, select")
            ) {
              setBordersDirty(true);
            }
          }}
        >
        <fieldset className={parts.group} disabled={writeUnavailable}>
          <legend className={parts.sectionTitle}>
            {t("toolbar.tableBordersPreset")}
          </legend>
          <div
            className="grid grid-cols-4 gap-2"
            role="radiogroup"
            aria-label={t("toolbar.tableBordersPreset")}
          >
            {DOCUMENT_TABLE_BORDER_PRESETS.map((preset) => {
              const disabledPreset =
                (preset === "diagonalDown" || preset === "diagonalUp") &&
                applyTo === "table";
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={dialogPreset === preset}
                  disabled={disabledPreset}
                  title={
                    disabledPreset
                      ? t("toolbar.tableBordersDiagonalCellsOnly")
                      : presetLabel(t, preset)
                  }
                  className={`${parts.choice} flex min-h-12 flex-col items-center justify-center`}
                  data-testid={"document-table-borders-preset-" + preset}
                  onClick={() => setDialogPreset(preset)}
                >
                  <DocumentBorderPresetIcon preset={preset} size={20} />
                  <span className="mt-1">{presetLabel(t, preset)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-3 gap-3">
          <label className={parts.field}>
            <span className={parts.label}>{t("toolbar.tableBordersLineStyle")}</span>
            <select
              value={pen.style}
              disabled={writeUnavailable}
              data-testid="document-table-borders-style"
              onChange={(event) =>
                setPen((current) => ({
                  ...current,
                  style: event.target.value,
                }))
              }
            >
              <option value="single">
                {t("toolbar.tableBordersStyleSingle")}
              </option>
              <option value="double">
                {t("toolbar.tableBordersStyleDouble")}
              </option>
              <option value="dashed">
                {t("toolbar.tableBordersStyleDashed")}
              </option>
              <option value="dotted">
                {t("toolbar.tableBordersStyleDotted")}
              </option>
            </select>
          </label>
          <label className={parts.field}>
            <span className={parts.label}>{t("toolbar.tableBordersWidth")}</span>
            <OfficeBorderWeightMenu
              valuePt={pen.sizePt}
              points={[0.5, 1, 1.5, 2.25, 3]}
              label={t("toolbar.tableBordersWidth")}
              disabled={writeUnavailable}
              testIdPrefix="document-table-borders-width"
              onSelect={(sizePt) =>
                setPen((current) => ({
                  ...current,
                  sizePt,
                }))
              }
              renderTrigger={() => (
                <button
                  type="button"
                  disabled={writeUnavailable}
                  data-testid="document-table-borders-width"
                  aria-label={`${t("toolbar.tableBordersWidth")}: ${officeBorderWeightLabel(pen.sizePt)}`}
                  className={parts.button}
                >
                  {officeBorderWeightLabel(pen.sizePt)}
                  <OfficeSemanticIcon
                    semanticId="menu.chevron.down"
                    size={12}
                  />
                </button>
              )}
            />
          </label>
          <label className={parts.field}>
            <span className={parts.label}>{t("toolbar.tableBordersColor")}</span>
            <input
              type="color"
              value={pen.color ?? "#000000"}
              disabled={writeUnavailable}
              data-testid="document-table-borders-color"
              className="h-7 w-full"
              onChange={(event) =>
                setPen((current) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <fieldset className={parts.group} disabled={writeUnavailable}>
          <legend className={parts.sectionTitle}>
            {t("toolbar.tableBordersApplyTo")}
          </legend>
          <div className="flex gap-4">
            <label className={parts.check}>
              <input
                type="radio"
                name="document-table-border-scope"
                value="selection"
                checked={applyTo === "selection"}
                onChange={() => setApplyTo("selection")}
              />
              <DocumentDialogIcon icon="table.select" />
              {t("toolbar.tableBordersApplySelection")}
            </label>
            <label className={parts.check}>
              <input
                type="radio"
                name="document-table-border-scope"
                value="table"
                checked={applyTo === "table"}
                onChange={() => setApplyTo("table")}
              />
              <DocumentDialogIcon icon="table.insert" />
              {t("toolbar.tableBordersApplyTable")}
            </label>
          </div>
        </fieldset>
        </div>
        {dialogError ? (
          <p
            role="alert"
            className={parts.error}
            data-testid="document-table-borders-error"
          >
            <Ban size={14} className="mr-1 inline" aria-hidden />
            {dialogError}
          </p>
        ) : null}
      </OfficeDialogShell>
    </>
  );
});

DocumentTableBordersMenu.displayName = "DocumentTableBordersMenu";

export default DocumentTableBordersMenu;
