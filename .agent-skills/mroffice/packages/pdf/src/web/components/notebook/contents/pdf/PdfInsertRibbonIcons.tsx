/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  ChevronsRight,
  CircleDot,
  ExternalLink,
  FileDown,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FormInput,
  Hash,
  ListChecks,
  ListFilter,
  ListTree,
  MousePointerClick,
  Printer,
  Presentation,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Signature,
  X,
  type HouseIcon,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { SVGProps } from "react";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";

import { PdfHomeRibbonIcon } from "./PdfHomeRibbonIcons";
import { DocsInsertIcon } from "@mrnote/core/web/components/console/editor/DocumentInsertRibbonIcons.tsx";

export const PDF_INSERT_RIBBON_ICON_NAMES = [
  "organize",
  "blankPage",
  "movePageUp",
  "movePageDown",
  "rotatePage",
  "deletePage",
  "duplicatePage",
  "importPages",
  "importFile",
  "importPdf",
  "importWord",
  "importExcel",
  "importPpt",
  "importImage",
  "importText",
  "extractPage",
  "replacePage",
  "cropPage",
  "splitPage",
  "pageSize",
  "mergeDocument",
  "splitDocument",
  "rotateLeft",
  "rotateRight",
  "rotateDocument",
  "watermark",
  "pageNumber",
  "headerFooter",
  "background",
  "bookmark",
  "textBox",
  "equation",
  "wordArt",
  "image",
  "signature",
  "draw",
  "comment",
  "moreComments",
  "stamp",
  "shape",
  "visualMask",
  "link",
  "formFields",
  "formActions",
  "formText",
  "formCheckbox",
  "formRadio",
  "formSignature",
  "formDropdown",
  "formListBox",
  "formReset",
  "formPrint",
  "formNavigation",
  "formView",
  "formSave",
  "formGoToPage",
  "formWebLink",
  "formDetect",
  "formCancel",
] as const;

export type PdfInsertRibbonIconName =
  (typeof PDF_INSERT_RIBBON_ICON_NAMES)[number];

const SHARED_SEMANTIC_ICONS = {
  blankPage: "page.blank.insert",
  comment: "comment.add",
  image: "image.insert",
  link: "link.insert",
  moreComments: "overflow.more",
  shape: "shape.insert",
  textBox: "textBox.insert",
  equation: "math.sigma",
  visualMask: "draw.eraser.stroke",
} as const satisfies Partial<
  Record<PdfInsertRibbonIconName, OfficeSemanticIconId>
>;

const PDF_HOME_ICON_NAMES = {
  mergeDocument: "mergePages",
  rotateDocument: "rotateDocument",
  splitDocument: "splitPages",
} as const;

const LUCIDE_ICON_NAMES = {
  importExcel: FileSpreadsheet,
  importFile: FileDown,
  importImage: FileImage,
  importPdf: FileText,
  importPpt: Presentation,
  importText: FileText,
  importWord: FileType2,
  formActions: MousePointerClick,
  formCheckbox: ListChecks,
  formCancel: X,
  formDetect: ScanSearch,
  formDropdown: ListFilter,
  formFields: FormInput,
  formGoToPage: Hash,
  formListBox: ListTree,
  formNavigation: ChevronsRight,
  formPrint: Printer,
  formRadio: CircleDot,
  formReset: RotateCcw,
  formSave: Save,
  formSignature: Signature,
  formText: FormInput,
  formView: Search,
  formWebLink: ExternalLink,
} as const satisfies Partial<Record<PdfInsertRibbonIconName, HouseIcon>>;

interface PdfInsertRibbonIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: PdfInsertRibbonIconName;
  size?: number;
}

function customGlyph(name: Exclude<
  PdfInsertRibbonIconName,
  | keyof typeof SHARED_SEMANTIC_ICONS
  | keyof typeof PDF_HOME_ICON_NAMES
  | keyof typeof LUCIDE_ICON_NAMES
  | "rotatePage"
  | "wordArt"
>) {
  switch (name) {
    case "organize":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.1 3.3h7.3v7.3H3.1zM13.6 3.3h7.3v7.3h-7.3zM3.1 13.8h7.3v7.1H3.1zM13.6 13.8h7.3v7.1h-7.3z" />
          <path className="docs-home-icon__ink-soft" d="M5.3 5.8h2.9M15.8 5.8h2.9M5.3 16.3h2.9M15.8 16.3h2.9" />
          <path className="docs-home-icon__accent" d="M9.1 12h5.8M12.8 9.9l2.2 2.1-2.2 2.1" />
        </>
      );
    case "movePageUp":
      return (
        <>
          <path className="docs-home-icon__paper" d="M7.2 5.1h11.2v15.7H7.2z" />
          <path className="docs-home-icon__ink-soft" d="M9.7 9.2h6.2M9.7 12.1h5M9.7 15h3.8" />
          <path className="docs-home-icon__accent" d="M3.9 13.8V4.1M1.9 6.2l2-2.1 2 2.1" />
        </>
      );
    case "movePageDown":
      return (
        <>
          <path className="docs-home-icon__paper" d="M7.2 3.2h11.2v15.7H7.2z" />
          <path className="docs-home-icon__ink-soft" d="M9.7 7.3h6.2M9.7 10.2h5M9.7 13.1h3.8" />
          <path className="docs-home-icon__accent" d="M3.9 10.2v9.7M1.9 17.8l2 2.1 2-2.1" />
        </>
      );
    case "deletePage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4.2 3.1h10.6l3.4 3.4v14.4h-14z" />
          <path className="docs-home-icon__ink-soft" d="M14.8 3.1v3.4h3.4M7 9h7M7 11.8h4.8" />
          <path className="docs-home-icon__accent-soft-fill" d="M12.2 13.1h8.3v7.6h-8.3z" />
          <path className="docs-home-icon__accent" d="M13.2 14.7h6.3M14.3 14.7l.5 5M18.4 14.7l-.5 5M14.5 12.9h3.7" />
        </>
      );
    case "duplicatePage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M8 2.8h9.8l3.2 3.3v11.6h-3.3M4 6.2h10.2l3.5 3.5v11.5H4z" />
          <path className="docs-home-icon__ink-soft" d="M17.8 2.8v3.3H21M14.2 6.2v3.5h3.5M7.2 13.1h7.1M7.2 16h5.4" />
          <path className="docs-home-icon__accent" d="M9.4 7.8v4.4M7.2 10h4.4" />
        </>
      );
    case "importPages":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3h11l4 4v14H4z" />
          <path className="docs-home-icon__ink-soft" d="M15 3v4h4M7 11h6M7 14h5" />
          <path className="docs-home-icon__accent" d="M17.5 12v8M14.5 17l3 3 3-3" />
        </>
      );
    case "extractPage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3h12l4 4v14H4z" />
          <path className="docs-home-icon__ink-soft" d="M16 3v4h4M7 10.5h7M7 13.5h5" />
          <path className="docs-home-icon__accent" d="M12.5 18h9M18.5 15l3 3-3 3" />
        </>
      );
    case "replacePage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3 4h10v15H3zM11 2h10v15h-8" />
          <path className="docs-home-icon__accent" d="M8 8.5h8M13 5.5l3 3-3 3M16 13.5H8M11 10.5l-3 3 3 3" />
        </>
      );
    case "cropPage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M6 3h13v15H6z" />
          <path className="docs-home-icon__accent" d="M3 6v12a3 3 0 0 0 3 3h12M9 3v12a3 3 0 0 0 3 3h9" />
        </>
      );
    case "splitPage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3 3h7v18H3zM14 3h7v18h-7z" />
          <path className="docs-home-icon__accent" d="M12 4v3M12 10.5v3M12 17v3" />
        </>
      );
    case "pageSize":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 3h13v18H5z" />
          <path className="docs-home-icon__accent" d="M2.5 7h5M2.5 17h5M3.8 7v10M16 5h5M16 19h5M19.7 5v14" />
        </>
      );
    case "rotateLeft":
      return (
        <>
          <path className="docs-home-icon__paper" d="M8 5h11v15H8z" />
          <path className="docs-home-icon__accent" d="M9 4H4v5M4.5 4.5a8 8 0 0 1 3 14.5" />
        </>
      );
    case "rotateRight":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 5h11v15H5z" />
          <path className="docs-home-icon__accent" d="M15 4h5v5M19.5 4.5a8 8 0 0 0-3 14.5" />
        </>
      );
    case "watermark":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4.2 2.8h11l4 4v14.4h-15z" />
          <path className="docs-home-icon__ink-soft" d="M15.2 2.8v4h4M7.1 8.6h6.6M7.1 17.9h6.8" />
          <path className="docs-home-icon__accent-soft" d="m6.9 15.7 8.8-6.1" />
          <path className="docs-home-icon__accent" d="m8.4 15.2 1.1-4.8 2.7 3.8.1-4.8 3.1 3.5" />
        </>
      );
    case "pageNumber":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4.1 2.8h11l4 4v14.4h-15z" />
          <path className="docs-home-icon__ink-soft" d="M15.1 2.8v4h4M7.1 8.7h7.2M7.1 11.5h5.2" />
          <path className="docs-home-icon__accent-soft-fill" d="M8 14.2h7.2v4.5H8z" />
          <path className="docs-home-icon__accent" d="M9.1 17.7v-2.5h1.2v2.5M12.2 15.2h1.3l-1.3 2.5h1.5" />
        </>
      );
    case "headerFooter":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4.1 2.8h11l4 4v14.4h-15z" />
          <path className="docs-home-icon__ink-soft" d="M15.1 2.8v4h4M7.1 10.1h9M7.1 13.8h9" />
          <path className="docs-home-icon__accent-soft-fill" d="M6.2 5.5h7v2.7h-7zM6.2 16h10.7v2.7H6.2z" />
          <path className="docs-home-icon__accent" d="M7.3 6.8h4.8M7.3 17.3h8.5" />
        </>
      );
    case "background":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.8 2.8h11.4l4 4v14.4H3.8z" />
          <path className="docs-home-icon__ink-soft" d="M15.2 2.8v4h4M6.8 9h5.7M6.8 18.2h9.5" />
          <path className="docs-home-icon__accent-soft-fill" d="M7.1 13.1h9.8v4.1H7.1z" />
          <path className="docs-home-icon__accent" d="m8.1 13.1 2.8-3 3.8 3.5-2.8 3.1M15.7 13.9c.8.9 1.2 1.6 1.2 2.1a1.2 1.2 0 0 1-2.4 0c0-.5.4-1.2 1.2-2.1" />
        </>
      );
    case "bookmark":
      return (
        <>
          <path className="docs-home-icon__paper" d="M6.2 3.1h11.6v18l-5.8-3.8-5.8 3.8z" />
          <path className="docs-home-icon__ink-soft" d="M9 7.1h6M9 10h4.2" />
          <path className="docs-home-icon__accent-soft-fill" d="M14.1 12.1h7.1v7.1h-7.1z" />
          <path className="docs-home-icon__accent" d="M17.7 13.6v4.1M15.6 15.7h4.1" />
        </>
      );
    case "signature":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.4 3.1h17.2v17.8H3.4z" />
          <path className="docs-home-icon__ink-soft" d="M6.2 7.4h6.5M6.2 10.1h4.2M6.2 17.9h11.6" />
          <path className="docs-home-icon__accent" d="M6.1 16.2c1.8-4.7 3.2-5.8 4.1-4.9.7.7-.7 2.8.2 3.2.8.3 1.8-1.8 2.7-1.5.7.3.2 1.5 1 1.8.8.3 1.6-.5 2.5-1.5" />
          <circle className="docs-home-icon__accent-fill" cx="17.8" cy="13.4" r="1" />
        </>
      );
    case "draw":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.5 18.3 6 12.7 16.3 2.4l5.3 5.3L11.3 18z" />
          <path className="docs-home-icon__ink-soft" d="m14.7 4 5.3 5.3M6 12.7l5.3 5.3M4.2 20.7h15.6" />
          <path className="docs-home-icon__accent-soft-fill" d="m3.5 18.3 2.5-5.6 5.3 5.3z" />
          <path className="docs-home-icon__accent" d="m4.2 19.8 2.4-2.4" />
        </>
      );
    case "stamp":
      return (
        <>
          <path className="docs-home-icon__paper" d="M7.6 15.1c.4-2.8 1.5-4.2 2.5-5.5.7-.9.9-1.9.9-3.1a3 3 0 0 1 6 0c0 1.2.2 2.2.9 3.1 1 1.3 2.1 2.7 2.5 5.5z" />
          <path className="docs-home-icon__ink-soft" d="M9.4 12.2h9.2M5.8 15.1h16.4v3.1H5.8z" />
          <path className="docs-home-icon__accent-soft-fill" d="M4.2 18.2h19.6v3.3H4.2z" />
          <path className="docs-home-icon__accent" d="M6.4 19.8h15.2" />
        </>
      );
  }

  const exhaustiveName: never = name;
  return exhaustiveName;
}

/** PDF Insert glyphs share the Office 24px grid and PDF's two-tone stroke family. */
export function PdfInsertRibbonIcon({
  name,
  size = 24,
  className,
  ...props
}: PdfInsertRibbonIconProps) {
  if (name in SHARED_SEMANTIC_ICONS) {
    const semanticId =
      SHARED_SEMANTIC_ICONS[name as keyof typeof SHARED_SEMANTIC_ICONS];
    return (
      <OfficeSemanticIcon
        semanticId={semanticId}
        size={size}
        className={className}
      />
    );
  }
  if (name === "wordArt") {
    // The documents editor's own WordArt glyph (Insert › WordArt there).
    return <DocsInsertIcon name="wordArt" size={size} />;
  }
  if (name === "rotatePage") {
    return (
      <PdfHomeRibbonIcon
        {...props}
        className={className}
        data-pdf-insert-icon={name}
        name="rotateDocument"
        size={size}
      />
    );
  }
  if (name in PDF_HOME_ICON_NAMES) {
    return (
      <PdfHomeRibbonIcon
        {...props}
        className={className}
        data-pdf-insert-icon={name}
        name={PDF_HOME_ICON_NAMES[name as keyof typeof PDF_HOME_ICON_NAMES]}
        size={size}
      />
    );
  }
  if (name in LUCIDE_ICON_NAMES) {
    const LucideGlyph =
      LUCIDE_ICON_NAMES[name as keyof typeof LUCIDE_ICON_NAMES];
    return (
      <LucideGlyph
        {...props}
        aria-hidden={props["aria-hidden"] ?? true}
        className={className}
        data-pdf-insert-icon={name}
        focusable="false"
        height={size}
        strokeWidth={1.25}
        width={size}
      />
    );
  }
  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={`docs-home-icon${className ? ` ${className}` : ""}`}
      data-pdf-insert-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.25}
      viewBox="0 0 24 24"
      width={size}
    >
      {customGlyph(
        name as Exclude<
          PdfInsertRibbonIconName,
          keyof typeof SHARED_SEMANTIC_ICONS |
            keyof typeof PDF_HOME_ICON_NAMES |
            keyof typeof LUCIDE_ICON_NAMES |
            "rotatePage" |
            "wordArt"
        >,
      )}
    </svg>
  );
}
