/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Export menu in the title bar row of the ribbon.
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { OfficeRailButton } from "@mrnote/core/web/components/office-ribbon/OfficeEditorActionRail.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { RibbonDropdownMenuContent as DropdownMenuContent, RibbonMenuRichRow } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { RefObject } from "react";
import type { PageExportFormat } from "@mrnote/core/web/lib/page-export.ts";

/** The window bindings this reads, passed through unchanged. */
export interface BuildRibbonExportMenuCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  slides: SlideModel[];
  serverExporting: boolean;
  serverExportTriggerRef: RefObject<HTMLButtonElement | null>;
  runServerExport: (format: PageExportFormat, layout?: string) => Promise<void>;
  handoutExportLayout: string;
  /** The current slide as a picture: PNG (the default), JPEG, TIFF or BMP. */
  exportSlideAsImage: (format?: "png" | "jpeg" | "tiff" | "bmp") => Promise<void>;
  exportDeckAsHtml: () => Promise<void>;
  /** File > Export > Create a Video / Create an Animated GIF. */
  openVideoExport: (format: "mp4" | "gif") => void;
  /** Save as PDF's Options (Publish what, Include hidden slides): the
   * PDF Options dialog, which exports when confirmed. */
  openPdfOptions: () => void;
}

export function buildRibbonExportMenu(ctl: BuildRibbonExportMenuCtl) {
  const {
    t,
    slides,
    serverExporting,
    serverExportTriggerRef,
    runServerExport,
    handoutExportLayout,
    exportSlideAsImage,
    exportDeckAsHtml,
    openVideoExport,
    openPdfOptions,
  } = ctl;
  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <OfficeRailButton
            ref={serverExportTriggerRef}
            menu
            label={t("presentation.export")}
            icon={<OfficeSemanticIcon semanticId="file.export" size={18} />}
            disabled={serverExporting}
            testId="presentation-export-menu"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="docs-cupertino-menu--described note-editor-export-menu"
        >
          {/* The sheet's Export menu shape: a heading, then a described row
              per file (glyph, plain name, one line on what it holds, the
              extension as a badge); the slide image and the print settings
              sit in their own sections. */}
          <DropdownMenuLabel className="docs-cupertino-menu__heading">
            {t("presentation.exportMenu.heading")}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="PPTX"
            onSelect={() => void runServerExport("pptx")}
            data-testid="presentation-export-pptx"
          >
            <RibbonMenuRichRow
              fileType="slides"
              hoverScene
              title={t("presentation.exportMenu.pptxTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.pptxDetail")
              }
              badge="PPTX"
            />
          </DropdownMenuItem>
          {/* PowerPoint's Save As PowerPoint Show: the deck opens straight into the slide show (a .ppsm when it holds macros). */}
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="PPSX"
            onSelect={() => void runServerExport("ppsx")}
            data-testid="presentation-export-ppsx"
          >
            <RibbonMenuRichRow
              fileType="slides"
              hoverScene
              title={t("presentation.exportMenu.ppsxTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.ppsxDetail")
              }
              badge="PPSX"
            />
          </DropdownMenuItem>
          {/* PowerPoint's Save As PowerPoint Design Template: a template new presentations are made from (a .potm when it holds macros). */}
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="POTX"
            onSelect={() => void runServerExport("potx")}
            data-testid="presentation-export-potx"
          >
            <RibbonMenuRichRow
              fileType="slides"
              hoverScene
              title={t("presentation.exportMenu.potxTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.potxDetail")
              }
              badge="POTX"
            />
          </DropdownMenuItem>
          {/* PowerPoint 97-2003 Presentation; what that format cannot keep is said here and, for this deck, asked before it is written. */}
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="PPT"
            onSelect={() => void runServerExport("ppt")}
            data-testid="presentation-export-ppt"
          >
            <RibbonMenuRichRow
              fileType="slides"
              hoverScene
              title={t("presentation.exportMenu.pptTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.pptDetail")
              }
              badge="PPT"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="ODP"
            onSelect={() => void runServerExport("odp")}
            data-testid="presentation-export-odp"
          >
            <RibbonMenuRichRow
              fileType="slides"
              hoverScene
              title={t("presentation.exportMenu.odpTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.odpDetail")
              }
              badge="ODP"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="PDF"
            onSelect={() => void runServerExport("pdf")}
            data-testid="presentation-export-pdf-slides"
          >
            <RibbonMenuRichRow
              fileType="pdf"
              hoverScene
              title={t("presentation.exportMenu.pdfTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.pdfDetail")
              }
              badge="PDF"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            onSelect={() =>
              void runServerExport("pdf", handoutExportLayout || undefined)
            }
            title={t("presentation.exportPdfHandoutLabel")}
            aria-label={t("presentation.exportPdfHandoutLabel")}
            data-testid="presentation-export-pdf-handout"
          >
            <RibbonMenuRichRow
              fileType="pdf"
              hoverScene
              title={t("presentation.exportMenu.handoutTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.handoutDetail")
              }
              badge="PDF"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            onSelect={() => void runServerExport("pdf", "notes")}
            title={t("presentation.exportPdfNotesLabel")}
            aria-label={t("presentation.exportPdfNotesLabel")}
            data-testid="presentation-export-pdf-notes"
          >
            <RibbonMenuRichRow
              fileType="pdf"
              hoverScene
              title={t("presentation.exportMenu.notesTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.notesDetail")
              }
              badge="PDF"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            onSelect={() => void runServerExport("pdf", "outline")}
            title={t("presentation.exportPdfOutlineLabel")}
            aria-label={t("presentation.exportPdfOutlineLabel")}
            data-testid="presentation-export-pdf-outline"
          >
            <RibbonMenuRichRow
              fileType="pdf"
              hoverScene
              title={t("presentation.exportMenu.outlineTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.outlineDetail")
              }
              badge="PDF"
            />
          </DropdownMenuItem>
          {/* PowerPoint's Save as PDF goes through Publish ▸ Options; the four
              rows above publish with its defaults (hidden slides left out),
              this one opens those Options first (Include hidden slides,
              Publish what) and exports when confirmed. */}
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            onSelect={() => openPdfOptions()}
            aria-label={t("presentation.pdfOptions.menuTitle")}
            data-testid="presentation-export-pdf-options"
          >
            <RibbonMenuRichRow
              fileType="pdf"
              hoverScene
              title={t("presentation.pdfOptions.menuTitle")}
              detail={t("presentation.pdfOptions.menuDetail")}
              badge="PDF"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={serverExporting}
            aria-label="HTML"
            onSelect={() => void exportDeckAsHtml()}
            data-testid="presentation-export-html"
          >
            <RibbonMenuRichRow
              fileType="html"
              hoverScene
              title={t("presentation.exportMenu.htmlTitle")}
              detail={
                serverExporting
                  ? t("presentation.exportMenu.exporting")
                  : t("presentation.exportMenu.htmlDetail")
              }
              badge="HTML"
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={slides.length === 0}
            aria-label={t("presentation.exportMenu.videoTitle")}
            onSelect={() => openVideoExport("mp4")}
            data-testid="presentation-export-video"
          >
            <RibbonMenuRichRow
              fileType="slides"
              hoverScene
              title={t("presentation.exportMenu.videoTitle")}
              detail={t("presentation.exportMenu.videoDetail")}
              blocked={slides.length === 0}
              badge="MP4"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={slides.length === 0}
            aria-label={t("presentation.exportMenu.gifTitle")}
            onSelect={() => openVideoExport("gif")}
            data-testid="presentation-export-gif"
          >
            <RibbonMenuRichRow
              fileType="image"
              hoverScene
              title={t("presentation.exportMenu.gifTitle")}
              detail={t("presentation.exportMenu.gifDetail")}
              blocked={slides.length === 0}
              badge="GIF"
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={slides.length === 0}
            title={t("presentation.exportImageLabel")}
            aria-label={t("presentation.exportImageLabel")}
            onSelect={() => void exportSlideAsImage()}
            data-testid="presentation-export-image"
          >
            <RibbonMenuRichRow
              fileType="image"
              hoverScene
              title={t("presentation.exportMenu.imageTitle")}
              detail={
                slides.length === 0
                  ? t("presentation.exportMenu.noSlides")
                  : t("presentation.exportMenu.imageDetail")
              }
              blocked={slides.length === 0}
              badge="PNG"
            />
          </DropdownMenuItem>
          {/* PowerPoint's Export > Change File Type: the slide as a JPEG, a
              TIFF or a Device Independent Bitmap, from the same picture. */}
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={slides.length === 0}
            aria-label={t("presentation.exportMenu.imageJpegTitle")}
            onSelect={() => void exportSlideAsImage("jpeg")}
            data-testid="presentation-export-image-jpeg"
          >
            <RibbonMenuRichRow
              fileType="image"
              hoverScene
              title={t("presentation.exportMenu.imageJpegTitle")}
              detail={
                slides.length === 0
                  ? t("presentation.exportMenu.noSlides")
                  : t("presentation.exportMenu.imageJpegDetail")
              }
              blocked={slides.length === 0}
              badge="JPEG"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={slides.length === 0}
            aria-label={t("presentation.exportMenu.imageTiffTitle")}
            onSelect={() => void exportSlideAsImage("tiff")}
            data-testid="presentation-export-image-tiff"
          >
            <RibbonMenuRichRow
              fileType="image"
              hoverScene
              title={t("presentation.exportMenu.imageTiffTitle")}
              detail={
                slides.length === 0
                  ? t("presentation.exportMenu.noSlides")
                  : t("presentation.exportMenu.imageTiffDetail")
              }
              blocked={slides.length === 0}
              badge="TIFF"
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="docs-cupertino-menu__rich-item"
            disabled={slides.length === 0}
            aria-label={t("presentation.exportMenu.imageBmpTitle")}
            onSelect={() => void exportSlideAsImage("bmp")}
            data-testid="presentation-export-image-bmp"
          >
            <RibbonMenuRichRow
              fileType="image"
              hoverScene
              title={t("presentation.exportMenu.imageBmpTitle")}
              detail={
                slides.length === 0
                  ? t("presentation.exportMenu.noSlides")
                  : t("presentation.exportMenu.imageBmpDetail")
              }
              blocked={slides.length === 0}
              badge="BMP"
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );
}
