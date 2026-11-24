"use client";











/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  mountOfficeShapeTextField,
  type MountedOfficeShapeTextField,
  type OfficeShapeTextFieldContent,
  type OfficeShapeTextFieldProps,
} from "../../../office-ribbon/OfficeShapeTextField";

/** The size Word's superscript / subscript words are drawn at in a shape, as
 * a multiple of their own: the label draws them so, and so does its editor. */
export const DOCUMENT_SHAPE_SCRIPT_SCALE = 0.65;

export type DocumentShapeRichTextContent = OfficeShapeTextFieldContent;

export type DocumentShapeRichTextField = MountedOfficeShapeTextField;

export function mountDocumentShapeRichTextField(
  container: HTMLElement,
  options: Pick<OfficeShapeTextFieldProps, "ariaLabel" | "testId" | "maxLength" | "onInput" | "onSelectionUpdate">,
): DocumentShapeRichTextField {
  return mountOfficeShapeTextField(container, {
    ...options,
    scriptScale: DOCUMENT_SHAPE_SCRIPT_SCALE,
  });
}
