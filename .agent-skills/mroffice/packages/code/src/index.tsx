/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The code editor: CodeWindow, MR Note's code editor, over a local file.
// It runs in the window's own browser-only mode: nothing is sent anywhere,
// and Save hands the buffer back to the host.
import { useCallback, useEffect, useRef } from "react";
import type { EditorDefinition, EditorProps } from "@mrnote/core";

import CodeWindow from "./web/components/notebook/contents/CodeWindow";
import { getOpenCodeBuffers } from "./web/lib/code-runner/code-window-registry";
import { languageForExtension } from "@mrnote/core/web/lib/code-runner/languages.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

export function languageForFile(name: string): string {
  return languageForExtension(extensionOf(name)) ?? (/\.(md|markdown)$/i.test(name) ? "markdown" : "plaintext");
}

export function CodeEditor({ file, registerSave, onSaveRequest }: EditorProps) {
  // The window names its file after its page: the file's own name, without
  // its extension (the language gives that back). Two windows on files of the
  // same name are told apart by their window id.
  const pageId = file.name.replace(/\.[^.]+$/, "") || "untitled";
  const windowId = `window-${file.id}`;
  const initial = useRef(decoder.decode(file.bytes));
  const current = useCallback(() => {
    const entry = getOpenCodeBuffers().find((candidate) => candidate.windowId === windowId);
    return entry ? entry.getText() : initial.current;
  }, [windowId]);
  useEffect(
    () => registerSave(() => ({ name: file.name, type: "text/plain;charset=utf-8", bytes: encoder.encode(current()) })),
    [current, file.name, registerSave],
  );
  return (
    <CodeWindow
      pageId={pageId}
      windowId={windowId}
      guestMode
      initialCode={initial.current}
      initialLanguage={languageForFile(file.name)}
      onGuestSaveRequest={onSaveRequest}
    />
  );
}

export const CODE_EXTENSIONS = [
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".rb", ".lua", ".sql", ".sh", ".bash", ".c", ".h", ".cpp", ".cc", ".hpp",
  ".cs", ".java", ".go", ".rs", ".php", ".r", ".kt", ".swift", ".tex", ".json", ".yaml", ".yml", ".toml", ".ini", ".xml",
  ".html", ".htm", ".css", ".md", ".markdown", ".txt", ".csv", ".log",
];

export const codeEditor: EditorDefinition = {
  id: "code",
  label: "Code",
  extensions: CODE_EXTENSIONS,
  newFile: () => ({ name: "untitled.py", bytes: encoder.encode('print("Hello from MR Note")\n') }),
  Component: CodeEditor,
};

export default codeEditor;
