/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";
import type { PdfDocument } from "../pdfApi";

// Whether the DOCUMENT has form fields, read from its own field tree. The
// per-page list above only knows the pages rendered so far: a form on a
// later page was reported as "no form fields" and its export, import, fill

// null while the tree is being read.
export function useDocumentHasFormFields(pdfDoc: PdfDocument | null) {
  const [documentHasFormFields, setDocumentHasFormFields] = useState<boolean | null>(null);
  useEffect(() => {
    setDocumentHasFormFields(null);
    if (!pdfDoc) return;
    const readFieldObjects = (
      pdfDoc as unknown as { getFieldObjects?: () => Promise<Record<string, unknown> | null> }
    ).getFieldObjects;
    if (typeof readFieldObjects !== "function") {
      setDocumentHasFormFields(false);
      return;
    }
    let cancelled = false;
    void readFieldObjects.call(pdfDoc).then(
      (fields) => {
        if (!cancelled) setDocumentHasFormFields(fields !== null && Object.keys(fields).length > 0);
      },
      () => {
        if (!cancelled) setDocumentHasFormFields(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);
  return { documentHasFormFields, setDocumentHasFormFields };
}
