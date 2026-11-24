"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Loader2 } from "lucide-react";
import { Languages, ShieldCheck } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { type ReactNode, useRef } from "react";

import {
  OfficeHomeCommand,
  OfficeHomeCommandRow,
  OfficeHomeCommandStack,
  OfficeHomeLargeSplitLayout,
  OfficeHomeMenuTrigger,
  OfficeHomeSplitLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  RibbonDropdownMenuContent,
  RibbonMenuRichRow,
} from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import type { OfficeFileTypeGlyphKind } from "@mrnote/core/web/components/office-ribbon/OfficeFileTypeGlyph.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";

import {
  PdfHomeRibbonIcon,
  type PdfHomeRibbonIconName,
} from "./PdfHomeRibbonIcons";
import styles from "./PdfHomeCompactRibbon.module.css";
import ribbonLayout from "./pdfRibbonLayout.module.css";
import { PdfInsertRibbonIcon } from "./PdfInsertRibbonIcons";
import PdfRibbonButton from "./PdfRibbonButton";
import { PdfSurfaceRibbonGroup } from "./PdfSurfaceRibbon";

type PdfHomeCompactIconName =
  | PdfHomeRibbonIconName
  | "rotateLeft"
  | "rotateRight";

export const PDF_HOME_COMPACT_CONTROL_ORDER = [
  "hand",
  "select",
  "convertPdf",
  "outputImages",
  "splitMerge",
  "play",
  "actualSize",
  "fitPage",
  "fitWidth",
  "rotateLeft",
  "rotateRight",
  "rotateDocument",
  "pageFirst",
  "pagePrevious",
  "pageCurrent",
  "pageNext",
  "pageLast",
  "singlePage",
  "doublePage",
  "continuousReading",
  "reflow",
  "editContent",
  "fullTranslation",
  "selectionTranslation",
  "screenshot",
  "compress",
  "documentEncrypt",
  "verifySignatures",
] as const;

export const PDF_HOME_CONVERT_MENU_ORDER = [
  "convertPdf",
  "convertExcel",
  "convertPpt",
  "convertImageOnly",
  "convertTxt",
  "convertCad",
] as const;

export type PdfHomeCompactControlId =
  (typeof PDF_HOME_COMPACT_CONTROL_ORDER)[number];
export type PdfHomeConvertMenuId =
  (typeof PDF_HOME_CONVERT_MENU_ORDER)[number];
type PdfHomeAuxiliaryCommandId = "mergeFiles" | "snapshotLatex";

export interface PdfHomeCompactCommand {
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  displayLabel?: string;
  /**
   * Withhold the command entirely. Reserved for a host that can never satisfy
   * this command for the life of the viewer — a preview with no data item can
   * never authenticate a source, so the output commands gated on one would sit
   * grey forever and read as "not yet". `disabled` stays for the conditions a
   * user can actually clear.
   */
  hidden?: boolean;
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  /** The convert menu's row: the plain name of what is written ... */
  menuTitle?: string;
  /** ... and one line on what the file holds. */
  menuDetail?: string;
  onInvoke?: (trigger: HTMLButtonElement | null) => void;
  testId: string;
}

export interface PdfHomeCompactRibbonProps {
  visible: boolean;
  commands: Record<
    | Exclude<
        PdfHomeCompactControlId,
        "hand" | "select" | "pageCurrent" | "verifySignatures"
      >
    | Exclude<PdfHomeConvertMenuId, "convertPdf">
    | PdfHomeAuxiliaryCommandId,
    PdfHomeCompactCommand
  > & {
    /** WPS CT_Home RB_Protect: Protect_VerifyAllSign, after Encrypt. */
    verifySignatures?: PdfHomeCompactCommand;
    /**
     * WPS' screenshot menu: rectangle, ellipse, rounded-rectangle and custom
     * (free-drawn) regions, then a capture of a screen or window.
     */
    screenshotRect?: PdfHomeCompactCommand;
    screenshotEllipse?: PdfHomeCompactCommand;
    screenshotRounded?: PdfHomeCompactCommand;
    screenshotFreeform?: PdfHomeCompactCommand;
    screenshotScreen?: PdfHomeCompactCommand;
  };
  groupLabels: {
    pointer: string;
    file: string;
    view: string;
    editing: string;
    security: string;
    convert: string;
    /** The heading of the convert menu ("Convert to"); the group label otherwise. */
    convertMenuHeading?: string;
    output: string;
    splitMerge: string;
    reading: string;
    pageNavigation: string;
    pageView: string;
    edit: string;
    translation: string;
    utilities: string;
  };
  pageNavigation: {
    countLabel: string;
    /** The current page's document label when it is not its number, shown
     * before the page box as WPS shows "v2-1 (13/22)". */
    label?: string | null;
    inputLabel: string;
    total: number;
    value: string;
    onCancel: () => void;
    onValueChange: (value: string) => void;
    onCommit: () => void;
  };
  layoutMenuLabel: string;
  /** The convert menu opened (a host may start preparing a conversion). */
  onConvertMenuOpen?: () => void;
  pointerTools: ReactNode;
  /** Groups after the tab's own: the view utilities and workspace actions
   *  the retired "more" menu used to hold. */
  trailing?: ReactNode;
}

const CONTROL_ORDER = new Map(
  PDF_HOME_COMPACT_CONTROL_ORDER.map((id, index) => [
    id,
    String(index + 1).padStart(2, "0"),
  ]),
);

function commandLabel(command: PdfHomeCompactCommand): string {
  if (command.loading) {
    // No English placeholder: a command without its own progress text just
    // keeps its name while the spinner shows the work.
    return command.loadingLabel
      ? `${command.label} — ${command.loadingLabel}`
      : command.label;
  }
  if ((command.disabled || !command.onInvoke) && command.disabledReason) {
    return `${command.label} — ${command.disabledReason}`;
  }
  return command.label;
}

export function HomeGroup({
  children,
  collapsedIcon,
  label,
  testId,
}: {
  children: ReactNode;
  /** Lets the group collapse to one button when the band is narrow. */
  collapsedIcon?: ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <PdfSurfaceRibbonGroup collapsedIcon={collapsedIcon} label={label} tab="home" testId={testId}>
      {children}
    </PdfSurfaceRibbonGroup>
  );
}

function HomeSplit({
  children,
  className,
  controlId,
  large = true,
  testId,
  trigger,
}: {
  children: ReactNode;
  className?: string;
  controlId: PdfHomeCompactControlId;
  large?: boolean;
  testId: string;
  trigger: ReactNode;
}) {
  const Layout = large ? OfficeHomeLargeSplitLayout : OfficeHomeSplitLayout;
  return (
    <span
      data-pdf-home-control={controlId}
      data-pdf-home-order={CONTROL_ORDER.get(controlId)}
      style={{ display: "contents" }}
    >
      <Layout
        className={className}
        primary={children}
        testId={testId}
        trigger={trigger}
      />
    </span>
  );
}

function CommandSlot({
  controlId,
  command,
  icon,
  bare = false,
  splitPart = false,
  slotClassName,
  variant = "large",
}: {
  controlId: PdfHomeCompactControlId;
  command: PdfHomeCompactCommand;
  icon: PdfHomeCompactIconName;
  bare?: boolean;
  splitPart?: boolean;
  slotClassName?: string;
  variant?: "large" | "compact" | "icon";
}) {
  const disabled = command.disabled || command.loading || !command.onInvoke;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const glyph = command.loading ? (
    <Loader2 className="animate-spin" aria-hidden="true" />
  ) : icon === "rotateLeft" || icon === "rotateRight" ? (
    <PdfInsertRibbonIcon
      name={icon}
      size={variant === "large" ? 24 : variant === "icon" ? 20 : 16}
      data-pdf-home-icon={icon}
    />
  ) : (
    <PdfHomeRibbonIcon name={icon} size={variant === "large" ? 24 : variant === "icon" ? 20 : 16} />
  );
  const accessibleLabel = commandLabel(command);
  const splitDisabledReason =
    !command.loading && disabled ? command.disabledReason : undefined;
  const directAttributes = bare
    ? {
        "data-pdf-home-control": controlId,
        "data-pdf-home-order": CONTROL_ORDER.get(controlId),
      }
    : {};
  const button = splitPart ? (
    <OfficeHomeCommand
      active={command.active}
      buttonRef={triggerRef}
      controlId={controlId}
      disabled={disabled}
      disabledReason={splitDisabledReason}
      displayLabel={command.displayLabel ?? command.label}
      icon={glyph}
      label={command.loading ? accessibleLabel : command.label}
      onClick={() => command.onInvoke?.(triggerRef.current)}
      testId={command.testId}
      variant={variant}
    />
  ) : variant === "large" ? (
        <PdfRibbonButton
          {...directAttributes}
          active={command.active}
          buttonRef={triggerRef}
          data-disabled-reason={disabled ? command.disabledReason : undefined}
          disabled={disabled}
          displayLabel={command.displayLabel ?? command.label}
          label={accessibleLabel}
          onClick={() => command.onInvoke?.(triggerRef.current)}
          testId={command.testId}
        >
          {glyph}
        </PdfRibbonButton>
      ) : (
        // The shared Home command in its compact (30px, 16px glyph, label)
        // or icon (30x30, 20px glyph) form, as Docs' Home tab renders them;
        
        // both forms and their own 2px/5px padding.
        <OfficeHomeCommand
          {...directAttributes}
          active={command.active}
          buttonRef={triggerRef}
          controlId={controlId}
          disabled={disabled}
          displayLabel={command.displayLabel ?? command.label}
          icon={glyph}
          label={accessibleLabel}
          onClick={() => command.onInvoke?.(triggerRef.current)}
          testId={command.testId}
          variant={variant}
        />
      );
  if (command.hidden) return null;
  if (bare) return button;
  return (
    <span
      className={slotClassName}
      data-pdf-home-control={controlId}
      data-pdf-home-order={CONTROL_ORDER.get(controlId)}
      style={slotClassName ? undefined : { display: "contents" }}
    >
      {button}
    </span>
  );
}
/* A convert-menu row: the sheet's Export menu shape (a file glyph, the
   plain name, one line on what the file holds or why it cannot be written
   right now, the extension as a badge). The accessible name and the title
   keep the command's own label with its reason, as before. */
function MenuCommandItem({
  command,
  fileType,
  badge,
  menuId,
}: {
  command: PdfHomeCompactCommand;
  fileType: OfficeFileTypeGlyphKind;
  badge: string;
  menuId: PdfHomeConvertMenuId;
}) {
  const disabled = command.disabled || command.loading || !command.onInvoke;
  const testId =
    menuId === "convertPdf" ? `${command.testId}-menu-item` : command.testId;
  if (command.hidden) return null;
  const blocked =
    !command.loading &&
    (command.disabled || !command.onInvoke) &&
    Boolean(command.disabledReason);
  const detail = command.loading
    ? (command.loadingLabel ?? command.menuDetail)
    : blocked
      ? command.disabledReason
      : command.menuDetail;
  return (
    <DropdownMenuItem
      className="docs-cupertino-menu__rich-item"
      aria-label={commandLabel(command)}
      disabled={disabled}
      title={commandLabel(command)}
      data-pdf-home-convert-menu-item={menuId}
      data-testid={testId}
      onSelect={() => command.onInvoke?.(null)}
    >
      <RibbonMenuRichRow
        fileType={fileType}
        hoverScene
        title={command.menuTitle ?? command.displayLabel ?? command.label}
        detail={detail}
        blocked={blocked}
        badge={badge}
      />
    </DropdownMenuItem>
  );
}

function ConvertMenu({
  commands,
  label,
  heading,
  onOpen,
}: Pick<PdfHomeCompactRibbonProps, "commands"> & {
  label: string;
  heading?: string;
  onOpen?: () => void;
}) {
  const items: readonly [
    PdfHomeConvertMenuId,
    OfficeFileTypeGlyphKind,
    string,
  ][] = [
    ["convertPdf", "word", "DOCX"],
    ["convertExcel", "workbook", "XLSX"],
    ["convertPpt", "slides", "PPTX"],
    ["convertImageOnly", "pdf", "PDF"],
    ["convertTxt", "text", "TXT"],
    ["convertCad", "cad", "DXF"],
  ];
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
    >
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          variant="icon"
          className="note-editor-office-toolbar__split-chevron"
          icon={
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
          }
          label={label}
          testId="pdf-home-convert-menu"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        sideOffset={5}
        className="pdf-home-compact-convert-menu docs-cupertino-menu--described"
        aria-label={label}
        data-testid="pdf-home-convert-menu-content"
      >
        <DropdownMenuLabel className="docs-cupertino-menu__heading">
          {heading ?? label}
        </DropdownMenuLabel>
        {items.map(([id, fileType, badge]) => (
          <MenuCommandItem
            key={id}
            menuId={id}
            command={commands[id]}
            fileType={fileType}
            badge={badge}
          />
        ))}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function LayoutMenu({
  commands,
  label,
}: Pick<PdfHomeCompactRibbonProps, "commands"> & { label: string }) {
  const items = [
    ["singlePage", commands.singlePage, "singlePage"],
    ["doublePage", commands.doublePage, "doublePage"],
    ["continuousReading", commands.continuousReading, "continuousReading"],
  ] as const;
  const reflow = commands.reflow;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          variant="icon"
          className="note-editor-office-toolbar__split-chevron"
          icon={
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
          }
          label={label}
          testId="pdf-home-double-page-menu"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        sideOffset={5}
        aria-label={label}
        data-testid="pdf-home-layout-menu"
      >
        {items.map(([id, command, icon]) => (
          <DropdownMenuItem
            key={id}
            role="menuitemradio"
            aria-checked={command.active}
            aria-label={commandLabel(command)}
            disabled={command.disabled || !command.onInvoke}
            title={commandLabel(command)}
            data-testid={`pdf-home-layout-menu-${id}`}
            onSelect={() => command.onInvoke?.(null)}
          >
            <span aria-hidden="true">
              {command.active ? (
                <OfficeSemanticIcon semanticId="selection.check" size={12} />
              ) : null}
            </span>
            <PdfHomeRibbonIcon name={icon} size={16} />
            <span>{command.displayLabel ?? command.label}</span>
          </DropdownMenuItem>
        ))}
        {/* Reflow: a reading view over the page layout, not one of them. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={reflow.active}
          aria-label={commandLabel(reflow)}
          disabled={reflow.disabled || !reflow.onInvoke}
          title={commandLabel(reflow)}
          data-testid="pdf-home-layout-menu-reflow"
          onSelect={() => reflow.onInvoke?.(null)}
        >
          <span aria-hidden="true">
            {reflow.active ? <OfficeSemanticIcon semanticId="selection.check" size={12} /> : null}
          </span>
          <PdfHomeRibbonIcon name="reflow" size={16} />
          <span>{reflow.displayLabel ?? reflow.label}</span>
        </DropdownMenuItem>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function SplitMergeMenu({
  commands,
  label,
}: Pick<PdfHomeCompactRibbonProps, "commands"> & { label: string }) {
  const items = [
    ["split", commands.splitMerge, "splitPages"],
    ["merge", commands.mergeFiles, "mergePages"],
  ] as const;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          variant="icon"
          className="note-editor-office-toolbar__split-chevron"
          icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
          label={label}
          testId="pdf-home-split-merge-menu"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        sideOffset={4}
        className="pdf-home-compact-action-menu"
        aria-label={label}
        data-testid="pdf-home-split-merge-menu-content"
      >
        {items.map(([id, command, icon]) => (
          <DropdownMenuItem
            key={id}
            aria-label={commandLabel(command)}
            disabled={command.disabled || command.loading || !command.onInvoke}
            title={commandLabel(command)}
            data-pdf-home-file-menu-item={id}
            data-testid={`pdf-home-${id}-menu-item`}
            onSelect={() => command.onInvoke?.(null)}
          >
            <PdfHomeRibbonIcon name={icon} size={16} />
            <span>{command.displayLabel ?? command.label}</span>
          </DropdownMenuItem>
        ))}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function ScreenshotMenu({
  commands,
  label,
}: Pick<PdfHomeCompactRibbonProps, "commands"> & { label: string }) {
  const entries: ReadonlyArray<
    readonly [string, PdfHomeCompactCommand | undefined, PdfHomeRibbonIconName]
  > = [
    commands.screenshotRect
      ? ["rect", commands.screenshotRect, "screenshotRect"]
      : ["capture", commands.screenshot, "screenshot"],
    ["ellipse", commands.screenshotEllipse, "screenshotEllipse"],
    ["rounded", commands.screenshotRounded, "screenshotRounded"],
    ["freeform", commands.screenshotFreeform, "screenshotFreeform"],
    ["screen", commands.screenshotScreen, "screenshotScreen"],
    ["latex", commands.snapshotLatex, "snapshotLatex"],
  ];
  const items = entries.flatMap(([id, command, icon]) =>
    command && !command.hidden ? [[id, command, icon] as const] : [],
  );
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          variant="icon"
          className="note-editor-office-toolbar__split-chevron"
          icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
          label={label}
          testId="pdf-home-screenshot-menu"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        sideOffset={4}
        className="pdf-home-compact-action-menu"
        aria-label={label}
        data-testid="pdf-home-screenshot-menu-content"
      >
        {items.map(([id, command, icon]) => (
          <DropdownMenuItem
            key={id}
            aria-label={commandLabel(command)}
            disabled={command.disabled || command.loading || !command.onInvoke}
            title={commandLabel(command)}
            data-pdf-home-screenshot-menu-item={id}
            data-testid={`pdf-home-screenshot-${id}`}
            onSelect={() => command.onInvoke?.(null)}
          >
            <PdfHomeRibbonIcon name={icon} size={16} />
            <span>{command.displayLabel ?? command.label}</span>
          </DropdownMenuItem>
        ))}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * PDF-owned adapter for the WPS 6.8.2 Home command anatomy. Shared Office
 * primitives still own every group, row, stack, command and split face; this
 * adapter owns the five PDF-specific WPS segments and their command order.
 */
export default function PdfHomeCompactRibbon({
  commands,
  groupLabels,
  pageNavigation,
  pointerTools,
  trailing,
  layoutMenuLabel,
  onConvertMenuOpen,
  visible,
}: PdfHomeCompactRibbonProps) {
  if (!visible) {
    return null;
  }

  return (
    <>
      {pointerTools}

      <HomeGroup label={groupLabels.file} testId="pdf-home-file-tools">
        <>
          <div
            className={`pdf-home-segment-item ${styles.segment}`}
            data-testid="pdf-home-convert"
          >
            <HomeSplit
              controlId="convertPdf"
              testId="pdf-home-convert-split"
              trigger={
                <ConvertMenu
                  commands={commands}
                  label={groupLabels.convert}
                  heading={groupLabels.convertMenuHeading}
                  onOpen={onConvertMenuOpen}
                />
              }
            >
              <CommandSlot
                bare
                controlId="convertPdf"
                command={commands.convertPdf}
                icon="convertEditable"
                splitPart
              />
            </HomeSplit>
          </div>
          <div
            className={`pdf-home-segment-item ${styles.segment}`}
            data-testid="pdf-home-output-images"
          >
            <CommandSlot
              controlId="outputImages"
              command={commands.outputImages}
              icon="convertImage"
            />
          </div>
          <div
            className={`pdf-home-segment-item ${styles.segment}`}
            data-testid="pdf-home-split-merge-group"
          >
            <HomeSplit
              controlId="splitMerge"
              testId="pdf-home-split-merge-split"
              trigger={
                <SplitMergeMenu
                  commands={commands}
                  label={groupLabels.splitMerge}
                />
              }
            >
              <CommandSlot
                bare
                controlId="splitMerge"
                command={commands.splitMerge}
                icon="splitPages"
                splitPart
              />
            </HomeSplit>
          </div>
        </>
      </HomeGroup>

      <HomeGroup label={groupLabels.view} testId="pdf-home-reader-tools">
        <>
          <CommandSlot controlId="play" command={commands.play} icon="play" />
          <div
            role="group"
            aria-label={groupLabels.reading}
            data-testid="pdf-home-view-group"
          >
            {/* The zoom itself is the window's status-bar slider, as in
                Word; this stack keeps the fit and rotate commands, three
                above and two below, with no percentage box of its own. */}
            <OfficeHomeCommandStack className={`pdf-home-view-stack ${ribbonLayout.keepsWidth}`}>
              <OfficeHomeCommandRow className="pdf-home-fit-row">
                <CommandSlot
                  controlId="actualSize"
                  command={commands.actualSize}
                  icon="actualSize"
                  variant="icon"
                />
                <CommandSlot
                  controlId="fitPage"
                  command={commands.fitPage}
                  icon="fitPage"
                  variant="icon"
                />
                <CommandSlot
                  controlId="fitWidth"
                  command={commands.fitWidth}
                  icon="fitWidth"
                  variant="icon"
                />
              </OfficeHomeCommandRow>
              <OfficeHomeCommandRow className="pdf-home-rotate-row">
                <CommandSlot
                  controlId="rotateLeft"
                  command={commands.rotateLeft}
                  icon="rotateLeft"
                  variant="icon"
                />
                <CommandSlot
                  controlId="rotateRight"
                  command={commands.rotateRight}
                  icon="rotateRight"
                  variant="icon"
                />
              </OfficeHomeCommandRow>
            </OfficeHomeCommandStack>
          </div>
          <CommandSlot
            controlId="rotateDocument"
            command={commands.rotateDocument}
            icon="rotateDocument"
          />
          <div
            role="group"
            aria-label={groupLabels.pageView}
            data-testid="pdf-home-page-view-group"
          >
            <OfficeHomeCommandStack className={`pdf-home-page-view-stack ${ribbonLayout.keepsWidth}`}>
              <div
                className="pdf-home-page-navigation"
                role="group"
                aria-label={groupLabels.pageNavigation}
                data-testid="pdf-home-page-navigation"
              >
                <OfficeHomeCommandRow className="pdf-home-page-navigation-row">
                  <CommandSlot
                    controlId="pageFirst"
                    command={commands.pageFirst}
                    icon="firstPage"
                    variant="icon"
                  />
                  <CommandSlot
                    controlId="pagePrevious"
                    command={commands.pagePrevious}
                    icon="previousPage"
                    variant="icon"
                  />
                  <span
                    data-pdf-home-control="pageCurrent"
                    data-pdf-home-order={CONTROL_ORDER.get("pageCurrent")}
                    className={`pdf-home-page-field ${styles.pageField}`}
                    title={pageNavigation.countLabel}
                  >
                    {pageNavigation.label ? (
                      <span data-testid="pdf-page-document-label">
                        {pageNavigation.label}
                        <span aria-hidden="true">{" ("}</span>
                      </span>
                    ) : null}
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      aria-label={pageNavigation.inputLabel}
                      title={pageNavigation.inputLabel}
                      value={pageNavigation.value}
                      style={{
                        width: `calc(${Math.max(1, pageNavigation.value.length)}ch + 6px)`,
                      }}
                      onChange={(event) =>
                        pageNavigation.onValueChange(event.currentTarget.value)
                      }
                      onBlur={pageNavigation.onCommit}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          pageNavigation.onCancel();
                          event.currentTarget.select();
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          pageNavigation.onCommit();
                          event.currentTarget.blur();
                        }
                      }}
                      data-testid="pdf-page-input"
                    />
                    <span aria-hidden="true">/</span>
                    <span aria-hidden="true">{pageNavigation.total}</span>
                    {pageNavigation.label ? <span aria-hidden="true">)</span> : null}
                  </span>
                  <CommandSlot
                    controlId="pageNext"
                    command={commands.pageNext}
                    icon="nextPage"
                    variant="icon"
                  />
                  <CommandSlot
                    controlId="pageLast"
                    command={commands.pageLast}
                    icon="lastPage"
                    variant="icon"
                  />
                </OfficeHomeCommandRow>
              </div>
              <OfficeHomeCommandRow className="pdf-home-layout-row">
                <CommandSlot
                  controlId="singlePage"
                  command={commands.singlePage}
                  icon="singlePage"
                  slotClassName={styles.segment}
                  variant="compact"
                />
                <HomeSplit
                  className="pdf-home-layout-split"
                  controlId="doublePage"
                  large={false}
                  testId="pdf-home-double-page-split"
                  trigger={
                    <LayoutMenu commands={commands} label={layoutMenuLabel} />
                  }
                >
                  <CommandSlot
                    bare
                    controlId="doublePage"
                    command={commands.doublePage}
                    icon="doublePage"
                    splitPart
                    slotClassName={styles.segment}
                    variant="compact"
                  />
                </HomeSplit>
                <CommandSlot
                  controlId="continuousReading"
                  command={commands.continuousReading}
                  icon="continuousReading"
                  slotClassName={styles.segment}
                  variant="compact"
                />
              </OfficeHomeCommandRow>
            </OfficeHomeCommandStack>
          </div>
        </>
      </HomeGroup>

      <HomeGroup
        collapsedIcon={<Languages size={24} aria-hidden />}
        label={groupLabels.editing}
        testId="pdf-home-content-tools"
      >
        <>
          <div
            className={`pdf-home-segment-item ${styles.segment}`}
            role="group"
            aria-label={groupLabels.edit}
            data-testid="pdf-home-edit"
          >
            <CommandSlot
              controlId="editContent"
              command={commands.editContent}
              icon="editContent"
            />
          </div>
          {null}
          <div
            className={`pdf-home-segment-item pdf-home-utilities-row ${styles.segment}`}
            role="group"
            aria-label={groupLabels.utilities}
            data-testid="pdf-home-utilities"
          >
            <HomeSplit
              className="pdf-home-screenshot-split"
              controlId="screenshot"
              testId="pdf-home-screenshot-split"
              trigger={
                <ScreenshotMenu
                  commands={commands}
                  label={commands.screenshot.label}
                />
              }
            >
              <CommandSlot
                bare
                controlId="screenshot"
                command={commands.screenshot}
                icon="screenshot"
                splitPart
              />
            </HomeSplit>
            <CommandSlot
              controlId="compress"
              command={commands.compress}
              icon="compress"
            />
          </div>
        </>
      </HomeGroup>

      <HomeGroup
        collapsedIcon={<ShieldCheck size={24} aria-hidden />}
        label={groupLabels.security}
        testId="pdf-home-encryption-tools"
      >
        <CommandSlot
          controlId="documentEncrypt"
          command={commands.documentEncrypt}
          icon="documentEncrypt"
        />
        {commands.verifySignatures ? (
          <CommandSlot
            controlId="verifySignatures"
            command={commands.verifySignatures}
            icon="verifySignatures"
          />
        ) : null}
      </HomeGroup>
      {trailing}
    </>
  );
}
