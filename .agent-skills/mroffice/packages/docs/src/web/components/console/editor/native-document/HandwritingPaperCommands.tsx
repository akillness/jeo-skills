"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { OfficeHomeCommand, OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  HANDWRITING_PAPER_CATEGORIES,
  HANDWRITING_PAPER_COLOR_IDS,
  handwritingPaperColors,
  handwritingPaperDataUrl,
  normalizeHandwritingDocument,
  type HandwritingDocumentSetting,
  type HandwritingPaperColorId,
  type HandwritingPaperId,
} from "@mrnote/core/web/lib/handwriting-paper.ts";
import { DocsInsertIcon } from "@mrnote/core/web/components/console/editor/DocumentInsertRibbonIcons.tsx";
import {
  insertHandwritingPageAfter,
  deleteHandwritingPage,
  handwritingPageDeleteRefusal,
  handwritingPageInView,
  handwritingPages,
} from "./handwritingDocument";
import styles from "./HandwritingPaperCommands.module.css";

/** Insert > Pictures' entries a handwriting document's Draw tab offers (the toolbar's own). */
export interface HandwritingPictureSources {
  readonly fromDevice: () => void;
  readonly screenshot?: () => void;
  readonly aiPicture?: () => void;
  readonly busy?: boolean;
}

/** How long Add Page waits for the pages to be laid out before it shows the new one. */
const ADD_PAGE_LAYOUT_WAIT_MS = 2000;

/** A thumbnail's page: a portrait sheet, the paper's own proportions. */
const THUMB_MM = { width: 148, height: 210 };

function readSetting(editor: Editor): HandwritingDocumentSetting | null {
  return editor.isDestroyed ? null : normalizeHandwritingDocument(editor.state.doc.attrs.handwritingDocument);
}

/**
 * The document's handwriting setting as it stands. The paper a collaborator
 * (or Undo) picks shows on the ribbon too: the setting is read back whenever
 * a change reaches the editor. The root attribute keeps its identity until
 * it is set again, so a stroke landing costs one comparison (the cover's
 * picture is never re-read). `enabled` false (not a handwriting document)
 * listens to nothing.
 */
export function useHandwritingSetting(
  editor: Editor,
  enabled = true,
): [HandwritingDocumentSetting | null, (next: HandwritingDocumentSetting | null) => void] {
  const [setting, setSetting] = useState(() => (enabled ? readSetting(editor) : null));
  useEffect(() => {
    if (!enabled) return;
    let seen: unknown = undefined;
    const sync = () => {
      const raw = editor.isDestroyed ? null : editor.state.doc.attrs.handwritingDocument;
      if (raw === seen) return;
      seen = raw;
      setSetting(readSetting(editor));
    };
    sync();
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) sync();
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor, enabled]);
  return [enabled ? setting : null, setSetting];
}

function PaperGlyph({ paper, color }: { paper: string; color: HandwritingPaperColorId }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a drawn data URL
    <img
      className={styles.glyph}
      src={handwritingPaperDataUrl(paper, color, THUMB_MM.width, THUMB_MM.height, THUMB_MM.width / 70)}
      alt=""
      draggable={false}
    />
  );
}

/**
 * A handwriting document's own Draw-tab commands (its only ribbon): Paper,
 * a gallery of the document's papers and paper colours that changes every
 * page at once, and Add Page, a new page of the same paper after the last.
 */
export function HandwritingPaperCommands({
  editor,
  disabledReason,
  pictures,
}: {
  editor: Editor;
  disabledReason?: string;
  pictures?: HandwritingPictureSources;
}) {
  const t = useTranslations("console-notebooks");
  const [setting, setSetting] = useHandwritingSetting(editor);
  const disabled = Boolean(disabledReason);
  const shown = setting ?? readSetting(editor);

  const apply = (patch: Partial<Pick<HandwritingDocumentSetting, "paper" | "paperColor">>) => {
    const current = readSetting(editor);
    if (!current) return;
    const next = { ...current, ...patch };
    if (editor.chain().setHandwritingDocument(next).run()) setSetting(next);
  };

  // Add Page: after the page in the middle of the window (Delete Page's
  // page), so a page goes in where the reader is, not always at the end.
  const appendPage = () => {
    if (editor.isDestroyed || !editor.isEditable) return;
    const added = insertHandwritingPageAfter(editor, handwritingPageInView(editor.view));
    if (added === null) return;
    // The new page in view, where the pen is about to write -- once the
    // pages are laid out to hold it: the next frame's sheets were often the
    // old ones (the paginator splits a page a frame or more later), and the
    // view went to the page before, or stayed where it was.
    const pages = handwritingPages(editor.state.doc).length;
    const startedAt = performance.now();
    const scrollToAdded = () => {
      if (editor.isDestroyed) return;
      const sheets = editor.view.dom.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]");
      if (sheets.length < pages && performance.now() - startedAt < ADD_PAGE_LAYOUT_WAIT_MS) {
        requestAnimationFrame(scrollToAdded);
        return;
      }
      sheets[Math.min(added, sheets.length - 1)]?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    requestAnimationFrame(scrollToAdded);
  };

  // Delete Page: the page in the middle of the window, never the cover and
  // never the last page of paper (Undo brings it back).
  const deletePage = () => {
    if (editor.isDestroyed || !editor.isEditable) return;
    const index = handwritingPageInView(editor.view);
    if (index === null) return;
    const refusal = handwritingPageDeleteRefusal(editor.state.doc, index);
    if (refusal === "cover" || refusal === "last") {
      toast({ description: t(refusal === "cover" ? "handwriting.toolbar.coverKept" : "handwriting.toolbar.lastPageKept") });
      return;
    }
    deleteHandwritingPage(editor, index);
  };

  return (
    <>
      <DropdownMenu modal={false} onOpenChange={(open) => (open ? setSetting(readSetting(editor)) : undefined)}>
        <DropdownMenuTrigger asChild>
          <OfficeHomeMenuTrigger
            controlId="draw.handwritingPaper"
            variant="large"
            disabled={disabled || !shown}
            disabledReason={disabledReason}
            icon={
              shown ? (
                <PaperGlyph paper={shown.paper} color={shown.paperColor} />
              ) : (
                <DocsInsertIcon name="blankPage" size={24} />
              )
            }
            displayLabel={t("handwriting.toolbar.paper")}
            label={t("handwriting.toolbar.changePaper")}
            testId="document-toolbar-ribbon-draw-handwriting-paper"
          />
        </DropdownMenuTrigger>
        <RibbonDropdownMenuContent
          align="start"
          sideOffset={6}
          className={styles.menu}
          data-testid="document-toolbar-handwriting-paper-menu"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className={styles.colors} role="radiogroup" aria-label={t("handwriting.dialog.paperColor")}>
            <span className={styles.heading}>{t("handwriting.dialog.paperColor")}</span>
            {HANDWRITING_PAPER_COLOR_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={shown?.paperColor === id}
                aria-label={t(`handwriting.colors.${id}`)}
                title={t(`handwriting.colors.${id}`)}
                className={styles.swatch}
                style={{
                  background: handwritingPaperColors(id).paper,
                  borderColor: handwritingPaperColors(id).strong,
                }}
                onClick={() => apply({ paperColor: id })}
                data-testid={`document-toolbar-handwriting-color-${id}`}
              />
            ))}
          </div>
          {HANDWRITING_PAPER_CATEGORIES.map((category) => (
            <section key={category.id} className={styles.category}>
              <span className={styles.heading}>{t(`handwriting.categories.${category.id}`)}</span>
              <div className={styles.tiles} role="radiogroup" aria-label={t(`handwriting.categories.${category.id}`)}>
                {category.papers.map((id: HandwritingPaperId) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={shown?.paper === id}
                    className={styles.tile}
                    onClick={() => apply({ paper: id })}
                    data-testid={`document-toolbar-handwriting-paper-${id}`}
                  >
                    <PaperGlyph paper={id} color={shown?.paperColor ?? "white"} />
                    <span className={styles.name}>{t(`handwriting.papers.${id}`)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </RibbonDropdownMenuContent>
      </DropdownMenu>
      <OfficeHomeCommand
        controlId="draw.handwritingAddPage"
        variant="large"
        disabled={disabled}
        disabledReason={disabledReason}
        icon={<DocsInsertIcon name="blankPage" size={24} />}
        label={t("handwriting.toolbar.addPage")}
        onClick={appendPage}
        testId="document-toolbar-ribbon-draw-handwriting-add-page"
      />
      <OfficeHomeCommand
        controlId="draw.handwritingDeletePage"
        variant="large"
        disabled={disabled}
        disabledReason={disabledReason}
        icon={<OfficeSemanticIcon semanticId="edit.delete" size={24} />}
        label={t("handwriting.toolbar.deletePage")}
        onClick={deletePage}
        testId="document-toolbar-ribbon-draw-handwriting-delete-page"
      />
      {pictures ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <OfficeHomeMenuTrigger
              controlId="draw.handwritingPictures"
              variant="large"
              disabled={disabled || pictures.busy}
              disabledReason={disabledReason}
              icon={<DocsInsertIcon name="pictures" size={24} />}
              displayLabel={t("toolbar.insertImage")}
              label={t("toolbar.insertImage")}
              testId="document-toolbar-ribbon-draw-handwriting-pictures"
            />
          </DropdownMenuTrigger>
          <RibbonDropdownMenuContent
            align="start"
            sideOffset={6}
            className="note-editor-toolbar-menu docs-insert-menu"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuItem
              data-testid="document-toolbar-handwriting-picture-device"
              onSelect={pictures.fromDevice}
            >
              <DocsInsertIcon name="pictures" size={18} />
              {t("toolbar.pictureFromDevice")}
            </DropdownMenuItem>
            {pictures.screenshot ? (
              <DropdownMenuItem
                data-testid="document-toolbar-handwriting-picture-screenshot"
                onSelect={pictures.screenshot}
              >
                <DocsInsertIcon name="screenshot" size={18} />
                {t("toolbar.screenshot")}
              </DropdownMenuItem>
            ) : null}
            {pictures.aiPicture ? (
              null
            ) : null}
          </RibbonDropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
