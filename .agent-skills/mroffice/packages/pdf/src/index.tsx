/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The PDF editor: PdfPageWindow, MR Note's PDF editor, over a local file, in
// the window's browser-only mode (its file and annotations live in this tab).
import { useEffect, useMemo, useRef } from "react";
import type { EditorDefinition, EditorProps } from "@mrnote/core";
// The PDF window's own stylesheets (in MR Note the notebook layout imports
// them): its pages, text layer, comments and ribbon chrome.
import "@mrnote/core/web/styles/native-page-window.css";
import "@mrnote/core/web/styles/pdf-viewer.css";

import PdfPageWindow from "./web/components/notebook/contents/PdfPageWindow";
import { GUEST_PDF_NOTEBOOK_ID, type PdfGuestSource } from "./web/components/notebook/contents/pdf/window/guestHost";

export function PdfEditor({ file, registerSave, onSaveRequest }: EditorProps) {
  const url = useMemo(() => URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: "application/pdf" })), [file.bytes]);
  // Freed once the window is really gone (React's development double mount
  // runs this cleanup and mounts again at once).
  const mounted = useRef(0);
  useEffect(() => {
    mounted.current += 1;
    return () => {
      mounted.current -= 1;
      setTimeout(() => {
        if (mounted.current === 0) URL.revokeObjectURL(url);
      }, 5000);
    };
  }, [url]);
  const guest = useMemo<PdfGuestSource>(
    () => ({
      url,
      filename: file.name,
      documentTitle: file.name.replace(/\.pdf$/i, ""),
      onSaveRequest,
    }),
    [file.name, onSaveRequest, url],
  );
  useEffect(() => registerSave(() => ({ name: file.name, type: "application/pdf", bytes: file.bytes })), [file, registerSave]);
  return <PdfPageWindow pageId={`pdf-${file.id}`} notebookId={GUEST_PDF_NOTEBOOK_ID} windowId={`window-${file.id}`} guest={guest} />;
}

export const pdfEditor: EditorDefinition = {
  id: "pdf",
  label: "PDF",
  extensions: [".pdf"],
  Component: PdfEditor,
};

export default pdfEditor;
