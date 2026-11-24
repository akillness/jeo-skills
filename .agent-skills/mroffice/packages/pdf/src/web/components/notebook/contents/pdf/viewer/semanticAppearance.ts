/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  nativePdfFormWidgetExpectedIdentity,
  type NativePdfFormWidgetGeometryKind,
} from "../../../../../lib/pdf/form-field-authoring";
import type {
  PdfSemanticAppearanceCommandKind,
  PdfSemanticAppearanceCommandSurface,
  PdfSemanticAppearanceCommandTarget,
  PdfSemanticAppearanceSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-command-routing";
import type { AcroField } from "@mrnote/core/web/lib/pdf/acroform.ts";

export function semanticAppearanceKindForFormField(
  field: AcroField,
): PdfSemanticAppearanceCommandKind | null {
  if (
    field.type === "text" ||
    field.type === "checkbox" ||
    field.type === "radio"
  ) {
    return field.type;
  }
  if (field.type === "choice") {
    return field.combo ? "dropdown" : "listbox";
  }
  return null;
}

export function nativeFormWidgetGeometryKind(
  field: AcroField,
): NativePdfFormWidgetGeometryKind {
  if (field.type === "choice") {
    return field.combo ? "dropdown" : "listbox";
  }
  if (
    field.type === "resetButton" ||
    field.type === "printButton" ||
    field.type === "navigationButton" ||
    field.type === "viewButton" ||
    field.type === "saveButton" ||
    field.type === "goToPageButton" ||
    field.type === "webLinkButton" ||
    field.type === "imageField"
  ) {
    return "pushbutton";
  }
  return field.type;
}

export function semanticAppearanceTargetFromObjectRef(input: {
  sourceSha256: string;
  pageNumber: number;
  objectRef: string;
  semanticKind: PdfSemanticAppearanceCommandKind;
  surface: PdfSemanticAppearanceCommandSurface;
}): PdfSemanticAppearanceCommandTarget | null {
  const identity = nativePdfFormWidgetExpectedIdentity(
    input.objectRef,
    input.pageNumber,
  );
  return identity
    ? Object.freeze({
        sourceSha256: input.sourceSha256,
        pageNumber: input.pageNumber,
        objectNumber: identity.objectNumber,
        generation: identity.generation,
        semanticKind: input.semanticKind,
        surface: input.surface,
      })
    : null;
}

export function semanticAppearanceRouteKey(
  route: Pick<
    PdfSemanticAppearanceSelectionRoute,
    "pageNumber" | "objectNumber" | "generation" | "semanticKind" | "surface"
  >,
): string {
  return `${route.pageNumber}:${route.objectNumber}:${route.generation}:${route.semanticKind}:${route.surface}`;
}

export function semanticAppearanceTargetsKey(
  targets: readonly PdfSemanticAppearanceCommandTarget[],
): string {
  return targets.map(semanticAppearanceRouteKey).sort().join("|");
}
