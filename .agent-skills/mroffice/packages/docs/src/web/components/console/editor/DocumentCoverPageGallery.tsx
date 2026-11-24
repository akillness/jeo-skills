"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Editor } from "@tiptap/react";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuContent as DropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import galleryStyles from "@mrnote/core/web/components/office-ribbon/OfficeInsertGallery.module.css";
import {
  coverSceneFromDefinition,
  documentCoverDefinition,
  documentCoverGalleryOrder,
  documentCoverName,
} from "@mrnote/core/web/lib/document-cover-pages/coverPages.ts";

import { DocsInsertIcon } from "@mrnote/core/web/components/console/editor/DocumentInsertRibbonIcons.tsx";
import { DocumentCoverPageScene } from "./native-document/DocumentCoverPageScene";
import {
  applyDocumentCoverPage,
  canMutateDocumentCoverPage,
  currentDocumentCoverId,
  documentCoverPageContext,
  readDocumentCoverPageAuthority,
  removeDocumentCoverPage,
} from "./native-document/documentCoverPages";
import styles from "./DocumentCoverPageGallery.module.css";

export interface DocumentCoverPageGalleryProps {
  editor: Editor;
  onRememberSelection?: () => void;
}

/** Thumbnail width in CSS pixels; the height follows the page's shape. */
const THUMBNAIL_WIDTH_PX = 104;
/** The radio value a legacy (pre-gallery) MRNote cover reports. */
const LEGACY_COVER_VALUE = "legacy";

function RemoveCoverPageIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M4.5 2.5h7l4 4v11h-11zM11.5 2.5v4h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m7.2 10 5.6 5.6m0-5.6-5.6 5.6"
        fill="none"
        stroke="var(--console-danger, #c84a4a)"
        strokeLinecap="round"
      />
    </svg>
  );
}

const GALLERY_COLUMNS = 3;

function moveGalleryFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ].includes(event.key)
  ) {
    return;
  }
  const grid = event.currentTarget.closest("[data-cover-page-grid]");
  const items = grid
    ? Array.from(
        grid.querySelectorAll<HTMLElement>(
          "[data-cover-page-id]:not([data-disabled])",
        ),
      )
    : [];
  const index = items.indexOf(event.currentTarget);
  if (index < 0 || items.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  const step =
    event.key === "ArrowUp" || event.key === "ArrowDown" ? GALLERY_COLUMNS : 1;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, index - step)
          : Math.min(items.length - 1, index + step);
  items[nextIndex]?.focus();
}

function coverPageProjectionKey(editor: Editor): string {
  if (editor.isDestroyed) return "destroyed";
  const authority = readDocumentCoverPageAuthority(editor.state.doc);
  const authorityKey =
    authority.kind === "current"
      ? authority.format === "atom"
        ? `${authority.kind}:atom:${authority.controlId}:${authority.coverId ?? "imported"}:${authority.pos}`
        : `${authority.kind}:legacy:${authority.controlId}:${authority.preset}:${authority.wrapperPos}:${authority.pageBreakPos}`
      : authority.kind;
  return `${editor.isEditable ? "editable" : "readonly"}:${editor.view.dom.isConnected ? "connected" : "detached"}:${authorityKey}`;
}

/**
 * Word-style Insert > Pages > Cover Page gallery.
 *
 * This component owns only the popup/trigger projection. Every mutation is
 * delegated to the event-time live authority in documentCoverPages.ts.
 */
export function DocumentCoverPageGallery({
  editor,
  onRememberSelection,
}: DocumentCoverPageGalleryProps) {
  const t = useTranslations("console-notebooks");
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const projectionKeyRef = useRef(coverPageProjectionKey(editor));
  const editableRef = useRef(editor.isEditable);

  useEffect(() => {
    let active = true;
    let refreshScheduled = false;
    projectionKeyRef.current = coverPageProjectionKey(editor);
    editableRef.current = editor.isEditable;
    const scheduleProjectionRefresh = () => {
      if (refreshScheduled) return;
      refreshScheduled = true;
      queueMicrotask(() => {
        refreshScheduled = false;
        if (!active) return;
        const nextProjectionKey = coverPageProjectionKey(editor);
        if (nextProjectionKey === projectionKeyRef.current) return;
        projectionKeyRef.current = nextProjectionKey;
        refresh();
        if (openRef.current && !canMutateDocumentCoverPage(editor)) {
          openRef.current = false;
          setOpen(false);
        }
      });
    };
    const refreshFromTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean };
    }) => {
      const editableChanged = editableRef.current !== editor.isEditable;
      editableRef.current = editor.isEditable;
      if (!transaction.docChanged && !editableChanged) return;
      scheduleProjectionRefresh();
    };
    const refreshFromUpdate = () => scheduleProjectionRefresh();
    const refreshFromDestroy = () => scheduleProjectionRefresh();
    editor.on("transaction", refreshFromTransaction);
    editor.on("update", refreshFromUpdate);
    editor.on("destroy", refreshFromDestroy);
    return () => {
      active = false;
      refreshScheduled = false;
      editor.off("transaction", refreshFromTransaction);
      editor.off("update", refreshFromUpdate);
      editor.off("destroy", refreshFromDestroy);
    };
  }, [editor]);

  const authority = readDocumentCoverPageAuthority(editor.state.doc);
  const currentCoverId = currentDocumentCoverId(authority);
  // The gallery item the current cover is ("legacy" for a pre-gallery cover
  // and "" for none): drives the checked tile and the trigger's data-active.
  const currentPreset =
    authority.kind === "current"
      ? (currentCoverId ?? LEGACY_COVER_VALUE)
      : undefined;
  const disabled = !canMutateDocumentCoverPage(editor);
  const coverLabel = t("toolbar.coverPage");
  const locale = useLocale();

  const applyCover = (coverId: string) => {
    applyDocumentCoverPage(editor, coverId, { locale });
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && !canMutateDocumentCoverPage(editor)) return;
        setOpen(nextOpen);
        if (nextOpen) refresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* The Insert tab's shared large menu button (WordArt, Icons,
            Bookmark): a face and its disclosure rail. Word's Cover Page button
            is a menu, not a toggle, so a document that has a cover does not
            press it; the gallery's checked tile says which cover it is. */}
        <OfficeHomeMenuTrigger
          ref={triggerRef}
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          data-active={currentPreset ? "true" : undefined}
          disabled={disabled}
          hasMenuIndicator
          icon={<DocsInsertIcon name="coverPage" size={28} />}
          label={coverLabel}
          onPointerDown={onRememberSelection}
          testId="document-toolbar-ribbon-cover-page"
          variant="large"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        id={menuId}
        align="start"
        className={`docs-cupertino-menu ${galleryStyles.flyout} ${styles.flyout}`}
        data-testid="document-toolbar-cover-page-gallery"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <div
          className={`${galleryStyles.section} ${styles.section}`}
          data-testid="document-toolbar-cover-page-builtin"
        >
          <DropdownMenuLabel
            className={`${galleryStyles.sectionHeading} ${styles.sectionHeading}`}
          >
            {t("toolbar.coverPageBuiltIn")}
          </DropdownMenuLabel>
          {open ? (
            <CoverPageGalleryGrid
              editor={editor}
              locale={locale}
              currentValue={currentPreset ?? ""}
              disabled={disabled}
              onApply={applyCover}
            />
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <div className="docs-home-gallery-menu__footer">
          <DropdownMenuItem
            className="docs-cupertino-menu__primary-item"
            data-testid="document-toolbar-cover-remove-current"
            disabled={disabled || authority.kind !== "current"}
            onSelect={() => removeDocumentCoverPage(editor)}
          >
            <RemoveCoverPageIcon />
            <span>{t("toolbar.coverPageRemoveCurrent")}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Word's seventeen built-in covers, three to a row, each a thumbnail of the
 * page the insert command would put in THIS document (its page size, theme
 * palette and property values) with its name below.
 */
function CoverPageGalleryGrid({
  editor,
  locale,
  currentValue,
  disabled,
  onApply,
}: {
  editor: Editor;
  locale: string;
  currentValue: string;
  disabled: boolean;
  onApply: (coverId: string) => void;
}) {
  const attrs = editor.state.doc.attrs as Record<string, unknown>;
  const contextKey = JSON.stringify([
    attrs.pageSize,
    attrs.pageOrientation,
    attrs.customPageSize,
    attrs.designColorSet,
    attrs.documentThemeColors,
    attrs.documentMetadata,
    attrs.defaultFontFamily,
  ]);
  const context = useMemo(
    () => documentCoverPageContext(attrs),
    // The key names every attr the context reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey],
  );
  const order = documentCoverGalleryOrder(locale);
  const scale = THUMBNAIL_WIDTH_PX / context.page.widthEmu;
  return (
    <DropdownMenuRadioGroup value={currentValue}>
      <div
        className={`${galleryStyles.grid} ${styles.grid}`}
        data-cover-page-grid="true"
      >
        {order.map((coverId) => {
          const definition = documentCoverDefinition(coverId);
          if (!definition) return null;
          const name = documentCoverName(coverId, locale);
          const scene = coverSceneFromDefinition(
            definition,
            context.page,
            context.theme,
            locale,
          );
          return (
            <DropdownMenuRadioItem
              key={coverId}
              value={coverId}
              className={`${galleryStyles.card} ${styles.card}${currentValue === coverId ? ` ${galleryStyles.selected}` : ""}`}
              data-testid={`document-toolbar-cover-${coverId}`}
              data-cover-page-id={coverId}
              disabled={disabled}
              aria-label={name}
              title={name}
              onKeyDown={moveGalleryFocus}
              onSelect={() => onApply(coverId)}
            >
              <span className={styles.preview} data-cover-page-thumbnail={coverId}>
                <DocumentCoverPageScene
                  scene={scene}
                  values={context.values}
                  scale={scale}
                  fontFamily={context.fontFamily}
                />
              </span>
              <span className={styles.label}>{name}</span>
            </DropdownMenuRadioItem>
          );
        })}
      </div>
    </DropdownMenuRadioGroup>
  );
}

export default DocumentCoverPageGallery;
