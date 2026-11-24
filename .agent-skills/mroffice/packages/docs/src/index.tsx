/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The document editor: NoteEditor, MR Note's paged word processor, over a
// local file, in its browser-only mode. It keeps its own document format
// (.mrdoc, the editor's JSON), and opens HTML, Markdown and plain text.
import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import type { EditorDefinition, EditorProps } from "@mrnote/core";

import NoteEditor from "./web/components/console/editor/NoteEditor";
import { plainTextToDocumentNodes } from "./web/lib/document-import/plainTextDocument";
import { importHtmlDocument } from "./web/lib/document-import/htmlDocument";

export const MRDOC_FORMAT = "mrnote.document";

export interface MrDocFile {
  format: typeof MRDOC_FORMAT;
  version: 1;
  title: string;
  content: Record<string, unknown>;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function stem(name: string): string {
  return name.replace(/\.mrdoc(\.json)?$|\.[^.]+$/i, "") || "Untitled";
}

/** A local file as the editor's document JSON. */
export function documentFromFile(name: string, bytes: Uint8Array): { title: string; content: Record<string, unknown> } {
  const lower = name.toLowerCase();
  const text = decoder.decode(bytes);
  if (/\.mrdoc(\.json)?$/.test(lower)) {
    const parsed = JSON.parse(text) as Partial<MrDocFile>;
    if (parsed.format !== MRDOC_FORMAT || !parsed.content || typeof parsed.content !== "object") {
      throw new Error(`${name} is not an MR Note document.`);
    }
    return { title: parsed.title || stem(name), content: parsed.content };
  }
  if (/\.html?$/.test(lower)) {
    const imported = importHtmlDocument(text);
    return { title: imported.embeddedTitle || stem(name), content: imported.content as unknown as Record<string, unknown> };
  }
  if (lower.endsWith(".docx")) {
    throw new Error("Word files (.docx) open free in MR Office: online at https://mroffice.ai in any browser (Linux too), or in the desktop app; the open-source editor opens .mrdoc, HTML, Markdown and text.");
  }
  const nodes = plainTextToDocumentNodes(text);
  return { title: stem(name), content: { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] } };
}

export function mrdocBytes(title: string, content: Record<string, unknown>): Uint8Array {
  const file: MrDocFile = { format: MRDOC_FORMAT, version: 1, title, content };
  return encoder.encode(`${JSON.stringify(file)}\n`);
}

type NoteEditorProps = ComponentProps<typeof NoteEditor>;

/** The document editor over one file; `extension` is what Save writes. */
export function DocumentEditor({
  file,
  registerSave,
  onSaveRequest,
  onDirty,
  extension = ".mrdoc",
  editorProps,
}: EditorProps & { extension?: string; editorProps?: Partial<NoteEditorProps> }) {
  const opened = useRef<{ title: string; content: Record<string, unknown> } | null>(null);
  if (!opened.current) opened.current = documentFromFile(file.name, file.bytes);
  const latest = useRef<Record<string, unknown>>(opened.current.content);
  const title = useRef(opened.current.title);
  const acted = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  // The live document: Tiptap hangs its editor on the editing surface.
  const liveContent = useCallback((): Record<string, unknown> => {
    const surface = container.current?.querySelector(".ProseMirror.note-editor-content") as
      | (HTMLElement & { editor?: { getJSON(): Record<string, unknown> } })
      | null;
    try {
      const json = surface?.editor?.getJSON();
      if (json && typeof json === "object") return json;
    } catch {
      // fall back to the last document the editor reported
    }
    return latest.current;
  }, []);
  useEffect(() => {
    const mark = () => {
      acted.current = true;
    };
    window.addEventListener("keydown", mark, true);
    window.addEventListener("pointerdown", mark, true);
    return () => {
      window.removeEventListener("keydown", mark, true);
      window.removeEventListener("pointerdown", mark, true);
    };
  }, []);
  useEffect(
    () =>
      registerSave(() => ({
        name: `${stem(file.name)}${extension}`,
        type: "application/json",
        bytes: mrdocBytes(title.current, liveContent()),
      })),
    [extension, file.name, liveContent, registerSave],
  );
  const onChange = useCallback(
    (change: { final: Record<string, unknown> }) => {
      latest.current = change.final;
      onDirty?.();
    },
    [onDirty],
  );
  return (
    <div ref={container} className="note-window-scroll" style={{ height: "100%", overflow: "auto" }}>
      <NoteEditor
        pageId={`doc-${file.id}`}
        windowId={`window-${file.id}`}
        guestMode
        initialTitle={opened.current.title}
        initialContent={opened.current.content}
        onTitleChange={(next: string) => {
          title.current = next;
        }}
        onGuestSaveRequest={onSaveRequest}
        onGuestDocumentChange={onChange}
        guestUserHasActed={() => acted.current}
        showGuestSelectionToolbar
        enableGuestBandEditing
        {...editorProps}
      />
    </div>
  );
}

export const docsEditor: EditorDefinition = {
  id: "docs",
  label: "Document",
  extensions: [".mrdoc", ".mrdoc.json", ".html", ".htm", ".txt", ".md", ".markdown"],
  newFile: () => ({ name: "Untitled.mrdoc", bytes: mrdocBytes("Untitled", { type: "doc", content: [{ type: "paragraph" }] }) }),
  Component: (props) => <DocumentEditor {...props} />,
};

export default docsEditor;
