"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { OfficeWordArtInsertGallery } from "@mrnote/core/web/components/office-ribbon/OfficeWordArtStyleGallery.tsx";
import { Fragment, type ReactNode, type RefObject, useRef } from "react";

import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";

import {
  PdfInsertRibbonIcon,
  type PdfInsertRibbonIconName,
} from "./PdfInsertRibbonIcons";
import { OfficeHomeCommandStack } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import PresentationTableInsertPicker from "@mrnote/slides/web/lib/presentation/TableInsertPicker.tsx";
import { PdfInsertChartCommand } from "./PdfInsertChartCommand";
import { PdfInsertSmartArtCommand } from "./PdfInsertSmartArtCommand";
import PdfRibbonButton from "./PdfRibbonButton";
import { PdfSurfaceRibbonGroup } from "./PdfSurfaceRibbon";
import styles from "./PdfInsertRibbonTab.module.css";
import ribbonLayout from "./pdfRibbonLayout.module.css";

export interface PdfInsertRibbonCommand {
  active?: boolean;
  busy?: boolean;
  controlId?: string;
  disabled?: boolean;
  disabledReason?: string;
  displayLabel?: string;
  expanded?: boolean;
  icon: PdfInsertRibbonIconName;
  label: string;
  menuControlId?: string;
  onInvoke?: (
    trigger: HTMLButtonElement | null,
    resolveTrigger?: () => HTMLButtonElement | null,
  ) => void;
  popup?: "dialog" | "menu";
  testId: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export interface PdfInsertPageCommands {
  insertBlank?: PdfInsertRibbonCommand;
  /** 开始 / 页面 「旋转文档」 when the host composes the turn itself. */
  rotateDocument?: PdfInsertRibbonCommand;
  secondary: readonly PdfInsertRibbonCommand[];
}

export interface PdfPageRibbonCommand extends PdfInsertRibbonCommand {
  /** Canonical secondary choices rendered in the shared Cupertino menu. */
  menu?: ReactNode;
  menuLabel?: string;
}

interface PdfInsertRibbonTabProps {
  comments: {
    more: PdfInsertRibbonCommand;
    moreItems: readonly PdfInsertRibbonCommand[];
    textComment?: PdfInsertRibbonCommand;
  };
  content: {
    image?: PdfInsertRibbonCommand;
    link?: PdfInsertRibbonCommand;
    stamp?: PdfInsertRibbonCommand;
    text?: PdfInsertRibbonCommand;
    /** 公式 (ONLYOFFICE's and Word's Insert › Equation): a text box set as
     * a formula, its source editor open. */
    equation?: PdfInsertRibbonCommand;
    /** 艺术字 (Word's, PowerPoint's and ONLYOFFICE's Insert › WordArt): the
     * Office gallery; a pick arms the text tool with that style. */
    wordArt?: PdfInsertRibbonCommand & { readonly onPick: (recipeId: string) => void };
    /** 表格 (Word's, PowerPoint's and ONLYOFFICE's Insert › Table): the
     * grid and Insert Table dialog; a size arms placement on the page. */
    table?: Omit<PdfInsertRibbonCommand, "icon"> & { readonly onInsertTable: (rows: number, columns: number) => boolean };
    /** 图表 (Office's Insert Chart): the gallery and All Charts; a pick arms
     * placement on the page. */
    chart?: { readonly disabled: boolean; readonly onPick: (family: string, subtype: string) => void };
    /** 智能图形: a layout of the Office gallery, placed where the page is pressed. */
    smartArt?: { readonly active?: boolean; readonly disabled: boolean; readonly onPick: (layoutId: string) => void };
    visualMask?: PdfInsertRibbonCommand;
  };
  decoration: {
    background: PdfInsertRibbonCommand;
    headerFooter: PdfInsertRibbonCommand;
    headerFooterItems: readonly PdfInsertRibbonCommand[];
    pageNumber: PdfInsertRibbonCommand;
    pageNumberItems?: readonly PdfInsertRibbonCommand[];
    panel?: ReactNode;
    watermark: PdfInsertRibbonCommand;
    watermarkItems: readonly PdfInsertRibbonCommand[];
  };
  groupLabels: {
    comments: string;
    content: string;
    decoration: string;
    pages: string;
    pageFiles?: string;
    pageNavigation?: string;
    pageRotate?: string;
    signatureDraw?: string;
  };
  pages: PdfInsertPageCommands & {
    bookmark?: PdfInsertRibbonCommand;
    organize?: PdfInsertRibbonCommand;
  };
  pointerTools: ReactNode;
  pageTab?: {
    files: readonly PdfPageRibbonCommand[];
    navigation: ReactNode;
    rotate: readonly PdfPageRibbonCommand[];
    structure: readonly PdfPageRibbonCommand[];
    /** Duplicate, move and rotate the current page: the page tools the
     *  retired "more" menu held. */
    extra?: { label: string; commands: readonly PdfPageRibbonCommand[] };
  };
  signatureDraw: {
    draw?: PdfInsertRibbonCommand;
    signature?: PdfInsertRibbonCommand;
    signatureItems?: readonly PdfInsertRibbonCommand[];
  };
}

function LargeMenuCommand({
  command,
  order,
}: {
  command: PdfPageRibbonCommand;
  order: string;
}) {
  const internalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = command.triggerRef ?? internalTriggerRef;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          ref={triggerRef}
          active={command.active}
          aria-busy={command.busy || undefined}
          disabled={Boolean(command.disabled || command.busy)}
          displayLabel={command.displayLabel ?? command.label}
          hasMenuIndicator
          icon={<CommandIcon command={command} size={24} />}
          label={commandTitle(command)}
          testId={command.testId}
          variant="large"
          data-pdf-page-order={order}
          data-disabled-reason={
            command.disabled ? command.disabledReason : undefined
          }
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        sideOffset={5}
        className={styles.menuContent}
        aria-label={command.menuLabel ?? command.label}
        data-testid={`${command.testId}-menu-content`}
      >
        {command.menu}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function PageCommand({
  command,
  order,
}: {
  command: PdfPageRibbonCommand;
  order: string;
}) {
  return command.menu ? (
    <LargeMenuCommand command={command} order={order} />
  ) : (
    <LargeCommand command={command} order={order} />
  );
}

function commandDisabled(command: PdfInsertRibbonCommand): boolean {
  return Boolean(command.disabled || command.busy || !command.onInvoke);
}

function commandTitle(command: PdfInsertRibbonCommand): string {
  if (commandDisabled(command) && command.disabledReason) {
    return `${command.label} — ${command.disabledReason}`;
  }
  return command.label;
}

function CommandIcon({
  command,
  size,
}: {
  command: PdfInsertRibbonCommand;
  size: number;
}) {
  return (
    <span className={styles.iconSlot} aria-hidden="true">
      <PdfInsertRibbonIcon name={command.icon} size={size} />
      {command.busy ? <span className={styles.busySpinner} /> : null}
    </span>
  );
}

function ExtraPageCommand({ command }: { command: PdfPageRibbonCommand }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <PdfRibbonButton
      active={command.active}
      aria-busy={command.busy || undefined}
      aria-haspopup={command.popup}
      big={false}
      buttonRef={triggerRef}
      captioned
      data-disabled-reason={
        commandDisabled(command) ? command.disabledReason : undefined
      }
      disabled={commandDisabled(command)}
      displayLabel={command.displayLabel ?? command.label}
      label={commandTitle(command)}
      onClick={() =>
        command.onInvoke?.(triggerRef.current, () => triggerRef.current)
      }
      testId={`${command.testId}-overflow-item`}
    >
      <span className={styles.laneIconSlot} aria-hidden="true">
        <PdfInsertRibbonIcon name={command.icon} size={18} />
        {command.busy ? <span className={styles.busySpinner} /> : null}
      </span>
    </PdfRibbonButton>
  );
}

export function PdfPageToolsOverflow({
  commands,
  label,
}: {
  commands: readonly PdfPageRibbonCommand[];
  label: string;
}) {
  return (
    <span
      className="contents"
      role="group"
      aria-label={label}
      data-testid="pdf-global-page-tools"
    >
      {Array.from({ length: Math.ceil(commands.length / 3) }, (_, lane) => (
        <OfficeHomeCommandStack key={lane} rows={3} className={ribbonLayout.keepsWidth}>
          {commands.slice(lane * 3, lane * 3 + 3).map((command) => (
            <ExtraPageCommand key={command.testId} command={command} />
          ))}
        </OfficeHomeCommandStack>
      ))}
    </span>
  );
}

function LargeCommand({
  command,
  order,
}: {
  command: PdfInsertRibbonCommand;
  order: string;
}) {
  const internalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = command.triggerRef ?? internalTriggerRef;
  return (
    <PdfRibbonButton
      active={command.active}
      aria-busy={command.busy || undefined}
      aria-expanded={command.expanded}
      aria-haspopup={command.popup}
      buttonRef={triggerRef}
      data-control-id={command.controlId}
      data-disabled-reason={
        commandDisabled(command) ? command.disabledReason : undefined
      }
      data-pdf-insert-order={order}
      disabled={commandDisabled(command)}
      displayLabel={command.displayLabel ?? command.label}
      label={commandTitle(command)}
      onClick={() =>
        command.onInvoke?.(triggerRef.current, () => triggerRef.current)
      }
      testId={command.testId}
    >
      <CommandIcon command={command} size={24} />
    </PdfRibbonButton>
  );
}

function CommandMenuItem({
  command,
  resolveMenuTrigger,
}: {
  command: PdfInsertRibbonCommand;
  resolveMenuTrigger: () => HTMLButtonElement | null;
}) {
  return (
    <DropdownMenuItem
      aria-label={commandTitle(command)}
      disabled={commandDisabled(command)}
      title={commandTitle(command)}
      data-testid={command.testId}
      onSelect={() =>
        command.onInvoke?.(resolveMenuTrigger(), resolveMenuTrigger)
      }
    >
      <PdfInsertRibbonIcon name={command.icon} size={16} />
      <span>{command.displayLabel ?? command.label}</span>
    </DropdownMenuItem>
  );
}

function LargeMenuItemsCommand({
  command,
  menuItems,
  order,
  separatorAfterFirst = false,
}: {
  command: PdfInsertRibbonCommand;
  menuItems: readonly PdfInsertRibbonCommand[];
  order: string;
  separatorAfterFirst?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const disabled = Boolean(
    command.disabled || command.busy || !menuItems.length,
  );
  const label =
    disabled && command.disabledReason
      ? `${command.label} — ${command.disabledReason}`
      : command.label;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          ref={triggerRef}
          active={command.active}
          aria-busy={command.busy || undefined}
          controlId={command.controlId}
          data-pdf-insert-order={order}
          disabled={disabled}
          // The caption stays the command's own label; the reason a
          // disabled command cannot act reaches only its accessible name
          // and title (the Page tab's "导入页面" caption used to carry the
          // whole reason and stretch the command to 390px).
          displayLabel={command.displayLabel ?? command.label}
          hasMenuIndicator
          icon={<CommandIcon command={command} size={24} />}
          label={label}
          testId={command.testId}
          variant="large"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        aria-label={command.label}
        className={styles.menuContent}
        data-testid={`${command.testId}-menu-content`}
        sideOffset={5}
      >
        {menuItems.map((item, index) => (
          <Fragment key={item.testId}>
            <CommandMenuItem
              command={item}
              resolveMenuTrigger={() => triggerRef.current}
            />
            {separatorAfterFirst && index === 0 ? (
              <DropdownMenuSeparator />
            ) : null}
          </Fragment>
        ))}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/** 艺术字: the Office WordArt gallery (twenty "Aa" tiles, five to a row). */
function LargeWordArtCommand({
  command,
  order,
}: {
  command: PdfInsertRibbonCommand & { readonly onPick: (recipeId: string) => void };
  order: string;
}) {
  // Its command is the pick (onPick), not a click on the button.
  const disabled = Boolean(command.disabled || command.busy);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          active={command.active}
          controlId={command.controlId}
          data-pdf-insert-order={order}
          disabled={disabled}
          displayLabel={command.displayLabel ?? command.label}
          hasMenuIndicator
          icon={<CommandIcon command={command} size={24} />}
          label={commandTitle(command)}
          testId={command.testId}
          variant="large"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        aria-label={command.label}
        data-testid={`${command.testId}-menu-content`}
        sideOffset={5}
      >
        <OfficeWordArtInsertGallery
          disabled={disabled}
          onSelect={(recipe) => command.onPick(recipe.id)}
          testIdPrefix={command.testId}
        />
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function InsertGroup({
  children,
  label,
  tabs = "insert",
  testId,
}: {
  children: ReactNode;
  label: string;
  tabs?: string;
  testId: string;
}) {
  return (
    <PdfSurfaceRibbonGroup label={label} tab={tabs} testId={testId}>
      {children}
    </PdfSurfaceRibbonGroup>
  );
}

/** PDF-owned command adapter over the shared 100px Office Insert surface. */
export default function PdfInsertRibbonTab({
  comments,
  content,
  decoration,
  groupLabels,
  pages,
  pointerTools,
  pageTab,
  signatureDraw,
}: PdfInsertRibbonTabProps) {
  const pageMenuItems = [pages.insertBlank, ...pages.secondary].filter(
    (command): command is PdfInsertRibbonCommand => Boolean(command),
  );
  const pageMenuDisabled =
    pageMenuItems.length > 0 && pageMenuItems.every(commandDisabled);
  const pageMenuCommand: PdfInsertRibbonCommand = {
    disabled: pageMenuDisabled,
    disabledReason: pageMenuDisabled
      ? pageMenuItems.find((command) => command.disabledReason)?.disabledReason
      : undefined,
    icon: "blankPage",
    label: groupLabels.pages,
    testId: "pdf-insert-page-menu",
  };
  return (
    <>
      {pointerTools}

      <InsertGroup
        label={groupLabels.pages}
        tabs="insert"
        testId="pdf-insert-page-decoration-group"
      >
        {pageMenuItems.length ? (
          <LargeMenuItemsCommand
            command={pageMenuCommand}
            menuItems={pageMenuItems}
            order="02.01"
            separatorAfterFirst
          />
        ) : null}
        <LargeMenuItemsCommand
          command={decoration.watermark}
          menuItems={decoration.watermarkItems}
          order="02.02"
        />
        {decoration.pageNumberItems?.length ? (
          <LargeMenuItemsCommand
            command={decoration.pageNumber}
            menuItems={decoration.pageNumberItems}
            order="02.03"
          />
        ) : (
          <LargeCommand command={decoration.pageNumber} order="02.03" />
        )}
        <LargeMenuItemsCommand
          command={decoration.headerFooter}
          menuItems={decoration.headerFooterItems}
          order="02.04"
        />
      </InsertGroup>
      {decoration.panel}

      {pageTab ? (
        <InsertGroup
          label={groupLabels.pages}
          tabs="page"
          testId="pdf-page-structure-group"
        >
          {pageTab.structure.map((command, index) => (
            <PageCommand
              key={command.testId}
              command={command}
              order={`01.${String(index + 1).padStart(2, "0")}`}
            />
          ))}
        </InsertGroup>
      ) : null}

      {pageTab ? (
        <>
          <InsertGroup
            label={groupLabels.pageFiles ?? groupLabels.pages}
            tabs="page"
            testId="pdf-page-files-group"
          >
            {pageTab.files.map((command, index) => (
              <PageCommand
                key={command.testId}
                command={command}
                order={`02.${String(index + 1).padStart(2, "0")}`}
              />
            ))}
          </InsertGroup>
          <InsertGroup
            label={groupLabels.pageNavigation ?? groupLabels.pages}
            tabs="page"
            testId="pdf-page-navigation-group"
          >
            {pageTab.navigation}
          </InsertGroup>
          <InsertGroup
            label={groupLabels.pageRotate ?? groupLabels.pages}
            tabs="page"
            testId="pdf-page-rotate-group"
          >
            {pageTab.rotate.map((command, index) => (
              <PageCommand
                key={command.testId}
                command={command}
                order={`04.${String(index + 1).padStart(2, "0")}`}
              />
            ))}
          </InsertGroup>
          {pageTab.extra ? (
            <InsertGroup
              label={pageTab.extra.label}
              tabs="page"
              testId="pdf-page-extra-tools-group"
            >
              <PdfPageToolsOverflow
                commands={pageTab.extra.commands}
                label={pageTab.extra.label}
              />
            </InsertGroup>
          ) : null}
        </>
      ) : null}

      {content.table || content.chart || content.text || content.equation || content.wordArt || content.image || signatureDraw.signature || content.stamp ? (
        <InsertGroup
          label={groupLabels.content}
          testId="pdf-insert-content-group"
        >
          {content.table ? (
            <span data-pdf-insert-order="04.005" style={{ display: "contents" }}>
              <PresentationTableInsertPicker
                label={content.table.label}
                disabled={Boolean(content.table.disabled || content.table.busy)}
                onInsert={content.table.onInsertTable}
                testId={content.table.testId}
                controlId="PDFCTL.RIBBON.INSERT.TABLE"
              />
            </span>
          ) : null}
          {content.chart ? (
            <span data-pdf-insert-order="04.006" style={{ display: "contents" }}>
              <PdfInsertChartCommand disabled={content.chart.disabled} onPick={content.chart.onPick} />
            </span>
          ) : null}
          {content.smartArt ? (
            <span data-pdf-insert-order="04.007" style={{ display: "contents" }}>
              <PdfInsertSmartArtCommand active={content.smartArt.active} disabled={content.smartArt.disabled}
                onPick={content.smartArt.onPick} />
            </span>
          ) : null}
          {content.text ? (
            <LargeCommand command={content.text} order="04.01" />
          ) : null}
          {content.equation ? (
            <LargeCommand command={content.equation} order="04.015" />
          ) : null}
          {content.wordArt ? (
            <LargeWordArtCommand command={content.wordArt} order="04.017" />
          ) : null}
          {content.image ? (
            <LargeCommand command={content.image} order="04.02" />
          ) : null}
          {signatureDraw.signature ? (
            signatureDraw.signatureItems?.length ? (
              <LargeMenuItemsCommand
                command={signatureDraw.signature}
                menuItems={signatureDraw.signatureItems}
                order="04.03"
              />
            ) : (
              <LargeCommand command={signatureDraw.signature} order="04.03" />
            )
          ) : null}
          {content.stamp ? (
            <LargeCommand command={content.stamp} order="04.04" />
          ) : null}
        </InsertGroup>
      ) : null}

      {/* WPS CT_Insertion RB_InsertTextMarks: Graffiti, Text Comment, More. */}
      <InsertGroup
        label={groupLabels.comments}
        testId="pdf-insert-comments-group"
      >
        {signatureDraw.draw ? (
          <LargeCommand command={signatureDraw.draw} order="05.01" />
        ) : null}
        {comments.textComment ? (
          <LargeCommand command={comments.textComment} order="06.01" />
        ) : null}
        {comments.moreItems.length ? (
          <LargeMenuItemsCommand
            command={comments.more}
            menuItems={comments.moreItems}
            order="06.02"
          />
        ) : (
          <LargeCommand command={comments.more} order="06.02" />
        )}
      </InsertGroup>
    </>
  );
}
