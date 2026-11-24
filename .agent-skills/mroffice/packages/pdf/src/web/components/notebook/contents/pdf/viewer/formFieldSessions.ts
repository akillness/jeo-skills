/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  PdfAuthoredFormFieldSelection,
} from "../PdfFormFieldAuthoringDialog";
import type { PdfFormFieldContextKind } from "../PdfFormFieldContextRibbon";
import type {
  EditExistingPdfTextFieldPlan,
  ExistingPdfTextFieldSource,
} from "@/lib/pdf/form-field-edit";
import type {
  EditExistingPdfCheckboxFieldPlan,
  ExistingPdfCheckboxFieldSource,
} from "@/lib/pdf/form-checkbox-field-edit";
import type {
  EditExistingPdfDropdownFieldPlan,
  ExistingPdfDropdownFieldSource,
} from "@/lib/pdf/form-dropdown-field-edit";
import type {
  EditExistingPdfListBoxFieldPlan,
  ExistingPdfListBoxFieldSource,
} from "@/lib/pdf/form-listbox-field-edit";
import type {
  EditExistingPdfSignatureFieldPlan,
  ExistingPdfSignatureFieldSource,
} from "@/lib/pdf/form-signature-field-edit";
import type {
  EditExistingPdfActionButtonFieldPlan,
  ExistingPdfActionButtonFieldSource,
} from "@/lib/pdf/form-action-button-field-edit";
import type {
  ExistingPdfFormFieldDeleteSource,
} from "@/lib/pdf/form-field-delete";
import type { PdfActionButtonFieldKind } from "../../../../../lib/pdf/remote/pdf-forms";
import {
  isNativePdfFormFieldKind,
  type NativePdfFormFieldGroupExpectedIdentity,
  type NativePdfFormFieldExpectedIdentity,
  type NativePdfFormWidgetAppearanceExpectedIdentity,
  type NativePdfFormWidgetGeometryExpectedIdentity,
  type NativePdfFormWidgetExpectedIdentity,
} from "../../../../../lib/pdf/form-field-authoring";
import type {
  PdfSemanticAppearanceSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-command-routing";
import type { AcroField, AcroFormValue } from "@mrnote/core/web/lib/pdf/acroform.ts";
import type { NativePdfFormFieldEdit } from "../../../../../lib/pdf/form-field-writeback";
import type { LoadedPdfSourceIdentity } from "./pdfApi";

/**
 * A normalized AcroForm field enriched with its page-relative overlay rect (in
 * percentages, like links / highlights), computed at render time from the page
 * viewport. The pure normalization / sanitization lives in `lib/pdf/acroform.ts`.
 */
export interface RenderedFormField extends AcroField {
  percent: { x: number; y: number; width: number; height: number };
}

export interface PendingNativeFormGesture {
  readonly id: string;
  /** The write generation it is written under; carried to a newer one while
   * the reader can still write (PDFViewer's authority effect). */
  generation: string;
  readonly fields: Map<string, NativePdfFormFieldEdit>;
  /** Each of its fields as shown before it first changed it (the file's
   * value, or an earlier edit's): its Undo writes that value back. */
  readonly previous?: Map<string, NativePdfFormFieldEdit>;
  closed: boolean;
}

export function acroFormValuesEqual(
  left: AcroFormValue | undefined,
  right: AcroFormValue | undefined,
): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export type ExistingFormFieldEditSession =
  | {
      readonly kind: "text";
      readonly source: ExistingPdfTextFieldSource;
      readonly initialSelection: PdfAuthoredFormFieldSelection;
    }
  | {
      readonly kind: "checkbox";
      readonly source: ExistingPdfCheckboxFieldSource;
      readonly initialSelection: PdfAuthoredFormFieldSelection;
    }
  | {
      readonly kind: "dropdown";
      readonly source: ExistingPdfDropdownFieldSource;
      readonly initialSelection: PdfAuthoredFormFieldSelection;
    }
  | {
      readonly kind: "listbox";
      readonly source: ExistingPdfListBoxFieldSource;
      readonly initialSelection: PdfAuthoredFormFieldSelection;
    }
  | {
      readonly kind: "signature";
      readonly source: ExistingPdfSignatureFieldSource;
      readonly initialSelection: PdfAuthoredFormFieldSelection;
    }
  | {
      readonly kind: PdfActionButtonFieldKind;
      readonly source: ExistingPdfActionButtonFieldSource;
      readonly initialSelection: PdfAuthoredFormFieldSelection;
    };

export interface SelectedFormFieldContext {
  readonly field: RenderedFormField;
  readonly page: number;
  readonly trigger: HTMLButtonElement;
  readonly session: ExistingFormFieldEditSession | null;
  readonly groupProperties: NativePdfFormFieldGroupExpectedIdentity | null;
  readonly radioOptions: PdfRadioGroupOptionsSession | null;
  readonly widgetGeometry: NativePdfFormWidgetGeometryExpectedIdentity | null;
  readonly widgetAppearance: NativePdfFormWidgetAppearanceExpectedIdentity | null;
  readonly kind: PdfFormFieldContextKind;
  readonly semanticRoute?: PdfSemanticAppearanceSelectionRoute;
  readonly disabledReason?: string;
  readonly geometryDisabledReason?: string;
  readonly appearanceDisabledReason?: string;
}

export interface PdfRadioGroupOptionsSession {
  readonly name: string;
  readonly widgets: readonly (NativePdfFormWidgetExpectedIdentity & {
    readonly originalValue: string;
  })[];
  readonly selectedIndex: number | null;
  readonly offToggleable: boolean;
}

export type ExistingFormFieldEditJob =
  | {
      readonly kind: "text";
      readonly plan: EditExistingPdfTextFieldPlan;
    }
  | {
      readonly kind: "checkbox";
      readonly plan: EditExistingPdfCheckboxFieldPlan;
    }
  | {
      readonly kind: "dropdown";
      readonly plan: EditExistingPdfDropdownFieldPlan;
    }
  | {
      readonly kind: "listbox";
      readonly plan: EditExistingPdfListBoxFieldPlan;
    }
  | {
      readonly kind: "signature";
      readonly plan: EditExistingPdfSignatureFieldPlan;
    }
  | {
      readonly kind: "actionButton";
      readonly plan: EditExistingPdfActionButtonFieldPlan;
    };

export interface ExistingFormFieldDeleteSession {
  readonly source: ExistingPdfFormFieldDeleteSource;
  readonly accessibleName: string;
}

export function nativeExpectedFormFieldIdentity(
  field: {
    readonly name: string;
    readonly type: RenderedFormField["type"];
    readonly combo?: boolean;
  },
  page: number,
): NativePdfFormFieldExpectedIdentity | null {
  const kind =
    field.type === "choice"
      ? field.combo
        ? "dropdown"
        : "listbox"
      : field.type;
  return isNativePdfFormFieldKind(kind)
    ? { name: field.name, kind, page }
    : null;
}

export type DetectedFieldSourceIdentity = LoadedPdfSourceIdentity &
  Readonly<{ documentRevision: string | number }>;

export function sameDetectedFieldSourceIdentity(
  left: DetectedFieldSourceIdentity | null,
  right: DetectedFieldSourceIdentity | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.document === right.document &&
    left.dataItemId === right.dataItemId &&
    left.url === right.url &&
    left.byteGenerationKey === right.byteGenerationKey &&
    left.documentRevision === right.documentRevision
  );
}








export function pdfTextFieldEditFits(
  element: HTMLInputElement | HTMLTextAreaElement,
  previous: string,
): boolean {
  if (pdfTextFieldContentFits(element)) return true;
  const next = element.value;
  if (next === previous) return false;
  const nextWidth = element.scrollWidth;
  const nextHeight = element.scrollHeight;
  const { selectionStart, selectionEnd, selectionDirection } = element;
  element.value = previous;
  const previousFit = pdfTextFieldContentFits(element);
  const previousWidth = element.scrollWidth;
  const previousHeight = element.scrollHeight;
  element.value = next;
  if (selectionStart !== null && selectionEnd !== null) {
    element.setSelectionRange(
      selectionStart,
      selectionEnd,
      selectionDirection ?? undefined,
    );
  }
  return (
    !previousFit &&
    Array.from(next).length < Array.from(previous).length &&
    nextWidth <= previousWidth &&
    nextHeight <= previousHeight
  );
}

/**
 * Whether a text field's input may take the edit now. Only a non-scrolling
 * field is held to its box. A comb field is never held to it: /MaxLen
 * already divides it into that many cells (ISO 32000 12.7.4.3) and its
 * characters are drawn one per cell by an overlay, while the transparent
 * input underneath is spaced to the cell pitch and so measures wider than
 * the box at a full value. Measuring it refused the last character of every
 * comb field marked do-not-scroll (IRS W-9 f1_11: "123" stuck at "12").
 */
export function pdfTextFieldTakesEdit(
  element: HTMLInputElement | HTMLTextAreaElement,
  previous: string,
  field: { scrollable: boolean; combActive: boolean },
): boolean {
  if (field.scrollable || field.combActive) return true;
  return pdfTextFieldEditFits(element, previous);
}

export function pdfTextFieldContentFits(
  element: HTMLInputElement | HTMLTextAreaElement,
): boolean {
  const fitsWidth =
    element.clientWidth <= 0 || element.scrollWidth <= element.clientWidth + 1;
  const fitsHeight =
    element.clientHeight <= 0 ||
    element.scrollHeight <= element.clientHeight + 1;
  return fitsWidth && fitsHeight;
}
